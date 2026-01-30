import { Injectable, Logger } from '@nestjs/common';
import { Layer3OpenAIService } from '../layers/layer3-openai.service';

/**
 * Resultado del self-check
 */
export interface SelfCheckResult {
  isCorrect: boolean;
  issues: string[];
  correctedResponse?: string;
  explanation?: string;
  satisfactionLevel?: 'satisfied' | 'frustrated' | 'confused' | 'neutral';
}

/**
 * 🔄 SELF CHECK SERVICE
 * 
 * Implementa auto-corrección después de generar una respuesta.
 * Similar a cómo ChatGPT revisa y corrige sus propias respuestas.
 * 
 * Responsabilidades:
 * 1. Verificar coherencia con el historial
 * 2. Detectar contradicciones
 * 3. Identificar información redundante
 * 4. Evaluar satisfacción del usuario
 * 5. Corregir respuestas problemáticas
 */
@Injectable()
export class SelfCheckService {
  private readonly logger = new Logger(SelfCheckService.name);

  constructor(
    private layer3: Layer3OpenAIService,
  ) {}

  /**
   * Verifica una respuesta antes de enviarla
   */
  async checkResponse(params: {
    proposedResponse: string;
    userMessage: string;
    conversationHistory: string[];
    collectedData: Record<string, any>;
    intention: string;
  }): Promise<SelfCheckResult> {
    const { proposedResponse, userMessage, conversationHistory, collectedData, intention } = params;

    const issues: string[] = [];
    let correctedResponse: string | undefined;

    // 1. Verificar redundancia (no pedir datos que ya tenemos)
    const redundancyCheck = this.checkForRedundancy(proposedResponse, collectedData);
    if (redundancyCheck.hasRedundancy) {
      issues.push(...redundancyCheck.issues);
      correctedResponse = this.removeRedundantQuestions(proposedResponse, redundancyCheck.redundantFields);
    }

    // 2. Verificar contradicciones con historial
    const contradictionCheck = this.checkForContradictions(
      proposedResponse, 
      conversationHistory
    );
    if (contradictionCheck.hasContradiction) {
      issues.push(...contradictionCheck.issues);
    }

    // 3. Verificar coherencia con la intención
    const coherenceCheck = this.checkIntentionCoherence(proposedResponse, intention, userMessage);
    if (!coherenceCheck.isCoherent) {
      issues.push(coherenceCheck.issue!);
    }

    // 4. Verificar tono y longitud apropiados
    const toneCheck = this.checkToneAndLength(proposedResponse, userMessage);
    issues.push(...toneCheck.issues);

    // 5. Verificar respuesta vacía o genérica
    if (this.isEmptyOrGeneric(proposedResponse)) {
      issues.push('Respuesta demasiado genérica o vacía');
    }

    const isCorrect = issues.length === 0;

    this.logger.debug(`🔄 Self-check: ${isCorrect ? 'PASS' : 'ISSUES'} - ${issues.join(', ')}`);

    return {
      isCorrect,
      issues,
      correctedResponse: correctedResponse || (isCorrect ? undefined : proposedResponse),
      explanation: issues.length > 0 ? `Problemas detectados: ${issues.join('; ')}` : undefined,
    };
  }

