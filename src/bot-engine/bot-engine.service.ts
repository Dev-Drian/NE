import { Injectable } from '@nestjs/common';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../availability/availability.service';
import { MessagesTemplatesService } from '../messages-templates/messages-templates.service';
import { CompaniesService } from '../companies/companies.service';
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
  ) {}

  async processMessage(dto: ProcessMessageDto): Promise<ProcessMessageResponse> {
    // 1. Cargar contexto desde Redis
    const context = await this.conversations.getContext(dto.userId, dto.companyId);

    // 2. Agregar mensaje del usuario al historial
    await this.conversations.addMessage(dto.userId, dto.companyId, 'user', dto.message);

    // 3. LÓGICA CONTEXTUAL: Si estamos en modo "collecting" con intención "reservar"
    // debemos forzar la continuidad de la reserva, PERO solo si el mensaje no es un saludo
    const isContinuingReservation = 
      context.stage === 'collecting' && context.lastIntention === 'reservar';
    
    // Detectar primero si es un saludo (tiene máxima prioridad y resetea el contexto)
    const greetingKeywords = ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi'];
    const isGreeting = greetingKeywords.some(keyword => 
      dto.message.toLowerCase().includes(keyword.toLowerCase())
    );

    let detection: DetectionResult;

    if (isGreeting) {
      // Si es un saludo, SIEMPRE detectar como "saludar" y resetear contexto
      detection = {
        intention: 'saludar',
        confidence: 1.0,
      };
    } else if (isContinuingReservation) {
      // Si estamos continuando una reserva, SIEMPRE usar OpenAI para extraer datos
      // OpenAI entiende mejor el contexto y puede extraer información incluso sin keywords
      detection = await this.layer3.detect(dto.message, dto.companyId, dto.userId);
      // Forzar intención a "reservar" porque sabemos que estamos en medio de una reserva
      detection.intention = 'reservar';
      detection.confidence = Math.max(detection.confidence, 0.7);
    } else {
      // Flujo normal: intentar capas 1, 2, 3
      // 3. CAPA 1: Intentar detección rápida
      detection = await this.layer1.detect(dto.message, dto.companyId);

      // 4. Si no hay confianza suficiente → CAPA 2
      if (detection.confidence < 0.85) {
        const layer2Detection = await this.layer2.detect(dto.message, dto.companyId);
        if (layer2Detection.confidence > detection.confidence) {
          detection = layer2Detection;
        }
      }

      // 5. Si aún no hay confianza → CAPA 3 (OpenAI)
      if (detection.confidence < 0.6) {
        const layer3Detection = await this.layer3.detect(dto.message, dto.companyId, dto.userId);
        if (layer3Detection.confidence > detection.confidence) {
          detection = layer3Detection;
        }
      }
    }

    // 6. Obtener información de la empresa
    const company = await this.companies.findOne(dto.companyId);
    if (!company) {
      throw new Error('Empresa no encontrada');
    }

    // 7. Procesar según intención
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
      const result = await this.handleReservation(detection, context, dto, company.type);
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

    // 8. Guardar estado actualizado
    await this.conversations.saveContext(dto.userId, dto.companyId, newState);

    // 9. Agregar respuesta al historial
    await this.conversations.addMessage(dto.userId, dto.companyId, 'assistant', reply);

    // 10. Retornar respuesta
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

    // Actualizar datos recopilados - solo sobrescribir con valores que NO sean null/undefined
    const extracted = detection.extractedData || {};
    const collected = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => value !== null && value !== undefined)
      ),
    };

    // Determinar qué falta - guests es opcional según el tipo
    const required = ['date', 'time', 'phone'];
    if (settings.requireGuests) {
      required.push('guests');
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
    if (!hours) return 'consultar disponibilidad';
    // Formatear horas para mostrar (implementación básica)
    return 'consultar disponibilidad';
  }
}

