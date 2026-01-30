import { PrismaClient } from '@prisma/client';

/**
 * Seed de servicios para el restaurante
 * Servicios: mesa, domicilio, para recoger
 */
export async function seedRestaurantServices(prisma: PrismaClient, companyId: string) {
  console.log('🍽️ Creando servicios del restaurante...');

  const services = [
    {
      companyId,
      key: 'mesa',
      name: 'Reserva de Mesa',
      description: 'Reserva una mesa en nuestro restaurante para disfrutar de nuestra carta',
      requiredFields: ['fecha', 'hora', 'personas'],
      optionalFields: ['notas', 'ocasion', 'preferencia_mesa'],
      allowedProductCategories: ['food', 'drink', 'dessert', 'appetizer', 'main', 'entrada', 'principal', 'postre', 'bebida'],
      config: {
        minGuests: 1,
        maxGuests: 20,
        advanceBookingDays: 30,
        requiresDeposit: true,
        depositPercentage: 50,
        defaultDuration: 120, // minutos
        timeSlots: ['12:00', '12:30', '13:00', '13:30', '14:00', '19:00', '19:30', '20:00', '20:30', '21:00'],
        allowsPreOrder: true, // Puede pedir productos al reservar
        requiresProducts: false,
      },
      keywords: ['mesa', 'reserva', 'reservar', 'cena', 'almuerzo', 'comida', 'cenar', 'comer', 'sentarme', 'lugar', 'restaurante'],
      basePrice: null, // No tiene precio base, solo los productos
      displayOrder: 1,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'domicilio',
      name: 'Domicilio',
      description: 'Pedido a domicilio - Te llevamos la comida a tu casa',
      requiredFields: ['direccion', 'telefono', 'productos'],
      optionalFields: ['notas', 'metodo_pago', 'hora_entrega'],
      allowedProductCategories: ['food', 'drink', 'dessert', 'appetizer', 'main', 'entrada', 'principal', 'postre', 'bebida'],
      config: {
        minOrderAmount: 25000,
        deliveryFee: 5000,
        freeDeliveryThreshold: 80000,
        estimatedDeliveryTime: 45, // minutos
        deliveryRadius: 10, // km
        paymentMethods: ['efectivo', 'tarjeta', 'nequi', 'daviplata'],
        requiresProducts: true, // Obligatorio seleccionar productos
        requiresAddress: true,
      },
      keywords: ['domicilio', 'delivery', 'envio', 'llevar', 'casa', 'enviar', 'pedir', 'traer', 'mandar', 'envíen', 'envíeme'],
      basePrice: null,
      displayOrder: 2,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'recoger',
      name: 'Para Recoger',
      description: 'Pedido para recoger en el restaurante',
      requiredFields: ['hora_recogida', 'telefono', 'productos'],
      optionalFields: ['notas', 'nombre'],
      allowedProductCategories: ['food', 'drink', 'dessert', 'appetizer', 'main', 'entrada', 'principal', 'postre', 'bebida'],
      config: {
        minOrderAmount: 15000,
        preparationTime: 30, // minutos
        requiresProducts: true,
      },
      keywords: ['recoger', 'pickup', 'para llevar', 'buscar', 'pasar', 'paso'],
      basePrice: null,
      displayOrder: 3,
      active: true,
      available: true,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { companyId_key: { companyId, key: service.key } },
      update: service,
      create: service,
    });
    console.log(`   ✅ Servicio: ${service.name} (${service.key})`);
  }

  console.log(`✅ ${services.length} servicios del restaurante creados`);
}

/**
 * Seed de servicios para la clínica dental
 */
