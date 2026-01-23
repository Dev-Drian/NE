import { Injectable, Logger } from '@nestjs/common';

/**
 * Estados específicos por intención
 * Siguiendo el modelo: Intención + Estado + Datos
 */
export type IntentType = 
  | 'CHECK_AVAILABILITY' 
  | 'CREATE_RESERVATION' 
  | 'CANCEL_RESERVATION' 
  | 'GENERAL_QUESTION'
  | 'GREETING'
  | 'OTHER';

export type ReservationState = 
  | 'IDLE'
  | 'WAITING_DATE'
  | 'WAITING_TIME'
  | 'WAITING_SERVICE'
  | 'WAITING_GUESTS'
  | 'WAITING_PHONE'
  | 'WAITING_NAME'
  | 'WAITING_PRODUCTS'
  | 'WAITING_ADDRESS'
  | 'WAITING_TABLE'
  | 'CONFIRMATION'
  | 'COMPLETED'
  | 'AWAITING_PAYMENT';

export type AvailabilityState = 
  | 'IDLE'
  | 'WAITING_DATE'
  | 'WAITING_TIME'
  | 'WAITING_SERVICE'
  | 'RESPONDED';

export type CancelState = 
  | 'IDLE'
  | 'WAITING_CONFIRMATION'
  | 'COMPLETED';

export type ConversationStateType = ReservationState | AvailabilityState | CancelState | 'IDLE';

/**
 * Campos requeridos por servicio (orden de recolección)
 */
export interface RequiredFieldsConfig {
  [serviceKey: string]: string[]; // Orden de campos requeridos
}

/**
 * Estado completo de la conversación (fuente única de verdad)
 */
