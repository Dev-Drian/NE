import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';
import { Company } from '@prisma/client';
import { CACHE_TTL } from '../constants/detection.constants';

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
 * Usa Redis para cache distribuido con fallback a Map local si Redis falla
 */
@Injectable()
export class ContextCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ContextCacheService.name);
  private redis: Redis | null = null;
  private useRedis = false;
  
  // Fallback a Map local si Redis no está disponible
  private contextCache = new Map<string, CachedContext>();
  private companyCache = new Map<string, CachedCompany>();
  
  // Cache TTL usando constantes
  private readonly CONTEXT_CACHE_TTL = CACHE_TTL.CONTEXT; // 5 segundos
  private readonly COMPANY_CACHE_TTL = CACHE_TTL.COMPANY; // 5 minutos
  
  // TTL en segundos para Redis (convertir de ms a s)
  private readonly CONTEXT_CACHE_TTL_SECONDS = Math.floor(this.CONTEXT_CACHE_TTL / 1000);
  private readonly COMPANY_CACHE_TTL_SECONDS = Math.floor(this.COMPANY_CACHE_TTL / 1000);

  onModuleInit() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl);
      this.useRedis = true;
      
      this.redis.on('error', (error) => {
        this.logger.warn('Redis cache error, falling back to local cache:', error.message);
        this.useRedis = false;
      });
      
      this.redis.on('connect', () => {
        this.logger.log('Redis cache connected');
        this.useRedis = true;
      });
      
      // Iniciar limpieza automática de cache local (fallback)
      setInterval(() => this.cleanExpiredCache(), 60000); // Cada 60 segundos
      
      this.logger.log('ContextCacheService initialized with Redis cache');
    } catch (error) {
      this.logger.warn('Failed to initialize Redis cache, using local cache fallback:', error.message);
      this.useRedis = false;
      // Iniciar limpieza automática de cache local
      setInterval(() => this.cleanExpiredCache(), 60000);
    }
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  /**
   * Obtiene el contexto desde cache si está disponible y válido
   * Si no está en cache o expiró, ejecuta el loader
   */
  async getOrLoadContext(
    key: string,
    loader: () => Promise<ConversationState>
  ): Promise<ConversationState> {
    const cacheKey = `cache:context:${key}`;
    
    // Intentar usar Redis primero
    if (this.useRedis && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return parsed;
        }
      } catch (error) {
        this.logger.debug(`Redis cache miss or error for context ${key}, falling back to loader`);
        // Fall through to loader
      }
    }
    
    // Fallback a Map local
    const cached = this.contextCache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CONTEXT_CACHE_TTL) {
      return cached.context;
    }

    // Cargar desde loader
    const context = await loader();
    
    // Guardar en cache
    if (this.useRedis && this.redis) {
      try {
        await this.redis.setex(cacheKey, this.CONTEXT_CACHE_TTL_SECONDS, JSON.stringify(context));
      } catch (error) {
        this.logger.debug(`Failed to cache context in Redis, using local cache: ${error.message}`);
        // Fallback a Map local
        this.contextCache.set(key, { context, timestamp: now });
      }
    } else {
      // Usar Map local como fallback
      this.contextCache.set(key, { context, timestamp: now });
    }
    
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
    const cacheKey = `cache:company:${companyId}`;
    
    // Intentar usar Redis primero
    if (this.useRedis && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return parsed;
        }
      } catch (error) {
        this.logger.debug(`Redis cache miss or error for company ${companyId}, falling back to loader`);
        // Fall through to loader
      }
    }
    
    // Fallback a Map local
    const cached = this.companyCache.get(companyId);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.COMPANY_CACHE_TTL) {
      return cached.company;
    }

    // Cargar desde loader
    const company = await loader();
    
    // Guardar en cache
    if (company) {
      if (this.useRedis && this.redis) {
        try {
          await this.redis.setex(cacheKey, this.COMPANY_CACHE_TTL_SECONDS, JSON.stringify(company));
        } catch (error) {
          this.logger.debug(`Failed to cache company in Redis, using local cache: ${error.message}`);
          // Fallback a Map local
          this.companyCache.set(companyId, { company, timestamp: now });
        }
      } else {
        // Usar Map local como fallback
        this.companyCache.set(companyId, { company, timestamp: now });
      }
    }
    
    return company;
  }

  /**
   * Invalida el cache de contexto para una clave específica
   */
  async invalidateContext(key: string): Promise<void> {
    const cacheKey = `cache:context:${key}`;
    
    // Invalidar en Redis
    if (this.useRedis && this.redis) {
      try {
        await this.redis.del(cacheKey);
      } catch (error) {
        this.logger.debug(`Failed to invalidate context in Redis: ${error.message}`);
      }
    }
    
    // Invalidar en Map local también (fallback)
    this.contextCache.delete(key);
  }

  /**
   * Invalida el cache de empresa para un ID específico
   */
  async invalidateCompany(companyId: string): Promise<void> {
    const cacheKey = `cache:company:${companyId}`;
    
    // Invalidar en Redis
    if (this.useRedis && this.redis) {
      try {
        await this.redis.del(cacheKey);
      } catch (error) {
        this.logger.debug(`Failed to invalidate company in Redis: ${error.message}`);
      }
    }
    
    // Invalidar en Map local también (fallback)
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
      useRedis: this.useRedis,
      contexts: this.contextCache.size,
      companies: this.companyCache.size,
      contextTTL: this.CONTEXT_CACHE_TTL,
      companyTTL: this.COMPANY_CACHE_TTL,
    };
  }
}

