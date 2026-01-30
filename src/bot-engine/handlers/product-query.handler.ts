import { Injectable, Logger } from '@nestjs/common';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';
import { TextUtilsService } from '../utils/text-utils.service';

/**
 * Handler para consultas de productos/menú y precios
 * Muestra catálogo de productos de forma dinámica según el tipo de empresa
 */
@Injectable()
export class ProductQueryHandler implements IIntentionHandler {
  private readonly logger = new Logger(ProductQueryHandler.name);

  constructor(
    private textUtils: TextUtilsService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { dto, company, context: conversationContext } = context;

    const config = company.config as any;
    const products = config?.products || [];

    if (products.length === 0) {
      return {
        reply: 'Lo siento, no tenemos productos disponibles en este momento.',
        newState: conversationContext,
      };
    }

    let reply = `📋 **${company.type === 'restaurant' ? 'Nuestro Menú' : 'Nuestros Servicios'}:**\n\n`;

    // Agrupar por categoría
    const grouped: Record<string, any[]> = {};
    products.forEach((p: any) => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });

    for (const [category, items] of Object.entries(grouped)) {
      reply += `**${category.charAt(0).toUpperCase() + category.slice(1)}**\n`;
      (items as any[]).forEach((item: any) => {
        const price = new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
        }).format(item.price);
        reply += `• ${item.name} - ${price}`;
        if (item.duration) reply += ` (${item.duration} min)`;
        if (item.description) reply += ` - ${item.description}`;
        reply += `\n`;
      });
      reply += `\n`;
    }

    // Mensaje contextual según el estado de la conversación
    if (
      conversationContext.stage === 'collecting' &&
      conversationContext.collectedData?.service
    ) {
      const services = config?.services || {};
      const selectedService = services[conversationContext.collectedData.service];
      if (selectedService?.requiresProducts) {
        reply += `\nPor favor, dime qué productos quieres. Por ejemplo: "quiero una pizza margherita y una coca cola" 😊`;
      } else {
        reply += `¿Te gustaría hacer una reserva? 😊`;
      }
    } else {
      reply += `¿Te gustaría hacer una reserva? 😊`;
    }

    return {
      reply,
      newState: conversationContext, // Mantener el estado actual
    };
  }

  /**
   * Manejar consulta de precio específico de un producto
   */
  async handlePriceQuery(
    context: IntentionHandlerContext,
    message: string,
  ): Promise<IntentionHandlerResult | null> {
    const { company, context: conversationContext } = context;
    const config = company.config as any;
    const products = config?.products || [];

    const normalizedMessage = this.textUtils.normalizeText(message.toLowerCase());
    const foundProduct = products.find((p: any) => {
      const productName = this.textUtils.normalizeText(p.name || '');
      return normalizedMessage.includes(productName);
    });

    if (!foundProduct) {
      return null; // No se encontró producto específico
    }

    const price = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(foundProduct.price);

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
        const relPrice = new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
        }).format(p.price);
        reply += `\n• ${p.name} - ${relPrice}`;
      });
    }

    reply += `\n\n¿Te gustaría hacer una reserva? 😊`;

    return {
      reply,
      newState: conversationContext,
    };
  }
}
