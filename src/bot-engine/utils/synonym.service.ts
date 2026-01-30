import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface SynonymEntry {
  word: string;
  synonyms: string[];
  category?: string;
}

/**
 * Sinónimos predeterminados del español colombiano
 * Agrupados por concepto base
 */
const DEFAULT_SYNONYMS: Record<string, string[]> = {
  // Acciones de reserva
  'reservar': ['agendar', 'apartar', 'separar', 'booking', 'book'],
  'cancelar': ['anular', 'eliminar', 'borrar', 'quitar', 'deshacer'],
  'modificar': ['cambiar', 'editar', 'actualizar', 'corregir'],
  'confirmar': ['aprobar', 'aceptar', 'validar', 'ratificar'],
  
  // Consultas
  'precio': ['costo', 'valor', 'tarifa', 'cuanto cuesta', 'cuánto vale'],
  'horario': ['hora', 'horarios', 'cuando abren', 'horas de atención'],
  'ubicación': ['dirección', 'donde están', 'donde quedan', 'dirección', 'domicilio'],
  'disponibilidad': ['disponible', 'hay espacio', 'tienen cupo', 'hay lugar'],
  
  // Servicios
  'domicilio': ['delivery', 'envío a casa', 'reparto', 'entrega'],
  'mesa': ['table', 'lugar', 'puesto', 'sitio'],
  'cita': ['consulta', 'turno', 'appointment', 'sesión'],
  
  // Tiempo
  'hoy': ['ahora', 'ahorita', 'ya', 'este momento'],
  'mañana': ['al día siguiente', 'el próximo día'],
  'tarde': ['después del mediodía', 'pm', 'evening'],
  'noche': ['night', 'en la noche', 'nocturno'],
  
  // Cantidades
  'persona': ['personas', 'gente', 'comensales', 'invitados', 'asistentes'],
  
  // Estados
  'pendiente': ['en espera', 'por confirmar', 'sin pagar'],
  'confirmado': ['aprobado', 'aceptado', 'listo', 'ok'],
  
  // Productos de restaurante
  'hamburguesa': ['burger', 'hamburger', 'hamburguer', 'hamburguesita'],
  'pizza': ['pizzas', 'piza', 'piZza'],
  'bebida': ['bebidas', 'trago', 'refresco', 'jugo', 'gaseosa'],
  
  // Saludos/despedidas
  'hola': ['hello', 'hi', 'hey', 'buenas', 'buenos días'],
  'gracias': ['thanks', 'thank you', 'agradezco', 'mil gracias'],
  'adiós': ['chao', 'bye', 'hasta luego', 'nos vemos'],
  
  // Afirmaciones
  'sí': ['si', 'claro', 'ok', 'dale', 'va', 'vale', 'perfecto', 'listo', 'correcto'],
  'no': ['nop', 'nel', 'negativo', 'para nada', 'no gracias'],
};

/**
 * Servicio de Sinónimos Dinámicos
 * 
 * Permite expandir el vocabulario del bot automáticamente.
 * Los sinónimos se cargan desde BD y se cachean en memoria.
 * 
 * Uso:
 * - Expandir mensaje: "quiero agendar" → incluye también "reservar"
 * - Normalizar: "delivery" → "domicilio"
 * - Buscar relacionados: "pizza" → ["pizzas", "piza"]
 */
@Injectable()
export class SynonymService implements OnModuleInit {
  private readonly logger = new Logger(SynonymService.name);
  
  // Mapeo palabra → palabra canónica (normalizada)
  private wordToCanonical: Map<string, string> = new Map();
  
  // Mapeo palabra canónica → todos sus sinónimos
  private canonicalToSynonyms: Map<string, Set<string>> = new Map();
  