  /**
   * Detecta nivel de satisfacción del usuario basado en su mensaje
   */
  detectSatisfaction(userMessage: string, conversationHistory: string[]): {
    level: 'satisfied' | 'frustrated' | 'confused' | 'neutral';
    confidence: number;
    indicators: string[];
  } {
    const normalizedMessage = userMessage.toLowerCase();
    const indicators: string[] = [];
    let level: 'satisfied' | 'frustrated' | 'confused' | 'neutral' = 'neutral';
    let confidence = 0.5;

    // Indicadores de satisfacción
    const satisfiedPatterns = [
      /gracias|genial|perfecto|excelente|bueno|listo|ok|vale/i,
      /eso es todo|nada más|estoy bien/i,
      /👍|😊|🙏|❤️|👏/,
    ];

    // Indicadores de frustración
    const frustratedPatterns = [
      /no me sirve|no funciona|no entiendes|otra vez/i,
      /ya te dije|te lo dije|repito/i,
      /😤|😡|🙄|😒/,
      /\?\?+|!{2,}/,
    ];

    // Indicadores de confusión
    const confusedPatterns = [
      /no entiendo|no entendí|cómo|qué significa|a qué te refieres/i,
      /perdón|disculpa|eh\?|qué\?/i,
      /🤔|😕|❓/,
    ];

    // Evaluar satisfacción
    for (const pattern of satisfiedPatterns) {
      if (pattern.test(normalizedMessage)) {
        indicators.push('Expresión de satisfacción detectada');
        level = 'satisfied';
        confidence = 0.8;
        break;
      }
    }

    // Evaluar frustración (tiene prioridad)
    for (const pattern of frustratedPatterns) {
      if (pattern.test(normalizedMessage)) {
        indicators.push('Expresión de frustración detectada');
        level = 'frustrated';
        confidence = 0.85;
        break;
      }
    }

    // Evaluar confusión
    for (const pattern of confusedPatterns) {
      if (pattern.test(normalizedMessage)) {
        indicators.push('Expresión de confusión detectada');
        level = 'confused';
        confidence = 0.75;
        break;
      }
    }

    // Verificar patrones en historial reciente
    if (conversationHistory.length >= 3) {
      const recentHistory = conversationHistory.slice(-3).join(' ');
      
      // Si el usuario repite algo, puede estar frustrado
      const userMessages = conversationHistory.filter((_, i) => i % 2 === 0);
      const lastTwoUser = userMessages.slice(-2);
      if (lastTwoUser.length === 2 && 
          this.messageSimilarity(lastTwoUser[0], lastTwoUser[1]) > 0.6) {
        indicators.push('Usuario repitiendo información');
        if (level === 'neutral') {
          level = 'frustrated';
          confidence = 0.7;
        }
      }

      // Si la conversación es muy larga para una tarea simple
      if (conversationHistory.length > 10) {
        indicators.push('Conversación prolongada');
        if (level === 'neutral') {
          level = 'frustrated';
          confidence = 0.6;
        }
      }
    }

    return { level, confidence, indicators };
  }

  /**
   * Verifica si estamos pidiendo información que ya tenemos
   */
  private checkForRedundancy(response: string, collectedData: Record<string, any>): {
    hasRedundancy: boolean;
    issues: string[];
    redundantFields: string[];
  } {
    const issues: string[] = [];
    const redundantFields: string[] = [];
    const normalizedResponse = response.toLowerCase();

    // Mapeo de campos a patrones de pregunta
    const fieldPatterns: Record<string, RegExp[]> = {
      date: [/qué fecha|para cuándo|qué día|cuál día/i],
      time: [/qué hora|a qué hora|para qué hora/i],
      guests: [/cuántas personas|para cuántos|cuántos comensales/i],
      phone: [/tu teléfono|número de contacto|tu número/i],
      service: [/qué servicio|cuál servicio|qué tipo de/i],
      name: [/tu nombre|cómo te llamas/i],
    };

    for (const [field, patterns] of Object.entries(fieldPatterns)) {
      if (collectedData[field]) {
        for (const pattern of patterns) {
          if (pattern.test(normalizedResponse)) {
            issues.push(`Preguntando ${field} que ya tenemos: ${collectedData[field]}`);
            redundantFields.push(field);
            break;
          }
        }
      }
    }

    return {
      hasRedundancy: issues.length > 0,
      issues,
      redundantFields,
    };
  }

  /**
   * Elimina preguntas redundantes de la respuesta
   */
  private removeRedundantQuestions(response: string, redundantFields: string[]): string {
    let cleaned = response;

    const removalPatterns: Record<string, RegExp> = {
      date: /\s*¿(?:qué|para qué|cuál) (?:fecha|día)[^?]*\?\s*/gi,
      time: /\s*¿(?:a qué|para qué) hora[^?]*\?\s*/gi,
      guests: /\s*¿(?:cuántas|para cuántos) personas[^?]*\?\s*/gi,
      phone: /\s*¿(?:cuál es )?tu (?:teléfono|número)[^?]*\?\s*/gi,
    };

    for (const field of redundantFields) {
      if (removalPatterns[field]) {
        cleaned = cleaned.replace(removalPatterns[field], ' ');
      }
    }

    return cleaned.trim();
  }

