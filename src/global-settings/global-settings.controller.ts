import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { GlobalSettingsService } from './global-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '@prisma/client';

class UpdateGlobalSettingsDto {
  jwtSecret?: string;
  jwtExpiresIn?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  defaultAiProvider?: string;
  whatsappToken?: string;
  whatsappPhoneId?: string;
  whatsappVerifyToken?: string;
  wompiPublicKey?: string;
  wompiPrivateKey?: string;
  wompiEventsUrl?: string;
}

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GlobalSettingsController {
  constructor(private globalSettingsService: GlobalSettingsService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN)
  async getSettings() {
    return this.globalSettingsService.getSettings();
  }

  @Put()
  @Roles(AdminRole.SUPER_ADMIN)
  async updateSettings(@Body() updateDto: UpdateGlobalSettingsDto) {
    return this.globalSettingsService.updateSettings(updateDto);
  }
}
