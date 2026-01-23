import { Injectable } from '@nestjs/common';
import { Message } from './context-compressor.service';

export interface FieldExtractionRule {
  field: string;
  patterns: RegExp[];
  transform?: (match: RegExpMatchArray) => any;
  validate?: (value: any) => boolean;
  priority?: number; // Mayor prioridad = se evalúa primero
}

@Injectable()
export class FieldExtractorService {
  /**
   * Reglas de extracción configurables para cada campo
   * Se pueden extender fácilmente sin modificar código
   */
  private extractionRules: FieldExtractionRule[] = [
    // TELÉFONO
    {
      field: 'phone',
      priority: 10,
      patterns: [
        /(?:teléfono|telefono|numero|número|celular|cel|phone)\s*(?:es|es:)?\s*(\d{7,10})/i,
        /(\d{9,10})\b/, // 9-10 dígitos (formato común)
        /(\d{7,8})\b/, // 7-8 dígitos (formato corto)
      ],
      transform: (match) => match[1].replace(/\D/g, ''),
      validate: (value) => {
        const phone = value.toString();
        return phone.length >= 7 && phone.length <= 10;
      },
    },
    // FECHA
    {
      field: 'date',
      priority: 10,
      patterns: [
        /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD
        /(\d{1,2}\/\d{1,2}\/\d{4})/, // DD/MM/YYYY
      ],
      transform: (match) => {
        const dateStr = match[1];
        if (dateStr.includes('-')) {
          return dateStr;
        }
        // Convertir DD/MM/YYYY a YYYY-MM-DD
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        return dateStr;
      },
      validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    },
    // HORA
    {
      field: 'time',
      priority: 10,
      patterns: [
        /(\d{1,2}):(\d{2})\b/, // HH:MM
        /(\d{1,2})\s*(pm|p\.m\.)/i,
        /(\d{1,2})\s*(am|a\.m\.)/i,
        /(\d{1,2})\s*de\s*la\s*(tarde|noche)/i,
        /(\d{1,2})\s*de\s*la\s*mañana/i,
      ],
      transform: (match) => {
        // Si es formato HH:MM
        if (match[2] && /^\d{2}$/.test(match[2])) {
          const hours = parseInt(match[1], 10);
          const minutes = match[2];
          return `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
        // Si es formato texto (PM, AM, tarde, noche)
        let hours = parseInt(match[1], 10);
        const period = match[2]?.toLowerCase() || '';
        
        if (period.includes('pm') || period.includes('p.m.') || period.includes('tarde') || period.includes('noche')) {
          if (hours !== 12) hours += 12;
        } else if (period.includes('am') || period.includes('a.m.') || period.includes('mañana')) {
          if (hours === 12) hours = 0;
        }
        
        return `${hours.toString().padStart(2, '0')}:00`;
      },
      validate: (value) => /^\d{2}:\d{2}$/.test(value),
    },
    // COMENSALES/GUESTS
    {
      field: 'guests',
      priority: 8,
      patterns: [
        /(?:para|somos)\s*(\d+)\s*(?:personas?|comensales?|gente)/i,
        /(\d+)\s*(?:personas?|comensales?|gente)/i,
        /(?:para|somos)\s*(\d+)/i,
      ],
      transform: (match) => parseInt(match[1], 10),
      validate: (value) => {
        const guests = typeof value === 'number' ? value : parseInt(value, 10);
        return guests > 0 && guests <= 50;
      },
    },
    // SERVICIO
    {
      field: 'service',
      priority: 9,
      patterns: [
        /(?:quiero|necesito|pedir|reservar)\s*(?:un|una)?\s*(domicilio|delivery|a domicilio)/i,
        /(?:quiero|necesito|pedir|reservar)\s*(?:un|una)?\s*(mesa|restaurante|para llevar)/i,
        /(?:quiero|necesito|pedir|reservar)\s*(?:un|una)?\s*(cita|consulta)/i,
        /(domicilio|delivery|a domicilio)/i,
        /(mesa|restaurante|para llevar)/i,
        /(cita|consulta)/i,
      ],
      transform: (match) => {
        const service = match[1].toLowerCase();
        if (service.includes('domicilio') || service.includes('delivery')) return 'domicilio';
        if (service.includes('mesa') || service.includes('restaurante') || service.includes('llevar')) return 'mesa';
        if (service.includes('cita') || service.includes('consulta')) return 'cita';
        return service;
      },
      validate: (value) => ['domicilio', 'mesa', 'cita'].includes(value),
    },
    // DIRECCIÓN/UBICACIÓN (para domicilio)
    {
      field: 'address',
      priority: 7,
      patterns: [
        /(?:dirección|direccion|dirección es|direccion es|ubicación|ubicacion|ubicación es|ubicacion es|dirección:|direccion:|ubicación:|ubicacion:)\s*(.+?)(?:\.|$|,|;)/i,
        /(?:en|a|para|hacia|hasta)\s+(.+?)(?:\s+(?:calle|avenida|avenida|av\.|carrera|cr\.|transversal|tr\.|diagonal|dg\.|barrio|sector|edificio|apto|apartamento|torre|piso|oficina|local|número|numero|#|n°))/i,
        /(?:calle|avenida|avenida|av\.|carrera|cr\.|transversal|tr\.|diagonal|dg\.)\s*(.+?)(?:\s+(?:#|n°|número|numero|barrio|sector|edificio|apto|apartamento|torre|piso|oficina|local|\.|$|,|;))/i,
        /(?:vivo|vivo en|vivo en|mi dirección|mi direccion|mi ubicación|mi ubicacion|mi casa|mi casa está|mi casa esta|mi casa es|mi dirección es|mi direccion es|mi ubicación es|mi ubicacion es)\s+(.+?)(?:\.|$|,|;)/i,
      ],
      transform: (match) => {
        // Tomar el primer grupo que capture la dirección
        const address = match[1] || match[0];
        return address.trim();
      },
      validate: (value) => {
        const addr = value.toString().trim();
        // Validar que tenga al menos 10 caracteres (dirección mínima razonable)
        return addr.length >= 10 && addr.length <= 200;
      },
    },
    // MESA ESPECÍFICA
    {
      field: 'tableId',
      priority: 6,
      patterns: [
        /(?:mesa|table)\s*(?:número|numero|#|n°)?\s*(\d+)/i,
        /(?:mesa|table)\s*(\d+)/i,
        /(?:la|el)\s*(?:mesa|table)\s*(\d+)/i,
        /mesa\s*(?:para\s*)?(\d+)\s*(?:personas?|comensales?)/i, // "mesa para 4" -> buscar mesa de capacidad 4
      ],
      transform: (match) => {
        const tableNum = match[1];
        // Si es un número, buscar mesa con ese ID o nombre
        return `mesa-${tableNum}`;
      },
      validate: (value) => typeof value === 'string' && value.length > 0,
    },
  ];

  /**
   * Extrae datos del historial de conversación de forma genérica
   */
  extractFromHistory(
    history: Message[],
    missingFields: string[]
  ): Record<string, any> {
    const extracted: Record<string, any> = {};

    // Buscar en mensajes del usuario (no del asistente)
    const userMessages = history.filter((msg) => msg.role === 'user');

    // Ordenar reglas por prioridad (mayor primero)
    const sortedRules = [...this.extractionRules].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );

    // Para cada campo faltante, buscar en las reglas
    for (const field of missingFields) {
      // Buscar regla para este campo
      const rule = sortedRules.find((r) => r.field === field);
      
      if (rule) {
        const value = this.extractFieldWithRule(userMessages, rule);
        if (value !== null && value !== undefined) {
          extracted[field] = value;
        }
      }
    }

    return extracted;
  }

  /**
   * Extrae un campo usando una regla específica
   */
  private extractFieldWithRule(
    messages: Message[],
    rule: FieldExtractionRule
  ): any {
    // Buscar en orden inverso (más reciente primero)
    for (let i = messages.length - 1; i >= 0; i--) {
      const content = messages[i].content;

      // Probar cada patrón de la regla
      for (const pattern of rule.patterns) {
        const match = content.match(pattern);
        if (match) {
          // Aplicar transformación si existe
          let value = rule.transform ? rule.transform(match) : match[1];

          // Validar si existe validación
          if (rule.validate && !rule.validate(value)) {
            continue; // Intentar siguiente patrón
          }

          return value;
        }
      }
    }

    return null;
  }

  /**
   * Agrega una nueva regla de extracción dinámicamente
   * Útil para extender el sistema sin modificar código
   */
  addExtractionRule(rule: FieldExtractionRule): void {
    // Remover regla existente si hay
    this.extractionRules = this.extractionRules.filter(
      (r) => r.field !== rule.field
    );
    
    // Agregar nueva regla
    this.extractionRules.push(rule);
  }

  /**
   * Obtiene todas las reglas de extracción
   */
  getExtractionRules(): FieldExtractionRule[] {
    return [...this.extractionRules];
  }

  /**
   * Obtiene reglas para un campo específico
   */
  getRulesForField(field: string): FieldExtractionRule | undefined {
    return this.extractionRules.find((r) => r.field === field);
  }
}
