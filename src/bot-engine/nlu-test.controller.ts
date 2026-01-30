import { Controller, Post, Body, Get } from '@nestjs/common';
import { SpellCheckerService } from './utils/spell-checker.service';
import { SynonymService } from './utils/synonym.service';
import { EntityNormalizerService } from './utils/entity-normalizer.service';
import { LearningService } from './services/learning.service';

/**
 * Controlador de pruebas para el sistema NLU
 * 
 * Endpoints para testear cada componente individualmente
 * 
 * Uso:
 * POST /api/nlu/test/spell     - Probar corrección ortográfica
 * POST /api/nlu/test/synonyms  - Probar sinónimos
 * POST /api/nlu/test/entities  - Probar extracción de entidades
 * POST /api/nlu/test/full      - Probar pipeline completo
 * GET  /api/nlu/stats          - Ver estadísticas
 */
@Controller('api/nlu')
export class NluTestController {
  constructor(
    private readonly spellChecker: SpellCheckerService,
    private readonly synonymService: SynonymService,
    private readonly entityNormalizer: EntityNormalizerService,
    private readonly learningService: LearningService,
  ) {}

  /**
   * Probar corrección ortográfica
   * 
   * POST /api/nlu/test/spell
   * Body: { "message": "ola kiero reservar xfa" }
   */
  @Post('test/spell')
  testSpellChecker(@Body() body: { message: string }) {
    const result = this.spellChecker.checkAndCorrect(body.message);
    return {
      input: body.message,
      output: result.corrected,
      wasModified: result.wasModified,
      corrections: result.corrections,
    };
  }

  /**
   * Probar sinónimos
   * 
   * POST /api/nlu/test/synonyms
   * Body: { "message": "quiero agendar cita" }
   */
  @Post('test/synonyms')
  testSynonyms(@Body() body: { message: string }) {
    const normalized = this.synonymService.normalizeMessage(body.message);
    const expansions = this.synonymService.expandMessage(body.message);
    
    return {
      input: body.message,
      normalized,
      wasModified: normalized !== body.message,
      expansions: expansions.slice(0, 5), // Mostrar solo 5 expansiones
      stats: this.synonymService.getStats(),
    };
  }

  /**
   * Probar extracción de entidades
   * 
   * POST /api/nlu/test/entities
   * Body: { "message": "reservar para 2 personas mañana a las 7pm" }
   */
  @Post('test/entities')
  testEntities(@Body() body: { message: string }) {
    const result = this.entityNormalizer.extractAll(body.message);
    
    return {
      input: body.message,
      hasEntities: result.hasEntities,
      entities: result.entities.map(e => ({
        type: e.type,
        value: e.value instanceof Date ? e.value.toISOString() : e.value,
        original: e.original,
        confidence: e.confidence,
      })),
    };
  }

  /**
   * Probar pipeline NLU completo
   * 
   * POST /api/nlu/test/full
   * Body: { "message": "ola kiero agendar meza pa 2 mñana alas 7" }
   */
  @Post('test/full')
  testFullPipeline(@Body() body: { message: string }) {
    // Paso 1: Corrección ortográfica
    const spellResult = this.spellChecker.checkAndCorrect(body.message);
    
    // Paso 2: Normalización de sinónimos
    const synonymResult = this.synonymService.normalizeMessage(spellResult.corrected);
    
    // Paso 3: Extracción de entidades
    const entitiesResult = this.entityNormalizer.extractAll(synonymResult);
    
    return {
      input: body.message,
      pipeline: {
        step1_spell: {
          output: spellResult.corrected,
          corrections: spellResult.corrections,
        },
        step2_synonyms: {
          output: synonymResult,
          changed: synonymResult !== spellResult.corrected,
        },
        step3_entities: {
          entities: entitiesResult.entities.map(e => ({
            type: e.type,
            value: e.value instanceof Date ? e.value.toISOString() : e.value,
            original: e.original,
          })),
        },
      },
      finalMessage: synonymResult,
      extractedData: {
        date: entitiesResult.entities.find(e => e.type === 'date')?.value,
        time: entitiesResult.entities.find(e => e.type === 'time')?.value,
        quantity: entitiesResult.entities.find(e => e.type === 'quantity')?.value,
        phone: entitiesResult.entities.find(e => e.type === 'phone')?.value,
      },
    };
  }

  /**
   * Ver estadísticas del sistema NLU
   * 
   * GET /api/nlu/stats
   */
  @Get('stats')
  getStats(): Record<string, any> {
    return {
      synonyms: this.synonymService.getStats(),
      learning: this.learningService.getStats(),
      spellChecker: {
        dictionarySize: 150, // Aproximado del diccionario
        vocabularyLoaded: true,
      },
    };
  }

  /**
   * Pruebas batch - múltiples mensajes
   * 
   * POST /api/nlu/test/batch
   * Body: { "messages": ["ola", "kiero reservar", "cuanto cuesta"] }
   */
  @Post('test/batch')
  testBatch(@Body() body: { messages: string[] }) {
    return body.messages.map(msg => {
      const spell = this.spellChecker.checkAndCorrect(msg);
      const synonyms = this.synonymService.normalizeMessage(spell.corrected);
      const entities = this.entityNormalizer.extractAll(synonyms);
      
      return {
        input: msg,
        corrected: spell.corrected,
        normalized: synonyms,
        entities: entities.entities.length,
      };
    });
  }
}
