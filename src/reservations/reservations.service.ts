import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Reservation, Prisma } from '@prisma/client';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Crea una reserva SIMPLE (sin verificación de conflictos)
   * Usar createSafe() para reservas con verificación
   */
  async create(data: Prisma.ReservationCreateInput): Promise<Reservation> {
    const reservation = await this.prisma.reservation.create({ data });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('reservation.created', {
      reservationId: reservation.id,
      companyId: reservation.companyId,
      userId: reservation.userId,
    });
    
    return reservation;
  }

  /**
   * Crea una reserva CON BLOQUEO PESIMISTA para evitar race conditions
   * Verifica que no haya reservas conflictivas en el mismo slot
   */
  async createSafe(
    companyId: string,
    data: {
      userId: string;
      service?: string;
      date: string;
      time: string;
      guests?: number;
      phone?: string;
      email?: string;
      name?: string;
      metadata?: any;
    },
    maxCapacityPerSlot: number = 1, // Por defecto 1 (ej: citas médicas)
  ): Promise<Reservation> {
    const reservation = await this.prisma.$transaction(async (tx) => {
      // 1. Contar reservas existentes en el mismo slot CON BLOQUEO
      // Usar raw query para FOR UPDATE (bloqueo pesimista)
      const existingCount = await tx.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count 
        FROM "reservations" 
        WHERE "companyId" = ${companyId}
          AND "date" = ${data.date}
          AND "time" = ${data.time}
          AND "status" NOT IN ('cancelled', 'declined', 'error')
        FOR UPDATE
      `;

      const currentBookings = Number(existingCount[0]?.count || 0);

      // 2. Verificar capacidad
      if (currentBookings >= maxCapacityPerSlot) {
        this.logger.warn(
          `🚫 Slot lleno: ${data.date} ${data.time} - ${currentBookings}/${maxCapacityPerSlot}`
        );
        throw new ConflictException(
          `Lo siento, el horario ${data.time} del ${data.date} ya no está disponible. ` +
          `Por favor selecciona otro horario.`
        );
      }

      // 3. Crear la reserva (dentro de la transacción)
      return await tx.reservation.create({
        data: {
          company: { connect: { id: companyId } },
          userId: data.userId,
          service: data.service,
          date: data.date,
          time: data.time,
          guests: data.guests || 1,
          phone: data.phone,
          email: data.email,
          name: data.name,
          metadata: data.metadata || {},
          status: 'pending',
        },
      });
    }, {
      // Timeout de la transacción: 10 segundos
      timeout: 10000,
      // Nivel de aislamiento para evitar lecturas fantasma
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    // Emitir evento FUERA de la transacción
    this.eventEmitter.emit('reservation.created', {
      reservationId: reservation.id,
      companyId,
      userId: data.userId,
    });

    this.logger.log(
      `✅ Reserva creada: ${reservation.id} - ${data.date} ${data.time}`
    );

    return reservation;
  }

  /**
   * Verifica disponibilidad de un slot SIN BLOQUEO (para consultas)
   */
  async checkSlotAvailability(
    companyId: string,
    date: string,
    time: string,
    maxCapacity: number = 1,
  ): Promise<{ available: boolean; currentBookings: number; remainingSlots: number }> {
    const count = await this.prisma.reservation.count({
      where: {
        companyId,
        date,
        time,
        status: { notIn: ['cancelled', 'declined', 'error'] },
      },
    });

    return {
      available: count < maxCapacity,
      currentBookings: count,
      remainingSlots: Math.max(0, maxCapacity - count),
    };
  }

  async findAll(companyId?: string): Promise<Reservation[]> {
    const where = companyId ? { companyId } : {};
    return this.prisma.reservation.findMany({
      where,
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<Reservation | null> {
    return this.prisma.reservation.findUnique({
      where: { id },
      include: {
        company: true,
      },
    });
  }

  async update(id: string, data: Prisma.ReservationUpdateInput): Promise<Reservation> {
    const reservation = await this.prisma.reservation.update({
      where: { id },
      data,
    });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('reservation.updated', {
      reservationId: reservation.id,
      companyId: reservation.companyId,
      userId: reservation.userId,
    });
    
    return reservation;
  }

  /**
   * Cancela una reservación
   */
  async cancel(id: string): Promise<Reservation> {
    const reservation = await this.prisma.reservation.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('reservation.cancelled', {
      reservationId: reservation.id,
      companyId: reservation.companyId,
      userId: reservation.userId,
    });
    
    this.logger.log(`🚫 Reserva cancelada: ${id}`);
    return reservation;
  }

  async findByUserAndCompany(userId: string, companyId: string): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: {
        userId,
        companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByUser(
    userId: string,
    companyId: string,
    options?: {
      limit?: number;
      fromDate?: Date;
      service?: string;
    }
  ): Promise<Reservation[]> {
    const where: any = {
      userId,
      companyId,
    };

    if (options?.fromDate) {
      where.createdAt = {
        gte: options.fromDate,
      };
    }

    if (options?.service) {
      where.service = options.service;
    }

    return this.prisma.reservation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 10,
    });
  }
}





