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
import { ProcessMessageDto } from './dto/process-message.dto';
import { DetectionResult } from './dto/detection-result.dto';
import { CONFIDENCE_THRESHOLDS } from './constants/detection.constants';
import { GreetingHandler } from './handlers/greeting.handler';
import { CancelHandler } from './handlers/cancel.handler';
import { QueryHandler } from './handlers/query.handler';
import { ReservationHandler } from './handlers/reservation.handler';

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
      const asksForProducts = this.keywordDetector.asksForProducts(dto.message);
      const asksParaLlevar = this.keywordDetector.asksParaLlevar(dto.message);
      const hasConsultaKeywords = this.keywordDetector.hasConsultaKeywords(dto.message) && !asksForProducts;
      const asksForPrice = this.keywordDetector.asksForPrice(dto.message);
    
    if (asksForPrice && !isContinuingReservation) {
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

    // 9. Procesar según intención usando handlers
    let reply: string;
    let newState = { ...context };

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

    // 10. Invalidar cache ANTES de guardar para evitar race conditions
    await this.contextCache.invalidateContext(contextKey);
    
    // 11. Guardar estado actualizado
    await this.conversations.saveContext(userId, dto.companyId, newState);

      // 12. Agregar respuesta al historial
    await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);

      // 13. Si la reserva se completó, crear/buscar conversación en BD para pagos
    let conversationId = `${userId}_${dto.companyId}`;
    if (newState.stage === 'completed' && detection.intention === 'reservar') {
      conversationId = await this.conversations.findOrCreateConversation(userId, dto.companyId);
    }

      // 14. Retornar respuesta
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
    const settings = await this.messagesTemplates.getReservationSettings(companyType);
    const missingFieldsLabels = await this.messagesTemplates.getMissingFieldsLabels(companyType);
    
    // Obtener configuración de la empresa para validar servicios (usar cache)
    const company = await this.contextCache.getOrLoadCompany(
      dto.companyId,
      () => this.companies.findOne(dto.companyId)
    );
    const config = company?.config as any;
    const availableServices = config?.services || {};
    const hasMultipleServices = Object.keys(availableServices).length > 1;

    // Datos anteriores (antes de este mensaje)
    const previousData = { ...context.collectedData };

    // Actualizar datos recopilados - solo sobrescribir con valores que NO sean null/undefined
    const extracted = detection.extractedData || {};
    const collected = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => value !== null && value !== undefined)
      ),
    };

    // Identificar qué datos NUEVOS se recibieron en este mensaje
    const newData: any = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && previousData[key] !== value) {
        newData[key] = value;
      }
    }

    // Detectar si el usuario quiere cambiar de domicilio a mesa (usar servicio)
    const noQuiereDomicilio = this.keywordDetector.doesNotWantDelivery(dto.message);
    
    // Si el usuario dice que NO quiere domicilio y tenía domicilio, cambiar a mesa
    if (noQuiereDomicilio && collected.service === 'domicilio' && availableServices['mesa']) {
      collected.service = 'mesa';
      newData.service = 'mesa';
      // Limpiar productos si cambia a mesa (mesa no requiere productos)
      if (collected.products) {
        delete collected.products;
      }
    }

    // Intentar mapear productos/tratamientos mencionados en texto a IDs del catálogo
    // Esto permite que frases como "pizza margherita y coca cola" se conviertan en IDs conocidos
    const catalogProducts = Array.isArray(config?.products) ? config.products : [];
    if (catalogProducts.length > 0) {
      const normalizedMsg = this.textUtils.normalizeText(dto.message.toLowerCase());
      const foundProductIds: string[] = [];
      for (const product of catalogProducts) {
        const name = this.textUtils.normalizeText(product.name || '');
        if (name && normalizedMsg.includes(name)) {
          foundProductIds.push(product.id);
        }
      }
      if (foundProductIds.length > 0) {
        const existing = Array.isArray(collected.products) ? collected.products : [];
        const merged = Array.from(new Set([...existing, ...foundProductIds]));
        collected.products = merged;
        newData.products = foundProductIds;
        // Para clínica: si no hay tratamiento explícito, usar el primero detectado
        if (!collected.treatment) {
          collected.treatment = foundProductIds[0];
        }
        // Si hay productos detectados, preferir un servicio que requiera productos
        const currentService = collected.service;
        const currentRequiresProducts = currentService ? availableServices[currentService]?.requiresProducts : false;
        const canSwitchToDomicilio = availableServices['domicilio']?.requiresProducts === true;
        const canSwitchToCita = availableServices['cita']?.requiresProducts === true;

        if (!currentService || !currentRequiresProducts) {
          if (canSwitchToDomicilio) {
            collected.service = 'domicilio';
            newData.service = 'domicilio';
          } else if (canSwitchToCita) {
            collected.service = 'cita';
            newData.service = 'cita';
          }
        }
      }

      // Heurística extra: si menciona productos o términos de pedido, forzar servicio con productos
      // Usar servicios de detección centralizados
      const mentionsDelivery = this.keywordDetector.mentionsDelivery(dto.message);
      const mentionsFood = this.keywordDetector.mentionsFood(dto.message);

      const currentService = collected.service;
      const currentRequiresProducts = currentService ? availableServices[currentService]?.requiresProducts : false;
      const canSwitchToDomicilio = availableServices['domicilio']?.requiresProducts === true;
      const canSwitchToCita = availableServices['cita']?.requiresProducts === true;

      if (!currentService || !currentRequiresProducts) {
        if (canSwitchToDomicilio && (foundProductIds.length > 0 || mentionsDelivery || mentionsFood)) {
          collected.service = 'domicilio';
          newData.service = 'domicilio';
        } else if (canSwitchToCita && mentionsDelivery) {
          collected.service = 'cita';
          newData.service = 'cita';
        }
      }
    }

    // Determinar qué falta según el servicio seleccionado
    const selectedService = collected.service ? availableServices[collected.service] : null;
    const requiresProducts = selectedService?.requiresProducts === true;
    const requiresPayment = selectedService?.requiresPayment === true || company?.requiresPayment === true;
    
    const required = ['date', 'time', 'phone'];
    
    // Si el servicio requiere productos, NO pedir "personas", pedir "productos"
    if (requiresProducts) {
      // Para servicios con productos (domicilio), NO pedir guests
      if (!collected.products || (Array.isArray(collected.products) && collected.products.length === 0)) {
        required.push('products');
        missingFieldsLabels['products'] = 'productos';
      }
    } else {
      // Para servicios sin productos (mesa), pedir guests si está configurado
      if (settings.requireGuests) {
        required.push('guests');
      }
    }

    // Servicios que requieren pago pero no productos (ej. clínica: tratamiento obligatorio)
    // Si hay catálogo de productos/tratamientos, exigir "treatment" (o "product") antes de cerrar
    if (requiresPayment && (!requiresProducts)) {
      const hasCatalog = Array.isArray(config?.products) && config.products.length > 0;
      const hasTreatment = collected.treatment || collected.product;
      if (hasCatalog && !hasTreatment) {
        required.push('treatment');
        missingFieldsLabels['treatment'] = 'tratamiento';
      }
    }
    
    // Si hay múltiples servicios, el servicio es obligatorio
    if (hasMultipleServices) {
      required.push('service');
      missingFieldsLabels['service'] = 'servicio';
    }
    
    const missing = required.filter((f) => !collected[f]);
    
    // Validar que el servicio seleccionado existe
    if (collected.service && hasMultipleServices && !availableServices[collected.service]) {
      const servicesList = Object.entries(availableServices)
        .map(([key, value]: [string, any]) => `• ${value.name}`)
        .join('\n');
      
      return {
        reply: `El servicio "${collected.service}" no está disponible. Por favor elige uno de estos:\n\n${servicesList}`,
        newState: {
          ...context,
          collectedData: { ...collected, service: undefined },
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }

    if (missing.length > 0) {
      // Faltan datos → generar respuesta dinámica
      const missingFieldsSpanish = missing.map((f) => missingFieldsLabels[f] || f);
      
      // Usar respuesta dinámica que confirma datos recibidos y pide faltantes
      const reply = await this.messagesTemplates.getDynamicReservationResponse(
        companyType,
        collected,
        newData,
        missingFieldsSpanish,
      );

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
        },
        missingFields: missingFieldsSpanish, // Devolver los campos faltantes calculados
      };
    }

    // Si no requiere guests pero no se proporcionó, usar default
    if (!settings.requireGuests && !collected.guests) {
      collected.guests = settings.defaultGuests || 1;
    }

    // Todos los datos completos → validar disponibilidad
    const available = await this.availability.check(dto.companyId, {
      date: collected.date!,
      time: collected.time!,
      guests: collected.guests,
      userId: dto.userId, // Pasar userId para validar reservas duplicadas
      service: collected.service, // Pasar service para validar por servicio
    });

    if (!available.isAvailable) {
      let reply = available.message || 'No hay disponibilidad en este horario.';
      if (available.alternatives && available.alternatives.length > 0) {
        reply += ` ¿Te sirve ${available.alternatives[0]}?`;
      }

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
        },
      };
    }

    // Crear reserva
    try {
      // Calcular monto si requiere pago
      let paymentAmount = 0;
      let paymentDescription = '';
      
      if (requiresProducts && collected.products) {
        // Calcular total de productos
        const products = config?.products || [];
        const productsList = Array.isArray(collected.products) ? collected.products : [];
        let subtotal = 0;
        
        for (const productId of productsList) {
          const product = products.find((p: any) => p.id === productId);
          if (product) {
            subtotal += product.price || 0;
          }
        }
        
        // Agregar costo de envío si es domicilio
        const deliveryFee = selectedService?.deliveryFee || 0;
        paymentAmount = subtotal + deliveryFee;
        paymentDescription = `Pedido a domicilio - ${productsList.length} producto(s)`;
      } else if (requiresPayment && collected.service) {
        // Para citas, usar precio del tratamiento/producto seleccionado
        const products = config?.products || [];
        const treatmentId = collected.treatment || collected.product;
        if (treatmentId) {
          const treatment = products.find((p: any) => p.id === treatmentId);
          if (treatment) {
            paymentAmount = treatment.price || 0;
            paymentDescription = `Cita - ${treatment.name}`;
          }
        }
      }
      
      // Aplicar porcentaje de pago anticipado
      const paymentPercentage = company?.paymentPercentage || 100;
      const finalAmount = Math.round(paymentAmount * (paymentPercentage / 100));
      
      const reservation = await this.reservations.create({
        company: { connect: { id: dto.companyId } },
        userId: dto.userId,
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests || settings.defaultGuests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service,
        status: requiresPayment && finalAmount > 0 ? 'pending' : 'confirmed', // Pendiente si requiere pago
        metadata: {
          products: collected.products,
          treatment: collected.treatment || collected.product,
          paymentAmount: finalAmount,
          requiresPayment,
        },
      });

      // Generar link de pago si es necesario
      let paymentUrl = null;
      if (requiresPayment && finalAmount > 0) {
        try {
          // Obtener o crear conversación
          const conversationId = await this.conversations.findOrCreateConversation(dto.userId, dto.companyId);
          
          // Obtener datos del usuario
          const user = await this.usersService.findOne(dto.userId);
          
          // Crear pago
          const payment = await this.paymentsService.createPayment({
            companyId: dto.companyId,
            conversationId,
            amount: finalAmount,
            description: paymentDescription,
            customerEmail: user?.email || `user-${dto.userId}@example.com`,
            customerName: user?.name || collected.name || 'Cliente',
          });
          
          paymentUrl = payment.paymentUrl;
        } catch (paymentError) {
          console.error('Error creando pago:', paymentError);
          // Continuar sin pago si hay error
        }
      }

      // Generar respuesta de confirmación
      let reply = await this.messagesTemplates.getReservationConfirm(companyType, {
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests,
        phone: collected.phone,
        service: collected.service,
        serviceName: collected.service && availableServices[collected.service]?.name,
      });

      // Breakdown de productos/tratamientos (domicilio/cita) y envío
      let productsBreakdown = '';
      if (requiresProducts && collected.products && Array.isArray(collected.products)) {
        const products = config?.products || [];
        const productLines: string[] = [];
        for (const productId of collected.products) {
          const product = products.find((p: any) => p.id === productId);
          if (product) {
            productLines.push(`• ${product.name} - $${(product.price || 0).toLocaleString('es-CO')}`);
          }
        }
        if (productLines.length > 0) {
          productsBreakdown = `\n\n🛍️ Productos:\n${productLines.join('\n')}`;
        }
        if (selectedService?.deliveryFee) {
          productsBreakdown += `\n🚚 Envío: $${selectedService.deliveryFee.toLocaleString('es-CO')}`;
        }
      }

      if (productsBreakdown) {
        reply += productsBreakdown;
      }

      // Agregar información de pago si es necesario (incluye total y anticipo)
      if (requiresPayment && finalAmount > 0) {
        const totalText = paymentAmount > 0 ? `\nTotal: $${paymentAmount.toLocaleString('es-CO')}` : '';
        const anticipoText = `\n💳 Anticipo requerido: $${finalAmount.toLocaleString('es-CO')} (${paymentPercentage}% del total)`;
        if (paymentUrl) {
          reply += `${totalText}${anticipoText}\n\n🔗 Link de pago: ${paymentUrl}`;
        } else {
          reply += `${totalText}${anticipoText}`;
        }
      }

      return {
        reply,
        newState: {
          stage: 'completed',
          collectedData: {},
          conversationHistory: context.conversationHistory,
        },
        missingFields: [], // no reportar faltantes al completar
      };
    } catch (error) {
      console.error('Error creando reserva:', error);
      return {
        reply: await this.messagesTemplates.getError(companyType),
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
        },
      };
    }
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
}

