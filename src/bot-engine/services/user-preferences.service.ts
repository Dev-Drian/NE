import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UserPreferenceData {
  preferredService?: string;
  preferredTime?: string;
  preferredDay?: string;
  defaultGuests?: number;
  defaultAddress?: string;
  confirmedName?: string;
  confirmedPhone?: string;
  confirmedEmail?: string;
  favoriteProducts?: string[];
  notes?: string;
}

export interface LearnedContext {
  // Datos que el bot puede usar automáticamente
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  guests?: number;
  preferredTime?: string;
  preferredService?: string;
  // Historial resumido
  totalReservations: number;
  totalOrders: number;
  isReturningCustomer: boolean;
  favoriteProducts: string[];
}

@Injectable()
export class UserPreferencesService {
  private readonly logger = new Logger(UserPreferencesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene o crea las preferencias de un usuario para una empresa
   */
  async getOrCreate(userId: string, companyId: string) {
    let prefs = await this.prisma.userPreference.findUnique({
      where: {
        userId_companyId: { userId, companyId },
      },
    });

    if (!prefs) {
      prefs = await this.prisma.userPreference.create({
        data: {
          userId,
          companyId,
          totalReservations: 0,
          totalOrders: 0,
          favoriteProducts: [],
        },
      });
    }

    return prefs;
  }

  /**
   * Obtiene el contexto aprendido del usuario
   * Útil para pre-rellenar datos en reservaciones
   */
  async getLearnedContext(userId: string, companyId: string): Promise<LearnedContext> {
    const prefs = await this.getOrCreate(userId, companyId);
    
    return {
      name: prefs.confirmedName || undefined,
      phone: prefs.confirmedPhone || undefined,
      email: prefs.confirmedEmail || undefined,
      address: prefs.defaultAddress || undefined,
      guests: prefs.defaultGuests || undefined,
      preferredTime: prefs.preferredTime || undefined,
      preferredService: prefs.preferredService || undefined,
      totalReservations: prefs.totalReservations,
      totalOrders: prefs.totalOrders,
      isReturningCustomer: (prefs.totalReservations + prefs.totalOrders) > 0,
      favoriteProducts: (prefs.favoriteProducts as string[]) || [],
    };
  }

  /**
   * Aprende de una reservación completada
   * Actualiza preferencias basadas en el comportamiento
   */
  async learnFromReservation(
    userId: string,
    companyId: string,
    reservationData: {
      service?: string;
      time?: string;
      date?: string;
      guests?: number;
      phone?: string;
      name?: string;
      address?: string;
      products?: { id: string; quantity: number }[];
    },
  ): Promise<void> {
    try {
      const prefs = await this.getOrCreate(userId, companyId);
      
      // Extraer día de la semana de la fecha
      let dayOfWeek: string | undefined;
      if (reservationData.date) {
        const date = new Date(reservationData.date);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        dayOfWeek = days[date.getDay()];
      }

      // Actualizar productos favoritos
      let favoriteProducts = (prefs.favoriteProducts as string[]) || [];
      if (reservationData.products && reservationData.products.length > 0) {
        for (const prod of reservationData.products) {
          // Agregar al inicio si no existe, o mover al inicio si existe
          favoriteProducts = favoriteProducts.filter(id => id !== prod.id);
          favoriteProducts.unshift(prod.id);
        }
        // Mantener solo los 10 más recientes
        favoriteProducts = favoriteProducts.slice(0, 10);
      }

      // Determinar si es reserva o pedido
      const isOrder = reservationData.service === 'domicilio';

      await this.prisma.userPreference.update({
        where: { id: prefs.id },
        data: {
          // Solo actualizar si hay valor nuevo
          ...(reservationData.service && { preferredService: reservationData.service }),
          ...(reservationData.time && { preferredTime: reservationData.time }),
          ...(dayOfWeek && { preferredDay: dayOfWeek }),
          ...(reservationData.guests && { defaultGuests: reservationData.guests }),
          ...(reservationData.address && { defaultAddress: reservationData.address }),
          ...(reservationData.name && { confirmedName: reservationData.name }),
          ...(reservationData.phone && { confirmedPhone: reservationData.phone }),
          
          // Incrementar contadores
          totalReservations: isOrder ? prefs.totalReservations : prefs.totalReservations + 1,
          totalOrders: isOrder ? prefs.totalOrders + 1 : prefs.totalOrders,
          
          // Actualizar favoritos y última visita
          favoriteProducts,
          lastVisitDate: new Date(),
        },
      });

      this.logger.log(`📚 Preferencias aprendidas para usuario ${userId}`);
    } catch (error) {
      this.logger.error('Error aprendiendo preferencias:', error);
    }
  }

  /**
   * Actualiza datos confirmados del usuario
   */
  async updateConfirmedData(
    userId: string,
    companyId: string,
    data: Partial<{
      name: string;
      phone: string;
      email: string;
      address: string;
    }>,
  ): Promise<void> {
    const prefs = await this.getOrCreate(userId, companyId);

    await this.prisma.userPreference.update({
      where: { id: prefs.id },
      data: {
        ...(data.name && { confirmedName: data.name }),
        ...(data.phone && { confirmedPhone: data.phone }),
        ...(data.email && { confirmedEmail: data.email }),
        ...(data.address && { defaultAddress: data.address }),
      },
    });
  }

  /**
   * Genera un saludo personalizado basado en el historial
   */
  async getPersonalizedGreeting(userId: string, companyId: string, companyName: string): Promise<string> {
    const context = await this.getLearnedContext(userId, companyId);

    if (context.isReturningCustomer) {
      const name = context.name ? `, ${context.name}` : '';
      const visits = context.totalReservations + context.totalOrders;
      
      if (visits >= 5) {
        return `¡Hola${name}! 🌟 Qué gusto verte de nuevo en ${companyName}. Ya eres uno de nuestros clientes frecuentes. ¿En qué puedo ayudarte hoy?`;
      } else if (visits >= 2) {
        return `¡Hola${name}! 😊 Bienvenido de nuevo a ${companyName}. ¿En qué puedo ayudarte?`;
      } else {
        return `¡Hola${name}! Gracias por volver a ${companyName}. ¿En qué puedo ayudarte?`;
      }
    }

    return `¡Hola! Bienvenido a ${companyName}. ¿En qué puedo ayudarte?`;
  }

  /**
   * Sugiere datos para pre-rellenar una reservación
   */
  async getSuggestionsForReservation(
    userId: string,
    companyId: string,
    serviceKey?: string,
  ): Promise<{
    canSuggest: boolean;
    suggestions: {
      field: string;
      value: any;
      confidence: 'high' | 'medium' | 'low';
      message: string;
    }[];
  }> {
    const context = await this.getLearnedContext(userId, companyId);
    const suggestions: {
      field: string;
      value: any;
      confidence: 'high' | 'medium' | 'low';
      message: string;
    }[] = [];

    // Solo sugerir si es cliente recurrente
    if (!context.isReturningCustomer) {
      return { canSuggest: false, suggestions: [] };
    }

    // Sugerir nombre si lo tenemos
    if (context.name) {
      suggestions.push({
        field: 'name',
        value: context.name,
        confidence: 'high',
        message: `¿La reserva es a nombre de ${context.name}?`,
      });
    }

    // Sugerir teléfono si lo tenemos
    if (context.phone) {
      suggestions.push({
        field: 'phone',
        value: context.phone,
        confidence: 'high',
        message: `¿Te contactamos al ${context.phone}?`,
      });
    }

    // Sugerir número de personas si es consistente
    if (context.guests && context.totalReservations >= 2) {
      suggestions.push({
        field: 'guests',
        value: context.guests,
        confidence: 'medium',
        message: `¿Serán ${context.guests} personas como la última vez?`,
      });
    }

    // Sugerir dirección para domicilios
    if (serviceKey === 'domicilio' && context.address) {
      suggestions.push({
        field: 'address',
        value: context.address,
        confidence: 'high',
        message: `¿Te lo enviamos a ${context.address}?`,
      });
    }

    // Sugerir hora preferida
    if (context.preferredTime && context.totalReservations >= 3) {
      suggestions.push({
        field: 'time',
        value: context.preferredTime,
        confidence: 'low',
        message: `¿A las ${context.preferredTime} como sueles preferir?`,
      });
    }

    return {
      canSuggest: suggestions.length > 0,
      suggestions,
    };
  }

  /**
   * Obtiene productos favoritos del usuario con detalles
   */
  async getFavoriteProductsDetails(userId: string, companyId: string) {
    const prefs = await this.getOrCreate(userId, companyId);
    const favoriteIds = (prefs.favoriteProducts as string[]) || [];

    if (favoriteIds.length === 0) {
      return [];
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: favoriteIds },
        companyId,
        active: true,
      },
    });

    // Mantener el orden de favoritos
    return favoriteIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);
  }
}
