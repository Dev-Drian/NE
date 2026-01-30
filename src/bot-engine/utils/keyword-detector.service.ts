import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TextUtilsService } from './text-utils.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Interfaz para un keyword cargado desde BD
 */
interface SystemKeywordEntry {
  keyword: string;
  type: 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  weight: number;
}

/**
 * Keywords por defecto (fallback si no hay BD o está vacía)
 * Se usan solo como respaldo cuando la BD no tiene datos
 */
const DEFAULT_KEYWORDS: Record<string, string[]> = {
  greeting: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'hi', 'buen día'],
  farewell: ['gracias', 'listo gracias', 'adiós', 'adios', 'chao', 'hasta luego', 'nos vemos', 'bye'],
  confirmation: ['sí', 'si', 'ok', 'claro', 'perfecto', 'vale', 'de acuerdo', 'correcto', 'dale'],
  negation: ['no', 'nop', 'para nada', 'negativo', 'no gracias', 'no quiero'],
  products: ['menu', 'menú', 'productos', 'que tienen', 'carta', 'servicios', 'tratamientos'],
  price: ['cuanto cuesta', 'precio', 'cuanto vale', 'costo'],
  history: ['mis pedidos', 'mis reservas', 'historial', 'pedidos anteriores'],
  payment: ['pago', 'pagar', 'ya pague', 'ya pagué'],
  cancel: ['cancelar', 'anular', 'eliminar'],
  consulta: ['horario', 'direccion', 'ubicacion', 'donde estan'],
  availability: ['disponibilidad', 'cuando hay', 'horarios disponibles'],
  details: ['informacion sobre', 'detalles de', 'cuéntame más'],
  delivery: ['domicilio', 'delivery', 'a casa'],
  para_llevar: ['para llevar', 'recoger', 'take away'],
  delivery_question: ['hacen domicilio', 'tienen delivery'],
  reservar: ['reservar', 'agendar', 'cita'],
  food: ['pizza', 'hamburguesa', 'comida'],
};

/**
 * Servicio centralizado para detectar keywords y patrones comunes
 * 
 * ✅ DINÁMICO: Los keywords se cargan desde la tabla system_keywords
 * ✅ CACHE: Se cachean en memoria para mejor rendimiento (TTL 5 min)
 * ✅ FALLBACK: Si no hay keywords en BD, usa valores por defecto
 * ✅ SYNC: Métodos síncronos para compatibilidad con código existente
 */
@Injectable()
export class KeywordDetectorService implements OnModuleInit {
  private readonly logger = new Logger(KeywordDetectorService.name);
  
  // Cache de keywords por categoría
  private keywordsCache: Map<string, SystemKeywordEntry[]> = new Map();
  private cacheLoaded = false;
  private cacheLastUpdate: Date | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

