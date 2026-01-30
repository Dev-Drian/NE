import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Service, Prisma } from '@prisma/client';

/**
 * Configuración tipada del servicio (desde el campo JSON config)
 */
export interface ServiceConfig {
  // Común
  duration?: number;
  requiresDeposit?: boolean;
  depositPercentage?: number;
  advanceBookingDays?: number;
  requiresProducts?: boolean;
  
  // Para reservas de mesa
  minGuests?: number;
  maxGuests?: number;
  defaultDuration?: number;
  timeSlots?: string[];
  allowsPreOrder?: boolean;
  
  // Para domicilio
  minOrderAmount?: number;
  deliveryFee?: number;
  freeDeliveryThreshold?: number;
  estimatedDeliveryTime?: number;
  deliveryRadius?: number;
  paymentMethods?: string[];
  requiresAddress?: boolean;
  
  // Para clínicas
  requiresMedicalHistory?: boolean;
  requiresPreviousConsultation?: boolean;
  includesXray?: boolean;
  allowsUrgent?: boolean;
  
  // Preparación
  preparationTime?: number;
}

/**
 * Servicio con configuración tipada
 */
export interface ServiceWithConfig extends Omit<Service, 'config'> {
  config: ServiceConfig;
}

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);
  
  // Cache en memoria para evitar consultas repetidas
  private cache: Map<string, { services: ServiceWithConfig[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  constructor(private prisma: PrismaService) {}

  /**
   * Obtener todos los servicios activos de una empresa
   */
  async getServicesByCompany(companyId: string): Promise<ServiceWithConfig[]> {
    // Verificar cache
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`📦 Cache hit para servicios de empresa ${companyId.slice(0, 8)}...`);
      return cached.services;
    }

    this.logger.debug(`🔍 Cargando servicios de BD para empresa ${companyId.slice(0, 8)}...`);
    
    const services = await this.prisma.service.findMany({
      where: {
        companyId,
        active: true,
      },
      orderBy: { displayOrder: 'asc' },
    });

    const servicesWithConfig: ServiceWithConfig[] = services.map(s => ({
      ...s,
      config: (s.config as ServiceConfig) || {},
    }));

    // Guardar en cache
    this.cache.set(companyId, {
      services: servicesWithConfig,
      timestamp: Date.now(),
    });

    this.logger.debug(`✅ ${servicesWithConfig.length} servicios cargados: ${servicesWithConfig.map(s => s.key).join(', ')}`);
    return servicesWithConfig;
  }

  /**
   * Obtener un servicio por su key
   */
  async getServiceByKey(companyId: string, key: string): Promise<ServiceWithConfig | null> {
    const services = await this.getServicesByCompany(companyId);
    const service = services.find(s => s.key.toLowerCase() === key.toLowerCase());
    
    if (!service) {
      this.logger.debug(`⚠️ Servicio "${key}" no encontrado para empresa ${companyId.slice(0, 8)}...`);
    }
    
    return service || null;
  }

  /**
   * Obtener servicios disponibles (active && available)
   */
  async getAvailableServices(companyId: string): Promise<ServiceWithConfig[]> {
    const services = await this.getServicesByCompany(companyId);
    return services.filter(s => s.available);
  }

  /**
   * Detectar servicio por mensaje usando keywords
   */
  async detectServiceFromMessage(companyId: string, message: string): Promise<ServiceWithConfig | null> {
    const services = await this.getServicesByCompany(companyId);
    // Normalizar: quitar acentos y convertir a minúsculas
    const messageLower = message
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Buscar servicio que coincida con keywords (ordenados por displayOrder/prioridad)
    for (const service of services) {
      if (service.keywords && service.keywords.length > 0) {
        for (const keyword of service.keywords) {
          const keywordNormalized = keyword
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          
          if (messageLower.includes(keywordNormalized)) {
            this.logger.debug(`🎯 Servicio detectado: ${service.key} (keyword: "${keyword}")`);
            return service;
          }
        }
      }
    }

    this.logger.debug(`❌ No se detectó servicio en mensaje: "${message.slice(0, 50)}..."`);
    return null;
  }

  /**
   * Validar si un servicio existe y está disponible
   */
  async validateService(companyId: string, serviceKey: string): Promise<{
    valid: boolean;
    service?: ServiceWithConfig;
    availableServices?: ServiceWithConfig[];
    error?: string;
  }> {
    const service = await this.getServiceByKey(companyId, serviceKey);

    if (!service) {
      const available = await this.getAvailableServices(companyId);
      return {
        valid: false,
        availableServices: available,
        error: `Servicio "${serviceKey}" no encontrado`,
      };
    }

    if (!service.available) {
      const available = await this.getAvailableServices(companyId);
      return {
        valid: false,
        service,
        availableServices: available,
        error: `El servicio "${service.name}" no está disponible en este momento`,
      };
    }

    return { valid: true, service };
  }

  /**
   * Obtener campos requeridos para un servicio
   */
  async getRequiredFields(companyId: string, serviceKey: string): Promise<string[]> {
    const service = await this.getServiceByKey(companyId, serviceKey);
    return service?.requiredFields || ['fecha', 'hora']; // Fallback básico
  }

  /**
   * Obtener configuración específica de un servicio
   */
  async getServiceConfig(companyId: string, serviceKey: string): Promise<ServiceConfig> {
    const service = await this.getServiceByKey(companyId, serviceKey);
    return service?.config || {};
  }

  /**
   * Obtener categorías de productos permitidas para un servicio
   */
  async getAllowedProductCategories(companyId: string, serviceKey: string): Promise<string[]> {
    const service = await this.getServiceByKey(companyId, serviceKey);
    return service?.allowedProductCategories || [];
  }

  /**
   * Verificar si un servicio requiere productos
   */
  async requiresProducts(companyId: string, serviceKey: string): Promise<boolean> {
    const service = await this.getServiceByKey(companyId, serviceKey);
    return service?.config?.requiresProducts || service?.requiredFields?.includes('productos') || false;
  }

  /**
   * Verificar si un servicio requiere dirección
   */
  async requiresAddress(companyId: string, serviceKey: string): Promise<boolean> {
    const service = await this.getServiceByKey(companyId, serviceKey);
    return service?.config?.requiresAddress || service?.requiredFields?.includes('direccion') || false;
  }

  /**
   * Formatear servicios para mostrar al usuario
   */
  async formatServicesForDisplay(companyId: string, options?: {
    includeDescription?: boolean;
    includePrice?: boolean;
  }): Promise<string> {
    const services = await this.getAvailableServices(companyId);
    const { includeDescription = true, includePrice = true } = options || {};

    if (services.length === 0) {
      return 'No hay servicios disponibles en este momento.';
    }

    let text = '📋 *Nuestros Servicios*\n\n';
    
    for (const service of services) {
      text += `• *${service.name}*`;
      if (includePrice && service.basePrice) {
        text += ` - $${service.basePrice.toLocaleString('es-CO')}`;
      }
      text += '\n';
      if (includeDescription && service.description) {
        text += `  _${service.description}_\n`;
      }
    }

    return text.trim();
  }

  /**
   * Obtener servicios formateados para el prompt de IA
   */
  async getServicesForPrompt(companyId: string): Promise<object[]> {
    const services = await this.getAvailableServices(companyId);
    
    return services.map(s => ({
      key: s.key,
      name: s.name,
      description: s.description,
      requiredFields: s.requiredFields,
      optionalFields: s.optionalFields,
      keywords: s.keywords,
      price: s.basePrice,
      config: {
        requiresProducts: s.config?.requiresProducts,
        requiresAddress: s.config?.requiresAddress,
        minOrderAmount: s.config?.minOrderAmount,
        deliveryFee: s.config?.deliveryFee,
        requiresDeposit: s.config?.requiresDeposit,
        minGuests: s.config?.minGuests,
        maxGuests: s.config?.maxGuests,
      },
    }));
  }

  /**
   * Obtener mapa de servicios (key -> service) para acceso rápido
   * Compatible con el formato antiguo config.services
   */
  async getServicesMap(companyId: string): Promise<Record<string, ServiceWithConfig>> {
    const services = await this.getServicesByCompany(companyId);
    const map: Record<string, ServiceWithConfig> = {};
    
    for (const service of services) {
      map[service.key] = service;
    }
    
    return map;
  }

  /**
   * Obtener keys de todos los servicios disponibles
   */
  async getServiceKeys(companyId: string): Promise<string[]> {
    const services = await this.getAvailableServices(companyId);
    return services.map(s => s.key);
  }

  /**
   * Limpiar cache
   */
  clearCache(companyId?: string) {
    if (companyId) {
      this.cache.delete(companyId);
      this.logger.debug(`🗑️ Cache limpiado para empresa ${companyId.slice(0, 8)}...`);
    } else {
      this.cache.clear();
      this.logger.debug('🗑️ Cache completo de servicios limpiado');
    }
  }

  // ==================== CRUD (para admin) ====================

  async create(data: Prisma.ServiceCreateInput): Promise<Service> {
    const service = await this.prisma.service.create({ data });
    this.clearCache(service.companyId);
    return service;
  }

  async update(id: string, data: Prisma.ServiceUpdateInput): Promise<Service> {
    const service = await this.prisma.service.update({
      where: { id },
      data,
    });
    this.clearCache(service.companyId);
    return service;
  }

  async delete(id: string): Promise<void> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (service) {
      await this.prisma.service.delete({ where: { id } });
      this.clearCache(service.companyId);
    }
  }

  async findById(id: string): Promise<Service | null> {
    return this.prisma.service.findUnique({ where: { id } });
  }
}
