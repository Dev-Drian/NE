import { PrismaClient } from '@prisma/client';

/**
 * Crea los "servicios" del restaurante (mesa, domicilio) como productos tipo 'service'
 * Estos NO son productos físicos, son tipos de servicio que ofrece el restaurante
 */
export async function seedRestaurantServices(prisma: PrismaClient, companyId: string) {
  console.log('\n🍽️  Creando servicios del restaurante (mesa, domicilio) en BD...');
  
  const services = [
    {
      name: 'Mesa en restaurante',
      description: 'Reserva de mesa en el restaurante',
      price: 0, // Sin costo adicional
      category: 'service',
      hasStock: false,
      keywords: ['mesa', 'reserva', 'comer', 'restaurante'],
      metadata: {
        serviceKey: 'mesa',
        enabled: true,
        requiresPayment: false,
        requiresProducts: false,
        requiresGuests: true,
        minAdvanceHours: 2,
        requiredFields: ['date', 'time', 'phone', 'guests'],
      },
    },
    {
      name: 'Servicio a domicilio',
      description: 'Pedido a domicilio',
      price: 5000, // Costo de envío
      category: 'service',
      hasStock: false,
      keywords: ['domicilio', 'delivery', 'envio', 'llevar', 'a casa'],
      metadata: {
        serviceKey: 'domicilio',
        enabled: true,
        requiresPayment: true,
        requiresProducts: true,
        requiresAddress: true,
        deliveryFee: 5000,
        minOrderAmount: 20000,
        minAdvanceMinutes: 45,
        requiredFields: ['date', 'time', 'phone', 'products', 'address'],
      },
    },
  ];

  const createdServices = [];
  for (const service of services) {
    const created = await prisma.product.create({
      data: {
        companyId,
        ...service,
        stock: 0,
        available: true,
        active: true,
      },
    });
    createdServices.push(created);
  }
  
  console.log(`✅ ${createdServices.length} servicios del restaurante creados en BD`);
  return createdServices;
}
