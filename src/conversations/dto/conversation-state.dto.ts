export interface ConversationState {
  stage: 'idle' | 'collecting' | 'completed' | 'awaiting_payment';
  collectedData: {
    date?: string;
    time?: string;
    guests?: number;
    phone?: string;
    name?: string;
    service?: string;
    products?: Array<{ id: string; quantity: number }>;
    treatment?: string;
    product?: string;
    address?: string; // Dirección/ubicación para domicilio
    tableId?: string; // Mesa específica si se menciona
  };
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  lastIntention?: string;
}





