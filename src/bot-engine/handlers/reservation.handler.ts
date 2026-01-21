import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { DetectionResult } from '../dto/detection-result.dto';
import { ProcessMessageDto } from '../dto/process-message.dto';
import { IIntentionHandler, IntentionHandlerContext, IntentionHandlerResult } from './intention-handler.interface';
import { BotEngineService } from '../bot-engine.service';

/**
 * Handler para intención de reservar
 * Delega al método handleReservation existente del BotEngineService
 * para mantener la funcionalidad exacta
 * Usa forwardRef para resolver dependencia circular
 */
@Injectable()
export class ReservationHandler implements IIntentionHandler {
  constructor(
    @Inject(forwardRef(() => BotEngineService))
    private botEngineService: BotEngineService,
  ) {}

  async handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult> {
    const { detection, context: conversationContext, dto, company, userId } = context;

    // Llamar al método handleReservation del BotEngineService (ahora público)
    const result = await this.botEngineService.handleReservation(
      detection,
      conversationContext,
      { ...dto, userId },
      company.type,
    );

    return {
      reply: result.reply,
      newState: result.newState,
      missingFields: result.missingFields,
    };
  }
}
