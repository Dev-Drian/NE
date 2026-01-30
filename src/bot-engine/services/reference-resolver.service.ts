import { Injectable, Logger } from '@nestjs/common';
import { TextUtilsService } from '../utils/text-utils.service';

/**
 * Tipos de referencias que el bot puede resolver
 */
export type ReferenceType = 
  | 'pronoun'      // "eso", "esto", "aquello"
  | 'repetition'   // "lo mismo", "igual", "otra vez"
  | 'ordinal'      // "el primero", "el segundo", "el anterior"
  | 'temporal'     // "mañana", "hoy", "la próxima semana"
  | 'confirmation' // "sí", "ok", "claro"
  | 'negation'     // "no", "mejor no", "cancela"
  | 'continuation' // "y también", "además", "aparte"
  | 'correction'   // "no, mejor", "quise decir", "me equivoqué"
  | 'none';

export interface ResolvedReference {
  type: ReferenceType;
  originalPhrase: string;
  resolvedValue?: any;
  confidence: number;
  contextUsed?: string;
}

export interface ConversationContext {
  lastBotQuestion?: string;
  lastUserIntent?: string;
  lastMentionedService?: string;
  lastMentionedProduct?: string;
  lastMentionedDate?: string;
  lastMentionedTime?: string;
  lastOptions?: string[]; // Opciones que el bot ofreció
  collectedData?: Record<string, any>;
  stage?: string;
}

/**
 * Servicio para resolver referencias anafóricas y contextuales
 * Permite al bot entender frases como "eso", "lo mismo", "el anterior"
 */
@Injectable()
export class ReferenceResolverService {
  private readonly logger = new Logger(ReferenceResolverService.name);

  constructor(private textUtils: TextUtilsService) {}

  /**
   * Patrones de referencia con sus tipos
   */
  private readonly referencePatterns: { pattern: RegExp; type: ReferenceType; priority: number }[] = [
    // Correcciones (alta prioridad)
    { pattern: /\b(no,?\s*mejor|quise decir|me equivoqu[eé]|perdón,?\s*era|corrijo)\b/i, type: 'correction', priority: 10 },
    
    // Negaciones
    { pattern: /^(no|nop|nel|nope|mejor no|no gracias|cancela|olvídalo|olvidalo)\s*$/i, type: 'negation', priority: 9 },
    
    // Confirmaciones
    { pattern: /^(s[ií]|ok|okay|vale|claro|exacto|correcto|eso|as[ií]|dale|perfecto|listo)\s*$/i, type: 'confirmation', priority: 8 },
    
    // Repeticiones
    { pattern: /\b(lo mismo|igual que|otra vez|de nuevo|como antes|como la vez pasada|repite|repetir)\b/i, type: 'repetition', priority: 7 },
    
    // Ordinales
    { pattern: /\b(el primero|la primera|el segundo|la segunda|el tercero|la tercera|el anterior|la anterior|el [uú]ltimo|la [uú]ltima)\b/i, type: 'ordinal', priority: 6 },
    
    // Pronombres demostrativos
    { pattern: /\b(eso|esto|aquello|ese|esta|aquel|esa)\b/i, type: 'pronoun', priority: 5 },
    
    // Continuaciones
    { pattern: /\b(y tambi[eé]n|adem[aá]s|aparte|y adem[aá]s|tambi[eé]n quiero|otro|otra)\b/i, type: 'continuation', priority: 4 },
    
    // Temporales (ya manejados por OpenAI, pero útil detectarlos)
    { pattern: /\b(ma[ñn]ana|hoy|pasado ma[ñn]ana|la pr[oó]xima semana|este fin de semana)\b/i, type: 'temporal', priority: 3 },
  ];

  /**
   * Detecta el tipo de referencia en un mensaje
   */
  detectReferenceType(message: string): { type: ReferenceType; match: string } | null {
    const normalized = this.textUtils.normalizeText(message);
    
    // Ordenar por prioridad descendente
    const sortedPatterns = [...this.referencePatterns].sort((a, b) => b.priority - a.priority);
    
    for (const { pattern, type } of sortedPatterns) {
      const match = normalized.match(pattern);
      if (match) {
        return { type, match: match[0] };
      }
    }
    
    return null;
  }

