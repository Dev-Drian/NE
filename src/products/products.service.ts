import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Obtener todos los productos de una empresa (activos y disponibles)
   */
  async findByCompany(companyId: string, includeInactive = false) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        active: includeInactive ? undefined : true,
        available: includeInactive ? undefined : true,
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Obtener productos por categoría
   */
  async findByCategory(companyId: string, category: string) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        category,
        active: true,
        available: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Buscar producto por ID
   */
  async findById(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
    });
  }

  /**
   * Buscar producto por nombre (fuzzy search con keywords)
   */
  async findByName(companyId: string, productName: string) {
    const normalizedName = productName.toLowerCase().trim();
    
    // Buscar por nombre exacto o keywords
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        active: true,
        available: true,
        OR: [
          { name: { contains: normalizedName, mode: 'insensitive' } },
          { keywords: { hasSome: [normalizedName] } },
        ],
      },
    });

    return products;
  }

  /**
   * Buscar múltiples productos por sus IDs
   */
  async findByIds(productIds: string[]) {
    return this.prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
    });
  }

  /**
   * Verificar si un producto tiene stock disponible
   */
  async hasStock(productId: string, quantity: number = 1): Promise<boolean> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { hasStock: true, stock: true },
    });

    if (!product) return false;
    if (!product.hasStock) return true; // No requiere stock
    
    return product.stock >= quantity;
  }

  /**
   * Reducir stock de un producto (al hacer reserva/venta)
   */
  async reduceStock(productId: string, quantity: number, reason = 'sale', reservationId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Producto ${productId} no encontrado`);
    }

    if (!product.hasStock) {
      // No requiere control de stock
      return product;
    }

    if (product.stock < quantity) {
      throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}, Solicitado: ${quantity}`);
    }

    const previousStock = product.stock;
    const newStock = previousStock - quantity;

    // Actualizar stock y crear movimiento en una transacción
    const [updatedProduct] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      }),
      this.prisma.stockMovement.create({
        data: {
          productId,
          type: 'out',
          quantity: -quantity, // Negativo porque sale
          previousStock,
          newStock,
          reason,
          reservationId,
        },
      }),
    ]);

    this.logger.log(`Stock reducido: ${product.name} (${previousStock} → ${newStock})`);
    
    return updatedProduct;
  }

  /**
   * Aumentar stock de un producto (al reabastecer o cancelar)
   */
  async increaseStock(productId: string, quantity: number, reason = 'restock', reservationId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Producto ${productId} no encontrado`);
    }

    if (!product.hasStock) {
      // No requiere control de stock
      return product;
    }

    const previousStock = product.stock;
    const newStock = previousStock + quantity;

    // Actualizar stock y crear movimiento en una transacción
    const [updatedProduct] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock },
      }),
      this.prisma.stockMovement.create({
        data: {
          productId,
          type: 'in',
          quantity: quantity, // Positivo porque entra
          previousStock,
          newStock,
          reason,
          reservationId,
        },
      }),
    ]);

    this.logger.log(`Stock aumentado: ${product.name} (${previousStock} → ${newStock})`);
    
    return updatedProduct;
  }

  /**
   * Obtener productos con stock bajo (alerta)
   */
  async findLowStock(companyId: string) {
    return this.prisma.product.findMany({
      where: {
        companyId,
        hasStock: true,
        active: true,
        stock: {
          lte: this.prisma.product.fields.minStock, // stock <= minStock
        },
      },
      orderBy: { stock: 'asc' },
    });
  }

  /**
   * Obtener historial de movimientos de stock
   */
  async getStockMovements(productId: string, limit = 50) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Crear un nuevo producto
   */
  async create(data: {
    companyId: string;
    name: string;
    description?: string;
    price: number;
    category: string;
    duration?: number;
    hasStock?: boolean;
    stock?: number;
    minStock?: number;
    keywords?: string[];
    imageUrl?: string;
  }) {
    const product = await this.prisma.product.create({
      data,
    });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('product.created', {
      productId: product.id,
      companyId: product.companyId,
    });
    
    return product;
  }

  /**
   * Actualizar un producto
   */
  async update(productId: string, data: Partial<{
    name: string;
    description: string;
    price: number;
    category: string;
    duration: number;
    available: boolean;
    active: boolean;
    keywords: string[];
    imageUrl: string;
  }>) {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data,
    });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('product.updated', {
      productId: product.id,
      companyId: product.companyId,
    });
    
    return product;
  }

  /**
   * Eliminar un producto (soft delete)
   */
  async delete(productId: string) {
    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { active: false, available: false },
    });
    
    // Emitir evento para invalidar cache
    this.eventEmitter.emit('product.deleted', {
      productId: product.id,
      companyId: product.companyId,
    });
    
    return product;
  }
}
