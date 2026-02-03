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
import { IsString, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';
import { ProductsService } from './products.service';
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

class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price: number;

  @IsString()
  category: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsBoolean()
  hasStock?: boolean;

  @IsOptional()
  @IsNumber()
  stock?: number;

  @IsOptional()
  @IsNumber()
  minStock?: number;

  @IsOptional()
  @IsArray()
  keywords?: string[];

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  companyId?: string; // Solo para SUPER_ADMIN
}

class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  keywords?: string[];

  @IsOptional()
  @IsString()
  imageUrl?: string;
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Obtener todos los productos
   * - SUPER_ADMIN: Ve todos los productos de todas las empresas
   * - COMPANY_ADMIN/COMPANY_USER: Solo ve productos de su empresa
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('companyId') companyId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('category') category?: string,
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
      ...(category && { category }),
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
    const total = await this.prisma.product.count({ where });

    // Obtener productos paginados
    const products = await this.prisma.product.findMany({
      where,
      include: {
        company: user.role === AdminRole.SUPER_ADMIN ? {
          select: { id: true, name: true, slug: true },
        } : undefined,
      },
      orderBy: [
        { companyId: 'asc' },
        { category: 'asc' },
        { name: 'asc' },
      ],
      skip,
      take: pageSize,
    });

    return {
      data: products,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Obtener producto por ID
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const product = await this.productsService.findById(id);
    
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Verificar acceso (SUPER_ADMIN puede ver cualquiera)
    if (user.role !== AdminRole.SUPER_ADMIN && product.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este producto');
    }

    return product;
  }

  /**
   * Crear un nuevo producto
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Post()
  async create(@Body() createProductDto: CreateProductDto, @CurrentUser() user: any) {
    // Determinar la empresa
    let companyId = user.companyId;
    
    // SUPER_ADMIN puede crear para cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN && createProductDto.companyId) {
      companyId = createProductDto.companyId;
    }

    if (!companyId) {
      throw new ForbiddenException('Debe especificar una empresa');
    }

    const { companyId: _, ...productData } = createProductDto;
    
    return this.productsService.create({
      companyId,
      ...productData,
    });
  }

  /**
   * Actualizar un producto
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: any,
  ) {
    const product = await this.productsService.findById(id);
    
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && product.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este producto');
    }

    return this.productsService.update(id, updateProductDto);
  }

  /**
   * Eliminar un producto (soft delete)
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    const product = await this.productsService.findById(id);
    
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && product.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este producto');
    }

    return this.productsService.delete(id);
  }

  /**
   * Obtener productos con stock bajo (alerta)
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get('low-stock/all')
  async findLowStock(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    // SUPER_ADMIN puede ver de cualquier empresa
    if (user.role === AdminRole.SUPER_ADMIN) {
      if (companyId) {
        return this.productsService.findLowStock(companyId);
      }
      
      // Obtener productos con stock bajo de todas las empresas
      return this.prisma.product.findMany({
        where: {
          hasStock: true,
          active: true,
          stock: {
            lte: 5, // Por defecto minStock es 5
          },
        },
        include: {
          company: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { stock: 'asc' },
      });
    }

    return this.productsService.findLowStock(user.companyId);
  }

  /**
   * Obtener movimientos de stock de un producto
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN, AdminRole.COMPANY_USER)
  @Get(':id/stock-movements')
  async getStockMovements(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
  ) {
    const product = await this.productsService.findById(id);
    
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && product.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este producto');
    }

    return this.productsService.getStockMovements(id, limit ? parseInt(limit) : undefined);
  }

  /**
   * Ajustar stock (para admins)
   */
  @UseGuards(RolesGuard)
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.COMPANY_ADMIN)
  @Post(':id/stock-adjustment')
  async adjustStock(
    @Param('id') id: string,
    @Body() body: { quantity: number; reason?: string },
    @CurrentUser() user: any,
  ) {
    const product = await this.productsService.findById(id);
    
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    // Verificar acceso
    if (user.role !== AdminRole.SUPER_ADMIN && product.companyId !== user.companyId) {
      throw new ForbiddenException('No tienes acceso a este producto');
    }

    const { quantity, reason = 'manual_adjustment' } = body;
    
    if (quantity > 0) {
      return this.productsService.increaseStock(id, quantity, reason);
    } else {
      return this.productsService.reduceStock(id, Math.abs(quantity), reason);
    }
  }
}
