import { Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { MessagesTemplatesService } from '../../messages-templates/messages-templates.service';
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
  reservationNoun: 'reserva' | 'pedido';
}

@Injectable()
export class ServiceConfigResolverService {
  constructor(private messagesTemplates: MessagesTemplatesService) {}

  /**
   * Normaliza el servicio seleccionado y construye:
   * - config para `ServiceValidatorService`
   * - labels para missing fields
   * - metadata UX (pedido vs reserva)
   */
  async resolve(company: Company, companyType: string, serviceKey?: string): Promise<ResolvedService> {
    const config = (company.config as any) || {};
    const availableServices: Record<string, any> = config.services || {};
    const hasMultipleServices = Object.keys(availableServices).length > 1;

    const rawServiceConfig = serviceKey ? availableServices[serviceKey] : undefined;
    const serviceName = rawServiceConfig?.name || (serviceKey ? serviceKey : undefined);

    // Defaults desde templates (compatibilidad). El override real debería venir de config.services[serviceKey]
    const settings = await this.messagesTemplates.getReservationSettings(companyType);

    const requiresProducts = rawServiceConfig?.requiresProducts === true;
    const requiresPayment = (rawServiceConfig?.requiresPayment === true) || company.requiresPayment === true;

    // Regla genérica:
    // - si el servicio requiere productos => no pedir guests
    // - si el servicio define requiresGuests explícito => respetar
    // - si no define => fallback a settings.requireGuests
    const requiresGuests =
      typeof rawServiceConfig?.requiresGuests === 'boolean'
        ? rawServiceConfig.requiresGuests
        : (settings.requireGuests === true && !requiresProducts);

    const requiresTable = rawServiceConfig?.requiresTable === true;
    const requiresAddress = rawServiceConfig?.requiresAddress === true || rawServiceConfig?.requiresLocation === true;

    const reservationNoun: 'reserva' | 'pedido' = serviceKey === 'domicilio' ? 'pedido' : 'reserva';

    const missingFieldLabels: Record<string, string> = {
      date: 'fecha',
      time: 'hora',
      phone: 'teléfono',
      guests: 'comensales',
      service: 'servicio',
      products: company.type === 'restaurant' ? 'productos' : 'tratamientos',
      tableId: 'mesa',
      address: 'dirección',
      location: 'ubicación',
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
        requiredFields: rawServiceConfig?.requiredFields, // Campos específicos del servicio
        name: serviceName,
        enabled: rawServiceConfig?.enabled !== false,
      },
      missingFieldLabels,
      reservationNoun,
    };
  }
}
