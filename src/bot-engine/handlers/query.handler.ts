import { Injectable } from '@nestjs/common';
import { AvailabilityService } from '../../availability/availability.service';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { KeywordDetectorService } from '../utils/keyword-detector.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class QueryHandler implements IIntentionHandler {
  constructor(
    private availability: AvailabilityService,
    private messagesTemplates: MessagesTemplatesService,
    private keywordDetector: KeywordDetectorService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, dto, company, userId } = context;

    const config = company.config as any;
    const hoursText = this.formatHours(config?.hours);
    
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
    
    // PRIORIDAD 2: Si preguntan por servicios y hay servicios configurados, mostrarlos
    const askingAboutServices = this.keywordDetector.asksForProducts(dto.message);
    
    // PRIORIDAD 3: Verificar si la consulta incluye fecha/hora específica (consulta de disponibilidad)
    const extracted = detection.extractedData || {};
    const hasSpecificDate = extracted.date !== null && extracted.date !== undefined;
    const hasSpecificTime = extracted.time !== null && extracted.time !== undefined;
    
    let reply: string;
    
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
    } else if (askingAboutServices && config?.services) {
      const servicesList = Object.entries(config.services)
        .map(([key, value]: [string, any]) => `• ${value.name}`)
        .join('\n');
      reply = `Ofrecemos los siguientes servicios:\n\n${servicesList}\n\n¿Te gustaría agendar una cita?`;
    } else {
      // Fallback: usar suggestedReply de OpenAI o respuesta genérica
      reply = detection.suggestedReply || await this.messagesTemplates.getReservationQuery(company.type, hoursText);
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
