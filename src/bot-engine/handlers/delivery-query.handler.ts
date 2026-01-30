import { Injectable, Logger } from '@nestjs/common';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

/**
 * Handler para consultas sobre servicios de domicilio/delivery
 * Responde preguntas sobre disponibilidad y costos de envío
 */
@Injectable()
export class DeliveryQueryHandler implements IIntentionHandler {
  private readonly logger = new Logger(DeliveryQueryHandler.name);

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { company, context: conversationContext } = context;

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
      if (domicilioService.estimatedDeliveryTime) {
        reply += `⏱️ Tiempo estimado: ${domicilioService.estimatedDeliveryTime} minutos\n`;
      }
      if (domicilioService.coverageArea) {
        reply += `📍 Zona de cobertura: ${domicilioService.coverageArea}\n`;
      }
      
      reply += '\n¿Te gustaría hacer un pedido a domicilio? 😊';

      return {
        reply,
        newState: conversationContext,
      };
    } else {
      const reply = 'Lo siento, actualmente no contamos con servicio de domicilio. 😔';
      return {
        reply,
        newState: conversationContext,
      };
    }
  }

  /**
   * Verifica si la empresa tiene servicio de domicilio habilitado
   */
  hasDeliveryService(company: any): boolean {
    const config = company.config as any;
    const services = config?.services || {};
    const domicilioService = services['domicilio'];
    return domicilioService?.enabled === true;
  }
}