  constructor(
    private textUtils: TextUtilsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Carga los keywords al iniciar el módulo
   */
  async onModuleInit() {
    await this.loadKeywordsFromDB();
  }

  /**
   * Carga todos los keywords activos desde la BD
   */
  private async loadKeywordsFromDB(): Promise<void> {
    try {
      const keywords = await this.prisma.systemKeyword.findMany({
        where: { active: true, language: 'es' },
        orderBy: { weight: 'desc' },
      });

      // Limpiar cache
      this.keywordsCache.clear();

      // Agrupar por categoría
      for (const kw of keywords) {
        if (!this.keywordsCache.has(kw.category)) {
          this.keywordsCache.set(kw.category, []);
        }
        this.keywordsCache.get(kw.category)!.push({
          keyword: kw.keyword,
          type: kw.type as SystemKeywordEntry['type'],
          weight: kw.weight,
        });
      }

      this.cacheLoaded = true;
      this.cacheLastUpdate = new Date();
      this.logger.log(`✅ Keywords cargados desde BD: ${keywords.length} en ${this.keywordsCache.size} categorías`);
    } catch (error) {
      this.logger.warn('⚠️ Error cargando keywords desde BD, usando fallback:', error.message);
      this.loadDefaultKeywords();
    }
  }

  /**
   * Carga keywords por defecto (fallback)
   */
  private loadDefaultKeywords(): void {
    this.keywordsCache.clear();
    for (const [category, keywords] of Object.entries(DEFAULT_KEYWORDS)) {
      this.keywordsCache.set(
        category,
        keywords.map(k => ({ keyword: k, type: 'contains' as const, weight: 1.0 }))
      );
    }
    this.cacheLoaded = true;
    this.logger.log('📦 Keywords por defecto cargados');
  }

  /**
   * Obtiene keywords de una categoría (síncrono, usa cache)
   */
  private getKeywordsSync(category: string): SystemKeywordEntry[] {
    // Verificar si necesita refresh (async en background)
    if (this.shouldRefreshCache()) {
      this.loadKeywordsFromDB().catch(err => 
        this.logger.warn('Error refreshing cache:', err)
      );
    }

    // Obtener de cache o usar fallback
    const cached = this.keywordsCache.get(category);
    if (cached && cached.length > 0) {
      return cached;
    }

    // Fallback a defaults
    const defaults = DEFAULT_KEYWORDS[category];
    if (defaults) {
      return defaults.map(k => ({ keyword: k, type: 'contains' as const, weight: 1.0 }));
    }

    return [];
  }

  /**
   * Verifica si el cache necesita refresh
   */
  private shouldRefreshCache(): boolean {
    if (!this.cacheLoaded || !this.cacheLastUpdate) return true;
    const elapsed = Date.now() - this.cacheLastUpdate.getTime();
    return elapsed > this.CACHE_TTL_MS;
  }

  /**
   * Fuerza recarga del cache (útil después de cambios en BD)
   */
  async refreshCache(): Promise<void> {
    await this.loadKeywordsFromDB();
  }

  /**
   * Verifica si un mensaje contiene keywords de una categoría (síncrono)
   */
  private matchesCategory(message: string, category: string): boolean {
    const keywords = this.getKeywordsSync(category);
    const normalized = this.textUtils.normalizeText(message);

    for (const entry of keywords) {
      const keywordNorm = this.textUtils.normalizeText(entry.keyword);
      
      switch (entry.type) {
        case 'exact':
          if (normalized === keywordNorm || normalized.split(/\s+/).includes(keywordNorm)) {
            return true;
          }
          break;
        case 'startsWith':
          if (normalized.startsWith(keywordNorm)) {
            return true;
          }
          break;
        case 'endsWith':
          if (normalized.endsWith(keywordNorm)) {
            return true;
          }
          break;
        case 'regex':
          try {
            if (new RegExp(entry.keyword, 'i').test(message)) {
              return true;
            }
          } catch (e) {
            // Regex inválida, ignorar
          }
          break;
        case 'contains':
        default:
          if (normalized.includes(keywordNorm)) {
            return true;
          }
          break;
      }
    }

    return false;
  }

  // ============================================
  // MÉTODOS PÚBLICOS DE DETECCIÓN (SÍNCRONOS)
  // Para compatibilidad con código existente
  // ============================================

  /**
   * Detecta si el mensaje es un saludo
   */
  isGreeting(message: string): boolean {
    return this.matchesCategory(message, 'greeting');
  }

  /**
   * Detecta si el mensaje es una despedida o agradecimiento
   */
  isFarewell(message: string): boolean {
    return this.matchesCategory(message, 'farewell');
  }

  /**
   * Detecta si el mensaje es una confirmación positiva
   */
  isConfirmation(message: string): boolean {
    return this.matchesCategory(message, 'confirmation');
  }

  /**
   * Detecta si el mensaje es una negación
   */
  isNegation(message: string): boolean {
    return this.matchesCategory(message, 'negation');
  }

  /**
   * Detecta si el mensaje pregunta por productos/menú/servicios
   */
  asksForProducts(message: string): boolean {
    return this.matchesCategory(message, 'products');
  }

  /**
   * Detecta si el mensaje menciona "para llevar"
   */
  asksParaLlevar(message: string): boolean {
    return this.matchesCategory(message, 'para_llevar');
  }

  /**
   * Detecta si el mensaje tiene keywords de consulta (horarios, dirección, etc.)
   */
  hasConsultaKeywords(message: string): boolean {
    return this.matchesCategory(message, 'consulta');
  }

  /**
   * Detecta si el usuario está preguntando por disponibilidad
   */
  asksForAvailability(message: string): boolean {
    return this.matchesCategory(message, 'availability');
  }

  /**
   * Detecta si el mensaje pregunta por precios
   */
  asksForPrice(message: string): boolean {
    return this.matchesCategory(message, 'price');
  }

  /**
   * Detecta si el mensaje pide más información/detalles sobre algo
   */
  asksForDetails(message: string): boolean {
    return this.matchesCategory(message, 'details');
  }

  /**
   * Detecta si el mensaje menciona intención de reservar
   */
  mentionsReservation(message: string): boolean {
    return this.matchesCategory(message, 'reservar');
  }

  /**
   * Detecta si el mensaje menciona cancelar
   */
  mentionsCancel(message: string): boolean {
    return this.matchesCategory(message, 'cancel');
  }

  /**
   * Detecta si el usuario no quiere domicilio
   */
  doesNotWantDelivery(message: string): boolean {
    const normalized = this.textUtils.normalizeText(message);
    const noQuieroKeywords = ['no quiero', 'no necesito', 'no quiero que'];
    const deliveryKeywords = ['traigan', 'lleven', 'domicilio', 'delivery'];

    const hasNoQuiero = noQuieroKeywords.some(k => normalized.includes(k));
    const hasDelivery = deliveryKeywords.some(k => normalized.includes(k));

    return hasNoQuiero && hasDelivery;
  }

  /**
   * Detecta si el mensaje menciona productos de comida
   */
  mentionsFood(message: string): boolean {
    return this.matchesCategory(message, 'food');
  }

  /**
   * Detecta si el mensaje pregunta si tienen servicio de domicilio (consulta informativa)
   */
  asksAboutDelivery(message: string): boolean {
    return this.matchesCategory(message, 'delivery_question');
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con delivery (orden)
   * Excluye preguntas informativas
   */
  mentionsDelivery(message: string): boolean {
    // Si es una pregunta sobre disponibilidad, NO es orden
    if (this.asksAboutDelivery(message)) {
      return false;
    }
    return this.matchesCategory(message, 'delivery');
  }

  /**
   * Detecta si el mensaje menciona términos relacionados con pago
   */
  mentionsPayment(message: string): boolean {
    return this.matchesCategory(message, 'payment');
  }

  /**
   * Detecta si el usuario afirma que ya pagó
   */
  saysAlreadyPaid(message: string): boolean {
    const normalized = this.textUtils.normalizeText(message);
    
    // Keywords específicos de "ya pagué" (alta precisión)
    const alreadyPaidPatterns = [
      'ya pague', 'ya pagué', 'ya page', 'ya pago', 'ya pagó',
      'pague ya', 'pagué ya', 'acabo de pagar', 'acabo de page',
      'ya realice el pago', 'ya realicé el pago', 'ya hice el pago',
      'listo pague', 'listo pagué', 'listo ya pague', 'listo ya pagué',
      'realice el pago', 'realicé el pago', 'hice el pago',
      'complete el pago', 'completé el pago', 'efectue el pago', 'efectué el pago'
    ];
    
    return alreadyPaidPatterns.some(p => 
      normalized.includes(this.textUtils.normalizeText(p))
    );
  }

  /**
   * Detecta si el usuario pregunta por su historial de pedidos/reservas
   */
  asksForHistory(message: string): boolean {
    return this.matchesCategory(message, 'history');
  }

  /**
   * Obtiene todas las categorías detectadas en el mensaje
   */
  detectAllCategories(message: string): string[] {
    const categories: string[] = [];
    
    if (this.isGreeting(message)) categories.push('greeting');
    if (this.isFarewell(message)) categories.push('farewell');
    if (this.isConfirmation(message)) categories.push('confirmation');
    if (this.isNegation(message)) categories.push('negation');
    if (this.asksForProducts(message)) categories.push('products');
    if (this.asksParaLlevar(message)) categories.push('para_llevar');
    if (this.hasConsultaKeywords(message)) categories.push('consulta');
    if (this.asksForAvailability(message)) categories.push('availability');
    if (this.asksForPrice(message)) categories.push('price');
    if (this.asksForDetails(message)) categories.push('details');
    if (this.mentionsReservation(message)) categories.push('reservar');
    if (this.mentionsCancel(message)) categories.push('cancel');
    if (this.mentionsPayment(message)) categories.push('payment');
    if (this.asksForHistory(message)) categories.push('history');
    if (this.mentionsDelivery(message)) categories.push('delivery');
    if (this.asksAboutDelivery(message)) categories.push('delivery_question');
    
    return categories;
  }

  /**
   * Obtiene estadísticas del cache (para debug/admin)
   */
  getCacheStats(): { loaded: boolean; categories: number; totalKeywords: number; lastUpdate: Date | null } {
    let totalKeywords = 0;
    this.keywordsCache.forEach(keywords => {
      totalKeywords += keywords.length;
    });

    return {
      loaded: this.cacheLoaded,
      categories: this.keywordsCache.size,
      totalKeywords,
      lastUpdate: this.cacheLastUpdate,
    };
  }
}

