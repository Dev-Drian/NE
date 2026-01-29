import { PrismaClient } from '@prisma/client';

export async function seedRestaurantIntentions(prisma: PrismaClient, companyId: string) {
  console.log('\n💭 Creando intenciones para restaurante...');

  // Intención: saludar
  const saludar = await prisma.intention.create({
    data: {
      companyId,
      name: 'saludar',
      description: 'Intención de saludar o iniciar conversación',
      priority: 15,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'hola', weight: 0.9 },
          { type: 'keyword', value: 'buenos días', weight: 0.9 },
          { type: 'keyword', value: 'buenas tardes', weight: 0.9 },
          { type: 'keyword', value: 'buenas noches', weight: 0.9 },
          { type: 'keyword', value: 'hey', weight: 0.7 },
          { type: 'keyword', value: 'hi', weight: 0.7 },
        ],
      },
      examples: {
        create: [
          { text: 'hola' },
          { text: 'buenos días' },
          { text: 'buenas tardes' },
          { text: 'hey cómo están?' },
        ],
      },
    },
  });

  // Intención: reservar
  const reservar = await prisma.intention.create({
    data: {
      companyId,
      name: 'reservar',
      description: 'Intención de reservar una mesa',
      priority: 10,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'mesa', weight: 0.9 },
          { type: 'keyword', value: 'reservar', weight: 0.9 },
          { type: 'keyword', value: 'reserva', weight: 0.9 },
          { type: 'keyword', value: 'cita', weight: 0.7 },
          { type: 'keyword', value: 'turno', weight: 0.7 },
          { type: 'keyword', value: 'quiero', weight: 0.6 },
          { type: 'keyword', value: 'necesito', weight: 0.6 },
          { type: 'keyword', value: 'hacer', weight: 0.5 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero una mesa para 4' },
          { text: 'necesito reservar mañana' },
          { text: 'quiero reservar una mesa para cenar' },
          { text: 'necesito una mesa para 2 personas' },
          { text: 'quiero hacer una reserva' },
          { text: 'busco mesa para el sábado' },
          { text: 'mesa para 3 personas por favor' },
          { text: 'quiero reservar para el viernes' },
          { text: 'me gustaría reservar para 2' },
        ],
      },
    },
  });

  // Intención: cancelar
  const cancelar = await prisma.intention.create({
    data: {
      companyId,
      name: 'cancelar',
      description: 'Intención de cancelar una reserva',
      priority: 8,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'cancelar', weight: 0.9 },
          { type: 'keyword', value: 'cancelación', weight: 0.9 },
          { type: 'keyword', value: 'anular', weight: 0.8 },
          { type: 'keyword', value: 'eliminar', weight: 0.7 },
          { type: 'keyword', value: 'borrar', weight: 0.7 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero cancelar mi reserva' },
          { text: 'necesito anular la cita' },
          { text: 'cancelar por favor' },
          { text: 'eliminar mi reserva' },
        ],
      },
    },
  });

  // Intención: consultar
  const consultar = await prisma.intention.create({
    data: {
      companyId,
      name: 'consultar',
      description: 'Intención de consultar información o disponibilidad',
      priority: 12,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'horario', weight: 0.9 },
          { type: 'keyword', value: 'horarios', weight: 0.9 },
          { type: 'keyword', value: 'disponibilidad', weight: 0.95 },
          { type: 'keyword', value: 'hay disponibilidad', weight: 0.98 },
          { type: 'keyword', value: 'menú', weight: 0.95 },
          { type: 'keyword', value: 'menu', weight: 0.95 },
          { type: 'keyword', value: 'carta', weight: 0.9 },
          { type: 'keyword', value: 'qué tienen', weight: 0.95 },
          { type: 'keyword', value: 'productos', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'qué horarios tienen?' },
          { text: 'hay disponibilidad?' },
          { text: 'tienen mesa para hoy?' },
          { text: 'qué tienen en el menú?' },
          { text: 'muéstrame el menú' },
          { text: 'cuáles son las opciones?' },
        ],
      },
    },
  });

  console.log(`✅ 4 intenciones del restaurante creadas`);
  return { saludar, reservar, cancelar, consultar };
}

