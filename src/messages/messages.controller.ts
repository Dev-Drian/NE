import { Controller, Post, Body } from '@nestjs/common';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';

@Controller('messages')
export class MessagesController {
  constructor(private botEngine: BotEngineService) {}

  @Post()
  async sendMessage(@Body() dto: SendMessageDto): Promise<MessageResponseDto> {
    return await this.botEngine.processMessage(dto);
  }
}

