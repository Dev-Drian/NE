import { Injectable, Logger } from '@nestjs/common';

/**
 * Entidad normalizada extraída de un mensaje
 */
export interface NormalizedEntity {
  /** Tipo de entidad */
  type: 'date' | 'time' | 'datetime' | 'quantity' | 'phone' | 'email' | 'name' | 'amount' | 'duration';
  
  /** Valor normalizado */
  value: string | number | Date;
  
  /** Texto original */
  original: string;
  
  /** Posición en el texto */
  position: { start: number; end: number };
  
  /** Confianza de la extracción (0-1) */
  confidence: number;
  
  /** Metadatos adicionales */
  metadata?: Record<string, any>;
}

/**
 * Resultado de la extracción de entidades
 */
export interface EntityExtractionResult {
  entities: NormalizedEntity[];
  normalizedMessage: string;
  hasEntities: boolean;
}

/**
 * Servicio de Normalización de Entidades
 * 
 * Extrae y normaliza entidades del texto:
 * - Fechas: "mañana", "el lunes", "15 de enero" → Date
 * - Horas: "3pm", "a las 3", "15:00" → "15:00"
 * - Cantidades: "dos personas", "para 5" → number
 * - Teléfonos: "3001234567" → formato estándar
 * - Montos: "$50.000", "50 mil" → number
 */
@Injectable()
export class EntityNormalizerService {
  private readonly logger = new Logger(EntityNormalizerService.name);

  // Mapeo de palabras a números
  private readonly WORD_TO_NUMBER: Record<string, number> = {
    'uno': 1, 'una': 1, 'un': 1,
    'dos': 2,
    'tres': 3,
    'cuatro': 4,
    'cinco': 5,
    'seis': 6,
    'siete': 7,
    'ocho': 8,
    'nueve': 9,
    'diez': 10,
    'once': 11,
    'doce': 12,
    'quince': 15,
    'veinte': 20,
    'treinta': 30,
    'media': 0.5,
  };

  // Días de la semana
  private readonly DAYS_OF_WEEK: Record<string, number> = {
    'domingo': 0, 'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3,
    'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6,
  };

  // Meses
  private readonly MONTHS: Record<string, number> = {
    'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
    'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
  };

  /**
   * Extrae todas las entidades de un mensaje
   */
  extractAll(message: string): EntityExtractionResult {
    const entities: NormalizedEntity[] = [];
    let normalizedMessage = message;

    // Extraer en orden de especificidad (más específico primero)
    const dateTimeEntities = this.extractDateTime(message);
    const quantityEntities = this.extractQuantities(message);
    const phoneEntities = this.extractPhones(message);
    const emailEntities = this.extractEmails(message);
    const amountEntities = this.extractAmounts(message);
    const durationEntities = this.extractDurations(message);

    entities.push(
      ...dateTimeEntities,
      ...quantityEntities,
      ...phoneEntities,
      ...emailEntities,
      ...amountEntities,
      ...durationEntities,
    );

    // Ordenar por posición
    entities.sort((a, b) => a.position.start - b.position.start);

    return {
      entities,
      normalizedMessage,
      hasEntities: entities.length > 0,
    };
  }

  /**
   * Extrae y normaliza fechas y horas
   */
  extractDateTime(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];
    const now = new Date();
    const lowerMessage = message.toLowerCase();

    // Patrones relativos: hoy, mañana, pasado mañana
    const relativePatterns = [
      { pattern: /\b(hoy|ahora|ahorita)\b/gi, dayOffset: 0 },
      { pattern: /\b(mañana)\b/gi, dayOffset: 1 },
      { pattern: /\b(pasado\s*mañana)\b/gi, dayOffset: 2 },
      { pattern: /\b(ayer)\b/gi, dayOffset: -1 },
    ];

