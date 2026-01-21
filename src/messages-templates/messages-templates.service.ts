import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateHelper } from '../common/date-helper';

interface Templates {
  greeting?: string;
  reservationRequest?: string;
  reservationConfirm?: string;
  reservationCancel?: string;
  reservationQuery?: string;
  missingFields?: string;
  error?: string;
}

interface Terminology {
  reservation: string;
  person: string;
  people: string;
  service: string;
}

interface ReservationSettings {
  requireGuests: boolean;
  defaultGuests: number;
}

interface MessageTemplateConfig {
  templates: Templates;
  terminology: Terminology;
  reservationSettings: ReservationSettings;
}

interface CollectedData {
  date?: string;
  time?: string;
  guests?: number;
  phone?: string;
  name?: string;
}

@Injectable()
export class MessagesTemplatesService {
  constructor(private prisma: PrismaService) {}

  async getConfigByCompanyType(companyType: string): Promise<MessageTemplateConfig | null> {
    const config = await this.prisma.messageTemplateConfig.findFirst({
      where: { companyType, active: true },
    });

    if (!config) {
      return null;
    }

    return {
      templates: (config.templates as unknown as Templates) || {},
      terminology: (config.terminology as unknown as Terminology) || this.getDefaultTerminology(),
      reservationSettings: (config.reservationSettings as unknown as ReservationSettings) || this.getDefaultReservationSettings(),
    };
  }

