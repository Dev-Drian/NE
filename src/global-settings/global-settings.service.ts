import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateGlobalSettingsDto {
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

@Injectable()
export class GlobalSettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    let settings = await this.prisma.globalSettings.findUnique({
      where: { id: 'global' }
    });

    // Si no existe, crear con valores por defecto
    if (!settings) {
      settings = await this.prisma.globalSettings.create({
        data: { id: 'global' }
      });
    }

    // Ocultar valores sensibles parcialmente
    return {
      ...settings,
      jwtSecret: settings.jwtSecret ? '••••••••' : null,
      openaiApiKey: settings.openaiApiKey ? this.maskApiKey(settings.openaiApiKey) : null,
      geminiApiKey: settings.geminiApiKey ? this.maskApiKey(settings.geminiApiKey) : null,
      whatsappToken: settings.whatsappToken ? this.maskApiKey(settings.whatsappToken) : null,
      wompiPrivateKey: settings.wompiPrivateKey ? this.maskApiKey(settings.wompiPrivateKey) : null,
    };
  }

  // Versión sin enmascarar para uso interno
  async getSettingsRaw() {
    let settings = await this.prisma.globalSettings.findUnique({
      where: { id: 'global' }
    });

    if (!settings) {
      settings = await this.prisma.globalSettings.create({
        data: { id: 'global' }
      });
    }

    return settings;
  }

  async updateSettings(data: UpdateGlobalSettingsDto) {
    // Limpiar valores vacíos (no actualizar si es string vacío)
    const cleanData: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      // Solo actualizar si no está vacío y no es el valor enmascarado
      if (value !== undefined && value !== '' && !value.includes('••••')) {
        cleanData[key] = value;
      }
    }

    const settings = await this.prisma.globalSettings.upsert({
      where: { id: 'global' },
      update: cleanData,
      create: { id: 'global', ...cleanData },
    });

    return this.getSettings();
  }

  // Obtener API key de IA (para una empresa específica o global)
  async getAiApiKey(companyId?: string): Promise<{ provider: string; apiKey: string }> {
    // Si hay companyId, verificar si tiene key propia
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { 
          openaiApiKey: true, 
          geminiApiKey: true, 
          preferredAiProvider: true 
        }
      });

      if (company) {
        // Si la empresa tiene su propio provider configurado
        if (company.preferredAiProvider === 'openai' && company.openaiApiKey) {
          return { provider: 'openai', apiKey: company.openaiApiKey };
        }
        if (company.preferredAiProvider === 'gemini' && company.geminiApiKey) {
          return { provider: 'gemini', apiKey: company.geminiApiKey };
        }
      }
    }

    // Usar configuración global
    const settings = await this.getSettingsRaw();
    
    if (settings.defaultAiProvider === 'gemini' && settings.geminiApiKey) {
      return { provider: 'gemini', apiKey: settings.geminiApiKey };
    }
    
    if (settings.openaiApiKey) {
      return { provider: 'openai', apiKey: settings.openaiApiKey };
    }

    throw new NotFoundException('No hay API key de IA configurada');
  }

  // Obtener configuración de WhatsApp
  async getWhatsAppConfig() {
    const settings = await this.getSettingsRaw();
    
    return {
      token: settings.whatsappToken,
      phoneId: settings.whatsappPhoneId,
      verifyToken: settings.whatsappVerifyToken,
    };
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  }
}
