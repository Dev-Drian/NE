import { Injectable } from '@nestjs/common';

interface DateReference {
  hoy: string;
  manana: string;
  pasadoManana: string;
  diaHoy: string;
  diaManana: string;
  diaPasadoManana: string;
  proximosDias: Record<string, string>;
  lastUpdate: number;
}

/**
 * Servicio de utilidades para fechas con cache
 * Evita recalcular las mismas fechas de referencia múltiples veces
 */
@Injectable()
export class DateUtilsService {
  private dateCache: DateReference | null = null;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hora (las fechas cambian a medianoche)

  /**
   * Obtiene las fechas de referencia para hoy, mañana y pasado mañana
   * Con cache para evitar recalcular constantemente
   */
  async getDateReferences(): Promise<DateReference> {
    const now = Date.now();
    
    // Si el cache existe y es válido, retornarlo
    if (this.dateCache && (now - this.dateCache.lastUpdate) < this.CACHE_TTL) {
      // Verificar si todavía es el mismo día
      const { DateHelper } = await import('../../common/date-helper');
      const today = DateHelper.getTodayString();
      if (today === this.dateCache.hoy) {
        return this.dateCache;
      }
    }

    // Recalcular fechas
    const { DateHelper } = await import('../../common/date-helper');
    const fechaColombia = DateHelper.getTodayString();
    const hoy = DateHelper.getNow();
    
    // Calcular mañana y pasado mañana
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    const pasadoManana = new Date(hoy);
    pasadoManana.setDate(pasadoManana.getDate() + 2);
    
    const fechaManana = DateHelper.formatDateToISO(manana);
    const fechaPasadoManana = DateHelper.formatDateToISO(pasadoManana);
    
    // Obtener nombres de días
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const diaHoy = diasSemana[hoy.getDay()];
    const diaManana = diasSemana[manana.getDay()];
    const diaPasadoManana = diasSemana[pasadoManana.getDay()];
    
    // Calcular las fechas de los próximos 7 días de la semana
    const proximosDias: Record<string, string> = {};
    const hoyDayIndex = hoy.getDay();
    
    for (let i = 0; i < 7; i++) {
      const targetDayIndex = i;
      let daysToAdd = targetDayIndex - hoyDayIndex;
      
      // Si el día ya pasó esta semana, agregamos 7 días para obtener el próximo
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      
      const targetDate = new Date(hoy);
      targetDate.setDate(targetDate.getDate() + daysToAdd);
      proximosDias[diasSemana[i]] = DateHelper.formatDateToISO(targetDate);
    }

    // Guardar en cache
    this.dateCache = {
      hoy: fechaColombia,
      manana: fechaManana,
      pasadoManana: fechaPasadoManana,
      diaHoy,
      diaManana,
      diaPasadoManana,
      proximosDias,
      lastUpdate: now,
    };

    return this.dateCache;
  }

  /**
   * Limpia el cache de fechas (útil para testing o cuando cambia el día)
   */
  clearCache(): void {
    this.dateCache = null;
  }
}

