import { Injectable, Logger } from '@nestjs/common';
import { DetectionResult } from '../dto/detection-result.dto';
import { DateHelper } from '../../common/date-helper';
import { Company } from '@prisma/client';

/**
 * Resultado del proceso de razonamiento
 */
export interface ReasoningResult {
  /** Decisión tomada: proceder, preguntar, corregir, clarificar */
  decision: 'proceed' | 'ask_clarification' | 'correct_assumption' | 'suggest_alternative';
  
  /** Nivel de confianza en la decisión (0-1) */
  confidence: number;
  
  /** Razones del razonamiento (para debugging y transparencia) */
  reasoning: string[];
  
  /** Datos corregidos o enriquecidos */
  enrichedData: Record<string, any>;
  
  /** Preguntas a hacer al usuario si decision !== 'proceed' */
  clarificationNeeded?: string;
  
  /** Sugerencia alternativa si aplica */
  alternativeSuggestion?: string;
  
  /** Advertencias detectadas */
  warnings: string[];
  
  /** Contexto adicional para el handler */
  handlerContext: {
    shouldAskBeforeAssuming: boolean;
    userSeemConfused: boolean;
    hasConflictingData: boolean;
    conversationMomentum: 'starting' | 'flowing' | 'stuck' | 'ending';
  };
}

/**
 * Contexto de entrada para el razonamiento
 */
export interface ReasoningInput {
  detection: DetectionResult;
  message: string;
  company: Company;
  conversationContext: any;
  userMemory?: any;
}

/**
 * 🧠 REASONING ENGINE SERVICE
 * 
 * Esta capa transforma el bot de "reactivo" a "pensante".
 * 
 * En lugar de: Detectar → Handler → Responder
 * Ahora es:    Detectar → RAZONAR → Handler → Responder
 * 
 * Responsabilidades:
 * 1. Validar supuestos antes de actuar
 * 2. Resolver ambigüedades
 * 3. Decidir si preguntar o actuar
 * 4. Detectar inconsistencias
 * 5. Enriquecer datos con inferencias lógicas
 * 6. Evaluar el "momentum" conversacional
 */
@Injectable()
export class ReasoningEngineService {
  private readonly logger = new Logger(ReasoningEngineService.name);

  /**
   * Proceso principal de razonamiento
   */
  async reason(input: ReasoningInput): Promise<ReasoningResult> {
    const { detection, message, company, conversationContext, userMemory } = input;
    
    const reasoning: string[] = [];
    const warnings: string[] = [];
    let decision: ReasoningResult['decision'] = 'proceed';
    let clarificationNeeded: string | undefined;
    let alternativeSuggestion: string | undefined;
    const enrichedData = { ...detection.extractedData };

    // 1. ANALIZAR AMBIGÜEDADES TEMPORALES
    const temporalAnalysis = this.analyzeTemporalAmbiguity(detection, message);
    reasoning.push(...temporalAnalysis.reasoning);
    if (temporalAnalysis.needsClarification) {
      decision = 'ask_clarification';
      clarificationNeeded = temporalAnalysis.question;
    }
    if (temporalAnalysis.enrichedData) {
      Object.assign(enrichedData, temporalAnalysis.enrichedData);
    }

    // 2. VALIDAR COHERENCIA DE DATOS
    const coherenceCheck = this.checkDataCoherence(detection, conversationContext);
    reasoning.push(...coherenceCheck.reasoning);
    warnings.push(...coherenceCheck.warnings);
    if (coherenceCheck.hasConflict && decision === 'proceed') {
      decision = 'correct_assumption';
      clarificationNeeded = coherenceCheck.conflictQuestion;
    }

    // 3. EVALUAR CONTEXTO DEL NEGOCIO
    const businessContext = await this.evaluateBusinessContext(detection, company);
    reasoning.push(...businessContext.reasoning);
    if (businessContext.suggestion && decision === 'proceed') {
      alternativeSuggestion = businessContext.suggestion;
      if (businessContext.shouldSuggest) {
        decision = 'suggest_alternative';
      }
    }

    // 4. INFERIR INTENCIÓN REAL vs LITERAL
    const intentInference = this.inferRealIntent(detection, message, conversationContext);
    reasoning.push(...intentInference.reasoning);
    if (intentInference.correctedIntention) {
      enrichedData._inferredIntention = intentInference.correctedIntention;
    }

    // 5. ANALIZAR MOMENTUM CONVERSACIONAL
    const momentum = this.analyzeConversationMomentum(conversationContext, message);
    reasoning.push(`Momentum conversacional: ${momentum}`);

    // 6. DETECTAR SI USUARIO ESTÁ CONFUNDIDO
    const userConfusion = this.detectUserConfusion(message, conversationContext);
    reasoning.push(...userConfusion.reasoning);

    // 7. APLICAR MEMORIA DEL USUARIO (si existe)
    if (userMemory) {
      const memoryInsights = this.applyUserMemory(userMemory, detection, enrichedData);
      reasoning.push(...memoryInsights.reasoning);
      Object.assign(enrichedData, memoryInsights.enrichedData);
    }

    // Calcular confianza final
    const confidence = this.calculateReasoningConfidence(
      detection.confidence,
      reasoning.length,
      warnings.length,
      decision
    );

    this.logger.debug(`🧠 Reasoning completed: decision=${decision}, confidence=${confidence}`);
    this.logger.debug(`   Reasoning steps: ${reasoning.join(' | ')}`);

    return {
      decision,
      confidence,
      reasoning,
      enrichedData,
      clarificationNeeded,
      alternativeSuggestion,
      warnings,
      handlerContext: {
        shouldAskBeforeAssuming: decision !== 'proceed',
        userSeemConfused: userConfusion.isConfused,
        hasConflictingData: coherenceCheck.hasConflict,
        conversationMomentum: momentum,
      },
    };
  }

