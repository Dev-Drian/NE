import { Controller, Post, Body } from '@nestjs/common';
import { BotEngineService } from '../bot-engine/bot-engine.service';
import { UsersService } from '../users/users.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageResponseDto } from './dto/message-response.dto';

@Controller('messages')
export class MessagesController {
  constructor(
    private botEngine: BotEngineService,
    private usersService: UsersService,
  ) {}

  @Post()
  async sendMessage(@Body() dto: SendMessageDto): Promise<MessageResponseDto> {
    try {
    let userId = dto.userId;
    let phone = dto.phone;

    // Si no hay userId, necesitamos crear o encontrar el usuario
    if (!userId) {
      // Si hay phone proporcionado, usarlo
      if (!phone) {
        // Intentar extraer teléfono del mensaje o contexto existente
        // Por ahora, si no hay teléfono, crear usuario temporal
        // En una implementación completa, se extraería del mensaje con OpenAI
        phone = this.extractPhoneFromMessage(dto.message);
      }

      // Si aún no hay phone, generar uno temporal basado en timestamp
      // En producción, esto debería venir de la plataforma (WhatsApp, etc.)
      if (!phone) {
        phone = `temp_${Date.now()}`;
      }

      // Crear o encontrar usuario por teléfono
      const user = await this.usersService.findOrCreate(phone, {
        phone,
        name: null, // Se puede actualizar después si se extrae del mensaje
      });

      userId = user.id;
      phone = user.phone;
    } else {
      // Si hay userId, obtener el teléfono del usuario
      const user = await this.usersService.findOne(userId);
      if (user) {
        phone = user.phone;
      }
    }

    // Procesar mensaje con userId y phone
    return await this.botEngine.processMessage({
      companyId: dto.companyId,
      userId,
      phone,
      message: dto.message,
    });
    } catch (error) {
      console.error('❌ Error en sendMessage:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  private extractPhoneFromMessage(message: string): string | undefined {
    // Buscar patrones de teléfono en el mensaje
    const phonePatterns = [
      /\b\d{9}\b/g, // 9 dígitos (formato español común)
      /\b\d{10}\b/g, // 10 dígitos
      /\+\d{1,3}\s?\d{9,10}/g, // +34 612345678
      /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}/g, // 612 345 678 o 612-345-678
    ];

    for (const pattern of phonePatterns) {
      const matches = message.match(pattern);
      if (matches && matches.length > 0) {
        // Limpiar el teléfono (quitar espacios, guiones, +)
        return matches[0].replace(/[\s\-+]/g, '').slice(-9); // Tomar últimos 9 dígitos
      }
    }

    return undefined;
  }
}


