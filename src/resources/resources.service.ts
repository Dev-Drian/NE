import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResourcesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Obtener todos los recursos de una empresa
   */
  async findByCompany(companyId: string, includeInactive = false) {
    return this.prisma.resource.findMany({
      where: {
        companyId,
        active: includeInactive ? undefined : true,
      },
      orderBy: [
        { type: 'asc' },
        { capacity: 'asc' },
      ],
    });
  }

  /**
   * Obtener recursos por tipo (mesa, consultorio, etc.)
   */
  async findByType(companyId: string, type: string) {
    return this.prisma.resource.findMany({
      where: {
        companyId,
        type,
        active: true,
      },
      orderBy: { capacity: 'asc' },
    });
  }

  /**
   * Buscar recurso por ID
   */
  async findById(resourceId: string) {
    return this.prisma.resource.findUnique({
      where: { id: resourceId },
    });
  }

  /**
   * Buscar recursos disponibles con capacidad mínima
   */
  async findAvailableWithCapacity(companyId: string, minCapacity: number, type?: string) {
    return this.prisma.resource.findMany({
      where: {
        companyId,
        capacity: { gte: minCapacity },
        available: true,
        active: true,
        ...(type && { type }),
      },
      orderBy: { capacity: 'asc' }, // Orden ascendente para asignar el más pequeño disponible
    });
  }

  /**
   * Marcar recurso como ocupado
   */
  async markAsOccupied(resourceId: string) {
    return this.prisma.resource.update({
      where: { id: resourceId },
      data: { available: false },
    });
  }

  /**
   * Marcar recurso como disponible
   */
  async markAsAvailable(resourceId: string) {
    return this.prisma.resource.update({
      where: { id: resourceId },
      data: { available: true },
    });
  }

  /**
   * Crear un nuevo recurso
   */
  async create(data: {
    companyId: string;
    name: string;
    type: string;
    capacity: number;
    metadata?: any;
  }) {
    return this.prisma.resource.create({
      data,
    });
  }

  /**
   * Actualizar un recurso
   */
  async update(resourceId: string, data: Partial<{
    name: string;
    capacity: number;
    available: boolean;
    active: boolean;
    metadata: any;
  }>) {
    return this.prisma.resource.update({
      where: { id: resourceId },
      data,
    });
  }

  /**
   * Eliminar un recurso (soft delete)
   */
  async delete(resourceId: string) {
    return this.prisma.resource.update({
      where: { id: resourceId },
      data: { active: false, available: false },
    });
  }
}
