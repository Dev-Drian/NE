import { Injectable } from '@nestjs/common';
import { ReservationServiceStrategy } from './strategy/service-strategy.interface';
import { GenericServiceStrategy } from './strategy/generic-service.strategy';

/**
 * Registry para seleccionar la estrategia correcta.
 * Hoy: solo Generic (pero deja listo para agregar estrategias por key o por company.type).
 */
@Injectable()
export class ServiceRegistryService {
  constructor(private generic: GenericServiceStrategy) {}

  getReservationStrategy(_companyType: string, _serviceKey?: string): ReservationServiceStrategy {
    return this.generic;
  }
}
