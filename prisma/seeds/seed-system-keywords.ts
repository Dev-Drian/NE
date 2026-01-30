import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Categorías de keywords del sistema
 * Estas son las mismas que estaban hardcodeadas en keyword-detector.service.ts
 */
const SYSTEM_KEYWORDS = {
  // Saludos
  greeting: [
    { keyword: 'hola', weight: 1.0 },
    { keyword: 'buenos días', weight: 1.0 },
    { keyword: 'buenos dias', weight: 1.0 },
    { keyword: 'buenas tardes', weight: 1.0 },
    { keyword: 'buenas noches', weight: 1.0 },
    { keyword: 'buen día', weight: 1.0 },
    { keyword: 'buen dia', weight: 1.0 },
    { keyword: 'hey', weight: 0.8 },
    { keyword: 'hi', weight: 0.8 },
    { keyword: 'hello', weight: 0.8 },
    { keyword: 'que tal', weight: 0.9 },
    { keyword: 'como estas', weight: 0.9 },
    { keyword: 'cómo estás', weight: 0.9 },
  ],

  // Despedidas y agradecimientos
  farewell: [
    { keyword: 'gracias', weight: 1.0 },
    { keyword: 'listo gracias', weight: 1.0 },
    { keyword: 'perfecto gracias', weight: 1.0 },
    { keyword: 'ok gracias', weight: 1.0 },
    { keyword: 'vale gracias', weight: 1.0 },
    { keyword: 'adiós', weight: 1.0 },
    { keyword: 'adios', weight: 1.0 },
    { keyword: 'chao', weight: 1.0 },
    { keyword: 'hasta luego', weight: 1.0 },
    { keyword: 'nos vemos', weight: 1.0 },
    { keyword: 'bye', weight: 1.0 },
    { keyword: 'hasta pronto', weight: 1.0 },
    { keyword: 'muchas gracias', weight: 1.0 },
    { keyword: 'te agradezco', weight: 0.9 },
  ],

  // Confirmaciones positivas
  confirmation: [
    { keyword: 'sí', weight: 1.0, type: 'exact' },
    { keyword: 'si', weight: 0.9, type: 'exact' },
    { keyword: 'yes', weight: 1.0, type: 'exact' },
    { keyword: 'ok', weight: 0.9, type: 'exact' },
    { keyword: 'okay', weight: 0.9, type: 'exact' },
    { keyword: 'claro', weight: 1.0 },
    { keyword: 'por supuesto', weight: 1.0 },
    { keyword: 'perfecto', weight: 1.0 },
    { keyword: 'vale', weight: 0.9 },
    { keyword: 'de acuerdo', weight: 1.0 },
    { keyword: 'está bien', weight: 1.0 },
    { keyword: 'esta bien', weight: 1.0 },
    { keyword: 'correcto', weight: 1.0 },
    { keyword: 'exacto', weight: 1.0 },
    { keyword: 'bueno', weight: 0.8 },
    { keyword: 'dale', weight: 0.9 },
    { keyword: 'adelante', weight: 0.9 },
    { keyword: 'envíame', weight: 0.9 },
    { keyword: 'envíamelo', weight: 0.9 },
    { keyword: 'muéstrame', weight: 0.9 },
    { keyword: 'muestrame', weight: 0.9 },
    { keyword: 'dame', weight: 0.8 },
    { keyword: 'quiero ver', weight: 0.9 },
    { keyword: 'quiero verlo', weight: 0.9 },
    { keyword: 'sí por favor', weight: 1.0 },
    { keyword: 'si por favor', weight: 1.0 },
    { keyword: 'afirmativo', weight: 1.0 },
    { keyword: 'así es', weight: 1.0 },
    { keyword: 'eso es', weight: 0.9 },
  ],

  // Negaciones
  negation: [
    { keyword: 'no', weight: 1.0, type: 'exact' },
    { keyword: 'nop', weight: 1.0 },
    { keyword: 'nope', weight: 1.0 },
    { keyword: 'nel', weight: 0.9 },
    { keyword: 'para nada', weight: 1.0 },
    { keyword: 'negativo', weight: 1.0 },
    { keyword: 'no gracias', weight: 1.0 },
    { keyword: 'no quiero', weight: 1.0 },
    { keyword: 'no necesito', weight: 1.0 },
    { keyword: 'no me interesa', weight: 1.0 },
    { keyword: 'mejor no', weight: 1.0 },
    { keyword: 'todavía no', weight: 0.9 },
    { keyword: 'aún no', weight: 0.9 },
  ],

  // Preguntas por productos/menú/servicios
  products: [
    { keyword: 'menu', weight: 1.0 },
    { keyword: 'menú', weight: 1.0 },
    { keyword: 'productos', weight: 1.0 },
    { keyword: 'que tienen', weight: 1.0 },
    { keyword: 'qué tienen', weight: 1.0 },
    { keyword: 'opciones', weight: 0.9 },
    { keyword: 'carta', weight: 1.0 },
    { keyword: 'que hay', weight: 0.9 },
    { keyword: 'qué hay', weight: 0.9 },
    { keyword: 'que venden', weight: 1.0 },
    { keyword: 'qué venden', weight: 1.0 },
    { keyword: 'que ofrecen', weight: 1.0 },
    { keyword: 'qué ofrecen', weight: 1.0 },
    { keyword: 'servicios', weight: 1.0 },
    { keyword: 'tratamientos', weight: 1.0 },
    { keyword: 'que servicios', weight: 1.0 },
    { keyword: 'qué servicios', weight: 1.0 },
    { keyword: 'cuales servicios', weight: 1.0 },
    { keyword: 'cuáles servicios', weight: 1.0 },
    { keyword: 'cuales productos', weight: 1.0 },
    { keyword: 'cuáles productos', weight: 1.0 },
    { keyword: 'cuales son los productos', weight: 1.0 },
    { keyword: 'cuales son', weight: 0.8 },
    { keyword: 'que productos tienen', weight: 1.0 },
    { keyword: 'mostrar productos', weight: 1.0 },
    { keyword: 'ver menu', weight: 1.0 },
    { keyword: 'ver menú', weight: 1.0 },
    { keyword: 'ver productos', weight: 1.0 },
    { keyword: 'lista de productos', weight: 1.0 },
    { keyword: 'catalogo', weight: 1.0 },
    { keyword: 'catálogo', weight: 1.0 },
  ],

  // Preguntas sobre precios
  price: [
    { keyword: 'cuanto cuesta', weight: 1.0 },
    { keyword: 'cuánto cuesta', weight: 1.0 },
    { keyword: 'precio de', weight: 1.0 },
    { keyword: 'precio del', weight: 1.0 },
    { keyword: 'cuanto vale', weight: 1.0 },
    { keyword: 'cuánto vale', weight: 1.0 },
    { keyword: 'costo de', weight: 1.0 },
    { keyword: 'costo del', weight: 1.0 },
    { keyword: 'cuanto sale', weight: 1.0 },
    { keyword: 'cuánto sale', weight: 1.0 },
    { keyword: 'precio', weight: 0.7 },
    { keyword: 'vale', weight: 0.5 },
    { keyword: 'cuesta', weight: 0.6 },
    { keyword: 'precios', weight: 0.8 },
    { keyword: 'tarifas', weight: 0.9 },
    { keyword: 'costos', weight: 0.8 },
  ],

  // Historial de pedidos/reservas
  history: [
    { keyword: 'mis pedidos', weight: 1.0 },
    { keyword: 'mis domicilios', weight: 1.0 },
    { keyword: 'mis reservas', weight: 1.0 },
    { keyword: 'mis citas', weight: 1.0 },
    { keyword: 'cuantos pedidos', weight: 1.0 },
    { keyword: 'cuántos pedidos', weight: 1.0 },
    { keyword: 'cuantos domicilios', weight: 1.0 },
    { keyword: 'cuantas reservas', weight: 1.0 },
    { keyword: 'cuántas reservas', weight: 1.0 },
    { keyword: 'historial', weight: 1.0 },
    { keyword: 'pedidos anteriores', weight: 1.0 },
    { keyword: 'que he pedido', weight: 1.0 },
    { keyword: 'qué he pedido', weight: 1.0 },
    { keyword: 'pedidos previos', weight: 1.0 },
    { keyword: 'mis ordenes', weight: 1.0 },
    { keyword: 'mis órdenes', weight: 1.0 },
    { keyword: 'cuantos llevo', weight: 0.9 },
    { keyword: 'cuantas llevo', weight: 0.9 },
    { keyword: 'ultimos pedidos', weight: 1.0 },
    { keyword: 'últimos pedidos', weight: 1.0 },
    { keyword: 'ultimas reservas', weight: 1.0 },
    { keyword: 'últimas reservas', weight: 1.0 },
  ],

  // Pago
  payment: [
    { keyword: 'pago', weight: 0.8 },
    { keyword: 'pagar', weight: 0.9 },
    { keyword: 'pagado', weight: 0.8 },
    { keyword: 'ya pague', weight: 1.0 },
    { keyword: 'ya pagué', weight: 1.0 },
    { keyword: 'ya page', weight: 1.0 },
    { keyword: 'ya pago', weight: 0.9 },
    { keyword: 'ya pagó', weight: 0.9 },
    { keyword: 'falta pagar', weight: 1.0 },
    { keyword: 'debo pagar', weight: 1.0 },
    { keyword: 'link de pago', weight: 1.0 },
    { keyword: 'link pago', weight: 1.0 },
    { keyword: 'pago pendiente', weight: 1.0 },
    { keyword: 'pago falta', weight: 1.0 },
    { keyword: 'acabo de pagar', weight: 1.0 },
    { keyword: 'realice el pago', weight: 1.0 },
    { keyword: 'realicé el pago', weight: 1.0 },
    { keyword: 'hice el pago', weight: 1.0 },
    { keyword: 'complete el pago', weight: 1.0 },
    { keyword: 'completé el pago', weight: 1.0 },
    { keyword: 'listo pague', weight: 1.0 },
    { keyword: 'listo pagué', weight: 1.0 },
  ],

  // Cancelar
  cancel: [
    { keyword: 'cancelar', weight: 1.0 },
    { keyword: 'cancelar mi reserva', weight: 1.0 },
    { keyword: 'cancelar reserva', weight: 1.0 },
    { keyword: 'cancelar cita', weight: 1.0 },
    { keyword: 'cancelar pedido', weight: 1.0 },
    { keyword: 'anular', weight: 1.0 },
    { keyword: 'anular reserva', weight: 1.0 },
    { keyword: 'anular cita', weight: 1.0 },
    { keyword: 'anular pedido', weight: 1.0 },
    { keyword: 'anular mi reserva', weight: 1.0 },
    { keyword: 'necesito anular', weight: 1.0 },
    { keyword: 'quiero anular', weight: 1.0 },
    { keyword: 'deseo anular', weight: 1.0 },
    { keyword: 'eliminar', weight: 0.8 },
    { keyword: 'eliminar reserva', weight: 1.0 },
    { keyword: 'eliminar cita', weight: 1.0 },
    { keyword: 'eliminar pedido', weight: 1.0 },
    { keyword: 'borrar', weight: 0.7 },
    { keyword: 'borrar reserva', weight: 1.0 },
    { keyword: 'deseo cancelar', weight: 1.0 },
    { keyword: 'quiero cancelar', weight: 1.0 },
    { keyword: 'necesito cancelar', weight: 1.0 },
    { keyword: 'mejor cancelar', weight: 0.9 },
    { keyword: 'cancelar por favor', weight: 1.0 },
  ],

  // Consultas generales (horarios, dirección, etc.)
  consulta: [
    { keyword: 'horario', weight: 1.0 },
    { keyword: 'horarios', weight: 1.0 },
    { keyword: 'abren', weight: 0.9 },
    { keyword: 'cierran', weight: 0.9 },
    { keyword: 'atencion', weight: 0.8 },
    { keyword: 'atención', weight: 0.8 },
    { keyword: 'que dias', weight: 0.9 },
    { keyword: 'qué días', weight: 0.9 },
    { keyword: 'cual es el horario', weight: 1.0 },
    { keyword: 'cuál es el horario', weight: 1.0 },
    { keyword: 'cuando abren', weight: 1.0 },
    { keyword: 'cuándo abren', weight: 1.0 },
    { keyword: 'direccion', weight: 1.0 },
    { keyword: 'dirección', weight: 1.0 },
    { keyword: 'ubicacion', weight: 1.0 },
    { keyword: 'ubicación', weight: 1.0 },
    { keyword: 'donde estan', weight: 1.0 },
    { keyword: 'dónde están', weight: 1.0 },
    { keyword: 'tienen disponibilidad', weight: 0.9 },
    { keyword: 'hay disponibilidad', weight: 0.9 },
    { keyword: 'disponible', weight: 0.7 },
  ],

  // Disponibilidad específica
  availability: [
    { keyword: 'cuando hay disponibilidad', weight: 1.0 },
    { keyword: 'cuándo hay disponibilidad', weight: 1.0 },
    { keyword: 'para cuando hay', weight: 1.0 },
    { keyword: 'para cuándo hay', weight: 1.0 },
    { keyword: 'que dias hay', weight: 1.0 },
    { keyword: 'qué días hay', weight: 1.0 },
    { keyword: 'que horarios hay', weight: 1.0 },
    { keyword: 'qué horarios hay', weight: 1.0 },
    { keyword: 'cuando tienen disponible', weight: 1.0 },
    { keyword: 'cuando atienden', weight: 1.0 },
    { keyword: 'cuándo atienden', weight: 1.0 },
    { keyword: 'que dias atienden', weight: 1.0 },
    { keyword: 'qué días atienden', weight: 1.0 },
    { keyword: 'horarios disponibles', weight: 1.0 },
    { keyword: 'cuando puedo', weight: 0.9 },
    { keyword: 'cuándo puedo', weight: 0.9 },
    { keyword: 'para cuando', weight: 0.8 },
    { keyword: 'para cuándo', weight: 0.8 },
    { keyword: 'disponibilidad para', weight: 1.0 },
  ],

  // Pedir detalles/información
  details: [
    { keyword: 'informacion sobre', weight: 1.0 },
    { keyword: 'información sobre', weight: 1.0 },
    { keyword: 'informacion de', weight: 1.0 },
    { keyword: 'información de', weight: 1.0 },
    { keyword: 'detalles de', weight: 1.0 },
    { keyword: 'detalles del', weight: 1.0 },
    { keyword: 'detalles sobre', weight: 1.0 },
    { keyword: 'cuentame mas', weight: 1.0 },
    { keyword: 'cuéntame más', weight: 1.0 },
    { keyword: 'que es', weight: 0.8 },
    { keyword: 'qué es', weight: 0.8 },
    { keyword: 'en que consiste', weight: 1.0 },
    { keyword: 'en qué consiste', weight: 1.0 },
    { keyword: 'como es', weight: 0.8 },
    { keyword: 'cómo es', weight: 0.8 },
    { keyword: 'mas sobre', weight: 0.9 },
    { keyword: 'más sobre', weight: 0.9 },
    { keyword: 'explica', weight: 0.9 },
    { keyword: 'explícame', weight: 0.9 },
    { keyword: 'que incluye', weight: 1.0 },
    { keyword: 'qué incluye', weight: 1.0 },
    { keyword: 'si sobre', weight: 0.8 },
    { keyword: 'sobre el', weight: 0.6 },
    { keyword: 'sobre la', weight: 0.6 },
    { keyword: 'acerca de', weight: 0.9 },
    { keyword: 'acerca del', weight: 0.9 },
    { keyword: 'de que trata', weight: 1.0 },
    { keyword: 'de qué trata', weight: 1.0 },
    { keyword: 'contame de', weight: 1.0 },
    { keyword: 'cuéntame de', weight: 1.0 },
    { keyword: 'hablame de', weight: 1.0 },
    { keyword: 'háblame de', weight: 1.0 },
  ],

  // Delivery/Domicilio
  delivery: [
    { keyword: 'domicilio', weight: 1.0 },
    { keyword: 'delivery', weight: 1.0 },
    { keyword: 'domicilios', weight: 1.0 },
    { keyword: 'llevar a casa', weight: 1.0 },
    { keyword: 'enviar a', weight: 0.9 },
    { keyword: 'envio', weight: 0.8 },
    { keyword: 'envío', weight: 0.8 },
    { keyword: 'traigan', weight: 0.9 },
    { keyword: 'lleven', weight: 0.9 },
    { keyword: 'a casa', weight: 0.7 },
    { keyword: 'que me lo traigan', weight: 1.0 },
    { keyword: 'a domicilio', weight: 1.0 },
    { keyword: 'pedir a domicilio', weight: 1.0 },
  ],

  // Para llevar (pickup)
  para_llevar: [
    { keyword: 'para llevar', weight: 1.0 },
    { keyword: 'pedir para llevar', weight: 1.0 },
    { keyword: 'llevar', weight: 0.6 },
    { keyword: 'take away', weight: 1.0 },
    { keyword: 'recoger', weight: 0.9 },
    { keyword: 'pasar a recoger', weight: 1.0 },
    { keyword: 'paso a recoger', weight: 1.0 },
    { keyword: 'recojo', weight: 0.9 },
    { keyword: 'pickup', weight: 1.0 },
    { keyword: 'pick up', weight: 1.0 },
  ],

  // Preguntas sobre delivery (informativas, no órdenes)
  delivery_question: [
    { keyword: 'hacen domicilio', weight: 1.0 },
    { keyword: 'hacen domicilios', weight: 1.0 },
    { keyword: 'tienen domicilio', weight: 1.0 },
    { keyword: 'tienen delivery', weight: 1.0 },
    { keyword: 'hay domicilio', weight: 1.0 },
    { keyword: 'hay delivery', weight: 1.0 },
    { keyword: 'ofrecen domicilio', weight: 1.0 },
    { keyword: 'manejan domicilio', weight: 1.0 },
    { keyword: 'existe domicilio', weight: 1.0 },
    { keyword: 'cuentan con domicilio', weight: 1.0 },
    { keyword: 'también domicilio', weight: 1.0 },
    { keyword: 'tambien domicilio', weight: 1.0 },
  ],

  // Reservar/Agendar
  reservar: [
    { keyword: 'reservar', weight: 1.0 },
    { keyword: 'reserva', weight: 0.9 },
    { keyword: 'cita', weight: 0.9 },
    { keyword: 'agendar', weight: 1.0 },
    { keyword: 'quiero reservar', weight: 1.0 },
    { keyword: 'necesito reservar', weight: 1.0 },
    { keyword: 'deseo reservar', weight: 1.0 },
    { keyword: 'hacer reserva', weight: 1.0 },
    { keyword: 'hacer una reserva', weight: 1.0 },
    { keyword: 'pedir cita', weight: 1.0 },
    { keyword: 'agendar cita', weight: 1.0 },
    { keyword: 'programar cita', weight: 1.0 },
    { keyword: 'apartar', weight: 0.8 },
    { keyword: 'separar', weight: 0.7 },
  ],

  // Comida (para inferir servicio domicilio)
  food: [
    { keyword: 'pizza', weight: 1.0 },
    { keyword: 'pizzas', weight: 1.0 },
    { keyword: 'pasta', weight: 1.0 },
    { keyword: 'pastas', weight: 1.0 },
    { keyword: 'lasagna', weight: 1.0 },
    { keyword: 'lasaña', weight: 1.0 },
    { keyword: 'coca', weight: 0.8 },
    { keyword: 'coca cola', weight: 1.0 },
    { keyword: 'bebida', weight: 0.8 },
    { keyword: 'bebidas', weight: 0.8 },
    { keyword: 'postre', weight: 0.9 },
    { keyword: 'postres', weight: 0.9 },
    { keyword: 'comida', weight: 0.7 },
    { keyword: 'almuerzo', weight: 0.9 },
    { keyword: 'cena', weight: 0.9 },
    { keyword: 'desayuno', weight: 0.9 },
    { keyword: 'hamburguesa', weight: 1.0 },
    { keyword: 'hamburguesas', weight: 1.0 },
    { keyword: 'sushi', weight: 1.0 },
    { keyword: 'tacos', weight: 1.0 },
    { keyword: 'empanadas', weight: 1.0 },
  ],
};

/**
 * Seed de keywords del sistema
 * Migra todos los keywords hardcodeados a la base de datos
 */
export async function seedSystemKeywords() {
  console.log('🌱 Sembrando keywords del sistema...');

  let created = 0;
  let skipped = 0;

  for (const [category, keywords] of Object.entries(SYSTEM_KEYWORDS)) {
    for (const item of keywords) {
      try {
        await prisma.systemKeyword.upsert({
          where: {
            category_keyword_language: {
              category,
              keyword: item.keyword,
              language: 'es',
            },
          },
          create: {
            category,
            keyword: item.keyword,
            type: (item as any).type || 'contains',
            weight: item.weight,
            language: 'es',
            active: true,
          },
          update: {
            weight: item.weight,
            type: (item as any).type || 'contains',
            active: true,
          },
        });
        created++;
      } catch (error) {
        console.warn(`⚠️ Error creando keyword "${item.keyword}" en categoría "${category}":`, error);
        skipped++;
      }
    }
  }

  console.log(`✅ Keywords del sistema sembrados: ${created} creados/actualizados, ${skipped} omitidos`);
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedSystemKeywords()
    .then(() => {
      console.log('🎉 Seed completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en seed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
