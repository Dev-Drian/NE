import { Injectable, Logger } from '@nestjs/common';
import { DetectionResult } from '../dto/detection-result.dto';
import { ProcessMessageDto } from '../dto/process-message.dto';
import { ConversationState } from '../../conversations/dto/conversation-state.dto';
import { Company } from '@prisma/client';
import { IntentionHandlerContext, IntentionHandlerResult } from '../handlers/intention-handler.interface';
import { GreetingHandler } from '../handlers/greeting.handler';
import { CancelHandler } from '../handlers/cancel.handler';
import { QueryHandler } from '../handlers/query.handler';
import { HistoryHandler } from '../handlers/history.handler';
import { ProductQueryHandler } from '../handlers/product-query.handler';
import { DeliveryQueryHandler } from '../handlers/delivery-query.handler';
import { FarewellHandler } from '../handlers/farewell.handler';
import { KeywordDetectorService } from '../utils/keyword-detector.service';

/**
 * Servicio de orquestación de handlers
 * Centraliza la lógica de routing de intenciones para simplificar bot-engine.service.ts
 */
@Injectable()
export class IntentionOrchestratorService {
  private readonly logger = new Logger(IntentionOrchestratorService.name);

  constructor(
    private greetingHandler: GreetingHandler,
    private cancelHandler: CancelHandler,
    private queryHandler: QueryHandler,
    private historyHandler: HistoryHandler,
    private productQueryHandler: ProductQueryHandler,
    private deliveryQueryHandler: DeliveryQueryHandler,
    private farewellHandler: FarewellHandler,
    private keywordDetector: KeywordDetectorService,
  ) {}

  /**
   * Determina si el mensaje debe ser manejado por un handler específico
   * ANTES de pasar por el flujo de detección de intenciones
   */
  async shouldHandleDirectly(
    dto: ProcessMessageDto,
    context: ConversationState,
    company: Company,
  ): Promise<{ shouldHandle: boolean; type?: string }> {
    const message = dto.message;

    // Detectar despedida
    if (this.keywordDetector.isFarewell(message)) {
      // Solo si no hay otras intenciones
      if (
        !this.keywordDetector.asksForProducts(message) &&
        !this.keywordDetector.hasConsultaKeywords(message)
      ) {
        return { shouldHandle: true, type: 'farewell' };
      }
    }

    // Detectar consulta de historial
    if (this.keywordDetector.asksForHistory(message)) {
      return { shouldHandle: true, type: 'history' };
    }

    // Detectar consulta de domicilio
    if (this.keywordDetector.asksAboutDelivery(message)) {
      return { shouldHandle: true, type: 'delivery' };
    }

    // Detectar consulta de productos/menú
    if (this.keywordDetector.asksForProducts(message)) {
      return { shouldHandle: true, type: 'products' };
    }

    // Detectar consulta de precio específico
    if (this.keywordDetector.asksForPrice(message)) {
      return { shouldHandle: true, type: 'price' };
    }

    // Detectar saludo simple (sin otras intenciones)
    if (this.keywordDetector.isGreeting(message)) {
      if (
        !this.keywordDetector.hasConsultaKeywords(message) &&
        !this.keywordDetector.asksForProducts(message) &&
        !this.keywordDetector.mentionsReservation(message)
      ) {
        return { shouldHandle: true, type: 'greeting' };
      }
    }

    return { shouldHandle: false };
  }

  /**
   * Ejecuta el handler apropiado según el tipo detectado
   */
  async executeDirectHandler(
    type: string,
    dto: ProcessMessageDto,
    context: ConversationState,
    company: Company,
    userId: string,
    detection?: DetectionResult,
  ): Promise<IntentionHandlerResult | null> {
    const handlerContext: IntentionHandlerContext = {
      detection: detection || { intention: type, confidence: 1.0 },
      context,
      dto,
      company,
      userId,
    };

    try {
      switch (type) {
        case 'farewell':
          return await this.farewellHandler.handle(handlerContext);

        case 'history':
          return await this.historyHandler.handle(handlerContext);

        case 'delivery':
          return await this.deliveryQueryHandler.handle(handlerContext);

        case 'products':
          return await this.productQueryHandler.handle(handlerContext);

        case 'price':
          // Intentar buscar precio específico
          const priceResult = await this.productQueryHandler.handlePriceQuery(
            handlerContext,
            dto.message,
          );
          if (priceResult) return priceResult;
          // Si no encontró producto específico, mostrar todos los productos
          return await this.productQueryHandler.handle(handlerContext);

        case 'greeting':
          return await this.greetingHandler.handle(handlerContext);

        case 'cancel':
          return await this.cancelHandler.handle(handlerContext);

        case 'query':
          return await this.queryHandler.handle(handlerContext);

        default:
          this.logger.warn(`Handler type not found: ${type}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Error in handler ${type}:`, error);
      return null;
    }
  }

  /**
   * Ejecuta el handler basado en la intención detectada por el sistema de capas
   */
  async executeIntentionHandler(
    intention: string,
    dto: ProcessMessageDto,
    context: ConversationState,
    company: Company,
    userId: string,
    detection: DetectionResult,
  ): Promise<IntentionHandlerResult | null> {
    const handlerContext: IntentionHandlerContext = {
      detection,
      context,
      dto,
      company,
      userId,
    };

    try {
      switch (intention) {
        case 'saludar':
          return await this.greetingHandler.handle(handlerContext);

        case 'cancelar':
          return await this.cancelHandler.handle(handlerContext);

        case 'consultar':
          return await this.queryHandler.handle(handlerContext);

        // 'reservar' se maneja en bot-engine.service.ts porque tiene lógica compleja
        // 'otro' se maneja con la respuesta sugerida de OpenAI

        default:
          return null;
      }
    } catch (error) {
      this.logger.error(`Error in intention handler ${intention}:`, error);
      return null;
    }
  }

  /**
   * Verifica si el contexto de confirmación del bot coincide con una acción
   */
  checkBotConfirmationContext(
    message: string,
    lastBotMessage: string,
    intention: string,
  ): boolean {
    const lowMsg = message.toLowerCase();
    const lowBot = lastBotMessage.toLowerCase();

    // Si el usuario confirma y el bot preguntó sobre mostrar reservas
    if (
      this.keywordDetector.isConfirmation(message) &&
      (lowBot.includes('te gustaría que te la envíe') ||
        lowBot.includes('mostrar') ||
        lowBot.includes('envíe por aquí'))
    ) {
      return intention === 'history';
    }

    return false;
  }
}
