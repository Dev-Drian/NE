import { Injectable, Logger } from '@nestjs/common';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';
import { Company } from '@prisma/client';

interface CachedContext {
  context: ConversationState;
  timestamp: number;
}

interface CachedCompany {
  company: Company;
  timestamp: number;
}

/**
 * Servicio de cache para contexto de conversación y datos de empresa
 * Reduce consultas redundantes a Redis y BD
 */
@Injectable()
export class ContextCacheService {
  private readonly logger = new Logger(ContextCacheService.name);
  private contextCache = new Map<string, CachedContext>();
  private companyCache = new Map<string, CachedCompany>();
  
  // Cache TTL: 1 segundo para contexto (muy volátil), 5 minutos para company (más estable)
  private readonly CONTEXT_CACHE_TTL = 1000; // 1 segundo
  private readonly COMPANY_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  /**
   * Obtiene el contexto desde cache si está disponible y válido
   * Si no está en cache o expiró, ejecuta el loader
   */
  async getOrLoadContext(
    key: string,
    loader: () => Promise<ConversationState>
  ): Promise<ConversationState> {
    const cached = this.contextCache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CONTEXT_CACHE_TTL) {
      return cached.context;
    }

    const context = await loader();
    this.contextCache.set(key, { context, timestamp: now });
    return context;
  }

  /**
   * Obtiene la empresa desde cache si está disponible y válida
   * Si no está en cache o expiró, ejecuta el loader
   */
  async getOrLoadCompany(
    companyId: string,
    loader: () => Promise<Company | null>
  ): Promise<Company | null> {
    const cached = this.companyCache.get(companyId);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.COMPANY_CACHE_TTL) {
      return cached.company;
    }

    const company = await loader();
    if (company) {
      this.companyCache.set(companyId, { company, timestamp: now });
    }
    return company;
  }

  /**
   * Invalida el cache de contexto para una clave específica
   */
  invalidateContext(key: string): void {
    this.contextCache.delete(key);
  }

  /**
   * Invalida el cache de empresa para un ID específico
   */
  invalidateCompany(companyId: string): void {
    this.companyCache.delete(companyId);
  }

  /**
   * Limpia todos los caches expirados
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    
    // Limpiar contexto expirado
    for (const [key, cached] of this.contextCache.entries()) {
      if (now - cached.timestamp >= this.CONTEXT_CACHE_TTL) {
        this.contextCache.delete(key);
      }
    }

    // Limpiar empresas expiradas
    for (const [key, cached] of this.companyCache.entries()) {
      if (now - cached.timestamp >= this.COMPANY_CACHE_TTL) {
        this.companyCache.delete(key);
      }
    }

    this.logger.debug(`Cache limpiado: ${this.contextCache.size} contextos, ${this.companyCache.size} empresas`);
  }

  /**
   * Obtiene estadísticas del cache
   */
  getStats() {
    return {
      contexts: this.contextCache.size,
      companies: this.companyCache.size,
      contextTTL: this.CONTEXT_CACHE_TTL,
      companyTTL: this.COMPANY_CACHE_TTL,
    };
  }
}

