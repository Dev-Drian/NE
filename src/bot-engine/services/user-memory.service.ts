import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Estructura de memoria semántica del usuario
 * Persiste más allá de una conversación individual
 */
export interface UserSemanticMemory {
  userId: string;
  companyId: string;
  
  // Preferencias aprendidas
  preferences: {
    preferredTime?: string;        // "14:00" - hora que más usa
    preferredDay?: string;         // "viernes" - día que más reserva
    preferredService?: string;     // servicio que más solicita
    communicationStyle?: 'formal' | 'casual' | 'brief';
    preferredPaymentMethod?: 'anticipado' | 'presencial';
    specialRequirements?: string[];  // "sin gluten", "mesa cerca de ventana"
  };
  
  // Patrones de comportamiento detectados
  patterns: {
    averageMessageLength: number;
    typicalReservationSize: number;   // promedio de personas
    reservationFrequency: 'rare' | 'occasional' | 'frequent' | 'regular';
    lastReservationDaysAgo: number;
    cancellationRate: number;         // 0-1
    modificationRate: number;         // 0-1
    usualBookingAdvance: number;      // días de anticipación promedio
  };
  
  // Servicios/productos frecuentes
  frequentServices: string[];
  frequentProducts: Array<{ id: string; name: string; count: number }>;
  
  // Historial resumido (no todos los detalles, solo insights)
  insights: {
    totalReservations: number;
    completedReservations: number;
    totalSpent: number;
    memberSince: Date;
    lastInteraction: Date;
    satisfactionIndicators: {
      hasComplained: boolean;
      hasComplimented: boolean;
      returnRate: number;
    };
  };
  
  // Notas y contexto especial
  notes: string[];
  
  // Última actualización
  updatedAt: Date;
}

/**
 * 🧠 USER MEMORY SERVICE
 * 
 * Gestiona la memoria semántica de largo plazo de los usuarios.
 * Similar a cómo ChatGPT "recuerda" cosas de conversaciones anteriores.
 * 
 * Diferencias con el contexto de conversación (Redis):
 * - Conversación: Memoria de trabajo (RAM) - sesión actual
 * - UserMemory: Memoria de largo plazo (disco) - persiste siempre
 * 
 * Responsabilidades:
 * 1. Almacenar preferencias aprendidas
 * 2. Detectar y guardar patrones de comportamiento
 * 3. Proveer insights para personalizar respuestas
 * 4. Actualizar automáticamente después de cada interacción
 */
