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
}





