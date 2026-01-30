import { Injectable, Logger } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

/**
 * Servicio unificado de validación
 * Centraliza la validación de datos para todo el sistema
 */
@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  /**
   * Valida un objeto contra una clase DTO
   */
  async validateDto<T extends object>(
    dtoClass: new () => T,
    data: any,
  ): Promise<ValidationResult> {
    const instance = plainToClass(dtoClass, data);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      skipMissingProperties: false,
    });

    if (errors.length > 0) {
      return {
        isValid: false,
        errors: this.formatValidationErrors(errors),
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: instance,
    };
  }

  /**
   * Valida y sanitiza un teléfono colombiano
   */
  validatePhone(phone: string): ValidationResult {
    if (!phone || typeof phone !== 'string') {
      return { isValid: false, errors: ['El teléfono es requerido'] };
    }

    // Eliminar caracteres no numéricos excepto +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Normalizar prefijo
    if (cleaned.startsWith('+57')) {
      cleaned = cleaned.slice(3);
    } else if (cleaned.startsWith('57') && cleaned.length > 10) {
      cleaned = cleaned.slice(2);
    }
    
    // Validar formato
    if (!/^3\d{9}$/.test(cleaned)) {
      return {
        isValid: false,
        errors: ['El teléfono debe ser un celular colombiano válido (10 dígitos comenzando con 3)'],
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: cleaned,
    };
  }

  /**
   * Valida y sanitiza una fecha
   */
  validateDate(date: string, allowPast: boolean = false): ValidationResult {
    if (!date) {
      return { isValid: false, errors: ['La fecha es requerida'] };
    }

    // Validar formato YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return { isValid: false, errors: ['La fecha debe estar en formato YYYY-MM-DD'] };
    }

    const dateObj = new Date(date + 'T00:00:00');
    if (isNaN(dateObj.getTime())) {
      return { isValid: false, errors: ['La fecha no es válida'] };
    }

    if (!allowPast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj < today) {
        return { isValid: false, errors: ['La fecha no puede ser en el pasado'] };
      }
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: date,
    };
  }

  /**
   * Valida y sanitiza una hora
   */
  validateTime(time: string): ValidationResult {
    if (!time) {
      return { isValid: false, errors: ['La hora es requerida'] };
    }

    // Validar formato HH:MM
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timeRegex.test(time)) {
      return { isValid: false, errors: ['La hora debe estar en formato HH:MM'] };
    }

    // Normalizar a formato HH:MM (con cero inicial si es necesario)
    const [hours, minutes] = time.split(':');
    const normalized = `${hours.padStart(2, '0')}:${minutes}`;

    return {
      isValid: true,
      errors: [],
      sanitizedData: normalized,
    };
  }

  /**
   * Valida número de comensales/personas
   */
  validateGuests(guests: any, min: number = 1, max: number = 50): ValidationResult {
    const num = parseInt(guests);
    
    if (isNaN(num)) {
      return { isValid: false, errors: ['El número de personas debe ser un número válido'] };
    }

    if (num < min || num > max) {
      return {
        isValid: false,
        errors: [`El número de personas debe estar entre ${min} y ${max}`],
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: num,
    };
  }

  /**
   * Valida un monto monetario
   */
  validateAmount(amount: any, minAmount: number = 0): ValidationResult {
    const num = parseFloat(amount);

    if (isNaN(num) || !Number.isFinite(num)) {
      return { isValid: false, errors: ['El monto debe ser un número válido'] };
    }

    if (num < minAmount) {
      return {
        isValid: false,
        errors: [`El monto debe ser mayor o igual a ${minAmount}`],
      };
    }

    // Redondear a 2 decimales
    const sanitized = Math.round(num * 100) / 100;

    return {
      isValid: true,
      errors: [],
      sanitizedData: sanitized,
    };
  }

  /**
   * Valida un email
   */
  validateEmail(email: string): ValidationResult {
    if (!email || typeof email !== 'string') {
      return { isValid: false, errors: ['El email es requerido'] };
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const trimmed = email.trim().toLowerCase();

    if (!emailRegex.test(trimmed)) {
      return { isValid: false, errors: ['El email no tiene un formato válido'] };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: trimmed,
    };
  }

  /**
   * Valida un UUID
   */
  validateUuid(uuid: string): ValidationResult {
    if (!uuid || typeof uuid !== 'string') {
      return { isValid: false, errors: ['El ID es requerido'] };
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(uuid)) {
      return { isValid: false, errors: ['El ID debe ser un UUID válido'] };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: uuid.toLowerCase(),
    };
  }

  /**
   * Valida texto contra inyección y XSS
   */
  sanitizeText(text: string, maxLength: number = 1000): ValidationResult {
    if (!text || typeof text !== 'string') {
      return { isValid: false, errors: ['El texto es requerido'] };
    }

    // Eliminar caracteres potencialmente peligrosos
    let sanitized = text
      .replace(/<[^>]*>/g, '') // Eliminar tags HTML
      .replace(/javascript:/gi, '') // Eliminar javascript:
      .replace(/on\w+=/gi, '') // Eliminar event handlers
      .trim();

    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    return {
      isValid: true,
      errors: [],
      sanitizedData: sanitized,
    };
  }

  /**
   * Valida múltiples campos a la vez
   */
  validateMultiple(validations: Array<{ name: string; result: ValidationResult }>): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: Record<string, any> = {};

    for (const { name, result } of validations) {
      if (!result.isValid) {
        errors.push(...result.errors.map(e => `${name}: ${e}`));
      } else if (result.sanitizedData !== undefined) {
        sanitizedData[name] = result.sanitizedData;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: errors.length === 0 ? sanitizedData : undefined,
    };
  }

  /**
   * Formatea errores de class-validator a strings legibles
   */
  private formatValidationErrors(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children && error.children.length > 0) {
        messages.push(...this.formatValidationErrors(error.children));
      }
    }

    return messages;
  }
}
