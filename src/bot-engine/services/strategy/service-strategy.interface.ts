import { Company } from '@prisma/client';
import { ServiceConfig } from '../service-validator.service';

export interface ServiceResolution {
  validatorConfig: ServiceConfig;
  missingFieldLabels: Record<string, string>;
  hasMultipleServices: boolean;
  availableServices: Record<string, any>;
  rawServiceConfig?: any;
  reservationNoun: 'reserva' | 'pedido' | 'cita';
}

export interface ReservationServiceStrategy {
  resolve(company: Company, companyType: string, serviceKey?: string): Promise<ServiceResolution>;

  /**
   * Hook opcional: permite aplicar normalizaciones adicionales a `collectedData`.
   */
  normalizeCollectedData?(collectedData: any, resolution: ServiceResolution): any;
}
