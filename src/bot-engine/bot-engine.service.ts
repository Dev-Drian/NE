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
    // MEJORADO: Incluir todas las variantes de "servicios", "tratamientos", "menú"
    const productKeywords = [
      'menu', 'menú', 'carta', 'productos', 'tratamientos', 
      'servicios', 'servicio', 'qué tienen', 'que tienen', 
      'qué ofrecen', 'que ofrecen', 'qué hay', 'que hay',
      'opciones', 'catalogo', 'catálogo', 'lista de',
      'que servicios', 'qué servicios', 'cuales servicios', 'cuáles servicios',
      'que tratamientos', 'qué tratamientos', 'cuales tratamientos',
      'que productos', 'qué productos', 'cuales productos',
      'cuales son', 'cuáles son', 'que venden', 'qué venden'
    ];
    // Normalizar también el mensaje sin acentos para mejor matching
    // También normalizar las keywords para hacer match sin importar acentos
    const asksForProducts = productKeywords.some(keyword => {
      const normalizedKeyword = normalizeText(keyword);
      return normalizedMessage.includes(normalizedKeyword) || lowerMessage.includes(keyword);
    });
    
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
    
    // Si pregunta por productos/servicios y NO está en proceso de reserva, mostrar TODO bien formateado
    if (asksForProducts && !isContinuingReservation) {
      const config = company.config as any;
      const products = config?.products || [];
      const services = config?.services || {};
      
      if (products.length > 0 || Object.keys(services).length > 0) {
        let reply = '';
        
        // 1. Mostrar PRODUCTOS/TRATAMIENTOS/MENÚ primero
        if (products.length > 0) {
          reply += `📋 **${company.type === 'restaurant' ? '🍽️ Nuestro Menú' : company.type === 'clinic' ? '🦷 Nuestros Tratamientos' : '📦 Nuestros Productos'}:**\n\n`;
          
          // Agrupar por categoría
          const grouped: any = {};
          products.forEach((p: any) => {
            if (!grouped[p.category]) grouped[p.category] = [];
            grouped[p.category].push(p);
          });
          
          for (const [category, items] of Object.entries(grouped)) {
            const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
            reply += `**${categoryName}:**\n`;
            (items as any[]).forEach((item: any) => {
              const price = new Intl.NumberFormat('es-CO', { 
                style: 'currency', 
                currency: 'COP', 
                minimumFractionDigits: 0 
              }).format(item.price);
              reply += `  • ${item.name} - ${price}`;
              if (item.duration) reply += ` ⏱️ ${item.duration} min`;
              if (item.description) reply += `\n    ${item.description}`;
              reply += `\n`;
            });
            reply += `\n`;
          }
        }
        
        // 2. Mostrar SERVICIOS después (si existen)
        if (Object.keys(services).length > 0) {
          if (products.length > 0) {
            reply += `\n---\n\n`;
          }
          reply += `🛎️ **Tipos de ${company.type === 'restaurant' ? 'Reserva' : 'Cita'} Disponibles:**\n\n`;
          
          Object.entries(services).forEach(([key, value]: [string, any]) => {
            if (value.enabled) {
              reply += `**${value.name}**\n`;
              if (value.description) reply += `  ${value.description}\n`;
              
              // Información adicional del servicio
              const details: string[] = [];
              if (value.minAdvanceHours) {
                details.push(`⏰ Mínimo ${value.minAdvanceHours} horas de anticipación`);
              }
              if (value.minAdvanceMinutes) {
                const hours = Math.floor(value.minAdvanceMinutes / 60);
                const mins = value.minAdvanceMinutes % 60;
                if (hours > 0) {
                  details.push(`⏰ Mínimo ${hours}h ${mins > 0 ? mins + 'min' : ''} de anticipación`);
                } else {
                  details.push(`⏰ Mínimo ${value.minAdvanceMinutes} minutos de anticipación`);
                }
              }
              if (value.requiresPayment) {
                details.push(`💳 Requiere pago anticipado`);
              }
              if (value.requiresProducts) {
                details.push(`📋 Requiere seleccionar productos`);
              }
              if (value.deliveryFee) {
                const fee = new Intl.NumberFormat('es-CO', { 
                  style: 'currency', 
                  currency: 'COP', 
                  minimumFractionDigits: 0 
                }).format(value.deliveryFee);
                details.push(`🚚 Costo de envío: ${fee}`);
              }
              if (value.minOrderAmount) {
                const minAmount = new Intl.NumberFormat('es-CO', { 
                  style: 'currency', 
                  currency: 'COP', 
                  minimumFractionDigits: 0 
                }).format(value.minOrderAmount);
                details.push(`💰 Pedido mínimo: ${minAmount}`);
              }
              
              if (details.length > 0) {
                reply += details.map(d => `  ${d}`).join('\n') + '\n';
              }
              reply += `\n`;
            }
          });
        }
        
        // 3. Pregunta final
        reply += `\n¿Te gustaría hacer una ${company.type === 'restaurant' ? 'reserva' : 'cita'}? 😊`;
        
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
      // Implementar cancelación real de reservas
      reply = await this.handleCancellation(dto, context, company);
      newState.stage = 'idle';
    } else if (detection.intention === 'consultar') {
      const config = company.config as any;
      const hoursText = this.formatHours(config?.hours);
      
      // Detectar si preguntan específicamente por horarios SOLAMENTE
      const lowerMsg = dto.message.toLowerCase();
      const askingOnlyAboutHours = (lowerMsg.includes('horario') || 
                                    lowerMsg.includes('abren') || 
                                    lowerMsg.includes('cierran') || 
                                    lowerMsg.includes('cuando')) &&
                                   !lowerMsg.includes('servicios') &&
                                   !lowerMsg.includes('tratamientos') &&
                                   !lowerMsg.includes('menu') &&
                                   !lowerMsg.includes('menú') &&
                                   !lowerMsg.includes('producto') &&
                                   !lowerMsg.includes('que tienen') &&
                                   !lowerMsg.includes('qué tienen') &&
                                   !lowerMsg.includes('carta') &&
                                   !lowerMsg.includes('ofrecen');
      
      let reply = '';
      let hasContent = false;
      
      // PRIMERO: Si NO preguntan SOLO por horarios y hay productos, mostrarlos SIEMPRE
      if (!askingOnlyAboutHours && config?.products && Array.isArray(config.products) && config.products.length > 0) {
        reply += `📋 **${company.type === 'restaurant' ? '🍽️ Nuestro Menú' : company.type === 'clinic' ? '🦷 Nuestros Tratamientos' : '📦 Nuestros Productos'}:**\n\n`;
        
        // Agrupar por categoría
        const grouped: any = {};
        config.products.forEach((p: any) => {
          if (!grouped[p.category]) grouped[p.category] = [];
          grouped[p.category].push(p);
        });
        
        for (const [category, items] of Object.entries(grouped)) {
          const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
          reply += `**${categoryName}:**\n`;
          (items as any[]).forEach((item: any) => {
            const price = new Intl.NumberFormat('es-CO', { 
              style: 'currency', 
              currency: 'COP', 
              minimumFractionDigits: 0 
            }).format(item.price);
            reply += `  • ${item.name} - ${price}`;
            if (item.duration) reply += ` ⏱️ ${item.duration} min`;
            if (item.description) reply += `\n    ${item.description}`;
            reply += `\n`;
          });
          reply += `\n`;
        }
        hasContent = true;
      }
      
      // SEGUNDO: Mostrar services SIEMPRE si existen (junto con productos o solos)
      if (config?.services && Object.keys(config.services).length > 0 && !askingOnlyAboutHours) {
        if (hasContent) reply += `\n---\n\n`;
        reply += `🛎️ **Tipos de ${company.type === 'restaurant' ? 'Reserva' : 'Cita'} Disponibles:**\n\n`;
        
        Object.entries(config.services).forEach(([key, value]: [string, any]) => {
          if (value.enabled) {
            reply += `**${value.name}**\n`;
            if (value.description) reply += `  ${value.description}\n`;
            
            // Información adicional del servicio
            const details: string[] = [];
            if (value.minAdvanceHours) {
              details.push(`⏰ Mínimo ${value.minAdvanceHours} horas de anticipación`);
            }
            if (value.minAdvanceMinutes) {
              const hours = Math.floor(value.minAdvanceMinutes / 60);
              const mins = value.minAdvanceMinutes % 60;
              if (hours > 0) {
                details.push(`⏰ Mínimo ${hours}h ${mins > 0 ? mins + 'min' : ''} de anticipación`);
              } else {
                details.push(`⏰ Mínimo ${value.minAdvanceMinutes} minutos de anticipación`);
              }
            }
            if (value.requiresPayment) {
              details.push(`💳 Requiere pago anticipado`);
            }
            if (value.requiresProducts) {
              details.push(`📋 Requiere seleccionar productos`);
            }
            if (value.deliveryFee) {
              const fee = new Intl.NumberFormat('es-CO', { 
                style: 'currency', 
                currency: 'COP', 
                minimumFractionDigits: 0 
              }).format(value.deliveryFee);
              details.push(`🚚 Costo de envío: ${fee}`);
            }
            if (value.minOrderAmount) {
              const minAmount = new Intl.NumberFormat('es-CO', { 
                style: 'currency', 
                currency: 'COP', 
                minimumFractionDigits: 0 
              }).format(value.minOrderAmount);
              details.push(`💰 Pedido mínimo: ${minAmount}`);
            }
            
            if (details.length > 0) {
              reply += details.map(d => `  ${d}`).join('\n') + '\n';
            }
            reply += `\n`;
          }
        });
        hasContent = true;
      }
      
      // TERCERO: Agregar horarios SOLO si preguntan explícitamente
      if (askingOnlyAboutHours) {
        if (hasContent) reply += `---\n\n`;
        reply += `🕐 **Horarios de Atención:**\n${hoursText}\n\n`;
        hasContent = true;
      }
      
      // Si no se generó contenido específico, usar respuesta por defecto
      if (!hasContent) {
        reply = detection.suggestedReply || await this.messagesTemplates.getReservationQuery(company.type, hoursText);
      } else {
        // Agregar pregunta final si generamos contenido
        reply += `\n¿Te gustaría hacer una ${company.type === 'restaurant' ? 'reserva' : 'cita'}? 😊`;
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
    
    console.log(`🔍 [DEBUG] hasMultipleServices: ${hasMultipleServices}, extracted.service: ${extracted?.service}, dto.message: ${dto.message}`);
    
    // FALLBACK: Si hay múltiples servicios pero no se extrajo ninguno, intentar detectar por keywords en el mensaje original
    if (hasMultipleServices && !extracted.service && dto.message) {
      const message = dto.message.toLowerCase().trim();
      console.log(`🔍 [FALLBACK] Intentando detectar servicio del mensaje: "${dto.message}"`);
      console.log(`🔍 [FALLBACK] extracted.service actual:`, extracted.service);
      console.log(`🔍 [FALLBACK] Servicios disponibles:`, Object.keys(availableServices));
      
      // Generar keywords genéricos para cada servicio basándose en su nombre y key
      const normalizeForMatching = (text: string) => {
        return text
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
          .toLowerCase()
          .trim();
      };
      
      const normalizedMessage = normalizeForMatching(message);
      
      // Función para generar sinónimos comunes basándose en el nombre del servicio
      const generateServiceSynonyms = (key: string, serviceName: string): string[] => {
        const normalizedKey = normalizeForMatching(key);
        const normalizedName = normalizeForMatching(serviceName);
        
        const synonyms: string[] = [
          normalizedKey, // La key siempre es un sinónimo
          normalizedName, // El nombre siempre es un sinónimo
        ];
        
        // Extraer palabras clave del nombre del servicio
        const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
        synonyms.push(...nameWords);
        
        // Sinónimos comunes basados en el nombre
        if (normalizedName.includes('domicilio') || normalizedKey.includes('domicilio')) {
          synonyms.push('pedir a domicilio', 'pedido a domicilio', 'delivery', 'envío', 'a domicilio', 'pedir', 'pedido');
        }
        if (normalizedName.includes('mesa') || normalizedKey.includes('mesa')) {
          synonyms.push('reservar mesa', 'mesa en restaurante', 'comer aquí', 'en el restaurante');
        }
        if (normalizedName.includes('limpieza') || normalizedKey.includes('limpieza')) {
          synonyms.push('profilaxis', 'limpieza dental');
        }
        if (normalizedName.includes('consulta') || normalizedKey.includes('consulta')) {
          synonyms.push('revisión', 'cita', 'consulta médica');
        }
        if (normalizedName.includes('ortodoncia') || normalizedKey.includes('ortodoncia')) {
          synonyms.push('brackets', 'aparatos', 'corrección dental');
        }
        if (normalizedName.includes('blanqueamiento') || normalizedKey.includes('blanqueamiento')) {
          synonyms.push('blanquear', 'blanqueamiento dental', 'estética dental');
        }
        
        // Agregar palabras del nombre con artículos comunes
        nameWords.forEach(word => {
          synonyms.push(`la ${word}`, `el ${word}`, `una ${word}`, `un ${word}`);
        });
        
        return [...new Set(synonyms)]; // Eliminar duplicados
      };
      
      // Buscar coincidencias para cada servicio (ordenar por especificidad)
      const serviceMatches: Array<{ key: string; score: number; matchedKeyword: string }> = [];
      
      for (const [key, value] of Object.entries(availableServices)) {
        const serviceName = (value as any)?.name || '';
        const serviceKeywords = generateServiceSynonyms(key, serviceName);
        
        // Buscar coincidencias
        let bestMatch: { keyword: string; score: number } | null = null;
        
        for (const keyword of serviceKeywords) {
          const normalizedKeyword = normalizeForMatching(keyword);
          
          // Coincidencia exacta (mayor puntuación)
          if (normalizedMessage === normalizedKeyword) {
            bestMatch = { keyword, score: 10 };
            break;
          }
          
          // Coincidencia de frase completa
          if (normalizedMessage.includes(normalizedKeyword) && normalizedKeyword.length > 3) {
            const score = normalizedKeyword.length; // Frases más largas tienen mayor puntuación
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { keyword, score };
            }
          }
          
          // Coincidencia de palabra dentro de la frase
          const messageWords = normalizedMessage.split(/\s+/);
          const keywordWords = normalizedKeyword.split(/\s+/);
          
          if (keywordWords.every(kw => messageWords.some(mw => mw.includes(kw) || kw.includes(mw)))) {
            const score = normalizedKeyword.length * 0.5; // Menor puntuación para palabras individuales
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { keyword, score };
            }
          }
        }
        
        if (bestMatch) {
          serviceMatches.push({
            key,
            score: bestMatch.score,
            matchedKeyword: bestMatch.keyword,
          });
          console.log(`✅ [FALLBACK] Servicio "${key}" coincidió con keyword "${bestMatch.keyword}" (score: ${bestMatch.score})`);
        }
      }
      
      // Ordenar por puntuación y tomar el mejor
      if (serviceMatches.length > 0) {
        serviceMatches.sort((a, b) => b.score - a.score);
        const bestMatch = serviceMatches[0];
        extracted.service = bestMatch.key;
        console.log(`✅ [FALLBACK] Servicio detectado: "${bestMatch.key}" del mensaje: "${dto.message}" (matched: "${bestMatch.matchedKeyword}")`);
      } else {
        console.log(`⚠️ [FALLBACK] No se pudo detectar servicio del mensaje: "${dto.message}"`);
        console.log(`⚠️ [FALLBACK] Mensaje procesado: "${normalizedMessage}"`);
      }
    }
    
    // Agregar el servicio detectado por fallback si existe
    if (extracted.service) {
      console.log(`✅ [DEBUG] Servicio detectado en extracted.service: "${extracted.service}"`);
    }
    
    const collected = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => value !== null && value !== undefined)
      ),
    };
    
    // Log final para debug
    console.log(`✅ [DEBUG] collected.service final: "${collected.service}"`);
    console.log(`✅ [DEBUG] collected object:`, JSON.stringify(collected, null, 2));

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
    
    // Si el servicio fue detectado por fallback, asegurar que no esté en missing
    if (collected.service && missing.includes('service')) {
      missing.splice(missing.indexOf('service'), 1);
      console.log(`✅ [FALLBACK] Servicio "${collected.service}" detectado y removido de missingFields`);
    }
    
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

  private async handleCancellation(
    dto: ProcessMessageDto,
    context: any,
    company: any,
  ): Promise<string> {
    try {
      // Importar DateHelper una sola vez al inicio
      const { DateHelper } = await import('../common/date-helper');
      
      // VALIDACIÓN 1: Verificar que el usuario existe
      if (!dto.userId) {
        return 'No puedo identificar tu usuario. Por favor proporciona tu información de contacto.';
      }

      // Buscar reservas del usuario en esta empresa
      const userReservations = await this.reservations.findByUserAndCompany(
        dto.userId,
        dto.companyId,
      );

      // VALIDACIÓN 2: Filtrar solo reservas FUTURAS y activas (no canceladas, no pasadas)
      const today = DateHelper.getTodayString();
      const now = DateHelper.getNow();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const activeReservations = userReservations.filter(
        (r) => r.status !== 'cancelled' && 
               (r.date > today || (r.date === today && r.time > currentTime))
      );

      if (activeReservations.length === 0) {
        return `No tienes reservas futuras activas para cancelar en ${company.name}.`;
      }

      // Si solo hay una reserva, PEDIR CONFIRMACIÓN primero
      if (activeReservations.length === 1) {
        const reservation = activeReservations[0];
        const fechaFormateada = DateHelper.formatDateReadable(reservation.date);
        
        // VALIDACIÓN 3: Verificar si el mensaje confirma la cancelación
        const lowerMsg = dto.message.toLowerCase();
        const confirmsCancel = lowerMsg.includes('sí') || 
                              lowerMsg.includes('si') ||
                              lowerMsg.includes('confirmo') ||
                              lowerMsg.includes('seguro') ||
                              lowerMsg.includes('adelante') ||
                              (context.pendingCancellation === reservation.id);
        
        if (!confirmsCancel && !context.pendingCancellation) {
          // Guardar en contexto que hay cancelación pendiente
          context.pendingCancellation = reservation.id;
          await this.conversations.saveContext(dto.userId, dto.companyId, context);
          
          return `⚠️ ¿Estás seguro que deseas cancelar tu ${company.type === 'restaurant' ? 'reserva' : 'cita'} del ${fechaFormateada} a las ${reservation.time}?\n\nResponde "sí" para confirmar la cancelación.`;
        }
        
        // Proceder con la cancelación
        await this.reservations.update(reservation.id, { status: 'cancelled' });
        delete context.pendingCancellation;
        await this.conversations.saveContext(dto.userId, dto.companyId, context);
        
        return `✅ Tu ${company.type === 'restaurant' ? 'reserva' : 'cita'} del ${fechaFormateada} a las ${reservation.time} ha sido cancelada exitosamente.\n\nSi cambias de opinión, puedes hacer una nueva reserva cuando quieras. 😊`;
      }

      // Si hay múltiples reservas, listarlas y pedir confirmación
      const reservationsList = activeReservations
        .slice(0, 5) // Mostrar máximo 5
        .map((r, index) => {
          const fechaFormateada = DateHelper.formatDateReadable(r.date);
          return `${index + 1}. ${fechaFormateada} a las ${r.time}${r.service ? ` - ${r.service}` : ''}`;
        })
        .join('\n');

      // Intentar extraer número o fecha del mensaje
      const lowerMessage = dto.message.toLowerCase();
      const dateMatches = lowerMessage.match(/(mañana|hoy|ayer|el \d+|para el \d+)/);
      const numberMatch = lowerMessage.match(/\d+/);

      if (numberMatch) {
        // Si mencionó un número, intentar cancelar esa reserva
        const index = parseInt(numberMatch[0]) - 1;
        if (index >= 0 && index < activeReservations.length) {
          const reservation = activeReservations[index];
          await this.reservations.update(reservation.id, { status: 'cancelled' });
          
          const fechaFormateada = DateHelper.formatDateReadable(reservation.date);
          
          return `✅ Tu ${company.type === 'restaurant' ? 'reserva' : 'cita'} del ${fechaFormateada} a las ${reservation.time} ha sido cancelada exitosamente.`;
        }
      }

      // Si no pudo identificar cuál cancelar, listar opciones
      return `Tienes ${activeReservations.length} ${company.type === 'restaurant' ? 'reservas' : 'citas'} activas:\n\n${reservationsList}\n\nPor favor indica cuál deseas cancelar (número o fecha específica).`;
    } catch (error) {
      console.error('Error en handleCancellation:', error);
      return await this.messagesTemplates.getReservationCancel(company.type);
    }
  }
}

