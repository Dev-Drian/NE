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

@Module({
  imports: [
    IntentionsModule,
    CompaniesModule,
    ConversationsModule,
    ReservationsModule,
    AvailabilityModule,
    MessagesTemplatesModule,
    UsersModule,
    PaymentsModule,
    KeywordsModule,
  ],
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
    GreetingHandler,
    CancelHandler,
    QueryHandler,
    ReservationHandler,
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
  ],
  exports: [BotEngineService],
})
export class BotEngineModule {}
