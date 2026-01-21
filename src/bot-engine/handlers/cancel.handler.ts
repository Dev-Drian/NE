import { Injectable } from '@nestjs/common';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';

@Injectable()
export class CancelHandler implements IIntentionHandler {
  constructor(private messagesTemplates: MessagesTemplatesService) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, company } = context;

    const reply = detection.suggestedReply || await this.messagesTemplates.getReservationCancel(company.type);
    
    const newState = {
      ...conversationContext,
      stage: 'idle' as const,
    };

    return {
      reply,
      newState,
    };
  }
}
