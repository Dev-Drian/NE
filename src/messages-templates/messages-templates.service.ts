import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class MessagesTemplatesService {
  constructor(private prisma: PrismaService) {}

  async getConfigByCompanyType(companyType: string): Promise<MessageTemplateConfig | null> {
    const config = await this.prisma.messageTemplateConfig.findUnique({
      where: { companyType, active: true },
    });

    if (!config) {
      return null;
    }

    return {
      templates: (config.templates as Templates) || {},
      terminology: (config.terminology as Terminology) || this.getDefaultTerminology(),
      reservationSettings: (config.reservationSettings as ReservationSettings) || this.getDefaultReservationSettings(),
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
    return this.replaceTemplate(template, { fields: fields.join(', ') });
  }

  async getReservationConfirm(
    companyType: string,
    data: {
      date: string;
      time: string;
      guests?: number;
      phone?: string;
    },
  ): Promise<string> {
    const config = await this.getConfigByCompanyType(companyType);
    if (!config) {
      return `✅ Reserva confirmada para el ${data.date} a las ${data.time}.`;
    }

    const template = config.templates.reservationConfirm || '✅ Reserva confirmada para el {{date}} a las {{time}}.';
    const settings = config.reservationSettings;
    const terminology = config.terminology;

    const guests = data.guests || settings.defaultGuests || 1;
    const peopleText = guests === 1 ? terminology.person : terminology.people;

    const replacements: Record<string, string> = {
      date: data.date,
      time: data.time,
      phone: data.phone || 'número proporcionado',
      guests: guests.toString(),
      peopleText,
    };

    return this.replaceTemplate(template, replacements);
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

