import { PrismaClient } from '@prisma/client';

export async function seedClinicProducts(prisma: PrismaClient, companyId: string) {
  console.log('\n🦷 Creando servicios/tratamientos de la clínica en BD...');
  
  // PRIMERO: Crear el servicio "cita" (category='service')
  const citaService = await prisma.product.create({
    data: {
      companyId,
      name: 'Cita en clínica',
      description: 'Agendar cita en consultorio odontológico',
      price: 0, // Sin costo adicional (el costo está en el tratamiento)
      category: 'service',
      hasStock: false,
      keywords: ['cita', 'agendar', 'consulta', 'turno'],
      stock: 0,
      available: true,
      active: true,
      metadata: {
        serviceKey: 'cita',
        enabled: true,
        requiresProducts: true,
        requiresPayment: true,
        requiresGuests: false,
        minAdvanceHours: 4,
        requiredFields: ['date', 'time', 'phone', 'products'],
      },
    },
  });
  console.log(`✅ Servicio "cita" creado`);
  
  // SEGUNDO: Crear los productos/tratamientos
  const products = [
    { 
      name: 'Limpieza dental', 
      price: 80000, 
      duration: 30, 
      category: 'preventivo',
      description: `✨ **Limpieza Dental Profesional**

📋 **¿Qué incluye?**
• Eliminación de placa bacteriana y sarro
• Pulido dental con pasta especial
• Aplicación de flúor para fortalecer el esmalte
• Revisión del estado general de tus dientes y encías

⏱️ **Duración:** 30 minutos
💰 **Precio:** $80.000 COP

✅ **Beneficios:**
• Previene caries y enfermedades de las encías
• Elimina manchas superficiales
• Dientes más blancos y brillantes
• Aliento fresco

📌 **Recomendación:** Cada 6 meses`,
      hasStock: false,
      keywords: ['limpieza', 'dental', 'higiene', 'profilaxis', 'dientes'],
    },
    { 
      name: 'Consulta general', 
      price: 50000, 
      duration: 20, 
      category: 'consulta',
      description: `🔍 **Consulta Odontológica General**

📋 **¿Qué incluye?**
• Revisión completa de dientes y encías
• Diagnóstico de problemas dentales
• Radiografías digitales (si necesario)
• Plan de tratamiento personalizado
• Asesoría de higiene oral

⏱️ **Duración:** 20 minutos
💰 **Precio:** $50.000 COP`,
      hasStock: false,
      keywords: ['consulta', 'revision', 'general', 'odontologica', 'chequeo'],
    },
    { 
      name: 'Revisión ortodoncia', 
      price: 150000, 
      duration: 45, 
      category: 'ortodoncia',
      description: 'Control y ajuste de brackets',
      hasStock: false,
      keywords: ['ortodoncia', 'brackets', 'revision', 'control', 'ajuste'],
    },
    { 
      name: 'Blanqueamiento dental', 
      price: 200000, 
      duration: 60, 
      category: 'estetica',
      description: 'Blanqueamiento dental profesional',
      hasStock: false,
      keywords: ['blanqueamiento', 'estetica', 'dientes blancos', 'whitening'],
    },
    { 
      name: 'Extracción simple', 
      price: 120000, 
      duration: 30, 
      category: 'cirugia',
      description: 'Extracción de pieza dental simple',
      hasStock: false,
      keywords: ['extraccion', 'sacar muela', 'cirugia', 'diente'],
    },
    { 
      name: 'Empaste (resina)', 
      price: 90000, 
      duration: 40, 
      category: 'restauracion',
      description: 'Empaste dental con resina',
      hasStock: false,
      keywords: ['empaste', 'resina', 'caries', 'restauracion', 'calza'],
    },
    { 
      name: 'Endodoncia', 
      price: 350000, 
      duration: 90, 
      category: 'endodoncia',
      description: 'Tratamiento de conducto',
      hasStock: false,
      keywords: ['endodoncia', 'conducto', 'nervio', 'matar nervio'],
    },
    { 
      name: 'Corona dental', 
      price: 450000, 
      duration: 60, 
      category: 'restauracion',
      description: 'Corona dental de porcelana',
      hasStock: false,
      keywords: ['corona', 'porcelana', 'protesis', 'funda'],
    },
    { 
      name: 'Implante dental', 
      price: 1200000, 
      duration: 120, 
      category: 'cirugia',
      description: 'Implante dental completo',
      hasStock: false,
      keywords: ['implante', 'cirugia', 'diente nuevo', 'tornillo'],
    },
  ];

  const createdProducts = [];
  for (const product of products) {
    const created = await prisma.product.create({
      data: {
        companyId,
        ...product,
        stock: 0, // Los servicios no tienen stock
        available: true,
        active: true,
        // Los tratamientos NO necesitan metadata de servicio
        // Ese metadata es solo para productos con category='service'
      },
    });
    createdProducts.push(created);
  }
  
  console.log(`✅ ${createdProducts.length} tratamientos de la clínica creados en BD`);
  return [citaService, ...createdProducts];
}

export async function seedClinicResources(prisma: PrismaClient, companyId: string) {
  console.log('\n🏥 Creando recursos (consultorios) de la clínica en BD...');
  
  const resources = [
    { name: 'Consultorio 1', capacity: 1, type: 'consultorio', metadata: { equipment: ['silla dental', 'lampara'], floor: 1 } },
    { name: 'Consultorio 2', capacity: 1, type: 'consultorio', metadata: { equipment: ['silla dental', 'lampara'], floor: 1 } },
    { name: 'Consultorio 3', capacity: 1, type: 'consultorio', metadata: { equipment: ['silla dental', 'lampara', 'rayos x'], floor: 1 } },
    { name: 'Sala Ortodoncia', capacity: 1, type: 'sala-especializada', metadata: { equipment: ['silla dental', 'herramientas ortodoncia'], floor: 2 } },
    { name: 'Sala Blanqueamiento', capacity: 1, type: 'sala-especializada', metadata: { equipment: ['silla dental', 'lampara blanqueamiento'], floor: 2 } },
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
  
  console.log(`✅ ${createdResources.length} recursos de la clínica creados en BD`);
  return createdResources;
}
