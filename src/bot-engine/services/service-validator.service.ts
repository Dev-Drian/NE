import { Injectable } from '@nestjs/common';
import { FieldExtractorService } from '../context/field-extractor.service';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';

export interface ServiceConfig {
  requiresProducts?: boolean;
  requiresGuests?: boolean;
  requiresTable?: boolean;
  requiresPayment?: boolean;
  requiresAddress?: boolean; // Para domicilio - requiere dirección/ubicación
  requiresLocation?: boolean; // Alias de requiresAddress
  requiredFields?: string[]; // Campos específicos requeridos por este servicio
  optionalFields?: string[]; // Campos opcionales que el bot puede preguntar
  name?: string;
  enabled?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

@Injectable()
export class ServiceValidatorService {
  constructor(private fieldExtractor: FieldExtractorService) {}

  // Mapeo de nombres de campos español → inglés (normalización de entrada)
  // Los requiredFields en BD ya usan inglés, esto solo normaliza datos que vengan en español
  private readonly fieldMapping: Record<string, string> = {
    fecha: 'date',
    hora: 'time',
    telefono: 'phone',
    personas: 'guests',
    nombre: 'name',
    direccion: 'address',
    productos: 'products',
    mesa: 'tableId',
    notas: 'notes',
    servicio: 'service',
  };

  /**
   * Normaliza nombre de campo español → inglés
   */
  private normalizeFieldName(field: string): string {
    return this.fieldMapping[field.toLowerCase()] || field;
  }

  /**
   * Calcula campos faltantes considerando contexto histórico
   */
  async calculateMissingFields(
    collectedData: any,
    serviceConfig: ServiceConfig,
    context?: ConversationState
  ): Promise<string[]> {
    // 1. Obtener campos requeridos del servicio (ya vienen en inglés)
    const required = this.getRequiredFields(serviceConfig);

    // 2. Verificar qué campos faltan en collectedData
    let missing = required.filter((field) => {
      const value = collectedData[field];
      if (value === null || value === undefined) return true;
      // Para arrays (como products), verificar que tenga elementos
      if (Array.isArray(value) && value.length === 0) return true;
      return false;
    });

    // 3. Si hay contexto histórico y faltan campos, buscar en el historial
    if (missing.length > 0 && context?.conversationHistory) {
      const historicalData = this.fieldExtractor.extractFromHistory(
        context.conversationHistory as any[],
        missing
      );

      // 4. Actualizar collectedData con datos históricos encontrados
      if (Object.keys(historicalData).length > 0) {
        Object.assign(collectedData, historicalData);

        // 5. Recalcular missing fields después de agregar datos históricos
        missing = required.filter((field) => {
          const value = collectedData[field];
          return !value || (Array.isArray(value) && value.length === 0);
        });
      }
    }

    return missing;
  }

  /**
   * Obtiene campos requeridos según configuración del servicio
   * 100% dinámico - lee directamente del array requiredFields en la config
   * Cada servicio DEBE definir su propio requiredFields en la tabla Service
   */
  getRequiredFields(serviceConfig: ServiceConfig): string[] {
    // Los campos requeridos DEBEN estar definidos en la config de cada servicio
    if (serviceConfig.requiredFields && Array.isArray(serviceConfig.requiredFields)) {
      return [...serviceConfig.requiredFields];
    }

    // Fallback mínimo si no hay config (no debería pasar si seed.ts está bien)
    console.warn('⚠️ Servicio sin requiredFields definidos en config, usando fallback básico');
    return ['date', 'time', 'phone'];
  }

  /**
   * Obtiene campos opcionales que aún no se han recopilado
   */
  getOptionalFieldsPending(collectedData: any, serviceConfig: ServiceConfig): string[] {
    const optional = serviceConfig.optionalFields || [];
    return optional.filter((f) => {
      const value = collectedData[f];
      if (value === null || value === undefined) return true;
      if (Array.isArray(value) && value.length === 0) return true;
      return false;
    });
  }

  /**
   * Valida datos recopilados
   */
  async validateData(
    collectedData: any,
    serviceConfig: ServiceConfig,
    context?: ConversationState
  ): Promise<ValidationResult> {
    const missingFields = await this.calculateMissingFields(
      collectedData,
      serviceConfig,
      context
    );

    const errors: string[] = [];

    // Validaciones adicionales
    if (collectedData.date && !this.isValidDate(collectedData.date)) {
      errors.push('Fecha inválida');
    }

    if (collectedData.time && !this.isValidTime(collectedData.time)) {
      errors.push('Hora inválida');
    }

    if (collectedData.phone && !this.isValidPhone(collectedData.phone)) {
      errors.push('Teléfono inválido');
    }

    return {
      isValid: missingFields.length === 0 && errors.length === 0,
      missingFields,
      errors,
    };
  }

  /**
   * Valida formato de fecha
   */
  private isValidDate(date: string): boolean {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(date);
  }

  /**
   * Valida formato de hora
   */
  private isValidTime(time: string): boolean {
    const timeRegex = /^\d{2}:\d{2}$/;
    return timeRegex.test(time);
  }

  /**
   * Valida formato de teléfono
   */
  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^\d{7,10}$/;
    return phoneRegex.test(phone.toString().replace(/\D/g, ''));
  }
}
