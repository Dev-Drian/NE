import { Injectable } from '@nestjs/common';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../availability/availability.service';
import { MessagesTemplatesService } from '../messages-templates/messages-templates.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { ProcessMessageDto } from './dto/process-message.dto';
import { DetectionResult } from './dto/detection-result.dto';

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
  ) {}

  async processMessage(dto: ProcessMessageDto): Promise<ProcessMessageResponse> {
    // 1. VALIDAR QUE LA EMPRESA EXISTE (CRÍTICO - HACER PRIMERO)
    const company = await this.companies.findOne(dto.companyId);
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

    // 3. Cargar contexto desde Redis
    const context = await this.conversations.getContext(userId, dto.companyId);

    // 4. Agregar mensaje del usuario al historial
    await this.conversations.addMessage(userId, dto.companyId, 'user', dto.message);

    // 5. LÓGICA CONTEXTUAL: Si estamos en modo "collecting" con intención "reservar"
    // debemos forzar la continuidad de la reserva, PERO solo si el mensaje no es un saludo
    const isContinuingReservation = 
      context.stage === 'collecting' && context.lastIntention === 'reservar';
    
    // Detectar primero si es un saludo (tiene máxima prioridad y resetea el contexto)
    const greetingKeywords = ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi'];
    const lowerMessage = dto.message.toLowerCase();
    
    // Normalizar caracteres para mejor matching (quitar acentos)
    const normalizeText = (text: string) => {
      return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    };
    const normalizedMessage = normalizeText(lowerMessage);
    
    const isGreeting = greetingKeywords.some(keyword => 
      normalizedMessage.includes(normalizeText(keyword))
    );
    
    // Detectar si pregunta por productos/menú/servicios (PRIORIDAD ALTA)
    const productKeywords = ['menu', 'productos', 'que tienen', 'opciones', 'carta', 'que hay', 'que venden', 'que ofrecen'];
    const asksForProducts = productKeywords.some(keyword => 
      normalizedMessage.includes(keyword)
    );
    
    // Detectar si hay palabras de consulta específicas de horarios/info general (EXCLUIR consultas de productos)
    const consultaKeywords = ['horario', 'horarios', 'abren', 'cierran', 'atencion', 'que dias', 'cual es el horario', 'cuando abren', 'direccion', 'ubicacion', 'donde estan'];
    const hasConsultaKeywords = consultaKeywords.some(keyword => 
      normalizedMessage.includes(keyword)
    ) && !asksForProducts; // NO activar si pregunta por productos

    // Si pregunta por precio específico de un producto
    const priceQuestions = ['cuanto cuesta', 'precio de', 'precio del', 'cuanto vale', 'costo de', 'costo del'];
    const asksForPrice = priceQuestions.some(keyword => normalizedMessage.includes(keyword));
    
    if (asksForPrice && !isContinuingReservation) {
      const config = company.config as any;
      const products = config?.products || [];
      
      // Buscar el producto mencionado
      const foundProduct = products.find((p: any) => 
        lowerMessage.includes(p.name.toLowerCase())
      );
      
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
    
    // Si pregunta por productos y NO está en proceso de reserva, mostrar lista
    if (asksForProducts && !isContinuingReservation) {
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
        
        reply += `¿Te gustaría hacer una reserva? 😊`;
        
        await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);
        return {
          reply,
          intention: 'consultar',
          confidence: 1.0,
          conversationState: context.stage,
        };
      }
    }

    let detection: DetectionResult;

    if (isGreeting && !hasConsultaKeywords && !asksForProducts && !lowerMessage.includes('reservar') && !lowerMessage.includes('reserva') && !lowerMessage.includes('cita')) {
      // Si es SOLO un saludo sin otras intenciones, detectar como "saludar"
      detection = {
        intention: 'saludar',
        confidence: 1.0,
      };
    } else if (hasConsultaKeywords && !lowerMessage.includes('reservar') && !lowerMessage.includes('reserva')) {
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
        detection.confidence = Math.max(detection.confidence, 0.7);
      }
    } else {
      // Flujo normal: intentar capas 1, 2, 3
      // 4. CAPA 1: Intentar detección rápida
      detection = await this.layer1.detect(dto.message, dto.companyId);

      // 5. Si no hay confianza suficiente → CAPA 2
      if (detection.confidence < 0.85) {
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
      } else if (detection.confidence < 0.6) {
        // Si aún no hay confianza → CAPA 3 (OpenAI)
        const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
        if (layer3Detection.confidence > detection.confidence) {
          detection = layer3Detection;
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

    // 9. Procesar según intención
    let reply: string;
    let newState = { ...context };

    if (detection.intention === 'saludar') {
      reply = await this.messagesTemplates.getGreeting(company.type, company.name);
      // Resetear contexto completamente cuando es un saludo (inicia nueva conversación)
      newState = {
        stage: 'idle',
        collectedData: {},
        conversationHistory: context.conversationHistory, // Mantener historial pero resetear estado
        lastIntention: undefined,
      };
    } else if (detection.intention === 'reservar') {
      const result = await this.handleReservation(detection, context, { ...dto, userId }, company.type);
      reply = result.reply;
      newState = result.newState;
      // Usar los missingFields calculados si están disponibles
      if (result.missingFields) {
        detection.missingFields = result.missingFields;
      }
    } else if (detection.intention === 'cancelar') {
      reply = detection.suggestedReply || await this.messagesTemplates.getReservationCancel(company.type);
      newState.stage = 'idle';
    } else if (detection.intention === 'consultar') {
      const config = company.config as any;
      const hoursText = this.formatHours(config?.hours);
      
      // Si preguntan por servicios y hay servicios configurados, mostrarlos
      const lowerMessage = dto.message.toLowerCase();
      const askingAboutServices = lowerMessage.includes('servicios') || 
                                  lowerMessage.includes('tratamientos') || 
                                  lowerMessage.includes('qué servicios') ||
                                  lowerMessage.includes('cuáles son') ||
                                  lowerMessage.includes('que ofrecen');
      
      if (askingAboutServices && config?.services) {
        const servicesList = Object.entries(config.services)
          .map(([key, value]: [string, any]) => `• ${value.name}`)
          .join('\n');
        reply = `Ofrecemos los siguientes servicios:\n\n${servicesList}\n\n¿Te gustaría agendar una cita?`;
      } else {
        reply = detection.suggestedReply || await this.messagesTemplates.getReservationQuery(company.type, hoursText);
      }
      
      // NO resetear stage si estamos en medio de una reserva
      // Solo cambiar a idle si no estábamos recopilando datos
      if (context.stage !== 'collecting') {
        newState.stage = 'idle';
      }
    } else {
      reply = detection.suggestedReply || await this.messagesTemplates.getError(company.type);
      newState.stage = 'idle';
    }

    // 10. Guardar estado actualizado
    await this.conversations.saveContext(userId, dto.companyId, newState);

    // 11. Agregar respuesta al historial
    await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);

    // 12. Si la reserva se completó, crear/buscar conversación en BD para pagos
    let conversationId = `${userId}_${dto.companyId}`;
    if (newState.stage === 'completed' && detection.intention === 'reservar') {
      conversationId = await this.conversations.findOrCreateConversation(userId, dto.companyId);
    }

    // 13. Retornar respuesta
    return {
      reply,
      intention: detection.intention,
      confidence: detection.confidence,
      missingFields: detection.missingFields,
      conversationState: newState.stage,
      conversationId,
    };
  }

  private async handleReservation(
    detection: DetectionResult,
    context: any,
    dto: ProcessMessageDto,
    companyType: string,
  ): Promise<{ reply: string; newState: any; missingFields?: string[] }> {
    const settings = await this.messagesTemplates.getReservationSettings(companyType);
    const missingFieldsLabels = await this.messagesTemplates.getMissingFieldsLabels(companyType);
    
    // Obtener configuración de la empresa para validar servicios
    const company = await this.companies.findOne(dto.companyId);
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

    // Determinar qué falta - guests es opcional según el tipo
    const required = ['date', 'time', 'phone'];
    if (settings.requireGuests) {
      required.push('guests');
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
      await this.reservations.create({
        company: { connect: { id: dto.companyId } },
        userId: dto.userId,
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests || settings.defaultGuests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service,
        status: 'confirmed',
      });

      const reply = await this.messagesTemplates.getReservationConfirm(companyType, {
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests,
        phone: collected.phone,
        service: collected.service,
        serviceName: collected.service && availableServices[collected.service]?.name,
      });

      return {
        reply,
        newState: {
          stage: 'completed',
          collectedData: {},
          conversationHistory: context.conversationHistory,
        },
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