  // Cache de expansiones (para evitar recalcular)
  private expansionCache: Map<string, string[]> = new Map();
  private readonly CACHE_SIZE = 1000;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadSynonyms();
  }

  /**
   * Carga sinónimos desde BD y defaults
   */
  private async loadSynonyms(): Promise<void> {
    // 1. Cargar defaults primero
    for (const [canonical, synonyms] of Object.entries(DEFAULT_SYNONYMS)) {
      this.registerSynonyms(canonical, synonyms);
    }
    
    // 2. Intentar cargar desde BD (si existe tabla)
    try {
      // TODO: Crear tabla Synonym en Prisma cuando se necesite
      // const dbSynonyms = await this.prisma.synonym.findMany({ where: { active: true } });
      // dbSynonyms.forEach(s => this.registerSynonyms(s.canonical, s.synonyms));
      
      this.logger.log(`📚 Sinónimos cargados: ${this.canonicalToSynonyms.size} grupos`);
    } catch (error) {
      this.logger.debug('Tabla de sinónimos no disponible, usando defaults');
    }
  }

  /**
   * Registra un grupo de sinónimos
   */
  private registerSynonyms(canonical: string, synonyms: string[]): void {
    const canonicalLower = canonical.toLowerCase();
    
    // Crear/obtener el set de sinónimos
    if (!this.canonicalToSynonyms.has(canonicalLower)) {
      this.canonicalToSynonyms.set(canonicalLower, new Set());
    }
    const synonymSet = this.canonicalToSynonyms.get(canonicalLower)!;
    
    // Agregar la palabra canónica a sí misma
    synonymSet.add(canonicalLower);
    this.wordToCanonical.set(canonicalLower, canonicalLower);
    
    // Agregar cada sinónimo
    for (const syn of synonyms) {
      const synLower = syn.toLowerCase();
      synonymSet.add(synLower);
      this.wordToCanonical.set(synLower, canonicalLower);
    }
  }

  /**
   * Obtiene la palabra canónica de un término
   * Ej: "agendar" → "reservar"
   */
  getCanonical(word: string): string {
    return this.wordToCanonical.get(word.toLowerCase()) || word.toLowerCase();
  }

  /**
   * Obtiene todos los sinónimos de una palabra
   * Ej: "reservar" → ["reservar", "agendar", "apartar", "separar"]
   */
  getSynonyms(word: string): string[] {
    const canonical = this.getCanonical(word);
    const synonyms = this.canonicalToSynonyms.get(canonical);
    return synonyms ? Array.from(synonyms) : [word.toLowerCase()];
  }

  /**
   * Verifica si dos palabras son sinónimos
   */
  areSynonyms(word1: string, word2: string): boolean {
    return this.getCanonical(word1) === this.getCanonical(word2);
  }

  /**
   * Expande un mensaje reemplazando palabras por sus canónicas
   * Ej: "quiero agendar para mañana" → "quiero reservar para mañana"
   */
  normalizeMessage(message: string): string {
    const words = message.split(/\s+/);
    const normalized = words.map(word => {
      // Preservar puntuación
      const match = word.match(/^(\W*)(\w+)(\W*)$/);
      if (!match) return word;
      
      const [, prefix, core, suffix] = match;
      const canonical = this.getCanonical(core);
      
      return prefix + canonical + suffix;
    });
    
    return normalized.join(' ');
  }

  /**
   * Expande un mensaje incluyendo todos los sinónimos posibles
   * Útil para búsquedas más amplias
   * 
   * Ej: "quiero reservar" → ["quiero reservar", "quiero agendar", "quiero apartar"]
   */
  expandMessage(message: string): string[] {
    // Verificar cache
    const cacheKey = message.toLowerCase();
    if (this.expansionCache.has(cacheKey)) {
      return this.expansionCache.get(cacheKey)!;
    }
    
    const words = message.toLowerCase().split(/\s+/);
    const expansions: string[][] = words.map(word => {
      const synonyms = this.getSynonyms(word);
      return synonyms.length > 0 ? synonyms : [word];
    });
    
    // Generar combinaciones (limitado para evitar explosión)
    const results = this.generateCombinations(expansions, 10);
    
    // Guardar en cache
    if (this.expansionCache.size >= this.CACHE_SIZE) {
      // Limpiar cache más antigua
      const firstKey = this.expansionCache.keys().next().value;
      if (firstKey) this.expansionCache.delete(firstKey);
    }
    this.expansionCache.set(cacheKey, results);
    
    return results;
  }

  /**
   * Genera combinaciones de palabras (limitado)
   */
  private generateCombinations(arrays: string[][], maxResults: number): string[] {
    if (arrays.length === 0) return [''];
    
    const results: string[] = [];
    const generate = (index: number, current: string[]) => {
      if (results.length >= maxResults) return;
      
      if (index === arrays.length) {
        results.push(current.join(' '));
        return;
      }
      
      for (const word of arrays[index]) {
        generate(index + 1, [...current, word]);
        if (results.length >= maxResults) break;
      }
    };
    
    generate(0, []);
    return results;
  }

  /**
   * Busca si un mensaje contiene algún sinónimo de una palabra
   * Ej: mensaje="quiero agendar", palabra="reservar" → true
   */
  messageContainsSynonym(message: string, word: string): boolean {
    const synonyms = this.getSynonyms(word);
    const messageLower = message.toLowerCase();
    
    return synonyms.some(syn => messageLower.includes(syn));
  }

  /**
   * Aprende un nuevo sinónimo
   */
  learnSynonym(word: string, synonym: string): void {
    const canonical = this.getCanonical(word);
    
    if (!this.canonicalToSynonyms.has(canonical)) {
      this.canonicalToSynonyms.set(canonical, new Set([canonical]));
    }
    
    this.canonicalToSynonyms.get(canonical)!.add(synonym.toLowerCase());
    this.wordToCanonical.set(synonym.toLowerCase(), canonical);
    
    // Limpiar cache de expansiones
    this.expansionCache.clear();
    
    this.logger.debug(`📖 Sinónimo aprendido: "${synonym}" → "${canonical}"`);
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      synonymGroups: this.canonicalToSynonyms.size,
      totalWords: this.wordToCanonical.size,
      cacheSize: this.expansionCache.size,
    };
  }
}
