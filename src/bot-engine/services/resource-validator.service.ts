import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../../companies/companies.service';
import { ReservationsService } from '../../reservations/reservations.service';

export interface ResourceValidationResult {
  isValid: boolean;
  message?: string;
  assignedResource?: { id: string; name: string };
  unavailableItems?: Array<{ id: string; name: string; reason: string }>;
}

@Injectable()
export class ResourceValidatorService {
  constructor(
    private companiesService: CompaniesService,
    private reservationsService: ReservationsService,
  ) {}

  /**
   * Valida y asigna recursos dinámicamente según el servicio
   */
  async validateAndAssignResources(
    companyId: string,
    service: string,
    date: string,
    time: string,
    data: {
      guests?: number;
      products?: Array<{ id: string; quantity: number }>;
      tableId?: string; // Mesa específica si se menciona
    }
  ): Promise<ResourceValidationResult> {
    const company = await this.companiesService.findOne(companyId);
    if (!company) {
      return { isValid: false, message: 'Empresa no encontrada' };
    }

    const config = company.config as any;
    const resources = config?.resources || [];
    const products = config?.products || [];
    const serviceConfig = config?.services?.[service];

    const result: ResourceValidationResult = { isValid: true };

    // 1. VALIDAR Y ASIGNAR MESA (si es servicio de mesa)
    if (service === 'mesa' || serviceConfig?.requiresTable) {
      const tableResult = await this.validateTable(
        resources,
        data.tableId,
        data.guests || 1,
        date,
        time,
        companyId
      );
      
      if (!tableResult.isValid) {
        return { isValid: false, message: tableResult.message };
      }
      
      if (tableResult.assignedResource) {
        result.assignedResource = tableResult.assignedResource;
      }
    }

    // 2. VALIDAR STOCK DE PRODUCTOS (si hay productos)
    if (data.products && data.products.length > 0) {
      const productsResult = await this.validateProducts(
        products,
        data.products,
        date
      );
      
      if (!productsResult.isValid) {
        return {
          isValid: false,
          message: productsResult.message,
          unavailableItems: productsResult.unavailableItems,
        };
      }
    }

    return result;
  }

  /**
   * Valida y asigna mesa (opcional si se menciona, automática si no)
   */
  private async validateTable(
    resources: any[],
    requestedTableId: string | undefined,
    guests: number,
    date: string,
    time: string,
    companyId: string
  ): Promise<ResourceValidationResult> {
    const tables = resources.filter(r => r.type === 'mesa');
    
    // Si se menciona mesa específica, validarla
    if (requestedTableId) {
      const table = tables.find(t => 
        t.id === requestedTableId || 
        t.id?.toLowerCase() === requestedTableId.toLowerCase() ||
        t.name?.toLowerCase().includes(requestedTableId.toLowerCase())
      );
      
      if (!table) {
        return {
          isValid: false,
          message: `❌ La mesa "${requestedTableId}" no existe.`,
        };
      }
      
      // Verificar si la mesa está disponible en esa fecha/hora
      const isOccupied = await this.isTableOccupied(table.id, date, time, companyId);
      if (isOccupied) {
        return {
          isValid: false,
          message: `❌ La ${table.name} ya está reservada para ese horario.`,
        };
      }
      
      // Verificar capacidad
      if (table.capacity < guests) {
        return {
          isValid: false,
          message: `❌ La ${table.name} solo tiene capacidad para ${table.capacity} personas.`,
        };
      }
      
      return {
        isValid: true,
        assignedResource: { id: table.id, name: table.name },
      };
    }
    
    // Si NO se menciona mesa, buscar una disponible automáticamente
    const reservations = await this.reservationsService.findAll(companyId);
    const reservationsOnDateTime = reservations.filter(
      r => r.date === date && r.time === time && r.status !== 'cancelled'
    );
    
    const occupiedTableIds = reservationsOnDateTime
      .map(r => {
        const metadata = r.metadata as any;
        return metadata?.tableId;
      })
      .filter(Boolean);
    
    const availableTable = tables.find(t => 
      !occupiedTableIds.includes(t.id) &&
      t.available &&
      t.capacity >= guests
    );
    
    if (availableTable) {
      return {
        isValid: true,
        assignedResource: { id: availableTable.id, name: availableTable.name },
      };
    }
    
    // Si no hay mesa disponible, pero hay capacidad total, reservar sin mesa específica
    return { isValid: true };
  }

