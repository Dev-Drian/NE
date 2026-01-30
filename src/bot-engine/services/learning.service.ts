import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';

interface LearningEntry {
  originalMessage: string;
  normalizedMessage: string;
  detectedIntention: string;
  correctIntention?: string; // Si fue corregido manualmente
  confidence: number;
  detectionLayer: string;
  wasCorrect: boolean;
  extractedEntities?: Record<string, any>;
  companyId: string;
  timestamp: Date;
}

interface PatternCandidate {
  pattern: string;
  intention: string;
  frequency: number;
  avgConfidence: number;
  companyId: string;
}

interface LearningStats {
  totalLearned: number;
  patternsDiscovered: number;
  correctionsApplied: number;
  accuracyImprovement: number;
}

/**
 * Servicio de Aprendizaje Automático para el Bot
 * 
 * Características:
 * - Aprende de conversaciones exitosas
 * - Detecta patrones recurrentes que van a Layer3
 * - Sugiere nuevos keywords para Layer1/Layer2
 * - Retroalimenta las capas inferiores
 * 
 * Flujo de aprendizaje:
 * 1. Layer3 detecta intención con alta confianza
 * 2. El servicio registra el mensaje y la detección
 * 3. Si un patrón aparece >5 veces, se sugiere agregarlo a L1
 * 4. Admin puede aprobar/rechazar sugerencias
 */