  /**
   * Analiza ambigüedades temporales
   * "mañana en la tarde" → ¿qué hora exacta?
   * "el viernes" → ¿este viernes o el próximo?
   */
  private analyzeTemporalAmbiguity(detection: DetectionResult, message: string): {
    reasoning: string[];
    needsClarification: boolean;
    question?: string;
    enrichedData?: Record<string, any>;
  } {
    const reasoning: string[] = [];
    const extracted = detection.extractedData || {};
    const normalizedMessage = message.toLowerCase();

    // Detectar expresiones ambiguas
    const ambiguousTimeExpressions = [
      { pattern: /en la (mañana|tarde|noche)/, type: 'time_of_day' },
      { pattern: /temprano|al mediodía|a medio día/, type: 'vague_time' },
      { pattern: /pronto|después|más tarde|luego/, type: 'relative_time' },
    ];

    for (const expr of ambiguousTimeExpressions) {
      if (expr.pattern.test(normalizedMessage)) {
        reasoning.push(`Detectada expresión temporal ambigua: ${expr.type}`);
        
        // Si tenemos fecha pero no hora específica
        if (extracted.date && !extracted.time) {
          // Intentar inferir rango horario
          const timeRange = this.inferTimeRange(normalizedMessage);
          if (timeRange) {
            reasoning.push(`Inferido rango horario: ${timeRange.start}-${timeRange.end}`);
            return {
              reasoning,
              needsClarification: true,
              question: `¿A qué hora te gustaría? Tenemos disponibilidad ${timeRange.description}`,
              enrichedData: { _inferredTimeRange: timeRange },
            };
          }
        }
      }
    }

    // Verificar si "viernes" es este o el próximo
    if (/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/i.test(normalizedMessage)) {
      if (!normalizedMessage.includes('próximo') && !normalizedMessage.includes('este')) {
        const dayMentioned = normalizedMessage.match(/\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b/i)?.[1];
        reasoning.push(`Día mencionado sin especificar semana: ${dayMentioned}`);
        // No preguntar si ya extrajimos la fecha correctamente
        if (!extracted.date) {
          return {
            reasoning,
            needsClarification: true,
            question: `¿Te refieres a este ${dayMentioned} o al próximo?`,
          };
        }
      }
    }

    reasoning.push('Sin ambigüedades temporales detectadas');
    return { reasoning, needsClarification: false };
  }

  /**
   * Infiere rango horario basado en expresiones coloquiales
   */
  private inferTimeRange(message: string): { start: string; end: string; description: string } | null {
    if (message.includes('mañana') || message.includes('temprano')) {
      return { start: '08:00', end: '12:00', description: 'en la mañana (8am - 12pm)' };
    }
    if (message.includes('tarde')) {
      return { start: '14:00', end: '18:00', description: 'en la tarde (2pm - 6pm)' };
    }
    if (message.includes('noche')) {
      return { start: '18:00', end: '21:00', description: 'en la noche (6pm - 9pm)' };
    }
    if (message.includes('mediodía') || message.includes('medio día')) {
      return { start: '12:00', end: '14:00', description: 'al mediodía (12pm - 2pm)' };
    }
    return null;
  }

