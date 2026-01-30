import { Injectable, Logger } from '@nestjs/common';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';
import { ConversationsService } from '../../conversations/conversations.service';

/**
 * Handler para despedidas y agradecimientos
 * Cierra la conversación de forma amable y resetea el contexto
 */
@Injectable()
export class FarewellHandler implements IIntentionHandler {
  private readonly logger = new Logger(FarewellHandler.name);

  constructor(
    private conversationsService: ConversationsService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { dto, company, userId, context: conversationContext } = context;

    // Determinar el tipo de despedida según el mensaje
    const message = dto.message.toLowerCase();
    let reply: string;

    if (this.isThanks(message)) {
      reply = '¡De nada! Fue un placer atenderte. Si necesitas algo más, no dudes en escribirme. 😊';
    } else if (this.isExplicitGoodbye(message)) {
      reply = '¡Hasta luego! Que tengas un excelente día. Si necesitas algo, aquí estaré. 👋';
    } else {
      reply = '¡Gracias por tu visita! Si necesitas algo más, aquí estaré. 😊';
    }

    // Resetear contexto para nueva conversación
    const newState = {
      stage: 'idle' as const,
      collectedData: {},
      conversationHistory: [],
      lastIntention: null,
    };

    return {
      reply,
      newState,
    };
  }

  private isThanks(message: string): boolean {
    const thanksKeywords = [
      'gracias',
      'muchas gracias',
      'thanks',
      'thank you',
      'perfecto',
      'genial',
      'excelente',
    ];
    return thanksKeywords.some((kw) => message.includes(kw));
  }

  private isExplicitGoodbye(message: string): boolean {
    const goodbyeKeywords = [
      'chao',
      'adios',
      'adiós',
      'bye',
      'hasta luego',
      'nos vemos',
      'hasta pronto',
    ];
    return goodbyeKeywords.some((kw) => message.includes(kw));
  }
}
