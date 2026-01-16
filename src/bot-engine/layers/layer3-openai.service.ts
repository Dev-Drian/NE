import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../../companies/companies.service';
import { ConversationsService } from '../../conversations/conversations.service';
import { DetectionResult } from '../dto/detection-result.dto';
import OpenAI from 'openai';

@Injectable()
export class Layer3OpenAIService {
  private openai: OpenAI;

  constructor(
    private companiesService: CompaniesService,
    private conversationsService: ConversationsService,
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no está configurada');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async detect(
    message: string,
    companyId: string,
    userId: string,
  ): Promise<DetectionResult> {
    const company = await this.companiesService.findOne(companyId);
    if (!company) {
      return {
        intention: 'otro',
        confidence: 0,
        suggestedReply: 'Empresa no encontrada',
      };
    }

    const context = await this.conversationsService.getContext(userId, companyId);
    const conversationHistory = context.conversationHistory
      .slice(-10)
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Información del estado actual (si estamos en modo collecting)
    const currentStateInfo = context.stage === 'collecting' 
      ? `\nEstado actual: Estamos en proceso de recopilar datos para una reserva.
Datos ya recopilados: ${JSON.stringify(context.collectedData)}
Última intención: ${context.lastIntention || 'ninguna'}
IMPORTANTE: Si el mensaje contiene datos (fecha, hora, comensales, teléfono), extrae SOLO los nuevos datos.`
      : '';

    const prompt = `Analiza este mensaje de un cliente y responde SOLO con un JSON válido (sin markdown, sin código, solo JSON):

Contexto: Cliente de ${company.name} (tipo: ${company.type})
Mensaje: "${message}"

${conversationHistory ? `Conversación previa:\n${conversationHistory}\n` : ''}
${currentStateInfo}

INSTRUCCIONES:
- Si estamos en proceso de reserva (estado "collecting"), la intención debe ser "reservar"
- Extrae TODOS los datos que aparecen en el mensaje actual (fecha, hora, número de personas, teléfono, nombre)
- Para fechas: convierte "mañana" a formato YYYY-MM-DD (fecha de mañana), "hoy" a fecha actual (YYYY-MM-DD), "viernes" al próximo viernes (YYYY-MM-DD)
- Para horas: convierte "8 de la noche" o "8pm" a "20:00", "8 de la mañana" a "08:00", "20:00" se mantiene como "20:00"
- Para personas: extrae números como "4 personas", "somos 2", "para 3" → guests: 4, 2, 3
- Para teléfono: extrae números de 9 dígitos como "611223344" → phone: "611223344"
- IMPORTANTE: Si el mensaje contiene datos, extrae TODOS aunque ya estén en collectedData
- Si el mensaje no tiene datos nuevos, extractedData puede tener valores null

Responde SOLO con este JSON:
{
  "intention": "reservar" | "cancelar" | "consultar" | "otro",
  "confidence": 0.0-1.0,
  "extractedData": {
    "date": "YYYY-MM-DD o null",
    "time": "HH:MM o null",
    "guests": número o null,
    "phone": "string o null",
    "name": "string o null"
  },
  "missingFields": ["fecha", "hora"] o [],
  "suggestedReply": "texto breve para responder"
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Respuesta vacía de OpenAI');
      }

      const parsed = JSON.parse(content);
      
      // Normalizar campos missingFields al español
      const missingFieldsMap: { [key: string]: string } = {
        date: 'fecha',
        time: 'hora',
        guests: 'comensales',
        phone: 'teléfono',
        name: 'nombre',
      };

      const missingFields = parsed.missingFields || [];
      const normalizedMissingFields = missingFields.map((field: string) => 
        missingFieldsMap[field] || field
      );

      return {
        intention: parsed.intention || 'otro',
        confidence: parsed.confidence || 0.5,
        extractedData: parsed.extractedData || {},
        missingFields: normalizedMissingFields,
        suggestedReply: parsed.suggestedReply || 'No entendí. ¿Puedes reformular?',
      };
    } catch (error) {
      console.error('Error en OpenAI:', error);
      return {
        intention: 'otro',
        confidence: 0,
        suggestedReply: 'Hubo un error procesando tu mensaje. Por favor intenta de nuevo.',
      };
    }
  }
}

