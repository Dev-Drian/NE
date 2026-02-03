import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ServiceKeywordMatch {
  serviceKey: string;
  confidence: number;
  keyword: string;
}

@Injectable()
export class KeywordsService implements OnModuleInit {
  private readonly logger = new Logger(KeywordsService.name);
  private cache: Map<string, ServiceKeywordData[]> = new Map();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadCache();
    this.logger.log('KeywordsService initialized with cache');
  }

  /**
   * Busca un servicio basado en keywords en el mensaje
   * Retorna null si no encuentra match (para usar IA como fallback)
   */
  async findServiceByKeyword(
    message: string,
    companyId?: string,
  ): Promise<ServiceKeywordMatch | null> {
    // Refrescar cache si es necesario
    await this.refreshCacheIfNeeded();

    // Normalizar mensaje
    const normalized = this.normalizeText(message);

    // Obtener keywords para esta empresa (o globales)
    const keywords = this.getKeywordsForCompany(companyId);

    // Buscar match
    for (const keyword of keywords) {
      if (this.matches(normalized, keyword.keyword, keyword.type)) {
        this.logger.debug(
          `Keyword match found: "${keyword.keyword}" → service: "${keyword.serviceKey}" (confidence: ${keyword.weight})`,
        );
        return {
          serviceKey: keyword.serviceKey,
          confidence: keyword.weight,
          keyword: keyword.keyword,
        };
      }
    }

    // No se encontró match
    return null;
  }

  /**
   * Normaliza texto para comparación (quita acentos, lowercase)
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Verifica si el mensaje coincide con el keyword según el tipo
   */
  private matches(
    normalizedMessage: string,
    keyword: string,
    type: string,
  ): boolean {
    const normalizedKeyword = this.normalizeText(keyword);

    switch (type) {
      case 'exact':
        return normalizedMessage === normalizedKeyword;
      case 'contains':
        return normalizedMessage.includes(normalizedKeyword);
      case 'regex':
        try {
          return new RegExp(keyword, 'i').test(normalizedMessage);
        } catch (e) {
          this.logger.warn(`Invalid regex pattern: ${keyword}`);
          return false;
        }
      default:
        // Por defecto, usar contains
        return normalizedMessage.includes(normalizedKeyword);
    }
  }

  /**
   * Obtiene keywords para una empresa específica (o globales si no hay companyId)
   */
  private getKeywordsForCompany(companyId?: string): ServiceKeywordData[] {
    const globalKeywords = this.cache.get('global') || [];
    const companyKeywords = companyId
      ? this.cache.get(companyId) || []
      : [];

    // Combinar: primero globales, luego específicos de empresa
    // Los específicos de empresa tienen prioridad
    return [...globalKeywords, ...companyKeywords];
  }

  /**
   * Refresca el cache si ha pasado el TTL
   */
  private async refreshCacheIfNeeded() {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.CACHE_TTL) {
      await this.loadCache();
    }
  }

  /**
   * Carga todos los keywords activos en cache
   * Combina keywords de la tabla ServiceKeyword + keywords del array en Service
   */
  private async loadCache() {
    try {
      // 1. Cargar keywords de la tabla ServiceKeyword (legacy/específicos)
      const legacyKeywords = await this.prisma.serviceKeyword.findMany({
        where: { active: true },
        orderBy: [{ companyId: 'asc' }, { weight: 'desc' }],
      });

      this.cache.clear();

      // Agrupar keywords legacy por companyId (null = global)
      legacyKeywords.forEach((k) => {
        const key = k.companyId || 'global';
        if (!this.cache.has(key)) {
          this.cache.set(key, []);
        }
        this.cache.get(key)!.push({
          serviceKey: k.serviceKey,
          keyword: k.keyword,
          type: k.type,
          weight: k.weight,
        });
      });

      // 2. Cargar keywords desde Service.keywords (array dinámico)
      const services = await this.prisma.service.findMany({
        where: { active: true },
        select: {
          key: true,
          keywords: true,
          companyId: true,
        },
      });

      // Agregar keywords de Service al cache
      services.forEach((service) => {
        if (!service.keywords || service.keywords.length === 0) return;

        const key = service.companyId || 'global';
        if (!this.cache.has(key)) {
          this.cache.set(key, []);
        }

        // Agregar cada keyword del servicio (con peso 0.85 - alta confianza)
        service.keywords.forEach((keyword) => {
          // Evitar duplicados
          const existing = this.cache.get(key)!.find(
            (k) => k.keyword.toLowerCase() === keyword.toLowerCase() && k.serviceKey === service.key
          );
          if (!existing) {
            this.cache.get(key)!.push({
              serviceKey: service.key,
              keyword: keyword,
              type: 'contains', // Por defecto buscar si contiene
              weight: 0.85, // Alta confianza para keywords del servicio
            });
          }
        });
      });

      this.lastCacheUpdate = Date.now();
      
      let totalKeywords = 0;
      this.cache.forEach((keywords) => {
        totalKeywords += keywords.length;
      });
      
      this.logger.log(
        `Cache loaded: ${legacyKeywords.length} legacy + ${totalKeywords - legacyKeywords.length} from services = ${totalKeywords} total keywords (${this.cache.size} groups)`,
      );
    } catch (error) {
      this.logger.error('Error loading keywords cache:', error);
      // Si hay error, continuar con cache vacío (IA se encargará)
    }
  }

  /**
   * Fuerza recarga del cache (útil para testing o después de actualizar keywords)
   */
  async reloadCache() {
    await this.loadCache();
  }

  /**
   * Obtiene estadísticas del cache
   */
  getCacheStats() {
    let totalKeywords = 0;
    this.cache.forEach((keywords) => {
      totalKeywords += keywords.length;
    });

    return {
      groups: this.cache.size,
      totalKeywords,
      lastUpdate: new Date(this.lastCacheUpdate),
      ttl: this.CACHE_TTL,
    };
  }
}

interface ServiceKeywordData {
  serviceKey: string;
  keyword: string;
  type: string;
  weight: number;
}

