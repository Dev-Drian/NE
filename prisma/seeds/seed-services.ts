import { PrismaClient } from '@prisma/client';

/**
 * CAMPOS ESTÁNDAR EN INGLÉS (consistente con código interno y Prisma):
 * - date: Fecha de la reserva/cita
 * - time: Hora de la reserva/cita  
 * - guests: Número de personas/comensales
 * - phone: Teléfono de contacto
 * - name: Nombre del cliente
 * - email: Correo electrónico
 * - address: Dirección de entrega/ubicación
 * - products: Productos a ordenar
 * - tableId: Mesa específica
 * - notes: Notas o comentarios adicionales
 * - service: Tipo de servicio específico
 * 
 * NOTA: OpenAI puede devolver campos en español, el sistema los normaliza a inglés
 */

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
      requiredFields: ['date', 'time', 'guests'],
      optionalFields: ['notes', 'occasion', 'tablePreference'],
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
      requiredFields: ['address', 'phone', 'products'],
      optionalFields: ['notes', 'paymentMethod', 'deliveryTime'],
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
      requiredFields: ['time', 'phone', 'products'],
      optionalFields: ['notes', 'name'],
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
 * Los servicios con basePrice y requiresPayment=true pedirán anticipo automáticamente
 */
export async function seedClinicServices(prisma: PrismaClient, companyId: string) {
  console.log('🏥 Creando servicios de la clínica...');

  const services = [
    {
      companyId,
      key: 'limpieza_dental',
      name: 'Limpieza Dental',
      description: 'Limpieza dental profesional con ultrasonido',
      requiredFields: ['date', 'time'],
      optionalFields: ['notes', 'first_time'],
      allowedProductCategories: [], // No tiene productos asociados
      config: {
        duration: 45, // minutos
        requiresDeposit: true,
        depositPercentage: 100, // Pago completo por adelantado
        advanceBookingDays: 60,
        requiresMedicalHistory: true,
        requiresProducts: false,
        requiresPayment: true, // ⚠️ Requiere pago - se calcula automáticamente con basePrice
        isAppointmentBased: true,
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
      requiredFields: ['date', 'time'],
      optionalFields: ['symptoms', 'notes', 'urgent'],
      allowedProductCategories: [],
      config: {
        duration: 30,
        requiresDeposit: false,
        advanceBookingDays: 30,
        allowsUrgent: true,
        requiresProducts: false,
        requiresPayment: false, // Consulta inicial sin anticipo
        isAppointmentBased: true,
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
      requiredFields: ['date', 'time'],
      optionalFields: ['notes', 'whitening_type'],
      allowedProductCategories: [],
      config: {
        duration: 90,
        requiresDeposit: true,
        depositPercentage: 50, // Solo 50% de anticipo
        advanceBookingDays: 14,
        requiresPreviousConsultation: true,
        requiresProducts: false,
        requiresPayment: true, // ⚠️ Requiere pago - 50% del basePrice
        isAppointmentBased: true,
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
      requiredFields: ['date', 'time'],
      optionalFields: ['treatment_type', 'notes'],
      allowedProductCategories: [],
      config: {
        duration: 60,
        requiresDeposit: true,
        depositPercentage: 100,
        advanceBookingDays: 21,
        includesXray: true,
        requiresProducts: false,
        requiresPayment: true, // ⚠️ Requiere pago completo
        isAppointmentBased: true,
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
      requiredFields: ['date', 'time'],
      optionalFields: ['tooth', 'notes', 'wisdom_tooth'],
      allowedProductCategories: [],
      config: {
        duration: 45,
        requiresDeposit: true,
        depositPercentage: 50, // Solo 50% de anticipo
        advanceBookingDays: 7,
        requiresMedicalHistory: true,
        requiresPreviousConsultation: true,
        requiresProducts: false,
        requiresPayment: true, // ⚠️ Requiere pago - 50% del basePrice
        isAppointmentBased: true,
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
      requiredFields: ['date', 'time'],
      optionalFields: ['therapist', 'notes'],
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
      requiredFields: ['date', 'time'],
      optionalFields: ['skin_type', 'notes'],
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

/**
 * Seed de servicios para Chalet/Finca Vacacional
 * Alquiler de fincas con piscina, jacuzzi, BBQ para vacaciones
 */
export async function seedChaletServices(prisma: PrismaClient, companyId: string) {
  console.log('🏡 Creando servicios del chalet/finca...');

  const services = [
    {
      companyId,
      key: 'alquiler_dia',
      name: 'Alquiler por Día',
      description: 'Alquiler de la finca completa por un día (pasadía) - Incluye piscina, BBQ y zonas comunes',
      requiredFields: ['date', 'guests', 'phone'],
      optionalFields: ['arrival_time', 'departure_time', 'notes', 'additional_services'],
      allowedProductCategories: ['servicio_adicional', 'catering', 'decoracion'],
      config: {
        minGuests: 1,
        maxGuests: 30,
        advanceBookingDays: 60,
        requiresDeposit: true,
        depositPercentage: 50,
        checkIn: '08:00',
        checkOut: '18:00',
        includesPool: true,
        includesBBQ: true,
        includesParking: true,
        maxVehicles: 5,
        requiresProducts: false,
        allowsPreOrder: true,
      },
      keywords: ['pasadia', 'dia', 'alquilar', 'finca', 'piscina', 'bbq', 'parrilla', 'evento', 'paseo', 'un dia'],
      basePrice: 350000,
      displayOrder: 1,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'alquiler_finde',
      name: 'Alquiler Fin de Semana',
      description: 'Alquiler viernes a domingo - 2 noches con todas las amenidades',
      requiredFields: ['date', 'guests', 'phone'],
      optionalFields: ['arrival_time', 'notes', 'additional_services', 'pets'],
      allowedProductCategories: ['servicio_adicional', 'catering', 'decoracion', 'transporte'],
      config: {
        minGuests: 1,
        maxGuests: 15,
        advanceBookingDays: 90,
        requiresDeposit: true,
        depositPercentage: 30,
        checkIn: '15:00',
        checkOut: '12:00',
        minNights: 2,
        includesPool: true,
        includesJacuzzi: true,
        includesBBQ: true,
        includesWifi: true,
        includesParking: true,
        allowsPets: true,
        petFee: 50000,
        requiresProducts: false,
        allowsPreOrder: true,
      },
      keywords: ['fin de semana', 'finde', 'weekend', 'viernes', 'sabado', 'domingo', 'dos noches', 'escapada', 'descanso'],
      basePrice: 800000,
      displayOrder: 2,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'alquiler_semana',
      name: 'Alquiler Semanal',
      description: 'Alquiler por 7 noches - Ideal para vacaciones familiares',
      requiredFields: ['date', 'guests', 'phone'],
      optionalFields: ['arrival_time', 'notes', 'additional_services', 'pets'],
      allowedProductCategories: ['servicio_adicional', 'catering', 'decoracion', 'transporte'],
      config: {
        minGuests: 1,
        maxGuests: 15,
        advanceBookingDays: 120,
        requiresDeposit: true,
        depositPercentage: 30,
        checkIn: '15:00',
        checkOut: '12:00',
        minNights: 7,
        discountPercentage: 15, // Descuento por semana
        includesPool: true,
        includesJacuzzi: true,
        includesBBQ: true,
        includesWifi: true,
        includesParking: true,
        allowsPets: true,
        petFee: 100000,
        includedCleanings: 2, // Aseos incluidos
        requiresProducts: false,
        allowsPreOrder: true,
      },
      keywords: ['semana', 'semanal', 'vacaciones', 'siete dias', '7 dias', 'una semana'],
      basePrice: 2500000,
      displayOrder: 3,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'evento_especial',
      name: 'Evento Especial',
      description: 'Alquiler para eventos: cumpleaños, matrimonios, reuniones corporativas',
      requiredFields: ['date', 'guests', 'phone', 'event_type'],
      optionalFields: ['start_time', 'end_time', 'decoration', 'catering', 'music', 'notes'],
      allowedProductCategories: ['servicio_adicional', 'catering', 'decoracion', 'entretenimiento'],
      config: {
        minGuests: 10,
        maxGuests: 50,
        advanceBookingDays: 90,
        requiresDeposit: true,
        depositPercentage: 50,
        requiresContract: true,
        eventTypes: ['cumpleaños', 'matrimonio', 'quince_años', 'bautizo', 'corporativo', 'reunion_familiar'],
        includesSetup: true,
        includesCleanup: true,
        includesParking: true,
        maxVehicles: 15,
        noisePolicy: '22:00', // Hora límite para música alta
        requiresProducts: false,
        allowsPreOrder: true,
      },
      keywords: ['evento', 'fiesta', 'cumpleaños', 'matrimonio', 'boda', 'quince', 'quince años', 'bautizo', 'reunion', 'celebracion', 'celebrar'],
      basePrice: 1200000,
      displayOrder: 4,
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

  console.log(`✅ ${services.length} servicios del chalet creados`);
}

/**
 * Seed de servicios para Tienda de Ropa
 * Tienda de moda con servicios de personal shopping, apartado y alteraciones
 */
export async function seedClothingStoreServices(prisma: PrismaClient, companyId: string) {
  console.log('👗 Creando servicios de la tienda de ropa...');

  const services = [
    {
      companyId,
      key: 'compra_tienda',
      name: 'Compra en Tienda',
      description: 'Visita nuestra tienda física para ver y probarte la ropa',
      requiredFields: [],
      optionalFields: ['visit_date', 'visit_time', 'advisory'],
      allowedProductCategories: ['camisas', 'pantalones', 'vestidos', 'faldas', 'blusas', 'chaquetas', 'accesorios', 'zapatos', 'ropa_interior'],
      config: {
        hasOnlineStore: true,
        allowsReservation: true,
        reservationHoldHours: 48,
        tryOnAvailable: true,
        requiresProducts: false,
      },
      keywords: ['tienda', 'visitar', 'ir', 'probar', 'ver', 'fisica'],
      basePrice: null,
      displayOrder: 1,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'compra_online',
      name: 'Compra Online / Domicilio',
      description: 'Haz tu pedido y te lo enviamos a domicilio',
      requiredFields: ['address', 'phone', 'products'],
      optionalFields: ['payment_method', 'notes', 'size', 'gift'],
      allowedProductCategories: ['camisas', 'pantalones', 'vestidos', 'faldas', 'blusas', 'chaquetas', 'accesorios', 'zapatos', 'ropa_interior'],
      config: {
        minOrderAmount: 50000,
        deliveryFee: 10000,
        freeDeliveryThreshold: 200000,
        estimatedDeliveryDays: 3,
        paymentMethods: ['tarjeta', 'nequi', 'daviplata', 'pse', 'contraentrega'],
        allowsGiftWrap: true,
        giftWrapFee: 8000,
        hasReturnPolicy: true,
        returnDays: 15,
        requiresProducts: true,
      },
      keywords: ['domicilio', 'envio', 'pedir', 'comprar', 'online', 'delivery', 'llevar', 'casa', 'enviar'],
      basePrice: null,
      displayOrder: 2,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'apartado',
      name: 'Apartado de Prendas',
      description: 'Aparta tu prenda favorita con un pequeño adelanto',
      requiredFields: ['products', 'phone'],
      optionalFields: ['notes', 'hold_days'],
      allowedProductCategories: ['camisas', 'pantalones', 'vestidos', 'faldas', 'blusas', 'chaquetas', 'accesorios', 'zapatos'],
      config: {
        minDeposit: 30, // porcentaje
        maxHoldDays: 30,
        paymentSchedule: 'quincenal', // o 'semanal'
        refundPolicy: 'no_reembolsable',
        requiresProducts: true,
      },
      keywords: ['apartado', 'apartar', 'separar', 'reservar', 'guardar', 'abono', 'cuotas'],
      basePrice: null,
      displayOrder: 3,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'personal_shopping',
      name: 'Personal Shopping',
      description: 'Asesoría personalizada de moda con nuestros estilistas',
      requiredFields: ['date', 'time', 'phone'],
      optionalFields: ['budget', 'occasion', 'style', 'notes'],
      allowedProductCategories: ['camisas', 'pantalones', 'vestidos', 'faldas', 'blusas', 'chaquetas', 'accesorios', 'zapatos'],
      config: {
        duration: 60, // minutos
        advanceBookingDays: 14,
        requiresDeposit: true,
        depositPercentage: 100,
        includesOutfitSuggestion: true,
        maxOutfits: 5,
        requiresProducts: false,
      },
      keywords: ['asesoria', 'personal shopping', 'estilista', 'ayuda', 'consejo', 'que me queda', 'combinar', 'outfit'],
      basePrice: 80000,
      displayOrder: 4,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'alteraciones',
      name: 'Alteraciones / Arreglos',
      description: 'Servicio de ajustes y arreglos de prendas',
      requiredFields: ['alteration_type', 'phone'],
      optionalFields: ['delivery_date', 'notes', 'garment'],
      allowedProductCategories: [],
      config: {
        minDeliveryDays: 3,
        maxDeliveryDays: 7,
        requiresPhysicalItem: true,
        alterationTypes: ['dobladillo', 'ajuste_cintura', 'ajuste_largo', 'cambio_cierre', 'reparacion'],
        requiresProducts: false,
      },
      keywords: ['arreglo', 'alteracion', 'ajuste', 'modificar', 'achicar', 'alargar', 'dobladillo', 'cierre'],
      basePrice: 25000,
      displayOrder: 5,
      active: true,
      available: true,
    },
    {
      companyId,
      key: 'consulta_disponibilidad',
      name: 'Consulta de Disponibilidad',
      description: 'Pregunta si tenemos la prenda que buscas en tu talla',
      requiredFields: ['product', 'size'],
      optionalFields: ['color', 'phone'],
      allowedProductCategories: ['camisas', 'pantalones', 'vestidos', 'faldas', 'blusas', 'chaquetas', 'accesorios', 'zapatos', 'ropa_interior'],
      config: {
        responseTimeHours: 2,
        canNotifyWhenAvailable: true,
        requiresProducts: false,
      },
      keywords: ['disponible', 'disponibilidad', 'hay', 'tienen', 'talla', 'stock', 'queda', 'existencia'],
      basePrice: null,
      displayOrder: 6,
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

  console.log(`✅ ${services.length} servicios de la tienda de ropa creados`);
}
