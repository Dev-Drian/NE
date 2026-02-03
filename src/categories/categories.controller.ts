import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminRole, EntityType } from '@prisma/client';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * Obtener categorías por tipo de entidad
   * - SUPER_ADMIN: Ve todas (globales + de cualquier empresa)
   * - COMPANY_ADMIN/USER: Ve las de su empresa + globales
   */
  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  async findAll(
    @CurrentUser() user: any,
    @Query('entityType') entityType?: EntityType,
    @Query('companyId') companyId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const includeAll = includeInactive === 'true';

    // SUPER_ADMIN puede ver de cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (companyId) {
        return this.categoriesService.findByCompany(companyId, includeAll);
      }
      
      // Ver todas las categorías (globales y de todas las empresas)
      if (entityType) {
        return this.categoriesService.findByCompanyAndType(null, entityType, true);
      }
      
      return this.categoriesService.findByCompany(null, includeAll);
    }

    // COMPANY_ADMIN/USER: solo de su empresa + globales
    if (entityType) {
      return this.categoriesService.findByCompanyAndType(user.companyId, entityType, true);
    }
    
    return this.categoriesService.findByCompany(user.companyId, includeAll);
  }

  /**
   * Obtener categoría por ID
   */
  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  async findOne(@Param('id') id: string) {
    return this.categoriesService.findById(id);
  }

  /**
   * Crear categoría
   */
  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  async create(
    @CurrentUser() user: any,
    @Body() createDto: {
      name: string;
      key: string;
      entityType: EntityType;
      companyId?: string;
      description?: string;
      icon?: string;
      color?: string;
      displayOrder?: number;
    },
  ) {
    // SUPER_ADMIN puede crear para cualquier empresa o globales
    if (user.role === AdminRole.SUPER_ADMIN) {
      return this.categoriesService.create(createDto);
    }

    // COMPANY_ADMIN solo puede crear para su empresa
    return this.categoriesService.create({
      ...createDto,
      companyId: user.companyId,
    });
  }

  /**
   * Actualizar categoría
   */
  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateDto: {
      name?: string;
      key?: string;
      description?: string;
      icon?: string;
      color?: string;
      displayOrder?: number;
      active?: boolean;
    },
  ) {
    return this.categoriesService.update(id, updateDto);
  }

  /**
   * Eliminar categoría
   */
  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  async delete(@Param('id') id: string) {
    return this.categoriesService.delete(id);
  }
}
