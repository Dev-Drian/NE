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
    const conversationHistory = context.conversationHistory
      .slice(-10)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Información del estado actual (si estamos en modo collecting)
    const currentStateInfo = context.stage === 'collecting' 
      ? `\nEstado actual: Estamos en proceso de recopilar datos para una reserva.
Datos ya recopilados: ${JSON.stringify(context.collectedData)}
Última intención: ${context.lastIntention || 'ninguna'}
IMPORTANTE: Si el mensaje contiene datos (fecha, hora, comensales, teléfono), extrae SOLO los nuevos datos.`
      : '';


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
    
    // Crear lista de servicios disponibles
    let servicesInfo = '';
    if (hasMultipleServices) {
      const servicesList = Object.entries(availableServices)
        .map(([key, value]: [string, any]) => `"${key}": ${value.name}`)
        .join(', ');
      servicesInfo = `\n\nSERVICIOS DISPONIBLES (elegir UNO es OBLIGATORIO):\n${servicesList}\nExtrae el servicio mencionado o su key correspondiente.`;
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
Mensaje: "${message}"${servicesInfo}

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
   
   PERSONAS/COMENSALES: ${isClinicType ? 'NO extraer - las clínicas y spas NO necesitan número de personas (siempre es 1)' : '"para 2", "somos 4", "2 personas" → guests: número'}
   ${hasMultipleServices ? '\n   SERVICIO (OBLIGATORIO): Extrae el nombre del servicio mencionado y usa su key. Ej: "limpieza" → service: "limpieza"' : ''}

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
      
      // Normalizar campos missingFields al español
      const missingFieldsMap: { [key: string]: string } = {
        date: 'fecha',
        time: 'hora',
        guests: 'comensales',
        phone: 'teléfono',
        name: 'nombre',
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

