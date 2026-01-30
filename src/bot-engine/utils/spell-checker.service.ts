import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Diccionario de correcciones comunes en español colombiano
 * Mapea errores frecuentes a palabras correctas
 */
const COMMON_TYPOS: Record<string, string> = {
  // Saludos
  'ola': 'hola',
  'olas': 'holas',
  'bunas': 'buenas',
  'wenas': 'buenas',
  'güenas': 'buenas',
  'bnas': 'buenas',
  'buens': 'buenas',
  'buen dia': 'buen día',
  'buen dias': 'buenos días',
  'weno': 'bueno',
  'bn': 'bien',
  'mui bn': 'muy bien',
  
  // Acciones comunes
  'kiero': 'quiero',
  'qiero': 'quiero',
  'qero': 'quiero',
  'quero': 'quiero',
  'keremos': 'queremos',
  'nesesito': 'necesito',
  'nescesito': 'necesito',
  'nesecito': 'necesito',
  'necesto': 'necesito',
  'porfavor': 'por favor',
  'porfa': 'por favor',
  'xfa': 'por favor',
  'xfavor': 'por favor',
  'plis': 'por favor',
  'pliz': 'por favor',
  
  // Reservaciones
  'reserva': 'reservar',
  'rservar': 'reservar',
  'reervar': 'reservar',
  'resrvar': 'reservar',
  'ajendar': 'agendar',
  'agendr': 'agendar',
  'ajenda': 'agenda',
  'cita': 'cita',
  'sita': 'cita',
  
  // Días
  'oy': 'hoy',
  'hooy': 'hoy',
  'mañan': 'mañana',
  'manana': 'mañana',
  'manan': 'mañana',
  'pasadomañana': 'pasado mañana',
  'lunes': 'lunes',
  'martes': 'martes',
  'miercoles': 'miércoles',
  'jueves': 'jueves',
  'viernes': 'viernes',
  'sabado': 'sábado',
  'domingo': 'domingo',
  
  // Números y cantidades
  'uno': 'uno',
  '1': 'uno',
  'dos': 'dos',
  '2': 'dos',
  'tres': 'tres',
  '3': 'tres',
  'cuatro': 'cuatro',
  '4': 'cuatro',
  'sinco': 'cinco',
  'seis': 'seis',
  'siete': 'siete',
  'ocho': 'ocho',
  'nueve': 'nueve',
  'dies': 'diez',
  
  // Consultas
  'presio': 'precio',
  'precios': 'precios',
  'cuanto': 'cuánto',
  'cuanto cuesta': 'cuánto cuesta',
  'cuantocuesta': 'cuánto cuesta',
  'orario': 'horario',
  'horarios': 'horarios',
  'direcion': 'dirección',
  'direccion': 'dirección',
  'direecion': 'dirección',
  'ubicasion': 'ubicación',
  'ubicacion': 'ubicación',
  
  // Comida y pedidos
  'domisilio': 'domicilio',
  'domiclio': 'domicilio',
  'domiciio': 'domicilio',
  'pedido': 'pedido',
  'pedir': 'pedir',
  'ordenar': 'ordenar',
  'ordnar': 'ordenar',
  'menu': 'menú',
  'mnu': 'menú',
  'carta': 'carta',
  
  // Confirmaciones
  'si': 'sí',
  'sii': 'sí',
  'sip': 'sí',
  'sep': 'sí',
  'ok': 'ok',
  'okey': 'ok',
  'okei': 'ok',
  'oki': 'ok',
  'okis': 'ok',
  'listo': 'listo',
  'lstp': 'listo',
  'lsto': 'listo',
  'dale': 'dale',
  'va': 'va',
  'vale': 'vale',
  'vle': 'vale',
  'claro': 'claro',
  'clro': 'claro',
  'perfecto': 'perfecto',
  'prfecto': 'perfecto',
  
  // Negaciones
  'nop': 'no',
  'nel': 'no',
  'noo': 'no',
  'nooo': 'no',
  
  // Despedidas
  'grasias': 'gracias',
  'grasiass': 'gracias',
  'grax': 'gracias',
  'grcias': 'gracias',
  'gras': 'gracias',
  'chao': 'chao',
  'chau': 'chao',
  'ciao': 'chao',
  'adios': 'adiós',
  'adio': 'adiós',
  
  // Consultas de estado
  'pagué': 'pagué',
  'pague': 'pagué',
  'page': 'pagué',
  'pago': 'pago',
  'ya pague': 'ya pagué',
  'ya page': 'ya pagué',
  
  // Productos/servicios comunes
  'hamburgesa': 'hamburguesa',
  'amburguesa': 'hamburguesa',
  'hamburguer': 'hamburguesa',
  'piza': 'pizza',
  'pissa': 'pizza',
  'piZza': 'pizza',
  'coca': 'coca cola',
  'cocacola': 'coca cola',
  
  // WhatsApp/informal
  'q': 'que',
  'k': 'que',
  'xq': 'porque',
  'pq': 'porque',
  'pa': 'para',
  'pa q': 'para qué',
  'd': 'de',
  'dl': 'del',
  'n': 'en',
  'cn': 'con',
  'tb': 'también',
  'tmb': 'también',
  'x': 'por',
  'dnd': 'donde',
  'dnde': 'donde',
};

