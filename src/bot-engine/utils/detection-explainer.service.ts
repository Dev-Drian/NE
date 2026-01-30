import { Injectable, Logger } from '@nestjs/common';

/**
 * Resultado de la detección con explicación
 */
export interface ExplainedDetectionResult {
  /** Intención detectada */
  intention: string;
  
  /** Score de confianza (0-100) */
  confidence: number;
  
  /** Capa que detectó */
  layer: 'layer1_keywords' | 'layer2_similarity' | 'layer3_ai' | 'none';
  
  /** Explicación legible */
  explanation: string;
  
  /** Detalle técnico del proceso */
  technicalDetail: {
    /** Palabras clave encontradas */
    matchedKeywords?: string[];
    
    /** Score de similitud */
    similarityScore?: number;
    
    /** Mejor ejemplo coincidente */
    bestMatch?: string;
    
    /** Prompt usado en AI */
    aiPromptUsed?: boolean;
    
    /** Tokens consumidos */
    tokensUsed?: number;
    
    /** Tiempo de procesamiento (ms) */
    processingTimeMs: number;
    
    /** Capas intentadas */
    layersAttempted: string[];
    
    /** Razón de selección */
    selectionReason: string;
  };
  
  /** Alternativas consideradas */
  alternatives: Array<{
    intention: string;
    confidence: number;
    reason: string;
  }>;
  
  /** Sugerencias de mejora */
  improvementSuggestions?: string[];
}

/**
 * Servicio de Explicación de Detección
 * 
 * Proporciona explicaciones detalladas y legibles de por qué
 * el sistema detectó una intención específica.
 * 
 * Útil para:
 * - Debugging
 * - Logging detallado
 * - Dashboard de administración
 * - Auditoría de decisiones
 */
@Injectable()
export class DetectionExplainerService {
  private readonly logger = new Logger(DetectionExplainerService.name);

  /**
   * Genera una explicación para una detección de Layer1 (Keywords)
   */
  explainLayer1Detection(params: {
    intention: string;
    matchedKeywords: string[];
    totalKeywords: number;
    processingTimeMs: number;
  }): ExplainedDetectionResult {
    const { intention, matchedKeywords, totalKeywords, processingTimeMs } = params;
    
    // Calcular confianza basada en coincidencias
    const matchRatio = matchedKeywords.length / Math.max(totalKeywords, 1);
    const confidence = Math.min(95, Math.round(70 + (matchRatio * 25)));
    
    const keywordsList = matchedKeywords.join('", "');
    
    return {
      intention,
      confidence,
      layer: 'layer1_keywords',
      explanation: this.buildExplanation({
        layer: 'Keywords',
        main: `Se detectó la intención "${intention}" por coincidencia de palabras clave.`,
        details: `Las palabras "${keywordsList}" coinciden con las configuradas para esta intención.`,
        confidence: `Confianza: ${confidence}% (${matchedKeywords.length} de ${totalKeywords} keywords)`,
      }),
      technicalDetail: {
        matchedKeywords,
        processingTimeMs,
        layersAttempted: ['layer1_keywords'],
        selectionReason: `Coincidencia exacta con ${matchedKeywords.length} palabras clave`,
      },
      alternatives: [],
      improvementSuggestions: matchedKeywords.length < 2 
        ? ['Considerar agregar más sinónimos a las keywords'] 
        : undefined,
    };
  }

  /**
   * Genera una explicación para una detección de Layer2 (Similarity)
   */
  explainLayer2Detection(params: {
    intention: string;
    similarityScore: number;
    bestMatch: string;
    originalMessage: string;
    processingTimeMs: number;
    layersAttempted: string[];
  }): ExplainedDetectionResult {
    const { 
      intention, 
      similarityScore, 
      bestMatch, 
      originalMessage, 
      processingTimeMs,
      layersAttempted 
    } = params;
    
    // Convertir score de similitud a confianza
    const confidence = Math.round(similarityScore * 100);
    
    return {
      intention,
      confidence,
      layer: 'layer2_similarity',
      explanation: this.buildExplanation({
        layer: 'Similitud',
        main: `Se detectó la intención "${intention}" por similitud con ejemplos conocidos.`,
        details: `El mensaje es ${confidence}% similar a: "${bestMatch}"`,
        confidence: `Confianza: ${confidence}%`,
      }),
      technicalDetail: {
        similarityScore,
        bestMatch,
        processingTimeMs,
        layersAttempted,
        selectionReason: `Levenshtein similarity: ${(similarityScore * 100).toFixed(1)}%`,
      },
      alternatives: [],
      improvementSuggestions: similarityScore < 0.8 
        ? ['Agregar más ejemplos similares al mensaje del usuario']
        : undefined,
    };
  }