export async function seedClinicIntentions(prisma: PrismaClient, companyId: string) {
  console.log('\n💭 Creando intenciones para clínica...');

  // Intención: saludar
  const saludar = await prisma.intention.create({
    data: {
      companyId,
      name: 'saludar',
      description: 'Intención de saludar o iniciar conversación',
      priority: 15,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'hola', weight: 0.9 },
          { type: 'keyword', value: 'buenos días', weight: 0.9 },
          { type: 'keyword', value: 'buenas tardes', weight: 0.9 },
          { type: 'keyword', value: 'buenas noches', weight: 0.9 },
          { type: 'keyword', value: 'hey', weight: 0.7 },
        ],
      },
      examples: {
        create: [
          { text: 'hola' },
          { text: 'buenos días' },
          { text: 'buenas tardes' },
        ],
      },
    },
  });

  // Intención: reservar (citas)
  const reservar = await prisma.intention.create({
    data: {
      companyId,
      name: 'reservar',
      description: 'Intención de agendar una cita médica',
      priority: 10,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'cita', weight: 0.95 },
          { type: 'keyword', value: 'agendar', weight: 0.9 },
          { type: 'keyword', value: 'turno', weight: 0.9 },
          { type: 'keyword', value: 'reservar', weight: 0.85 },
          { type: 'keyword', value: 'limpieza', weight: 0.8 },
          { type: 'keyword', value: 'consulta', weight: 0.8 },
          { type: 'keyword', value: 'ortodoncia', weight: 0.8 },
          { type: 'keyword', value: 'blanqueamiento', weight: 0.8 },
          { type: 'keyword', value: 'dentista', weight: 0.75 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero una cita para limpieza' },
          { text: 'necesito agendar una consulta' },
          { text: 'quiero reservar cita con el dentista' },
          { text: 'necesito un turno para blanqueamiento' },
          { text: 'me duele una muela, necesito cita' },
        ],
      },
    },
  });

  // Intención: cancelar
  const cancelar = await prisma.intention.create({
    data: {
      companyId,
      name: 'cancelar',
      description: 'Intención de cancelar una cita',
      priority: 8,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'cancelar', weight: 0.9 },
          { type: 'keyword', value: 'cancelación', weight: 0.9 },
          { type: 'keyword', value: 'anular', weight: 0.8 },
          { type: 'keyword', value: 'no puedo ir', weight: 0.85 },
          { type: 'keyword', value: 'cambiar cita', weight: 0.8 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero cancelar mi cita' },
          { text: 'necesito anular la cita' },
          { text: 'no puedo ir a mi cita' },
          { text: 'cancelar turno' },
        ],
      },
    },
  });

  // Intención: consultar
  const consultar = await prisma.intention.create({
    data: {
      companyId,
      name: 'consultar',
      description: 'Intención de consultar información o disponibilidad',
      priority: 12,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'horario', weight: 0.9 },
          { type: 'keyword', value: 'disponibilidad', weight: 0.95 },
          { type: 'keyword', value: 'hay citas', weight: 0.9 },
          { type: 'keyword', value: 'precio', weight: 0.8 },
          { type: 'keyword', value: 'servicios', weight: 0.9 },
          { type: 'keyword', value: 'tratamientos', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'qué horarios tienen?' },
          { text: 'hay disponibilidad para mañana?' },
          { text: 'cuánto cuesta una limpieza?' },
          { text: 'qué tratamientos ofrecen?' },
        ],
      },
    },
  });

  console.log(`✅ 4 intenciones de la clínica creadas`);
  return { saludar, reservar, cancelar, consultar };
}
