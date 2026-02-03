import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityType } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtener categorías por empresa y tipo de entidad
   */
  async findByCompanyAndType(companyId: string, entityType: EntityType, includeGlobal = true) {
    const where: any = {
      entityType,
      active: true,
      OR: includeGlobal 
        ? [{ companyId }, { companyId: null }] // Incluye categorías globales
        : [{ companyId }], // Solo de la empresa
    };

    return this.prisma.category.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Obtener todas las categorías de una empresa (para super admin)
   */
  async findByCompany(companyId: string | null, includeInactive = false) {
    return this.prisma.category.findMany({
      where: {
        companyId,
        active: includeInactive ? undefined : true,
      },
      include: {
        company: companyId ? {
          select: { id: true, name: true, slug: true, type: true },
        } : undefined,
      },
      orderBy: [
        { entityType: 'asc' },
        { displayOrder: 'asc' },
      ],
    });
  }

  /**
   * Crear categoría
   */
  async create(data: {
    name: string;
    key: string;
    entityType: EntityType;
    companyId?: string;
    description?: string;
    icon?: string;
    color?: string;
    displayOrder?: number;
  }) {
    return this.prisma.category.create({
      data: {
        ...data,
        companyId: data.companyId || null,
      },
    });
  }

  /**
   * Actualizar categoría
   */
  async update(id: string, data: {
    name?: string;
    key?: string;
    description?: string;
    icon?: string;
    color?: string;
    displayOrder?: number;
    active?: boolean;
  }) {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  /**
   * Eliminar categoría
   */
  async delete(id: string) {
    return this.prisma.category.delete({
      where: { id },
    });
  }

  /**
   * Obtener categoría por ID
   */
  async findById(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        company: {
          select: { id: true, name: true, slug: true, type: true },
        },
      },
    });
  }
}
