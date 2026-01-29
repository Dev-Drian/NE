import { PrismaClient } from '@prisma/client';
import { seedRestaurantProducts } from './seeds/seed-products-restaurant';
import { seedRestaurantServices } from './seeds/seed-restaurant-services';
import { seedRestaurantResources } from './seeds/seed-resources-restaurant';
import { seedClinicProducts, seedClinicResources } from './seeds/seed-clinic';
import { seedServiceKeywords } from './seeds/seed-keywords';
import { seedRestaurantIntentions, seedClinicIntentions } from './seeds/seed-intentions';
import { seedMessageTemplates } from './seeds/seed-templates';
import { seedTestUsers } from './seeds/seed-users';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpiar datos anteriores (opcional - solo para desarrollo)
  // IMPORTANTE: Eliminar en orden para evitar foreign key constraints
  await prisma.stockMovement.deleteMany();
  await prisma.reservationItem.deleteMany();
  await prisma.productPromotion.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.product.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.intentionExample.deleteMany();
  await prisma.intentionPattern.deleteMany();
  await prisma.intention.deleteMany();
  await prisma.serviceKeyword.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.messageTemplateConfig.deleteMany();

  // ========== CREAR EMPRESA: RESTAURANTE ==========
  const company = await prisma.company.create({
    data: {
      name: 'Restaurante La Pasta',
      type: 'restaurant',
      description: 'Restaurante italiano especializado en pasta y pizza',
      phone: '+34 912 345 678',
      active: true,
      requiresPayment: true,
      paymentPercentage: 50,
      wompiPublicKey: 'pub_test_AnjRyoWHPu9UW2X3AsXdz5tWyRAljVfU',
      wompiPrivateKey: 'prv_test_TC7QYes8DCVl9VgjYYcIXcpIZk91jsfi',
      wompiEventsSecret: 'test_events_FkA3jAe6sj8cMMu0mjrJCPxROKYOlT4k',
      wompiEnabled: true,
      config: {
        hours: {
          monday: '12:00-22:00',
          tuesday: '12:00-22:00',
          wednesday: '12:00-22:00',
          thursday: '12:00-22:00',
          friday: '12:00-23:00',
          saturday: '12:00-23:00',
          sunday: '12:00-22:00',
        },
        // NOTA: services, products y resources ahora están en tablas de BD
        // Ver: Product, Resource, ServiceKeyword
      },
    },
  });
  console.log(`✅ Empresa creada: ${company.name} (${company.id})`);

  // Migrar productos, servicios y recursos del restaurante
  await seedRestaurantProducts(prisma, company.id);
  await seedRestaurantServices(prisma, company.id); // Crea 'mesa' y 'domicilio' como productos tipo service
  await seedRestaurantResources(prisma, company.id);

  // ========== CREAR EMPRESA: CLÍNICA DENTAL ==========
  const clinica = await prisma.company.create({
    data: {
      name: 'Clínica Dental Sonrisas',
      type: 'clinic',
      description: 'Clínica dental especializada en ortodoncia y estética dental',
      phone: '+34 911 222 333',
      active: true,
      requiresPayment: true,
      paymentPercentage: 100,
      wompiPublicKey: 'pub_test_AnjRyoWHPu9UW2X3AsXdz5tWyRAljVfU',
      wompiPrivateKey: 'prv_test_TC7QYes8DCVl9VgjYYcIXcpIZk91jsfi',
      wompiEventsSecret: 'test_events_FkA3jAe6sj8cMMu0mjrJCPxROKYOlT4k',
      wompiEnabled: true,
      config: {
        hours: {
          monday: '09:00-19:00',
          tuesday: '09:00-19:00',
          wednesday: '09:00-19:00',
          thursday: '09:00-19:00',
          friday: '09:00-17:00',
          saturday: '10:00-14:00',
          sunday: 'cerrado',
        },
        // NOTA: services, products y resources ahora están en tablas de BD
        // Ver: Product, Resource, ServiceKeyword
      },
    },
  });
  console.log(`✅ Empresa creada: ${clinica.name} (${clinica.id})`);

  // Migrar productos y recursos de la clínica
  await seedClinicProducts(prisma, clinica.id);
  await seedClinicResources(prisma, clinica.id);

  // ========== DATOS COMUNES ==========
  await seedMessageTemplates(prisma);
  await seedRestaurantIntentions(prisma, company.id);
  await seedClinicIntentions(prisma, clinica.id);
  const users = await seedTestUsers(prisma);
  await seedServiceKeywords(prisma, company.id);

  // ========== RESUMEN ==========
  console.log('\n✨ Seed completado exitosamente!');
  console.log(`\n📋 IDs de empresas para pruebas:`);
  console.log(`   - Restaurante La Pasta (restaurant): ${company.id}`);
  console.log(`   - Clínica Dental Sonrisas (clinic): ${clinica.id}`);
  console.log(`\n📋 IDs de usuarios para pruebas:`);
  users.forEach(user => {
    console.log(`   - ${user.name}: ${user.id} (teléfono: ${user.phone})`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
