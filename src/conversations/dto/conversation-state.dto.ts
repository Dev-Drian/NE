import { ConversationStateMachine, IntentType, ConversationStateType } from '../../bot-engine/services/state-machine.service';

/**
 * Estado de conversación (legacy - mantiene compatibilidad)
 * @deprecated Usar ConversationStateMachine en su lugar
 */
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
  
  // Metadata para almacenar información adicional del flujo
  metadata?: {
    reservationId?: string;
    lastProductsAttempt?: Array<{ id: string; quantity: number }>;
    unavailableProducts?: Array<{ id: string; name: string; reason: string }>;
    hasAskedAllFields?: boolean;
    lastFieldAsked?: string;
    [key: string]: any;
  };
  
  // Nuevo: Estado de State Machine (fuente única de verdad)
  stateMachine?: ConversationStateMachine;
}

/**
 * Estado de conversación mejorado (State Machine)
 * Separación clara: Intención + Estado + Datos
 */
export interface EnhancedConversationState extends ConversationStateMachine {
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}





