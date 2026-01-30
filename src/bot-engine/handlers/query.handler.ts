import { Injectable, Logger } from '@nestjs/common';
import { AvailabilityService } from '../../availability/availability.service';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { ProductsService } from '../../products/products.service';
import { ServicesService } from '../../services/services.service';
import { KeywordDetectorService } from '../utils/keyword-detector.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class QueryHandler implements IIntentionHandler {
  private readonly logger = new Logger(QueryHandler.name);

  constructor(
    private availability: AvailabilityService,
    private messagesTemplates: MessagesTemplatesService,
    private productsService: ProductsService,
    private servicesService: ServicesService,  // ← NUEVO: Inyectar ServicesService
    private keywordDetector: KeywordDetectorService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, dto, company, userId } = context;

    const config = company.config as any;
    const hoursText = this.formatHours(config?.hours);
    let reply: string;
    
    // PRIORIDAD 0: Si es consulta de CATÁLOGO COMPLETO (queryType: 'catalog')
    // El usuario quiere ver el menú/carta/productos completos
    if (detection.extractedData?.queryType === 'catalog') {
      reply = await this.buildCatalogResponse(company);
      
      return {
        reply,
        newState: {
          ...conversationContext,
          stage: 'idle' as const,
        },
      };
    }
    
    // PRIORIDAD 0.5: Si es una consulta de disponibilidad específica (queryType: 'availability')
    // Mostrar horarios disponibles para el servicio mencionado
    if (detection.extractedData?.queryType === 'availability') {
      const extracted = detection.extractedData;
      
      // Buscar el servicio mencionado
      let serviceName: string | null = null;
      let serviceKey: string | null = null;
      
      if (extracted.service) {
        // Si OpenAI extrajo el servicio directamente
        serviceKey = extracted.service;
        // Buscar servicio en la tabla Service (BD)
        const serviceFromDB = await this.servicesService.getServiceByKey(dto.companyId, serviceKey);
        serviceName = serviceFromDB?.name || serviceKey;
      } else {
        // Buscar el servicio en el mensaje usando keywords desde la tabla Service
        const detectedService = await this.servicesService.detectServiceFromMessage(dto.companyId, dto.message);
        if (detectedService) {
          serviceKey = detectedService.key;
          serviceName = detectedService.name;
        }
      }
      
      if (serviceKey && serviceName) {
        // Generar slots disponibles para los próximos días
        const today = new Date();
        const availableSlots: { date: string; times: string[] }[] = [];
        
        // Buscar disponibilidad para los próximos 7 días
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() + i);
          const dateStr = checkDate.toISOString().split('T')[0];
          
          // Generar horarios posibles (8am - 6pm, cada hora)
          const possibleTimes = [
            '08:00', '09:00', '10:00', '11:00', '12:00',
            '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
          ];
          
          const availableTimes: string[] = [];
          for (const time of possibleTimes) {
            try {
              const check = await this.availability.check(dto.companyId, {
                date: dateStr,
                time: time,
                guests: 1,
                userId: userId,
                service: serviceKey,
              });
              
              if (check.isAvailable) {
                availableTimes.push(time);
              }
            } catch (error) {
              // Si falla, continuar con el siguiente horario
            }
          }
          
          if (availableTimes.length > 0) {
            availableSlots.push({ date: dateStr, times: availableTimes });
          }
          
          // Si ya tenemos 3 días con disponibilidad, es suficiente
          if (availableSlots.length >= 3) {
            break;
          }
        }
        
        if (availableSlots.length > 0) {
          const { DateHelper } = await import('../../common/date-helper');
          reply = `📅 **Disponibilidad para ${serviceName}:**\n\n`;
          
          for (const slot of availableSlots) {
            const dateReadable = DateHelper.formatDateReadable(slot.date);
            reply += `**${dateReadable}:**\n`;
            reply += slot.times.join(', ') + '\n\n';
          }
          
          reply += '¿Te gustaría hacer una reserva para alguno de estos horarios? 😊';
        } else {
          reply = `Lo siento, no encontré disponibilidad para ${serviceName} en los próximos días. ¿Te gustaría que te ayude con otra cosa? 😔`;
        }
        
        return {
          reply,
          newState: {
            ...conversationContext,
            stage: 'idle' as const,
          },
        };
      }
      // Si no encontramos el servicio, continuar con el flujo normal
    }
    
    // PRIORIDAD 1: Si OpenAI generó un suggestedReply con contexto relevante, usarlo
    // OpenAI ya analizó pagos pendientes, reservas activas, historial completo
    if (detection.suggestedReply && 
        (detection.suggestedReply.length > 50 || // Respuesta detallada de OpenAI
         detection.confidence >= 0.8 || // Alta confianza
         conversationContext.conversationHistory?.length > 0)) { // Hay historial
      // Verificar si el suggestedReply parece contextualizado (no es genérico)
      const isContextualized = detection.suggestedReply.includes('pago') || 
                               detection.suggestedReply.includes('reserva') ||
                               detection.suggestedReply.includes('anticipo') ||
                               detection.suggestedReply.includes('link') ||
                               detection.suggestedReply.length > 80;
      
      if (isContextualized) {
        return {
          reply: detection.suggestedReply,
          newState: {
            ...conversationContext,
            stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
          },
        };
      }
    }
    
    // PRIORIDAD 2: Si preguntan por información/detalles de un producto específico
    // Usar los datos extraídos por OpenAI en lugar de solo keywords
    const allProducts = await this.productsService.findByCompany(company.id);
    
    // 1. Primero revisar si OpenAI extrajo un producto en sus datos
    const extractedProducts = detection.extractedData?.products || [];
    if (extractedProducts.length > 0) {
      const productId = extractedProducts[0]?.id || extractedProducts[0];
      const mentionedProduct = allProducts.find(p => p.id === productId || p.name === productId);
      
      if (mentionedProduct && mentionedProduct.description) {
        // Si el usuario está haciendo una pregunta (no una orden), mostrar detalles
        const isQuestion = dto.message.includes('?') || 
                          detection.extractedData?.queryType === 'availability' ||
                          this.keywordDetector.asksForDetails(dto.message) ||
                          this.keywordDetector.asksForPrice(dto.message);
        
        if (isQuestion) {
          reply = mentionedProduct.description;
          
          return {
            reply,
            newState: {
              ...conversationContext,
              stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
            },
          };
        }
      }
    }
    
    // 2. Fallback: Buscar por keywords si OpenAI no extrajo nada
    if (this.keywordDetector.asksForDetails(dto.message)) {
      const normalized = dto.message.toLowerCase();
      
      const mentionedProduct = allProducts.find(product => {
        const productName = product.name.toLowerCase();
        const keywords = product.keywords || [];
        
        if (normalized.includes(productName)) return true;
        return keywords.some(keyword => normalized.includes(keyword.toLowerCase()));
      });
      
      if (mentionedProduct && mentionedProduct.description) {
        reply = mentionedProduct.description;
        
        return {
          reply,
          newState: {
            ...conversationContext,
            stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
          },
        };
      }
    }
    
    // PRIORIDAD 3: Si preguntan por productos/servicios/menú, mostrar lista completa
    const askingAboutProducts = this.keywordDetector.asksForProducts(dto.message);
    
    if (askingAboutProducts) {
      reply = '';
      
      // Mostrar SOLO servicios disponibles desde BD (tabla Service)
      // Los productos se muestran cuando el usuario elige un servicio específico
      const servicesFromDB = await this.servicesService.getAvailableServices(company.id);
      
      if (servicesFromDB.length > 0) {
        reply = await this.formatServicesFromDB(servicesFromDB, company);
        reply += '\n\n¿Qué servicio te interesa? 😊';
        
        return {
          reply,
          newState: {
            ...conversationContext,
            stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
          },
        };
      }
      // Si no hay servicios, continuar con el flujo normal
    }
    
    // PRIORIDAD 3: Verificar si la consulta incluye fecha/hora específica (consulta de disponibilidad)
    const extracted = detection.extractedData || {};
    const hasSpecificDate = extracted.date !== null && extracted.date !== undefined;
    const hasSpecificTime = extracted.time !== null && extracted.time !== undefined;
    
    // Si tiene fecha/hora específica, verificar disponibilidad real
    if (hasSpecificDate && hasSpecificTime) {
      const available = await this.availability.check(dto.companyId, {
        date: extracted.date!,
        time: extracted.time!,
        guests: extracted.guests || 1,
        userId: userId,
        service: extracted.service,
      });
      
      if (available.isAvailable) {
        const dateReadable = await import('../../common/date-helper').then(m => m.DateHelper.formatDateReadable(extracted.date!));
        reply = `✅ Sí, tenemos disponibilidad para el ${dateReadable} a las ${extracted.time}. ¿Te gustaría hacer una reserva?`;
      } else {
        reply = available.message || 'No hay disponibilidad en ese horario.';
        if (available.alternatives && available.alternatives.length > 0) {
          reply += ` ¿Te sirve ${available.alternatives[0]}?`;
        }
      }
    } else {
      // Fallback: usar suggestedReply de OpenAI o respuesta genérica
      reply = detection.suggestedReply || await this.messagesTemplates.getReservationQuery(company.type, hoursText);
    }
    
    // VALIDACIÓN: NUNCA retornar respuesta vacía
    if (!reply || reply.trim().length === 0) {
      reply = `¿En qué puedo ayudarte? Puedo ayudarte a hacer una reserva, consultar disponibilidad o resolver cualquier duda. 😊`;
    }
    
    // NO resetear stage si estamos en medio de una reserva
    // Solo cambiar a idle si no estábamos recopilando datos
    const newState = {
      ...conversationContext,
      stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
    };

    return {
      reply,
      newState,
    };
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
   * Construye respuesta con el catálogo completo de productos/servicios
   * Dinámico según el tipo de empresa (restaurante, spa, gym, etc.)
   */
  private async buildCatalogResponse(company: any): Promise<string> {
    // 1. Obtener servicios de la tabla Service (BD)
    const servicesFromDB = await this.servicesService.getAvailableServices(company.id);
    
    // Determinar terminología según tipo de empresa
    const terminology = this.getTerminology(company.type);
    
    // 3. Si no hay servicios disponibles
    if (servicesFromDB.length === 0) {
      return `Lo siento, actualmente no tenemos ${terminology.items} disponibles. ¿En qué más puedo ayudarte? 😊`;
    }
    
    // 4. Construir respuesta - SOLO SERVICIOS
    // Los productos se muestran cuando el usuario elige un servicio específico
    let reply = `📋 **${terminology.catalog} de ${company.name}**\n\n`;
    
    // Mostrar servicios desde la tabla Service
    reply += await this.formatServicesFromDB(servicesFromDB, company);
    
    reply += `\n\n¿Te gustaría información sobre algún ${terminology.item} en específico o hacer una reserva? 😊`;
    
    return reply;
  }
  
  /**
   * Formatea servicios desde la tabla Service según tipo de empresa
   */
  private async formatServicesFromDB(services: any[], company: any): Promise<string> {
    if (!services || services.length === 0) {
      return '';
    }

    let reply = '';
    const companyType = company.type;

    if (companyType === 'clinic') {
      reply = `🏥 **Servicios de ${company.name}:**\n\n`;
      for (const service of services) {
        const price = service.basePrice 
          ? this.formatPrice(service.basePrice)
          : 'Consultar';
        const duration = service.config?.duration 
          ? `⏱️ ${service.config.duration} min` 
          : '';
        
        reply += `• **${service.name}** - ${price}\n`;
        if (service.description) {
          reply += `  _${service.description}_\n`;
        }
        if (duration) {
          reply += `  ${duration}\n`;
        }
      }
    } else if (companyType === 'spa') {
      reply = `🧖 **Servicios de ${company.name}:**\n\n`;
      for (const service of services) {
        const price = service.basePrice 
          ? this.formatPrice(service.basePrice)
          : 'Consultar';
        const duration = service.config?.duration 
          ? `⏱️ ${service.config.duration} min` 
          : '';
        
        reply += `✨ **${service.name}** - ${price}\n`;
        if (service.description) {
          reply += `   _${service.description}_\n`;
        }
        if (duration) {
          reply += `   ${duration}\n`;
        }
      }
    } else if (companyType === 'restaurant') {
      reply = `🍽️ **Servicios de ${company.name}:**\n\n`;
      reply += `Te ofrecemos las siguientes opciones:\n\n`;
      
      for (const service of services) {
        let emoji = '📍';
        if (service.key === 'mesa') emoji = '🪑';
        else if (service.key === 'domicilio') emoji = '🛵';
        else if (service.key === 'recoger') emoji = '📦';

        reply += `${emoji} **${service.name}**\n`;
        if (service.description) {
          reply += `   _${service.description}_\n`;
        }
        
        // Mostrar info relevante del config
        if (service.config?.deliveryFee) {
          reply += `   💰 Costo de envío: ${this.formatPrice(service.config.deliveryFee)}\n`;
        }
        if (service.config?.minOrderAmount) {
          reply += `   📋 Pedido mínimo: ${this.formatPrice(service.config.minOrderAmount)}\n`;
        }
        if (service.config?.estimatedDeliveryTime) {
          reply += `   ⏱️ Tiempo estimado: ${service.config.estimatedDeliveryTime} min\n`;
        }
        reply += '\n';
      }
    } else if (companyType === 'chalet') {
      // ========== CHALET / FINCA VACACIONAL ==========
      reply = `🏡 **Servicios de ${company.name}:**\n\n`;
      reply += `¡Disfruta de nuestras fincas con piscina, jacuzzi y BBQ!\n\n`;
      
      for (const service of services) {
        let emoji = '🏠';
        if (service.key === 'alquiler_dia') emoji = '☀️';
        else if (service.key === 'alquiler_finde') emoji = '🌴';
        else if (service.key === 'alquiler_semana') emoji = '🏖️';
        else if (service.key === 'evento_especial') emoji = '🎉';

        const price = service.basePrice 
          ? this.formatPrice(service.basePrice)
          : 'Consultar';

        reply += `${emoji} **${service.name}** - ${price}\n`;
        if (service.description) {
          reply += `   _${service.description}_\n`;
        }
        
        // Info del config
        if (service.config?.maxGuests) {
          reply += `   👥 Capacidad: hasta ${service.config.maxGuests} personas\n`;
        }
        if (service.config?.checkIn && service.config?.checkOut) {
          reply += `   🕐 Check-in: ${service.config.checkIn} | Check-out: ${service.config.checkOut}\n`;
        }
        if (service.config?.includesPool || service.config?.includesJacuzzi || service.config?.includesBBQ) {
          const amenities = [];
          if (service.config?.includesPool) amenities.push('Piscina');
          if (service.config?.includesJacuzzi) amenities.push('Jacuzzi');
          if (service.config?.includesBBQ) amenities.push('BBQ');
          reply += `   ✨ Incluye: ${amenities.join(', ')}\n`;
        }
        if (service.config?.allowsPets) {
          reply += `   🐾 Acepta mascotas\n`;
        }
        reply += '\n';
      }
    } else if (companyType === 'clothing_store') {
      // ========== TIENDA DE ROPA ==========
      reply = `👗 **Servicios de ${company.name}:**\n\n`;
      reply += `¡Descubre las últimas tendencias en moda!\n\n`;
      
      for (const service of services) {
        let emoji = '🛍️';
        if (service.key === 'compra_tienda') emoji = '🏪';
        else if (service.key === 'compra_online') emoji = '📦';
        else if (service.key === 'apartado') emoji = '🔖';
        else if (service.key === 'personal_shopping') emoji = '👠';
        else if (service.key === 'alteraciones') emoji = '✂️';
        else if (service.key === 'consulta_disponibilidad') emoji = '🔍';

        const price = service.basePrice 
          ? this.formatPrice(service.basePrice)
          : '';

        reply += `${emoji} **${service.name}**${price ? ` - ${price}` : ''}\n`;
        if (service.description) {
          reply += `   _${service.description}_\n`;
        }
        
        // Info del config según el servicio
        if (service.config?.deliveryFee && service.config?.freeDeliveryThreshold) {
          reply += `   🚚 Envío: ${this.formatPrice(service.config.deliveryFee)} (Gratis desde ${this.formatPrice(service.config.freeDeliveryThreshold)})\n`;
        }
        if (service.config?.returnDays) {
          reply += `   ↩️ Devoluciones: ${service.config.returnDays} días\n`;
        }
        if (service.config?.maxHoldDays) {
          reply += `   📅 Tiempo de apartado: hasta ${service.config.maxHoldDays} días\n`;
        }
        if (service.config?.duration) {
          reply += `   ⏱️ Duración: ${service.config.duration} min\n`;
        }
        reply += '\n';
      }
    } else {
      // Genérico
      reply = `📋 **Servicios disponibles:**\n\n`;
      for (const service of services) {
        const price = service.basePrice 
          ? ` - ${this.formatPrice(service.basePrice)}` 
          : '';
        
        reply += `• **${service.name}**${price}\n`;
        if (service.description) {
          reply += `  _${service.description}_\n`;
        }
      }
    }

    return reply.trim();
  }
  
  /**
   * Construye catálogo desde config (fallback)
   */
  private buildCatalogFromConfig(products: any[], terminology: any): string {
    if (!Array.isArray(products) || products.length === 0) {
      return `Lo siento, actualmente no tenemos ${terminology.items} disponibles. ¿En qué más puedo ayudarte? 😊`;
    }
    
    let reply = `📋 **${terminology.catalog}:**\n\n`;
    
    // Agrupar por categoría
    const grouped: Record<string, any[]> = {};
    products.forEach((p: any) => {
      const cat = p.category || 'General';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    
    for (const [category, items] of Object.entries(grouped)) {
      const categoryTitle = category.charAt(0).toUpperCase() + category.slice(1);
      reply += `**${categoryTitle}:**\n`;
      
      items.forEach((item: any) => {
        reply += `• ${item.name}`;
        if (item.price) {
          reply += ` - ${this.formatPrice(item.price)}`;
        }
        if (item.duration) {
          reply += ` (${item.duration} min)`;
        }
        reply += '\n';
      });
      reply += '\n';
    }
    
    reply += `¿Te gustaría más información o hacer una reserva? 😊`;
    
    return reply;
  }
  
  /**
   * Obtiene terminología según el tipo de empresa
   */
  private getTerminology(companyType: string): { catalog: string; items: string; item: string; services: string } {
    const terminologies: Record<string, any> = {
      restaurant: {
        catalog: 'Menú',
        items: 'platos',
        item: 'plato',
        services: 'Servicios'
      },
      spa: {
        catalog: 'Servicios',
        items: 'tratamientos',
        item: 'tratamiento',
        services: 'Tratamientos'
      },
      gym: {
        catalog: 'Planes y Servicios',
        items: 'planes',
        item: 'plan',
        services: 'Planes'
      },
      clinic: {
        catalog: 'Servicios Médicos',
        items: 'servicios',
        item: 'servicio',
        services: 'Especialidades'
      },
      chalet: {
        catalog: 'Opciones de Alquiler',
        items: 'alquileres',
        item: 'alquiler',
        services: 'Tipos de Alquiler'
      },
      clothing_store: {
        catalog: 'Colección',
        items: 'prendas',
        item: 'prenda',
        services: 'Servicios'
      },
      default: {
        catalog: 'Catálogo',
        items: 'productos',
        item: 'producto',
        services: 'Servicios'
      }
    };
    
    return terminologies[companyType] || terminologies.default;
  }
  
  /**
   * Formatea precio en moneda colombiana
   */
  private formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(price);
  }
}
