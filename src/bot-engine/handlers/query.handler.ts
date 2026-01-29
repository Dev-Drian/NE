import { Injectable } from '@nestjs/common';
import { AvailabilityService } from '../../availability/availability.service';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { ProductsService } from '../../products/products.service';
import { KeywordDetectorService } from '../utils/keyword-detector.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class QueryHandler implements IIntentionHandler {
  constructor(
    private availability: AvailabilityService,
    private messagesTemplates: MessagesTemplatesService,
    private productsService: ProductsService,
    private keywordDetector: KeywordDetectorService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, dto, company, userId } = context;

    const config = company.config as any;
    const hoursText = this.formatHours(config?.hours);
    let reply: string;
    
    // PRIORIDAD 0: Si es una consulta de disponibilidad específica (queryType: 'availability')
    // Mostrar horarios disponibles para el servicio mencionado
    if (detection.extractedData?.queryType === 'availability') {
      const extracted = detection.extractedData;
      
      // Buscar el servicio mencionado
      let serviceName: string | null = null;
      let serviceKey: string | null = null;
      
      if (extracted.service) {
        // Si OpenAI extrajo el servicio directamente
        serviceKey = extracted.service;
        const serviceConfig = config?.services?.[serviceKey];
        serviceName = serviceConfig?.name || serviceKey;
      } else {
        // Buscar el servicio en el mensaje usando keywords
        const normalizedMessage = dto.message.toLowerCase();
        for (const [key, serviceData] of Object.entries(config?.services || {})) {
          const service = serviceData as any;
          const keywords = service.keywords || [];
          if (keywords.some((kw: string) => normalizedMessage.includes(kw.toLowerCase()))) {
            serviceKey = key;
            serviceName = service.name;
            break;
          }
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
      
      // Mostrar servicios disponibles desde BD (tabla Product con category 'service')
      const services = await this.productsService.findByCompany(company.id);
      const serviceProducts = services.filter(s => s.category === 'service');
      const regularProducts = services.filter(s => s.category !== 'service');
      
      if (serviceProducts.length > 0) {
        const servicesList = serviceProducts
          .map(s => `• ${s.name}`)
          .join('\n');
        reply = `Ofrecemos los siguientes servicios:\n\n${servicesList}`;
      }
      
      // Mostrar productos disponibles si existen
      if (regularProducts.length > 0) {
        const productsList = regularProducts
          .map((p) => {
            const price = new Intl.NumberFormat('es-CO', { 
              style: 'currency', 
              currency: 'COP', 
              minimumFractionDigits: 0 
            }).format(p.price || 0);
            return `• ${p.name} - ${price}`;
          })
          .join('\n');
        
        if (reply) {
          reply += `\n\n🍔 **Menú/Productos:**\n${productsList}`;
        } else {
          reply = `🍔 **Menú/Productos disponibles:**\n\n${productsList}`;
        }
      }
      
      // SIEMPRE asegurar que hay respuesta
      if (reply && reply.trim().length > 0) {
        reply += '\n\n¿Qué te gustaría pedir? 😊';
        
        return {
          reply,
          newState: {
            ...conversationContext,
            stage: conversationContext.stage !== 'collecting' ? ('idle' as const) : conversationContext.stage,
          },
        };
      }
      // Si no hay productos ni servicios, continuar con el flujo normal
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
}