@Injectable()
export class UserMemoryService {
  private readonly logger = new Logger(UserMemoryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Obtiene la memoria semántica de un usuario
   * Crea una nueva si no existe
   */
  async getMemory(userId: string, companyId: string): Promise<UserSemanticMemory> {
    try {
      const preference = await this.prisma.userPreference.findFirst({
        where: { userId, companyId },
      });

      if (preference) {
        return this.parseStoredMemory(preference, userId, companyId);
      }

      // Crear memoria inicial basada en datos existentes
      return await this.initializeMemory(userId, companyId);
    } catch (error) {
      this.logger.warn(`Error getting user memory: ${error.message}`);
      return this.getDefaultMemory(userId, companyId);
    }
  }

  /**
   * Actualiza la memoria después de una interacción
   */
  async updateMemoryFromInteraction(
    userId: string,
    companyId: string,
    interaction: {
      message: string;
      intention: string;
      extractedData?: any;
      reservationCreated?: boolean;
      reservationCompleted?: boolean;
      reservationCancelled?: boolean;
    }
  ): Promise<void> {
    try {
      const memory = await this.getMemory(userId, companyId);
      
      // Actualizar patrones de comunicación
      this.updateCommunicationPatterns(memory, interaction.message);
      
      // Actualizar preferencias si se detectan
      this.updatePreferencesFromData(memory, interaction.extractedData);
      
      // Actualizar estadísticas de reservas
      if (interaction.reservationCreated) {
        memory.insights.totalReservations++;
      }
      if (interaction.reservationCompleted) {
        memory.insights.completedReservations++;
      }
      if (interaction.reservationCancelled) {
        memory.patterns.cancellationRate = this.recalculateCancellationRate(memory);
      }
      
      // Actualizar frecuencia de servicios
      if (interaction.extractedData?.service) {
        this.updateFrequentService(memory, interaction.extractedData.service);
      }
      
      // Actualizar productos frecuentes
      if (interaction.extractedData?.products) {
        this.updateFrequentProducts(memory, interaction.extractedData.products);
      }
      
      memory.insights.lastInteraction = new Date();
      memory.updatedAt = new Date();
      
      // Persistir
      await this.saveMemory(memory);
      
    } catch (error) {
      this.logger.warn(`Error updating user memory: ${error.message}`);
    }
  }

  /**
   * Aprende una nueva preferencia del usuario
   */
  async learnPreference(
    userId: string,
    companyId: string,
    key: keyof UserSemanticMemory['preferences'],
    value: any
  ): Promise<void> {
    const memory = await this.getMemory(userId, companyId);
    (memory.preferences as any)[key] = value;
    memory.updatedAt = new Date();
    await this.saveMemory(memory);
    
    this.logger.log(`📝 Learned preference for ${userId}: ${key}=${value}`);
  }

  /**
   * Agrega una nota sobre el usuario
   */
  async addNote(userId: string, companyId: string, note: string): Promise<void> {
    const memory = await this.getMemory(userId, companyId);
    memory.notes.push(`[${new Date().toISOString()}] ${note}`);
    
    // Mantener solo las últimas 10 notas
    if (memory.notes.length > 10) {
      memory.notes = memory.notes.slice(-10);
    }
    
    await this.saveMemory(memory);
  }

  /**
   * Obtiene sugerencias basadas en la memoria
   */
  getSuggestionsFromMemory(memory: UserSemanticMemory): {
    suggestedService?: string;
    suggestedTime?: string;
    suggestedDay?: string;
    suggestedProducts?: string[];
    personalizedGreeting?: string;
    contextualHints: string[];
  } {
    const suggestions: ReturnType<typeof this.getSuggestionsFromMemory> = {
      contextualHints: [],
    };

    // Sugerir servicio frecuente
    if (memory.frequentServices.length > 0) {
      suggestions.suggestedService = memory.frequentServices[0];
      suggestions.contextualHints.push(
        `Usuario frecuentemente usa: ${memory.frequentServices[0]}`
      );
    }

    // Sugerir hora preferida
    if (memory.preferences.preferredTime) {
      suggestions.suggestedTime = memory.preferences.preferredTime;
      suggestions.contextualHints.push(
        `Hora preferida: ${memory.preferences.preferredTime}`
      );
    }

    // Sugerir día preferido
    if (memory.preferences.preferredDay) {
      suggestions.suggestedDay = memory.preferences.preferredDay;
      suggestions.contextualHints.push(
        `Día habitual: ${memory.preferences.preferredDay}`
      );
    }

    // Productos frecuentes
    if (memory.frequentProducts.length > 0) {
      suggestions.suggestedProducts = memory.frequentProducts
        .slice(0, 3)
        .map(p => p.name);
    }

    // Saludo personalizado
    if (memory.patterns.reservationFrequency === 'regular') {
      suggestions.personalizedGreeting = '¡Hola de nuevo! 👋';
    } else if (memory.insights.totalReservations > 5) {
      suggestions.personalizedGreeting = '¡Qué gusto verte por aquí! 😊';
    }

    // Hints contextuales
    if (memory.patterns.lastReservationDaysAgo > 30) {
      suggestions.contextualHints.push('Hace tiempo que no nos visita');
    }

    if (memory.preferences.specialRequirements?.length > 0) {
      suggestions.contextualHints.push(
        `Requisitos especiales: ${memory.preferences.specialRequirements.join(', ')}`
      );
    }

    return suggestions;
  }

  // ============ MÉTODOS PRIVADOS ============

  private async initializeMemory(userId: string, companyId: string): Promise<UserSemanticMemory> {
    // Obtener datos históricos del usuario
    const [reservations, user] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId, companyId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);

    const memory = this.getDefaultMemory(userId, companyId);

    if (user) {
      memory.insights.memberSince = user.createdAt;
    }

    if (reservations.length > 0) {
      // Analizar patrones de reservas
      memory.insights.totalReservations = reservations.length;
      memory.insights.completedReservations = reservations.filter(
        r => r.status === 'completed'
      ).length;

      // Detectar hora preferida
      const hourCounts: Record<string, number> = {};
      reservations.forEach(r => {
        if (r.time) {
          hourCounts[r.time] = (hourCounts[r.time] || 0) + 1;
        }
      });
      const preferredTime = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (preferredTime) {
        memory.preferences.preferredTime = preferredTime;
      }

      // Detectar día preferido
      const dayCounts: Record<string, number> = {};
      reservations.forEach(r => {
        const day = new Date(r.date).toLocaleDateString('es-ES', { weekday: 'long' });
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      const preferredDay = Object.entries(dayCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      if (preferredDay) {
        memory.preferences.preferredDay = preferredDay;
      }

      // Detectar servicio frecuente
      const serviceCounts: Record<string, number> = {};
      reservations.forEach(r => {
        if (r.service) {
          serviceCounts[r.service] = (serviceCounts[r.service] || 0) + 1;
        }
      });
      memory.frequentServices = Object.entries(serviceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([service]) => service);

      // Calcular tamaño típico de reserva
      const guestsSum = reservations.reduce((sum, r) => sum + (r.guests || 1), 0);
      memory.patterns.typicalReservationSize = Math.round(guestsSum / reservations.length);

      // Calcular frecuencia
      if (reservations.length >= 10) {
        memory.patterns.reservationFrequency = 'regular';
      } else if (reservations.length >= 5) {
        memory.patterns.reservationFrequency = 'frequent';
      } else if (reservations.length >= 2) {
        memory.patterns.reservationFrequency = 'occasional';
      }

      // Última reserva
      const lastReservation = reservations[0];
      if (lastReservation) {
        const daysSince = Math.floor(
          (Date.now() - new Date(lastReservation.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        memory.patterns.lastReservationDaysAgo = daysSince;
      }

      // Tasa de cancelación
      const cancelled = reservations.filter(r => r.status === 'cancelled').length;
      memory.patterns.cancellationRate = cancelled / reservations.length;
    }

    // Guardar memoria inicializada
    await this.saveMemory(memory);

    return memory;
  }

  private getDefaultMemory(userId: string, companyId: string): UserSemanticMemory {
    return {
      userId,
      companyId,
      preferences: {},
      patterns: {
        averageMessageLength: 0,
        typicalReservationSize: 2,
        reservationFrequency: 'rare',
        lastReservationDaysAgo: -1,
        cancellationRate: 0,
        modificationRate: 0,
        usualBookingAdvance: 3,
      },
      frequentServices: [],
      frequentProducts: [],
      insights: {
        totalReservations: 0,
        completedReservations: 0,
        totalSpent: 0,
        memberSince: new Date(),
        lastInteraction: new Date(),
        satisfactionIndicators: {
          hasComplained: false,
          hasComplimented: false,
          returnRate: 0,
        },
      },
      notes: [],
      updatedAt: new Date(),
    };
  }

  private parseStoredMemory(stored: any, userId: string, companyId: string): UserSemanticMemory {
    try {
      const data = stored.preferences as any;
      return {
        userId,
        companyId,
        preferences: data.preferences || {},
        patterns: data.patterns || this.getDefaultMemory(userId, companyId).patterns,
        frequentServices: data.frequentServices || [],
        frequentProducts: data.frequentProducts || [],
        insights: data.insights || this.getDefaultMemory(userId, companyId).insights,
        notes: data.notes || [],
        updatedAt: stored.updatedAt || new Date(),
      };
    } catch {
      return this.getDefaultMemory(userId, companyId);
    }
  }

  private async saveMemory(memory: UserSemanticMemory): Promise<void> {
    // Construir objeto con campos que existen en el modelo Prisma
    const dataToStore = {
      preferredService: memory.preferences.preferredService || null,
      preferredTime: memory.preferences.preferredTime || null,
      preferredDay: memory.preferences.preferredDay || null,
      defaultGuests: memory.patterns.typicalReservationSize || null,
      totalReservations: memory.insights.totalReservations || 0,
      lastVisitDate: memory.insights.lastInteraction || null,
      favoriteProducts: memory.frequentProducts || [],
      notes: JSON.stringify({
        communicationStyle: memory.preferences.communicationStyle,
        patterns: memory.patterns,
        specialRequirements: memory.preferences.specialRequirements,
        frequentServices: memory.frequentServices,
      }),
    };

    await this.prisma.userPreference.upsert({
      where: {
        userId_companyId: {
          userId: memory.userId,
          companyId: memory.companyId,
        },
      },
      update: {
        ...dataToStore,
        updatedAt: new Date(),
      },
      create: {
        userId: memory.userId,
        companyId: memory.companyId,
        ...dataToStore,
      },
    });
  }

  private updateCommunicationPatterns(memory: UserSemanticMemory, message: string): void {
    const currentAvg = memory.patterns.averageMessageLength;
    const newLength = message.length;
    
    // Running average
    memory.patterns.averageMessageLength = Math.round(
      (currentAvg * 0.8) + (newLength * 0.2)
    );

    // Detectar estilo de comunicación
    if (message.length < 20 && !message.includes('por favor')) {
      memory.preferences.communicationStyle = 'brief';
    } else if (message.includes('por favor') || message.includes('gracias')) {
      memory.preferences.communicationStyle = 'formal';
    }
  }

  private updatePreferencesFromData(memory: UserSemanticMemory, data: any): void {
    if (!data) return;

    // Actualizar hora preferida (promedio ponderado con historial)
    if (data.time) {
      if (!memory.preferences.preferredTime) {
        memory.preferences.preferredTime = data.time;
      }
      // Si la nueva hora es similar a la preferida, reforzar
      // Si es muy diferente, considerar actualizar
    }

    // Actualizar servicio preferido
    if (data.service) {
      memory.preferences.preferredService = data.service;
    }
  }

  private updateFrequentService(memory: UserSemanticMemory, service: string): void {
    const index = memory.frequentServices.indexOf(service);
    if (index > -1) {
      // Mover al frente si ya existe
      memory.frequentServices.splice(index, 1);
    }
    memory.frequentServices.unshift(service);
    
    // Mantener solo top 5
    memory.frequentServices = memory.frequentServices.slice(0, 5);
  }

  private updateFrequentProducts(memory: UserSemanticMemory, products: any[]): void {
    for (const product of products) {
      const existing = memory.frequentProducts.find(p => p.id === product.id);
      if (existing) {
        existing.count++;
      } else {
        memory.frequentProducts.push({
          id: product.id,
          name: product.name || product.id,
          count: 1,
        });
      }
    }

    // Ordenar por frecuencia y mantener top 10
    memory.frequentProducts.sort((a, b) => b.count - a.count);
    memory.frequentProducts = memory.frequentProducts.slice(0, 10);
  }

  private recalculateCancellationRate(memory: UserSemanticMemory): number {
    const total = memory.insights.totalReservations;
    if (total === 0) return 0;
    
    // Incrementar contador implícito de cancelaciones
    const cancelled = Math.round(memory.patterns.cancellationRate * (total - 1)) + 1;
    return cancelled / total;
  }
}
