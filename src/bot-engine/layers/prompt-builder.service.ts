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
  buildServicesInfo(company: Company): { servicesInfo: string; hasMultipleServices: boolean } {
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

  buildProductsInfo(company: Company): string {
    const config = company.config as any;
    const products = config?.products || [];
    if (!Array.isArray(products) || products.length === 0) return '';

    const productsList = products
      .map((p: any) => `"${p.id}": ${p.name} (${p.price || 0})`)
      .slice(0, 30)
      .join(', ');

    return `\n\nPRODUCTOS/TRATAMIENTOS DISPONIBLES (si el usuario menciona alguno, extrae el ID y quantity):\n${productsList}`;
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
    const productsInfo = this.buildProductsInfo(company);

    // 1. Obtener intenciones dinámicas de la BD
    const intentions = await this.intentionsService.findByCompany(company.id);
    const intentionNames = intentions.map(i => i.name).filter(Boolean);
    const defaultIntentions = ['reservar', 'cancelar', 'consultar', 'otro'];
    const availableIntentions = intentionNames.length > 0 ? intentionNames : defaultIntentions;
    const intentionsList = availableIntentions.map(i => `- ${i}`).join('\n');
    const intentionsJson = availableIntentions.map(i => `"${i}"`).join(' | ');

    // 2. Obtener campos requeridos del servicio actual (si hay)
    let requiredFields: string[] = ['date', 'time', 'phone']; // Campos base siempre requeridos
    let fieldsToExtract: string[] = ['date', 'time', 'phone', 'name', 'guests'];
    let fieldsDescription = `- date: YYYY-MM-DD o null (NO asumas hoy si no dice fecha)
- time: HH:MM o null
- phone: string o null (7-15 dígitos, puede incluir código de país)
- name: string o null
- guests: número o null (solo si el usuario lo menciona)`;

    if (serviceKey) {
      // Resolver configuración del servicio
      const resolution = await this.serviceConfigResolver.resolve(company, company.type, serviceKey);
      requiredFields = this.serviceValidator.getRequiredFields(resolution.validatorConfig);
      
      // Construir lista de campos a extraer basada en campos requeridos
      fieldsToExtract = [...new Set([...requiredFields, 'name', 'service'])];
      
      // Construir descripción dinámica de campos
      const fieldDescriptions: Record<string, string> = {
        date: 'date: YYYY-MM-DD o null (NO asumas hoy si no dice fecha)',
        time: 'time: HH:MM o null',
        phone: 'phone: string o null (7-15 dígitos, puede incluir código de país)',
        name: 'name: string o null',
        guests: 'guests: número o null (solo si el usuario lo menciona)',
        service: 'service: key_del_servicio o null',
        products: 'products: array de {id, quantity} si el usuario menciona productos (si no menciona cantidad, quantity=1)',
        address: 'address: string o null (dirección/ubicación completa para entrega - solo si menciona dirección, calle, avenida, barrio, etc.)',
        tableId: 'tableId: string o null (ID de mesa específica si se menciona)',
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
      // Si no hay servicio, incluir todos los campos posibles
      fieldsDescription += `\n${hasMultipleServices ? '- service: key_del_servicio o null (si menciona un servicio o sinónimo, NO puede ser null)\n' : ''}`;
      fieldsDescription += `${productsInfo ? '- products: array de {id, quantity} si el usuario menciona productos (si no menciona cantidad, quantity=1)\n' : ''}`;
      fieldsDescription += '- address: string o null (dirección/ubicación para entrega - solo si menciona dirección, calle, avenida, barrio, etc.)';
      fieldsToExtract.push('service', 'products', 'address');
    }

    // 3. Construir JSON schema dinámico para extractedData
    const extractedDataFields = fieldsToExtract
      .map(field => {
        if (field === 'products') {
          return '    "products": [{"id":"string","quantity":1}] o []';
        }
        if (field === 'service' && hasMultipleServices) {
          return '    "service": "key_del_servicio o null"';
        }
        if (field === 'address') {
          return '    "address": "string o null (dirección completa para entrega)"';
        }
        if (field === 'date') {
          return '    "date": "YYYY-MM-DD o null"';
        }
        if (field === 'time') {
          return '    "time": "HH:MM o null"';
        }
        if (field === 'guests') {
          return '    "guests": número o null';
        }
        if (field === 'phone') {
          return '    "phone": "string o null"';
        }
        if (field === 'name') {
          return '    "name": "string o null"';
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

