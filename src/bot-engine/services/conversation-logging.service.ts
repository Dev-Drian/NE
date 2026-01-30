import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface LogConversationInput {
  userId: string;
  companyId: string;
  conversationId?: string;
  userMessage: string;
  normalizedMessage?: string;
  detectedIntention?: string;
  confidence?: number;
  detectionLayer?: 'layer1' | 'layer2' | 'layer3' | 'keyword' | 'fallback';
  matchedPatterns?: any[];
  extractedEntities?: Record<string, any>;
  botResponse?: string;
  actionExecuted?: string;
  success?: boolean;
  errorType?: 'not_understood' | 'validation_error' | 'system_error' | null;
  conversationState?: string;
  previousIntention?: string;
  responseTimeMs?: number;
}

export interface AnalyticsQuery {
  companyId?: string;
  startDate?: Date;
  endDate?: Date;
  intention?: string;
  success?: boolean;
  errorType?: string;
  limit?: number;
}

export interface IntentionStats {
  intention: string;
  count: number;
  avgConfidence: number;
  successRate: number;
}

export interface UnmatchedMessage {
  userMessage: string;
  count: number;
  lastSeen: Date;
  companyId: string;
}

@Injectable()
export class ConversationLoggingService {
  private readonly logger = new Logger(ConversationLoggingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Registra una interacción de conversación
   * Se llama después de cada processMessage
   */
  async logInteraction(input: LogConversationInput): Promise<void> {
    try {
      await this.prisma.conversationLog.create({
        data: {
          userId: input.userId,
          companyId: input.companyId,
          conversationId: input.conversationId,
          userMessage: input.userMessage,
          normalizedMessage: input.normalizedMessage,
          detectedIntention: input.detectedIntention,
          confidence: input.confidence ?? 0,
          detectionLayer: input.detectionLayer,
          matchedPatterns: input.matchedPatterns ?? [],
          extractedEntities: input.extractedEntities ?? {},
          botResponse: input.botResponse,
          actionExecuted: input.actionExecuted,
          success: input.success ?? true,
          errorType: input.errorType,
          conversationState: input.conversationState,
          previousIntention: input.previousIntention,
          responseTimeMs: input.responseTimeMs,
        },
      });
    } catch (error) {
      // No fallar el flujo principal por errores de logging
      this.logger.error('Error logging conversation:', error);
    }
  }

  /**
   * Obtiene mensajes no entendidos (intención = 'otro' o confidence baja)
   * Útil para identificar qué patrones faltan
   */
  async getUnmatchedMessages(query: AnalyticsQuery): Promise<UnmatchedMessage[]> {
    const where: Prisma.ConversationLogWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.startDate && { createdAt: { gte: query.startDate } }),
      ...(query.endDate && { createdAt: { lte: query.endDate } }),
      OR: [
        { detectedIntention: 'otro' },
        { confidence: { lt: 0.5 } },
        { errorType: 'not_understood' },
      ],
    };

