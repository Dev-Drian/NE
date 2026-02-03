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

  // Obtener clientes (usuarios) de una empresa específica
  async getCustomers(companyId: string) {
    // Primero verificamos que la empresa existe
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    // Obtenemos usuarios que tienen preferencias con esta empresa
    // o que han tenido conversaciones con esta empresa
    const userPreferences = await this.prisma.userPreference.findMany({
      where: { companyId },
      include: {
        user: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    // También obtenemos usuarios que tienen conversaciones con esta empresa
    // pero que no tienen preferencias guardadas aún
    const conversationsUsers = await this.prisma.conversation.findMany({
      where: { 
        companyId,
        userId: {
          notIn: userPreferences.map(up => up.userId)
        }
      },
      select: {
        userId: true,
        user: true,
        lastMessageAt: true,
        _count: {
          select: { payments: true }
        }
      },
      distinct: ['userId'],
      orderBy: { lastMessageAt: 'desc' }
    });

    // Combinar resultados
    const customers = [
      // Usuarios con preferencias
      ...userPreferences.map(up => ({
        id: up.user.id,
        phone: up.user.phone,
        name: up.confirmedName || up.user.name,
        email: up.confirmedEmail || up.user.email,
        preferredChannel: 'WHATSAPP' as const, // Por ahora asumimos WhatsApp
        metadata: up.user.metadata,
        preferences: {
          preferredService: up.preferredService,
          preferredTime: up.preferredTime,
          preferredDay: up.preferredDay,
          defaultGuests: up.defaultGuests,
          defaultAddress: up.defaultAddress,
          totalReservations: up.totalReservations,
          totalOrders: up.totalOrders,
          lastVisitDate: up.lastVisitDate?.toISOString() || null,
          favoriteProducts: up.favoriteProducts as string[],
        },
        totalReservations: up.totalReservations,
        lastReservationDate: up.lastVisitDate?.toISOString() || null,
        createdAt: up.user.createdAt.toISOString(),
      })),
      // Usuarios solo con conversaciones (sin preferencias)
      ...conversationsUsers.map(cu => ({
        id: cu.user.id,
        phone: cu.user.phone,
        name: cu.user.name,
        email: cu.user.email,
        preferredChannel: 'WHATSAPP' as const,
        metadata: cu.user.metadata,
        preferences: null,
        totalReservations: 0,
        lastReservationDate: cu.lastMessageAt?.toISOString() || null,
        createdAt: cu.user.createdAt.toISOString(),
      }))
    ];

    return { data: customers };
  }

  // Obtener historial de conversaciones de una empresa
  async getConversationLogs(companyId: string, options?: { 
    limit?: number; 
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const where: any = { companyId };
    
    if (options?.userId) {
      where.userId = options.userId;
    }
    
    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options?.startDate) where.createdAt.gte = options.startDate;
      if (options?.endDate) where.createdAt.lte = options.endDate;
    }

    const logs = await this.prisma.conversationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
    });

    // Agrupar por conversationId o por userId si no hay conversationId
    const grouped = logs.reduce((acc, log) => {
      const key = log.conversationId || log.userId;
      if (!acc[key]) {
        acc[key] = {
          id: key,
          userId: log.userId,
          messages: [],
          lastMessageAt: log.createdAt,
          firstMessageAt: log.createdAt,
        };
      }
      acc[key].messages.push({
        id: log.id,
        userMessage: log.userMessage,
        botResponse: log.botResponse,
        intention: log.detectedIntention,
        confidence: log.confidence,
        success: log.success,
        createdAt: log.createdAt,
      });
      if (log.createdAt < acc[key].firstMessageAt) {
        acc[key].firstMessageAt = log.createdAt;
      }
      return acc;
    }, {} as Record<string, any>);

    // Convertir a array y ordenar por última actividad
    const conversations = Object.values(grouped)
      .sort((a: any, b: any) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

    return { data: conversations };
  }

  // Obtener TODOS los clientes de TODAS las empresas (solo para SUPER_ADMIN)
  async getAllCustomers() {
    // Obtenemos todos los usuarios que tienen preferencias o conversaciones
    const userPreferences = await this.prisma.userPreference.findMany({
      include: {
        user: true,
        company: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Usuarios con conversaciones pero sin preferencias
    const conversationsUsers = await this.prisma.conversation.findMany({
      where: {
        userId: {
          notIn: userPreferences.map(up => up.userId)
        }
      },
      include: {
        user: true,
      },
      distinct: ['userId'],
      orderBy: { lastMessageAt: 'desc' }
    });

    // Obtener empresas de las conversaciones
    const companyIds = [...new Set(conversationsUsers.map(cu => cu.companyId))];
    const companies = await this.prisma.company.findMany({
      where: { id: { in: companyIds } },
      select: { id: true, name: true, slug: true }
    });
    const companiesMap = new Map(companies.map(c => [c.id, c]));

    // Combinar resultados
    const customers = [
      ...userPreferences.map(up => ({
        id: up.user.id,
        phone: up.user.phone,
        name: up.confirmedName || up.user.name,
        email: up.confirmedEmail || up.user.email,
        preferredChannel: 'WHATSAPP' as const,
        metadata: up.user.metadata,
        company: up.company,
        preferences: {
          preferredService: up.preferredService,
          preferredTime: up.preferredTime,
          preferredDay: up.preferredDay,
          defaultGuests: up.defaultGuests,
          defaultAddress: up.defaultAddress,
          totalReservations: up.totalReservations,
          totalOrders: up.totalOrders,
          lastVisitDate: up.lastVisitDate?.toISOString() || null,
          favoriteProducts: up.favoriteProducts as string[],
        },
        totalReservations: up.totalReservations,
        lastReservationDate: up.lastVisitDate?.toISOString() || null,
        createdAt: up.user.createdAt.toISOString(),
      })),
      ...conversationsUsers.map(cu => {
        const company = companiesMap.get(cu.companyId);
        return {
          id: cu.user.id,
          phone: cu.user.phone,
          name: cu.user.name,
          email: cu.user.email,
          preferredChannel: 'WHATSAPP' as const,
          metadata: cu.user.metadata,
          company: company ? { id: company.id, name: company.name, slug: company.slug } : null,
          preferences: null,
          totalReservations: 0,
          lastReservationDate: cu.lastMessageAt?.toISOString() || null,
          createdAt: cu.user.createdAt.toISOString(),
        };
      })
    ];

    return { data: customers };
  }
}





