import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../availability/availability.service';
import { MessagesTemplatesService } from '../messages-templates/messages-templates.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { KeywordsService } from '../keywords/keywords.service';
import { TextUtilsService } from './utils/text-utils.service';
import { ContextCacheService } from './utils/context-cache.service';
import { KeywordDetectorService } from './utils/keyword-detector.service';
import { ReservationFlowService } from './handlers/reservation/reservation-flow.service';
import { ProcessMessageDto } from './dto/process-message.dto';
import { DetectionResult } from './dto/detection-result.dto';
import { CONFIDENCE_THRESHOLDS } from './constants/detection.constants';
import { GreetingHandler } from './handlers/greeting.handler';
import { CancelHandler } from './handlers/cancel.handler';
import { QueryHandler } from './handlers/query.handler';
import { ReservationHandler } from './handlers/reservation.handler';
import { DateHelper } from '../common/date-helper';

export interface ProcessMessageResponse {
  reply: string;
  intention: string;
  confidence: number;
  missingFields?: string[];
  conversationState: string;
  conversationId?: string;
}

@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);

  constructor(
    private layer1: Layer1KeywordsService,
    private layer2: Layer2SimilarityService,
    private layer3: Layer3OpenAIService,
    private conversations: ConversationsService,
    private reservations: ReservationsService,
    private availability: AvailabilityService,
    private messagesTemplates: MessagesTemplatesService,
    private companies: CompaniesService,
    private usersService: UsersService,
    private paymentsService: PaymentsService,
    private keywordsService: KeywordsService,
    private textUtils: TextUtilsService,
    private contextCache: ContextCacheService,
    private keywordDetector: KeywordDetectorService,
    private reservationFlow: ReservationFlowService,
    private greetingHandler: GreetingHandler,
    private cancelHandler: CancelHandler,
    private queryHandler: QueryHandler,
    @Inject(forwardRef(() => ReservationHandler))
    private reservationHandler: ReservationHandler,
  ) {}

  async processMessage(dto: ProcessMessageDto): Promise<ProcessMessageResponse> {
    try {
      // 1. VALIDAR QUE LA EMPRESA EXISTE (CRÍTICO - HACER PRIMERO)
      // Usar cache para evitar consultas redundantes
      const company = await this.contextCache.getOrLoadCompany(
        dto.companyId,
        () => this.companies.findOne(dto.companyId)
      );

      if (!company) {
        return {
          reply: 'Lo siento, la empresa que buscas no existe o no está disponible en este momento. Por favor verifica el ID de la empresa.',
          intention: 'otro',
          confidence: 0,
          conversationState: 'idle',
        };
      }

      // 2. Si hay teléfono en los datos extraídos y no coincide con el usuario, actualizar
      // Esto permite actualizar el teléfono del usuario si se proporciona en el mensaje
      let userId = dto.userId;
      if (dto.phone) {
        // Verificar si el usuario tiene el teléfono correcto
        const user = await this.usersService.findOne(userId);
        if (user && user.phone !== dto.phone) {
          // Actualizar teléfono del usuario si cambió
          await this.usersService.update(userId, { phone: dto.phone });
        }
      }

      // 3. Invalidar cache ANTES de operaciones de escritura para evitar race conditions
      const contextKey = `${userId}:${dto.companyId}`;
      await this.contextCache.invalidateContext(contextKey);
      
      // 4. Cargar contexto desde Redis (con cache) - ahora garantizamos datos frescos
      const context = await this.contextCache.getOrLoadContext(
        contextKey,
        () => this.conversations.getContext(userId, dto.companyId)
      );

      // 5. Agregar mensaje del usuario al historial
      // Invalidar cache antes de escribir para evitar que otros procesos lean datos obsoletos
      await this.contextCache.invalidateContext(contextKey);
      await this.conversations.addMessage(userId, dto.companyId, 'user', dto.message);

      // 6. LÓGICA CONTEXTUAL: Si estamos en modo "collecting" con intención "reservar"
      // debemos forzar la continuidad de la reserva, PERO solo si el mensaje no es un saludo
      const isContinuingReservation = 
        context.stage === 'collecting' && context.lastIntention === 'reservar';
      
      // Usar KeywordDetectorService para detecciones (centralizado, sin duplicación)
      const lowerMessage = dto.message.toLowerCase();
      const isGreeting = this.keywordDetector.isGreeting(dto.message);
      const isFarewell = this.keywordDetector.isFarewell(dto.message);
      const asksForProducts = this.keywordDetector.asksForProducts(dto.message);
      const asksAboutDelivery = this.keywordDetector.asksAboutDelivery(dto.message);
      const asksParaLlevar = this.keywordDetector.asksParaLlevar(dto.message);
      const hasConsultaKeywords = this.keywordDetector.hasConsultaKeywords(dto.message) && !asksForProducts;
      const asksForPrice = this.keywordDetector.asksForPrice(dto.message);
      const asksForHistory = this.keywordDetector.asksForHistory(dto.message);
    
    // ============================================
    // CONSULTA DE HISTORIAL - COMPLETAMENTE DINÁMICO
    // ============================================
    if (asksForHistory) {
      try {
        // Consultar todas las reservas/pedidos del usuario en la BD
        const userReservations = await this.reservations.findByUserAndCompany(userId, dto.companyId);
        
        const config = company.config as any;
        const catalogProducts = config?.products || [];
        const configServices = config?.services || {};
        
        // Obtener todos los servicios disponibles de la empresa
        const availableServiceKeys = Object.keys(configServices);
        
        // Función para obtener el nombre del servicio
        const getServiceName = (serviceKey: string): string => {
          return configServices[serviceKey]?.name || serviceKey;
        };
        
        // Función para obtener emoji según tipo de servicio
        const getServiceEmoji = (serviceKey: string): string => {
          const key = serviceKey?.toLowerCase() || '';
          if (key.includes('domicilio') || key.includes('delivery')) return '🚚';
          if (key.includes('mesa') || key.includes('restaurante')) return '🍽️';
          if (key.includes('cita') || key.includes('consulta')) return '🏥';
          if (key.includes('spa') || key.includes('belleza')) return '💆';
          return '📋';
        };
        
        // Función para obtener el nombre del producto/tratamiento por ID
        const getProductName = (productId: string): string => {
          const product = catalogProducts.find((p: any) => p.id === productId);
          return product?.name || productId;
        };
        
        if (userReservations.length === 0) {
          // Construir mensaje de "sin historial" basado en servicios disponibles
          const serviceNames = availableServiceKeys.map(k => getServiceName(k).toLowerCase()).join(' o ');
          const reply = `📋 No tienes registros todavía.\n\n¿Te gustaría agendar ${serviceNames ? 'un(a) ' + serviceNames : 'algo'}? 😊`;
          await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
          return {
            reply,
            intention: 'consultar',
            confidence: 1.0,
            conversationState: 'idle',
          };
        }
        
        // Agrupar reservas por tipo de servicio
        const reservationsByService: Record<string, any[]> = {};
        for (const r of userReservations) {
          const serviceKey = r.service || 'otro';
          if (!reservationsByService[serviceKey]) {
            reservationsByService[serviceKey] = [];
          }
          reservationsByService[serviceKey].push(r);
        }
        
        // Función para formatear una reserva/cita genérica
        const formatReservation = (r: any, index: number, serviceKey: string): string => {
          const emoji = getServiceEmoji(serviceKey);
          const serviceName = getServiceName(serviceKey);
          let text = `**${index}.** ${emoji} ${serviceName}`;
          text += `\n   📅 ${DateHelper.formatDateReadable(r.date)} a las ${DateHelper.formatTimeReadable(r.time)}`;
          
          // Mostrar productos/tratamientos si existen
          if (r.metadata && typeof r.metadata === 'object') {
            const metadata = r.metadata as any;
            
            // Productos (para domicilios, citas con productos, etc.)
            if (metadata.products && Array.isArray(metadata.products) && metadata.products.length > 0) {
              const productNames = metadata.products.map((item: any) => {
                const name = getProductName(item.id);
                return item.quantity > 1 ? `${item.quantity}x ${name}` : name;
              }).join(', ');
              
              // Usar emoji diferente según tipo de servicio
              const productEmoji = serviceKey === 'domicilio' ? '🛒' : '💊';
              text += `\n   ${productEmoji} ${productNames}`;
            }
            
            // Tratamiento específico (si se guardó como string)
            if (metadata.treatment && typeof metadata.treatment === 'string') {
              text += `\n   💊 ${metadata.treatment}`;
            }
            
            // Dirección (para domicilios)
            if (metadata.address) {
              text += `\n   📍 ${metadata.address}`;
            }
          }
          
          // Comensales (solo para mesas)
          if (r.guests && r.guests > 1 && serviceKey === 'mesa') {
            text += `\n   👥 ${r.guests} personas`;
          }
          
          // Estado
          const statusEmoji = r.status === 'pending' ? '⏳' : r.status === 'confirmed' ? '✅' : '❌';
          const statusText = r.status === 'pending' ? 'Pendiente' : r.status === 'confirmed' ? 'Confirmada' : 'Cancelada';
          text += `\n   ${statusEmoji} ${statusText}`;
          
          return text;
        };
        
        let reply = `📋 **Tu historial:**\n\n`;
        let itemIndex = 1;
        let totalItems = 0;
        
        // Mostrar cada tipo de servicio
        for (const [serviceKey, reservations] of Object.entries(reservationsByService)) {
          const emoji = getServiceEmoji(serviceKey);
          const serviceName = getServiceName(serviceKey).toUpperCase();
          const count = reservations.length;
          totalItems += count;
          
          reply += `${emoji} **${serviceName}:** (${count})\n\n`;
          
          reservations.slice(0, 5).forEach((r: any) => {
            reply += formatReservation(r, itemIndex++, serviceKey) + '\n\n';
          });
          
          if (count > 5) {
            reply += `   _...y ${count - 5} más_\n\n`;
          }
        }
        
        // Resumen total
        const servicesSummary = Object.entries(reservationsByService)
          .map(([key, arr]) => `${arr.length} ${getServiceName(key).toLowerCase()}(s)`)
          .join(' | ');
        reply += `📊 **Total:** ${servicesSummary}\n`;
        reply += `\n¿Necesitas algo más? 😊`;
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      } catch (error) {
        this.logger.error('Error consultando historial:', error);
      }
    }

    // Si el usuario se despide o agradece (sin hacer otra pregunta), responder amablemente
    // CRÍTICO: Hacer esto ANTES de continuar con flujos de reserva
    if (isFarewell && !hasConsultaKeywords && !asksForProducts && !asksAboutDelivery && !asksForPrice) {
      const reply = '¡De nada! Fue un placer atenderte. Si necesitas algo más, no dudes en escribirme. 😊';
      await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
      // Resetear contexto para nueva conversación
      await this.conversations.saveContext(userId, dto.companyId, {
        stage: 'idle',
        collectedData: {},
        conversationHistory: [],
      });
      return {
        reply,
        intention: 'otro',
        confidence: 1.0,
        conversationState: 'idle',
      };
    }

    // Si pregunta sobre disponibilidad de domicilio, responder informativamente
    if (asksAboutDelivery) {
      const config = company.config as any;
      const services = config?.services || {};
      const domicilioService = services['domicilio'];
      
      if (domicilioService && domicilioService.enabled) {
        let reply = '¡Sí! Hacemos domicilios. 🚚\n\n';
        if (domicilioService.deliveryFee) {
          reply += `💰 Costo de envío: $${domicilioService.deliveryFee.toLocaleString('es-CO')}\n`;
        }
        if (domicilioService.minOrderAmount) {
          reply += `📦 Pedido mínimo: $${domicilioService.minOrderAmount.toLocaleString('es-CO')}\n`;
        }
        reply += '\n¿Te gustaría hacer un pedido a domicilio? 😊';
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      } else {
        const reply = 'Lo siento, actualmente no contamos con servicio de domicilio. 😔';
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      }
    }

    // Priorizar consultas de precio SIEMPRE (incluso si hay reserva activa)
    if (asksForPrice) {
      const config = company.config as any;
      const products = config?.products || [];
      
      // Buscar el producto mencionado (usar normalizeText del servicio)
      const normalizedMessage = this.textUtils.normalizeText(lowerMessage);
      const foundProduct = products.find((p: any) => {
        const productName = this.textUtils.normalizeText(p.name || '');
        return normalizedMessage.includes(productName);
      });
      
      if (foundProduct) {
        const price = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(foundProduct.price);
        let reply = `💰 **${foundProduct.name}**\n\nPrecio: ${price}`;
        
        if (foundProduct.duration) {
          reply += `\nDuración: ${foundProduct.duration} minutos`;
        }
        if (foundProduct.description) {
          reply += `\n\n${foundProduct.description}`;
        }
        
        // Sugerir productos relacionados de la misma categoría
        const relatedProducts = products
          .filter((p: any) => p.category === foundProduct.category && p.id !== foundProduct.id)
          .slice(0, 2);
        
        if (relatedProducts.length > 0) {
          reply += `\n\n**También tenemos:**`;
          relatedProducts.forEach((p: any) => {
            const relPrice = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(p.price);
            reply += `\n• ${p.name} - ${relPrice}`;
          });
        }
        
        reply += `\n\n¿Te gustaría hacer una reserva? 😊`;
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      }
    }
    
    // Si pregunta por productos, mostrar lista (incluso si está en proceso de reserva)
    // Esto es importante cuando el servicio requiere productos y el usuario pregunta qué hay disponible
    if (asksForProducts) {
      const config = company.config as any;
      const products = config?.products || [];
      
      if (products.length > 0) {
        let reply = `📋 **${company.type === 'restaurant' ? 'Nuestro Menú' : 'Nuestros Servicios'}:**\n\n`;
        
        // Agrupar por categoría
        const grouped: any = {};
        products.forEach((p: any) => {
          if (!grouped[p.category]) grouped[p.category] = [];
          grouped[p.category].push(p);
        });
        
        for (const [category, items] of Object.entries(grouped)) {
          reply += `**${category.charAt(0).toUpperCase() + category.slice(1)}**\n`;
          (items as any[]).forEach((item: any) => {
            const price = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.price);
            reply += `• ${item.name} - ${price}`;
            if (item.duration) reply += ` (${item.duration} min)`;
            if (item.description) reply += ` - ${item.description}`;
            reply += `\n`;
          });
          reply += `\n`;
        }
        
        // Si está en proceso de reserva y necesita productos, pedir que seleccione
        if (isContinuingReservation && context.collectedData?.service) {
          const availableServices = config?.services || {};
          const selectedService = availableServices[context.collectedData.service];
          if (selectedService?.requiresProducts) {
            reply += `\nPor favor, dime qué productos quieres de nuestro menú. Por ejemplo: "quiero una pizza margherita y una coca cola" 😊`;
          } else {
            reply += `¿Te gustaría hacer una reserva? 😊`;
          }
        } else {
          reply += `¿Te gustaría hacer una reserva? 😊`;
        }
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage, // Mantener el estado actual (collecting si está en reserva)
        };
      }
    }

    let detection: DetectionResult;

    // NUEVA CAPA 0: Keywords desde BD (más rápido, escalable)
    // Intentar detectar servicio por keywords primero
    const keywordMatch = await this.keywordsService.findServiceByKeyword(
      dto.message,
      dto.companyId,
    );

    // Si encontramos un match con buena confianza, usarlo
    if (keywordMatch && keywordMatch.confidence >= CONFIDENCE_THRESHOLDS.HIGH) {
      // Usar OpenAI para extraer otros datos (fecha, hora, etc.) pero usar el servicio del keyword
      const layer3Detection = await this.layer3.detect(
        dto.message,
        dto.companyId,
        userId,
      );
      detection = {
        intention: 'reservar',
        confidence: Math.max(layer3Detection.confidence, keywordMatch.confidence),
        extractedData: {
          ...layer3Detection.extractedData,
          service: keywordMatch.serviceKey, // Usar servicio del keyword (más confiable)
        },
      };
    } else if (asksParaLlevar && !hasConsultaKeywords) {
      // Si dice "pedir para llevar" o similar, es una intención de reservar con servicio "mesa"
      // Usar OpenAI para extraer datos pero forzar intención "reservar"
      const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
      detection = {
        intention: 'reservar',
        confidence: 0.9,
        extractedData: {
          ...layer3Detection.extractedData,
          service: 'mesa', // Forzar servicio "mesa" para "para llevar"
        },
      };
    } else if (isGreeting && !hasConsultaKeywords && !asksForProducts && !this.keywordDetector.mentionsReservation(dto.message)) {
      // Si es SOLO un saludo sin otras intenciones, detectar como "saludar"
      detection = {
        intention: 'saludar',
        confidence: 1.0,
      };
    } else if (hasConsultaKeywords && !this.keywordDetector.mentionsReservation(dto.message)) {
      // Si tiene palabras de consulta y NO tiene palabras de reserva, priorizar consulta
      // INCLUSO si estamos en medio de una reserva
      detection = {
        intention: 'consultar',
        confidence: 0.9,
      };
    } else if (isContinuingReservation) {
      // Si estamos continuando una reserva, SIEMPRE usar OpenAI para extraer datos
      // OpenAI entiende mejor el contexto y puede extraer información incluso sin keywords
      detection = await this.layer3.detect(dto.message, dto.companyId, userId);
      // Solo forzar intención a "reservar" si no es una consulta clara
      if (!hasConsultaKeywords) {
        detection.intention = 'reservar';
        detection.confidence = Math.max(detection.confidence, CONFIDENCE_THRESHOLDS.MEDIUM);
      }
    } else {
      // Flujo normal: intentar capas 1, 2, 3
      // 4. CAPA 1: Intentar detección rápida
      detection = await this.layer1.detect(dto.message, dto.companyId);

      // 5. Si no hay confianza suficiente → CAPA 2
      if (detection.confidence < CONFIDENCE_THRESHOLDS.HIGH) {
        const layer2Detection = await this.layer2.detect(dto.message, dto.companyId);
        if (layer2Detection.confidence > detection.confidence) {
          detection = layer2Detection;
        }
      }

      // 6. Si la intención es "reservar", SIEMPRE usar OpenAI para extraer datos
      // Esto es crítico para capturar fecha, hora, teléfono, etc. del primer mensaje
      if (detection.intention === 'reservar') {
        // Forzar uso de OpenAI para extraer datos cuando es una reserva
        const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
        detection.intention = 'reservar'; // Mantener intención
        detection.confidence = Math.max(detection.confidence, layer3Detection.confidence);
        // Usar los datos extraídos de OpenAI
        if (layer3Detection.extractedData) {
          detection.extractedData = layer3Detection.extractedData;
        }
        if (layer3Detection.missingFields) {
          detection.missingFields = layer3Detection.missingFields;
        }
        if (layer3Detection.suggestedReply) {
          detection.suggestedReply = layer3Detection.suggestedReply;
        }
      } else {
        // SIEMPRE usar OpenAI para mensajes con contexto relevante o baja confianza
        // Verificar si hay contexto relevante (pagos pendientes, reservas, historial)
        const hasRelevantContext = 
          context.stage === 'completed' ||
          context.conversationHistory?.length > 0 ||
          dto.message.trim().length <= 15; // Mensajes cortos pueden necesitar contexto
        
        if (detection.confidence < CONFIDENCE_THRESHOLDS.MEDIUM || 
            detection.intention === 'consultar' || 
            detection.intention === 'otro' ||
            hasRelevantContext) {
          // Usar OpenAI para análisis contextual completo
          const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
          
          // Priorizar la detección de OpenAI si tiene mejor confianza o si hay contexto relevante
          if (layer3Detection.confidence > detection.confidence || 
              hasRelevantContext ||
              detection.intention === 'otro') {
            detection = layer3Detection;
          } else if (detection.intention === 'consultar') {
            // Mantener intención "consultar" pero usar datos extraídos de OpenAI
            detection.intention = 'consultar';
            detection.confidence = Math.max(detection.confidence, layer3Detection.confidence);
            detection.extractedData = layer3Detection.extractedData;
            if (layer3Detection.suggestedReply) {
              detection.suggestedReply = layer3Detection.suggestedReply;
            }
          }
        }
      }
    }

    // 7. Si se detectó un teléfono en los datos extraídos, crear/actualizar usuario
    if (detection.extractedData?.phone && !dto.phone) {
      const extractedPhone = detection.extractedData.phone;
      const existingUser = await this.usersService.findByPhone(extractedPhone);
      if (existingUser) {
        // Si el usuario existe con ese teléfono, usar ese userId
        userId = existingUser.id;
      } else {
        // Crear nuevo usuario con el teléfono extraído
        const newUser = await this.usersService.create({
          phone: extractedPhone,
          name: detection.extractedData.name || null,
        });
        userId = newUser.id;
      }
    }

    // 8. Declarar variable reply para usar en todo el flujo
    let reply: string;
    let newState = { ...context };

    // 9. CONSULTAR HISTORIAL si el usuario pregunta por sus pedidos/reservas anteriores
    if (this.keywordDetector.asksForHistory(dto.message)) {
      try {
        // Buscar reservas confirmadas del usuario en los últimos 90 días
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        
        const reservations = await this.reservations.findByUser(userId, dto.companyId, {
          limit: 10,
          fromDate: ninetyDaysAgo,
        });
        
        // Buscar TODOS los pagos del usuario (pendientes, aprobados, rechazados)
        const payments = await this.paymentsService.getPaymentsByUser(userId, dto.companyId);
        
        // Crear lista unificada de pedidos/reservas
        const allItems: any[] = [];
        
        // 1. Agregar reservas confirmadas (las que ya están en la BD)
        for (const r of reservations) {
          allItems.push({
            type: 'reservation',
            date: r.date,
            time: r.time,
            service: r.service,
            status: r.status,
            guests: r.guests,
            metadata: r.metadata,
            createdAt: r.createdAt,
          });
        }
        
        // 2. Agregar pedidos basados en pagos (pendientes, rechazados, etc.)
        for (const payment of payments) {
          // Solo incluir pagos que no tengan reserva confirmada asociada
          // (evitar duplicados con reservas ya confirmadas)
          const hasReservation = reservations.some(r => 
            r.metadata && 
            typeof r.metadata === 'object' && 
            (r.metadata as any).paymentId === payment.id
          );
          
          if (!hasReservation) {
            // Los pagos no tienen metadata en el schema actual
            // Solo incluir información básica del pago
            allItems.push({
              type: 'payment',
              date: payment.createdAt,
              time: 'Por confirmar',
              service: 'domicilio',
              status: payment.status === 'APPROVED' ? 'approved' : 
                      payment.status === 'PENDING' ? 'pending_payment' : 
                      payment.status === 'DECLINED' ? 'declined' : 'error',
              guests: null,
              metadata: {},
              amount: payment.amount,
              paymentUrl: payment.paymentUrl,
              createdAt: payment.createdAt,
            });
          }
        }
        
        // 3. INCLUIR pedido/reserva en proceso si existe (aún no creado en BD)
        if (context.stage === 'awaiting_payment' && context.collectedData) {
          const collected = context.collectedData;
          if (collected.date && collected.time) {
            // Verificar que no esté ya en la lista de pagos
            const alreadyInList = allItems.some(item => 
              item.date === collected.date && 
              item.time === collected.time &&
              item.status === 'pending_payment'
            );
            
            if (!alreadyInList) {
              allItems.push({
                type: 'current',
                date: collected.date,
                time: collected.time,
                service: collected.service,
                status: 'pending_payment',
                guests: collected.guests,
                metadata: {
                  products: collected.products,
                  treatment: collected.treatment,
                },
                createdAt: new Date(),
              });
            }
          }
        }
        
        // Ordenar por fecha de creación (más recientes primero)
        allItems.sort((a, b) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        
        if (!allItems || allItems.length === 0) {
          reply = 'No encontré pedidos o reservas anteriores en tu historial. 🤔\n\n¿Te gustaría hacer un nuevo pedido?';
        } else {
          // Detectar si pregunta específicamente por domicilios
          const asksDomicilios = this.keywordDetector.mentionsDelivery(dto.message);
          
          // Filtrar por tipo de servicio si es específico
          let filteredItems = allItems;
          let serviceType = 'pedidos y reservas';
          
          if (asksDomicilios) {
            filteredItems = allItems.filter(r => r.service === 'domicilio');
            serviceType = 'domicilios';
          }
          
          if (filteredItems.length === 0) {
            reply = `No encontré ${serviceType} en tu historial. 🤔\n\n¿Te gustaría hacer uno ahora?`;
          } else {
            // Formatear respuesta con historial
            reply = `📋 Aquí está tu historial de ${serviceType}:\n\n`;
            
            for (let i = 0; i < filteredItems.length; i++) {
              const r = filteredItems[i];
              const num = i + 1;
              
              // Emojis y textos según el estado
              let statusEmoji = '⏳';
              let statusText = 'Pendiente';
              
              if (r.status === 'confirmed') {
                statusEmoji = '✅';
                statusText = 'Confirmado';
              } else if (r.status === 'approved') {
                statusEmoji = '✅';
                statusText = 'Pagado';
              } else if (r.status === 'cancelled') {
                statusEmoji = '❌';
                statusText = 'Cancelado';
              } else if (r.status === 'pending_payment') {
                statusEmoji = '💳';
                statusText = 'Pendiente de pago';
              } else if (r.status === 'declined') {
                statusEmoji = '🚫';
                statusText = 'Pago rechazado';
              } else if (r.status === 'error') {
                statusEmoji = '⚠️';
                statusText = 'Error en pago';
              }
              
              reply += `${num}. ${statusEmoji} **${statusText}**\n`;
              
              // Formatear fecha
              if (typeof r.date === 'string') {
                reply += `   📅 Fecha: ${DateHelper.formatDateReadable(r.date)}\n`;
              } else if (r.date instanceof Date) {
                reply += `   📅 Fecha: ${DateHelper.formatDateReadable(r.date.toISOString().split('T')[0])}\n`;
              }
              
              reply += `   🕐 Hora: ${this.formatTime12h(r.time)}\n`;
              
              if (r.service) {
                const serviceName = r.service === 'domicilio' ? 'Domicilio' : r.service === 'mesa' ? 'Mesa' : r.service === 'cita' ? 'Cita' : r.service;
                reply += `   🏷️ Servicio: ${serviceName}\n`;
              }
              
              // Mostrar productos si existen CON CANTIDADES
              if (r.metadata && typeof r.metadata === 'object') {
                const metadata = r.metadata as any;
                if (metadata.products && Array.isArray(metadata.products) && metadata.products.length > 0) {
                  // Obtener config de empresa para nombres de productos
                  const companyConfig = company?.config as any;
                  const catalogProducts = Array.isArray(companyConfig?.products) ? companyConfig.products : [];
                  
                  const productLines: string[] = [];
                  for (const item of metadata.products) {
                    if (typeof item === 'object' && item.id) {
                      // Formato nuevo con cantidades
                      const product = catalogProducts.find((p: any) => p.id === item.id);
                      if (product) {
                        const quantity = item.quantity || 1;
                        productLines.push(`${quantity}x ${product.name}`);
                      }
                    } else {
                      // Formato antiguo (solo IDs)
                      const product = catalogProducts.find((p: any) => p.id === item);
                      if (product) {
                        productLines.push(product.name);
                      }
                    }
                  }
                  
                  if (productLines.length > 0) {
                    reply += `   🛍️ Productos: ${productLines.join(', ')}\n`;
                  }
                }
              }
              
              if (r.guests && r.guests > 1) {
                reply += `   👥 Personas: ${r.guests}\n`;
              }
              
              // Mostrar monto si es un pago
              if (r.amount) {
                const formattedAmount = new Intl.NumberFormat('es-CO', { 
                  style: 'currency', 
                  currency: 'COP', 
                  minimumFractionDigits: 0 
                }).format(r.amount);
                reply += `   💰 Monto: ${formattedAmount}\n`;
              }
              
              // Si está pendiente de pago o rechazado, mostrar link
              if ((r.status === 'pending_payment' || r.status === 'declined') && r.paymentUrl) {
                reply += `   🔗 Link: ${r.paymentUrl}\n`;
              }
              
              reply += '\n';
            }
            
            reply += `Total: ${filteredItems.length} ${serviceType}\n\n`;
            
            // Si hay algún pendiente de pago, recordar que deben pagar
            const hasPendingPayment = filteredItems.some(r => r.status === 'pending_payment' || r.status === 'declined');
            if (hasPendingPayment) {
              reply += `⚠️ Recuerda completar los pagos pendientes para confirmar tus pedidos.\n\n`;
            }
            
            reply += '¿Te gustaría hacer un nuevo pedido? 😊';
          }
        }
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      } catch (error) {
        this.logger.error('Error consultando historial:', error);
        // Continuar con el flujo normal si hay error
      }
    }

    // 9. VERIFICAR ESTADO DE PAGO si el usuario dice que ya pagó
    if (this.keywordDetector.saysAlreadyPaid(dto.message) || this.keywordDetector.mentionsPayment(dto.message)) {
      try {
        const conversationId = await this.conversations.findOrCreateConversation(userId, dto.companyId);
        const pendingPayment = await this.paymentsService.getPendingPayment(conversationId);
        
        if (pendingPayment) {
          // Verificar estado actualizado del pago
          const updatedPayment = await this.paymentsService.checkPaymentStatus(pendingPayment.id);
          
          // Responder según el estado del pago
          if (updatedPayment.status === 'APPROVED') {
            // Pago aprobado - confirmar pedido
            const service = context.collectedData?.service;
            const isDelivery = service === 'domicilio';
            const confirmationType = isDelivery ? 'pedido' : 'reserva';
            
            reply = `✅ ¡Perfecto! Tu pago ha sido confirmado exitosamente.\n\n🎉 Tu ${confirmationType} ha sido ${isDelivery ? 'confirmado' : 'confirmada'}. Te mantendremos informado sobre el estado de tu ${confirmationType}.`;
            
            // Actualizar estado de conversación
            await this.conversations.saveContext(userId, dto.companyId, {
              ...context,
              stage: 'completed',
              collectedData: {},
            });
            await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
            
            return {
              reply,
              intention: 'consultar',
              confidence: 1.0,
              conversationState: 'completed',
            };
          } else if (updatedPayment.status === 'PENDING') {
            // Pago pendiente - verificar si tiene wompiTransactionId
            if (!updatedPayment.wompiTransactionId) {
              // El usuario aún no ha completado el pago en el enlace
              const service = context.collectedData?.service;
              const isDelivery = service === 'domicilio';
              const orderType = isDelivery ? 'pedido' : 'reserva';
              
              reply = `⏳ Veo que aún no has completado el pago en el enlace.\n\nPor favor ingresa al siguiente enlace para realizar el pago del 50% y confirmar tu ${orderType}:\n\n🔗 ${updatedPayment.paymentUrl}\n\nCuando hayas completado el pago, escríbeme "ya pagué" y verificaré el estado. ✅`;
            } else {
              // Ya tiene transaction ID pero está pendiente
              reply = `⏳ Tu pago está en proceso de confirmación. Por favor espera unos momentos mientras se verifica.\n\nSi ya realizaste el pago, puede tardar hasta 5 minutos en reflejarse en el sistema. Vuelve a escribir "ya pagué" en unos minutos. 😊`;
            }
            
            await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
            return {
              reply,
              intention: 'consultar',
              confidence: 1.0,
              conversationState: context.stage,
            };
          } else if (updatedPayment.status === 'DECLINED' || updatedPayment.status === 'ERROR') {
            // Pago rechazado
            const service = context.collectedData?.service;
            const isDelivery = service === 'domicilio';
            const orderType = isDelivery ? 'pedido' : 'reserva';
            
            reply = `❌ Tu pago ha sido rechazado. Por favor intenta nuevamente con otro método de pago o contacta a tu banco.\n\n🔗 Intenta nuevamente: ${updatedPayment.paymentUrl}\n\nSi necesitas ayuda, escríbeme. 😊`;
            
            await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
            return {
              reply,
              intention: 'consultar',
              confidence: 1.0,
              conversationState: context.stage,
            };
          }
        } else if (this.keywordDetector.mentionsPayment(dto.message)) {
          // El usuario pregunta por el pago pero no hay pagos pendientes
          reply = `No encontré ningún pago pendiente asociado a tu cuenta. ¿En qué más puedo ayudarte?`;
          await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
          return {
            reply,
            intention: 'consultar',
            confidence: 1.0,
            conversationState: context.stage,
          };
        }
      } catch (error) {
        this.logger.error('Error verificando estado de pago:', error);
        // Continuar con el flujo normal si hay error
      }
    }

    // 10. VALIDAR ESTADO awaiting_payment - Si el usuario está esperando pago pero no dice "ya pagué"
    // recordarle que debe pagar primero antes de continuar
    if (context.stage === 'awaiting_payment' && 
        !this.keywordDetector.saysAlreadyPaid(dto.message) && 
        !this.keywordDetector.mentionsPayment(dto.message) &&
        detection.intention !== 'cancelar') {
      try {
        const conversationId = await this.conversations.findOrCreateConversation(userId, dto.companyId);
        const pendingPayment = await this.paymentsService.getPendingPayment(conversationId);
        
        if (pendingPayment && pendingPayment.paymentUrl) {
          const service = context.collectedData?.service;
          const isDelivery = service === 'domicilio';
          const orderType = isDelivery ? 'pedido' : 'reserva';
          
          reply = `⚠️ Recuerda que tienes un pago pendiente para confirmar tu ${orderType}.\n\n🔗 Completa el pago aquí: ${pendingPayment.paymentUrl}\n\nCuando hayas pagado, escríbeme "ya pagué" para verificar. 😊`;
          
          await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
          return {
            reply,
            intention: 'consultar',
            confidence: 1.0,
            conversationState: 'awaiting_payment',
          };
        }
      } catch (error) {
        this.logger.error('Error verificando pago pendiente:', error);
      }
    }

    // 11. Procesar según intención usando handlers
    const handlerContext = {
      detection,
      context,
      dto,
      company,
      userId,
    };

    if (detection.intention === 'saludar') {
      const result = await this.greetingHandler.handle(handlerContext);
      reply = result.reply;
      newState = result.newState;
    } else if (detection.intention === 'reservar') {
      const result = await this.reservationHandler.handle(handlerContext);
      reply = result.reply;
      newState = result.newState;
      // Usar los missingFields calculados si están disponibles
      if (result.missingFields) {
        detection.missingFields = result.missingFields;
      }
    } else if (detection.intention === 'cancelar') {
      const result = await this.cancelHandler.handle(handlerContext);
      reply = result.reply;
      newState = result.newState;
    } else if (detection.intention === 'consultar') {
      const result = await this.queryHandler.handle(handlerContext);
      reply = result.reply;
      newState = result.newState;
    } else {
      // Fallback para otras intenciones - Usar suggestedReply de OpenAI que ya tiene contexto
      // OpenAI ya analizó el contexto completo (pagos, reservas, historial) y generó una respuesta coherente
      reply = detection.suggestedReply || await this.messagesTemplates.getError(company.type);
      newState.stage = 'idle';
    }

    // 11. Invalidar cache ANTES de guardar para evitar race conditions
    await this.contextCache.invalidateContext(contextKey);
    
    // 12. Guardar estado actualizado
    await this.conversations.saveContext(userId, dto.companyId, newState);

      // 13. Agregar respuesta al historial
    await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);

      // 14. Si la reserva se completó, crear/buscar conversación en BD para pagos
    let conversationId = `${userId}_${dto.companyId}`;
    if (newState.stage === 'completed' && detection.intention === 'reservar') {
      conversationId = await this.conversations.findOrCreateConversation(userId, dto.companyId);
    }

      // 15. VALIDACIÓN FINAL: NUNCA retornar respuesta vacía
    if (!reply || reply.trim().length === 0) {
      this.logger.warn(`Respuesta vacía detectada para intención: ${detection.intention}. Usando fallback.`);
      reply = detection.suggestedReply || 
              await this.messagesTemplates.getError(company.type) ||
              'Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo o reformula tu pregunta.';
    }

    // 16. Retornar respuesta
    return {
      reply,
      intention: detection.intention,
      confidence: detection.confidence,
      missingFields: detection.missingFields,
      conversationState: newState.stage,
      conversationId,
    };
    } catch (error) {
      this.logger.error(
        `Error en processMessage - userId: ${dto.userId}, companyId: ${dto.companyId}, message: ${dto.message?.substring(0, 50)}`,
        error.stack || error.message,
      );
      // Retornar respuesta de error genérica
      return {
        reply: 'Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.',
        intention: 'otro',
        confidence: 0,
        conversationState: 'idle',
      };
    }
  }

  async handleReservation(
    detection: DetectionResult,
    context: any,
    dto: ProcessMessageDto,
    companyType: string,
  ): Promise<{ reply: string; newState: any; missingFields?: string[] }> {
    return await this.reservationFlow.handleReservation(detection, context, dto, companyType);
  }

  private formatHours(hours: Record<string, string>): string {
    if (!hours || Object.keys(hours).length === 0) {
      return 'consultar disponibilidad';
    }

    const daysMap: Record<string, string> = {
      monday: 'Lunes',
      tuesday: 'Martes',
      wednesday: 'Miércoles',
      thursday: 'Jueves',
      friday: 'Viernes',
      saturday: 'Sábado',
      sunday: 'Domingo',
    };

    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    // Agrupar días con mismo horario
    const hoursBySlot: Record<string, string[]> = {};
    
    for (const day of dayOrder) {
      if (hours[day]) {
        const timeSlot = hours[day];
        if (!hoursBySlot[timeSlot]) {
          hoursBySlot[timeSlot] = [];
        }
        hoursBySlot[timeSlot].push(daysMap[day]);
      }
    }

    // Formatear horarios agrupados
    const formattedSlots: string[] = [];
    for (const [timeSlot, days] of Object.entries(hoursBySlot)) {
      if (days.length === 1) {
        formattedSlots.push(`${days[0]}: ${timeSlot}`);
      } else if (days.length === 2) {
        formattedSlots.push(`${days[0]} y ${days[1]}: ${timeSlot}`);
      } else {
        const firstDay = days[0];
        const lastDay = days[days.length - 1];
        formattedSlots.push(`${firstDay} a ${lastDay}: ${timeSlot}`);
      }
    }

    return formattedSlots.join('. ');
  }

  /**
   * Convierte hora de formato 24h a 12h
   */
  private formatTime12h(timeStr: string): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }
}

