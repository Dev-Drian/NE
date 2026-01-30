import { PrismaClient } from '@prisma/client';
import { seedRestaurantProducts } from './seeds/seed-products-restaurant';
import { seedRestaurantServices, seedClinicServices } from './seeds/seed-services';
import { seedRestaurantResources } from './seeds/seed-resources-restaurant';
import { seedClinicProducts, seedClinicResources } from './seeds/seed-clinic';
import { seedServiceKeywords } from './seeds/seed-keywords';
import { seedRestaurantIntentions, seedClinicIntentions } from './seeds/seed-intentions';
import { seedMessageTemplates } from './seeds/seed-templates';
import { seedTestUsers } from './seeds/seed-users';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpiar datos anteriores (en orden para evitar FK constraints)
  console.log('🗑️ Limpiando datos anteriores...');
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
  await prisma.service.deleteMany();  // ← NUEVO: Limpiar servicios
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
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
        // Ver: Service, Product, Resource, ServiceKeyword
      },
    },
  });
  console.log(`✅ Empresa creada: ${company.name} (${company.id})`);

  // ========== SERVICIOS, PRODUCTOS Y RECURSOS DEL RESTAURANTE ==========
  await seedRestaurantServices(prisma, company.id);  // ← NUEVO: Servicios en tabla dedicada
  await seedRestaurantProducts(prisma, company.id);
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
        // Ver: Service, Product, Resource, ServiceKeyword
      },
    },
  });
  console.log(`✅ Empresa creada: ${clinica.name} (${clinica.id})`);

  // ========== SERVICIOS, PRODUCTOS Y RECURSOS DE LA CLÍNICA ==========
  await seedClinicServices(prisma, clinica.id);  // ← NUEVO: Servicios en tabla dedicada
  await seedClinicProducts(prisma, clinica.id);
  await seedClinicResources(prisma, clinica.id);

  // ========== DATOS COMUNES ==========
  await seedMessageTemplates(prisma);
  await seedRestaurantIntentions(prisma, company.id);
  await seedClinicIntentions(prisma, clinica.id);
  const users = await seedTestUsers(prisma);
  await seedServiceKeywords(prisma, company.id);

  // ========== RESUMEN ==========
  console.log('\n' + '='.repeat(60));
  console.log('✨ Seed completado exitosamente!');
  console.log('='.repeat(60));
  
  console.log(`\n📋 IDs de empresas para pruebas:`);
  console.log(`   - Restaurante La Pasta: ${company.id}`);
  console.log(`   - Clínica Dental Sonrisas: ${clinica.id}`);
  
  console.log(`\n📋 IDs de usuarios para pruebas:`);
  users.forEach(user => {
    console.log(`   - ${user.name}: ${user.id} (${user.phone})`);
  });

  // Mostrar servicios creados
  const restaurantServices = await prisma.service.findMany({ 
    where: { companyId: company.id },
    orderBy: { displayOrder: 'asc' }
  });
  const clinicServices = await prisma.service.findMany({ 
    where: { companyId: clinica.id },
    orderBy: { displayOrder: 'asc' }
  });
  
  console.log(`\n🍽️ Servicios del Restaurante (${restaurantServices.length}):`);
  restaurantServices.forEach(s => {
    console.log(`   - ${s.key}: ${s.name} (campos: ${s.requiredFields.join(', ')})`);
  });
  
  console.log(`\n🏥 Servicios de la Clínica (${clinicServices.length}):`);
  clinicServices.forEach(s => {
    const price = s.basePrice ? ` - $${s.basePrice.toLocaleString()}` : '';
    console.log(`   - ${s.key}: ${s.name}${price}`);
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
