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
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsObject } from 'class-validator';
import { ServicesService, ServiceConfig } from './services.service';
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

class CreateServiceDto {
  @IsString()
  key: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  requiredFields?: string[];

  @IsOptional()
  @IsArray()
  optionalFields?: string[];

  @IsOptional()
  @IsArray()
  allowedProductCategories?: string[];

  @IsOptional()
  @IsObject()
  config?: ServiceConfig;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsArray()
  keywords?: string[];

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsString()
  companyId?: string; // Solo para SUPER_ADMIN
}

class UpdateServiceDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  requiredFields?: string[];

  @IsOptional()
  @IsArray()
  optionalFields?: string[];

  @IsOptional()
  @IsArray()
  allowedProductCategories?: string[];

  @IsOptional()
  @IsObject()
  config?: ServiceConfig;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsArray()
  keywords?: string[];

  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtener todos los servicios
   * - SUPER_ADMIN: Ve todos los servicios de todas las empresas
   * - COMPANY_ADMIN/COMPANY_USER: Solo ve servicios de su empresa
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
    @Query('includeInactive') includeInactive?: string,
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
    const total = await this.prisma.service.count({ where });

    // Obtener servicios paginados
    const services = await this.prisma.service.findMany({
      where,
      include: {
        company: user.role === AdminRole.SUPER_ADMIN ? {
          select: { id: true, name: true, slug: true },
        } : undefined,
      },
      orderBy: [
        { companyId: 'asc' },
        { displayOrder: 'asc' },
      ],
      skip,
      take: pageSize,
    });

    return {
      data: services,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Obtener servicio por ID
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const service = await this.servicesService.findById(id);
    
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // Verificar acceso (SUPER_ADMIN puede ver cualquiera)
    if (user.role !== AdminRole.SUPER_ADMIN && service.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este servicio');
    }

    return service;
  }

  /**
   * Crear un nuevo servicio
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Post()
  async create(@Body() createServiceDto: CreateServiceDto, @CurrentUser() user: any) {
    // Determinar la empresa
    let companyId = user.companyId;
    
    // SUPER_ADMIN puede crear para cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN && createServiceDto.companyId) {
      companyId = createServiceDto.companyId;
    }

    if (!companyId) {
      throw new ForbiddenException('Debe especificar una empresa');
    }

    const { companyId: _, ...serviceData } = createServiceDto;
    
    return this.servicesService.create({
      ...serviceData,
      config: serviceData.config as any, // Cast para compatibilidad con Prisma JSON
      company: {
        connect: { id: companyId },
      },
    });
  }

  /**
   * Actualizar un servicio
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
    @CurrentUser() user: any,
  ) {
    const service = await this.servicesService.findById(id);
    
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && service.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este servicio');
    }

    return this.servicesService.update(id, {
      ...updateServiceDto,
      config: updateServiceDto.config as any, // Cast para compatibilidad con Prisma JSON
    });
  }

  /**
   * Eliminar un servicio
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const service = await this.servicesService.findById(id);
    
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && service.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este servicio');
    }

    await this.servicesService.delete(id);
    return { message: 'Servicio eliminado correctamente' };
  }

  /**
   * Obtener servicios disponibles para mostrar a clientes
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('available/list')
  async getAvailableServices(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    // SUPER_ADMIN puede ver de cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN && companyId) {
      return this.servicesService.getAvailableServices(companyId);
    }

    return this.servicesService.getAvailableServices(user.companyId);
  }

  /**
   * Obtener servicio por key
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('by-key/:key')
  async findByKey(
    @Param('key') key: string, 
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
  ) {
    // SUPER_ADMIN puede buscar en cualquier empresa
    const targetCompanyId = user.role === AdminRole.SUPER_ADMIN && companyId 
      ? companyId 
      : user.companyId;

    const service = await this.servicesService.getServiceByKey(targetCompanyId, key);
    
    if (!service) {
      throw new NotFoundException(`Servicio con key "${key}" no encontrado`);
    }

    return service;
  }

  /**
   * Limpiar cache de servicios (útil después de actualizaciones masivas)
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Post('clear-cache')
  async clearCache(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    // SUPER_ADMIN puede limpiar cache de cualquier empresa o todo
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (companyId) {
        this.servicesService.clearCache(companyId);
        return { message: `Cache limpiado para empresa ${companyId}` };
      }
      this.servicesService.clearCache();
      return { message: 'Cache completo limpiado' };
    }

    this.servicesService.clearCache(user.companyId);
    return { message: 'Cache limpiado para su empresa' };
  }
}
