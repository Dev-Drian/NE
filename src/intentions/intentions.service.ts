import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Intention, Prisma } from '@prisma/client';

type IntentionWithRelations = Prisma.IntentionGetPayload<{
  include: { patterns: true; examples: true };
}>;

@Injectable()
export class IntentionsService {
  constructor(private prisma: PrismaService) {}

  async findByCompany(companyId: string): Promise<IntentionWithRelations[]> {
    return this.prisma.intention.findMany({
      where: {
        companyId,
        active: true,
      },
      include: {
        patterns: true,
        examples: true,
      },
      orderBy: {
        priority: 'desc',
      },
    });
  }

  async findOne(id: string): Promise<IntentionWithRelations | null> {
    return this.prisma.intention.findUnique({
      where: { id },
      include: {
        patterns: true,
        examples: true,
      },
    });
  }

  async create(data: Prisma.IntentionCreateInput): Promise<Intention> {
    return this.prisma.intention.create({ data });
  }

  async update(id: string, data: Prisma.IntentionUpdateInput): Promise<Intention> {
    return this.prisma.intention.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<Intention> {
    return this.prisma.intention.update({
      where: { id },
      data: { active: false },
    });
  }
}

