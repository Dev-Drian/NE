import { Injectable, Logger } from '@nestjs/common';
import { Company } from '@prisma/client';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
import { ServicesService } from '../../services/services.service';
import { ServiceConfig } from './service-validator.service';

export interface ResolvedService {
  serviceKey?: string;
  serviceName?: string;
  hasMultipleServices: boolean;
  availableServices: Record<string, any>;
  rawServiceConfig?: any;
  validatorConfig: ServiceConfig;
  missingFieldLabels: Record<string, string>;
  // Para usar en copy/UX
  reservationNoun: 'reserva' | 'pedido' | 'cita';
}

@Injectable()
export class ServiceConfigResolverService {
  private readonly logger = new Logger(ServiceConfigResolverService.name);
  
  constructor(
    private messagesTemplates: MessagesTemplatesService,
    private servicesService: ServicesService,
  ) {}

  /**
   * Normaliza el servicio seleccionado y construye:
   * - config para `ServiceValidatorService`
   * - labels para missing fields
   * - metadata UX (pedido vs reserva)
   */
  async resolve(company: Company, companyType: string, serviceKey?: string): Promise<ResolvedService> {
    // Obtener servicios desde la tabla Service (no productos)
    const dbServices = await this.servicesService.getServicesByCompany(company.id);
    
    // Construir availableServices desde BD
    const availableServices: Record<string, any> = {};
    for (const service of dbServices) {
      const serviceConfig = (service.config as any) || {};
      this.logger.debug(`📦 Service ${service.key} config JSON: ${JSON.stringify(serviceConfig)}`);
      availableServices[service.key] = {
        name: service.name,
        description: service.description,
        enabled: service.active && service.available,
        requiredFields: service.requiredFields || [],
        optionalFields: service.optionalFields || [],
        allowedProductCategories: service.allowedProductCategories || [],
        keywords: service.keywords || [],
        basePrice: service.basePrice,
        ...serviceConfig, // config JSON adicional (minGuests, maxGuests, etc.)
      };
    }
    
    this.logger.debug(`📋 Servicios disponibles para ${company.slug}: ${Object.keys(availableServices).join(', ')}`);
    
    const hasMultipleServices = Object.keys(availableServices).length > 1;

    const rawServiceConfig = serviceKey ? availableServices[serviceKey] : undefined;
    const serviceName = rawServiceConfig?.name || (serviceKey ? serviceKey : undefined);
    
    if (serviceKey && rawServiceConfig) {
      this.logger.debug(`🎯 Servicio seleccionado: ${serviceKey}, requiredFields: ${JSON.stringify(rawServiceConfig.requiredFields)}`);
      this.logger.debug(`💳 Config pago: requiresPayment=${rawServiceConfig?.requiresPayment}, depositPercentage=${rawServiceConfig?.depositPercentage}, basePrice=${rawServiceConfig?.basePrice}`);
    }

    // Defaults desde templates (compatibilidad). El override real debería venir de config.services[serviceKey]
    const settings = await this.messagesTemplates.getReservationSettings(companyType);

    const requiresProducts = rawServiceConfig?.requiresProducts === true;
    const requiresPayment = (rawServiceConfig?.requiresPayment === true) || company.requiresPayment === true;
    
    // requiresResources: valida disponibilidad de mesas, citas, etc.
    // Puede venir de requiresResources, requiresTable, o isAppointmentBased
    const requiresResources = rawServiceConfig?.requiresResources === true || 
                              rawServiceConfig?.requiresTable === true || 
                              rawServiceConfig?.isAppointmentBased === true;

    // Regla genérica:
    // - si el servicio requiere productos => no pedir guests
    // - si el servicio define requiresGuests explícito => respetar
    // - si no define => fallback a settings.requireGuests
    const requiresGuests =
      typeof rawServiceConfig?.requiresGuests === 'boolean'
        ? rawServiceConfig.requiresGuests
        : (settings.requireGuests === true && !requiresProducts);

    const requiresTable = rawServiceConfig?.requiresTable === true || requiresResources;
    const requiresAddress = rawServiceConfig?.requiresAddress === true || rawServiceConfig?.requiresLocation === true;

    // Determinar el sustantivo correcto según la configuración del servicio
    // Prioridad: config explícito > requiresAddress (pedido) > isAppointmentBased (cita) > default (reserva)
    let reservationNoun: 'reserva' | 'pedido' | 'cita' = 'reserva';
    if (rawServiceConfig?.reservationNoun) {
      reservationNoun = rawServiceConfig.reservationNoun;
    } else if (requiresAddress || rawServiceConfig?.isDelivery) {
      reservationNoun = 'pedido';
    } else if (rawServiceConfig?.isAppointmentBased || rawServiceConfig?.requiresAppointmentCheck || requiresResources) {
      reservationNoun = 'cita';
    }

    const missingFieldLabels: Record<string, string> = {
      // Campos estándar - claves en inglés, labels en español para el usuario
      date: 'fecha',
      time: 'hora',
      phone: 'teléfono',
      guests: 'personas',
      name: 'nombre',
      email: 'email',
      address: 'dirección',
      products: company.type === 'restaurant' ? 'productos' : 'tratamientos',
      tableId: 'mesa',
      notes: 'notas',
      service: 'servicio',
      // Campos opcionales comunes
      occasion: 'ocasión especial',
      event_type: 'tipo de evento',
      arrival_time: 'hora de llegada',
      departure_time: 'hora de salida',
      pets: 'mascotas',
      additional_services: 'servicios adicionales',
      symptoms: 'síntomas',
      first_time: 'primera vez',
      whitening_type: 'tipo de blanqueamiento',
      treatment_type: 'tipo de tratamiento',
      tooth: 'pieza dental',
      wisdom_tooth: 'cordal',
      therapist: 'terapeuta',
      skin_type: 'tipo de piel',
      // Tienda de ropa
      visit_date: 'fecha de visita',
      visit_time: 'hora de visita',
      advisory: 'asesoría',
      payment_method: 'método de pago',
      size: 'talla',
      gift: 'regalo',
      hold_days: 'plazo en días',
      budget: 'presupuesto',
      style: 'estilo',
      alteration_type: 'tipo de arreglo',
      delivery_date: 'fecha de entrega',
      garment: 'prenda',
      product: 'producto',
      color: 'color',
      urgent: 'urgente',
    };

    // Permitir que cada servicio redefina labels
    if (rawServiceConfig?.missingFieldLabels && typeof rawServiceConfig.missingFieldLabels === 'object') {
      Object.assign(missingFieldLabels, rawServiceConfig.missingFieldLabels);
    }

    return {
      serviceKey,
      serviceName,
      hasMultipleServices,
      availableServices,
      rawServiceConfig,
      validatorConfig: {
        requiresProducts,
        requiresGuests,
        requiresTable,
        requiresPayment,
        requiresAddress,
        requiresResources, // Valida disponibilidad de mesas, citas, etc.
        requiredFields: rawServiceConfig?.requiredFields, // Campos específicos del servicio
        optionalFields: rawServiceConfig?.optionalFields, // Campos opcionales del servicio
        name: serviceName,
        enabled: rawServiceConfig?.enabled !== false,
        // Información de pago (se usa automáticamente, NO se pregunta al usuario)
        basePrice: rawServiceConfig?.basePrice || null,
        depositPercentage: rawServiceConfig?.depositPercentage || rawServiceConfig?.requiresDeposit ? (rawServiceConfig?.depositPercentage || 100) : null,
        deliveryFee: rawServiceConfig?.deliveryFee || 0,
      },
      missingFieldLabels,
      reservationNoun,
    };
  }
}