/**
 * Mapeo fonético para español (similar a Soundex pero para español)
 */
const PHONETIC_GROUPS: Record<string, string> = {
  'b': 'b', 'v': 'b',           // b/v suenan igual
  'c': 'k', 'k': 'k', 'q': 'k', // c/k/q suenan similar
  's': 's', 'z': 's', 'x': 's', // s/z/x en español colombiano
  'g': 'g', 'j': 'g',           // g/j similares
  'y': 'y', 'll': 'y',          // y/ll (yeísmo)
  'h': '',                       // h es muda
  'ñ': 'n',                     // para matching básico
};

interface SpellCheckResult {
  original: string;
  corrected: string;
  corrections: Array<{
    original: string;
    suggestion: string;
    confidence: number;
  }>;
  wasModified: boolean;
}

/**
 * Servicio de corrección ortográfica para mensajes en español
 * Optimizado para errores comunes de WhatsApp y escritura informal
 * 
 * Características:
 * - Diccionario de errores comunes
 * - Algoritmo Levenshtein para sugerencias
 * - Comparación fonética para español
 * - Cache de correcciones aprendidas
 */
@Injectable()
export class SpellCheckerService implements OnModuleInit {
  private readonly logger = new Logger(SpellCheckerService.name);
  
  // Vocabulario conocido (palabras correctas)
  private vocabulary: Set<string> = new Set();
  
  // Cache de correcciones aprendidas
  private learnedCorrections: Map<string, string> = new Map();
  
