import { DetectionResult } from '../dto/detection-result.dto';
import { ProcessMessageDto } from '../dto/process-message.dto';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';
import { Company } from '@prisma/client';

export interface IntentionHandlerResult {
  reply: string;
  newState: ConversationState;
  missingFields?: string[];
}

export interface IntentionHandlerContext {
  detection: DetectionResult;
  context: ConversationState;
  dto: ProcessMessageDto;
  company: Company;
  userId: string;
}

export interface IIntentionHandler {
  handle(context: IntentionHandlerContext): Promise<IntentionHandlerResult>;
}
