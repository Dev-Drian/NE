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

    // Calcular fechas de referencia para días de la semana
    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const mañana = new Date(hoy);
    mañana.setDate(hoy.getDate() + 1);
    const pasadoMañana = new Date(hoy);
    pasadoMañana.setDate(hoy.getDate() + 2);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Calcular próximos días de la semana
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const proximosDias: { [key: string]: string } = {};
    
    for (let i = 0; i < 7; i++) {
      const dia = diasSemana[i];
      const hoyDia = hoy.getDay();
      let diasHasta = i - hoyDia;
      if (diasHasta <= 0) diasHasta += 7; // Si ya pasó o es hoy, tomar el siguiente
      
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + diasHasta);
      proximosDias[dia] = formatDate(fecha);
    }

    const fechasReferencia = `
FECHAS DE REFERENCIA (usa estas fechas exactas):
- Hoy: ${formatDate(hoy)}
- Mañana: ${formatDate(mañana)}
- Pasado mañana: ${formatDate(pasadoMañana)}
- Próximo lunes: ${proximosDias.lunes}
- Próximo martes: ${proximosDias.martes}
- Próximo miércoles: ${proximosDias.miércoles}
- Próximo jueves: ${proximosDias.jueves}
- Próximo viernes: ${proximosDias.viernes}
- Próximo sábado: ${proximosDias.sábado}
- Próximo domingo: ${proximosDias.domingo}
`;

    // Verificar si la empresa tiene múltiples servicios
    const config = company.config as any;
    const hasMultipleServices = config?.services && Object.keys(config.services).length > 1;
    const servicesInfo = hasMultipleServices 
      ? `\n\nSERVICIOS DISPONIBLES:
Esta empresa ofrece múltiples servicios: ${Object.keys(config.services).join(', ')}
IMPORTANTE: El servicio es OBLIGATORIO. Si el usuario menciona alguno de estos servicios, extráelo en el campo "service".
Ejemplos: "limpieza dental" → service: "limpieza", "consulta odontológica" → service: "consulta"` 
      : '';

    const prompt = `Analiza este mensaje de un cliente y responde SOLO con un JSON válido (sin markdown, sin código, solo JSON):

Contexto: Cliente de ${company.name} (tipo: ${company.type})
Mensaje: "${message}"

${conversationHistory ? `Conversación previa:\n${conversationHistory}\n` : ''}
${currentStateInfo}

${fechasReferencia}
${servicesInfo}

INSTRUCCIONES:
- Si estamos en proceso de reserva (estado "collecting"), la intención debe ser "reservar"
- Extrae TODOS los datos que aparecen en el mensaje actual (fecha, hora, número de personas, teléfono, nombre${hasMultipleServices ? ', servicio' : ''})
- Para fechas: USA LAS FECHAS DE REFERENCIA de arriba. Si dice "viernes" usa la fecha de "Próximo viernes", si dice "mañana" usa la fecha de "Mañana"
- Para horas: convierte "4 PM" a "16:00", "4 de la tarde" a "16:00", "8 de la noche" o "8pm" a "20:00", "8 de la mañana" a "08:00"
- Para personas: extrae números como "4 personas", "somos 2", "para 3" → guests: 4, 2, 3
- Para teléfono: extrae números de 9 dígitos como "611223344" → phone: "611223344"${hasMultipleServices ? '\n- Para servicio: extrae el nombre del servicio mencionado (limpieza, consulta, ortodoncia, blanqueamiento, etc.)' : ''}
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
    "name": "string o null"${hasMultipleServices ? ',\n    "service": "string o null"' : ''}
  },
  "missingFields": ["fecha", "hora"${hasMultipleServices ? ', "servicio"' : ''}] o [],
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
        service: 'servicio',
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

