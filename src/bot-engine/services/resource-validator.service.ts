import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../../companies/companies.service';
import { ReservationsService } from '../../reservations/reservations.service';
import { ServicesService } from '../../services/services.service';
import { ProductsService } from '../../products/products.service';

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
    private servicesService: ServicesService,
    private productsService: ProductsService,
  ) {}

  /**
   * Valida y asigna recursos dinámicamente según el servicio
   */
  async validateAndAssignResources(
    companyId: string,
    service: string,
    date: string | undefined,
    time: string | undefined,
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
    
    // Obtener productos de la BD (tabla Product) - fallback a config legacy
    const dbProducts = await this.productsService.findByCompany(companyId);
    const products = dbProducts.length > 0 ? dbProducts : (config?.products || []);
    
    // Obtener config del servicio desde la tabla Service (nueva arquitectura)
    const dbService = await this.servicesService.getServiceByKey(companyId, service);
    const dbServiceConfig = dbService?.config as any || {};
    
    // Fallback a config legacy en company.config.services[service]
    const legacyServiceConfig = config?.services?.[service] || {};
    
    // Merge: prioridad a config de tabla Service
    const serviceConfig = { ...legacyServiceConfig, ...dbServiceConfig };

    const result: ResourceValidationResult = { isValid: true };

    // 1. VALIDAR Y ASIGNAR MESA (si el servicio requiere recursos/mesa según config)
    // requiresResources es el nuevo campo unificado, requiresTable es legacy
    const needsResourceValidation = serviceConfig?.requiresResources === true || serviceConfig?.requiresTable === true;
    if (needsResourceValidation && date && time) {
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
    date?: string
  ): Promise<ResourceValidationResult> {
    const unavailableItems: Array<{ id: string; name: string; reason: string }> = [];

    for (const item of requestedProducts) {
      // Buscar por ID exacto O por nombre (normalizado)
      const normalizedItemId = item.id.toLowerCase().trim();
      const product = catalogProducts.find(p => 
        p.id === item.id || 
        p.name?.toLowerCase().trim() === normalizedItemId ||
        p.name?.toLowerCase().includes(normalizedItemId) ||
        normalizedItemId.includes(p.name?.toLowerCase())
      );
      
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

      // Validar disponibilidad por fecha (si existe y hay fecha)
      if (date && product.availableDates && Array.isArray(product.availableDates)) {
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

  /**
   * Restaura stock de productos cuando un pago es rechazado o cancelado
   * Devuelve las cantidades que fueron reservadas previamente
   */
  async restoreProductStock(
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
          stock: product.stock + requestedItem.quantity, // Sumar de vuelta
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