    for (const { pattern, dayOffset } of relativePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const date = new Date(now);
        date.setDate(date.getDate() + dayOffset);
        date.setHours(0, 0, 0, 0);
        
        entities.push({
          type: 'date',
          value: date,
          original: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.95,
          metadata: { relative: true, dayOffset },
        });
      }
    }

    // Día de la semana: "el lunes", "este viernes"
    const dayPattern = /\b(el\s+)?(este\s+)?(próximo\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi;
    let dayMatch;
    while ((dayMatch = dayPattern.exec(message)) !== null) {
      const dayName = dayMatch[4].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const targetDay = this.DAYS_OF_WEEK[dayName] ?? this.DAYS_OF_WEEK[dayName.replace(/[áéíóú]/g, c => 
        ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }[c] || c)
      )];
      
      if (targetDay !== undefined) {
        const date = this.getNextDayOfWeek(targetDay);
        entities.push({
          type: 'date',
          value: date,
          original: dayMatch[0],
          position: { start: dayMatch.index, end: dayMatch.index + dayMatch[0].length },
          confidence: 0.9,
          metadata: { dayOfWeek: targetDay },
        });
      }
    }

    // Fecha explícita: "15 de enero", "enero 15"
    const explicitDatePattern = /\b(\d{1,2})\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(\s*(de\s*)?(\d{4}))?\b/gi;
    let explicitMatch;
    while ((explicitMatch = explicitDatePattern.exec(message)) !== null) {
      const day = parseInt(explicitMatch[1], 10);
      const monthName = explicitMatch[3].toLowerCase();
      const month = this.MONTHS[monthName];
      const year = explicitMatch[6] ? parseInt(explicitMatch[6], 10) : now.getFullYear();
      
      if (month !== undefined && day >= 1 && day <= 31) {
        const date = new Date(year, month, day);
        entities.push({
          type: 'date',
          value: date,
          original: explicitMatch[0],
          position: { start: explicitMatch.index, end: explicitMatch.index + explicitMatch[0].length },
          confidence: 0.95,
        });
      }
    }

    // Horas: "3pm", "3:00 pm", "a las 3", "15:00"
    const timePatterns = [
      // 3pm, 3:00pm, 3:00 pm
      { 
        pattern: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.?m\.?|p\.?m\.?)\b/gi, 
        extract: (m: RegExpMatchArray) => this.parse12HourTime(parseInt(m[1]), parseInt(m[2] || '0'), m[3])
      },
      // "a las 3", "a las 3 y media"
      { 
        pattern: /\ba\s*las?\s+(\d{1,2})(?:\s*y\s*(media|cuarto))?\b/gi, 
        extract: (m: RegExpMatchArray) => {
          let hours = parseInt(m[1]);
          let minutes = 0;
          if (m[2] === 'media') minutes = 30;
          if (m[2] === 'cuarto') minutes = 15;
          // Si es < 7, asumir PM
          if (hours < 7) hours += 12;
          return { hours, minutes };
        }
      },
      // 15:00, 15:30
      { 
        pattern: /\b([01]?\d|2[0-3]):([0-5]\d)\b/g, 
        extract: (m: RegExpMatchArray) => ({ hours: parseInt(m[1]), minutes: parseInt(m[2]) })
      },
    ];

    for (const { pattern, extract } of timePatterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const time = extract(match);
        if (time && time.hours >= 0 && time.hours < 24) {
          const timeString = `${time.hours.toString().padStart(2, '0')}:${time.minutes.toString().padStart(2, '0')}`;
          entities.push({
            type: 'time',
            value: timeString,
            original: match[0],
            position: { start: match.index, end: match.index + match[0].length },
            confidence: 0.9,
            metadata: { hours: time.hours, minutes: time.minutes },
          });
        }
      }
    }

    return entities;
  }

  /**
   * Extrae cantidades: "2 personas", "para tres", "somos 5"
   */
  extractQuantities(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];

    // Patrones de cantidad
    const patterns = [
      // "2 personas", "5 comensales"
      /\b(\d+)\s*(personas?|comensales?|invitados?|adultos?|niños?)\b/gi,
      // "para 2", "somos 5"
      /\b(para|somos|seremos|son)\s+(\d+)\b/gi,
      // "para dos", "somos cinco"
      /\b(para|somos|seremos|son)\s+(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/gi,
      // "dos personas"
      /\b(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*(personas?|comensales?)?\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        let quantity: number;
        
        // Determinar cuál grupo tiene el número
        const numericGroup = match[1]?.match(/^\d+$/) ? match[1] : match[2];
        if (numericGroup) {
          if (/^\d+$/.test(numericGroup)) {
            quantity = parseInt(numericGroup, 10);
          } else {
            quantity = this.WORD_TO_NUMBER[numericGroup.toLowerCase()] || 0;
          }
        } else {
          continue;
        }

        if (quantity > 0 && quantity <= 100) {
          entities.push({
            type: 'quantity',
            value: quantity,
            original: match[0],
            position: { start: match.index, end: match.index + match[0].length },
            confidence: 0.9,
          });
        }
      }
    }

    return this.deduplicateByPosition(entities);
  }

  /**
   * Extrae teléfonos colombianos
   */
  extractPhones(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];

    // Patrones de teléfono colombiano (7-15 dígitos)
    const patterns = [
      // Número largo sin formato: 3145139133, 31451391339, etc. (7-15 dígitos)
      /\b\d{7,15}\b/g,
      // 3001234567, 300 123 4567
      /\b3[0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{4}\b/g,
      // +57 300 123 4567
      /\+?57[\s-]?3[0-9]{2}[\s-]?[0-9]{3}[\s-]?[0-9]{4}\b/g,
      // Teléfono fijo: 6012345678
      /\b[1-8][0-9]{2}[\s-]?[0-9]{7}\b/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        // Normalizar: solo números
        const normalized = match[0].replace(/[\s-+]/g, '');
        const formatted = this.formatPhone(normalized);
        
        entities.push({
          type: 'phone',
          value: formatted,
          original: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.85,
        });
      }
    }

    return entities;
  }

  /**
   * Extrae emails
   */
  extractEmails(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];
    const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

    let match;
    while ((match = pattern.exec(message)) !== null) {
      entities.push({
        type: 'email',
        value: match[0].toLowerCase(),
        original: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.95,
      });
    }

    return entities;
  }

  /**
   * Extrae montos de dinero
   */
  extractAmounts(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];

    const patterns = [
      // $50.000, $50,000
      /\$\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g,
      // 50.000 pesos
      /(\d{1,3}(?:[.,]\d{3})*)\s*pesos?/gi,
      // 50 mil, 50mil
      /(\d+)\s*mil(?:es)?\b/gi,
      // 1 millón
      /(\d+)\s*mill[oó]n(?:es)?\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        let amount: number;
        const numStr = match[1].replace(/[.,]/g, '');
        amount = parseInt(numStr, 10);
        
        // Multiplicar si tiene "mil" o "millón"
        if (/mil/i.test(match[0])) amount *= 1000;
        if (/mill[oó]n/i.test(match[0])) amount *= 1000000;

        entities.push({
          type: 'amount',
          value: amount,
          original: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.85,
          metadata: { currency: 'COP' },
        });
      }
    }

    return entities;
  }

  /**
   * Extrae duraciones: "1 hora", "30 minutos", "hora y media"
   */
  extractDurations(message: string): NormalizedEntity[] {
    const entities: NormalizedEntity[] = [];

    const patterns = [
      // 1 hora, 2 horas
      { pattern: /(\d+)\s*horas?\b/gi, unit: 'hours' },
      // 30 minutos
      { pattern: /(\d+)\s*minutos?\b/gi, unit: 'minutes' },
      // "media hora"
      { pattern: /media\s*hora\b/gi, unit: 'minutes', value: 30 },
      // "hora y media"
      { pattern: /hora\s*y\s*media\b/gi, unit: 'minutes', value: 90 },
    ];

    for (const { pattern, unit, value } of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const duration = value ?? parseInt(match[1], 10);
        const minutes = unit === 'hours' ? duration * 60 : duration;

        entities.push({
          type: 'duration',
          value: minutes,
          original: match[0],
          position: { start: match.index, end: match.index + match[0].length },
          confidence: 0.9,
          metadata: { unit: 'minutes', originalUnit: unit },
        });
      }
    }

    return entities;
  }

  // === Métodos auxiliares ===

  private parse12HourTime(hours: number, minutes: number, period: string): { hours: number; minutes: number } {
    const isPM = /p/i.test(period);
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    return { hours, minutes };
  }

  private getNextDayOfWeek(targetDay: number): Date {
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntilTarget = targetDay - currentDay;
    
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }
    
    const result = new Date(now);
    result.setDate(now.getDate() + daysUntilTarget);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private formatPhone(phone: string): string {
    // Formato: +57 300 123 4567
    if (phone.length === 10 && phone.startsWith('3')) {
      return `+57 ${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}`;
    }
    if (phone.length === 12 && phone.startsWith('57')) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`;
    }
    return phone;
  }

  private deduplicateByPosition(entities: NormalizedEntity[]): NormalizedEntity[] {
    const result: NormalizedEntity[] = [];
    
    for (const entity of entities) {
      const overlaps = result.some(
        e => !(entity.position.end <= e.position.start || entity.position.start >= e.position.end)
      );
      
      if (!overlaps) {
        result.push(entity);
      }
    }
    
    return result;
  }
}
