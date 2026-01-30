import { Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { TextUtilsService } from './utils/text-utils.service';
import { ContextCacheService } from './utils/context-cache.service';
import { DateUtilsService } from './utils/date-utils.service';
import { KeywordDetectorService } from './utils/keyword-detector.service';
import { CircuitBreakerService } from './utils/circuit-breaker.service';
import { GreetingHandler } from './handlers/greeting.handler';
import { CancelHandler } from './handlers/cancel.handler';
import { QueryHandler } from './handlers/query.handler';
import { ReservationHandler } from './handlers/reservation.handler';
import { HistoryHandler } from './handlers/history.handler';
import { ProductQueryHandler } from './handlers/product-query.handler';
import { DeliveryQueryHandler } from './handlers/delivery-query.handler';
import { FarewellHandler } from './handlers/farewell.handler';
import { MetricsService } from './utils/metrics.service';
import { IntentionsModule } from '../intentions/intentions.module';
import { CompaniesModule } from '../companies/companies.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AvailabilityModule } from '../availability/availability.module';
import { MessagesTemplatesModule } from '../messages-templates/messages-templates.module';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { ContextCompressorService } from './context/context-compressor.service';
import { ContextBuilderService } from './context/context-builder.service';
import { FieldExtractorService } from './context/field-extractor.service';
import { ServiceValidatorService } from './services/service-validator.service';
import { ServiceConfigResolverService } from './services/service-config-resolver.service';
import { GenericServiceStrategy } from './services/strategy/generic-service.strategy';
import { ServiceRegistryService } from './services/service-registry.service';
import { ReservationFlowService } from './handlers/reservation/reservation-flow.service';
import { PromptBuilderService } from './layers/prompt-builder.service';
import { ResourceValidatorService } from './services/resource-validator.service';
import { StateMachineService } from './services/state-machine.service';
import { ConversationLoggingService } from './services/conversation-logging.service';
import { UserPreferencesService } from './services/user-preferences.service';
import { ReferenceResolverService } from './services/reference-resolver.service';
import { IntentionOrchestratorService } from './services/intention-orchestrator.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
// ===== SERVICIOS NLU AVANZADOS =====
import { SpellCheckerService } from './utils/spell-checker.service';
import { LearningService } from './services/learning.service';
import { SynonymService } from './utils/synonym.service';
import { DetectionExplainerService } from './utils/detection-explainer.service';
import { EntityNormalizerService } from './utils/entity-normalizer.service';
import { NluTestController } from './nlu-test.controller';

@Module({
  imports: [
    PrismaModule,
    IntentionsModule,
    CompaniesModule,
    ConversationsModule,
    ReservationsModule,
    AvailabilityModule,
    MessagesTemplatesModule,
    UsersModule,
    PaymentsModule,
    KeywordsModule,
    ProductsModule,
  ],
  controllers: [NluTestController],
  providers: [
    BotEngineService,
    Layer1KeywordsService,
    Layer2SimilarityService,
    Layer3OpenAIService,
    TextUtilsService,
    ContextCacheService,
    DateUtilsService,
    KeywordDetectorService,
    CircuitBreakerService,
    // Handlers de intención
    GreetingHandler,
    CancelHandler,
    QueryHandler,
    ReservationHandler,
    HistoryHandler,
    ProductQueryHandler,
    DeliveryQueryHandler,
    FarewellHandler,
    MetricsService,
    // Nuevos servicios de contexto
    ContextCompressorService,
    ContextBuilderService,
    FieldExtractorService,
    // Servicios de validación
    ServiceValidatorService,
    ServiceConfigResolverService,
    // Estrategias genéricas por servicio
    GenericServiceStrategy,
    ServiceRegistryService,
    // Flujo de reservas refactorizado
    ReservationFlowService,
    // Prompt builder modular (Layer3)
    PromptBuilderService,
    // Validador de recursos (mesas, productos, etc.)
    ResourceValidatorService,
    // State Machine (fuente única de verdad)
    StateMachineService,
    // ===== SERVICIOS AVANZADOS (Sistema ChatGPT-like) =====
    // Logging y métricas de conversaciones
    ConversationLoggingService,
    // Preferencias y memoria de usuario
    UserPreferencesService,
    // Resolución de referencias contextuales
    ReferenceResolverService,
    // Orquestador de intenciones (simplifica bot-engine.service.ts)
    IntentionOrchestratorService,
    // ===== NLU AVANZADO =====
    // Corrección ortográfica automática (WhatsApp español informal)
    SpellCheckerService,
    // Aprendizaje automático de patrones
    LearningService,
    // Sinónimos dinámicos
    SynonymService,
    // Explicador de detecciones (debugging/auditoría)
    DetectionExplainerService,
    // Normalizador de entidades (fechas, horas, cantidades)
    EntityNormalizerService,
  ],
  exports: [
    BotEngineService, 
    StateMachineService, 
    ConversationLoggingService, 
    UserPreferencesService, 
    IntentionOrchestratorService,
    // Exportar para uso externo
    SpellCheckerService,
    EntityNormalizerService,
    SynonymService,
  ],
})
export class BotEngineModule {}
