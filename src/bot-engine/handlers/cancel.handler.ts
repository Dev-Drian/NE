import { Injectable, Logger } from '@nestjs/common';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { ReservationsService } from '../../reservations/reservations.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class CancelHandler implements IIntentionHandler {
  private readonly logger = new Logger(CancelHandler.name);

  constructor(
    private messagesTemplates: MessagesTemplatesService,
    private reservationsService: ReservationsService,
  ) {}

  /**
   * Convierte hora de 24h a 12h
   */
  private formatTime12h(timeStr: string): string {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, company, dto } = context;

    try {
      // Buscar reservas activas del usuario
      const activeReservations = await this.reservationsService.findByUserAndCompany(
        dto.userId,
        dto.companyId,
      );

      // Filtrar solo reservas confirmadas o pendientes (no canceladas)
      const reservationsToCancel = activeReservations.filter(
        (r) => r.status === 'confirmed' || r.status === 'pending',
      );

      if (reservationsToCancel.length === 0) {
        return {
          reply: 'No tienes reservas activas para cancelar. Si necesitas ayuda con algo más, estaré aquí. 😊',
          newState: {
            ...conversationContext,
            stage: 'idle' as const,
          },
        };
      }

      // Si hay múltiples reservas, cancelar todas o preguntar cuál
      if (reservationsToCancel.length > 1) {
        const reservationsList = reservationsToCancel
          .slice(0, 5)
          .map((r, idx) => {
            const date = new Date(r.date).toLocaleDateString('es-ES', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            return `${idx + 1}. ${date} a las ${r.time} (${r.guests} ${r.guests === 1 ? 'persona' : 'personas'})`;
          })
          .join('\n');

        return {
          reply: `Tienes ${reservationsToCancel.length} reservas activas:\n\n${reservationsList}\n\n¿Cuál deseas cancelar? O escribe "cancelar todas" para cancelarlas todas.`,
          newState: {
            ...conversationContext,
            stage: 'idle' as const,
          },
        };
      }

      // Cancelar la única reserva activa
      const reservation = reservationsToCancel[0];
      await this.reservationsService.update(reservation.id, { status: 'cancelled' });

      const date = new Date(reservation.date).toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      return {
        reply: `✅ Reserva cancelada exitosamente.\n\n📅 Fecha: ${date}\n🕐 Hora: ${this.formatTime12h(reservation.time)}\n👥 Personas: ${reservation.guests}\n\nSi necesitas hacer una nueva reserva, estaré aquí para ayudarte. 😊`,
        newState: {
          ...conversationContext,
          stage: 'idle' as const,
          collectedData: {},
        },
      };
    } catch (error) {
      this.logger.error('Error cancelando reserva:', error);
      return {
        reply: detection.suggestedReply || await this.messagesTemplates.getReservationCancel(company.type),
        newState: {
          ...conversationContext,
          stage: 'idle' as const,
        },
      };
    }
  }
}