  /**
   * Verifica coherencia de datos extraídos vs contexto
   */
  private checkDataCoherence(detection: DetectionResult, context: any): {
    reasoning: string[];
    warnings: string[];
    hasConflict: boolean;
    conflictQuestion?: string;
  } {
    const reasoning: string[] = [];
    const warnings: string[] = [];
    let hasConflict = false;
    let conflictQuestion: string | undefined;

    const extracted = detection.extractedData || {};
    const collected = context?.collectedData || {};

    // Verificar si hay datos nuevos que contradicen los anteriores
    if (collected.date && extracted.date && collected.date !== extracted.date) {
      reasoning.push(`Conflicto de fecha: anterior=${collected.date}, nuevo=${extracted.date}`);
      hasConflict = true;
      conflictQuestion = `Veo que antes mencionaste ${DateHelper.formatDateReadable(collected.date)}, pero ahora dices ${DateHelper.formatDateReadable(extracted.date)}. ¿Cuál fecha prefieres?`;
    }

    if (collected.time && extracted.time && collected.time !== extracted.time) {
      reasoning.push(`Conflicto de hora: anterior=${collected.time}, nuevo=${extracted.time}`);
      hasConflict = true;
      conflictQuestion = `Antes dijiste ${collected.time}, pero ahora mencionas ${extracted.time}. ¿A qué hora te acomoda mejor?`;
    }

    if (collected.guests && extracted.guests && collected.guests !== extracted.guests) {
      reasoning.push(`Conflicto de comensales: anterior=${collected.guests}, nuevo=${extracted.guests}`);
      warnings.push('Número de personas cambió durante la conversación');
    }

    if (!hasConflict) {
      reasoning.push('Datos coherentes con contexto previo');
    }

    return { reasoning, warnings, hasConflict, conflictQuestion };
  }

  /**
   * Evalúa contexto del negocio (horarios, disponibilidad, restricciones)
   */
  private async evaluateBusinessContext(detection: DetectionResult, company: Company): Promise<{
    reasoning: string[];
    suggestion?: string;
    shouldSuggest: boolean;
  }> {
    const reasoning: string[] = [];
    const config = company.config as any;
    const extracted = detection.extractedData || {};

    // Verificar si la fecha/hora está dentro del horario del negocio
    if (extracted.date && extracted.time) {
      // IMPORTANTE: Usar formato local para evitar problemas de timezone
      // new Date('2026-02-03') sin hora se interpreta como UTC, causando días incorrectos
      const [year, month, day] = extracted.date.split('-').map(Number);
      const localDate = new Date(year, month - 1, day); // Crear fecha en timezone local
      const dayOfWeek = localDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const businessHours = config?.hours?.[dayOfWeek];

      if (!businessHours) {
        reasoning.push(`El negocio no opera el ${dayOfWeek}`);
        return {
          reasoning,
          suggestion: `Lo siento, no abrimos ese día. ¿Te gustaría elegir otro día?`,
          shouldSuggest: true,
        };
      }

      // Verificar si la hora está dentro del rango
      // NOTA: Comparación de strings HH:MM funciona lexicográficamente (ej: "19:00" > "12:00" y < "22:00")
      const [openTime, closeTime] = businessHours.split('-').map((t: string) => t.trim());
      const extractedTime = extracted.time; // Ya debe estar en formato HH:MM
      
      // Verificar formato válido antes de comparar
      if (extractedTime && /^\d{2}:\d{2}$/.test(extractedTime)) {
        if (extractedTime < openTime || extractedTime > closeTime) {
          reasoning.push(`Hora ${extractedTime} fuera del horario ${businessHours}`);
          return {
            reasoning,
            suggestion: `Ese horario está fuera de nuestro horario de atención (${businessHours}). ¿Te parece otra hora?`,
            shouldSuggest: true,
          };
        }
      } else {
        reasoning.push(`Formato de hora no válido: ${extractedTime}, saltando validación de horario`);
      }
    }

    // Verificar capacidad si se mencionan muchas personas
    if (extracted.guests && extracted.guests > 10) {
      reasoning.push(`Grupo grande detectado: ${extracted.guests} personas`);
      return {
        reasoning,
        suggestion: `Para grupos de ${extracted.guests} personas, te recomiendo contactarnos directamente para asegurar disponibilidad.`,
        shouldSuggest: true,
      };
    }

    reasoning.push('Contexto de negocio validado');
    return { reasoning, shouldSuggest: false };
  }

