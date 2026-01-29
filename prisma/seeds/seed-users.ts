import { PrismaClient } from '@prisma/client';

export async function seedTestUsers(prisma: PrismaClient) {
  console.log('\n👥 Creando usuarios de prueba...');

  const user1 = await prisma.user.create({
    data: {
      phone: '612345678',
      name: 'Juan Pérez',
      email: 'juan@example.com',
    },
  });

  const user2 = await prisma.user.create({
    data: {
      phone: '698765432',
      name: 'María García',
      email: 'maria@example.com',
    },
  });

  const user3 = await prisma.user.create({
    data: {
      phone: '611223344',
      name: 'Carlos López',
      email: 'carlos@example.com',
    },
  });

  const user4 = await prisma.user.create({
    data: {
      phone: '655443322',
      name: 'Ana Martínez',
      email: 'ana@example.com',
    },
  });

  const user5 = await prisma.user.create({
    data: {
      phone: '677889900',
      name: 'Pedro Rodríguez',
      email: 'pedro@example.com',
    },
  });

  console.log(`✅ 5 usuarios de prueba creados`);
  
  return [user1, user2, user3, user4, user5];
}
