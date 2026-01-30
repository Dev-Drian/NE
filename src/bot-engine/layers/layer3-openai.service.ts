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
import { ContextBuilderService } from '../context/context-builder.service';
import { PromptBuilderService } from './prompt-builder.service';
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
    private contextBuilder: ContextBuilderService,
    private promptBuilder: PromptBuilderService,
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

    // IMPORTANTE: Invalidar cache ANTES de cargar para obtener datos frescos
    // El contexto puede haber sido actualizado por bot-engine.service.ts en el mensaje anterior
    const contextKey = `${userId}:${companyId}`;
    await this.contextCache.invalidateContext(contextKey);
    
    // Cargar contexto fresco desde Redis
    const fullContext = await this.contextCache.getOrLoadContext(
      contextKey,
      () => this.conversationsService.getContext(userId, companyId)
    );
    
    // Construir contexto comprimido e inteligente
    const aiContext = await this.contextBuilder.buildContextForAI(userId, companyId);
    const conversationHistory = this.contextBuilder.formatContextForPrompt(aiContext);

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

    // Información del estado actual (ya incluida en aiContext, pero agregar detalles)
    let currentStateInfo = '';
    
    if (fullContext.stage === 'collecting') {
      currentStateInfo = `\n**ESTADO ACTUAL DE LA CONVERSACIÓN:**
- Estamos en proceso de recopilar datos para una reserva
- Datos ya recopilados: ${JSON.stringify(fullContext.collectedData)}
- Última intención: ${fullContext.lastIntention || 'ninguna'}
- IMPORTANTE: Si el mensaje contiene datos (fecha, hora, comensales, teléfono, servicio), extrae SOLO los nuevos datos que aún no están en los datos recopilados.`;
    }


    // Obtener fechas de referencia usando DateUtilsService (con cache)
    const dateRefs = await this.dateUtils.getDateReferences();
    const { fechaColombiaLegible } = await import('../../common/date-helper').then(m => ({
      fechaColombiaLegible: m.DateHelper.formatDateReadable(dateRefs.hoy)
    }));

    // Re-hidratar services para validación/normalización post-LLM
    const config = company.config as any;
    const availableServices = config?.services || {};

    // Obtener servicio actual del contexto si estamos en proceso de reserva
    const currentServiceKey = fullContext.collectedData?.service;

    const { prompt, hasMultipleServices } = await this.promptBuilder.buildPrompt({
      company,
      message,
      dateRefs,
      conversationContextText: conversationHistory,
      currentStateInfo,
      contextualInfo,
      serviceKey: currentServiceKey, // Pasar servicio actual para construir prompt dinámico
    });

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
        
        // VALIDACIÓN 6: Productos - validar que los IDs existan y normalizar nombres
        if (parsed.extractedData.products) {
          const availableProducts = config?.products || [];
          const extractedProducts = Array.isArray(parsed.extractedData.products) ? parsed.extractedData.products : [];
          const validatedProducts: any[] = [];
          
          for (const item of extractedProducts) {
            if (typeof item === 'object' && item.id) {
              // Buscar producto por ID o por nombre
              const product = availableProducts.find((p: any) => 
                p.id === item.id || 
                p.name.toLowerCase().includes(item.id.toLowerCase()) ||
                item.id.toLowerCase().includes(p.name.toLowerCase())
              );
              
              if (product) {
                validatedProducts.push({
                  id: product.id,
                  quantity: item.quantity || 1
                });
              } else {
              }
            }
          }
          
          if (validatedProducts.length > 0) {
            parsed.extractedData.products = validatedProducts;
            console.log(`✅ Total productos validados: ${validatedProducts.length}`);
          } else {
            // No se validó ningún producto, marcar como faltante
            delete parsed.extractedData.products;
            if (!parsed.missingFields) parsed.missingFields = [];
            if (!parsed.missingFields.includes('products')) {
              parsed.missingFields.push('products');
            }
            console.warn(`⚠️ Ningún producto fue validado. Se marca como faltante.`);
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
        products: 'productos',
        address: 'dirección',
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

  // Timeout configurable para llamadas a AI (default: 10 segundos)
  private readonly AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || '10000', 10);

  private async callOpenAI(prompt: string): Promise<string | null> {
    if (!this.openai) return null;
    
    // Crear AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.logger.warn(`OpenAI call aborted after ${this.AI_TIMEOUT_MS}ms timeout`);
    }, this.AI_TIMEOUT_MS);

    try {
      const completion = await this.openai.chat.completions.create(
        {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        },
        { signal: controller.signal }
      );

      return completion.choices[0]?.message?.content || null;
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        throw new Error(`OpenAI request timed out after ${this.AI_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callGemini(prompt: string): Promise<string | null> {
    if (!this.gemini) return null;
    
    // Usar Promise.race para implementar timeout con Gemini
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Gemini request timed out after ${this.AI_TIMEOUT_MS}ms`));
      }, this.AI_TIMEOUT_MS);
    });

    try {
      const model = this.gemini.getGenerativeModel({ 
        model: 'gemini-3-pro-preview',
        generationConfig: {
          // Gemini también soporta timeout en config
        }
      });
      
      const resultPromise = model.generateContent(prompt);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      const response = await result.response;
      
      return response.text() || null;
    } catch (error) {
      if (error.message?.includes('timed out')) {
        this.logger.warn(`Gemini call timed out after ${this.AI_TIMEOUT_MS}ms`);
      }
      throw error;
    }
  }

  /**
   * Obtiene el cliente de OpenAI para uso directo
   * Útil para llamadas específicas que no pasan por detect()
   */
  getOpenAIClient(): OpenAI {
    if (!this.openai) {
      throw new Error('OpenAI client no está disponible. Verifica OPENAI_API_KEY en .env');
    }
    return this.openai;
  }
}

