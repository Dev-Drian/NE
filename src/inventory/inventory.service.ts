import { Injectable, Logger, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface StockCheckResult {
  productId: string;
  productName: string;
  available: boolean;
  currentStock: number;
  reservedStock: number;
  availableForSale: number;
  hasStock: boolean;
}

export interface StockReservation {
  productId: string;
  quantity: number;
  reservationId?: string;
  orderId?: string;
}

export interface LowStockAlert {
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  deficit: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Verifica disponibilidad de stock para un producto
   */
  async checkStock(productId: string, quantity: number = 1): Promise<StockCheckResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BadRequestException(`Producto ${productId} no encontrado`);
    }

    // Si el producto no maneja stock, siempre está disponible
    if (!product.hasStock) {
      return {
        productId: product.id,
        productName: product.name,
        available: product.available && product.active,
        currentStock: -1, // -1 indica stock infinito
        reservedStock: 0,
        availableForSale: -1,
        hasStock: false,
      };
    }

    const availableForSale = product.stock;
    const canFulfill = availableForSale >= quantity;

    return {
      productId: product.id,
      productName: product.name,
      available: canFulfill && product.available && product.active,
      currentStock: product.stock,
      reservedStock: 0, // TODO: Implementar reservas temporales
      availableForSale,
      hasStock: true,
    };
  }

  /**
   * Verifica stock múltiple de productos
   */
  async checkMultipleStock(items: { productId: string; quantity: number }[]): Promise<{
    allAvailable: boolean;
    results: StockCheckResult[];
    unavailableItems: StockCheckResult[];
  }> {
    const results: StockCheckResult[] = [];
    const unavailableItems: StockCheckResult[] = [];

    for (const item of items) {
      const result = await this.checkStock(item.productId, item.quantity);
      results.push(result);
      
      if (!result.available) {
        unavailableItems.push(result);
      }
    }

    return {
      allAvailable: unavailableItems.length === 0,
      results,
      unavailableItems,
    };
  }

  /**
   * Reserva stock (descuenta del inventario) - CON TRANSACCIÓN
   */
  async reserveStock(
    productId: string,
    quantity: number,
    reason: string = 'sale',
    reservationId?: string,
    userId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Bloqueo pesimista con FOR UPDATE
      const product = await tx.$queryRaw<any[]>`
        SELECT * FROM "products" 
        WHERE "id" = ${productId}
        FOR UPDATE NOWAIT
      `;

      if (!product || product.length === 0) {
        throw new BadRequestException(`Producto ${productId} no encontrado`);
      }

      const p = product[0];

      // Verificar que tiene stock físico
      if (!p.hasStock) {
        this.logger.log(`Producto ${productId} no maneja stock físico, saltando reserva`);
        return;
      }

      // Verificar disponibilidad
      if (p.stock < quantity) {
        throw new ConflictException(
          `Stock insuficiente para ${p.name}. Disponible: ${p.stock}, Solicitado: ${quantity}`
        );
      }

      const previousStock = p.stock;
      const newStock = previousStock - quantity;

      // Actualizar stock
      await tx.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });

      // Registrar movimiento
      await tx.stockMovement.create({
        data: {
          productId,
          type: 'out',
          quantity: -quantity,
          previousStock,
          newStock,
          reason,
          reservationId,
          userId,
        },
      });

      this.logger.log(`📦 Stock reservado: ${p.name} - ${quantity} unidades (${previousStock} → ${newStock})`);

      // Emitir evento si stock bajo
      if (newStock <= p.minStock) {
        this.eventEmitter.emit('inventory.low-stock', {
          productId,
          productName: p.name,
          currentStock: newStock,
          minStock: p.minStock,
        });
      }
    });
  }

  /**
   * Libera stock (devuelve al inventario) - CON TRANSACCIÓN
   */
  async releaseStock(
    productId: string,
    quantity: number,
    reason: string = 'cancelled',
    reservationId?: string,
    userId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new BadRequestException(`Producto ${productId} no encontrado`);
      }

      if (!product.hasStock) {
        return; // No maneja stock
      }

      const previousStock = product.stock;
      const newStock = previousStock + quantity;

      // Actualizar stock
      await tx.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });

      // Registrar movimiento
      await tx.stockMovement.create({
        data: {
          productId,
          type: 'in',
          quantity,
          previousStock,
          newStock,
          reason,
          reservationId,
          userId,
        },
      });

      this.logger.log(`📦 Stock liberado: ${product.name} + ${quantity} unidades (${previousStock} → ${newStock})`);
    });
  }

  /**
   * Ajusta stock manualmente (restock, corrección, etc.)
   */
  async adjustStock(
    productId: string,
    adjustment: number,
    reason: string,
    notes?: string,
    userId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new BadRequestException(`Producto ${productId} no encontrado`);
      }

      const previousStock = product.stock;
      const newStock = previousStock + adjustment;

      if (newStock < 0) {
        throw new BadRequestException(`El ajuste resultaría en stock negativo: ${newStock}`);
      }

      await tx.product.update({
        where: { id: productId },
        data: { stock: newStock },
      });

      await tx.stockMovement.create({
        data: {
          productId,
          type: adjustment > 0 ? 'in' : 'out',
          quantity: adjustment,
          previousStock,
          newStock,
          reason,
          notes,
          userId,
        },
      });

      this.logger.log(`📦 Stock ajustado: ${product.name} ${adjustment > 0 ? '+' : ''}${adjustment} (${previousStock} → ${newStock}) - ${reason}`);
    });
  }

  /**
   * Obtiene alertas de stock bajo para una empresa
   */
  async getLowStockAlerts(companyId: string): Promise<LowStockAlert[]> {
    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        hasStock: true,
        active: true,
      },
    });

    return products
      .filter(p => p.stock <= p.minStock)
      .map(p => ({
        productId: p.id,
        productName: p.name,
        currentStock: p.stock,
        minStock: p.minStock,
        deficit: p.minStock - p.stock,
      }));
  }

  /**
   * Obtiene historial de movimientos de un producto
   */
  async getStockHistory(productId: string, limit: number = 50) {
    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Reserva múltiple de productos - TODO EN UNA TRANSACCIÓN
   */
  async reserveMultipleStock(
    items: StockReservation[],
    reservationId?: string,
    userId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        // Obtener producto con bloqueo
        const products = await tx.$queryRaw<any[]>`
          SELECT * FROM "products" 
          WHERE "id" = ${item.productId}
          FOR UPDATE NOWAIT
        `;

        if (!products || products.length === 0) {
          throw new BadRequestException(`Producto ${item.productId} no encontrado`);
        }

        const product = products[0];

        if (!product.hasStock) continue;

        if (product.stock < item.quantity) {
          throw new ConflictException(
            `Stock insuficiente para ${product.name}. Disponible: ${product.stock}, Solicitado: ${item.quantity}`
          );
        }

        const previousStock = product.stock;
        const newStock = previousStock - item.quantity;

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'out',
            quantity: -item.quantity,
            previousStock,
            newStock,
            reason: 'sale',
            reservationId: reservationId || item.reservationId,
            userId,
          },
        });

        // Emitir evento si stock bajo
        if (newStock <= product.minStock) {
          this.eventEmitter.emit('inventory.low-stock', {
            productId: item.productId,
            productName: product.name,
            currentStock: newStock,
            minStock: product.minStock,
          });
        }
      }
    });

    this.logger.log(`📦 Stock múltiple reservado: ${items.length} productos`);
  }

  /**
   * Libera múltiple stock
   */
  async releaseMultipleStock(
    items: StockReservation[],
    reason: string = 'cancelled',
    reservationId?: string,
    userId?: string,
  ): Promise<void> {
    for (const item of items) {
      await this.releaseStock(
        item.productId,
        item.quantity,
        reason,
        reservationId || item.reservationId,
        userId,
      );
    }
  }
}