export interface ConversationStateMachine {
  intent: IntentType | null;
  state: ConversationStateType;
  fields: {
    // Datos confirmados (nunca se vuelven a preguntar)
    date?: string;
    time?: string;
    guests?: number;
    phone?: string;
    name?: string;
    service?: string;
    products?: Array<{ id: string; quantity: number }>;
    address?: string;
    tableId?: string;
    treatment?: string;
    product?: string;
  };
  // Metadata adicional
  metadata?: {
    reservationId?: string;
    paymentId?: string;
    lastFieldAsked?: string;
    confidence?: number;
  };
}

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);

  /**
   * Obtiene el siguiente estado basado en la intención y los campos faltantes
   */
  getNextState(
    intent: IntentType,
    currentState: ConversationStateType,
    fields: ConversationStateMachine['fields'],
    requiredFields: string[],
    serviceKey?: string,
  ): ConversationStateType {
    // Si no hay intención, siempre IDLE
    if (!intent || intent === 'OTHER' || intent === 'GENERAL_QUESTION') {
      return 'IDLE';
    }

    // State Machine para CREATE_RESERVATION
    if (intent === 'CREATE_RESERVATION') {
      return this.getNextReservationState(currentState, fields, requiredFields, serviceKey);
    }

    // State Machine para CHECK_AVAILABILITY
    if (intent === 'CHECK_AVAILABILITY') {
      return this.getNextAvailabilityState(currentState, fields, requiredFields);
    }

    // State Machine para CANCEL_RESERVATION
    if (intent === 'CANCEL_RESERVATION') {
      return this.getNextCancelState(currentState);
    }

    return 'IDLE';
  }

  /**
   * Calcula qué campos faltan (en orden)
   */
  getMissingFields(
    fields: ConversationStateMachine['fields'],
    requiredFields: string[],
    serviceKey?: string,
  ): string[] {
    const missing: string[] = [];

    for (const field of requiredFields) {
      // Verificar si el campo existe y tiene valor
      const hasValue = this.hasFieldValue(fields, field);
      if (!hasValue) {
        missing.push(field);
      }
    }

    return missing;
  }

  /**
   * Verifica si un campo tiene valor
   */
  private hasFieldValue(fields: ConversationStateMachine['fields'], field: string): boolean {
    switch (field) {
      case 'date':
        return !!fields.date;
      case 'time':
        return !!fields.time;
      case 'phone':
        return !!fields.phone;
      case 'name':
        return !!fields.name;
      case 'guests':
        return fields.guests !== undefined && fields.guests !== null;
      case 'service':
        return !!fields.service;
      case 'products':
        return Array.isArray(fields.products) && fields.products.length > 0;
      case 'address':
        return !!fields.address;
      case 'tableId':
        return !!fields.tableId;
      default:
        return false;
    }
  }

  /**
   * State Machine para CREATE_RESERVATION
   */
  private getNextReservationState(
    currentState: ConversationStateType,
    fields: ConversationStateMachine['fields'],
    requiredFields: string[],
    serviceKey?: string,
  ): ReservationState {
    // Si estamos en CONFIRMATION o COMPLETED, mantener
    if (currentState === 'CONFIRMATION' || currentState === 'COMPLETED' || currentState === 'AWAITING_PAYMENT') {
      return currentState as ReservationState;
    }

    // Calcular campos faltantes
    const missing = this.getMissingFields(fields, requiredFields, serviceKey);

    // Si no faltan campos, ir a CONFIRMATION
    if (missing.length === 0) {
      return 'CONFIRMATION';
    }

    // Determinar siguiente campo en orden
    const nextField = missing[0];

    // Mapear campo a estado
    const fieldToState: Record<string, ReservationState> = {
      date: 'WAITING_DATE',
      time: 'WAITING_TIME',
      service: 'WAITING_SERVICE',
      guests: 'WAITING_GUESTS',
      phone: 'WAITING_PHONE',
      name: 'WAITING_NAME',
      products: 'WAITING_PRODUCTS',
      address: 'WAITING_ADDRESS',
      tableId: 'WAITING_TABLE',
    };

    return fieldToState[nextField] || 'WAITING_DATE';
  }

  /**
   * State Machine para CHECK_AVAILABILITY
   */
  private getNextAvailabilityState(
    currentState: ConversationStateType,
    fields: ConversationStateMachine['fields'],
    requiredFields: string[],
  ): AvailabilityState {
    // Si ya respondimos, mantener
    if (currentState === 'RESPONDED') {
      return 'RESPONDED';
    }

    // Calcular campos faltantes
    const missing = this.getMissingFields(fields, requiredFields);

    // Si no faltan campos, responder
    if (missing.length === 0) {
      return 'RESPONDED';
    }

    // Determinar siguiente campo
    const nextField = missing[0];

    const fieldToState: Record<string, AvailabilityState> = {
      date: 'WAITING_DATE',
      time: 'WAITING_TIME',
      service: 'WAITING_SERVICE',
    };

    return fieldToState[nextField] || 'WAITING_DATE';
  }

  /**
   * State Machine para CANCEL_RESERVATION
   */
  private getNextCancelState(currentState: ConversationStateType): CancelState {
    if (currentState === 'WAITING_CONFIRMATION') {
      return 'WAITING_CONFIRMATION';
    }
    if (currentState === 'COMPLETED') {
      return 'COMPLETED';
    }
    return 'IDLE';
  }

  /**
   * Actualiza campos confirmados (nunca se sobrescriben a menos que el usuario lo confirme explícitamente)
   */
  updateFields(
    currentFields: ConversationStateMachine['fields'],
    newFields: Partial<ConversationStateMachine['fields']>,
    confirmOverwrite: boolean = false,
  ): ConversationStateMachine['fields'] {
    const updated: ConversationStateMachine['fields'] = { ...currentFields };

    for (const [key, value] of Object.entries(newFields)) {
      if (value !== null && value !== undefined) {
        const fieldKey = key as keyof ConversationStateMachine['fields'];
        // Si el campo ya existe y no es confirmación explícita, mantener el anterior
        if (updated[fieldKey] && !confirmOverwrite) {
          // Mantener el valor anterior (no sobrescribir)
          continue;
        }
        // Actualizar solo si es nuevo o si hay confirmación explícita
        (updated as any)[fieldKey] = value;
      }
    }

    return updated;
  }

  /**
   * Resetea el estado (nueva conversación)
   */
  resetState(): ConversationStateMachine {
    return {
      intent: null,
      state: 'IDLE',
      fields: {},
      metadata: {},
    };
  }

  /**
   * Mapea intención antigua a nueva
   */
  mapLegacyIntention(legacyIntention: string): IntentType {
    const mapping: Record<string, IntentType> = {
      reservar: 'CREATE_RESERVATION',
      consultar: 'CHECK_AVAILABILITY',
      cancelar: 'CANCEL_RESERVATION',
      saludar: 'GREETING',
      otro: 'OTHER',
    };

    return mapping[legacyIntention.toLowerCase()] || 'OTHER';
  }

  /**
   * Mapea estado antiguo a nuevo
   */
  mapLegacyState(legacyStage: string, intent?: IntentType): ConversationStateType {
    if (legacyStage === 'idle') {
      return 'IDLE';
    }
    if (legacyStage === 'completed') {
      return 'COMPLETED';
    }
    if (legacyStage === 'awaiting_payment') {
      return 'AWAITING_PAYMENT';
    }
    if (legacyStage === 'collecting') {
      // Si estamos en collecting, necesitamos más contexto para determinar el estado específico
      // Por ahora, retornamos IDLE y el sistema calculará el siguiente estado
      return 'IDLE';
    }

    return 'IDLE';
  }
}
