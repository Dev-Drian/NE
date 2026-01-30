import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './companies/companies.module';
import { IntentionsModule } from './intentions/intentions.module';
import { ReservationsModule } from './reservations/reservations.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AvailabilityModule } from './availability/availability.module';
import { BotEngineModule } from './bot-engine/bot-engine.module';
import { MessagesModule } from './messages/messages.module';
import { PaymentsModule } from './payments/payments.module';
import { BotGraphQLModule } from './graphql/graphql.module';
import { ProductsModule } from './products/products.module';
import { ResourcesModule } from './resources/resources.module';
import { InventoryModule } from './inventory/inventory.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    // Módulo común global (ValidationService, etc.)
    CommonModule,
    // Rate Limiting global: 60 requests/minuto por IP
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 1000, // 1 segundo
      limit: 10, // 10 requests/segundo
    }, {
      name: 'medium',
      ttl: 60000, // 1 minuto
      limit: 100, // 100 requests/minuto
    }, {
      name: 'long',
      ttl: 3600000, // 1 hora  
      limit: 1000, // 1000 requests/hora
    }]),
    // Event Emitter para invalidación de cache
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    PrismaModule,
    CompaniesModule,
    IntentionsModule,
    ReservationsModule,
    UsersModule,
    ConversationsModule,
    AvailabilityModule,
    BotEngineModule,
    MessagesModule,
    PaymentsModule,
    BotGraphQLModule,
    ProductsModule,
    ResourcesModule,
    InventoryModule,
  ],
  providers: [
    // Guard global de Rate Limiting
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}





