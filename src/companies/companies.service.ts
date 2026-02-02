import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Company, Prisma } from '@prisma/client';

interface CreateCompanyDto {
  name: string;
  slug: string;
  type: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo?: string;
  config?: any;
  openaiApiKey?: string;
  geminiApiKey?: string;
  preferredAiProvider?: string;
  requiresPayment?: boolean;
  paymentPercentage?: number;
  wompiPublicKey?: string;
  wompiPrivateKey?: string;
  wompiEventsSecret?: string;
  wompiEnabled?: boolean;
  active?: boolean;
}

interface UpdateCompanyDto extends Partial<CreateCompanyDto> {
  active?: boolean;
}

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
        _count: {
          select: {
            reservations: true,
            products: true,
            services: true,
            admins: true,
          }
        }
      },
    });
  }

  async findBySlug(slug: string): Promise<Company | null> {
    return this.prisma.company.findUnique({
      where: { slug },
    });
  }

  async findAll(includeInactive = false): Promise<Company[]> {
    return this.prisma.company.findMany({
      where: includeInactive ? {} : { active: true },
      include: {
        _count: {
          select: {
            reservations: true,
            products: true,
            services: true,
            admins: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findAllWithStats() {
    const companies = await this.prisma.company.findMany({
      include: {
        _count: {
          select: {
            reservations: true,
            conversationLogs: true,
            products: true,
            services: true,
            admins: true,
          }
        },
        admins: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return companies;
  }

  async create(data: CreateCompanyDto): Promise<Company> {
    // Verificar que el slug no exista
    const existingSlug = await this.prisma.company.findUnique({
      where: { slug: data.slug }
    });

    if (existingSlug) {
      throw new ConflictException('El slug ya está en uso');
    }

    const company = await this.prisma.company.create({ 
      data: {
        name: data.name,
        slug: data.slug,
        type: data.type,
        description: data.description,
        phone: data.phone,
        email: data.email,
        address: data.address,
        logo: data.logo,
        config: data.config || {},
        openaiApiKey: data.openaiApiKey,
        geminiApiKey: data.geminiApiKey,
        preferredAiProvider: data.preferredAiProvider,
        requiresPayment: data.requiresPayment || false,
        paymentPercentage: data.paymentPercentage || 100,
        wompiPublicKey: data.wompiPublicKey,
        wompiPrivateKey: data.wompiPrivateKey,
        wompiEventsSecret: data.wompiEventsSecret,
        wompiEnabled: data.wompiEnabled || false,
        active: data.active !== undefined ? data.active : true,
      }
    });
    
    this.eventEmitter.emit('company.created', { companyId: company.id });
    return company;
  }

  async update(id: string, data: UpdateCompanyDto): Promise<Company> {
    // Si se actualiza el slug, verificar que no exista
    if (data.slug) {
      const existingSlug = await this.prisma.company.findFirst({
        where: { 
          slug: data.slug,
          NOT: { id }
        }
      });

      if (existingSlug) {
        throw new ConflictException('El slug ya está en uso');
      }
    }

    const company = await this.prisma.company.update({
      where: { id },
      data,
    });
    
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

  async hardDelete(id: string): Promise<Company> {
    // Solo para super admin - eliminar completamente
    const company = await this.prisma.company.delete({
      where: { id },
    });
    this.eventEmitter.emit('company.deleted', { companyId: id });
    return company;
  }

  // Generar slug automático desde el nombre
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}





