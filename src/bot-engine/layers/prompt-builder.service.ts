import { Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { AIContext } from '../context/context-builder.service';
import { IntentionsService } from '../../intentions/intentions.service';
import { ServiceConfigResolverService } from '../services/service-config-resolver.service';
import { ServiceValidatorService } from '../services/service-validator.service';
import { ProductsService } from '../../products/products.service';

export interface DateReferences {
  hoy: string;
  manana: string;
  pasadoManana: string;
  diaHoy: string;
  diaManana: string;
  diaPasadoManana: string;
  proximosDias: Record<string, string>;
}

@Injectable()
export class PromptBuilderService {
  constructor(
    private intentionsService: IntentionsService,
    private serviceConfigResolver: ServiceConfigResolverService,
    private serviceValidator: ServiceValidatorService,
    private productsService: ProductsService,
  ) {}
  
  async buildServicesInfo(company: Company): Promise<{ servicesInfo: string; hasMultipleServices: boolean }> {
    const config = company.config as any;
    const availableServices = config?.services || {};
    const hasMultipleServices = Object.keys(availableServices).length > 1;

    if (!hasMultipleServices) {
      return { servicesInfo: '', hasMultipleServices: false };
    }

    const servicesList = Object.entries(availableServices)
      .map(([key, value]: [string, any]) => {
        const synonyms: string[] = Array.isArray(value?.synonyms) ? value.synonyms : [];
        const synonymsText = synonyms.length ? ` (sinónimos: ${synonyms.join(', ')})` : '';
        return `"${key}": ${value?.name || key}${synonymsText}`;
      })
      .join('\n');

    const servicesInfo = `\n\n⚠️ SERVICIOS DISPONIBLES (si el usuario menciona uno, DEBES extraer la KEY exacta en extractedData.service):\n${servicesList}\n\nREGLA CRÍTICA:\n- Si el usuario menciona un servicio (por nombre o sinónimo) NO dejes service: null.\n- Si el usuario menciona “para llevar”, normalmente significa recoger en el local (no domicilio) a menos que tu config diga lo contrario.\n`;

    return { servicesInfo, hasMultipleServices: true };
  }

  /**
   * Construye información de productos desde la BD (tabla Product)
   * NO desde el config JSON de Company
   */
  async buildProductsInfo(companyId: string): Promise<string> {
    try {
      const products = await this.productsService.findByCompany(companyId);
      if (!Array.isArray(products) || products.length === 0) return '';

      // Agrupar por categoría para mejor contexto
      const byCategory: Record<string, typeof products> = {};
      for (const p of products) {
        const cat = p.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
      }

      let productsList = '';
      for (const [category, items] of Object.entries(byCategory)) {
        const categoryProducts = items
          .map((p: any) => `"${p.id}": ${p.name} ($${p.price || 0})`)
          .slice(0, 15)
          .join(', ');
        productsList += `\n  [${category}]: ${categoryProducts}`;
      }

      return `\n\n🛒 PRODUCTOS/TRATAMIENTOS DISPONIBLES (si el usuario menciona alguno, extrae el ID exacto y quantity):${productsList}

⚠️ REGLAS PARA EXTRAER PRODUCTOS:
- Busca coincidencias parciales: "coca cola" = "coca_cola", "bruschetta" = "bruschetta"
- Si dice cantidad (ej: "2 hamburguesas"), extrae quantity=2
- Si NO dice cantidad, usa quantity=1
- Extrae TODOS los productos que mencione, no solo uno`;

    } catch (error) {
      console.warn('Error obteniendo productos de BD:', error);
      return '';
    }
  }

  buildPrompt(params: {
    company: Company;
    message: string;
    dateRefs: DateReferences;
    conversationContextText: string; // ya formateado (ContextBuilderService)
    currentStateInfo: string;
    contextualInfo: string;
    serviceKey?: string; // Servicio actual si está en proceso de reserva
  }): Promise<{ prompt: string; hasMultipleServices: boolean }> {
    return this.buildPromptAsync(params);
  }

  private async buildPromptAsync(params: {
    company: Company;
    message: string;
    dateRefs: DateReferences;
    conversationContextText: string;
    currentStateInfo: string;
    contextualInfo: string;
    serviceKey?: string;
  }): Promise<{ prompt: string; hasMultipleServices: boolean }> {
    const { company, message, dateRefs, conversationContextText, currentStateInfo, contextualInfo, serviceKey } = params;

    const { servicesInfo, hasMultipleServices } = await this.buildServicesInfo(company);
    const productsInfo = await this.buildProductsInfo(company.id); // Obtener de BD

    // 1. Obtener intenciones dinámicas de la BD
    const intentions = await this.intentionsService.findByCompany(company.id);
    const intentionNames = intentions.map(i => i.name).filter(Boolean);
    const defaultIntentions = ['reservar', 'cancelar', 'consultar', 'otro'];
    const availableIntentions = intentionNames.length > 0 ? intentionNames : defaultIntentions;
    const intentionsList = availableIntentions.map(i => `- ${i}`).join('\n');
    const intentionsJson = availableIntentions.map(i => `"${i}"`).join(' | ');

    // 2. Obtener campos requeridos del servicio actual (si hay)
    let requiredFields: string[] = ['fecha', 'hora', 'telefono']; // Campos base siempre requeridos
    let fieldsToExtract: string[] = ['fecha', 'hora', 'telefono', 'nombre', 'personas'];
    let fieldsDescription = `- fecha: YYYY-MM-DD o null (NO asumas hoy si no dice fecha)
- hora: HH:MM o null
- telefono: string o null (7-15 dígitos, puede incluir código de país)
- nombre: string o null
- personas: número o null (solo si el usuario lo menciona)`;

    if (serviceKey) {
      // Resolver configuración del servicio
      const resolution = await this.serviceConfigResolver.resolve(company, company.type, serviceKey);
      requiredFields = this.serviceValidator.getRequiredFields(resolution.validatorConfig);
      
      // Construir lista de campos a extraer basada en campos requeridos
      fieldsToExtract = [...new Set([...requiredFields, 'nombre', 'servicio'])];
      
      // Construir descripción dinámica de campos (en español)
      const fieldDescriptions: Record<string, string> = {
        fecha: 'fecha: YYYY-MM-DD o null (NO asumas hoy si no dice fecha)',
        hora: 'hora: HH:MM o null',
        telefono: 'telefono: string o null (7-15 dígitos, puede incluir código de país)',
        nombre: 'nombre: string o null',
        personas: 'personas: número o null (solo si el usuario lo menciona)',
        servicio: 'servicio: key_del_servicio o null',
        productos: 'productos: array de {id, quantity} si el usuario menciona productos (si no menciona cantidad, quantity=1)',
        direccion: 'direccion: string o null (dirección/ubicación completa para entrega - solo si menciona dirección, calle, avenida, barrio, etc.)',
        mesa: 'mesa: string o null (ID de mesa específica si se menciona)',
        notas: 'notas: string o null (comentarios adicionales del cliente)',
        // Fallback para campos legacy en inglés
        date: 'fecha: YYYY-MM-DD o null',
        time: 'hora: HH:MM o null',
        phone: 'telefono: string o null',
        name: 'nombre: string o null',
        guests: 'personas: número o null',
        service: 'servicio: key_del_servicio o null',
        products: 'productos: array de {id, quantity}',
        address: 'direccion: string o null',
        tableId: 'mesa: string o null',
        notes: 'notas: string o null',
      };

      fieldsDescription = fieldsToExtract
        .map(field => {
          if (fieldDescriptions[field]) {
            return fieldDescriptions[field];
          }
          return `${field}: tipo apropiado o null`;
        })
        .join('\n');
    } else {
      // Si no hay servicio, incluir todos los campos posibles (en español)
      fieldsDescription += `\n${hasMultipleServices ? '- servicio: key_del_servicio o null (si menciona un servicio o sinónimo, NO puede ser null)\n' : ''}`;
      fieldsDescription += `${productsInfo ? '- productos: array de {id, quantity} si el usuario menciona productos (si no menciona cantidad, quantity=1)\n' : ''}`;
      fieldsDescription += '- direccion: string o null (dirección/ubicación para entrega - solo si menciona dirección, calle, avenida, barrio, etc.)';
      fieldsToExtract.push('servicio', 'productos', 'direccion');
    }

    // 3. Construir JSON schema dinámico para extractedData (en español)
    const extractedDataFields = fieldsToExtract
      .map(field => {
        // Campos en español
        if (field === 'productos' || field === 'products') {
          return '    "productos": [{"id":"string","quantity":1}] o []';
        }
        if ((field === 'servicio' || field === 'service') && hasMultipleServices) {
          return '    "servicio": "key_del_servicio o null"';
        }
        if (field === 'direccion' || field === 'address') {
          return '    "direccion": "string o null (dirección completa para entrega)"';
        }
        if (field === 'fecha' || field === 'date') {
          return '    "fecha": "YYYY-MM-DD o null"';
        }
        if (field === 'hora' || field === 'time') {
          return '    "hora": "HH:MM o null"';
        }
        if (field === 'personas' || field === 'guests') {
          return '    "personas": número o null';
        }
        if (field === 'telefono' || field === 'phone') {
          return '    "telefono": "string o null"';
        }
        if (field === 'nombre' || field === 'name') {
          return '    "nombre": "string o null"';
        }
        if (field === 'mesa' || field === 'tableId') {
          return '    "mesa": "string o null"';
        }
        if (field === 'notas' || field === 'notes') {
          return '    "notas": "string o null"';
        }
        if (field === 'tableId') {
          return '    "tableId": "string o null"';
        }
        return `    "${field}": "tipo apropiado o null"`;
      })
      .join(',\n');
    
    // Agregar queryType al schema (siempre disponible)
    const queryTypeField = '    "queryType": "catalog | availability | price | info | null (usa catalog si piden menú/carta/catálogo completo)"';
    const finalExtractedDataFields = `${queryTypeField},\n${extractedDataFields}`;

    const prompt = `Analiza este mensaje de un cliente y responde SOLO con un JSON válido (sin markdown, sin código, solo JSON):

FECHAS DE REFERENCIA (usa estas EXACTAMENTE):
- HOY: ${dateRefs.hoy} (${dateRefs.diaHoy})
- MAÑANA: ${dateRefs.manana} (${dateRefs.diaManana})
- PASADO MAÑANA: ${dateRefs.pasadoManana} (${dateRefs.diaPasadoManana})

PRÓXIMOS DÍAS DE LA SEMANA (si el usuario menciona solo el nombre del día):
- Próximo lunes: ${dateRefs.proximosDias['lunes']}
- Próximo martes: ${dateRefs.proximosDias['martes']}
- Próximo miércoles: ${dateRefs.proximosDias['miércoles']}
- Próximo jueves: ${dateRefs.proximosDias['jueves']}
- Próximo viernes: ${dateRefs.proximosDias['viernes']}
- Próximo sábado: ${dateRefs.proximosDias['sábado']}
- Próximo domingo: ${dateRefs.proximosDias['domingo']}

Contexto: Cliente de ${company.name} (tipo: ${company.type})
Mensaje: "${message}"${servicesInfo}${productsInfo}

${conversationContextText ? `Contexto conversacional:\n${conversationContextText}\n` : ''}
${currentStateInfo || ''}${contextualInfo || ''}

INSTRUCCIONES CRÍTICAS:

1) EXTRACCIÓN DE DATOS - extrae SOLO lo que el usuario menciona explícitamente:
${fieldsDescription}

⚠️ REGLAS CRÍTICAS DE EXTRACCIÓN:

📍 DIRECCIÓN: Si el usuario dice algo como:
- "mi dirección es..." / "mi direccion es..." → Extrae TODO lo que sigue como dirección
- "enviar a..." / "entrega en..." → Extrae la ubicación completa
- Cualquier mención de calle, avenida, barrio, sector, carrera, etc.
- Ejemplo: "mi direccion es nelson mandela sector las t" → direccion: "nelson mandela sector las t"

📅 FECHAS RELATIVAS - CONVIERTE A FORMATO YYYY-MM-DD:
- "hoy" → ${dateRefs.hoy}
- "mañana" / "mñana" → ${dateRefs.manana}
- "pasado mañana" → ${dateRefs.pasadoManana}
- Si menciona día de la semana, usa las fechas de referencia de arriba

🕐 HORAS - CONVIERTE A FORMATO 24H (HH:MM):
- "a las 8 de la tarde" / "8pm" → 20:00
- "a las 7 de la mañana" / "7am" → 07:00
- "a las 2" (sin especificar) → Usa contexto (restaurante almuerzo=14:00, cena=20:00)

🛒 PRODUCTOS - Busca en el catálogo:
- Busca coincidencias parciales (coca cola = coca_cola)
- Extrae TODOS los que mencione, no solo uno
- Si dice "una coca" = quantity: 1, "dos hamburguesas" = quantity: 2

${serviceKey ? `\n⚠️ SERVICIO ACTUAL: ${serviceKey}\nCampos requeridos para este servicio: ${requiredFields.join(', ')}\n` : ''}

2) INTENCIÓN - Debes detectar una de estas intenciones disponibles:
${intentionsList}

REGLAS CRÍTICAS PARA DETECTAR INTENCIÓN:
- "consultar": El usuario pregunta información (horarios, precios, productos, disponibilidad, servicios) SIN intención de reservar. Palabras clave: "qué", "cuánto", "cuándo", "dónde", "tienen", "hay", "disponible", "horario", "precio", "cuesta", "vale", "menú", "menu", "carta", "catálogo"
- "reservar": El usuario quiere crear una reserva/pedido/cita. Palabras clave: "quiero", "necesito", "deseo", "reservar", "pedir", "agendar", "cita", "mesa", "domicilio"
- "cancelar": El usuario quiere cancelar/anular/eliminar una reserva existente. Palabras clave: "cancelar", "anular", "eliminar", "borrar", "no quiero", "no necesito"
- "otro": Cualquier otra cosa que no encaje en las anteriores

⚠️ REGLA CRÍTICA PARA CONSULTAS DE CATÁLOGO:
Si el usuario dice "menú", "menu", "carta", "catálogo", "qué tienen", "qué ofrecen", "qué hay", "dame el menú", "me regalas el menú", "muéstrame todo":
- Intención: "consultar"
- extractedData.queryType: "catalog" (OBLIGATORIO para consultas de catálogo completo)
- missingFields: [] (VACÍO - NO pidas "productos" porque quiere ver TODOS)
- suggestedReply: genera una respuesta que indique que mostrarás el catálogo/menú completo

${intentions.length > 0 ? `\nEjemplos de intenciones de esta empresa:\n${intentions.map(i => `- ${i.name}: ${i.description || 'Sin descripción'}`).join('\n')}\n` : ''}

Responde SOLO con este JSON:
{
  "intention": ${intentionsJson},
  "confidence": 0.0-1.0,
  "extractedData": {
${finalExtractedDataFields}
  },
  "missingFields": ["campo1", "campo2"] o [],
  "suggestedReply": "texto contextualizado y específico"
}`;

    return { prompt, hasMultipleServices };
  }
}