export async function seedClinicServices(prisma: PrismaClient, companyId: string) {
  console.log('🏥 Creando servicios de la clínica...');

  const services = [
    {
      companyId,
      key: 'limpieza_dental',
      name: 'Limpieza Dental',
      description: 'Limpieza dental profesional con ultrasonido',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['notas', 'primera_vez'],
      allowedProductCategories: [], // No tiene productos asociados
      config: {
        duration: 45, // minutos
        requiresDeposit: true,
        depositPercentage: 100,
        advanceBookingDays: 60,
        requiresMedicalHistory: true,
        requiresProducts: false,
      },
      keywords: ['limpieza', 'limpieza dental', 'profilaxis', 'limpiar dientes', 'higiene'],
      basePrice: 80000,
      displayOrder: 1,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'consulta_general',
      name: 'Consulta General',
      description: 'Consulta dental general, diagnóstico y plan de tratamiento',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['sintomas', 'notas', 'urgente'],
      allowedProductCategories: [],
      config: {
        duration: 30,
        requiresDeposit: false,
        advanceBookingDays: 30,
        allowsUrgent: true,
        requiresProducts: false,
      },
      keywords: ['consulta', 'cita', 'revision', 'chequeo', 'dolor', 'muela', 'diente', 'ver', 'revisar'],
      basePrice: 50000,
      displayOrder: 2,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'blanqueamiento',
      name: 'Blanqueamiento Dental',
      description: 'Blanqueamiento dental profesional con láser',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['notas', 'tipo_blanqueamiento'],
      allowedProductCategories: [],
      config: {
        duration: 90,
        requiresDeposit: true,
        depositPercentage: 50,
        advanceBookingDays: 14,
        requiresPreviousConsultation: true,
        requiresProducts: false,
      },
      keywords: ['blanqueamiento', 'blanquear', 'dientes blancos', 'aclarar', 'blanco'],
      basePrice: 350000,
      displayOrder: 3,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'ortodoncia',
      name: 'Consulta de Ortodoncia',
      description: 'Evaluación para tratamiento de ortodoncia (brackets o invisalign)',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['tipo_tratamiento', 'notas'],
      allowedProductCategories: [],
      config: {
        duration: 60,
        requiresDeposit: true,
        depositPercentage: 100,
        advanceBookingDays: 21,
        includesXray: true,
        requiresProducts: false,
      },
      keywords: ['ortodoncia', 'brackets', 'frenillos', 'alinear dientes', 'invisalign', 'dientes chuecos'],
      basePrice: 120000,
      displayOrder: 4,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'extraccion',
      name: 'Extracción Dental',
      description: 'Extracción dental simple o de cordales',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['pieza_dental', 'notas', 'cordal'],
      allowedProductCategories: [],
      config: {
        duration: 45,
        requiresDeposit: true,
        depositPercentage: 50,
        advanceBookingDays: 7,
        requiresMedicalHistory: true,
        requiresPreviousConsultation: true,
        requiresProducts: false,
      },
      keywords: ['extraccion', 'extraer', 'sacar muela', 'cordal', 'muela del juicio', 'quitar muela'],
      basePrice: 150000,
      displayOrder: 5,
      active: true,
      available: true,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { companyId_key: { companyId, key: service.key } },
      update: service,
      create: service,
    });
    console.log(`   ✅ Servicio: ${service.name} (${service.key})`);
  }

  console.log(`✅ ${services.length} servicios de la clínica creados`);
}

/**
 * Seed de servicios para spa (ejemplo adicional para futuro)
 */
export async function seedSpaServices(prisma: PrismaClient, companyId: string) {
  console.log('🧖 Creando servicios del spa...');

  const services = [
    {
      companyId,
      key: 'masaje_relajante',
      name: 'Masaje Relajante',
      description: 'Masaje corporal completo de relajación (60 min)',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['terapeuta', 'notas'],
      allowedProductCategories: [],
      config: {
        duration: 60,
        requiresDeposit: true,
        depositPercentage: 30,
        advanceBookingDays: 14,
        requiresProducts: false,
      },
      keywords: ['masaje', 'relajante', 'relajacion', 'masaje completo', 'descansar'],
      basePrice: 120000,
      displayOrder: 1,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'facial',
      name: 'Tratamiento Facial',
      description: 'Limpieza facial profunda con hidratación',
      requiredFields: ['fecha', 'hora'],
      optionalFields: ['tipo_piel', 'notas'],
      allowedProductCategories: [],
      config: {
        duration: 45,
        requiresDeposit: true,
        depositPercentage: 30,
        advanceBookingDays: 7,
        requiresProducts: false,
      },
      keywords: ['facial', 'cara', 'limpieza facial', 'rostro', 'piel'],
      basePrice: 90000,
      displayOrder: 2,
      active: true,
      available: true,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { companyId_key: { companyId, key: service.key } },
      update: service,
      create: service,
    });
    console.log(`   ✅ Servicio: ${service.name} (${service.key})`);
  }

  console.log(`✅ ${services.length} servicios del spa creados`);
}
