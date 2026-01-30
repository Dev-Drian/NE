import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Company, Prisma } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findOne(id: string): Promise<Company | null> {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        intentions: {
          where: { active: true },
          include: {
            patterns: true,
            examples: true,
          },
        },
      },
    });
  }

  async findAll(): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: { active: true },
    });
  }

  async create(data: Prisma.CompanyCreateInput): Promise<Company> {
    const company = await this.prisma.company.create({ data });
    this.eventEmitter.emit('company.created', { companyId: company.id });
    return company;
  }

  async update(id: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    const company = await this.prisma.company.update({
      where: { id },
      data,
    });
    
    // Determinar qué campos fueron actualizados para invalidación selectiva
    const updatedFields = Object.keys(data);
    this.eventEmitter.emit('company.updated', { 
      companyId: id, 
      updatedFields,
    });
    
    return company;
  }

  async remove(id: string): Promise<Company> {
    const company = await this.prisma.company.update({
      where: { id },
      data: { active: false },
    });
    this.eventEmitter.emit('company.deleted', { companyId: id });
    return company;
  }
}





