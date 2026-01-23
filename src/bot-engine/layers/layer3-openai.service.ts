import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { CompaniesService } from '../../companies/companies.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { DateUtilsService } from '../utils/date-utils.service';
import { ContextCacheService } from '../utils/context-cache.service';
import { CircuitBreakerService } from '../utils/circuit-breaker.service';
import { Layer2SimilarityService } from './layer2-similarity.service';
import { DetectionResult } from '../dto/detection-result.dto';
import { PaymentsService } from '../../payments/payments.service';
import { ReservationsService } from '../../reservations/reservations.service';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

type AIProvider = 'openai' | 'gemini';

@Injectable()
export class Layer3OpenAIService {
  private readonly logger = new Logger(Layer3OpenAIService.name);
  private openai: OpenAI | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private activeProvider: AIProvider;

  constructor(
    private companiesService: CompaniesService,
    private conversationsService: ConversationsService,
    private dateUtils: DateUtilsService,
    private contextCache: ContextCacheService,
    private circuitBreaker: CircuitBreakerService,
    private layer2: Layer2SimilarityService,
    @Inject(forwardRef(() => PaymentsService))
    private paymentsService: PaymentsService,
    @Inject(forwardRef(() => ReservationsService))
    private reservationsService: ReservationsService,
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
    // Usar cache para evitar consultas redundantes
    const company = await this.contextCache.getOrLoadCompany(
      companyId,
      () => this.companiesService.findOne(companyId)
    );
    
    if (!company) {
      return {
        intention: 'otro',
        confidence: 0,
        suggestedReply: 'Empresa no encontrada',
      };
    }

    // Usar cache para contexto
    const contextKey = `${userId}:${companyId}`;
    const context = await this.contextCache.getOrLoadContext(
      contextKey,
      () => this.conversationsService.getContext(userId, companyId)
    );
    
    // Usar más historial de conversación para mejor contexto (últimos 15 mensajes)
    const conversationHistory = context.conversationHistory
      .slice(-15)
      .map((msg) => `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`)
      .join('\n');

    // Obtener información contextual: pagos pendientes y reservas recientes
    let contextualInfo = '';
    try {
      const conversationId = await this.conversationsService.findOrCreateConversation(userId, companyId);
      const pendingPayment = await this.paymentsService.getPendingPayment(conversationId);
      const recentReservations = await this.reservationsService.findByUserAndCompany(userId, companyId);
      const activeReservations = recentReservations
        .filter(r => r.status === 'pending' || r.status === 'confirmed')
        .slice(0, 3); // Solo las 3 más recientes

      if (pendingPayment) {
        const amount = new Intl.NumberFormat('es-CO', { 
          style: 'currency', 
          currency: 'COP', 
          minimumFractionDigits: 0 
        }).format(pendingPayment.amount);
        
        contextualInfo += `\n\n**⚠️ PAGO PENDIENTE:**
- Monto: ${amount}
- Link de pago: ${pendingPayment.paymentUrl || 'No disponible'}
- IMPORTANTE: Si el usuario dice "ok", "vale", "ya pagué", "apague", "apagar", "pagado", etc., está probablemente refiriéndose a este pago. Debes dar una respuesta coherente sobre el estado del pago o confirmar si ya pagó.`;
      }

      if (activeReservations.length > 0) {
        // Formatear fechas de manera legible
        const { DateHelper } = await import('../../common/date-helper');
        
        const reservationsText = activeReservations.map((r, idx) => {
          try {
            const dateReadable = DateHelper.formatDateReadable(r.date);
            const serviceName = r.service || 'Servicio';
            const statusText = r.status === 'pending' ? 'Pendiente de pago' : 
                              r.status === 'confirmed' ? 'Confirmada' : r.status;
            return `${idx + 1}. ${serviceName} - ${dateReadable} a las ${r.time} (Estado: ${statusText})`;
          } catch {
            // Fallback si hay error formateando la fecha
            const serviceName = r.service || 'Servicio';
            const statusText = r.status === 'pending' ? 'Pendiente de pago' : 
                              r.status === 'confirmed' ? 'Confirmada' : r.status;
            return `${idx + 1}. ${serviceName} - ${r.date} a las ${r.time} (Estado: ${statusText})`;
          }
        });
        
        contextualInfo += `\n\n**📅 RESERVAS ACTIVAS DEL CLIENTE:**
${reservationsText.join('\n')}
- IMPORTANTE: Si el usuario pregunta sobre su reserva, cita, agendamiento, o dice "mi reserva", "mi cita", está refiriéndose a una de estas reservas. 
- Si el usuario intenta hacer una nueva reserva para la misma fecha/hora, debes informarle que ya tiene una reserva existente y preguntarle si quiere modificar o cancelar la existente.
- Si el usuario pregunta sobre el estado de su reserva, proporciona los detalles específicos de la reserva más reciente.`;
      }
    } catch (error) {
      this.logger.warn('Error obteniendo información contextual:', error);
    }

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


    // Obtener fechas de referencia usando DateUtilsService (con cache)
    const dateRefs = await this.dateUtils.getDateReferences();
    const { fechaColombiaLegible } = await import('../../common/date-helper').then(m => ({
      fechaColombiaLegible: m.DateHelper.formatDateReadable(dateRefs.hoy)
    }));

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
            synonyms.push('pedir a domicilio', 'domicilio', 'delivery', 'a domicilio', 'envío', 'pedido a domicilio', 'quiero un domicilio', 'necesito un domicilio', 'un domicilio', 'pedir domicilio', 'domicilio para', 'que me lo traigan', 'que me lo lleven');
          }
          if (key === 'mesa' || serviceName.includes('mesa') || serviceName.includes('restaurante')) {
            synonyms.push('mesa', 'restaurante', 'comer aquí', 'en el restaurante', 'reservar mesa', 'para llevar', 'pedir para llevar', 'llevar', 'take away', 'recoger', 'pasar a recoger');
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
      servicesInfo = `\n\n⚠️ SERVICIOS DISPONIBLES (elegir UNO es OBLIGATORIO - DEBES EXTRAER EL SERVICIO):\n${servicesList}\n\nIMPORTANTE: Si el usuario menciona alguna variante o sinónimo del servicio, SIEMPRE extrae la KEY correspondiente en el campo "service". Ejemplos:\n- Si el usuario dice "pedir a domicilio", "domicilio", "delivery", "a domicilio", "envío", "pedido a domicilio", "quiero un domicilio", "necesito un domicilio", "un domicilio", "que me lo traigan", "que me lo lleven" → service: "domicilio"\n- Si el usuario dice "mesa", "restaurante", "comer aquí", "en el restaurante", "reservar mesa", "para llevar", "pedir para llevar", "llevar", "take away", "recoger", "pasar a recoger" → service: "mesa"\n\nATENCIÓN ESPECIAL - DETECCIÓN DE SERVICIO:\n- "domicilio", "delivery", "a domicilio", "envío", "que me lo traigan", "que me lo lleven", "llevar a casa" → service: "domicilio"\n- "para llevar" o "pedir para llevar" significa recoger en el local → service: "mesa" (NO es domicilio)\n- "mesa", "restaurante", "comer aquí", "en el local", "reservar mesa", "recoger" → service: "mesa"\n- Si el usuario dice "NO quiero que me lo traigan" o "NO quiero domicilio" → service: "mesa" (cambiar explícitamente)\n- Si el usuario dice "cita", "consulta", "revisión", "tratamiento" → service: "cita" (solo para clínicas/spas)\n\nREGLA CRÍTICA: SI EL USUARIO MENCIONA CUALQUIER VARIANTE DE UN SERVICIO, DEBES EXTRAERLO. NO DEJES service: null SI HAY UNA MENCIÓN EXPLÍCITA DEL SERVICIO.`;
    }
    
