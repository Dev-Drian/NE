import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { ReservationsService } from '../reservations/reservations.service';

export interface AvailabilityCheck {
  isAvailable: boolean;
  alternatives?: string[];
  message?: string;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private companiesService: CompaniesService,
    private reservationsService: ReservationsService,
  ) {}

  async check(
    companyId: string, 
    data: { date: string; time: string; guests?: number; userId?: string; service?: string }
  ): Promise<AvailabilityCheck> {
    const company = await this.companiesService.findOne(companyId);
    
    if (!company) {
      return {
        isAvailable: false,
        message: 'Empresa no encontrada',
      };
    }

    const config = company.config as any;
    const hours = config?.hours || {};
    const capacity = config?.capacity || 10;

    // Verificar horario de la empresa
    const date = new Date(data.date);
    const dayName = this.getDayName(date.getDay());
    const businessHours = hours[dayName];

    if (!businessHours) {
      return {
        isAvailable: false,
        message: `No hay servicio el ${dayName}`,
      };
    }

    const [openTime, closeTime] = businessHours.split('-');
    const requestedTime = data.time;

    if (!this.isTimeInRange(requestedTime, openTime, closeTime)) {
      return {
        isAvailable: false,
        message: `Horario de atención: ${openTime} - ${closeTime}`,
        alternatives: this.generateTimeAlternatives(openTime, closeTime),
      };
    }

    // Verificar reservas existentes
    const reservations = await this.reservationsService.findAll(companyId);
    const reservationsOnDate = reservations.filter(
      (r) => r.date === data.date && r.time === data.time && r.status !== 'cancelled',
    );

    // Validar si el usuario ya tiene una reserva para esta fecha/hora
    if (data.userId) {
      const userExistingReservation = reservationsOnDate.find(
        (r) => r.userId === data.userId,
      );
      
      if (userExistingReservation) {
        return {
          isAvailable: false,
          message: 'Ya tienes una reserva confirmada para esta fecha y hora.',
        };
      }
    }

    const requestedGuests = data.guests || 1;
    const services = config?.services;

    // Si hay servicios configurados y se especificó un servicio, validar por servicio
    if (services && data.service && services[data.service]) {
      return this.checkServiceAvailability(
        data.service,
        services[data.service],
        reservationsOnDate,
        requestedGuests,
        services,
        openTime,
        closeTime,
        requestedTime,
      );
    }

    // Validación por capacidad total (compatibilidad con sistema anterior)
    const totalGuests = reservationsOnDate.reduce((sum, r) => sum + r.guests, 0);

    if (totalGuests + requestedGuests > capacity) {
      const availableSpots = capacity - totalGuests;
      return {
        isAvailable: false,
        message: `No hay disponibilidad completa. Solo quedan ${availableSpots} ${availableSpots === 1 ? 'lugar' : 'lugares'} disponible${availableSpots === 1 ? '' : 's'}.`,
        alternatives: this.generateTimeAlternatives(openTime, closeTime, requestedTime),
      };
    }

    return {
      isAvailable: true,
    };
  }

  private checkServiceAvailability(
    requestedService: string,
    serviceConfig: { capacity: number; name: string },
    reservationsOnDate: any[],
    requestedGuests: number,
    allServices: any,
    openTime: string,
    closeTime: string,
    requestedTime: string,
  ): AvailabilityCheck {
    // Filtrar reservas solo del servicio solicitado
    const reservationsForService = reservationsOnDate.filter(
      (r) => r.service === requestedService,
    );

    const totalGuestsService = reservationsForService.reduce((sum, r) => sum + r.guests, 0);

    if (totalGuestsService + requestedGuests > serviceConfig.capacity) {
      const availableSpots = serviceConfig.capacity - totalGuestsService;
      
      // Generar alternativas de otros servicios disponibles
      const alternativeServices = this.generateServiceAlternatives(
        requestedService,
        allServices,
        reservationsOnDate,
      );

      let message = `No hay disponibilidad de ${serviceConfig.name}.`;
      if (availableSpots > 0) {
        message += ` Solo quedan ${availableSpots} ${availableSpots === 1 ? 'lugar' : 'lugares'} disponible${availableSpots === 1 ? '' : 's'}.`;
      }

      return {
        isAvailable: false,
        message,
        alternatives: alternativeServices.length > 0 
          ? alternativeServices 
          : this.generateTimeAlternatives(openTime, closeTime, requestedTime),
      };
    }

    return {
      isAvailable: true,
    };
  }

  private generateServiceAlternatives(
    requestedService: string,
    allServices: any,
    reservationsOnDate: any[],
  ): string[] {
    const alternatives: string[] = [];
    
    for (const [serviceKey, serviceConfig] of Object.entries(allServices)) {
      if (serviceKey === requestedService) continue;
      
      const serviceConfigTyped = serviceConfig as { capacity: number; name: string };
      const reservationsForService = reservationsOnDate.filter(
        (r) => r.service === serviceKey,
      );
      
      const totalGuestsService = reservationsForService.reduce((sum, r) => sum + r.guests, 0);
      const availableSpots = serviceConfigTyped.capacity - totalGuestsService;
      
      // Solo agregar servicios que tienen disponibilidad
      if (availableSpots > 0) {
        alternatives.push(serviceConfigTyped.name);
      }
    }

    return alternatives;
  }

  private getDayName(dayIndex: number): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayIndex];
  }

  private isTimeInRange(time: string, start: string, end: string): boolean {
    const timeMinutes = this.timeToMinutes(time);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private generateTimeAlternatives(start: string, end: string, excludeTime?: string): string[] {
    const alternatives: string[] = [];
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    const excludeMinutes = excludeTime ? this.timeToMinutes(excludeTime) : null;

    // Generar alternativas cada 30 minutos
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
      if (excludeMinutes && Math.abs(minutes - excludeMinutes) < 30) {
        continue;
      }
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      alternatives.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
      if (alternatives.length >= 3) break;
    }

    return alternatives;
  }
}