  /**
   * Verifica contradicciones con el historial
   */
  private checkForContradictions(
    response: string, 
    history: string[]
  ): {
    hasContradiction: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    if (history.length < 2) {
      return { hasContradiction: false, issues: [] };
    }

    // Buscar cambios de información sin explicación
    const recentBotResponses = history.filter((_, i) => i % 2 === 1).slice(-3);
    
    // Patrones de contradicción
    const contradictionPatterns = [
      // Si antes dijimos disponible y ahora no disponible
      { before: /sí.*disponib|hay disponib/i, after: /no.*disponib|sin disponib/i },
      // Si antes confirmamos y ahora negamos
      { before: /confirmad|reservad|listo/i, after: /no pud|no hay|cancelad/i },
    ];

    for (const pattern of contradictionPatterns) {
      const hadBefore = recentBotResponses.some(r => pattern.before.test(r));
      const hasAfter = pattern.after.test(response);
      
      if (hadBefore && hasAfter) {
        issues.push('Posible contradicción con respuesta anterior');
        break;
      }
    }

    return {
      hasContradiction: issues.length > 0,
      issues,
    };
  }

  /**
   * Verifica coherencia entre respuesta e intención
   */
  private checkIntentionCoherence(
    response: string, 
    intention: string, 
    userMessage: string
  ): {
    isCoherent: boolean;
    issue?: string;
  } {
    const normalizedResponse = response.toLowerCase();
    const normalizedMessage = userMessage.toLowerCase();

    // Si la intención es consultar pero respondemos con confirmación de reserva
    if (intention === 'consultar' && 
        /reserva confirmada|te reservé|está reservado/i.test(normalizedResponse)) {
      return {
        isCoherent: false,
        issue: 'Respuesta de reserva para intención de consulta',
      };
    }

    // Si el usuario pregunta por el menú pero no mostramos productos
    if (normalizedMessage.includes('menú') || normalizedMessage.includes('carta')) {
      if (intention === 'consultar' && 
          !normalizedResponse.includes('$') && 
          !normalizedResponse.includes('menú') &&
          !normalizedResponse.includes('producto')) {
        return {
          isCoherent: false,
          issue: 'Usuario pidió menú pero no se mostró',
        };
      }
    }

    return { isCoherent: true };
  }

  /**
   * Verifica tono y longitud de la respuesta
   */
  private checkToneAndLength(response: string, userMessage: string): {
    issues: string[];
  } {
    const issues: string[] = [];

    // Respuesta muy corta para un mensaje detallado
    if (userMessage.length > 100 && response.length < 30) {
      issues.push('Respuesta muy corta para mensaje detallado del usuario');
    }

    // Respuesta muy larga para un mensaje simple
    if (userMessage.length < 20 && response.length > 500) {
      issues.push('Respuesta demasiado extensa para mensaje simple');
    }

    // Verificar si es muy robótica
    const roboticPatterns = [
      /por favor proporcione/i,
      /la información solicitada/i,
      /no se ha proporcionado/i,
      /datos insuficientes/i,
    ];

    for (const pattern of roboticPatterns) {
      if (pattern.test(response)) {
        issues.push('Tono demasiado robótico');
        break;
      }
    }

    return { issues };
  }

  /**
   * Verifica si la respuesta es vacía o demasiado genérica
   */
  private isEmptyOrGeneric(response: string): boolean {
    const genericResponses = [
      'no entendí',
      'puedes reformular',
      '¿en qué puedo ayudarte?',
      'no estoy seguro',
    ];

    const normalized = response.toLowerCase().trim();
    
    if (normalized.length < 10) return true;
    
    return genericResponses.some(g => normalized.includes(g) && normalized.length < 50);
  }

  /**
   * Calcula similitud entre dos mensajes (para detectar repeticiones)
   */
  private messageSimilarity(msg1: string, msg2: string): number {
    const words1 = new Set(msg1.toLowerCase().split(/\s+/));
    const words2 = new Set(msg2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  /**
   * Sugiere acción correctiva basada en satisfacción
   */
  getSuggestedAction(satisfactionLevel: 'satisfied' | 'frustrated' | 'confused' | 'neutral'): string {
    const actions: Record<typeof satisfactionLevel, string> = {
      satisfied: 'Continuar normalmente, ofrecer ayuda adicional si aplica',
      frustrated: 'Simplificar respuestas, ofrecer opciones claras, considerar transferir a humano',
      confused: 'Reformular explicación, usar ejemplos, ofrecer guía paso a paso',
      neutral: 'Continuar con el flujo normal de conversación',
    };

    return actions[satisfactionLevel];
  }
}