    // Crear lista de productos disponibles (para que la IA pueda extraer lo que piden)
    let productsInfo = '';
    if (products.length > 0) {
      const productsList = products.map((p: any) => `"${p.id}": ${p.name} (${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(p.price)})`).slice(0, 20).join(', ');
      productsInfo = `\n\nPRODUCTOS/TRATAMIENTOS DISPONIBLES:\n${productsList}\nSi el usuario menciona algún producto/tratamiento, extrae su ID y nombre.`;
    }

    const prompt = `Analiza este mensaje de un cliente y responde SOLO con un JSON válido (sin markdown, sin código, solo JSON):

FECHAS DE REFERENCIA (MUY IMPORTANTE - USA ESTAS EXACTAMENTE):
- HOY: ${dateRefs.hoy} (${dateRefs.diaHoy})
- MAÑANA: ${dateRefs.manana} (${dateRefs.diaManana})
- PASADO MAÑANA: ${dateRefs.pasadoManana} (${dateRefs.diaPasadoManana})

PRÓXIMOS DÍAS DE LA SEMANA (si el usuario menciona solo el nombre del día):
- Próximo lunes: ${dateRefs.proximosDias['lunes']}
- Próximo martes: ${dateRefs.proximosDias['martes']}
- Próximo miércoles: ${dateRefs.proximosDias['miércoles']}
- Próximo jueves: ${dateRefs.proximosDias['jueves']}
- Próximo viernes: ${dateRefs.proximosDias['viernes']}
- Próximo sábado: ${dateRefs.proximosDias['sábado']}
- Próximo domingo: ${dateRefs.proximosDias['domingo']}

Contexto: Cliente de ${company.name} (tipo: ${company.type})
Mensaje: "${message}"${servicesInfo}${productsInfo}

${conversationHistory ? `Conversación previa:\n${conversationHistory}\n` : ''}
${currentStateInfo}${contextualInfo}

INSTRUCCIONES CRÍTICAS:

1. EXTRACCIÓN DE DATOS - EXTRAE **SOLO** LO QUE EL USUARIO MENCIONA EXPLÍCITAMENTE:
   
   FECHAS (usar formato YYYY-MM-DD - USA LAS FECHAS DE REFERENCIA):
   - **IMPORTANTE**: Solo extraer si el usuario menciona una fecha explícitamente
   - Si NO menciona fecha → date: null
   - "hoy" → ${dateRefs.hoy}
   - "mañana" → ${dateRefs.manana}
   - "pasado mañana" → ${dateRefs.pasadoManana}
   - Si dice solo "lunes", "martes", "viernes", etc → Usa el PRÓXIMO día de la lista de PRÓXIMOS DÍAS DE LA SEMANA
   - "el viernes" → ${dateRefs.proximosDias['viernes']}
   - "para el lunes" → ${dateRefs.proximosDias['lunes']}
   - Si solo menciona hora SIN fecha → date: null (NO asumas hoy automáticamente)
   
   HORAS (usar formato HH:MM en 24 horas):
   - **IMPORTANTE**: Solo extraer si el usuario menciona una hora explícitamente
   - Si NO menciona hora → time: null
   - "4 PM", "4 de la tarde", "las 4" (tarde) → "16:00"
   - "8 PM", "8 de la noche" → "20:00"
   - "9 AM", "9 de la mañana" → "09:00"
   - "9 PM" → "21:00"
   - "mediodía" → "12:00"
   
   TELÉFONO: Extrae cualquier secuencia de números que parezca teléfono (8-10 dígitos)
   - "mi numero es 45353535" → phone: "45353535"
   - "llamame al 3001234567" → phone: "3001234567"
   
   ${hasMultipleServices ? '⚠️ SERVICIO (MUY IMPORTANTE - OBLIGATORIO): Debes SIEMPRE extraer el servicio mencionado usando la KEY exacta de la lista de SERVICIOS DISPONIBLES arriba. Busca cualquier mención del servicio en el mensaje del usuario:\n   - Si el usuario dice "pedir a domicilio", "domicilio", "delivery", "a domicilio", "envío", "pedido a domicilio", "quiero un domicilio", "necesito un domicilio", "un domicilio", "que me lo traigan", "que me lo lleven" → service: "domicilio"\n   - Si el usuario dice "mesa", "restaurante", "comer aquí", "en el restaurante", "reservar mesa", "para llevar", "pedir para llevar", "llevar", "take away", "recoger", "pasar a recoger" → service: "mesa"\n   - Si el usuario dice "NO quiero que me lo traigan", "NO quiero domicilio", "no quiero que me la traigan" → service: "mesa" (cambiar de domicilio a mesa)\n   - Si el usuario dice variantes de "limpieza" o "consulta" → busca la key correspondiente\n   - ATENCIÓN: "pedir para llevar" o "para llevar" significa recoger en el restaurante → service: "mesa" (NO "domicilio")\n   - SIEMPRE busca coincidencias con las keys y sinónimos listados en SERVICIOS DISPONIBLES\n   - NO dejes service: null si hay cualquier mención de un servicio en el mensaje' : ''}
   
   PRODUCTOS CON CANTIDADES (CRÍTICO - EXTRAER CANTIDADES):
   - **IMPORTANTE**: Extrae PRODUCTOS y sus CANTIDADES del mensaje
   - Formato: Array de objetos con {id: "prod-X", quantity: número}
   - Ejemplos:
     * "2 pizzas margherita" → [{id: "prod-1", quantity: 2}]
     * "quiero una pizza y 3 cocas" → [{id: "prod-1", quantity: 1}, {id: "prod-9", quantity: 3}]
     * "4 lasagnas y 2 vinos tintos" → [{id: "prod-8", quantity: 4}, {id: "prod-11", quantity: 2}]
   - Si NO menciona cantidad, usar quantity: 1
   - Busca en la lista de PRODUCTOS DISPONIBLES los IDs correctos
   
   PERSONAS/COMENSALES: ${isClinicType ? 'NO extraer - las clínicas y spas NO necesitan número de personas (siempre es 1)' : '"para 2", "somos 4", "2 personas" → guests: número'}

2. DETECTAR INTENCIÓN (ANALIZA EL CONTEXTO COMPLETO):
   - "reservar": El usuario QUIERE hacer una reserva (verbos: quiero, necesito, quisiera, agendar)
   - "consultar": Solo pregunta sin intención de reservar, O está respondiendo sobre pagos/reservas existentes
   - "cancelar": Quiere cancelar
   - "otro": Otros casos
   
   IMPORTANTE: Si hay un PAGO PENDIENTE y el usuario dice "ok", "vale", "ya pagué", "apague", etc., 
   la intención debe ser "consultar" y debes dar una respuesta coherente sobre el pago.
   
   Si hay RESERVAS ACTIVAS y el usuario pregunta sobre ellas o menciona "mi reserva", "mi cita", etc.,
   la intención debe ser "consultar" y debes responder sobre la reserva.

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
  "suggestedReply": "texto contextualizado y ESPECÍFICO para responder basado en el contexto completo. DEBES SER ESPECÍFICO:\n- Si hay pago pendiente y el usuario dice 'ok', 'vale', 'ya pagué', 'apague', etc.: confirma el estado del pago, proporciona el link si está disponible, o pregunta si necesita ayuda.\n- Si hay reservas activas y el usuario pregunta sobre ellas: menciona los detalles ESPECÍFICOS (fecha, hora, servicio, estado) de la reserva más reciente.\n- Si el usuario intenta reservar una fecha/hora que ya tiene reservada: informa específicamente que ya tiene una reserva para esa fecha/hora y pregunta si quiere modificar o cancelar.\n- NO uses respuestas genéricas como 'Ya tienes una reserva confirmada' sin dar detalles. SIEMPRE incluye información específica (fecha, hora, servicio, estado del pago si aplica)."
}`;

