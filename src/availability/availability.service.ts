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

  async check(companyId: string, data: { date: string; time: string; guests?: number }): Promise<AvailabilityCheck> {
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

    // Verificar capacidad
    const reservations = await this.reservationsService.findAll(companyId);
    const reservationsOnDate = reservations.filter(
      (r) => r.date === data.date && r.time === data.time && r.status !== 'cancelled',
    );

    const totalGuests = reservationsOnDate.reduce((sum, r) => sum + r.guests, 0);
    const requestedGuests = data.guests || 1;

    if (totalGuests + requestedGuests > capacity) {
      return {
        isAvailable: false,
        message: 'No hay disponibilidad en este horario',
        alternatives: this.generateTimeAlternatives(openTime, closeTime, requestedTime),
      };
    }

    return {
      isAvailable: true,
    };
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

