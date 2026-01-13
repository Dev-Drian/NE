export interface ConversationState {
  stage: 'idle' | 'collecting' | 'completed';
  collectedData: {
    date?: string;
    time?: string;
    guests?: number;
    phone?: string;
    name?: string;
    service?: string;
  };
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  lastIntention?: string;
}