  /**
   * Genera una explicación para una detección de Layer3 (AI)
   */
  explainLayer3Detection(params: {
    intention: string;
    aiConfidence: number;
    originalMessage: string;
    processingTimeMs: number;
    tokensUsed?: number;
    layersAttempted: string[];
    provider: 'openai' | 'gemini';
  }): ExplainedDetectionResult {
    const { 
      intention, 
      aiConfidence, 
      originalMessage, 
      processingTimeMs,
      tokensUsed,
      layersAttempted,
      provider 
    } = params;
    
    const confidence = Math.min(90, aiConfidence); // AI nunca da 100%
    
    return {
      intention,
      confidence,
      layer: 'layer3_ai',
      explanation: this.buildExplanation({
        layer: `IA (${provider})`,
        main: `Se detectó la intención "${intention}" usando ${provider.toUpperCase()}.`,
        details: `El modelo de IA analizó el contexto semántico del mensaje.`,
        confidence: `Confianza: ${confidence}% (las capas 1 y 2 no pudieron clasificar)`,
      }),
      technicalDetail: {
        aiPromptUsed: true,
        tokensUsed,
        processingTimeMs,
        layersAttempted,
        selectionReason: `${provider} clasificación semántica`,
      },
      alternatives: [],
      improvementSuggestions: [
        'Considerar agregar keywords para este tipo de mensaje',
        'Agregar ejemplos similares para Layer2',
      ],
    };
  }

  /**
   * Genera una explicación cuando no se detectó intención
   */
  explainNoDetection(params: {
    originalMessage: string;
    processingTimeMs: number;
    layersAttempted: string[];
    closestMatch?: { intention: string; confidence: number };
  }): ExplainedDetectionResult {
    const { originalMessage, processingTimeMs, layersAttempted, closestMatch } = params;
    
    return {
      intention: 'unknown',
      confidence: 0,
      layer: 'none',
      explanation: this.buildExplanation({
        layer: 'Ninguna',
        main: 'No se pudo determinar la intención del mensaje.',
        details: `Se intentaron ${layersAttempted.length} capas de detección sin éxito.`,
        confidence: closestMatch 
          ? `La opción más cercana fue "${closestMatch.intention}" con ${closestMatch.confidence}% (insuficiente)`
          : 'No hubo coincidencias cercanas',
      }),
      technicalDetail: {
        processingTimeMs,
        layersAttempted,
        selectionReason: 'Ninguna capa alcanzó el umbral mínimo de confianza',
      },
      alternatives: closestMatch ? [{
        intention: closestMatch.intention,
        confidence: closestMatch.confidence,
        reason: 'Coincidencia parcial insuficiente',
      }] : [],
      improvementSuggestions: [
        'Agregar este mensaje como ejemplo de entrenamiento',
        'Revisar si es una intención nueva no contemplada',
        'Verificar ortografía del mensaje original',
      ],
    };
  }

  /**
   * Construye la explicación legible
   */
  private buildExplanation(parts: {
    layer: string;
    main: string;
    details: string;
    confidence: string;
  }): string {
    return [
      `🎯 **${parts.layer}**: ${parts.main}`,
      `📝 ${parts.details}`,
      `📊 ${parts.confidence}`,
    ].join('\n');
  }

  /**
   * Genera un resumen comparativo de múltiples detecciones
   */
  compareDetections(detections: ExplainedDetectionResult[]): string {
    if (detections.length === 0) return 'Sin detecciones para comparar';
    
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    
    let summary = '## Comparación de Detecciones\n\n';
    summary += '| Intención | Confianza | Capa | Razón |\n';
    summary += '|-----------|-----------|------|-------|\n';
    
    for (const d of sorted) {
      summary += `| ${d.intention} | ${d.confidence}% | ${d.layer} | ${d.technicalDetail.selectionReason} |\n`;
    }
    
    return summary;
  }

  /**
   * Genera log estructurado para debugging
   */
  logDetection(result: ExplainedDetectionResult, verbose = false): void {
    const emoji = this.getLayerEmoji(result.layer);
    const baseLog = `${emoji} [${result.layer}] "${result.intention}" (${result.confidence}%) - ${result.technicalDetail.processingTimeMs}ms`;
    
    if (verbose) {
      this.logger.debug(baseLog);
      this.logger.debug(`   └─ ${result.technicalDetail.selectionReason}`);
      if (result.improvementSuggestions?.length) {
        this.logger.debug(`   └─ 💡 Sugerencia: ${result.improvementSuggestions[0]}`);
      }
    } else {
      this.logger.debug(baseLog);
    }
  }

  private getLayerEmoji(layer: ExplainedDetectionResult['layer']): string {
    const emojis = {
      'layer1_keywords': '🔑',
      'layer2_similarity': '📐',
      'layer3_ai': '🤖',
      'none': '❓',
    };
    return emojis[layer] || '❓';
  }
}