    // Agrupar por mensaje normalizado para ver patrones
    const logs = await this.prisma.conversationLog.findMany({
      where,
      select: {
        userMessage: true,
        normalizedMessage: true,
        companyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Límite para performance
    });

    // Agrupar manualmente por mensaje normalizado
    const grouped = new Map<string, { count: number; lastSeen: Date; companyId: string; original: string }>();
    
    for (const log of logs) {
      const key = log.normalizedMessage || log.userMessage.toLowerCase();
      const existing = grouped.get(key);
      
      if (existing) {
        existing.count++;
        if (log.createdAt > existing.lastSeen) {
          existing.lastSeen = log.createdAt;
        }
      } else {
        grouped.set(key, {
          count: 1,
          lastSeen: log.createdAt,
          companyId: log.companyId,
          original: log.userMessage,
        });
      }
    }

    // Convertir a array y ordenar por frecuencia
    return Array.from(grouped.entries())
      .map(([_, data]) => ({
        userMessage: data.original,
        count: data.count,
        lastSeen: data.lastSeen,
        companyId: data.companyId,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, query.limit || 50);
  }

  /**
   * Obtiene estadísticas por intención
   */
  async getIntentionStats(query: AnalyticsQuery): Promise<IntentionStats[]> {
    const where: Prisma.ConversationLogWhereInput = {
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.startDate && { createdAt: { gte: query.startDate } }),
      ...(query.endDate && { createdAt: { lte: query.endDate } }),
      detectedIntention: { not: null },
    };

    const logs = await this.prisma.conversationLog.groupBy({
      by: ['detectedIntention'],
      where,
      _count: { id: true },
      _avg: { confidence: true },
    });

    // Calcular tasa de éxito por intención
    const stats: IntentionStats[] = [];
    
    for (const log of logs) {
      if (!log.detectedIntention) continue;
      
      const successCount = await this.prisma.conversationLog.count({
        where: {
          ...where,
          detectedIntention: log.detectedIntention,
          success: true,
        },
      });

      stats.push({
        intention: log.detectedIntention,
        count: log._count.id,
        avgConfidence: log._avg.confidence || 0,
        successRate: log._count.id > 0 ? successCount / log._count.id : 0,
      });
    }

    return stats.sort((a, b) => b.count - a.count);
  }

  /**
   * Obtiene métricas generales del bot
   */
  async getGeneralMetrics(companyId?: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.ConversationLogWhereInput = {
      ...(companyId && { companyId }),
      createdAt: { gte: startDate },
    };

    const [total, successful, byLayer, avgResponseTime] = await Promise.all([
      this.prisma.conversationLog.count({ where }),
      this.prisma.conversationLog.count({ where: { ...where, success: true } }),
      this.prisma.conversationLog.groupBy({
        by: ['detectionLayer'],
        where,
        _count: { id: true },
      }),
      this.prisma.conversationLog.aggregate({
        where,
        _avg: { responseTimeMs: true },
      }),
    ]);

    return {
      totalInteractions: total,
      successfulInteractions: successful,
      successRate: total > 0 ? successful / total : 0,
      avgResponseTimeMs: avgResponseTime._avg.responseTimeMs || 0,
      byDetectionLayer: byLayer.reduce((acc, item) => {
        if (item.detectionLayer) {
          acc[item.detectionLayer] = item._count.id;
        }
        return acc;
      }, {} as Record<string, number>),
      period: { startDate, endDate: new Date() },
    };
  }

  /**
   * Obtiene conversaciones que fueron abandonadas
   * (usuario dejó de responder en medio de un flujo)
   */
  async getDropoffAnalysis(companyId?: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: Prisma.ConversationLogWhereInput = {
      ...(companyId && { companyId }),
      createdAt: { gte: startDate },
      conversationState: { not: null },
    };

    // Agrupar por estado de conversación
    const byState = await this.prisma.conversationLog.groupBy({
      by: ['conversationState'],
      where,
      _count: { id: true },
    });

    return byState
      .map(item => ({
        state: item.conversationState || 'unknown',
        count: item._count.id,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Sugiere nuevos patrones basados en mensajes no entendidos
   */
  async suggestNewPatterns(companyId: string, minOccurrences: number = 3): Promise<{
    suggestedIntention: string;
    pattern: string;
    occurrences: number;
  }[]> {
    const unmatched = await this.getUnmatchedMessages({
      companyId,
      limit: 100,
    });

    const suggestions: { suggestedIntention: string; pattern: string; occurrences: number }[] = [];

    for (const msg of unmatched) {
      if (msg.count < minOccurrences) continue;

      // Heurísticas simples para sugerir intención
      const lower = msg.userMessage.toLowerCase();
      let suggestedIntention = 'otro';

      if (lower.includes('reserv') || lower.includes('mesa') || lower.includes('cita')) {
        suggestedIntention = 'reservar';
      } else if (lower.includes('cancel') || lower.includes('anular')) {
        suggestedIntention = 'cancelar';
      } else if (lower.includes('horario') || lower.includes('precio') || lower.includes('menu')) {
        suggestedIntention = 'consultar';
      } else if (lower.includes('hola') || lower.includes('buenos')) {
        suggestedIntention = 'saludar';
      }

      if (suggestedIntention !== 'otro') {
        suggestions.push({
          suggestedIntention,
          pattern: msg.userMessage,
          occurrences: msg.count,
        });
      }
    }

    return suggestions;
  }
}
