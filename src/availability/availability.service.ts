import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { ReservationsService } from '../reservations/reservations.service';

export interface AvailabilityCheck {
  isAvailable: boolean;
  alternatives?: string[];
  message?: string;
  reason?: string; // Razón de no disponibilidad: 'time_out_of_range', 'capacity_full', 'duplicate', 'appointment_taken', etc.
  availableSlots?: string[]; // Horarios disponibles para el día
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
    const resources = config?.resources || [];
    
    // Calcular capacidad total basada en resources
    let capacity = config?.capacity || 10; // Fallback al valor antiguo
    if (resources.length > 0) {
      capacity = resources.reduce((sum: number, r: any) => sum + (r.capacity || 0), 0);
    }

    // VALIDACIÓN 1: Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.date)) {
      return {
        isAvailable: false,
        message: '❌ Formato de fecha inválido. Por favor usa el formato YYYY-MM-DD (ej: 2025-01-25).',
      };
    }

    // VALIDACIÓN 2: Validar que la fecha es válida (no 32 de enero, etc.)
    const [year_req, month_req, day_req] = data.date.split('-').map(Number);
    const testDate = new Date(year_req, month_req - 1, day_req);
    if (
      testDate.getFullYear() !== year_req ||
      testDate.getMonth() !== month_req - 1 ||
      testDate.getDate() !== day_req
    ) {
      return {
        isAvailable: false,
        message: '❌ Fecha inválida (ej: 32 de enero). Por favor elige una fecha válida.',
      };
    }

    // VALIDACIÓN 3: No permitir reservas en el pasado
    const now = new Date();
    const [hours_req, minutes_req] = data.time.split(':').map(Number);
    const requestedDateTime = new Date(year_req, month_req - 1, day_req, hours_req, minutes_req);
    
    if (requestedDateTime < now) {
      return {
        isAvailable: false,
        message: '❌ No puedes hacer reservas para fechas u horas pasadas. Por favor elige una fecha y hora futura.',
      };
    }
    
    // VALIDACIÓN 4: Tiempo mínimo de anticipación (por defecto 1 hora)
    const minAdvanceHours = config?.minAdvanceHours || 1;
    const hoursUntilReservation = (requestedDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursUntilReservation < minAdvanceHours) {
      return {
        isAvailable: false,
        message: `⏰ Las reservas deben hacerse con al menos ${minAdvanceHours} hora${minAdvanceHours > 1 ? 's' : ''} de anticipación. Por favor elige un horario más tarde.`,
      };
    }

    // Verificar horario de la empresa
    // IMPORTANTE: Parsear la fecha correctamente para evitar problemas de zona horaria
    const [year, month, day] = data.date.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month es 0-indexed
    const dayName = this.getDayName(date.getDay());
    const businessHours = hours[dayName];

    if (!businessHours || businessHours.toLowerCase() === 'cerrado') {
      // Obtener siguiente día disponible
      const nextAvailableDay = this.getNextAvailableDay(date, hours);
      const nextDayName = this.getDayName(nextAvailableDay.getDay());
      const nextDaySpanish = this.getDayNameSpanish(nextDayName);
      const nextDateStr = nextAvailableDay.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      
      return {
        isAvailable: false,
        message: `❌ Lo siento, estamos cerrados los ${this.getDayNameSpanish(dayName)}. ¿Te gustaría agendar para ${nextDateStr}?`,
        alternatives: this.getAvailableDays(hours, date),
        reason: 'closed_day',
      };
    }

    // Validar formato de horario
    if (!businessHours.includes('-')) {
      return {
        isAvailable: false,
        message: `Horario no configurado correctamente para ${dayName}`,
      };
    }

    const [openTime, closeTime] = businessHours.split('-');
    const requestedTime = data.time;

    // Validar que tenemos tiempo solicitado
    if (!requestedTime) {
      return {
        isAvailable: false,
        message: 'Por favor indica la hora para tu reserva',
      };
    }

    if (!this.isTimeInRange(requestedTime, openTime, closeTime)) {
      // Generar alternativas más inteligentes (horas cercanas a la solicitada)
      const alternatives = this.generateTimeAlternatives(openTime, closeTime, requestedTime);
      
      return {
        isAvailable: false,
        message: `Horario de atención: ${openTime} - ${closeTime}`,
        alternatives,
        reason: 'time_out_of_range', // Agregar razón para mejor manejo
      };
    }

    // Verificar reservas existentes
    const reservations = await this.reservationsService.findAll(companyId);
    const reservationsOnDate = reservations.filter(
      (r) => r.date === data.date && r.time === data.time && r.status !== 'cancelled',
    );

    // LOG PARA DEPURACIÓN
    console.log('\n========== AVAILABILITY.CHECK ==========');
    console.log('📅 Buscando reservas para fecha:', data.date, 'hora:', data.time);
    console.log('🔢 Total reservas encontradas en BD:', reservations.length);
    console.log('🔢 Reservas para esta fecha/hora:', reservationsOnDate.length);
    if (reservationsOnDate.length > 0) {
      console.log('📋 Reservas encontradas:', reservationsOnDate.map(r => ({
        id: r.id,
        userId: r.userId,
        date: r.date,
        time: r.time,
        service: r.service,
        status: r.status,
      })));
    }
    console.log('🛠️ Servicio solicitado:', data.service);
    console.log('🏢 serviceTypes disponibles:', Object.keys(config?.services || {}));
    console.log('=========================================\n');

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
    const serviceTypes = config?.services;

    // Si hay servicios configurados y se especificó un servicio, validar por servicio
    console.log('🔍 Verificando si hay serviceTypes y service...');
    console.log('   serviceTypes existe:', !!serviceTypes);
    console.log('   data.service:', data.service);
    console.log('   serviceTypes[data.service]:', serviceTypes?.[data.service!]);
    
    if (serviceTypes && data.service && serviceTypes[data.service]) {
      console.log('✅ Entrando a checkServiceAvailability');
      return this.checkServiceAvailability(
        data.service,
        serviceTypes[data.service],
        reservationsOnDate,
        requestedGuests,
        serviceTypes,
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
    serviceConfig: { capacity?: number; name: string },
    reservationsOnDate: any[],
    requestedGuests: number,
    allServices: any,
    openTime: string,
    closeTime: string,
    requestedTime: string,
  ): AvailabilityCheck {
    // LOG PARA DEPURACIÓN
    console.log('\n========== checkServiceAvailability ==========');
    console.log('🛠️ requestedService:', requestedService);
    console.log('⚙️ serviceConfig:', serviceConfig);
    console.log('🔢 reservationsOnDate (total):', reservationsOnDate.length);
    
    // Filtrar reservas solo del servicio solicitado
    const reservationsForService = reservationsOnDate.filter(
      (r) => r.service === requestedService,
    );
    
    console.log('🔢 reservationsForService (filtradas por servicio):', reservationsForService.length);
    if (reservationsForService.length > 0) {
      console.log('📋 Reservas del servicio:', reservationsForService.map(r => ({
        id: r.id,
        service: r.service,
        time: r.time,
        status: r.status,
      })));
    }

    // Para servicios de tipo "cita", la capacidad es 1 por horario (una cita a la vez)
    // Si no tiene capacity definido, asumimos que es un servicio de citas (1 a la vez)
    const capacity = serviceConfig.capacity ?? 1;
    console.log('📊 Capacidad del servicio:', capacity);
    
    // Si la capacidad es 1 (típico de citas), verificar si ya hay alguna reserva
    // para este mismo horario exacto
    if (capacity === 1 && reservationsForService.length > 0) {
      console.log('❌ CONFLICTO DETECTADO: Ya hay una cita para este horario');
      // Generar horarios disponibles excluyendo los ocupados
      const occupiedTimes = reservationsForService.map(r => r.time);
      const availableSlots = this.generateAvailableSlotsExcluding(openTime, closeTime, occupiedTimes);
      
      // Ya hay una cita para este horario
      return {
        isAvailable: false,
        message: `❌ Ya hay una ${serviceConfig.name?.toLowerCase() || 'cita'} programada para este horario.`,
        alternatives: availableSlots.slice(0, 5), // Mostrar máximo 5 alternativas
        availableSlots,
        reason: 'appointment_taken',
      };
    }
    
    console.log('✅ No hay conflicto de citas');
    console.log('==============================================\n');

    const totalGuestsService = reservationsForService.reduce((sum, r) => sum + r.guests, 0);

    if (totalGuestsService + requestedGuests > capacity) {
      const availableSpots = capacity - totalGuestsService;
      
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

  private getDayNameSpanish(dayName: string): string {
    const translations: Record<string, string> = {
      sunday: 'domingos',
      monday: 'lunes',
      tuesday: 'martes',
      wednesday: 'miércoles',
      thursday: 'jueves',
      friday: 'viernes',
      saturday: 'sábados',
    };
    return translations[dayName] || dayName;
  }

  private getNextAvailableDay(currentDate: Date, hours: Record<string, string>): Date {
    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    // Buscar hasta 7 días adelante
    for (let i = 0; i < 7; i++) {
      const dayName = this.getDayName(nextDate.getDay());
      const businessHours = hours[dayName];
      
      if (businessHours && businessHours.toLowerCase() !== 'cerrado') {
        return nextDate;
      }
      
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    return nextDate;
  }

  private getAvailableDays(hours: Record<string, string>, fromDate: Date): string[] {
    const availableDays: string[] = [];
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    let checkDate = new Date(fromDate);
    checkDate.setDate(checkDate.getDate() + 1);
    
    // Buscar próximos 7 días disponibles
    for (let i = 0; i < 7 && availableDays.length < 3; i++) {
      const dayName = this.getDayName(checkDate.getDay());
      const businessHours = hours[dayName];
      
      if (businessHours && businessHours.toLowerCase() !== 'cerrado') {
        const daySpanish = this.getDayNameSpanish(dayName);
        const dateStr = checkDate.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        availableDays.push(`${daySpanish} ${dateStr}`);
      }
      
      checkDate.setDate(checkDate.getDate() + 1);
    }
    
    return availableDays;
  }

  private isTimeInRange(time: string, start: string, end: string): boolean {
    if (!time || !start || !end) {
      return false;
    }
    const timeMinutes = this.timeToMinutes(time);
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
  }

  private timeToMinutes(time: string): number {
    if (!time || !time.includes(':')) {
      return 0;
    }
    const [hours, minutes] = time.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  }

  private generateTimeAlternatives(start: string, end: string, excludeTime?: string): string[] {
    const alternatives: string[] = [];
    const startMinutes = this.timeToMinutes(start);
    const endMinutes = this.timeToMinutes(end);
    const excludeMinutes = excludeTime ? this.timeToMinutes(excludeTime) : null;

    // Si hay una hora excluida (fuera del rango), generar alternativas cercanas
    if (excludeMinutes) {
      // Si la hora está antes del horario, sugerir las primeras horas disponibles
      if (excludeMinutes < startMinutes) {
        for (let minutes = startMinutes; minutes <= Math.min(startMinutes + 120, endMinutes); minutes += 30) {
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;
          alternatives.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
          if (alternatives.length >= 3) break;
        }
      }
      // Si la hora está después del horario, sugerir las últimas horas disponibles
      else if (excludeMinutes > endMinutes) {
        for (let minutes = Math.max(endMinutes - 120, startMinutes); minutes <= endMinutes; minutes += 30) {
          const hours = Math.floor(minutes / 60);
          const mins = minutes % 60;
          alternatives.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
          if (alternatives.length >= 3) break;
        }
        // Revertir para mostrar las más cercanas primero
        alternatives.reverse();
      }
    }

    // Si no hay alternativas generadas o son pocas, generar las primeras disponibles
    if (alternatives.length < 3) {
      for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
        if (excludeMinutes && Math.abs(minutes - excludeMinutes) < 30) {
          continue;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        if (!alternatives.includes(timeStr)) {
          alternatives.push(timeStr);
        }
        if (alternatives.length >= 3) break;
      }
    }

    return alternatives;
  }

  /**
   * Genera horarios disponibles excluyendo los que ya están ocupados
   */
  private generateAvailableSlotsExcluding(openTime: string, closeTime: string, occupiedTimes: string[]): string[] {
    const availableSlots: string[] = [];
    const startMinutes = this.timeToMinutes(openTime);
    const endMinutes = this.timeToMinutes(closeTime);
    
    // Convertir horarios ocupados a minutos para comparación rápida
    const occupiedMinutes = new Set(occupiedTimes.map(t => this.timeToMinutes(t)));
    
    // Generar slots cada 30 minutos
    for (let minutes = startMinutes; minutes <= endMinutes - 30; minutes += 30) {
      if (!occupiedMinutes.has(minutes)) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        availableSlots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
      }
    }
    
    return availableSlots;
  }

  /**
   * Verifica si una cita médica está disponible para una fecha/hora específica
   * y retorna horarios alternativos si está ocupada
   */
  async checkAppointmentAvailability(
    companyId: string,
    date: string,
    time: string,
    service: string,
    productId?: string, // ID del tratamiento/servicio específico
  ): Promise<AvailabilityCheck> {
    const company = await this.companiesService.findOne(companyId);
    if (!company) {
      return { isAvailable: false, message: 'Empresa no encontrada' };
    }

    const config = company.config as any;
    const hours = config?.hours || {};
    const products = config?.products || [];

    // Obtener duración del tratamiento (default 30 min)
    let duration = 30;
    if (productId) {
      const product = products.find((p: any) => p.id === productId);
      if (product?.duration) {
        duration = product.duration;
      }
    }

    // Obtener horario de trabajo del día
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayName = this.getDayName(dateObj.getDay());
    const businessHours = hours[dayName];

    if (!businessHours || businessHours.toLowerCase() === 'cerrado') {
      return {
        isAvailable: false,
        message: `Estamos cerrados los ${this.getDayNameSpanish(dayName)}.`,
        reason: 'closed_day',
      };
    }

    const [openTime, closeTime] = businessHours.split('-');

    // Buscar todas las citas del día para este servicio
    const reservations = await this.reservationsService.findAll(companyId);
    const appointmentsOnDate = reservations.filter(
      (r) => r.date === date && r.status !== 'cancelled' && r.service === service
    );

    // Verificar si el horario solicitado está ocupado
    const requestedMinutes = this.timeToMinutes(time);
    const requestedEnd = requestedMinutes + duration;
    
    for (const appointment of appointmentsOnDate) {
      const appointmentMinutes = this.timeToMinutes(appointment.time);
      
      // Obtener duración de la cita existente
      let existingDuration = 30;
      const metadata = appointment.metadata as any;
      if (metadata?.products?.[0]?.id) {
        const existingProduct = products.find((p: any) => p.id === metadata.products[0].id);
        if (existingProduct?.duration) {
          existingDuration = existingProduct.duration;
        }
      }
      
      const existingEnd = appointmentMinutes + existingDuration;
      
      // Verificar TODAS las formas de colisión:
      // 1. La nueva cita empieza durante otra cita existente (incluyendo misma hora exacta)
      // 2. La nueva cita termina durante otra cita existente
      // 3. La nueva cita cubre completamente una cita existente
      // 4. Una cita existente cubre completamente la nueva cita
      
      const startsInExisting = requestedMinutes >= appointmentMinutes && requestedMinutes < existingEnd;
      const endsInExisting = requestedEnd > appointmentMinutes && requestedEnd <= existingEnd;
      const coversExisting = requestedMinutes <= appointmentMinutes && requestedEnd >= existingEnd;
      const coveredByExisting = appointmentMinutes <= requestedMinutes && existingEnd >= requestedEnd;
      
      if (startsInExisting || endsInExisting || coversExisting || coveredByExisting) {
        const availableSlots = this.getAvailableAppointmentSlots(
          openTime,
          closeTime,
          appointmentsOnDate,
          products,
          duration,
        );
        
        // Formatear la hora de la cita existente para mostrar
        const existingTimeFormatted = this.formatTimeReadable(appointment.time);
        
        return {
          isAvailable: false,
          message: `❌ Ya hay una cita programada para las ${existingTimeFormatted}.`,
          reason: 'appointment_taken',
          alternatives: availableSlots.slice(0, 5),
          availableSlots,
        };
      }
    }

    return { isAvailable: true };
  }

  /**
   * Obtiene todos los horarios disponibles para citas en un día
   */
  private getAvailableAppointmentSlots(
    openTime: string,
    closeTime: string,
    existingAppointments: any[],
    products: any[],
    requestedDuration: number,
  ): string[] {
    const availableSlots: string[] = [];
    const startMinutes = this.timeToMinutes(openTime);
    const endMinutes = this.timeToMinutes(closeTime);
    
    // Crear lista de horarios ocupados con su duración
    const occupiedSlots: Array<{ start: number; end: number }> = [];
    
    for (const appointment of existingAppointments) {
      const appointmentStart = this.timeToMinutes(appointment.time);
      let duration = 30;
      
      const metadata = appointment.metadata as any;
      if (metadata?.products?.[0]?.id) {
        const product = products.find((p: any) => p.id === metadata.products[0].id);
        if (product?.duration) {
          duration = product.duration;
        }
      }
      
      occupiedSlots.push({
        start: appointmentStart,
        end: appointmentStart + duration,
      });
    }
    
    // Ordenar por hora de inicio
    occupiedSlots.sort((a, b) => a.start - b.start);
    
    // Generar slots cada 30 minutos y verificar si están disponibles
    for (let minutes = startMinutes; minutes <= endMinutes - requestedDuration; minutes += 30) {
      const slotEnd = minutes + requestedDuration;
      
      // Verificar si este slot colisiona con alguna cita existente
      let isOccupied = false;
      for (const occupied of occupiedSlots) {
        // Hay colisión si el nuevo slot empieza o termina durante uno ocupado
        if ((minutes >= occupied.start && minutes < occupied.end) ||
            (slotEnd > occupied.start && slotEnd <= occupied.end) ||
            (minutes <= occupied.start && slotEnd >= occupied.end)) {
          isOccupied = true;
          break;
        }
      }
      
      if (!isOccupied) {
        availableSlots.push(this.minutesToTime(minutes));
      }
    }
    
    return availableSlots;
  }

  /**
   * Convierte minutos a formato de hora HH:MM
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Formatea una hora HH:MM a formato legible (ej: "2:00 PM")
   */
  private formatTimeReadable(time: string): string {
    if (!time || !time.includes(':')) return time;
    
    const [hoursStr, minsStr] = time.split(':');
    let hours = parseInt(hoursStr, 10);
    const mins = parseInt(minsStr, 10);
    const period = hours >= 12 ? 'PM' : 'AM';
    
    if (hours === 0) {
      hours = 12;
    } else if (hours > 12) {
      hours -= 12;
    }
    
    const minsFormatted = mins === 0 ? '' : `:${mins.toString().padStart(2, '0')}`;
    return `${hours}${minsFormatted} ${period}`;
  }
}

