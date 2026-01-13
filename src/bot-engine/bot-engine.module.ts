import { Module } from '@nestjs/common';
import { BotEngineService } from './bot-engine.service';
import { Layer1KeywordsService } from './layers/layer1-keywords.service';
import { Layer2SimilarityService } from './layers/layer2-similarity.service';
import { Layer3OpenAIService } from './layers/layer3-openai.service';
import { IntentionsModule } from '../intentions/intentions.module';
import { CompaniesModule } from '../companies/companies.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [
    IntentionsModule,
    CompaniesModule,
    ConversationsModule,
    ReservationsModule,
    AvailabilityModule,
  ],
  providers: [
    BotEngineService,
    Layer1KeywordsService,
    Layer2SimilarityService,
    Layer3OpenAIService,
  ],
  exports: [BotEngineService],
})
export class BotEngineModule {}

