import { PrismaClient } from '@prisma/client';

/**
 * Intenciones de SISTEMA que aplican a todas las empresas
 * Estas son intenciones genéricas que el bot necesita para funcionar bien
 */
export async function seedSystemIntentions(prisma: PrismaClient, companyId: string) {
  console.log('\n🔧 Creando intenciones de sistema...');

  // Intención: despedida/agradecimiento
  const despedida = await prisma.intention.create({
    data: {
      companyId,
      name: 'despedida',
      description: 'Intención de despedirse o agradecer',
      priority: 20, // Alta prioridad para detectar fin de conversación
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'gracias', weight: 0.9 },
          { type: 'keyword', value: 'muchas gracias', weight: 0.95 },
          { type: 'keyword', value: 'listo gracias', weight: 0.98 },
          { type: 'keyword', value: 'perfecto gracias', weight: 0.98 },
          { type: 'keyword', value: 'ok gracias', weight: 0.95 },
          { type: 'keyword', value: 'vale gracias', weight: 0.95 },
          { type: 'keyword', value: 'adiós', weight: 0.9 },
          { type: 'keyword', value: 'adios', weight: 0.9 },
          { type: 'keyword', value: 'chao', weight: 0.9 },
          { type: 'keyword', value: 'hasta luego', weight: 0.9 },
          { type: 'keyword', value: 'nos vemos', weight: 0.85 },
          { type: 'keyword', value: 'bye', weight: 0.85 },
          { type: 'keyword', value: 'buenas noches', weight: 0.7 },
          { type: 'keyword', value: 'que estés bien', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'gracias por tu ayuda' },
          { text: 'listo, muchas gracias' },
          { text: 'perfecto, adiós' },
          { text: 'vale, chao' },
          { text: 'nos vemos, gracias' },
        ],
      },
    },
  });

  // Intención: ver productos/menú/servicios
  const productos = await prisma.intention.create({
    data: {
      companyId,
      name: 'ver_productos',
      description: 'Intención de ver lista de productos, menú o servicios',
      priority: 13,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'menu', weight: 0.95 },
          { type: 'keyword', value: 'menú', weight: 0.95 },
          { type: 'keyword', value: 'carta', weight: 0.9 },
          { type: 'keyword', value: 'productos', weight: 0.9 },
          { type: 'keyword', value: 'que tienen', weight: 0.9 },
          { type: 'keyword', value: 'que hay', weight: 0.85 },
          { type: 'keyword', value: 'que venden', weight: 0.9 },
          { type: 'keyword', value: 'que ofrecen', weight: 0.9 },
          { type: 'keyword', value: 'servicios', weight: 0.85 },
          { type: 'keyword', value: 'tratamientos', weight: 0.85 },
          { type: 'keyword', value: 'cuales son', weight: 0.8 },
          { type: 'keyword', value: 'mostrar productos', weight: 0.95 },
          { type: 'keyword', value: 'ver menu', weight: 0.95 },
          { type: 'keyword', value: 'lista de productos', weight: 0.95 },
          { type: 'keyword', value: 'opciones', weight: 0.75 },
        ],
      },
      examples: {
        create: [
          { text: 'muéstrame el menú' },
          { text: 'qué productos tienen?' },
          { text: 'quiero ver la carta' },
          { text: 'cuáles son los servicios?' },
          { text: 'qué tratamientos ofrecen?' },
        ],
      },
    },
  });

  // Intención: preguntar precio
  const precio = await prisma.intention.create({
    data: {
      companyId,
      name: 'precio',
      description: 'Intención de preguntar por precios',
      priority: 14,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'cuanto cuesta', weight: 0.95 },
          { type: 'keyword', value: 'cuánto cuesta', weight: 0.95 },
          { type: 'keyword', value: 'precio de', weight: 0.9 },
          { type: 'keyword', value: 'precio del', weight: 0.9 },
          { type: 'keyword', value: 'cuanto vale', weight: 0.95 },
          { type: 'keyword', value: 'cuánto vale', weight: 0.95 },
          { type: 'keyword', value: 'costo de', weight: 0.9 },
          { type: 'keyword', value: 'cuanto sale', weight: 0.9 },
          { type: 'keyword', value: 'qué precio tiene', weight: 0.95 },
          { type: 'keyword', value: 'valor de', weight: 0.85 },
        ],
      },
      examples: {
        create: [
          { text: 'cuánto cuesta la pizza?' },
          { text: 'qué precio tiene la limpieza?' },
          { text: 'cuánto vale el corte?' },
          { text: 'cuánto sale el domicilio?' },
        ],
      },
    },
  });

  // Intención: ver historial
  const historial = await prisma.intention.create({
    data: {
      companyId,
      name: 'historial',
      description: 'Intención de ver historial de pedidos/reservas',
      priority: 11,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'mis pedidos', weight: 0.95 },
          { type: 'keyword', value: 'mis reservas', weight: 0.95 },
          { type: 'keyword', value: 'mis citas', weight: 0.95 },
          { type: 'keyword', value: 'mis domicilios', weight: 0.95 },
          { type: 'keyword', value: 'historial', weight: 0.9 },
          { type: 'keyword', value: 'pedidos anteriores', weight: 0.9 },
          { type: 'keyword', value: 'que he pedido', weight: 0.9 },
          { type: 'keyword', value: 'cuantos pedidos', weight: 0.85 },
          { type: 'keyword', value: 'cuantas reservas', weight: 0.85 },
          { type: 'keyword', value: 'mis ordenes', weight: 0.9 },
          { type: 'keyword', value: 'ultimos pedidos', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero ver mis pedidos' },
          { text: 'muéstrame mi historial' },
          { text: 'cuántas reservas tengo?' },
          { text: 'qué he pedido antes?' },
        ],
      },
    },
  });

  // Intención: pago
  const pago = await prisma.intention.create({
    data: {
      companyId,
      name: 'pago',
      description: 'Intención relacionada con pagos',
      priority: 16, // Alta prioridad porque es importante
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'pagar', weight: 0.95 },
          { type: 'keyword', value: 'pago', weight: 0.9 },
          { type: 'keyword', value: 'ya pague', weight: 0.98 },
          { type: 'keyword', value: 'ya pagué', weight: 0.98 },
          { type: 'keyword', value: 'link de pago', weight: 0.95 },
          { type: 'keyword', value: 'como pago', weight: 0.9 },
          { type: 'keyword', value: 'donde pago', weight: 0.9 },
          { type: 'keyword', value: 'falta pagar', weight: 0.9 },
          { type: 'keyword', value: 'debo pagar', weight: 0.9 },
          { type: 'keyword', value: 'realice el pago', weight: 0.95 },
          { type: 'keyword', value: 'hice el pago', weight: 0.95 },
        ],
      },
      examples: {
        create: [
          { text: 'ya pagué' },
          { text: 'cómo puedo pagar?' },
          { text: 'envíame el link de pago' },
          { text: 'cuánto debo pagar?' },
          { text: 'ya realicé el pago' },
        ],
      },
    },
  });

  // Intención: confirmación (respuesta afirmativa)
  const confirmacion = await prisma.intention.create({
    data: {
      companyId,
      name: 'confirmacion',
      description: 'Respuesta afirmativa del usuario (sí, ok, claro)',
      priority: 18, // Muy alta prioridad pero depende del contexto
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'sí', weight: 0.9 },
          { type: 'keyword', value: 'si', weight: 0.85 },
          { type: 'keyword', value: 'ok', weight: 0.9 },
          { type: 'keyword', value: 'okay', weight: 0.9 },
          { type: 'keyword', value: 'claro', weight: 0.9 },
          { type: 'keyword', value: 'por supuesto', weight: 0.95 },
          { type: 'keyword', value: 'perfecto', weight: 0.85 },
          { type: 'keyword', value: 'vale', weight: 0.85 },
          { type: 'keyword', value: 'de acuerdo', weight: 0.9 },
          { type: 'keyword', value: 'esta bien', weight: 0.9 },
          { type: 'keyword', value: 'está bien', weight: 0.9 },
          { type: 'keyword', value: 'correcto', weight: 0.9 },
          { type: 'keyword', value: 'exacto', weight: 0.9 },
          { type: 'keyword', value: 'dale', weight: 0.85 },
          { type: 'keyword', value: 'adelante', weight: 0.9 },
          { type: 'keyword', value: 'envíame', weight: 0.8 },
          { type: 'keyword', value: 'muéstrame', weight: 0.8 },
        ],
      },
      examples: {
        create: [
          { text: 'sí' },
          { text: 'ok' },
          { text: 'claro que sí' },
          { text: 'perfecto, adelante' },
          { text: 'de acuerdo' },
          { text: 'sí, por favor' },
        ],
      },
    },
  });

  // Intención: negación (respuesta negativa)
  const negacion = await prisma.intention.create({
    data: {
      companyId,
      name: 'negacion',
      description: 'Respuesta negativa del usuario (no, mejor no)',
      priority: 19, // Alta prioridad
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'no', weight: 0.85 },
          { type: 'keyword', value: 'nop', weight: 0.9 },
          { type: 'keyword', value: 'nel', weight: 0.9 },
          { type: 'keyword', value: 'no gracias', weight: 0.95 },
          { type: 'keyword', value: 'mejor no', weight: 0.95 },
          { type: 'keyword', value: 'no quiero', weight: 0.9 },
          { type: 'keyword', value: 'no necesito', weight: 0.9 },
          { type: 'keyword', value: 'olvídalo', weight: 0.9 },
          { type: 'keyword', value: 'olvidalo', weight: 0.9 },
          { type: 'keyword', value: 'déjalo', weight: 0.9 },
          { type: 'keyword', value: 'dejalo', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'no' },
          { text: 'no gracias' },
          { text: 'mejor no' },
          { text: 'no quiero' },
          { text: 'olvídalo' },
        ],
      },
    },
  });

  console.log(`✅ 7 intenciones de sistema creadas`);
  return { despedida, productos, precio, historial, pago, confirmacion, negacion };
}

/**
 * Función helper para agregar intenciones de sistema a una empresa existente
 */
export async function addSystemIntentionsToCompany(prisma: PrismaClient, companyId: string) {
  // Verificar si ya tiene las intenciones de sistema
  const existing = await prisma.intention.findFirst({
    where: {
      companyId,
      name: 'despedida',
    },
  });

  if (existing) {
    console.log('⚠️ La empresa ya tiene intenciones de sistema');
    return;
  }

  return seedSystemIntentions(prisma, companyId);
}
