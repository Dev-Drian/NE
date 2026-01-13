import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { BotEngineModule } from '../bot-engine/bot-engine.module';

@Module({
  imports: [BotEngineModule],
  controllers: [MessagesController],
})
export class MessagesModule {}

