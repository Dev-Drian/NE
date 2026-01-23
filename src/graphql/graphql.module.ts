import { Module } from '@nestjs/common';
import { GraphQLModule as NestGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { BotResolver } from './resolvers/bot.resolver';
import { BotEngineModule } from '../bot-engine/bot-engine.module';
import { CompaniesModule } from '../companies/companies.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [
    NestGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
    }),
    BotEngineModule,
    CompaniesModule,
    ConversationsModule,
    ReservationsModule,
  ],
  providers: [BotResolver],
})
export class BotGraphQLModule {}