@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);
  
  // Buffer de mensajes para análisis (en memoria, se procesa periódicamente)
  private learningBuffer: LearningEntry[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly MIN_FREQUENCY_FOR_SUGGESTION = 5;
  
  // Cache de patrones aprendidos pendientes de aprobación
  private pendingPatterns: Map<string, PatternCandidate> = new Map();
  
  // Estadísticas
  private stats: LearningStats = {
    totalLearned: 0,
    patternsDiscovered: 0,
    correctionsApplied: 0,
    accuracyImprovement: 0,
  };

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Registra una detección para aprendizaje
   * Se llama después de cada processMessage exitoso
   */
  async recordDetection(entry: LearningEntry): Promise<void> {
    this.learningBuffer.push(entry);
    this.stats.totalLearned++;
    
    // Si el buffer está lleno, procesar
    if (this.learningBuffer.length >= this.BUFFER_SIZE) {
      await this.processLearningBuffer();
    }
    
    // Si la detección fue por Layer3 con alta confianza, es candidato para L1
    if (entry.detectionLayer === 'layer3' && entry.confidence >= 0.85) {
      await this.analyzeForLayer1Pattern(entry);
    }
  }

  /**
   * Analiza si un mensaje podría convertirse en patrón de Layer1
   */
  private async analyzeForLayer1Pattern(entry: LearningEntry): Promise<void> {
    // Extraer keywords del mensaje
    const keywords = this.extractPotentialKeywords(entry.normalizedMessage);
    
    for (const keyword of keywords) {
      const patternKey = `${entry.companyId}:${entry.detectedIntention}:${keyword}`;
      
      if (this.pendingPatterns.has(patternKey)) {
        const existing = this.pendingPatterns.get(patternKey)!;
        existing.frequency++;
        existing.avgConfidence = (existing.avgConfidence + entry.confidence) / 2;
      } else {
        this.pendingPatterns.set(patternKey, {
          pattern: keyword,
          intention: entry.detectedIntention,
          frequency: 1,
          avgConfidence: entry.confidence,
          companyId: entry.companyId,
        });
      }
      
      // Si alcanzó el umbral, sugerir como nuevo patrón
      const candidate = this.pendingPatterns.get(patternKey)!;
      if (candidate.frequency >= this.MIN_FREQUENCY_FOR_SUGGESTION) {
        await this.suggestNewPattern(candidate);
        this.pendingPatterns.delete(patternKey);
      }
    }
  }

  /**
   * Extrae palabras clave potenciales de un mensaje
   */
  private extractPotentialKeywords(message: string): string[] {
    // Limpiar y normalizar
    const cleaned = message.toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, '')
      .trim();
    
    // Dividir en palabras y n-gramas
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);
    const keywords: string[] = [];
    
    // Palabras individuales significativas
    const stopWords = new Set(['para', 'que', 'con', 'por', 'una', 'uno', 'los', 'las', 'del']);
    words.forEach(word => {
      if (!stopWords.has(word) && word.length >= 4) {
        keywords.push(word);
      }
    });
    
    // Bigramas (pares de palabras)
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length >= 6) {
        keywords.push(bigram);
      }
    }
    
    return keywords;
  }

  /**
   * Sugiere un nuevo patrón para Layer1
   */
  private async suggestNewPattern(candidate: PatternCandidate): Promise<void> {
    this.stats.patternsDiscovered++;
    
    this.logger.log(
      `💡 Nuevo patrón descubierto: "${candidate.pattern}" → ${candidate.intention} ` +
      `(frecuencia: ${candidate.frequency}, confianza: ${candidate.avgConfidence.toFixed(2)})`
    );
    
    // Emitir evento para que el admin pueda aprobar
    this.eventEmitter.emit('learning.pattern-discovered', {
      pattern: candidate.pattern,
      intention: candidate.intention,
      frequency: candidate.frequency,
      avgConfidence: candidate.avgConfidence,
      companyId: candidate.companyId,
    });
    
    // Auto-aprobar si la confianza es muy alta y frecuencia alta
    if (candidate.avgConfidence >= 0.95 && candidate.frequency >= 10) {
      await this.approvePattern(candidate);
    }
  }

  /**
   * Aprueba un patrón y lo agrega a Layer1
   */
  async approvePattern(candidate: PatternCandidate): Promise<void> {
    try {
      // Verificar si ya existe (con fallback si tabla no existe)
      let existing = null;
      try {
        existing = await (this.prisma as any).systemKeyword?.findFirst({
          where: {
            keyword: candidate.pattern,
            category: this.intentionToCategory(candidate.intention),
          },
        });
      } catch {
        this.logger.debug('Tabla SystemKeyword no disponible para approvePattern');
        return;
      }
      
      if (existing) {
        this.logger.debug(`Patrón "${candidate.pattern}" ya existe`);
        return;
      }
      
      // Crear nuevo keyword
      await (this.prisma as any).systemKeyword?.create({
        data: {
          keyword: candidate.pattern,
          category: this.intentionToCategory(candidate.intention),
          type: 'contains',
          weight: Math.min(candidate.avgConfidence, 0.9), // Peso inicial conservador
          language: 'es',
          active: true,
        },
      });
      
      this.logger.log(`✅ Patrón aprobado y agregado: "${candidate.pattern}" → ${candidate.intention}`);
      this.stats.correctionsApplied++;
      
      // Invalidar cache de keywords
      this.eventEmitter.emit('cache.invalidate-all');
      
    } catch (error) {
      this.logger.error(`Error aprobando patrón: ${error.message}`);
    }
  }

  /**
   * Mapea intención a categoría de keyword
   */
  private intentionToCategory(intention: string): string {
    const mapping: Record<string, string> = {
      'saludar': 'greeting',
      'reservar': 'reservar',
      'consultar': 'consulta',
      'cancelar': 'cancel',
      'otro': 'other',
    };
    return mapping[intention] || 'other';
  }

  /**
   * Procesa el buffer de aprendizaje
   */
  private async processLearningBuffer(): Promise<void> {
    if (this.learningBuffer.length === 0) return;
    
    this.logger.debug(`Procesando buffer de aprendizaje: ${this.learningBuffer.length} entradas`);
    
    // Analizar patrones en el buffer
    const intentionCounts: Record<string, number> = {};
    const layer3Messages: LearningEntry[] = [];
    
    for (const entry of this.learningBuffer) {
      const key = `${entry.detectedIntention}:${entry.detectionLayer}`;
      intentionCounts[key] = (intentionCounts[key] || 0) + 1;
      
      if (entry.detectionLayer === 'layer3') {
        layer3Messages.push(entry);
      }
    }
    
    // Si muchos mensajes van a Layer3, hay oportunidad de mejora en L1/L2
    const totalMessages = this.learningBuffer.length;
    const layer3Count = layer3Messages.length;
    const layer3Ratio = layer3Count / totalMessages;
    
    if (layer3Ratio > 0.3) {
      this.logger.warn(
        `⚠️ ${(layer3Ratio * 100).toFixed(0)}% de mensajes usan Layer3. ` +
        `Oportunidad de optimización.`
      );
    }
    
    // Limpiar buffer
    this.learningBuffer = [];
  }

  /**
   * Registra corrección manual de intención
   * Cuando el usuario corrige una detección incorrecta
   */
  async recordCorrection(
    originalMessage: string,
    detectedIntention: string,
    correctIntention: string,
    companyId: string,
  ): Promise<void> {
    this.logger.log(
      `📝 Corrección registrada: "${originalMessage}" ` +
      `${detectedIntention} → ${correctIntention}`
    );
    
    // Aprender la corrección
    const entry: LearningEntry = {
      originalMessage,
      normalizedMessage: originalMessage.toLowerCase(),
      detectedIntention: correctIntention,
      correctIntention,
      confidence: 1.0, // Corrección manual = 100% confianza
      detectionLayer: 'manual',
      wasCorrect: false,
      companyId,
      timestamp: new Date(),
    };
    
    // Analizar para agregar como patrón
    await this.analyzeForLayer1Pattern(entry);
    
    this.stats.correctionsApplied++;
  }

  /**
   * Evento: Cuando hay mensaje no entendido
   */
  @OnEvent('bot.message-not-understood')
  async handleNotUnderstood(payload: {
    message: string;
    companyId: string;
    userId: string;
  }): Promise<void> {
    this.logger.debug(`Mensaje no entendido: "${payload.message}"`);
    
    // Guardar para análisis posterior
    // Los mensajes no entendidos son oportunidades de aprendizaje
    await this.recordDetection({
      originalMessage: payload.message,
      normalizedMessage: payload.message.toLowerCase(),
      detectedIntention: 'otro',
      confidence: 0,
      detectionLayer: 'fallback',
      wasCorrect: false,
      companyId: payload.companyId,
      timestamp: new Date(),
    });
  }

  /**
   * Obtiene estadísticas del servicio
   */
  getStats(): LearningStats {
    return {
      ...this.stats,
      patternsDiscovered: this.pendingPatterns.size,
    };
  }

  /**
   * Obtiene patrones pendientes de aprobación
   */
  getPendingPatterns(): PatternCandidate[] {
    return Array.from(this.pendingPatterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }
}
