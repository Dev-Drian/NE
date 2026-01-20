import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../../companies/companies.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { DetectionResult } from '../dto/detection-result.dto';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

type AIProvider = 'openai' | 'gemini';

@Injectable()
export class Layer3OpenAIService {
  private openai: OpenAI | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private activeProvider: AIProvider;

  constructor(
    private companiesService: CompaniesService,
    private conversationsService: ConversationsService,
  ) {
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // Prioridad: OpenAI > Gemini
    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
      this.activeProvider = 'openai';
      console.log('🤖 AI Provider: ChatGPT (OpenAI)');
    } else if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      this.activeProvider = 'gemini';
      console.log('🤖 AI Provider: Gemini (Google)');
    } else {
      throw new Error('No hay API key configurada. Configura OPENAI_API_KEY o GEMINI_API_KEY en .env');
    }
  }

  async detect(
    message: string,
    companyId: string,
    userId: string,
  ): Promise<DetectionResult> {
    const company = await this.companiesService.findOne(companyId);
    if (!company) {
      return {
        intention: 'otro',
        confidence: 0,
        suggestedReply: 'Empresa no encontrada',
      };
    }

    const context = await this.conversationsService.getContext(userId, companyId);
    
    // Usar más historial de conversación para mejor contexto (últimos 15 mensajes)
    const conversationHistory = context.conversationHistory
      .slice(-15)
      .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`)
      .join('\n');

    // Información del estado actual y contexto previo mejorado
    let currentStateInfo = '';
    
    if (context.stage === 'collecting') {
      currentStateInfo = `\n**ESTADO ACTUAL DE LA CONVERSACIÓN:**
- Estamos en proceso de recopilar datos para una reserva
- Datos ya recopilados: ${JSON.stringify(context.collectedData)}
- Última intención: ${context.lastIntention || 'ninguna'}
- IMPORTANTE: Si el mensaje contiene datos (fecha, hora, comensales, teléfono, servicio), extrae SOLO los nuevos datos que aún no están en los datos recopilados.`;
    } else if (context.conversationHistory.length > 0) {
      // Si hay historial pero no estamos en collecting, incluir contexto general
      const lastMessages = context.conversationHistory.slice(-3);
      const recentContext = lastMessages
        .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`)
        .join('\n');
      
      currentStateInfo = `\n**CONTEXTO DE CONVERSACIÓN RECIENTE:**\n${recentContext}\n\nIMPORTANTE: Considera el contexto anterior para entender mejor la intención del usuario.`;
    }


    // Obtener la fecha actual de Colombia
    // Import dinámico para evitar problemas de dependencias circulares
    const { DateHelper } = await import('../../common/date-helper');
    const fechaColombia = DateHelper.getTodayString();
    const fechaColombiaLegible = DateHelper.formatDateReadable(fechaColombia);
    
    // Calcular mañana y pasado mañana
    const hoy = DateHelper.getNow();
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const pasadoManana = new Date(hoy);
    pasadoManana.setDate(pasadoManana.getDate() + 2);
    
    const fechaManana = DateHelper.formatDateToISO(manana);
    const fechaPasadoManana = DateHelper.formatDateToISO(pasadoManana);
    
    // Obtener nombres de días
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const diaHoy = diasSemana[hoy.getDay()];
    const diaManana = diasSemana[manana.getDay()];
    const diaPasadoManana = diasSemana[pasadoManana.getDay()];
    
    // Calcular las fechas de los próximos 7 días de la semana
    const proximosDias: { [key: string]: string } = {};
    const hoyDayIndex = hoy.getDay();
    
    for (let i = 0; i < 7; i++) {
      const targetDayIndex = i;
      let daysToAdd = targetDayIndex - hoyDayIndex;
      
      // Si el día ya pasó esta semana, agregamos 7 días para obtener el próximo
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      
      const targetDate = new Date(hoy);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      proximosDias[diasSemana[i]] = DateHelper.formatDateToISO(targetDate);
    }

    // Determinar si este tipo de empresa requiere número de personas
    const config = company.config as any;
    const isClinicType = company.type === 'clinic' || company.type === 'spa';
    const availableServices = config?.services || {};
    const hasMultipleServices = Object.keys(availableServices).length > 1;
    const products = config?.products || [];
    
    // Crear lista de servicios disponibles con sinónimos
    let servicesInfo = '';
    if (hasMultipleServices) {
      const servicesList = Object.entries(availableServices)
        .map(([key, value]: [string, any]) => {
          // Generar sinónimos comunes según el tipo de servicio
          const synonyms: string[] = [];
          const serviceName = (value.name || '').toLowerCase();
          
          // Sinónimos para servicios comunes
          if (key === 'domicilio' || serviceName.includes('domicilio') || serviceName.includes('delivery')) {
            synonyms.push('pedir a domicilio', 'domicilio', 'delivery', 'a domicilio', 'envío', 'pedido a domicilio');
          }
          if (key === 'mesa' || serviceName.includes('mesa') || serviceName.includes('restaurante')) {
            synonyms.push('mesa', 'restaurante', 'comer aquí', 'en el restaurante', 'reservar mesa');
          }
          if (key === 'limpieza' || serviceName.includes('limpieza')) {
            synonyms.push('limpieza', 'limpieza dental', 'profilaxis');
          }
          if (key === 'consulta' || serviceName.includes('consulta')) {
            synonyms.push('consulta', 'revisión', 'cita');
          }
          
          const synonymsText = synonyms.length > 0 ? ` (sinónimos: ${synonyms.join(', ')})` : '';
          return `"${key}": ${value.name}${synonymsText}`;
        })
        .join('\n');
      servicesInfo = `\n\n⚠️ SERVICIOS DISPONIBLES (elegir UNO es OBLIGATORIO - DEBES EXTRAER EL SERVICIO):\n${servicesList}\n\nIMPORTANTE: Si el usuario menciona alguna variante o sinónimo del servicio, SIEMPRE extrae la KEY correspondiente en el campo "service". Ejemplos:\n- Si el usuario dice "pedir a domicilio", "domicilio", "delivery", "a domicilio", "envío", "pedido a domicilio" → service: "domicilio"\n- Si el usuario dice "mesa", "reservar mesa", "en el restaurante", "comer aquí" → service: "mesa"\n\nSI EL USUARIO MENCIONA CUALQUIER VARIANTE DE UN SERVICIO, DEBES EXTRAERLO. NO PUEDES DEJAR service: null SI HAY UNA MENCIÓN DEL SERVICIO EN EL MENSAJE.`;
    }
    
    // Crear lista de productos disponibles (para que la IA pueda extraer lo que piden)
    let productsInfo = '';
    if (products.length > 0) {
      const productsList = products.map((p: any) => `"${p.id}": ${p.name} (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(p.price)})`).slice(0, 20).join(', ');
      productsInfo = `\n\nPRODUCTOS/TRATAMIENTOS DISPONIBLES:\n${productsList}\nSi el usuario menciona algún producto/tratamiento, extrae su ID y nombre.`;
    }

    const prompt = `Analiza este mensaje de un cliente y responde SOLO con un JSON válido (sin markdown, sin código, solo JSON):

FECHAS DE REFERENCIA (MUY IMPORTANTE - USA ESTAS EXACTAMENTE):
- HOY: ${fechaColombia} (${diaHoy})
- MAÑANA: ${fechaManana} (${diaManana})
- PASADO MAÑANA: ${fechaPasadoManana} (${diaPasadoManana})

PRÓXIMOS DÍAS DE LA SEMANA (si el usuario menciona solo el nombre del día):
- Próximo lunes: ${proximosDias['lunes']}
- Próximo martes: ${proximosDias['martes']}
- Próximo miércoles: ${proximosDias['miércoles']}
- Próximo jueves: ${proximosDias['jueves']}
- Próximo viernes: ${proximosDias['viernes']}
- Próximo sábado: ${proximosDias['sábado']}
- Próximo domingo: ${proximosDias['domingo']}

Contexto: Cliente de ${company.name} (tipo: ${company.type})
Mensaje: "${message}"${servicesInfo}${productsInfo}

${conversationHistory ? `Conversación previa:\n${conversationHistory}\n` : ''}
${currentStateInfo}

INSTRUCCIONES CRÍTICAS:

1. EXTRACCIÓN DE DATOS - EXTRAE TODO LO QUE ENCUENTRES EN EL MENSAJE:
   
   FECHAS (usar formato YYYY-MM-DD - USA LAS FECHAS DE REFERENCIA):
   - "hoy" → ${fechaColombia}
   - "mañana" → ${fechaManana}
   - "pasado mañana" → ${fechaPasadoManana}
   - Si dice solo "lunes", "martes", "viernes", etc → Usa el PRÓXIMO día de la lista de PRÓXIMOS DÍAS DE LA SEMANA
   - "el viernes" → ${proximosDias['viernes']}
   - "para el lunes" → ${proximosDias['lunes']}
   
   HORAS (usar formato HH:MM en 24 horas):
   - "4 PM", "4 de la tarde", "las 4" (tarde) → "16:00"
   - "8 PM", "8 de la noche" → "20:00"
   - "9 AM", "9 de la mañana" → "09:00"
   - "mediodía" → "12:00"
   
   TELÉFONO: Extrae cualquier secuencia de números que parezca teléfono (8-10 dígitos)
   - "mi numero es 45353535" → phone: "45353535"
   - "llamame al 3001234567" → phone: "3001234567"
   
   ${hasMultipleServices ? '⚠️ SERVICIO (MUY IMPORTANTE - OBLIGATORIO): Debes SIEMPRE extraer el servicio mencionado usando la KEY exacta de la lista de SERVICIOS DISPONIBLES arriba. Busca cualquier mención del servicio en el mensaje del usuario:\n   - Si el usuario dice "pedir a domicilio", "domicilio", "delivery", "a domicilio", "envío", "pedido a domicilio" → service: "domicilio"\n   - Si el usuario dice "mesa", "reservar mesa", "en el restaurante", "comer aquí", "mesa en restaurante" → service: "mesa"\n   - Si el usuario dice variantes de "limpieza" o "consulta" → busca la key correspondiente\n   - SIEMPRE busca coincidencias con las keys y sinónimos listados en SERVICIOS DISPONIBLES\n   - NO dejes service: null si hay cualquier mención de un servicio en el mensaje' : ''}
   PERSONAS/COMENSALES: ${isClinicType ? 'NO extraer - las clínicas y spas NO necesitan número de personas (siempre es 1)' : '"para 2", "somos 4", "2 personas" → guests: número'}

2. DETECTAR INTENCIÓN:
   - "reservar": El usuario QUIERE hacer una reserva (verbos: quiero, necesito, quisiera, agendar)
   - "consultar": Solo pregunta sin intención de reservar
   - "cancelar": Quiere cancelar
   - "otro": Otros casos

3. missingFields: ${isClinicType 
  ? `Para clínicas/spas, los campos REQUERIDOS son: fecha, hora, teléfono${hasMultipleServices ? ', servicio' : ''} (NO incluir comensales/guests)` 
  : `Para restaurantes/salones, los campos REQUERIDOS son: fecha, hora, teléfono, comensales${hasMultipleServices ? ', servicio' : ''}`}
   Lista SOLO los campos que NO están en el mensaje Y son necesarios.

Responde SOLO con este JSON:
{
  "intention": "reservar" | "cancelar" | "consultar" | "otro",
  "confidence": 0.0-1.0,
  "extractedData": {
    "date": "YYYY-MM-DD o null",
    "time": "HH:MM o null",
    ${isClinicType ? '' : '"guests": número o null,'}
    "phone": "string o null",
    "name": "string o null"${hasMultipleServices ? ',\n    "service": "key_del_servicio o null"' : ''}
  },
  "missingFields": ["campo1", "campo2"] o [],
  "suggestedReply": "texto breve para responder"
}`;

    try {
      let content: string | null = null;

      if (this.activeProvider === 'openai' && this.openai) {
        content = await this.callOpenAI(prompt);
      } else if (this.activeProvider === 'gemini' && this.gemini) {
        content = await this.callGemini(prompt);
      }

      if (!content) {
        throw new Error('Respuesta vacía del proveedor de IA');
      }

      // Limpiar respuesta (quitar markdown si existe)
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanContent);
      
      // DEBUG: Log de la respuesta de OpenAI para servicios
      if (hasMultipleServices) {
        console.log(`🔍 [DEBUG] Servicio extraído por OpenAI:`, parsed.extractedData?.service || 'NO EXTRAÍDO');
        console.log(`🔍 [DEBUG] MissingFields de OpenAI:`, parsed.missingFields || []);
      }
      
      // VALIDAR Y NORMALIZAR DATOS EXTRAÍDOS
      if (parsed.extractedData) {
        // VALIDACIÓN 1: Teléfono - debe tener 7-10 dígitos
        if (parsed.extractedData.phone) {
          const phone = parsed.extractedData.phone.toString().replace(/\D/g, '');
          if (phone.length < 7 || phone.length > 10) {
            console.warn(`⚠️ Teléfono inválido detectado: ${parsed.extractedData.phone}`);
            delete parsed.extractedData.phone;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('phone')) {
              parsed.missingFields.push('phone');
            }
          } else {
            parsed.extractedData.phone = phone;
          }
        }
        
        // VALIDACIÓN 2: Fecha - debe tener formato YYYY-MM-DD
        if (parsed.extractedData.date) {
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(parsed.extractedData.date)) {
            console.warn(`⚠️ Fecha inválida detectada: ${parsed.extractedData.date}`);
            delete parsed.extractedData.date;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('date')) {
              parsed.missingFields.push('date');
            }
          }
        }
        
        // VALIDACIÓN 3: Hora - debe tener formato HH:MM
        if (parsed.extractedData.time) {
          const timeRegex = /^\d{2}:\d{2}$/;
          if (!timeRegex.test(parsed.extractedData.time)) {
            console.warn(`⚠️ Hora inválida detectada: ${parsed.extractedData.time}`);
            delete parsed.extractedData.time;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('time')) {
              parsed.missingFields.push('time');
            }
          }
        }
        
        // VALIDACIÓN 4: Comensales - debe ser número positivo
        if (parsed.extractedData.guests !== null && parsed.extractedData.guests !== undefined) {
          const guests = parseInt(parsed.extractedData.guests);
          if (isNaN(guests) || guests < 1 || guests > 50) {
            console.warn(`⚠️ Número de comensales inválido: ${parsed.extractedData.guests}`);
            delete parsed.extractedData.guests;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('guests')) {
              parsed.missingFields.push('guests');
            }
          } else {
            parsed.extractedData.guests = guests;
          }
        }
        
        // VALIDACIÓN 5: Servicio - debe existir en la lista de servicios disponibles si hay múltiples
        if (hasMultipleServices && parsed.extractedData.service) {
          const serviceKey = parsed.extractedData.service.toLowerCase().trim();
          // Normalizar el servicio: buscar coincidencia exacta o por nombre
          let matchedServiceKey: string | null = null;
          
          for (const [key, value] of Object.entries(availableServices)) {
            const serviceName = (value as any)?.name?.toLowerCase() || '';
            if (key.toLowerCase() === serviceKey || serviceName.includes(serviceKey) || serviceKey.includes(key.toLowerCase())) {
              matchedServiceKey = key;
              break;
            }
          }
          
          if (matchedServiceKey) {
            parsed.extractedData.service = matchedServiceKey;
            console.log(`✅ Servicio extraído y normalizado: "${serviceKey}" → "${matchedServiceKey}"`);
          } else {
            console.warn(`⚠️ Servicio no reconocido: "${serviceKey}". Servicios disponibles: ${Object.keys(availableServices).join(', ')}`);
            delete parsed.extractedData.service;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('service')) {
              parsed.missingFields.push('service');
            }
          }
        } else if (hasMultipleServices && !parsed.extractedData.service) {
          // Si hay múltiples servicios pero no se extrajo ninguno, agregarlo a missingFields
          if (!parsed.missingFields) parsed.missingFields = [];
          if (!parsed.missingFields.includes('service')) {
            parsed.missingFields.push('service');
          }
        }
      }
      
      // Normalizar campos missingFields al español
      const missingFieldsMap: { [key: string]: string } = {
        date: 'fecha',
        time: 'hora',
        guests: 'comensales',
        phone: 'teléfono',
        name: 'nombre',
        service: 'servicio',
      };

      const missingFields = parsed.missingFields || [];
      const normalizedMissingFields = missingFields.map((field: string) => 
        missingFieldsMap[field] || field
      );

      return {
        intention: parsed.intention || 'otro',
        confidence: parsed.confidence || 0.5,
        extractedData: parsed.extractedData || {},
        missingFields: normalizedMissingFields,
        suggestedReply: parsed.suggestedReply || 'No entendí. ¿Puedes reformular?',
      };
    } catch (error) {
      console.error(`Error en ${this.activeProvider}:`, error);
      return {
        intention: 'otro',
        confidence: 0,
        suggestedReply: 'Hubo un error procesando tu mensaje. Por favor intenta de nuevo.',
      };
    }
  }

  private async callOpenAI(prompt: string): Promise<string | null> {
    if (!this.openai) return null;
    
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    return completion.choices[0]?.message?.content || null;
  }

  private async callGemini(prompt: string): Promise<string | null> {
    if (!this.gemini) return null;
    
    const model = this.gemini.getGenerativeModel({ model: 'gemini-3-pro-preview' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return response.text() || null;
  }
}

