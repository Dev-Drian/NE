import { Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { ReservationServiceStrategy, ServiceResolution } from './service-strategy.interface';
import { ServiceConfigResolverService } from '../service-config-resolver.service';

@Injectable()
export class GenericServiceStrategy implements ReservationServiceStrategy {
  constructor(private resolver: ServiceConfigResolverService) {}

  async resolve(company: Company, companyType: string, serviceKey?: string): Promise<ServiceResolution> {
    const resolved = await this.resolver.resolve(company, companyType, serviceKey);

    return {
      validatorConfig: resolved.validatorConfig,
      missingFieldLabels: resolved.missingFieldLabels,
      hasMultipleServices: resolved.hasMultipleServices,
      availableServices: resolved.availableServices,
      rawServiceConfig: resolved.rawServiceConfig,
      reservationNoun: resolved.reservationNoun,
    };
  }
}
