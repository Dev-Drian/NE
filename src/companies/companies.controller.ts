import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AdminRole } from '@prisma/client';

class CreateCompanyDto {
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
}

class UpdateCompanyDto {
  name?: string;
  slug?: string;
  type?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo?: string;
  config?: any;
  active?: boolean;
  openaiApiKey?: string;
  geminiApiKey?: string;
  preferredAiProvider?: string;
  requiresPayment?: boolean;
  paymentPercentage?: number;
  wompiPublicKey?: string;
  wompiPrivateKey?: string;
  wompiEventsSecret?: string;
  wompiEnabled?: boolean;
}

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // Solo SUPER_ADMIN puede crear empresas
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  // Solo SUPER_ADMIN puede listar todas las empresas
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.companiesService.findAll(includeInactive === 'true');
  }

  // Solo SUPER_ADMIN puede ver estadísticas de todas las empresas
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Get('stats')
  findAllWithStats() {
    return this.companiesService.findAllWithStats();
  }

  // Público para el bot - buscar por slug
  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const company = await this.companiesService.findBySlug(slug);
    if (!company) {
      return { exists: false, message: 'Empresa no encontrada' };
    }
    return { exists: true, data: company };
  }

  // Cualquier admin autenticado puede ver su empresa (validación interna)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    // Si no es super admin, solo puede ver su empresa
    if (user.role !== AdminRole.SUPER_ADMIN && user.companyId !== id) {
      return { exists: false, message: 'No tienes acceso a esta empresa' };
    }

    const company = await this.companiesService.findOne(id);
    if (!company) {
      return { exists: false, message: 'Empresa no encontrada' };
    }
    return { exists: true, data: company };
  }

  // SUPER_ADMIN o COMPANY_ADMIN de la empresa pueden editar
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string, 
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: any
  ) {
    // Si no es super admin, solo puede editar su empresa
    if (user.role !== AdminRole.SUPER_ADMIN && user.companyId !== id) {
      return { success: false, message: 'No tienes acceso a esta empresa' };
    }

    // Company admins no pueden cambiar ciertos campos
    if (user.role === AdminRole.COMPANY_ADMIN) {
      delete updateCompanyDto.active;
      delete updateCompanyDto.slug;
    }

    return this.companiesService.update(id, updateCompanyDto);
  }

  // Solo SUPER_ADMIN puede eliminar (soft delete)
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  // Solo SUPER_ADMIN puede eliminar permanentemente
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Delete(':id/hard')
  hardDelete(@Param('id') id: string) {
    return this.companiesService.hardDelete(id);
  }

  // Utilidad para generar slug
  // Utilidad para generar slug
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN)
  @Post('generate-slug')
  generateSlug(@Body('name') name: string) {
    return { slug: this.companiesService.generateSlug(name) };
  }
}





