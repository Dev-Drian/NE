import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Company, Prisma } from '@prisma/client';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.company.create({ data });
  }

  async update(id: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async remove(id: string): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data: { active: false },
    });
  }
}

