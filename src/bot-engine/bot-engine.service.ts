import { Injectable } from '@nestjs/common';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ReservationsService } from '../reservations/reservations.service';
import { AvailabilityService } from '../availability/availability.service';
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

    // 6. Procesar según intención
    let reply: string;
    let newState = { ...context };

    if (detection.intention === 'saludar') {
      reply = '¡Hola! Bienvenido a Restaurante La Pasta. ¿En qué puedo ayudarte? Puedo ayudarte a hacer una reserva.';
      // Resetear contexto completamente cuando es un saludo (inicia nueva conversación)
      newState = {
        stage: 'idle',
        collectedData: {},
        conversationHistory: context.conversationHistory, // Mantener historial pero resetear estado
        lastIntention: undefined,
      };
    } else if (detection.intention === 'reservar') {
      const result = await this.handleReservation(detection, context, dto);
      reply = result.reply;
      newState = result.newState;
    } else if (detection.intention === 'cancelar') {
      reply = detection.suggestedReply || 'Para cancelar tu reserva, necesito más información.';
      newState.stage = 'idle';
    } else if (detection.intention === 'consultar') {
      reply = detection.suggestedReply || 'Nuestro horario es de 12:00 a 22:00 de lunes a domingo (viernes y sábados hasta las 23:00). ¿Te gustaría hacer una reserva?';
      newState.stage = 'idle';
    } else {
      reply = detection.suggestedReply || 'No entendí. ¿Puedes reformular? Puedo ayudarte con reservas, información de horarios o cancelaciones.';
      newState.stage = 'idle';
    }

    // 7. Guardar estado actualizado
    await this.conversations.saveContext(dto.userId, dto.companyId, newState);

    // 8. Agregar respuesta al historial
    await this.conversations.addMessage(dto.userId, dto.companyId, 'assistant', reply);

    // 9. Retornar respuesta
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
  ): Promise<{ reply: string; newState: any }> {
    // Actualizar datos recopilados - solo sobrescribir con valores que NO sean null/undefined
    const extracted = detection.extractedData || {};
    const collected = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => value !== null && value !== undefined)
      ),
    };

    // Determinar qué falta
    const required = ['date', 'time', 'guests', 'phone'];
    const missing = required.filter((f) => !collected[f]);

    if (missing.length > 0) {
      // Faltan datos → preguntar
      const missingFieldsMap: { [key: string]: string } = {
        date: 'fecha',
        time: 'hora',
        guests: 'número de comensales',
        phone: 'teléfono',
      };

      const missingFieldsSpanish = missing.map((f) => missingFieldsMap[f] || f);
      const reply = `Para continuar necesito: ${missingFieldsSpanish.join(', ')}`;

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
        guests: collected.guests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service,
        status: 'confirmed',
      });

      return {
        reply: `✅ Reserva confirmada para ${collected.date} a las ${collected.time} para ${collected.guests || 1} ${collected.guests === 1 ? 'persona' : 'personas'}. Te contactaremos al ${collected.phone || 'número proporcionado'}.`,
        newState: {
          stage: 'completed',
          collectedData: {},
          conversationHistory: context.conversationHistory,
        },
      };
    } catch (error) {
      console.error('Error creando reserva:', error);
      return {
        reply: 'Hubo un error al crear la reserva. Por favor intenta de nuevo.',
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
        },
      };
    }
  }
}

