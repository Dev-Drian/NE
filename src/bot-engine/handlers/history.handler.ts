import { Injectable, Logger } from '@nestjs/common';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';
import { ReservationsService } from '../../reservations/reservations.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { DateHelper } from '../../common/date-helper';

/**
 * Handler para consulta de historial del usuario
 * Muestra reservas, citas, pedidos pasados de forma dinámica
 */
@Injectable()
export class HistoryHandler implements IIntentionHandler {
  private readonly logger = new Logger(HistoryHandler.name);

  constructor(
    private reservationsService: ReservationsService,
    private conversationsService: ConversationsService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { dto, company, userId, context: conversationContext } = context;

    try {
      // Consultar todas las reservas/pedidos del usuario
      const userReservations = await this.reservationsService.findByUserAndCompany(
        userId,
        dto.companyId,
      );

      const config = company.config as any;
      const catalogProducts = config?.products || [];
      const configServices = config?.services || {};

      const availableServiceKeys = Object.keys(configServices);

      // Helper functions
      const getServiceName = (serviceKey: string): string => {
        return configServices[serviceKey]?.name || serviceKey;
      };

      const getServiceEmoji = (serviceKey: string): string => {
        const key = serviceKey?.toLowerCase() || '';
        if (key.includes('domicilio') || key.includes('delivery')) return '🚚';
        if (key.includes('mesa') || key.includes('restaurante')) return '🍽️';
        if (key.includes('cita') || key.includes('consulta')) return '🏥';
        if (key.includes('spa') || key.includes('belleza')) return '💆';
        return '📋';
      };

      const getProductName = (productId: string): string => {
        const product = catalogProducts.find((p: any) => p.id === productId);
        return product?.name || productId;
      };

      if (userReservations.length === 0) {
        const serviceNames = availableServiceKeys
          .map((k) => getServiceName(k).toLowerCase())
          .join(' o ');
        const reply = `📋 No tienes registros todavía.\n\n¿Te gustaría agendar ${serviceNames ? 'un(a) ' + serviceNames : 'algo'}? 😊`;

        return {
          reply,
          newState: {
            ...conversationContext,
            stage: 'idle',
          },
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

      // Formatear una reserva
      const formatReservation = (r: any, index: number, serviceKey: string): string => {
        const emoji = getServiceEmoji(serviceKey);
        const serviceName = getServiceName(serviceKey);
        let text = `**${index}.** ${emoji} ${serviceName}`;
        text += `\n   📅 ${DateHelper.formatDateReadable(r.date)} a las ${DateHelper.formatTimeReadable(r.time)}`;

        if (r.metadata && typeof r.metadata === 'object') {
          const metadata = r.metadata as any;

          if (
            metadata.products &&
            Array.isArray(metadata.products) &&
            metadata.products.length > 0
          ) {
            const productNames = metadata.products
              .map((item: any) => {
                const name = getProductName(item.id);
                return item.quantity > 1 ? `${item.quantity}x ${name}` : name;
              })
              .join(', ');

            const productEmoji = serviceKey === 'domicilio' ? '🛒' : '💊';
            text += `\n   ${productEmoji} ${productNames}`;
          }

          if (metadata.treatment && typeof metadata.treatment === 'string') {
            text += `\n   💊 ${metadata.treatment}`;
          }

          if (metadata.address) {
            text += `\n   📍 ${metadata.address}`;
          }
        }

        if (r.guests && r.guests > 1 && serviceKey === 'mesa') {
          text += `\n   👥 ${r.guests} personas`;
        }

        const statusEmoji =
          r.status === 'pending' ? '⏳' : r.status === 'confirmed' ? '✅' : '❌';
        const statusText =
          r.status === 'pending'
            ? 'Pendiente'
            : r.status === 'confirmed'
              ? 'Confirmada'
              : 'Cancelada';
        text += `\n   ${statusEmoji} ${statusText}`;

        return text;
      };

      let reply = `📋 **Tu historial:**\n\n`;
      let itemIndex = 1;
      let totalItems = 0;

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

      const servicesSummary = Object.entries(reservationsByService)
        .map(([key, arr]) => `${arr.length} ${getServiceName(key).toLowerCase()}(s)`)
        .join(' | ');
      reply += `📊 **Total:** ${servicesSummary}\n`;
      reply += `\n¿Necesitas algo más? 😊`;

      return {
        reply,
        newState: {
          ...conversationContext,
        },
      };
    } catch (error) {
      this.logger.error('Error consultando historial:', error);
      return {
        reply: 'Hubo un error al consultar tu historial. Por favor intenta de nuevo.',
        newState: conversationContext,
      };
    }
  }
}
