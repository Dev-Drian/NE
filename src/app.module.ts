import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
})
export class AppModule {}





