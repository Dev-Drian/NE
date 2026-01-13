import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConversationState } from './dto/conversation-state.dto';

@Injectable()
export class ConversationsService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;
  private readonly TTL = 86400; // 24 horas en segundos

  onModuleInit() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  private getKey(userId: string, companyId: string): string {
    return `conversation:${userId}:${companyId}`;
  }

  async getContext(userId: string, companyId: string): Promise<ConversationState> {
    const key = this.getKey(userId, companyId);
    const data = await this.redis.get(key);

    if (!data) {
      return {
        stage: 'idle',
        collectedData: {},
        conversationHistory: [],
      };
    }

    return JSON.parse(data);
  }

  async saveContext(userId: string, companyId: string, state: ConversationState): Promise<void> {
    const key = this.getKey(userId, companyId);
    await this.redis.setex(key, this.TTL, JSON.stringify(state));
  }

  async addMessage(
    userId: string,
    companyId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const context = await this.getContext(userId, companyId);
    context.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });

    // Mantener solo los últimos 20 mensajes
    if (context.conversationHistory.length > 20) {
      context.conversationHistory = context.conversationHistory.slice(-20);
    }

    await this.saveContext(userId, companyId, context);
  }

  async clearContext(userId: string, companyId: string): Promise<void> {
    const key = this.getKey(userId, companyId);
    await this.redis.del(key);
  }
}