  // Estadísticas
  private stats = {
    totalChecks: 0,
    totalCorrections: 0,
    cacheHits: 0,
  };

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadVocabulary();
  }

  /**
   * Carga vocabulario desde keywords del sistema
   */
  private async loadVocabulary(): Promise<void> {
    try {
      // Agregar palabras del diccionario de correcciones
      Object.values(COMMON_TYPOS).forEach(word => this.vocabulary.add(word.toLowerCase()));
      
      // Cargar keywords de la BD (si la tabla existe)
      try {
        const keywords = await (this.prisma as any).systemKeyword?.findMany({
          where: { active: true },
          select: { keyword: true },
        });
        
        if (keywords) {
          keywords.forEach((k: any) => {
            k.keyword.split(/\s+/).forEach((word: string) => {
              this.vocabulary.add(word.toLowerCase());
            });
          });
        }
      } catch {
        this.logger.debug('Tabla SystemKeyword no disponible, usando solo diccionario local');
      }
      
      // Agregar palabras comunes del español
      const commonWords = [
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
        'y', 'o', 'pero', 'porque', 'que', 'como', 'cuando', 'donde',
        'yo', 'tu', 'él', 'ella', 'nosotros', 'ustedes', 'ellos',
        'mi', 'tu', 'su', 'nuestro', 'este', 'ese', 'aquel',
        'ser', 'estar', 'tener', 'hacer', 'ir', 'venir', 'poder',
        'hoy', 'mañana', 'ayer', 'ahora', 'después', 'antes',
        'muy', 'más', 'menos', 'bien', 'mal', 'mucho', 'poco',
      ];
      commonWords.forEach(w => this.vocabulary.add(w));
      
      this.logger.log(`📚 Vocabulario cargado: ${this.vocabulary.size} palabras`);
    } catch (error) {
      this.logger.warn('Error cargando vocabulario:', error.message);
    }
  }

  /**
   * Corrige ortografía de un mensaje
   */
  checkAndCorrect(message: string): SpellCheckResult {
    this.stats.totalChecks++;
    
    const words = message.split(/\s+/);
    const corrections: SpellCheckResult['corrections'] = [];
    let correctedMessage = message;
    
    for (const word of words) {
      const lowerWord = word.toLowerCase();
      
      // 1. Verificar en cache de correcciones aprendidas
      if (this.learnedCorrections.has(lowerWord)) {
        const suggestion = this.learnedCorrections.get(lowerWord)!;
        corrections.push({ original: word, suggestion, confidence: 1.0 });
        correctedMessage = correctedMessage.replace(
          new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi'),
          suggestion
        );
        this.stats.cacheHits++;
        continue;
      }
      
      // 2. Verificar en diccionario de errores comunes
      if (COMMON_TYPOS[lowerWord]) {
        const suggestion = COMMON_TYPOS[lowerWord];
        corrections.push({ original: word, suggestion, confidence: 0.95 });
        correctedMessage = correctedMessage.replace(
          new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi'),
          suggestion
        );
        continue;
      }
      
      // 3. Si la palabra está en el vocabulario, está bien
      if (this.vocabulary.has(lowerWord)) {
        continue;
      }
      
      // 4. Buscar sugerencia por similitud
      const suggestion = this.findBestSuggestion(lowerWord);
      if (suggestion && suggestion.confidence >= 0.7) {
        corrections.push({ original: word, suggestion: suggestion.word, confidence: suggestion.confidence });
        correctedMessage = correctedMessage.replace(
          new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi'),
          suggestion.word
        );
      }
    }
    
    // También corregir frases completas
    const phraseCorrection = this.correctPhrases(correctedMessage);
    if (phraseCorrection.wasModified) {
      correctedMessage = phraseCorrection.corrected;
      corrections.push(...phraseCorrection.corrections);
    }
    
    if (corrections.length > 0) {
      this.stats.totalCorrections += corrections.length;
    }
    
    return {
      original: message,
      corrected: correctedMessage,
      corrections,
      wasModified: corrections.length > 0,
    };
  }

  /**
   * Corrige frases completas (no solo palabras)
   */
  private correctPhrases(message: string): SpellCheckResult {
    const lower = message.toLowerCase();
    const corrections: SpellCheckResult['corrections'] = [];
    let corrected = message;
    
    // Frases comunes mal escritas
    const phraseCorrections: Record<string, string> = {
      'cuantocuesta': 'cuánto cuesta',
      'cuanto cuesta': 'cuánto cuesta',
      'q tienen': 'qué tienen',
      'q hay': 'qué hay',
      'kiero reservar': 'quiero reservar',
      'kiero agendar': 'quiero agendar',
      'pa mañana': 'para mañana',
      'pa hoy': 'para hoy',
      'ya pague': 'ya pagué',
      'ya page': 'ya pagué',
    };
    
    for (const [wrong, right] of Object.entries(phraseCorrections)) {
      if (lower.includes(wrong)) {
        corrections.push({ original: wrong, suggestion: right, confidence: 0.9 });
        corrected = corrected.replace(new RegExp(this.escapeRegex(wrong), 'gi'), right);
      }
    }
    
    return {
      original: message,
      corrected,
      corrections,
      wasModified: corrections.length > 0,
    };
  }

  /**
   * Busca la mejor sugerencia para una palabra mal escrita
   */
  private findBestSuggestion(word: string): { word: string; confidence: number } | null {
    if (word.length < 3) return null; // Palabras muy cortas no se corrigen
    
    let bestMatch: { word: string; distance: number } | null = null;
    const maxDistance = Math.ceil(word.length * 0.4); // 40% de la longitud
    
    for (const vocabWord of this.vocabulary) {
      if (Math.abs(vocabWord.length - word.length) > maxDistance) continue;
      
      const distance = this.levenshteinDistance(word, vocabWord);
      
      if (distance <= maxDistance) {
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { word: vocabWord, distance };
        }
      }
    }
    
    if (bestMatch) {
      // Calcular confianza basada en la distancia
      const confidence = 1 - (bestMatch.distance / Math.max(word.length, bestMatch.word.length));
      return { word: bestMatch.word, confidence };
    }
    
    return null;
  }

  /**
   * Algoritmo de distancia de Levenshtein
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    if (m === 0) return n;
    if (n === 0) return m;
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1,     // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return dp[m][n];
  }

  /**
   * Aprende una nueva corrección
   */
  learnCorrection(wrong: string, correct: string): void {
    const lowerWrong = wrong.toLowerCase();
    if (lowerWrong !== correct.toLowerCase()) {
      this.learnedCorrections.set(lowerWrong, correct);
      this.logger.debug(`📖 Aprendida corrección: "${wrong}" → "${correct}"`);
    }
  }

  /**
   * Escapa caracteres especiales para regex
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Obtiene estadísticas del servicio
   */
  getStats() {
    return {
      ...this.stats,
      vocabularySize: this.vocabulary.size,
      learnedCorrections: this.learnedCorrections.size,
    };
  }
}
