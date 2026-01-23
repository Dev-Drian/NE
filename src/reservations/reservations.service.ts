import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Reservation, Prisma } from '@prisma/client';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.ReservationCreateInput): Promise<Reservation> {
    return this.prisma.reservation.create({ data });
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
    return this.prisma.reservation.update({
      where: { id },
      data,
    });
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