  async getGreeting(companyType: string, companyName: string): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    if (!config || !config.templates.greeting) {
      return `¡Hola! Bienvenido a ${companyName}. ¿En qué puedo ayudarte?`;
    }
    return this.replaceTemplate(config.templates.greeting, { companyName });
  }

  async getReservationRequest(companyType: string, fields: string[]): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    const template = config?.templates.reservationRequest || config?.templates.missingFields || 'Para continuar necesito: {{fields}}';
    const terminology = config?.terminology || this.getDefaultTerminology();
    
    // Si solo falta un campo, hacer mensaje más amigable
    if (fields.length === 1) {
      return `Perfecto, solo me falta tu ${fields[0]} para confirmar la ${terminology.reservation}. ¿Me lo proporcionas?`;
    }
    
    // Si faltan varios campos, usar el template
    return this.replaceTemplate(template, { fields: fields.join(', '), reservation: terminology.reservation });
  }

  /**
   * Genera una respuesta dinámica cuando se reciben datos parciales
   * Confirma los datos recibidos y pide los faltantes
   */
  async getDynamicReservationResponse(
    companyType: string,
    collectedData: CollectedData,
    newData: CollectedData,
    missingFields: string[],
  ): Promise<string> {
    const terminology = await this.getTerminology(companyType);
    const parts: string[] = [];

    // Construir confirmación de datos recibidos
    const receivedParts: string[] = [];

    if (newData.date) {
      const dateReadable = DateHelper.formatDateReadable(newData.date);
      receivedParts.push(`📅 Fecha: ${dateReadable}`);
    }

    if (newData.time) {
      const timeReadable = DateHelper.formatTimeReadable(newData.time);
      receivedParts.push(`🕐 Hora: ${timeReadable}`);
    }

    if (newData.guests) {
      const peopleText = newData.guests === 1 ? terminology.person : terminology.people;
      receivedParts.push(`👥 ${newData.guests} ${peopleText}`);
    }

    if (newData.phone) {
      receivedParts.push(`📱 Teléfono: ${newData.phone}`);
    }

    if (newData.name) {
      receivedParts.push(`👤 Nombre: ${newData.name}`);
    }

    // Si se recibieron datos nuevos, confirmarlos
    if (receivedParts.length > 0) {
      parts.push(`¡Perfecto! Tengo anotado:\n${receivedParts.join('\n')}`);
      
      // Pedir datos faltantes
      if (missingFields.length > 0) {
        if (missingFields.length === 1) {
          // Corregir "tu personas" a "el número de personas" o "comensales"
          const fieldLabel = missingFields[0];
          const fieldText = fieldLabel === 'personas' || fieldLabel === terminology.people 
            ? `el número de ${terminology.people}` 
            : fieldLabel === 'comensales'
            ? 'comensales'
            : `tu ${fieldLabel}`;
          parts.push(`\n\nSolo me falta ${fieldText} para confirmar la ${terminology.reservation}.`);
        } else {
          parts.push(`\n\nAhora necesito: ${missingFields.join(', ')}.`);
        }
      }
      
      return parts.join('');
    }

    // Si no hay datos nuevos, usar mensaje tradicional de solicitud
    return await this.getReservationRequest(companyType, missingFields);
  }

  /**
   * Genera un resumen de los datos recopilados hasta ahora
   */
  async getCollectedDataSummary(companyType: string, collectedData: CollectedData): Promise<string> {
    const terminology = await this.getTerminology(companyType);
    const parts: string[] = [];

    if (collectedData.date) {
      parts.push(`Fecha: ${DateHelper.formatDateReadable(collectedData.date)}`);
    }
    if (collectedData.time) {
      parts.push(`Hora: ${DateHelper.formatTimeReadable(collectedData.time)}`);
    }
    if (collectedData.guests) {
      const peopleText = collectedData.guests === 1 ? terminology.person : terminology.people;
      parts.push(`${collectedData.guests} ${peopleText}`);
    }
    if (collectedData.phone) {
      parts.push(`Tel: ${collectedData.phone}`);
    }

    return parts.join(' | ');
  }

  async getReservationConfirm(
    companyType: string,
    data: {
      date: string;
      time: string;
      guests?: number;
      phone?: string;
      service?: string;
      serviceName?: string;
    },
  ): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    const settings = config?.reservationSettings || this.getDefaultReservationSettings();
    const terminology = config?.terminology || this.getDefaultTerminology();

    const guests = data.guests || settings.defaultGuests || 1;
    const peopleText = guests === 1 ? terminology.person : terminology.people;
    
    // Formatear fecha y hora de forma legible
    const dateReadable = DateHelper.formatDateReadable(data.date);
    const timeReadable = DateHelper.formatTimeReadable(data.time);
    
    // Construir mensaje con servicio si está disponible
    let confirmMessage = `✅ ¡${terminology.reservation.charAt(0).toUpperCase() + terminology.reservation.slice(1)} confirmada!

📅 Fecha: ${dateReadable}
🕐 Hora: ${timeReadable}`;

    // Agregar servicio si está presente
    if (data.serviceName) {
      confirmMessage += `\n🔧 Servicio: ${data.serviceName}`;
    }
    
    confirmMessage += `\n👥 ${guests} ${peopleText}
📱 Contacto: ${data.phone || 'proporcionado'}

¡Te esperamos! Si necesitas cancelar o modificar, escríbenos.`;

    return confirmMessage;
  }

  async getReservationCancel(companyType: string): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    return config?.templates.reservationCancel || 'Para cancelar, necesito más información.';
  }

  async getReservationQuery(companyType: string, hours?: string): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    const template = config?.templates.reservationQuery || 'Nuestro horario es de {{hours}}. ¿Te gustaría hacer una reserva?';
    return this.replaceTemplate(template, { hours: hours || 'consultar disponibilidad' });
  }

  async getError(companyType: string): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    return config?.templates.error || 'Hubo un error. Por favor intenta de nuevo.';
  }

  async getTerminology(companyType: string): Promise<Terminology> {
    const config = await this.getConfigByCompanyType(companyType);
    return config?.terminology || this.getDefaultTerminology();
  }

  async getReservationSettings(companyType: string): Promise<ReservationSettings> {
    const config = await this.getConfigByCompanyType(companyType);
    return config?.reservationSettings || this.getDefaultReservationSettings();
  }

  async getMissingFieldsLabels(companyType: string): Promise<Record<string, string>> {
    const terminology = await this.getTerminology(companyType);
    const settings = await this.getReservationSettings(companyType);

    const labels: Record<string, string> = {
      date: 'fecha',
      time: 'hora',
      phone: 'teléfono',
      name: 'nombre',
      service: terminology.service,
    };

    if (settings.requireGuests) {
      labels.guests = terminology.people;
    }

    return labels;
  }

  private replaceTemplate(template: string, replacements: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  private getDefaultTerminology(): Terminology {
    return {
      reservation: 'reserva',
      person: 'persona',
      people: 'personas',
      service: 'servicio',
    };
  }

  private getDefaultReservationSettings(): ReservationSettings {
    return {
      requireGuests: true,
      defaultGuests: 1,
    };
  }
}

