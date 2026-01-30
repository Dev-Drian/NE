import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Seed de productos adicionales para el Chalet/Finca
 * Servicios adicionales que se pueden agregar al alquiler
 */
export async function seedChaletProducts(prisma: PrismaClient, companyId: string) {
  console.log('🏡 Creando productos del chalet...');

  const products: Prisma.ProductCreateInput[] = [
    // === SERVICIOS ADICIONALES ===
    {
      company: { connect: { id: companyId } },
      name: 'Chef Privado',
      description: 'Chef profesional para preparar tus comidas durante la estadía (precio por día)',
      category: 'servicio_adicional',
      price: 250000,
      available: true,
      hasStock: false,
      keywords: ['chef', 'cocinero', 'cocina', 'comida', 'preparar'],
      metadata: { unit: 'día' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Servicio de Aseo Extra',
      description: 'Limpieza adicional durante tu estadía',
      category: 'servicio_adicional',
      price: 80000,
      available: true,
      hasStock: false,
      keywords: ['aseo', 'limpieza', 'limpiar', 'ordenar'],
      metadata: { unit: 'servicio' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Transporte Aeropuerto',
      description: 'Recogida o llevada al aeropuerto (camioneta hasta 6 personas)',
      category: 'transporte',
      price: 150000,
      available: true,
      hasStock: false,
      keywords: ['transporte', 'aeropuerto', 'recogida', 'llevar', 'traslado'],
      metadata: { unit: 'trayecto' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Tour Guiado Local',
      description: 'Tour por los alrededores con guía local (4 horas)',
      category: 'servicio_adicional',
      price: 180000,
      available: true,
      hasStock: false,
      keywords: ['tour', 'paseo', 'guia', 'excursion', 'conocer'],
      metadata: { unit: 'tour' },
    },

    // === CATERING ===
    {
      company: { connect: { id: companyId } },
      name: 'Desayuno Completo',
      description: 'Desayuno tipo buffet para los huéspedes (precio por persona)',
      category: 'catering',
      price: 25000,
      available: true,
      hasStock: false,
      keywords: ['desayuno', 'mañana', 'comer'],
      metadata: { unit: 'persona' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Almuerzo/Cena BBQ',
      description: 'Parrillada completa con carnes, ensaladas y bebidas (precio por persona)',
      category: 'catering',
      price: 45000,
      available: true,
      hasStock: false,
      keywords: ['bbq', 'parrilla', 'carne', 'asado', 'almuerzo', 'cena'],
      metadata: { unit: 'persona' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Paquete Snacks y Bebidas',
      description: 'Paquete de snacks, gaseosas, jugos y cervezas para el grupo',
      category: 'catering',
      price: 120000,
      available: true,
      hasStock: false,
      keywords: ['snacks', 'bebidas', 'cerveza', 'gaseosa', 'jugo', 'pasabocas'],
      metadata: { unit: 'paquete' },
    },

    // === DECORACIÓN ===
    {
      company: { connect: { id: companyId } },
      name: 'Decoración Cumpleaños',
      description: 'Decoración temática para cumpleaños (globos, guirnaldas, mesa dulce)',
      category: 'decoracion',
      price: 180000,
      available: true,
      hasStock: false,
      keywords: ['decoracion', 'cumpleaños', 'globos', 'fiesta'],
      metadata: { unit: 'paquete' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Decoración Romántica',
      description: 'Decoración romántica: pétalos, velas, cena especial',
      category: 'decoracion',
      price: 220000,
      available: true,
      hasStock: false,
      keywords: ['romantico', 'aniversario', 'pareja', 'velas', 'petalos'],
      metadata: { unit: 'paquete' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Decoración Matrimonio/Evento',
      description: 'Decoración completa para eventos grandes',
      category: 'decoracion',
      price: 800000,
      available: true,
      hasStock: false,
      keywords: ['boda', 'matrimonio', 'evento', 'decoracion grande'],
      metadata: { unit: 'evento' },
    },

    // === ENTRETENIMIENTO ===
    {
      company: { connect: { id: companyId } },
      name: 'DJ / Sonido',
      description: 'DJ profesional con equipo de sonido (4 horas)',
      category: 'entretenimiento',
      price: 350000,
      available: true,
      hasStock: false,
      keywords: ['dj', 'musica', 'sonido', 'fiesta', 'bailar'],
      metadata: { unit: 'evento' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Karaoke',
      description: 'Equipo de karaoke con pantalla y micrófono',
      category: 'entretenimiento',
      price: 100000,
      available: true,
      hasStock: false,
      keywords: ['karaoke', 'cantar', 'musica', 'microfono'],
      metadata: { unit: 'día' },
    },
    {
      company: { connect: { id: companyId } },
      name: 'Inflables para Niños',
      description: 'Castillo inflable y juegos para niños',
      category: 'entretenimiento',
      price: 200000,
      available: true,
      hasStock: false,
      keywords: ['inflables', 'niños', 'juegos', 'saltarin', 'castillo'],
      metadata: { unit: 'día' },
    },
  ];

  for (const productData of products) {
    await prisma.product.create({ data: productData });
    console.log(`   ✅ Producto: ${productData.name}`);
  }

  console.log(`✅ ${products.length} productos del chalet creados`);
}

/**
 * Seed de recursos para el Chalet/Finca
 * Fincas/cabañas disponibles para alquilar
 */
export async function seedChaletResources(prisma: PrismaClient, companyId: string) {
  console.log('🏡 Creando recursos del chalet...');

  const resources = [
    {
      companyId,
      name: 'Finca La Esperanza',
      type: 'finca',
      capacity: 15,
      metadata: {
        description: 'Finca principal con piscina grande, jacuzzi, BBQ y 5 habitaciones',
        habitaciones: 5,
        baños: 4,
        piscina: true,
        jacuzzi: true,
        bbq: true,
        wifi: true,
        aire_acondicionado: true,
        cocina_equipada: true,
        parqueadero: 6,
        area_m2: 800,
        zona_verde: true,
        cancha: 'futbol',
        permiteMascotas: true,
        vista: 'montaña',
      },
      active: true,
    },
    {
      companyId,
      name: 'Cabaña del Bosque',
      type: 'cabaña',
      capacity: 6,
      metadata: {
        description: 'Cabaña acogedora para parejas o familias pequeñas',
        habitaciones: 2,
        baños: 2,
        piscina: true,
        jacuzzi: false,
        bbq: true,
        wifi: true,
        chimenea: true,
        cocina_equipada: true,
        parqueadero: 2,
        area_m2: 180,
        permiteMascotas: false,
        vista: 'bosque',
      },
      active: true,
    },
    {
      companyId,
      name: 'Villa Premium',
      type: 'villa',
      capacity: 20,
      metadata: {
        description: 'Villa de lujo con piscina privada, sala de cine y spa',
        habitaciones: 6,
        baños: 6,
        piscina: true,
        jacuzzi: true,
        bbq: true,
        wifi: true,
        aire_acondicionado: true,
        cocina_equipada: true,
        sala_cine: true,
        spa_privado: true,
        gimnasio: true,
        parqueadero: 8,
        area_m2: 1200,
        zona_verde: true,
        cancha: 'tenis',
        permiteMascotas: true,
        servicio_incluido: true,
        vista: 'lago',
      },
      active: true,
    },
  ];

  for (const resource of resources) {
    await prisma.resource.create({ data: resource });
    console.log(`   ✅ Recurso: ${resource.name} (cap: ${resource.capacity})`);
  }

  console.log(`✅ ${resources.length} recursos del chalet creados`);
}