    try {
      // Verificar si el circuit breaker está abierto antes de intentar
      if (this.circuitBreaker.getState() === 'OPEN') {
        this.logger.warn('Circuit breaker is OPEN, using Layer2 as fallback');
        return await this.layer2.detect(message, companyId);
      }

      // Usar circuit breaker para proteger llamadas a OpenAI/Gemini
      let content: string | null = null;

      try {
        // Envolver llamada a AI con circuit breaker
        const aiCall = async (): Promise<string> => {
          if (this.activeProvider === 'openai' && this.openai) {
            return await this.callOpenAI(prompt);
          } else if (this.activeProvider === 'gemini' && this.gemini) {
            return await this.callGemini(prompt);
          }
          throw new Error('No AI provider available');
        };

        // Si hay fallback definido pero el circuit breaker está abierto, 
        // el execute lanzará error, así que lo manejamos
        content = await this.circuitBreaker.execute(aiCall);
      } catch (error) {
        // Si el circuit breaker bloqueó la operación o falló, usar Layer2
        this.logger.warn(`AI provider call failed, using Layer2 fallback: ${error.message}`);
        return await this.layer2.detect(message, companyId);
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
      this.logger.error(
        `Error en ${this.activeProvider} - companyId: ${companyId}, userId: ${userId}, message: ${message?.substring(0, 50)}`,
        error.stack || error.message,
      );
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

