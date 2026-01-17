import { Injectable } from '@nestjs/common';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../availability/availability.service';
import { MessagesTemplatesService } from '../messages-templates/messages-templates.service';
import { CompaniesService } from '../companies/companies.service';
import { UsersService } from '../users/users.service';
import { ProcessMessageDto } from './dto/process-message.dto';
import { DetectionResult } from './dto/detection-result.dto';

export interface ProcessMessageResponse {
  reply: string;
  intention: string;
  confidence: number;
  missingFields?: string[];
  conversationState: string;
}

@Injectable()
export class BotEngineService {
  constructor(
    private layer1: Layer1KeywordsService,
    private layer2: Layer2SimilarityService,
    private layer3: Layer3OpenAIService,
    private conversations: ConversationsService,
    private reservations: ReservationsService,
    private availability: AvailabilityService,
    private messagesTemplates: MessagesTemplatesService,
    private companies: CompaniesService,
    private usersService: UsersService,
  ) {}

  async processMessage(dto: ProcessMessageDto): Promise<ProcessMessageResponse> {
    // 1. Si hay teléfono en los datos extraídos y no coincide con el usuario, actualizar
    // Esto permite actualizar el teléfono del usuario si se proporciona en el mensaje
    let userId = dto.userId;
    if (dto.phone) {
      // Verificar si el usuario tiene el teléfono correcto
      const user = await this.usersService.findOne(userId);
      if (user && user.phone !== dto.phone) {
        // Actualizar teléfono del usuario si cambió
        await this.usersService.update(userId, { phone: dto.phone });
      }
    }

    // 2. Cargar contexto desde Redis
    const context = await this.conversations.getContext(userId, dto.companyId);

    // 3. Agregar mensaje del usuario al historial
    await this.conversations.addMessage(userId, dto.companyId, 'user', dto.message);

    // 3. LÓGICA CONTEXTUAL: Si estamos en modo "collecting" con intención "reservar"
    // debemos forzar la continuidad de la reserva, PERO solo si el mensaje no es un saludo
    const isContinuingReservation = 
      context.stage === 'collecting' && context.lastIntention === 'reservar';
    
    // Detectar primero si es un saludo (tiene máxima prioridad y resetea el contexto)
    const greetingKeywords = ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi'];
    const lowerMessage = dto.message.toLowerCase();
    const isGreeting = greetingKeywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );
    
    // Detectar si hay palabras de consulta específicas (para evitar falsos positivos)
    const consultaKeywords = ['horario', 'horarios', 'abren', 'cierran', 'atención', 'qué días', 'cuál es el horario', 'cuándo abren'];
    const hasConsultaKeywords = consultaKeywords.some(keyword => 
      lowerMessage.includes(keyword.toLowerCase())
    );

    let detection: DetectionResult;

