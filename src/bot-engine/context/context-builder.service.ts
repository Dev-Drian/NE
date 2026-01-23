import { Injectable } from '@nestjs/common';
import { ConversationsService } from '../../conversations/conversations.service';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';
import { ContextCompressorService, Message, CompressedContext } from './context-compressor.service';

export interface AIContext {
  recentMessages: Message[];
  summary: string | null;
  keyInfo: any;
  currentStage: string;
  collectedData: any;
  fullHistory?: Message[]; // Para debugging
}

@Injectable()
export class ContextBuilderService {
  constructor(
    private compressor: ContextCompressorService,
    private conversations: ConversationsService
  ) {}

  /**
   * Construye contexto optimizado para IA
   */
  async buildContextForAI(
    userId: string,
    companyId: string
  ): Promise<AIContext> {
    // Obtener contexto completo
    const fullContext = await this.conversations.getContext(userId, companyId);

    // Comprimir si hay muchos mensajes
    if (fullContext.conversationHistory.length > 15) {
      const compressed = await this.compressor.compressContext(
        fullContext.conversationHistory as Message[],
        fullContext.stage,
        fullContext.collectedData
      );

      return {
        recentMessages: compressed.recentMessages,
        summary: compressed.summary,
        keyInfo: compressed.keyInfo,
        currentStage: fullContext.stage,
        collectedData: fullContext.collectedData,
        fullHistory: fullContext.conversationHistory as Message[], // Para debugging
      };
    }

    // Si hay pocos mensajes, devolver todo
    return {
      recentMessages: fullContext.conversationHistory as Message[],
      summary: null,
      keyInfo: {},
      currentStage: fullContext.stage,
      collectedData: fullContext.collectedData,
    };
  }

  /**
   * Formatea el contexto para el prompt de IA
   */
  formatContextForPrompt(context: AIContext): string {
    const parts: string[] = [];

    // Agregar resumen si existe
    if (context.summary) {
      parts.push(context.summary);
    }

    // Agregar información clave
    if (context.keyInfo && Object.keys(context.keyInfo).length > 0) {
      const keyInfoParts: string[] = [];

      if (context.keyInfo.hasActiveReservation) {
        keyInfoParts.push('⚠️ Hay una reserva activa mencionada anteriormente');
      }

      if (context.keyInfo.hasPendingPayment) {
        keyInfoParts.push('💳 Hay un pago pendiente mencionado anteriormente');
      }

      if (context.keyInfo.mentionedServices?.length > 0) {
        keyInfoParts.push(
          `🏷️ Servicios mencionados: ${context.keyInfo.mentionedServices.join(', ')}`
        );
      }

      if (context.keyInfo.collectedData) {
        const dataKeys = Object.keys(context.keyInfo.collectedData).filter(
          (key) =>
            context.keyInfo.collectedData[key] !== null &&
            context.keyInfo.collectedData[key] !== undefined
        );
        if (dataKeys.length > 0) {
          keyInfoParts.push(
            `📋 Datos ya recopilados: ${dataKeys.join(', ')}`
          );
        }
      }

      if (keyInfoParts.length > 0) {
        parts.push(`\n**INFORMACIÓN CLAVE:**\n${keyInfoParts.join('\n')}`);
      }
    }

    // Agregar mensajes recientes
    if (context.recentMessages && context.recentMessages.length > 0) {
      const messagesText = context.recentMessages
        .map(
          (msg) =>
            `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`
        )
        .join('\n');
      parts.push(`\n**CONVERSACIÓN RECIENTE:**\n${messagesText}`);
    }

    // Agregar estado actual
    if (context.currentStage && context.currentStage !== 'idle') {
      parts.push(
        `\n**ESTADO ACTUAL:** Estamos en proceso de ${context.currentStage}`
      );
    }

    return parts.join('\n\n');
  }
}
