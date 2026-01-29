import { PrismaClient } from '@prisma/client';

export async function seedRestaurantResources(prisma: PrismaClient, companyId: string) {
  console.log('\n🪑 Creando recursos (mesas) del restaurante en BD...');
  
  const resources = [
    // Mesas para 2
    { name: 'Mesa 1 - Para 2', capacity: 2, type: 'mesa', metadata: { location: 'ventana', floor: 1 } },
    { name: 'Mesa 2 - Para 2', capacity: 2, type: 'mesa', metadata: { location: 'interior', floor: 1 } },
    { name: 'Mesa 3 - Para 2', capacity: 2, type: 'mesa', metadata: { location: 'terraza', floor: 1 } },
    
    // Mesas para 4
    { name: 'Mesa 4 - Para 4', capacity: 4, type: 'mesa', metadata: { location: 'ventana', floor: 1 } },
    { name: 'Mesa 5 - Para 4', capacity: 4, type: 'mesa', metadata: { location: 'interior', floor: 1 } },
    { name: 'Mesa 6 - Para 4', capacity: 4, type: 'mesa', metadata: { location: 'interior', floor: 1 } },
    { name: 'Mesa 7 - Para 4', capacity: 4, type: 'mesa', metadata: { location: 'terraza', floor: 1 } },
    
    // Mesas para 6
    { name: 'Mesa 8 - Para 6', capacity: 6, type: 'mesa', metadata: { location: 'interior', floor: 2 } },
    { name: 'Mesa 9 - Para 6', capacity: 6, type: 'mesa', metadata: { location: 'privado', floor: 2 } },
    
    // Mesa para 8
    { name: 'Mesa 10 - Para 8', capacity: 8, type: 'mesa', metadata: { location: 'salon privado', floor: 2 } },
  ];

  const createdResources = [];
  for (const resource of resources) {
    const created = await prisma.resource.create({
      data: {
        companyId,
        ...resource,
        available: true,
        active: true,
      },
    });
    createdResources.push(created);
  }
  
  console.log(`✅ ${createdResources.length} recursos (mesas) del restaurante creados en BD`);
  return createdResources;
}
