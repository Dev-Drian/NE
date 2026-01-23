import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed...');

  // Limpiar datos anteriores (opcional - solo para desarrollo)
  // IMPORTANTE: Eliminar en orden para evitar foreign key constraints
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.intentionExample.deleteMany();
  await prisma.intentionPattern.deleteMany();
  await prisma.intention.deleteMany();
  await prisma.serviceKeyword.deleteMany();
  await prisma.company.deleteMany();
  await prisma.user.deleteMany();
  await prisma.messageTemplateConfig.deleteMany();

  // Crear empresa de ejemplo - Restaurante
  const company = await prisma.company.create({
    data: {
      name: 'Restaurante La Pasta',
      type: 'restaurant',
      description: 'Restaurante italiano especializado en pasta y pizza',
      phone: '+34 912 345 678',
      active: true,
      // Configuración de Wompi TEST (sandbox)
      requiresPayment: true,
      paymentPercentage: 50, // 50% de anticipo
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
        
        // Recursos físicos (mesas, salas, etc.)
        resources: [
          { id: 'mesa-1', name: 'Mesa para 2', capacity: 2, type: 'mesa', available: true },
          { id: 'mesa-2', name: 'Mesa para 2', capacity: 2, type: 'mesa', available: true },
          { id: 'mesa-3', name: 'Mesa para 2', capacity: 2, type: 'mesa', available: true },
          { id: 'mesa-4', name: 'Mesa para 4', capacity: 4, type: 'mesa', available: true },
          { id: 'mesa-5', name: 'Mesa para 4', capacity: 4, type: 'mesa', available: true },
          { id: 'mesa-6', name: 'Mesa para 4', capacity: 4, type: 'mesa', available: true },
          { id: 'mesa-7', name: 'Mesa para 4', capacity: 4, type: 'mesa', available: true },
          { id: 'mesa-8', name: 'Mesa para 6', capacity: 6, type: 'mesa', available: true },
          { id: 'mesa-9', name: 'Mesa para 6', capacity: 6, type: 'mesa', available: true },
          { id: 'mesa-10', name: 'Mesa para 8', capacity: 8, type: 'mesa', available: true },
        ],
        
        // Productos/Menú (para domicilio o consumo)
        products: [
          // Pizzas
          { id: 'prod-1', name: 'Pizza Margherita', price: 25000, category: 'pizzas', available: true, stock: 10 },
          { id: 'prod-2', name: 'Pizza Pepperoni', price: 28000, category: 'pizzas', available: true, stock: 8 },
          { id: 'prod-3', name: 'Pizza Cuatro Quesos', price: 30000, category: 'pizzas', available: true, stock: 5 },
          { id: 'prod-4', name: 'Pizza Vegetariana', price: 27000, category: 'pizzas', available: true, stock: 7 },
          
          // Pastas
          { id: 'prod-5', name: 'Pasta Carbonara', price: 22000, category: 'pastas', available: true, stock: 12 },
          { id: 'prod-6', name: 'Pasta Bolognesa', price: 20000, category: 'pastas', available: true, stock: 15 },
          { id: 'prod-7', name: 'Pasta Alfredo', price: 24000, category: 'pastas', available: true, stock: 10 },
          { id: 'prod-8', name: 'Lasagna', price: 26000, category: 'pastas', available: true, stock: 6 },
          
          // Bebidas
          { id: 'prod-9', name: 'Coca Cola', price: 3000, category: 'bebidas', available: true, stock: 50 },
          { id: 'prod-10', name: 'Agua', price: 2000, category: 'bebidas', available: true, stock: 30 },
          { id: 'prod-11', name: 'Vino Tinto', price: 45000, category: 'bebidas', available: true, stock: 20 },
          
          // Postres
          { id: 'prod-12', name: 'Tiramisu', price: 12000, category: 'postres', available: true, stock: 8 },
          { id: 'prod-13', name: 'Panna Cotta', price: 10000, category: 'postres', available: true, stock: 10 },
        ],
        
        // Tipos de servicio
        services: {
          mesa: {
            enabled: true,
            name: 'Mesa en restaurante',
            description: 'Reserva de mesa en el restaurante',
            requiresPayment: false, // No requiere pago anticipado
            requiresProducts: false, // No requiere seleccionar productos
            minAdvanceHours: 2, // Mínimo 2 horas de anticipación
          },
          domicilio: {
            enabled: true,
            name: 'Servicio a domicilio',
            description: 'Pedido a domicilio',
            requiresPayment: true, // Requiere pago anticipado
            requiresProducts: true, // Requiere seleccionar productos del menú
            requiresAddress: true, // Requiere dirección/ubicación para entrega
            deliveryFee: 5000, // Costo de envío
            minOrderAmount: 20000, // Pedido mínimo
            minAdvanceMinutes: 45, // Mínimo 45 minutos de anticipación
            // Campos específicos requeridos para este servicio
            requiredFields: ['date', 'time', 'phone', 'products', 'address'],
          },
        },
      },
    },
  });

  console.log(`✅ Empresa creada: ${company.name} (${company.id})`);

  // Crear empresa de ejemplo - Clínica Dental
  const clinica = await prisma.company.create({
    data: {
      name: 'Clínica Dental Sonrisas',
      type: 'clinic',
      description: 'Clínica dental especializada en ortodoncia y estética dental',
      phone: '+34 911 222 333',
      active: true,
      // Configuración de Wompi TEST (sandbox)
      requiresPayment: true,
      paymentPercentage: 100, // 100% pago anticipado
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
        
        // Recursos físicos (consultorios, sillas, etc.)
        resources: [
          { id: 'consultorio-1', name: 'Consultorio 1', capacity: 1, type: 'consultorio', available: true },
          { id: 'consultorio-2', name: 'Consultorio 2', capacity: 1, type: 'consultorio', available: true },
          { id: 'consultorio-3', name: 'Consultorio 3', capacity: 1, type: 'consultorio', available: true },
          { id: 'sala-ortodoncia', name: 'Sala Ortodoncia', capacity: 1, type: 'sala-especializada', available: true },
          { id: 'sala-blanqueamiento', name: 'Sala Blanqueamiento', capacity: 1, type: 'sala-especializada', available: true },
        ],
        
        // Servicios/Tratamientos ofrecidos
        products: [
          { 
            id: 'serv-1', 
            name: 'Limpieza dental', 
            price: 80000, 
            duration: 30, 
            category: 'preventivo',
            description: 'Limpieza profesional dental',
            available: true 
          },
          { 
            id: 'serv-2', 
            name: 'Consulta general', 
            price: 50000, 
            duration: 20, 
            category: 'consulta',
            description: 'Consulta odontológica general',
            available: true 
          },
          { 
            id: 'serv-3', 
            name: 'Revisión ortodoncia', 
            price: 150000, 
            duration: 45, 
            category: 'ortodoncia',
            description: 'Control y ajuste de brackets',
            available: true 
          },
          { 
            id: 'serv-4', 
            name: 'Blanqueamiento dental', 
            price: 200000, 
            duration: 60, 
            category: 'estetica',
            description: 'Blanqueamiento profesional',
            available: true 
          },
          { 
            id: 'serv-5', 
            name: 'Extracción simple', 
            price: 120000, 
            duration: 30, 
            category: 'cirugia',
            description: 'Extracción de pieza dental',
            available: true 
          },
          { 
            id: 'serv-6', 
            name: 'Empaste (resina)', 
            price: 90000, 
            duration: 40, 
            category: 'restauracion',
            description: 'Empaste dental con resina',
            available: true 
          },
          { 
            id: 'serv-7', 
            name: 'Endodoncia', 
            price: 350000, 
            duration: 90, 
            category: 'endodoncia',
            description: 'Tratamiento de conducto',
            available: true 
          },
        ],
        
        // Tipos de servicio
        services: {
          cita: {
            enabled: true,
            name: 'Cita en clínica',
            description: 'Agendar cita en consultorio',
            requiresPayment: true, // Requiere pago anticipado
            requiresProducts: true, // Debe seleccionar tratamiento
            minAdvanceHours: 4, // Mínimo 4 horas de anticipación
          },
        },
      },
    },
  });

  console.log(`✅ Empresa creada: ${clinica.name} (${clinica.id})`);

  // Crear templates de mensajes por tipo de empresa
  await prisma.messageTemplateConfig.create({
    data: {
      companyType: 'restaurant',
      active: true,
      templates: {
        greeting: '¡Hola! Bienvenido a {{companyName}}. ¿En qué puedo ayudarte?\n\nPuedo ayudarte a:\n• Reservar una mesa 🪑\n• Pedir domicilio 🏠\n• Consultar nuestro menú 📋',
        reservationRequest: 'Perfecto, me encantaría ayudarte con tu reserva. Para continuar, necesito que me proporciones: {{fields}}',
        reservationConfirm: '✅ Reserva confirmada para el {{date}} a las {{time}} para {{guests}} {{peopleText}}. Te contactaremos al {{phone}}.',
        reservationCancel: 'Para cancelar tu reserva, necesito más información.',
        reservationQuery: 'Nuestro horario es de {{hours}}. ¿Te gustaría hacer una reserva?',
        missingFields: 'Para continuar necesito: {{fields}}',
        error: 'Hubo un error al procesar tu solicitud. Por favor intenta de nuevo.',
      },
      terminology: {
        reservation: 'reserva',
        person: 'persona',
        people: 'personas',
        service: 'servicio',
      },
      reservationSettings: {
        requireGuests: true,
        defaultGuests: 1,
      },
    },
  });

  await prisma.messageTemplateConfig.create({
    data: {
      companyType: 'clinic',
      active: true,
      templates: {
        greeting: '¡Hola! Bienvenido a {{companyName}}. ¿En qué puedo ayudarte? Puedo ayudarte a agendar una cita o resolver cualquier consulta.',
        reservationRequest: 'Perfecto, estaré encantado de ayudarte a agendar tu cita. Necesito algunos datos: {{fields}}',
        reservationConfirm: '✅ Cita confirmada para el {{date}} a las {{time}}. Te contactaremos al {{phone}}.',
        reservationCancel: 'Para cancelar tu cita, necesito más información.',
        reservationQuery: 'Nuestro horario es de {{hours}}. ¿Te gustaría agendar una cita?',
        missingFields: 'Para continuar necesito: {{fields}}',
        error: 'Hubo un error al procesar tu solicitud. Por favor intenta de nuevo.',
      },
      terminology: {
        reservation: 'cita',
        person: 'paciente',
        people: 'pacientes',
        service: 'tratamiento',
      },
      reservationSettings: {
        requireGuests: false,
        defaultGuests: 1,
      },
    },
  });

  await prisma.messageTemplateConfig.create({
    data: {
      companyType: 'salon',
      active: true,
      templates: {
        greeting: '¡Hola! Bienvenido a {{companyName}}. ¿En qué puedo ayudarte? Puedo ayudarte a hacer una reserva o resolver cualquier duda que tengas.',
        reservationRequest: 'Perfecto, me encantaría ayudarte con tu reserva. Para continuar, necesito que me proporciones: {{fields}}',
        reservationConfirm: '✅ Reserva confirmada para el {{date}} a las {{time}} para {{guests}} {{peopleText}}. Te contactaremos al {{phone}}.',
        reservationCancel: 'Para cancelar tu reserva, necesito más información.',
        reservationQuery: 'Nuestro horario es de {{hours}}. ¿Te gustaría hacer una reserva?',
        missingFields: 'Para continuar necesito: {{fields}}',
        error: 'Hubo un error al procesar tu solicitud. Por favor intenta de nuevo.',
      },
      terminology: {
        reservation: 'reserva',
        person: 'persona',
        people: 'personas',
        service: 'servicio',
      },
      reservationSettings: {
        requireGuests: true,
        defaultGuests: 1,
      },
    },
  });

  await prisma.messageTemplateConfig.create({
    data: {
      companyType: 'spa',
      active: true,
      templates: {
        greeting: '¡Hola! Bienvenido a {{companyName}}. ¿En qué puedo ayudarte? Puedo ayudarte a hacer una reserva o resolver cualquier duda que tengas.',
        reservationRequest: 'Perfecto, me encantaría ayudarte con tu reserva. Para continuar, necesito que me proporciones: {{fields}}',
        reservationConfirm: '✅ Reserva confirmada para el {{date}} a las {{time}} para {{guests}} {{peopleText}}. Te contactaremos al {{phone}}.',
        reservationCancel: 'Para cancelar tu reserva, necesito más información.',
        reservationQuery: 'Nuestro horario es de {{hours}}. ¿Te gustaría hacer una reserva?',
        missingFields: 'Para continuar necesito: {{fields}}',
        error: 'Hubo un error al procesar tu solicitud. Por favor intenta de nuevo.',
      },
      terminology: {
        reservation: 'reserva',
        person: 'persona',
        people: 'personas',
        service: 'servicio',
      },
      reservationSettings: {
        requireGuests: true,
        defaultGuests: 1,
      },
    },
  });

  console.log('✅ Templates de mensajes creados para todos los tipos de empresa');

  // Crear intención "saludar" (para manejar saludos)
  const saludarIntention = await prisma.intention.create({
    data: {
      companyId: company.id,
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

  console.log(`✅ Intención creada: ${saludarIntention.name} (${saludarIntention.id})`);

  // Crear intención "reservar"
  const reservarIntention = await prisma.intention.create({
    data: {
      companyId: company.id,
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
          { text: 'tengo una cita para mañana' },
          { text: 'quiero hacer una reserva' },
          { text: 'busco mesa para el sábado' },
          { text: 'mesa para 3 personas por favor' },
          { text: 'quiero reservar para el viernes' },
          { text: 'me gustaría reservar para 2' },
        ],
      },
    },
  });

  console.log(`✅ Intención creada: ${reservarIntention.name} (${reservarIntention.id})`);

  // Crear intención "cancelar"
  const cancelarIntention = await prisma.intention.create({
    data: {
      companyId: company.id,
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

  console.log(`✅ Intención creada: ${cancelarIntention.name} (${cancelarIntention.id})`);

  // Crear intención "consultar"
  const consultarIntention = await prisma.intention.create({
    data: {
      companyId: company.id,
      name: 'consultar',
      description: 'Intención de consultar información o disponibilidad',
      priority: 12,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'horario', weight: 0.9 },
          { type: 'keyword', value: 'horarios', weight: 0.9 },
          { type: 'keyword', value: 'abren', weight: 0.9 },
          { type: 'keyword', value: 'cierran', weight: 0.9 },
          { type: 'keyword', value: 'atención', weight: 0.85 },
          { type: 'keyword', value: 'días abiertos', weight: 0.9 },
          { type: 'keyword', value: 'qué días', weight: 0.85 },
          { type: 'keyword', value: 'cuál es el horario', weight: 0.95 },
          { type: 'keyword', value: 'cuándo abren', weight: 0.95 },
          { type: 'keyword', value: 'disponibilidad', weight: 0.95 },
          { type: 'keyword', value: 'hay disponibilidad', weight: 0.98 },
          { type: 'keyword', value: 'tienen disponibilidad', weight: 0.98 },
          { type: 'keyword', value: 'hay espacio', weight: 0.95 },
          { type: 'keyword', value: 'tienen mesa', weight: 0.9 },
          { type: 'keyword', value: 'hay lugar', weight: 0.9 },
          { type: 'keyword', value: 'están abiertos', weight: 0.9 },
          { type: 'keyword', value: 'consultar', weight: 0.7 },
          { type: 'keyword', value: 'información', weight: 0.6 },
          { type: 'keyword', value: 'menú', weight: 0.95 },
          { type: 'keyword', value: 'menu', weight: 0.95 },
          { type: 'keyword', value: 'carta', weight: 0.9 },
          { type: 'keyword', value: 'qué tienen', weight: 0.95 },
          { type: 'keyword', value: 'que tienen', weight: 0.95 },
          { type: 'keyword', value: 'productos', weight: 0.9 },
          { type: 'keyword', value: 'opciones', weight: 0.85 },
          { type: 'keyword', value: 'qué ofrecen', weight: 0.9 },
          { type: 'keyword', value: 'que ofrecen', weight: 0.9 },
        ],
      },
      examples: {
        create: [
          { text: 'qué horarios tienen?' },
          { text: 'hay disponibilidad?' },
          { text: 'hay disponibilidad para el domingo?' },
          { text: 'tienen mesa para hoy?' },
          { text: 'hay espacio para mañana?' },
          { text: 'están abiertos el lunes?' },
          { text: 'tienen disponibilidad para 4 personas?' },
          { text: 'hay lugar para el sábado?' },
          { text: 'quiero información' },
          { text: 'cuándo abren?' },
          { text: 'cuál es el horario?' },
          { text: 'qué tienen en el menú?' },
          { text: 'muéstrame el menú' },
          { text: 'qué productos tienen?' },
          { text: 'cuáles son las opciones?' },
        ],
      },
    },
  });

  console.log(`✅ Intención creada: ${consultarIntention.name} (${consultarIntention.id})`);

  // ========== INTENCIONES PARA CLÍNICA DENTAL ==========
  
  // Crear intención "saludar" para clínica
  const saludarClinica = await prisma.intention.create({
    data: {
      companyId: clinica.id,
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

  // Crear intención "reservar" para clínica (citas)
  const reservarClinica = await prisma.intention.create({
    data: {
      companyId: clinica.id,
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
          { type: 'keyword', value: 'doctor', weight: 0.7 },
          { type: 'keyword', value: 'necesito', weight: 0.6 },
          { type: 'keyword', value: 'quiero', weight: 0.6 },
        ],
      },
      examples: {
        create: [
          { text: 'quiero una cita para limpieza' },
          { text: 'necesito agendar una consulta' },
          { text: 'quiero reservar cita con el dentista' },
          { text: 'necesito un turno para blanqueamiento' },
          { text: 'quiero agendar revisión de ortodoncia' },
          { text: 'necesito una cita urgente' },
          { text: 'me duele una muela, necesito cita' },
        ],
      },
    },
  });

  // Crear intención "cancelar" para clínica
  const cancelarClinica = await prisma.intention.create({
    data: {
      companyId: clinica.id,
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

  // Crear intención "consultar" para clínica
  const consultarClinica = await prisma.intention.create({
    data: {
      companyId: clinica.id,
      name: 'consultar',
      description: 'Intención de consultar información o disponibilidad',
      priority: 12,
      active: true,
      patterns: {
        create: [
          { type: 'keyword', value: 'horario', weight: 0.9 },
          { type: 'keyword', value: 'horarios', weight: 0.9 },
          { type: 'keyword', value: 'disponibilidad', weight: 0.95 },
          { type: 'keyword', value: 'hay citas', weight: 0.9 },
          { type: 'keyword', value: 'tienen citas', weight: 0.9 },
          { type: 'keyword', value: 'cuánto cuesta', weight: 0.85 },
          { type: 'keyword', value: 'precio', weight: 0.8 },
          { type: 'keyword', value: 'servicios', weight: 0.9 },
          { type: 'keyword', value: 'tratamientos', weight: 0.9 },
          { type: 'keyword', value: 'qué servicios', weight: 0.95 },
          { type: 'keyword', value: 'que servicios', weight: 0.95 },
          { type: 'keyword', value: 'qué tratamientos', weight: 0.95 },
          { type: 'keyword', value: 'que tratamientos', weight: 0.95 },
          { type: 'keyword', value: 'qué ofrecen', weight: 0.9 },
          { type: 'keyword', value: 'que ofrecen', weight: 0.9 },
          { type: 'keyword', value: 'opciones', weight: 0.85 },
        ],
      },
      examples: {
        create: [
          { text: 'qué horarios tienen?' },
          { text: 'hay disponibilidad para mañana?' },
          { text: 'tienen citas para hoy?' },
          { text: 'cuánto cuesta una limpieza?' },
          { text: 'qué tratamientos ofrecen?' },
          { text: 'cuándo abren?' },
          { text: 'qué servicios tienen?' },
          { text: 'cuáles son los tratamientos?' },
          { text: 'muéstrame los servicios' },
        ],
      },
    },
  });

  console.log(`✅ Intenciones creadas para Clínica: saludar, reservar, cancelar, consultar`);

  // Crear algunos usuarios de ejemplo
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

  console.log(`✅ Usuarios creados: ${user1.name}, ${user2.name}`);

  // Crear un tercer usuario para pruebas con clínica
  const user3 = await prisma.user.create({
    data: {
      phone: '611223344',
      name: 'Carlos López',
      email: 'carlos@example.com',
    },
  });

  console.log(`✅ Usuario adicional creado: ${user3.name}`);

  // Crear keywords de servicios (escalable, en BD)
  console.log('\n📝 Creando keywords de servicios...');
  
  // Keywords GLOBALES (aplican a todas las empresas)
  const globalKeywords = [
    // Servicio: domicilio
    { serviceKey: 'domicilio', keyword: 'pedir a domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'domicilio', type: 'contains', weight: 0.9 },
    { serviceKey: 'domicilio', keyword: 'delivery', type: 'contains', weight: 0.9 },
    { serviceKey: 'domicilio', keyword: 'a domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'envío', type: 'contains', weight: 0.85 },
    { serviceKey: 'domicilio', keyword: 'pedido a domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'quiero un domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'necesito un domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'un domicilio', type: 'contains', weight: 0.9 },
    { serviceKey: 'domicilio', keyword: 'pedir domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'domicilio para', type: 'contains', weight: 0.9 },
    { serviceKey: 'domicilio', keyword: 'que me lo traigan', type: 'contains', weight: 0.95 },
    { serviceKey: 'domicilio', keyword: 'que me lo lleven', type: 'contains', weight: 0.95 },
    
    // Servicio: mesa
    { serviceKey: 'mesa', keyword: 'mesa', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'restaurante', type: 'contains', weight: 0.85 },
    { serviceKey: 'mesa', keyword: 'comer aquí', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'en el restaurante', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'reservar mesa', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'mesa en restaurante', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'quiero una mesa', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'para llevar', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'pedir para llevar', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'llevar', type: 'contains', weight: 0.85 },
    { serviceKey: 'mesa', keyword: 'take away', type: 'contains', weight: 0.85 },
    { serviceKey: 'mesa', keyword: 'recoger', type: 'contains', weight: 0.9 },
    { serviceKey: 'mesa', keyword: 'pasar a recoger', type: 'contains', weight: 0.9 },
    
    // Exclusiones (cambiar de domicilio a mesa)
    { serviceKey: 'mesa', keyword: 'no quiero que me lo traigan', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'no quiero que me la traigan', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'no quiero domicilio', type: 'contains', weight: 0.95 },
    { serviceKey: 'mesa', keyword: 'no quiero delivery', type: 'contains', weight: 0.95 },
  ];

  await prisma.serviceKeyword.createMany({
    data: globalKeywords.map(k => ({
      ...k,
      companyId: null, // Global
      language: 'es',
      active: true,
    })),
  });

  console.log(`✅ ${globalKeywords.length} keywords globales creados`);

  // Keywords ESPECÍFICOS del restaurante (opcional, para personalización)
  const restaurantKeywords = [
    { serviceKey: 'mesa', keyword: 'take away', type: 'contains', weight: 0.9 },
  ];

  await prisma.serviceKeyword.createMany({
    data: restaurantKeywords.map(k => ({
      ...k,
      companyId: company.id,
      language: 'es',
      active: true,
    })),
  });

  console.log(`✅ ${restaurantKeywords.length} keywords específicos del restaurante creados`);

  console.log('\n✨ Seed completado exitosamente!');
  console.log(`\n📋 IDs de empresas para pruebas:`);
  console.log(`   - ${company.name} (restaurant): ${company.id}`);
  console.log(`   - ${clinica.name} (clinic): ${clinica.id}`);
  console.log(`\n📋 IDs de usuarios para pruebas:`);
  console.log(`   - ${user1.name}: ${user1.id} (teléfono: ${user1.phone})`);
  console.log(`   - ${user2.name}: ${user2.id} (teléfono: ${user2.phone})`);
  console.log(`   - ${user3.name}: ${user3.id} (teléfono: ${user3.phone})`);
  console.log(`\n📋 Intenciones del Restaurante:`);
  console.log(`   - saludar: ${saludarIntention.id}`);
  console.log(`   - reservar: ${reservarIntention.id}`);
  console.log(`   - cancelar: ${cancelarIntention.id}`);
  console.log(`   - consultar: ${consultarIntention.id}`);
  console.log(`\n📋 Intenciones de la Clínica:`);
  console.log(`   - saludar: ${saludarClinica.id}`);
  console.log(`   - reservar: ${reservarClinica.id}`);
  console.log(`   - cancelar: ${cancelarClinica.id}`);
  console.log(`   - consultar: ${consultarClinica.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
