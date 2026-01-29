import { PrismaClient } from '@prisma/client';

export async function seedMessageTemplates(prisma: PrismaClient) {
  console.log('\n📝 Creando templates de mensajes...');

  // Template para RESTAURANTES
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

  // Template para CLÍNICAS
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

  // Template para SALONES DE BELLEZA
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

  // Template para SPAS
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

  console.log('✅ Templates de mensajes creados para 4 tipos de empresa');
}
