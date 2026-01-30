import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validador de teléfono colombiano
 * Acepta formatos: 3001234567, +573001234567, 573001234567
 */
@ValidatorConstraint({ async: false })
export class IsColombianPhoneConstraint implements ValidatorConstraintInterface {
  validate(phone: any, args: ValidationArguments) {
    if (typeof phone !== 'string') return false;
    
    // Eliminar espacios, guiones y paréntesis
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    // Eliminar prefijo +57 o 57 si existe
    let normalized = cleaned;
    if (normalized.startsWith('+57')) {
      normalized = normalized.slice(3);
    } else if (normalized.startsWith('57') && normalized.length > 10) {
      normalized = normalized.slice(2);
    }
    
    // Debe tener 10 dígitos y empezar con 3 (celular colombiano)
    return /^3\d{9}$/.test(normalized);
  }

  defaultMessage(args: ValidationArguments) {
    return 'El teléfono debe ser un número celular colombiano válido (10 dígitos empezando con 3)';
  }
}

export function IsColombianPhone(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsColombianPhoneConstraint,
    });
  };
}

/**
 * Validador de fecha futura (no puede ser en el pasado)
 */
@ValidatorConstraint({ async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(date: any, args: ValidationArguments) {
    if (!date) return false;
    
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      return false;
    }
    
    if (isNaN(dateObj.getTime())) return false;
    
    // Obtener hoy sin hora (solo fecha)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateObj.setHours(0, 0, 0, 0);
    
    return dateObj >= today;
  }

  defaultMessage(args: ValidationArguments) {
    return 'La fecha debe ser hoy o en el futuro';
  }
}

export function IsFutureDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsFutureDateConstraint,
    });
  };
}

/**
 * Validador de hora en formato HH:MM
 */
@ValidatorConstraint({ async: false })
export class IsValidTimeConstraint implements ValidatorConstraintInterface {
  validate(time: any, args: ValidationArguments) {
    if (typeof time !== 'string') return false;
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(time);
  }

  defaultMessage(args: ValidationArguments) {
    return 'La hora debe estar en formato HH:MM (ej: 14:30)';
  }
}

export function IsValidTime(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidTimeConstraint,
    });
  };
}

/**
 * Validador de número de comensales/personas
 */
@ValidatorConstraint({ async: false })
export class IsValidGuestsConstraint implements ValidatorConstraintInterface {
  validate(guests: any, args: ValidationArguments) {
    const num = parseInt(guests);
    if (isNaN(num)) return false;
    
    const [minGuests, maxGuests] = args.constraints as [number, number];
    return num >= minGuests && num <= maxGuests;
  }

  defaultMessage(args: ValidationArguments) {
    const [minGuests, maxGuests] = args.constraints as [number, number];
    return `El número de personas debe estar entre ${minGuests} y ${maxGuests}`;
  }
}

export function IsValidGuests(min: number = 1, max: number = 50, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [min, max],
      validator: IsValidGuestsConstraint,
    });
  };
}

/**
 * Validador de monto monetario (COP)
 */
@ValidatorConstraint({ async: false })
export class IsValidAmountConstraint implements ValidatorConstraintInterface {
  validate(amount: any, args: ValidationArguments) {
    const num = parseFloat(amount);
    if (isNaN(num)) return false;
    
    const [minAmount] = args.constraints as [number];
    return num >= minAmount && Number.isFinite(num);
  }

  defaultMessage(args: ValidationArguments) {
    const [minAmount] = args.constraints as [number];
    return `El monto debe ser mayor o igual a ${minAmount}`;
  }
}

export function IsValidAmount(min: number = 0, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [min],
      validator: IsValidAmountConstraint,
    });
  };
}

/**
 * Validador de UUID v4
 */
@ValidatorConstraint({ async: false })
export class IsValidUuidConstraint implements ValidatorConstraintInterface {
  validate(uuid: any, args: ValidationArguments) {
    if (typeof uuid !== 'string') return false;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  defaultMessage(args: ValidationArguments) {
    return 'El ID debe ser un UUID válido';
  }
}

export function IsValidUuid(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidUuidConstraint,
    });
  };
}

/**
 * Validador de email más estricto
 */
@ValidatorConstraint({ async: false })
export class IsStrictEmailConstraint implements ValidatorConstraintInterface {
  validate(email: any, args: ValidationArguments) {
    if (typeof email !== 'string') return false;
    
    // Regex más estricta para emails
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  defaultMessage(args: ValidationArguments) {
    return 'El email no tiene un formato válido';
  }
}

export function IsStrictEmail(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrictEmailConstraint,
    });
  };
}
