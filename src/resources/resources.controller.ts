import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  UseGuards, 
  Query,
  ForbiddenException,
  NotFoundException 
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsNumber, IsObject } from 'class-validator';
import { ResourcesService } from './resources.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// Definición local del enum AdminRole (debe coincidir con prisma/schema.prisma)
enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  COMPANY_USER = 'COMPANY_USER',
}
import { PrismaService } from '../prisma/prisma.service';

class CreateResourceDto {
  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsNumber()
  capacity: number;

  @IsOptional()
  @IsObject()
  metadata?: any;

  @IsOptional()
  @IsString()
  companyId?: string; // Solo para SUPER_ADMIN
}

class UpdateResourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly resourcesService: ResourcesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtener todos los recursos
   * - SUPER_ADMIN: Ve todos los recursos de todas las empresas
   * - COMPANY_ADMIN/COMPANY_USER: Solo ve recursos de su empresa
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const includeAll = includeInactive === 'true';
    
    // Paginación
    const pageNumber = page ? parseInt(page, 10) : 1;
    const pageSize = limit ? parseInt(limit, 10) : 20;
    const skip = (pageNumber - 1) * pageSize;

    // Construir filtro base
    const where: any = {
      active: includeAll ? undefined : true,
      ...(type && { type }),
    };

    // SUPER_ADMIN puede ver de cualquier empresa o todas
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (companyId) {
        where.companyId = companyId;
      }
    } else {
      // COMPANY_ADMIN y COMPANY_USER solo ven de su empresa
      where.companyId = user.companyId;
    }

    // Contar total
    const total = await this.prisma.resource.count({ where });

    // Obtener recursos paginados
    const resources = await this.prisma.resource.findMany({
      where,
      include: {
        company: user.role === AdminRole.SUPER_ADMIN ? {
          select: { id: true, name: true, slug: true },
        } : undefined,
      },
      orderBy: [
        { companyId: 'asc' },
        { type: 'asc' },
        { capacity: 'asc' },
      ],
      skip,
      take: pageSize,
    });

    return {
      data: resources,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Obtener recurso por ID
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const resource = await this.resourcesService.findById(id);
    
    if (!resource) {
      throw new NotFoundException('Recurso no encontrado');
    }

    // Verificar acceso (SUPER_ADMIN puede ver cualquiera)
    if (user.role !== AdminRole.SUPER_ADMIN && resource.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    return resource;
  }

  /**
   * Obtener recursos por tipo
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('by-type/:type')
  async findByType(
    @Param('type') type: string, 
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
  ) {
    // SUPER_ADMIN puede filtrar por empresa
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (companyId) {
        return this.resourcesService.findByType(companyId, type);
      }
      
      // Todos los recursos de ese tipo de todas las empresas
      return this.prisma.resource.findMany({
        where: {
          type,
          active: true,
        },
        include: {
          company: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { capacity: 'asc' },
      });
    }

    return this.resourcesService.findByType(user.companyId, type);
  }

  /**
   * Crear un nuevo recurso
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Post()
  async create(@Body() createResourceDto: CreateResourceDto, @CurrentUser() user: any) {
    // Determinar la empresa
    let companyId = user.companyId;
    
    // SUPER_ADMIN puede crear para cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN && createResourceDto.companyId) {
      companyId = createResourceDto.companyId;
    }

    if (!companyId) {
      throw new ForbiddenException('Debe especificar una empresa');
    }

    const { companyId: _, ...resourceData } = createResourceDto;
    
    return this.resourcesService.create({
      companyId,
      ...resourceData,
    });
  }

  /**
   * Actualizar un recurso
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateResourceDto: UpdateResourceDto,
    @CurrentUser() user: any,
  ) {
    const resource = await this.resourcesService.findById(id);
    
    if (!resource) {
      throw new NotFoundException('Recurso no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && resource.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    return this.resourcesService.update(id, updateResourceDto);
  }

  /**
   * Eliminar un recurso (soft delete)
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const resource = await this.resourcesService.findById(id);
    
    if (!resource) {
      throw new NotFoundException('Recurso no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && resource.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    return this.resourcesService.delete(id);
  }

  /**
   * Marcar recurso como disponible
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Patch(':id/available')
  async markAsAvailable(@Param('id') id: string, @CurrentUser() user: any) {
    const resource = await this.resourcesService.findById(id);
    
    if (!resource) {
      throw new NotFoundException('Recurso no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && resource.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    return this.resourcesService.markAsAvailable(id);
  }

  /**
   * Marcar recurso como ocupado
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Patch(':id/occupied')
  async markAsOccupied(@Param('id') id: string, @CurrentUser() user: any) {
    const resource = await this.resourcesService.findById(id);
    
    if (!resource) {
      throw new NotFoundException('Recurso no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && resource.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este recurso');
    }

    return this.resourcesService.markAsOccupied(id);
  }

  /**
   * Obtener recursos disponibles con capacidad mínima
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('available/capacity/:minCapacity')
  async findAvailableWithCapacity(
    @Param('minCapacity') minCapacity: string,
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    const capacity = parseInt(minCapacity);
    
    // SUPER_ADMIN puede filtrar por empresa
    if (user.role === AdminRole.SUPER_ADMIN && companyId) {
      return this.resourcesService.findAvailableWithCapacity(companyId, capacity, type);
    }

    return this.resourcesService.findAvailableWithCapacity(user.companyId, capacity, type);
  }

  /**
   * Obtener tipos de recursos únicos de la empresa
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('types/list')
  async getResourceTypes(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    const targetCompanyId = user.role === AdminRole.SUPER_ADMIN && companyId 
      ? companyId 
      : user.companyId;

    const resources = await this.prisma.resource.findMany({
      where: {
        companyId: targetCompanyId,
        active: true,
      },
      select: { type: true },
      distinct: ['type'],
    });

    return resources.map(r => r.type);
  }
}
