export class MessageResponseDto {
  reply: string;
  intention: string;
  confidence: number;
  missingFields?: string[];
  conversationState: string;
}

