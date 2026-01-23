import { Injectable, Logger } from '@nestjs/common';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface CompressedContext {
  recentMessages: Message[];
  summary: string | null;
  keyInfo: KeyInformation;
  totalMessages: number;
}

export interface KeyInformation {
  hasActiveReservation: boolean;
  hasPendingPayment: boolean;
  mentionedServices: string[];
  mentionedDates: string[];
  decisions: string[];
  collectedData: any;
}

@Injectable()
export class ContextCompressorService {
  private readonly logger = new Logger(ContextCompressorService.name);
  private readonly RECENT_MESSAGES_COUNT = 7;
  private readonly COMPRESSION_THRESHOLD = 15;

  /**
   * Comprime contexto histórico manteniendo solo lo relevante
   */
  async compressContext(
    fullHistory: Message[],
    currentStage: string,
    collectedData: any
  ): Promise<CompressedContext> {
    // Si hay pocos mensajes, no comprimir
    if (fullHistory.length <= this.COMPRESSION_THRESHOLD) {
      return {
        recentMessages: fullHistory,
        summary: null,
        keyInfo: this.extractKeyInformation(fullHistory, collectedData),
        totalMessages: fullHistory.length,
      };
    }

    // Separar mensajes recientes
    const recentMessages = fullHistory.slice(-this.RECENT_MESSAGES_COUNT);
    const oldMessages = fullHistory.slice(0, -this.RECENT_MESSAGES_COUNT);

    // Extraer información clave de mensajes antiguos
    const keyInfo = this.extractKeyInformation(oldMessages, collectedData);

    // Resumir mensajes antiguos relevantes
    const summary = this.summarizeRelevantMessages(
      oldMessages,
      currentStage,
      keyInfo
    );

    return {
      recentMessages,
      summary,
      keyInfo,
      totalMessages: fullHistory.length,
    };
  }

  /**
   * Resume mensajes antiguos relevantes
   */
  private summarizeRelevantMessages(
    messages: Message[],
    currentStage: string,
    keyInfo: KeyInformation
  ): string {
    const summaryParts: string[] = [];

    // Resumen de reservas activas
    if (keyInfo.hasActiveReservation) {
      summaryParts.push('El usuario tiene una reserva activa mencionada anteriormente.');
    }

    // Resumen de pagos pendientes
    if (keyInfo.hasPendingPayment) {
      summaryParts.push('Hay un pago pendiente mencionado en la conversación anterior.');
    }

    // Resumen de servicios mencionados
    if (keyInfo.mentionedServices.length > 0) {
      summaryParts.push(
        `Servicios mencionados anteriormente: ${keyInfo.mentionedServices.join(', ')}`
      );
    }

    // Resumen de fechas mencionadas
    if (keyInfo.mentionedDates.length > 0) {
      summaryParts.push(
        `Fechas mencionadas anteriormente: ${keyInfo.mentionedDates.join(', ')}`
      );
    }

    // Resumen de decisiones tomadas
    if (keyInfo.decisions.length > 0) {
      summaryParts.push(
        `Decisiones tomadas: ${keyInfo.decisions.join('; ')}`
      );
    }

    // Resumen de datos recopilados
    if (keyInfo.collectedData && Object.keys(keyInfo.collectedData).length > 0) {
      const dataSummary = Object.entries(keyInfo.collectedData)
        .filter(([_, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      if (dataSummary) {
        summaryParts.push(`Datos recopilados anteriormente: ${dataSummary}`);
      }
    }

    return summaryParts.length > 0
      ? `**RESUMEN DE CONVERSACIÓN ANTERIOR:**\n${summaryParts.join('\n')}`
      : null;
  }

  /**
   * Extrae información clave del historial
   */
  private extractKeyInformation(
    messages: Message[],
    collectedData: any
  ): KeyInformation {
    const mentionedServices: string[] = [];
    const mentionedDates: string[] = [];
    const decisions: string[] = [];

    // Buscar patrones en mensajes
    for (const msg of messages) {
      const content = msg.content.toLowerCase();

      // Detectar servicios mencionados
      if (content.includes('domicilio') || content.includes('delivery')) {
        if (!mentionedServices.includes('domicilio')) {
          mentionedServices.push('domicilio');
        }
      }
      if (content.includes('mesa') || content.includes('restaurante')) {
        if (!mentionedServices.includes('mesa')) {
          mentionedServices.push('mesa');
        }
      }
      if (content.includes('cita') || content.includes('consulta')) {
        if (!mentionedServices.includes('cita')) {
          mentionedServices.push('cita');
        }
      }

      // Detectar fechas mencionadas
      const datePatterns = [
        /(hoy|mañana|pasado mañana)/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
        /(\d{4}-\d{2}-\d{2})/,
        /(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i,
      ];

      for (const pattern of datePatterns) {
        const match = content.match(pattern);
        if (match && !mentionedDates.includes(match[0])) {
          mentionedDates.push(match[0]);
        }
      }

      // Detectar decisiones
      if (
        content.includes('confirmado') ||
        content.includes('acepto') ||
        content.includes('de acuerdo')
      ) {
        decisions.push('Reserva confirmada');
      }
      if (content.includes('cancelar') || content.includes('cancelado')) {
        decisions.push('Reserva cancelada');
      }
    }

    return {
      hasActiveReservation: this.hasActiveReservation(messages),
      hasPendingPayment: this.hasPendingPayment(messages),
      mentionedServices,
      mentionedDates,
      decisions,
      collectedData: collectedData || {},
    };
  }

  /**
   * Detecta si hay una reserva activa mencionada
   */
  private hasActiveReservation(messages: Message[]): boolean {
    const reservationKeywords = [
      'reserva',
      'reservación',
      'confirmada',
      'agendada',
      'cita',
    ];

    for (const msg of messages) {
      const content = msg.content.toLowerCase();
      if (
        reservationKeywords.some((keyword) => content.includes(keyword)) &&
        !content.includes('cancel')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detecta si hay un pago pendiente mencionado
   */
  private hasPendingPayment(messages: Message[]): boolean {
    const paymentKeywords = [
      'pago',
      'pagado',
      'pendiente',
      'link',
      'wompi',
      'anticipo',
    ];

    for (const msg of messages) {
      const content = msg.content.toLowerCase();
      if (
        paymentKeywords.some((keyword) => content.includes(keyword)) &&
        (content.includes('pendiente') || content.includes('link'))
      ) {
        return true;
      }
    }

    return false;
  }
}
