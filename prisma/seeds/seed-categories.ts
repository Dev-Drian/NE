import { PrismaClient, EntityType } from '@prisma/client';

/**
 * Categorías globales del sistema (companyId = null)
 * Estas son categorías predeterminadas que todas las empresas pueden usar
 */
export async function seedGlobalCategories(prisma: PrismaClient) {
  console.log('🏷️  Creando categorías globales...');

  // Categorías para PRODUCTOS
  const productCategories = [
    { key: 'food', name: 'Comida', icon: '🍽️', color: '#10b981', displayOrder: 1 },
    { key: 'drink', name: 'Bebidas', icon: '🥤', color: '#3b82f6', displayOrder: 2 },
    { key: 'dessert', name: 'Postres', icon: '🍰', color: '#ec4899', displayOrder: 3 },
    { key: 'dental', name: 'Dental', icon: '🦷', color: '#06b6d4', displayOrder: 4 },
    { key: 'medicine', name: 'Medicamentos', icon: '💊', color: '#8b5cf6', displayOrder: 5 },
    { key: 'clothing', name: 'Ropa', icon: '👔', color: '#f59e0b', displayOrder: 6 },
    { key: 'accessories', name: 'Accesorios', icon: '👜', color: '#ef4444', displayOrder: 7 },
    { key: 'shoes', name: 'Calzado', icon: '👟', color: '#14b8a6', displayOrder: 8 },
  ];

  for (const cat of productCategories) {
    // Buscar si ya existe
    const existing = await prisma.category.findFirst({
      where: {
        companyId: null,
        key: cat.key,
        entityType: EntityType.PRODUCT,
      },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          ...cat,
          entityType: EntityType.PRODUCT,
          companyId: null,
        },
      });
    }
  }

  // Categorías para SERVICIOS
  const serviceCategories = [
    { key: 'reservation', name: 'Reservas', icon: '📅', color: '#10b981', displayOrder: 1 },
    { key: 'delivery', name: 'Domicilio', icon: '🛵', color: '#3b82f6', displayOrder: 2 },
    { key: 'consultation', name: 'Consultas', icon: '🩺', color: '#06b6d4', displayOrder: 3 },
    { key: 'treatment', name: 'Tratamientos', icon: '💉', color: '#8b5cf6', displayOrder: 4 },
    { key: 'accommodation', name: 'Alojamiento', icon: '🏠', color: '#f59e0b', displayOrder: 5 },
    { key: 'rental', name: 'Alquiler', icon: '🔑', color: '#ef4444', displayOrder: 6 },
  ];

  for (const cat of serviceCategories) {
    const existing = await prisma.category.findFirst({
      where: {
        companyId: null,
        key: cat.key,
        entityType: EntityType.SERVICE,
      },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          ...cat,
          entityType: EntityType.SERVICE,
          companyId: null,
        },
      });
    }
  }

  // Categorías para RECURSOS
  const resourceCategories = [
    { key: 'mesa', name: 'Mesas', icon: '🪑', color: '#10b981', displayOrder: 1 },
    { key: 'consultorio', name: 'Consultorios', icon: '🏥', color: '#06b6d4', displayOrder: 2 },
    { key: 'sala', name: 'Salas', icon: '🏢', color: '#8b5cf6', displayOrder: 3 },
    { key: 'habitacion', name: 'Habitaciones', icon: '🛏️', color: '#f59e0b', displayOrder: 4 },
    { key: 'vehiculo', name: 'Vehículos', icon: '🚗', color: '#ef4444', displayOrder: 5 },
    { key: 'equipo', name: 'Equipos', icon: '⚙️', color: '#14b8a6', displayOrder: 6 },
  ];

  for (const cat of resourceCategories) {
    const existing = await prisma.category.findFirst({
      where: {
        companyId: null,
        key: cat.key,
        entityType: EntityType.RESOURCE,
      },
    });

    if (!existing) {
      await prisma.category.create({
        data: {
          ...cat,
          entityType: EntityType.RESOURCE,
          companyId: null,
        },
      });
    }
  }

  console.log(`✅ Categorías globales creadas`);
}

/**
 * Categorías específicas por empresa (opcional)
 */
export async function seedCompanyCategories(prisma: PrismaClient, companyId: string, companyType: string) {
  console.log(`🏷️  Creando categorías para empresa ${companyType}...`);

  // Aquí puedes agregar categorías específicas por tipo de empresa
  // Por ahora, usaremos las globales

  console.log(`✅ Categorías de empresa configuradas`);
}