  /**
   * Infiere la intención real vs la literal
   * "¿Tienen disponibilidad mañana?" → ¿consulta o quiere reservar?
   */
  private inferRealIntent(detection: DetectionResult, message: string, context: any): {
    reasoning: string[];
    correctedIntention?: string;
  } {
    const reasoning: string[] = [];
    const normalizedMessage = message.toLowerCase();

    // Si pregunta disponibilidad pero ya tiene datos, probablemente quiere reservar
    if (detection.intention === 'consultar') {
      const hasReservationData = 
        detection.extractedData?.date ||
        detection.extractedData?.time ||
        detection.extractedData?.guests;

      // Patrones que sugieren intención de reservar aunque pregunte
      const reservationPatterns = [
        /quiero|necesito|me gustar[ií]a|quisiera/i,
        /para \d+ personas/i,
        /reserv/i,
        /cita|mesa|turno/i,
      ];

      const seemsLikeReservation = reservationPatterns.some(p => p.test(normalizedMessage));

      if (hasReservationData && seemsLikeReservation) {
        reasoning.push('Usuario pregunta pero parece querer reservar');
        return {
          reasoning,
          correctedIntention: 'reservar',
        };
      }

      // Si está en contexto de collecting, mantener la intención de reservar
      if (context?.stage === 'collecting') {
        reasoning.push('En proceso de reserva, manteniendo intención');
        return {
          reasoning,
          correctedIntention: 'reservar',
        };
      }
    }

    reasoning.push('Intención literal parece correcta');
    return { reasoning };
  }

  /**
   * Analiza el momentum de la conversación
   */
  private analyzeConversationMomentum(context: any, message: string): ReasoningResult['handlerContext']['conversationMomentum'] {
    const historyLength = context?.conversationHistory?.length || 0;
    const stage = context?.stage || 'idle';
    const normalizedMessage = message.toLowerCase();

    // Detectar inicio de conversación
    if (historyLength <= 1 || /^(hola|buenos|buenas|hey|hi)/i.test(normalizedMessage)) {
      return 'starting';
    }

    // Detectar fin de conversación
    if (/gracias|adios|adiós|chao|bye|hasta luego/i.test(normalizedMessage)) {
      return 'ending';
    }

    // Detectar si está estancado (muchos mensajes en collecting)
    if (stage === 'collecting' && historyLength > 6) {
      return 'stuck';
    }

    return 'flowing';
  }

  /**
   * Detecta si el usuario parece confundido
   */
  private detectUserConfusion(message: string, context: any): {
    reasoning: string[];
    isConfused: boolean;
  } {
    const reasoning: string[] = [];
    const normalizedMessage = message.toLowerCase();

    // Indicadores de confusión
    const confusionPatterns = [
      /no entiendo|no entendí|cómo|como así|qué significa|a qué te refieres/i,
      /perdón|perdona|disculpa.*no/i,
      /\?\s*\?|\?{2,}/,  // Múltiples signos de interrogación
      /eh\?|ah\?|qué\?/i,
    ];

    const isConfused = confusionPatterns.some(p => p.test(normalizedMessage));

    if (isConfused) {
      reasoning.push('Usuario parece confundido');
    }

    // Verificar si ha cambiado de tema abruptamente
    if (context?.lastIntention && 
        context.lastIntention !== 'otro' &&
        normalizedMessage.length < 10) {
      reasoning.push('Mensaje muy corto, posible confusión');
    }

    return {
      reasoning,
      isConfused,
    };
  }

  /**
   * Aplica insights de la memoria del usuario
   */
  private applyUserMemory(memory: any, detection: DetectionResult, currentData: Record<string, any>): {
    reasoning: string[];
    enrichedData: Record<string, any>;
  } {
    const reasoning: string[] = [];
    const enrichedData: Record<string, any> = {};

    // Si el usuario tiene un servicio favorito y no especificó
    if (memory.frequentServices?.length > 0 && !currentData.service) {
      const favoriteService = memory.frequentServices[0];
      reasoning.push(`Usuario frecuentemente usa: ${favoriteService}`);
      enrichedData._suggestedService = favoriteService;
    }

    // Si el usuario tiene hora preferida
    if (memory.preferences?.preferredTime && !currentData.time) {
      reasoning.push(`Usuario prefiere horario: ${memory.preferences.preferredTime}`);
      enrichedData._suggestedTime = memory.preferences.preferredTime;
    }

    // Si el usuario tiene un patrón (ej: siempre reserva viernes)
    if (memory.patterns?.preferredDay && !currentData.date) {
      reasoning.push(`Patrón detectado: prefiere ${memory.patterns.preferredDay}`);
    }

    return { reasoning, enrichedData };
  }

  /**
   * Calcula confianza final del razonamiento
   */
  private calculateReasoningConfidence(
    detectionConfidence: number,
    reasoningSteps: number,
    warningsCount: number,
    decision: ReasoningResult['decision']
  ): number {
    let confidence = detectionConfidence;

    // Más razonamiento = más confianza (hasta cierto punto)
    confidence += Math.min(reasoningSteps * 0.02, 0.1);

    // Warnings reducen confianza
    confidence -= warningsCount * 0.05;

    // Si decidimos preguntar, la confianza es menor (porque hay incertidumbre)
    if (decision !== 'proceed') {
      confidence *= 0.8;
    }

    return Math.max(0, Math.min(1, confidence));
  }
}
