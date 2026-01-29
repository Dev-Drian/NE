import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { ResourcesService } from '../resources/resources.service';

/**
 * Helper para facilitar la transición de productos/recursos desde JSON (config) a tablas de BD
 * Este servicio intenta primero buscar en BD, y si no encuentra, busca en config
 */
@Injectable()
export class ProductResourceHelper {
  constructor(
    private productsService: ProductsService,
    private resourcesService: ResourcesService,
  ) {}

  /**
   * Obtener productos de una empresa (primero BD, luego JSON)
   */
  async getProducts(companyId: string, companyConfig?: any): Promise<any[]> {
    // Intentar primero desde BD
    const productsFromDB = await this.productsService.findByCompany(companyId);
    
    if (productsFromDB && productsFromDB.length > 0) {
      // Convertir formato de BD a formato compatible con código existente
      return productsFromDB.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        duration: p.duration,
        available: p.available,
        stock: p.hasStock ? p.stock : undefined,
      }));
    }

    // Fallback: buscar en config si no hay productos en BD
    if (companyConfig?.products && Array.isArray(companyConfig.products)) {
      return companyConfig.products;
    }

    return [];
  }

  /**
   * Obtener recursos de una empresa (primero BD, luego JSON)
   */
  async getResources(companyId: string, companyConfig?: any): Promise<any[]> {
    // Intentar primero desde BD
    const resourcesFromDB = await this.resourcesService.findByCompany(companyId);
    
    if (resourcesFromDB && resourcesFromDB.length > 0) {
      // Convertir formato de BD a formato compatible con código existente
      return resourcesFromDB.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        capacity: r.capacity,
        available: r.available,
      }));
    }

    // Fallback: buscar en config si no hay recursos en BD
    if (companyConfig?.resources && Array.isArray(companyConfig.resources)) {
      return companyConfig.resources;
    }

    return [];
  }

  /**
   * Buscar producto por nombre (en BD o JSON)
   */
  async findProductByName(companyId: string, productName: string, companyConfig?: any): Promise<any | null> {
    // Intentar primero desde BD
    const productsFromDB = await this.productsService.findByName(companyId, productName);
    
    if (productsFromDB && productsFromDB.length > 0) {
      const product = productsFromDB[0];
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: product.category,
        duration: product.duration,
        available: product.available,
        stock: product.hasStock ? product.stock : undefined,
      };
    }

    // Fallback: buscar en config
    if (companyConfig?.products && Array.isArray(companyConfig.products)) {
      const normalizedName = productName.toLowerCase().trim();
      const product = companyConfig.products.find((p: any) => 
        p.name.toLowerCase().includes(normalizedName)
      );
      return product || null;
    }

    return null;
  }

  /**
   * Buscar recurso por ID (en BD o JSON)
   */
  async findResourceById(companyId: string, resourceId: string, companyConfig?: any): Promise<any | null> {
    // Intentar primero desde BD
    const resourceFromDB = await this.resourcesService.findById(resourceId);
    
    if (resourceFromDB) {
      return {
        id: resourceFromDB.id,
        name: resourceFromDB.name,
        type: resourceFromDB.type,
        capacity: resourceFromDB.capacity,
        available: resourceFromDB.available,
      };
    }

    // Fallback: buscar en config
    if (companyConfig?.resources && Array.isArray(companyConfig.resources)) {
      const resource = companyConfig.resources.find((r: any) => r.id === resourceId);
      return resource || null;
    }

    return null;
  }
}
