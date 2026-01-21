import { Injectable } from '@nestjs/common';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class GreetingHandler implements IIntentionHandler {
  constructor(private messagesTemplates: MessagesTemplatesService) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { company, context: conversationContext } = context;

    const reply = await this.messagesTemplates.getGreeting(company.type, company.name);
    
    // Resetear contexto completamente cuando es un saludo (inicia nueva conversación)
    const newState = {
      stage: 'idle' as const,
      collectedData: {},
      conversationHistory: conversationContext.conversationHistory, // Mantener historial pero resetear estado
      lastIntention: undefined,
    };

    return {
      reply,
      newState,
    };
  }
}