    if (isGreeting && !hasConsultaKeywords && !lowerMessage.includes('reservar') && !lowerMessage.includes('reserva') && !lowerMessage.includes('cita')) {
      // Si es SOLO un saludo sin otras intenciones, detectar como "saludar"
      detection = {
        intention: 'saludar',
        confidence: 1.0,
      };
    } else if (hasConsultaKeywords && !lowerMessage.includes('reservar') && !lowerMessage.includes('reserva')) {
      // Si tiene palabras de consulta y NO tiene palabras de reserva, priorizar consulta
      detection = {
        intention: 'consultar',
        confidence: 0.9,
      };
    } else if (isContinuingReservation) {
      // Si estamos continuando una reserva, SIEMPRE usar OpenAI para extraer datos
      // OpenAI entiende mejor el contexto y puede extraer información incluso sin keywords
      detection = await this.layer3.detect(dto.message, dto.companyId, userId);
      // Forzar intención a "reservar" porque sabemos que estamos en medio de una reserva
      detection.intention = 'reservar';
      detection.confidence = Math.max(detection.confidence, 0.7);
    } else {
      // Flujo normal: intentar capas 1, 2, 3
      // 4. CAPA 1: Intentar detección rápida
      detection = await this.layer1.detect(dto.message, dto.companyId);

      // 5. Si no hay confianza suficiente → CAPA 2
      if (detection.confidence < 0.85) {
        const layer2Detection = await this.layer2.detect(dto.message, dto.companyId);
        if (layer2Detection.confidence > detection.confidence) {
          detection = layer2Detection;
        }
      }

      // 6. Si la intención es "reservar", SIEMPRE usar OpenAI para extraer datos
      // Esto es necesario porque Layer1/Layer2 no extraen datos como fecha, hora, etc.
      if (detection.intention === 'reservar') {
        // Forzar uso de OpenAI para extraer datos cuando es reserva
        const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
        detection.intention = 'reservar'; // Mantener intención
        detection.confidence = Math.max(detection.confidence, layer3Detection.confidence);
        // Usar los datos extraídos de OpenAI
        if (layer3Detection.extractedData) {
          detection.extractedData = layer3Detection.extractedData;
        }
        if (layer3Detection.missingFields) {
          detection.missingFields = layer3Detection.missingFields;
        }
      } else if (detection.confidence < 0.6) {
        // Si aún no hay confianza → CAPA 3 (OpenAI)
        const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, userId);
        if (layer3Detection.confidence > detection.confidence) {
          detection = layer3Detection;
        }
      }
    }

    // 7. Si se detectó un teléfono en los datos extraídos, crear/actualizar usuario
    if (detection.extractedData?.phone && !dto.phone) {
      const extractedPhone = detection.extractedData.phone;
      const existingUser = await this.usersService.findByPhone(extractedPhone);
      if (existingUser) {
        // Si el usuario existe con ese teléfono, usar ese userId
        userId = existingUser.id;
      } else {
        // Crear nuevo usuario con el teléfono extraído
        const newUser = await this.usersService.create({
          phone: extractedPhone,
          name: detection.extractedData.name || null,
        });
        userId = newUser.id;
      }
    }

    // 8. Obtener información de la empresa
    const company = await this.companies.findOne(dto.companyId);
    if (!company) {
      throw new Error('Empresa no encontrada');
    }

    // 9. Procesar según intención
    let reply: string;
    let newState = { ...context };

    if (detection.intention === 'saludar') {
      reply = await this.messagesTemplates.getGreeting(company.type, company.name);
      // Resetear contexto completamente cuando es un saludo (inicia nueva conversación)
      newState = {
        stage: 'idle',
        collectedData: {},
        conversationHistory: context.conversationHistory, // Mantener historial pero resetear estado
        lastIntention: undefined,
      };
    } else if (detection.intention === 'reservar') {
      const result = await this.handleReservation(detection, context, { ...dto, userId }, company.type);
      reply = result.reply;
      newState = result.newState;
    } else if (detection.intention === 'cancelar') {
      reply = detection.suggestedReply || await this.messagesTemplates.getReservationCancel(company.type);
      newState.stage = 'idle';
    } else if (detection.intention === 'consultar') {
      const config = company.config as any;
      const hoursText = this.formatHours(config?.hours);
      reply = detection.suggestedReply || await this.messagesTemplates.getReservationQuery(company.type, hoursText);
      newState.stage = 'idle';
    } else {
      reply = detection.suggestedReply || await this.messagesTemplates.getError(company.type);
      newState.stage = 'idle';
    }

    // 10. Guardar estado actualizado
    await this.conversations.saveContext(userId, dto.companyId, newState);

    // 11. Agregar respuesta al historial
    await this.conversations.addMessage(userId, dto.companyId, 'assistant', reply);

    // 12. Retornar respuesta
    return {
      reply,
      intention: detection.intention,
      confidence: detection.confidence,
      missingFields: detection.missingFields,
      conversationState: newState.stage,
    };
  }

  private async handleReservation(
    detection: DetectionResult,
    context: any,
    dto: ProcessMessageDto,
    companyType: string,
  ): Promise<{ reply: string; newState: any }> {
    const settings = await this.messagesTemplates.getReservationSettings(companyType);
    const missingFieldsLabels = await this.messagesTemplates.getMissingFieldsLabels(companyType);

    // Verificar si la empresa tiene múltiples servicios
    const company = await this.companies.findOne(dto.companyId);
    const config = company?.config as any;
    const hasMultipleServices = config?.services && Object.keys(config.services).length > 1;

    // Actualizar datos recopilados - solo sobrescribir con valores que NO sean null/undefined/vacíos
    const extracted = detection.extractedData || {};
    const collected = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => 
          value !== null && value !== undefined && value !== '' && value !== 'null'
        )
      ),
    };

    // Si tiene múltiples servicios Y no se ha seleccionado servicio
    // Mostrar los servicios disponibles primero (pero GUARDAR los datos ya extraídos)
    if (hasMultipleServices && !collected.service) {
      const reply = `Perfecto, te ayudaré a agendar tu cita. Primero, ¿qué servicio necesitas?\n\nServicios disponibles:\n${Object.keys(config.services).map(s => `• ${s}`).join('\n')}`;

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected, // IMPORTANTE: Guardar TODOS los datos ya extraídos (fecha, hora, etc.)
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }

    // Determinar qué falta - guests es opcional según el tipo
    const required = ['date', 'time', 'phone'];
    if (settings.requireGuests) {
      required.push('guests');
    }
    
    // Si tiene múltiples servicios, el servicio es obligatorio
    if (hasMultipleServices) {
      required.push('service');
    }
    
    const missing = required.filter((f) => !collected[f]);

    if (missing.length > 0) {
      // Faltan datos → preguntar
      const missingFieldsSpanish = missing.map((f) => missingFieldsLabels[f] || f);
      const reply = await this.messagesTemplates.getReservationRequest(companyType, missingFieldsSpanish);

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }

    // Si no requiere guests pero no se proporcionó, usar default
    if (!settings.requireGuests && !collected.guests) {
      collected.guests = settings.defaultGuests || 1;
    }

    // Todos los datos completos → validar disponibilidad
    const available = await this.availability.check(dto.companyId, {
      date: collected.date!,
      time: collected.time!,
      guests: collected.guests,
      userId: dto.userId, // Pasar userId para validar reservas duplicadas
      service: collected.service, // Pasar service para validar por servicio
    });

    if (!available.isAvailable) {
      let reply = available.message || 'No hay disponibilidad en este horario.';
      if (available.alternatives && available.alternatives.length > 0) {
        reply += ` ¿Te sirve ${available.alternatives[0]}?`;
      }

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
        },
      };
    }

    // Crear reserva
    try {
      await this.reservations.create({
        company: { connect: { id: dto.companyId } },
        userId: dto.userId,
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests || settings.defaultGuests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service,
        status: 'confirmed',
      });

      const reply = await this.messagesTemplates.getReservationConfirm(companyType, {
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests,
        phone: collected.phone,
      });

      return {
        reply,
        newState: {
          stage: 'completed',
          collectedData: {},
          conversationHistory: context.conversationHistory,
        },
      };
    } catch (error) {
      console.error('Error creando reserva:', error);
      return {
        reply: await this.messagesTemplates.getError(companyType),
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
        },
      };
    }
  }

  private formatHours(hours: Record<string, string>): string {
    if (!hours || Object.keys(hours).length === 0) {
      return 'consultar disponibilidad';
    }

    const daysMap: Record<string, string> = {
      monday: 'Lunes',
      tuesday: 'Martes',
      wednesday: 'Miércoles',
      thursday: 'Jueves',
      friday: 'Viernes',
      saturday: 'Sábado',
      sunday: 'Domingo',
    };

    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    // Agrupar días con mismo horario
    const hoursBySlot: Record<string, string[]> = {};
    
    for (const day of dayOrder) {
      if (hours[day]) {
        const timeSlot = hours[day];
        if (!hoursBySlot[timeSlot]) {
          hoursBySlot[timeSlot] = [];
        }
        hoursBySlot[timeSlot].push(daysMap[day]);
      }
    }

    // Formatear horarios agrupados
    const formattedSlots: string[] = [];
    for (const [timeSlot, days] of Object.entries(hoursBySlot)) {
      if (days.length === 1) {
        formattedSlots.push(`${days[0]}: ${timeSlot}`);
      } else if (days.length === 2) {
        formattedSlots.push(`${days[0]} y ${days[1]}: ${timeSlot}`);
      } else {
        const firstDay = days[0];
        const lastDay = days[days.length - 1];
        formattedSlots.push(`${firstDay} a ${lastDay}: ${timeSlot}`);
      }
    }

    return formattedSlots.join('. ');
  }
}