  /**
   * Resuelve una referencia usando el contexto de la conversación
   */
  resolveReference(
    message: string,
    context: ConversationContext,
  ): ResolvedReference {
    const detection = this.detectReferenceType(message);
    
    if (!detection) {
      return {
        type: 'none',
        originalPhrase: message,
        confidence: 0,
      };
    }

    const { type, match } = detection;
    let resolvedValue: any = undefined;
    let confidence = 0.5;
    let contextUsed: string | undefined;

    switch (type) {
      case 'confirmation':
        // "Sí" puede referirse a la última pregunta del bot
        if (context.lastBotQuestion) {
          contextUsed = 'lastBotQuestion';
          confidence = 0.9;
        }
        break;

      case 'negation':
        // "No" cancela o rechaza lo último
        if (context.lastBotQuestion) {
          contextUsed = 'lastBotQuestion';
          confidence = 0.9;
        }
        break;

      case 'pronoun':
        // "Eso" puede referirse a servicio, producto, fecha, etc.
        if (context.lastMentionedProduct) {
          resolvedValue = context.lastMentionedProduct;
          contextUsed = 'lastMentionedProduct';
          confidence = 0.8;
        } else if (context.lastMentionedService) {
          resolvedValue = context.lastMentionedService;
          contextUsed = 'lastMentionedService';
          confidence = 0.7;
        }
        break;

      case 'repetition':
        // "Lo mismo" se refiere a los datos de la última reservación
        if (context.collectedData && Object.keys(context.collectedData).length > 0) {
          resolvedValue = context.collectedData;
          contextUsed = 'collectedData';
          confidence = 0.85;
        }
        break;

      case 'ordinal':
        // "El primero", "el segundo" se refiere a las opciones ofrecidas
        if (context.lastOptions && context.lastOptions.length > 0) {
          const ordinalMap: Record<string, number> = {
            'primero': 0, 'primera': 0,
            'segundo': 1, 'segunda': 1,
            'tercero': 2, 'tercera': 2,
            'anterior': context.lastOptions.length - 2,
            'último': context.lastOptions.length - 1, 'ultima': context.lastOptions.length - 1,
          };
          
          const normalized = this.textUtils.normalizeText(match);
          for (const [key, index] of Object.entries(ordinalMap)) {
            if (normalized.includes(key) && context.lastOptions[index]) {
              resolvedValue = context.lastOptions[index];
              contextUsed = 'lastOptions';
              confidence = 0.9;
              break;
            }
          }
        }
        break;

      case 'correction':
        // El usuario quiere corregir algo - el valor viene después
        const afterCorrection = message.replace(/^.*?(no,?\s*mejor|quise decir|me equivoqu[eé]|perdón,?\s*era|corrijo)\s*/i, '').trim();
        if (afterCorrection) {
          resolvedValue = afterCorrection;
          contextUsed = 'correction';
          confidence = 0.95;
        }
        break;

      case 'continuation':
        // El usuario quiere agregar algo más
        contextUsed = 'continuation';
        confidence = 0.7;
        break;
    }

    return {
      type,
      originalPhrase: match,
      resolvedValue,
      confidence,
      contextUsed,
    };
  }

  /**
   * Enriquece el mensaje del usuario con el contexto resuelto
   * Útil para pasar a OpenAI un mensaje más completo
   */
  enrichMessageWithContext(
    message: string,
    context: ConversationContext,
  ): { enrichedMessage: string; wasEnriched: boolean; resolution: ResolvedReference } {
    const resolution = this.resolveReference(message, context);
    
    if (resolution.type === 'none' || !resolution.resolvedValue) {
      return {
        enrichedMessage: message,
        wasEnriched: false,
        resolution,
      };
    }

    let enrichedMessage = message;

    switch (resolution.type) {
      case 'pronoun':
        // Reemplazar "eso" por el valor resuelto
        enrichedMessage = message.replace(
          /\b(eso|esto|aquello)\b/i,
          `${resolution.resolvedValue} (${resolution.originalPhrase})`
        );
        break;

      case 'ordinal':
        // Reemplazar "el primero" por el valor
        enrichedMessage = message.replace(
          /\b(el primero|la primera|el segundo|la segunda|el tercero|la tercera|el anterior|el [uú]ltimo|la [uú]ltima)\b/i,
          `${resolution.resolvedValue}`
        );
        break;

      case 'correction':
        // Usar el valor corregido
        enrichedMessage = resolution.resolvedValue;
        break;

      case 'repetition':
        // Agregar nota de que quiere repetir
        if (typeof resolution.resolvedValue === 'object') {
          const dataStr = Object.entries(resolution.resolvedValue)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          enrichedMessage = `${message} [Quiere repetir: ${dataStr}]`;
        }
        break;
    }

    this.logger.debug(`🔗 Referencia resuelta: "${message}" → "${enrichedMessage}"`);

    return {
      enrichedMessage,
      wasEnriched: enrichedMessage !== message,
      resolution,
    };
  }

  /**
   * Extrae el contexto relevante del historial para usar en resolución
   */
  extractContextFromHistory(
    conversationHistory: { role: string; content: string }[],
    collectedData?: Record<string, any>,
    stage?: string,
  ): ConversationContext {
    const context: ConversationContext = {
      collectedData,
      stage,
    };

    // Obtener el último mensaje del bot (pregunta)
    const lastBotMessages = conversationHistory
      .filter(m => m.role === 'assistant')
      .slice(-2);
    
    if (lastBotMessages.length > 0) {
      context.lastBotQuestion = lastBotMessages[lastBotMessages.length - 1].content;
    }

    // Obtener la última intención del usuario
    const lastUserMessages = conversationHistory
      .filter(m => m.role === 'user')
      .slice(-3);

    // Buscar menciones de servicios, productos, fechas en mensajes recientes
    for (const msg of [...lastBotMessages, ...lastUserMessages].reverse()) {
      const content = msg.content.toLowerCase();
      
      // Buscar servicios mencionados
      if (!context.lastMentionedService) {
        if (content.includes('domicilio') || content.includes('delivery')) {
          context.lastMentionedService = 'domicilio';
        } else if (content.includes('mesa') || content.includes('restaurante')) {
          context.lastMentionedService = 'mesa';
        } else if (content.includes('cita') || content.includes('consulta')) {
          context.lastMentionedService = 'cita';
        }
      }

      // Extraer opciones si el bot las ofreció
      if (msg.role === 'assistant' && !context.lastOptions) {
        // Buscar patrones de lista (•, -, 1., etc.)
        const listMatch = content.match(/[•\-\d\.]\s*([^\n•\-]+)/g);
        if (listMatch && listMatch.length >= 2) {
          context.lastOptions = listMatch.map(item => 
            item.replace(/^[•\-\d\.]\s*/, '').trim()
          );
        }
      }
    }

    return context;
  }

  /**
   * Determina si el mensaje necesita contexto para ser entendido
   */
  needsContextResolution(message: string): boolean {
    const detection = this.detectReferenceType(message);
    
    if (!detection) return false;
    
    // Estos tipos siempre necesitan contexto
    const contextDependentTypes: ReferenceType[] = [
      'pronoun', 'repetition', 'ordinal', 'confirmation', 'negation'
    ];
    
    return contextDependentTypes.includes(detection.type);
  }
}