  /**
   * Valida stock y disponibilidad de productos
   */
  private async validateProducts(
    catalogProducts: any[],
    requestedProducts: Array<{ id: string; quantity: number }>,
    date: string
  ): Promise<ResourceValidationResult> {
    const unavailableItems: Array<{ id: string; name: string; reason: string }> = [];

    for (const item of requestedProducts) {
      const product = catalogProducts.find(p => p.id === item.id);
      
      if (!product) {
        unavailableItems.push({
          id: item.id,
          name: item.id,
          reason: 'Producto no encontrado en el catálogo',
        });
        continue;
      }

      // Validar si el producto está disponible
      if (product.available === false) {
        unavailableItems.push({
          id: product.id,
          name: product.name,
          reason: 'No está disponible en este momento',
        });
        continue;
      }

      // Validar stock (si existe en la configuración)
      if (product.stock !== undefined && product.stock !== null) {
        if (product.stock < item.quantity) {
          unavailableItems.push({
            id: product.id,
            name: product.name,
            reason: `Solo hay ${product.stock} disponible${product.stock === 1 ? '' : 's'}`,
          });
          continue;
        }
      }

      // Validar disponibilidad por fecha (si existe)
      if (product.availableDates && Array.isArray(product.availableDates)) {
        if (!product.availableDates.includes(date)) {
          unavailableItems.push({
            id: product.id,
            name: product.name,
            reason: `No disponible para la fecha ${date}`,
          });
          continue;
        }
      }

      // Validar fechas excluidas (si existe)
      if (product.excludedDates && Array.isArray(product.excludedDates)) {
        if (product.excludedDates.includes(date)) {
          unavailableItems.push({
            id: product.id,
            name: product.name,
            reason: `No disponible para la fecha ${date}`,
          });
          continue;
        }
      }
    }

    if (unavailableItems.length > 0) {
      const itemsList = unavailableItems
        .map(item => `• ${item.name}: ${item.reason}`)
        .join('\n');
      
      return {
        isValid: false,
        message: `❌ Los siguientes productos no están disponibles:\n${itemsList}`,
        unavailableItems,
      };
    }

    return { isValid: true };
  }

  /**
   * Verifica si una mesa está ocupada en una fecha/hora
   */
  private async isTableOccupied(
    tableId: string,
    date: string,
    time: string,
    companyId: string
  ): Promise<boolean> {
    const reservations = await this.reservationsService.findAll(companyId);
    return reservations.some(r => 
      r.date === date &&
      r.time === time &&
      r.status !== 'cancelled' &&
      (r.metadata as any)?.tableId === tableId
    );
  }

  /**
   * Descuenta stock de productos al crear pedido
   */
  async decrementProductStock(
    companyId: string,
    products: Array<{ id: string; quantity: number }>
  ): Promise<void> {
    const company = await this.companiesService.findOne(companyId);
    if (!company) return;

    const config = company.config as any;
    const catalogProducts = config?.products || [];
    
    let updated = false;
    const updatedProducts = catalogProducts.map((product: any) => {
      const requestedItem = products.find(p => p.id === product.id);
      if (requestedItem && product.stock !== undefined && product.stock !== null) {
        updated = true;
        return {
          ...product,
          stock: Math.max(0, product.stock - requestedItem.quantity),
        };
      }
      return product;
    });

    if (updated) {
      await this.companiesService.update(companyId, {
        config: {
          ...config,
          products: updatedProducts,
        },
      });
    }
  }
}
