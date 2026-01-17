import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { BotEngineModule } from '../bot-engine/bot-engine.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [BotEngineModule, UsersModule],
  controllers: [MessagesController],
})
export class MessagesModule {}


