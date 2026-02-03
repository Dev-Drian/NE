import { Injectable, Logger } from '@nestjs/common';
import { DetectionResult } from '../../dto/detection-result.dto';
import { ProcessMessageDto } from '../../dto/process-message.dto';
import { MessagesTemplatesService } from '../../../messages-templates/messages-templates.service';
import { ContextCacheService } from '../../utils/context-cache.service';
import { CompaniesService } from '../../../companies/companies.service';
import { ProductsService } from '../../../products/products.service';
import { KeywordDetectorService } from '../../utils/keyword-detector.service';
import { TextUtilsService } from '../../utils/text-utils.service';
import { ServiceValidatorService } from '../../services/service-validator.service';
import { ServiceRegistryService } from '../../services/service-registry.service';
import { AvailabilityService } from '../../../availability/availability.service';
import { ReservationsService } from '../../../reservations/reservations.service';
import { PaymentsService } from '../../../payments/payments.service';
import { UsersService } from '../../../users/users.service';
import { ConversationsService } from '../../../conversations/conversations.service';
import { DateHelper } from '../../../common/date-helper';
import { ResourceValidatorService } from '../../services/resource-validator.service';
import { ServicesService } from '../../../services/services.service';

/**
 * Normaliza campos de inglés a español para display al usuario.
 * NOTA: Internamente mantenemos los campos en inglés (date, time, guests, etc.)
 * para compatibilidad con el código existente.
 * Si OpenAI devuelve campos en español, los convertimos a inglés.
 */
function normalizeFieldNames(data: Record<string, any>): Record<string, any> {
  // Mapeo de campos en español (de OpenAI) a inglés (interno)
  // Esto asegura que siempre trabajamos con nombres consistentes internamente
  const spanishToEnglish: Record<string, string> = {
    fecha: 'date',
    hora: 'time',
    personas: 'guests',
    telefono: 'phone',
    nombre: 'name',
    direccion: 'address',
    productos: 'products',
    mesa: 'tableId',
    notas: 'notes',
    servicio: 'service',
  };

  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Convertir campos en español a inglés si es necesario
    const normalizedKey = spanishToEnglish[key.toLowerCase()] || key;
    
    // Si ya existe el campo, no sobrescribir (prioridad al primero)
    if (!result[normalizedKey] || result[normalizedKey] === null || result[normalizedKey] === undefined) {
      result[normalizedKey] = value;
    }
  }
  
  return result;
}

@Injectable()
export class ReservationFlowService {
  private readonly logger = new Logger(ReservationFlowService.name);

  /**
   * Obtiene emoji apropiado según el tipo de servicio
   */
  private getServiceEmoji(serviceKey: string): string {
    const key = serviceKey?.toLowerCase() || '';
    if (key.includes('domicilio') || key.includes('delivery') || key.includes('envio')) return '🚚';
    if (key.includes('mesa') || key.includes('restaurante')) return '🍽️';
    if (key.includes('cita') || key.includes('consulta') || key.includes('medic')) return '🏥';
    if (key.includes('spa') || key.includes('belleza') || key.includes('masaje')) return '💆';
    if (key.includes('compra') || key.includes('tienda') || key.includes('online')) return '🛒';
    if (key.includes('apartado') || key.includes('reserv')) return '📦';
    if (key.includes('personal') || key.includes('shopping') || key.includes('asesori')) return '👔';
    if (key.includes('alteracion') || key.includes('arreglo') || key.includes('costura')) return '✂️';
    if (key.includes('disponibilidad') || key.includes('stock')) return '🔍';
    return '✨';
  }

  constructor(
    private messagesTemplates: MessagesTemplatesService,
    private contextCache: ContextCacheService,
    private companies: CompaniesService,
    private productsService: ProductsService,
    private keywordDetector: KeywordDetectorService,
    private textUtils: TextUtilsService,
    private serviceValidator: ServiceValidatorService,
    private serviceRegistry: ServiceRegistryService,
    private availability: AvailabilityService,
    private reservations: ReservationsService,
    private paymentsService: PaymentsService,
    private usersService: UsersService,
    private conversations: ConversationsService,
    private resourceValidator: ResourceValidatorService,
    private servicesService: ServicesService,
  ) {}

  async handleReservation(
    detection: DetectionResult,
    context: any,
    dto: ProcessMessageDto,
    companyType: string,
  ): Promise<{ reply: string; newState: any; missingFields?: string[] }> {
    const settings = await this.messagesTemplates.getReservationSettings(companyType);

    const company = await this.contextCache.getOrLoadCompany(dto.companyId, () =>
      this.companies.findOne(dto.companyId),
    );

    const config = (company?.config as any) || {};
    
    // ===== CARGAR SERVICIOS DESDE BD =====
    // Los servicios ahora están en tabla dedicada, no en config JSON
    const dbServices = await this.servicesService.getAvailableServices(dto.companyId);
    this.logger.log(`📋 Servicios cargados de BD: ${dbServices.length} servicios → ${dbServices.map(s => s.key).join(', ') || '(vacío)'}`);
    
    // Convertir a formato compatible con el código existente (key -> config)
    const availableServices: Record<string, any> = {};
    for (const svc of dbServices) {
      const svcConfig = svc.config || {};
      availableServices[svc.key] = {
        name: svc.name,
        description: svc.description,
        enabled: svc.available,
        requiresProducts: (svcConfig as any).requiresProducts || false,
        requiresAddress: (svcConfig as any).requiresAddress || false,
        requiresGuests: (svcConfig as any).requiresGuests || (svcConfig as any).minGuests > 0,
        requiresPhone: (svcConfig as any).requiresPhone !== false, // default true
        keywords: svc.keywords || [],
        ...svcConfig,
      };
    }
    
    // Fallback: si no hay servicios en BD, usar config JSON (compatibilidad hacia atrás)
    if (Object.keys(availableServices).length === 0 && config?.services) {
      this.logger.warn('⚠️ No hay servicios en BD, usando config JSON (deprecado)');
      Object.assign(availableServices, config.services);
    }
    
    const serviceKeys = Object.keys(availableServices);
    this.logger.log(`🔑 Service keys disponibles: ${serviceKeys.join(', ') || '(ninguno)'}`);
    
    const hasMultipleServices = serviceKeys.length > 1;

    const previousData = { ...context.collectedData };

    // Normalizar campos de inglés a español
    const rawExtracted = detection.extractedData || {};
    this.logger.log(`📨 Datos extraídos (raw): ${JSON.stringify(rawExtracted)}`);
    const extracted = normalizeFieldNames(rawExtracted);
    this.logger.log(`📨 Datos extraídos (normalized): ${JSON.stringify(extracted)}`);
    
    // Detectar si el usuario quiere REEMPLAZAR (palabras como "solo", "mejor", "entonces")
    const wantsToReplace = /\b(solo|solamente|mejor|entonces|cambiar|cambia|quiero|dame|pon|ponme)\b/i.test(dto.message);
    
    // Filtrar datos extraídos: excluir arrays vacíos y valores null/undefined
    // También manejar productos de forma especial
    const filteredExtracted = Object.fromEntries(
      Object.entries(extracted).filter(([key, value]) => {
        if (value === null || value === undefined) return false;
        // No sobreescribir productos existentes con array vacío
        if ((key === 'products' || key === 'productos') && Array.isArray(value) && value.length === 0) return false;
        return true;
      }),
    );
    this.logger.log(`📨 Datos extraídos (filtered): ${JSON.stringify(filteredExtracted)}`);
    
    // Manejar merge de productos de OpenAI de forma especial
    let mergedProductsFromAI: any[] | undefined;
    if (filteredExtracted.products && Array.isArray(filteredExtracted.products) && filteredExtracted.products.length > 0) {
      // Prioridad de productos existentes:
      // 1. Los productos actuales en collectedData (pueden ser válidos después de error de stock)
      // 2. Los productos del último intento fallido (si no hay productos actuales)
      let existingProducts = Array.isArray(previousData.products) && previousData.products.length > 0 
        ? [...previousData.products] 
        : [];
      
      // Si no hay productos actuales pero hay un intento anterior guardado
      if (existingProducts.length === 0 && context.metadata?.lastProductsAttempt) {
        existingProducts = [...context.metadata.lastProductsAttempt];
      }
      
      // Si hay productos inválidos guardados, el usuario probablemente está corrigiendo esos
      const wasCorrectingStock = context.metadata?.unavailableProducts?.length > 0;
      
      const newProducts = filteredExtracted.products;
      
      // Si estaba corrigiendo un error de stock, siempre reemplazar la cantidad del producto
      if (wantsToReplace || wasCorrectingStock) {
        // Si quiere reemplazar, actualizar cantidades de productos existentes
        // pero mantener los productos que no se mencionaron
        mergedProductsFromAI = [...existingProducts];
        
        for (const newProd of newProducts) {
          const existingIndex = mergedProductsFromAI.findIndex((p: any) => p.id === newProd.id);
          if (existingIndex >= 0) {
            mergedProductsFromAI[existingIndex].quantity = newProd.quantity;
          } else {
            mergedProductsFromAI.push(newProd);
          }
        }
      } else {
        // Si no quiere reemplazar, sumar cantidades
        mergedProductsFromAI = [...existingProducts];
        
        for (const newProd of newProducts) {
          const existingIndex = mergedProductsFromAI.findIndex((p: any) => p.id === newProd.id);
          if (existingIndex >= 0) {
            mergedProductsFromAI[existingIndex].quantity += newProd.quantity;
          } else {
            mergedProductsFromAI.push(newProd);
          }
        }
      }
      
      // Usar el merge en lugar del array de OpenAI
      filteredExtracted.products = mergedProductsFromAI;
      
      // Limpiar metadata de productos inválidos si el merge fue exitoso
      if (wasCorrectingStock) {
        // Se limpiará al actualizar el estado
      }
    }
    
    const collected: any = {
      ...context.collectedData,
      ...filteredExtracted,
    };

    // ===== PRE-LLENAR TELÉFONO DESDE WhatsApp/DTO =====
    // Si el usuario ya tiene teléfono en dto.phone (de WhatsApp), usarlo automáticamente
    if (dto.phone && !collected.phone) {
      collected.phone = dto.phone;
      this.logger.log(`📱 Teléfono pre-llenado desde WhatsApp: ${dto.phone}`);
    }

    // ===== VALIDAR Y CORREGIR SERVICIO =====
    // Si el servicio extraído no es válido (ej: "Consulta general" en lugar de "cita"),
    // intentar corregirlo
    // (serviceKeys ya está definido arriba)
    
    // PRIMERO: Intentar detectar servicio desde el mensaje del usuario
    // Esto es útil cuando el usuario responde con el nombre del servicio
    if (!collected.service || !availableServices[collected.service]) {
      const normalizedMessage = this.textUtils.normalizeText(dto.message.toLowerCase());
      
      // Buscar si el mensaje menciona algún servicio disponible por nombre o key
      for (const [key, svcConfig] of Object.entries(availableServices)) {
        const svc = svcConfig as any;
        const serviceName = this.textUtils.normalizeText((svc.name || '').toLowerCase());
        const serviceKey = this.textUtils.normalizeText(key.toLowerCase());
        
        // Verificar si el mensaje contiene el nombre del servicio o su key
        if (serviceName && normalizedMessage.includes(serviceName)) {
          collected.service = key;
          this.logger.log(`✅ Servicio detectado por nombre: "${svc.name}" → ${key}`);
          break;
        }
        if (normalizedMessage.includes(serviceKey)) {
          collected.service = key;
          this.logger.log(`✅ Servicio detectado por key: ${key}`);
          break;
        }
        
        // También verificar palabras clave comunes
        const keywords = svc.keywords || [];
        for (const kw of keywords) {
          if (normalizedMessage.includes(this.textUtils.normalizeText(kw.toLowerCase()))) {
            collected.service = key;
            this.logger.log(`✅ Servicio detectado por keyword "${kw}": ${key}`);
            break;
          }
        }
        if (collected.service) break;
      }
    }
    
    if (collected.service && !availableServices[collected.service]) {
      // El servicio extraído no es válido (puede ser el nombre en lugar de la key)
      this.logger.log(`⚠️ Servicio "${collected.service}" no es válido. Servicios disponibles: ${serviceKeys.join(', ')}`);
      
      // PRIMERO: Intentar buscar por nombre del servicio (OpenAI a veces devuelve el nombre bonito)
      const normalizedServiceName = this.textUtils.normalizeText((collected.service || '').toLowerCase());
      let foundByName = false;
      
      for (const [key, svcConfig] of Object.entries(availableServices)) {
        const svc = svcConfig as any;
        const serviceName = this.textUtils.normalizeText((svc.name || '').toLowerCase());
        const serviceKey = this.textUtils.normalizeText(key.toLowerCase());
        
        // Comparar con el nombre del servicio
        if (serviceName && normalizedServiceName === serviceName) {
          collected.service = key;
          this.logger.log(`✅ Servicio corregido por nombre exacto: "${svc.name}" → ${key}`);
          foundByName = true;
          break;
        }
        
        // Comparar si el nombre contiene o está contenido en el servicio extraído
        if (serviceName && (normalizedServiceName.includes(serviceName) || serviceName.includes(normalizedServiceName))) {
          collected.service = key;
          this.logger.log(`✅ Servicio corregido por nombre parcial: "${svc.name}" → ${key}`);
          foundByName = true;
          break;
        }
        
        // Comparar con la key normalizada (ej: "personal shopping" vs "personal_shopping")
        const normalizedKey = serviceKey.replace(/_/g, ' ');
        if (normalizedServiceName === normalizedKey || normalizedServiceName.replace(/\s+/g, '_') === serviceKey) {
          collected.service = key;
          this.logger.log(`✅ Servicio corregido por key normalizada: ${key}`);
          foundByName = true;
          break;
        }
      }
      
      if (foundByName) {
        // Ya se corrigió, continuar
      } else if (serviceKeys.length === 1) {
        // Si solo hay un servicio disponible, usarlo
        this.logger.log(`🔄 Corrigiendo servicio a único disponible: ${serviceKeys[0]}`);
        collected.service = serviceKeys[0];
      } else {
        // Buscar si el servicio extraído coincide con algún producto desde BD
        const catalogProducts = await this.productsService.findByCompany(company.id);
        const matchingProduct = catalogProducts.find((p) => 
          p.name?.toLowerCase() === collected.service?.toLowerCase()
        );
        
        if (matchingProduct) {
          this.logger.log(`🔄 "${collected.service}" es un producto, buscando servicio que requiere productos...`);
          // Buscar el servicio que requiere productos
          const serviceWithProducts = serviceKeys.find(key => availableServices[key]?.requiresProducts);
          if (serviceWithProducts) {
            collected.service = serviceWithProducts;
            this.logger.log(`✅ Servicio corregido a: ${collected.service}`);
          } else if (serviceKeys.length === 1) {
            // Si no encuentra servicio con productos pero solo hay uno, usarlo
            collected.service = serviceKeys[0];
            this.logger.log(`✅ Servicio único asignado: ${collected.service}`);
          } else {
            // Si no podemos determinar el servicio, limpiarlo para que lo pregunte
            delete collected.service;
            this.logger.log(`⚠️ No se pudo determinar el servicio, se preguntará al usuario`);
          }
        } else if (serviceKeys.length === 1) {
          // No es un producto pero solo hay un servicio disponible
          collected.service = serviceKeys[0];
          this.logger.log(`✅ Servicio único asignado (default): ${collected.service}`);
        } else {
          // No podemos determinar el servicio - MOSTRAR OPCIONES INMEDIATAMENTE
          delete collected.service;
          this.logger.log(`⚠️ Servicio "${extracted.service}" inválido para esta empresa. Mostrando opciones...`);
          
          // Construir lista de servicios disponibles para mostrar al usuario
          const servicesList = serviceKeys.map((key) => {
            const svc = availableServices[key];
            const emoji = this.getServiceEmoji(key);
            return `${emoji} **${svc?.name || key}**${svc?.description ? ` - ${svc.description}` : ''}`;
          }).join('\n');
          
          return {
            reply: `📋 Estos son nuestros servicios disponibles:\n\n${servicesList}\n\n¿Cuál te interesa? 😊`,
            newState: {
              ...context,
              collectedData: { ...collected, service: undefined },
              stage: 'collecting',
              lastIntention: 'reservar',
            },
          };
        }
      }
    }
    
    // ===== ASIGNAR SERVICIO AUTOMÁTICO SI SOLO HAY UNO =====
    // Si la empresa solo tiene UN servicio disponible, asignarlo automáticamente
    // Esto aplica tanto si no hay servicio como si el servicio extraído era inválido
    if (serviceKeys.length === 1 && (!collected.service || !availableServices[collected.service])) {
      collected.service = serviceKeys[0];
      this.logger.log(`🎯 Servicio único asignado automáticamente: ${collected.service}`);
    }

    // Identificar datos nuevos del mensaje actual
    const newData: any = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && (previousData as any)[key] !== value) {
        newData[key] = value;
      }
    }

    // Si cambia de servicio, limpiar datos específicos del servicio anterior
    // NOTA: NO borrar phone, date, time - son datos genéricos válidos para cualquier servicio
    // Solo limpiar si REALMENTE cambia de servicio (no si OpenAI repite el mismo servicio)
    const realServiceChange = extracted.service && 
                              previousData.service && 
                              extracted.service !== previousData.service;
    if (realServiceChange) {
      delete collected.products;
      delete collected.treatment;
      delete collected.product;
      delete collected.address; // Limpiar dirección si cambia de servicio
      // phone, date, time se mantienen porque son válidos para cualquier tipo de reserva
    }
    
    // Si ya hay un servicio establecido y OpenAI extrae el mismo, NO lo consideramos como "nuevo"
    if (extracted.service && previousData.service === extracted.service) {
      delete newData.service; // No es dato "nuevo"
    }

    // Regla: si dice que NO quiere delivery, buscar servicio alternativo sin dirección
    const noQuiereDelivery = this.keywordDetector.doesNotWantDelivery(dto.message);
    const currentServiceConfig = collected.service ? availableServices[collected.service] : null;
    if (noQuiereDelivery && currentServiceConfig?.requiresAddress) {
      // Buscar un servicio que NO requiera dirección (ej: mesa, cita presencial)
      const alternativeService = serviceKeys.find(key => !availableServices[key]?.requiresAddress);
      if (alternativeService) {
        this.logger.log(`🔄 Usuario no quiere delivery, cambiando a: ${alternativeService}`);
        collected.service = alternativeService;
        newData.service = alternativeService;
        // Limpiar productos solo si el nuevo servicio no los requiere
        if (!availableServices[alternativeService]?.requiresProducts && collected.products) {
          delete collected.products;
        }
      }
    }

    // Mapear productos/tratamientos a IDs del catálogo con cantidades
    // SOLO si OpenAI NO extrajo productos (evitar doble merge)
    const openAIExtractedProducts = extracted.products && Array.isArray(extracted.products) && extracted.products.length > 0;
    const catalogProducts = await this.productsService.findByCompany(company.id);
    
    if (catalogProducts.length > 0 && !openAIExtractedProducts) {
      const normalizedMsg = this.textUtils.normalizeText(dto.message.toLowerCase());
      const foundProducts: Array<{ id: string; quantity: number }> = [];

      for (const product of catalogProducts) {
        const name = this.textUtils.normalizeText(product.name || '');
        if (name && normalizedMsg.includes(name)) {
          const quantityPatterns = [
            { regex: new RegExp(`(\\d+)\\s+${name}`, 'i'), isNumber: true },
            { regex: new RegExp(`una?\\s+${name}`, 'i'), quantity: 1 },
            { regex: new RegExp(`dos\\s+${name}`, 'i'), quantity: 2 },
            { regex: new RegExp(`tres\\s+${name}`, 'i'), quantity: 3 },
            { regex: new RegExp(`cuatro\\s+${name}`, 'i'), quantity: 4 },
            { regex: new RegExp(`cinco\\s+${name}`, 'i'), quantity: 5 },
          ];

          let quantity = 1;
          for (const pattern of quantityPatterns) {
            const match = dto.message.match(pattern.regex);
            if (match) {
              if (pattern.isNumber && match[1]) quantity = parseInt(match[1], 10);
              else if (pattern.quantity) quantity = pattern.quantity;
              break;
            }
          }

          foundProducts.push({ id: product.id, quantity });
        }
      }

      if (foundProducts.length > 0) {
        const existing = Array.isArray(collected.products) ? collected.products : [];
        
        // Detectar si el usuario quiere REEMPLAZAR cantidad (palabras como "solo", "mejor", "entonces", "cambiar", "quiero")
        const wantsToReplace = /\b(solo|solamente|mejor|entonces|cambiar|cambia|quiero|dame|pon|ponme)\b/i.test(dto.message);
        
        let mergedProducts = [...existing];

        for (const newProd of foundProducts) {
          const existingIndex = mergedProducts.findIndex((p: any) => p.id === newProd.id);
          if (existingIndex >= 0) {
            // Si quiere reemplazar, usar la nueva cantidad; si no, sumar
            if (wantsToReplace) {
              mergedProducts[existingIndex].quantity = newProd.quantity;
            } else {
              mergedProducts[existingIndex].quantity += newProd.quantity;
            }
          } else {
            mergedProducts.push(newProd);
          }
        }

        collected.products = mergedProducts;
        newData.products = foundProducts;

        // Si hay productos, preferir un servicio que requiera productos (si no hay uno aún)
        const currentService = collected.service;
        const currentRequiresProducts = currentService ? availableServices[currentService]?.requiresProducts : false;

        if (!currentService || !currentRequiresProducts) {
          // Buscar dinámicamente CUALQUIER servicio que requiera productos
          const serviceWithProducts = serviceKeys.find(key => availableServices[key]?.requiresProducts === true);
          if (serviceWithProducts) {
            this.logger.log(`🔄 Productos detectados, asignando servicio: ${serviceWithProducts}`);
            collected.service = serviceWithProducts;
            newData.service = serviceWithProducts;
          }
        }
      }

      // Heurística extra: si menciona productos o “domicilio”, forzar servicio con productos
      const mentionsDelivery = this.keywordDetector.mentionsDelivery(dto.message);
      const mentionsFood = this.keywordDetector.mentionsFood(dto.message);

      const currentService2 = collected.service;
      const currentRequiresProducts2 = currentService2 ? availableServices[currentService2]?.requiresProducts : false;

      if (!currentService2 || !currentRequiresProducts2) {
        // Buscar dinamicamente servicio con productos
        const serviceWithProducts2 = serviceKeys.find(key => {
          const svc = availableServices[key];
          if (!svc?.requiresProducts) return false;
          if (mentionsDelivery && svc.requiresAddress) return true;
          return true;
        });
        
        if (serviceWithProducts2 && (foundProducts.length > 0 || mentionsDelivery || mentionsFood)) {
          this.logger.log('Heuristica extra: asignando servicio ' + serviceWithProducts2);
          collected.service = serviceWithProducts2;
          newData.service = serviceWithProducts2;
        }
      }
    }

    // Validar que el servicio existe si hay múltiples
    if (collected.service && hasMultipleServices && !availableServices[collected.service]) {
      const servicesList = Object.entries(availableServices)
        .map(([_, value]: [string, any]) => `• ${value.name}`)
        .join('\n');

      return {
        reply: `El servicio "${collected.service}" no está disponible. Por favor elige uno de estos:\n\n${servicesList}`,
        newState: {
          ...context,
          collectedData: { ...collected, service: undefined },
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }
    
    // Resolver reglas del servicio (GENÉRICO por configuración)
    const strategy = this.serviceRegistry.getReservationStrategy(companyType, collected.service);
    const resolution = await strategy.resolve(company, companyType, collected.service);

    // Calcular missing fields (con contexto histórico)
    const missing = await this.serviceValidator.calculateMissingFields(collected, resolution.validatorConfig, context);

    // Si hay múltiples servicios y aún no hay service, MOSTRAR OPCIONES PRIMERO
    // NOTA: Internamente usamos 'service' pero para el usuario mostramos 'servicio'
    if (resolution.hasMultipleServices && !collected.service) {
      // En lugar de agregar 'servicio' a missing, mostrar opciones inmediatamente
      const servicesList = serviceKeys.map((key) => {
        const svc = availableServices[key];
        const emoji = this.getServiceEmoji(key);
        return `${emoji} **${svc?.name || key}**${svc?.description ? ` - ${svc.description}` : ''}`;
      }).join('\n');
      
      return {
        reply: `📋 ¡Perfecto! Estos son nuestros servicios:\n\n${servicesList}\n\n¿Cuál te interesa? 😊`,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
          metadata: {
            ...context.metadata,
            waitingForService: true, // Marcar que estamos esperando selección de servicio
          },
        },
      };
    }

    // VALIDACIÓN: Si el servicio requiere productos, verificar que los tenga
    if (resolution.validatorConfig.requiresProducts) {
      const hasProducts = collected.products && Array.isArray(collected.products) && collected.products.length > 0;
      if (!hasProducts && !missing.includes('products')) {
        // Insertar 'products' al INICIO del array para pedir productos primero
        missing.unshift('products');
      }
    }
    
    if (missing.length > 0) {
      // Mapear campos a español y filtrar vacíos
      const missingFieldsSpanish = missing
        .map((f) => resolution.missingFieldLabels[f] || f)
        .filter((label) => label && label.trim().length > 0);
      
      // Verificar que realmente hay campos faltantes después del filtro
      if (missingFieldsSpanish.length === 0) {
        this.logger.warn(`⚠️ missing tenía ${missing.length} campos pero todos fueron filtrados: ${JSON.stringify(missing)}`);
        // Usar los campos originales como fallback
        missingFieldsSpanish.push(...missing);
      }

      // ENFOQUE HÍBRIDO: Preguntar todos la primera vez, luego uno a uno
      const hasAskedAllFields = context.metadata?.hasAskedAllFields || false;
      
      let reply: string;
      
      if (missing.length === 1) {
        // Solo falta 1 campo → preguntar ese específico (más natural)
        const svcConfig = collected.service ? availableServices[collected.service] : null;
        reply = await this.askForSingleField(
          missing[0],
          collected,
          newData,
          resolution.missingFieldLabels[missing[0]] || missing[0],
          companyType,
          svcConfig,
        );
      } else if (!hasAskedAllFields) {
        // Primera vez con múltiples campos faltantes → preguntar todos de una vez
        const svcConfig = collected.service ? availableServices[collected.service] : null;
        reply = await this.askForAllFields(
          missingFieldsSpanish,
          collected,
          newData,
          companyType,
          svcConfig,
        );
      } else {
        // Ya preguntamos todos antes → preguntar el primero que falta (uno a uno)
        const svcConfig = collected.service ? availableServices[collected.service] : null;
        reply = await this.askForSingleField(
          missing[0],
          collected,
          newData,
          resolution.missingFieldLabels[missing[0]] || missing[0],
          companyType,
          svcConfig,
        );
      }

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
          metadata: {
            ...context.metadata,
            hasAskedAllFields: missing.length > 1 && !hasAskedAllFields,
            lastFieldAsked: missing[0],
            // Limpiar metadata de corrección de stock si productos ahora son válidos
            unavailableProducts: undefined,
            lastProductsAttempt: undefined,
          },
        },
        missingFields: missingFieldsSpanish,
      };
    }

    // Guests default si no es requerido
    if (!resolution.validatorConfig.requiresGuests && !collected.guests) {
      collected.guests = settings.defaultGuests || 1;
    }

    // ===== VERIFICAR CAMPOS OPCIONALES =====
    // Si todos los requeridos están completos, ofrecer preguntar campos opcionales
    const optionalFields = resolution.validatorConfig.optionalFields || [];
    const pendingOptional = this.serviceValidator.getOptionalFieldsPending(collected, resolution.validatorConfig);
    const hasAskedOptional = context.metadata?.hasAskedOptionalFields || false;
    const userDeclinedOptional = context.metadata?.userDeclinedOptionalFields || false;
    
    // Solo preguntar opcionales si:
    // 1. Hay campos opcionales pendientes
    // 2. No hemos preguntado aún
    // 3. El usuario no ha declinado
    // 4. El mensaje actual no parece un "no" o similar
    const skipOptionalKeywords = /\b(no|skip|omitir|saltar|ninguno|nada|sin|continuar|confirmar|listo)\b/i;
    const userWantsToSkip = skipOptionalKeywords.test(dto.message);
    
    if (pendingOptional.length > 0 && !hasAskedOptional && !userDeclinedOptional && !userWantsToSkip) {
      const optionalLabels = pendingOptional.map((f) => resolution.missingFieldLabels[f] || f);
      const svcConfig = collected.service ? availableServices[collected.service] : null;
      
      // Construir pregunta amigable para campos opcionales
      let reply = `✅ ¡Tengo toda la info necesaria!\n\n`;
      reply += `📋 Opcionalmente, puedes indicarme:\n`;
      optionalLabels.forEach((label, i) => {
        reply += `   ${i + 1}. ${label}\n`;
      });
      reply += `\n💡 Si prefieres continuar sin estos datos, escribe "continuar" o "listo".`;
      
      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting_optional',
          lastIntention: 'reservar',
          metadata: {
            ...context.metadata,
            hasAskedOptionalFields: true,
            pendingOptionalFields: pendingOptional,
          },
        },
        missingFields: [], // No son requeridos
      };
    }
    
    // Si el usuario quiso saltar opcionales, marcar como declinado
    if (userWantsToSkip && context.stage === 'collecting_optional') {
      context.metadata = {
        ...context.metadata,
        userDeclinedOptionalFields: true,
      };
    }

    // Validar disponibilidad
    this.logger.log('\n========== VALIDACIÓN DE DISPONIBILIDAD ==========');
    this.logger.log(`📅 date: ${collected.date}`);
    this.logger.log(`🕐 time: ${collected.time}`);
    this.logger.log(`🛠️ service: ${collected.service}`);
    this.logger.log(`👤 userId: ${dto.userId}`);
    
    const available = await this.availability.check(dto.companyId, {
      date: collected.date!,
      time: collected.time!,
      guests: collected.guests,
      userId: dto.userId,
      service: collected.service,
    });
    
    this.logger.log(`✅ Resultado disponibilidad: ${JSON.stringify(available)}`);
    this.logger.log('===================================================\n');

    if (!available.isAvailable) {
      if (available.reason === 'time_out_of_range') {
        const invalidTime = collected.time;
        delete collected.time;

        let reply = `❌ Lo siento, la hora ${invalidTime || 'solicitada'} está fuera de nuestro horario de atención.\n\n`;
        reply += `🕐 ${available.message || 'Horario no disponible'}\n\n`;

        if (available.alternatives?.length) {
          reply += `¿Te sirve alguna de estas horas?\n`;
          available.alternatives.slice(0, 3).forEach((alt, idx) => {
            reply += `${idx + 1}. ${alt}\n`;
          });
          reply += `\nO dime otra hora dentro del horario. 😊`;
        } else {
          reply += `Por favor, indícame otra hora dentro del horario. 😊`;
        }

        return {
          reply,
          newState: {
            ...context,
            collectedData: collected,
            stage: 'collecting',
            lastIntention: 'reservar',
          },
          missingFields: [resolution.missingFieldLabels['time'] || 'hora'],
        };
      }

      // Si es una cita ocupada, mostrar alternativas y pedir nueva hora
      if (available.reason === 'appointment_taken') {
        const occupiedTime = collected.time;
        delete collected.time; // Limpiar la hora para que elija otra

        let reply = available.message || `❌ Ya hay una cita programada para las ${occupiedTime}.`;
        
        if (available.alternatives?.length) {
          reply += `\n\n🕐 Horarios disponibles para ese día:\n`;
          available.alternatives.slice(0, 5).forEach((alt, idx) => {
            reply += `${idx + 1}. ${alt}\n`;
          });
          reply += `\n¿Te sirve alguno de estos horarios?`;
        }

        return {
          reply,
          newState: {
            ...context,
            collectedData: collected,
            stage: 'collecting',
            lastIntention: 'reservar',
          },
          missingFields: [resolution.missingFieldLabels['time'] || 'hora'],
        };
      }

      let reply = available.message || 'No hay disponibilidad en este horario.';
      if (available.alternatives?.length) {
        reply += `\n\n¿Te sirve alguna de estas opciones?\n`;
        available.alternatives.slice(0, 3).forEach((alt, idx) => {
          reply += `${idx + 1}. ${alt}\n`;
        });
      }

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }

    // ===== VALIDACIÓN DE CITAS/APPOINTMENTS OCUPADAS =====
    // Para servicios que requieren verificación de disponibilidad de cita (config.requiresAppointmentCheck)
    const selectedServiceConfig = collected.service ? availableServices[collected.service] : null;
    const requiresAppointmentCheck = selectedServiceConfig?.requiresAppointmentCheck || 
                                      selectedServiceConfig?.isAppointmentBased ||
                                      (selectedServiceConfig?.name || '').toLowerCase().includes('cita');
    
    if (requiresAppointmentCheck) {
      this.logger.log(`🔍 Validando disponibilidad de cita/appointment: ${collected.date} ${collected.time}`);
      const productId = collected.products?.[0]?.id;
      const appointmentCheck = await this.availability.checkAppointmentAvailability(
        dto.companyId,
        collected.date!,
        collected.time!,
        collected.service,
        productId,
      );

      this.logger.log(`📋 Resultado validación cita: ${JSON.stringify(appointmentCheck)}`);

      if (!appointmentCheck.isAvailable) {
        let reply = appointmentCheck.message || 'Ese horario ya está ocupado.';
        
        if (appointmentCheck.alternatives && appointmentCheck.alternatives.length > 0) {
          reply += `\n\n🕐 Horarios disponibles para ese día:\n`;
          appointmentCheck.alternatives.forEach((slot, idx) => {
            reply += `${idx + 1}. ${slot}\n`;
          });
          reply += `\n¿Te sirve alguno de estos horarios?`;
        }

        // Limpiar la hora para que pueda elegir otra
        delete collected.time;

        return {
          reply,
          newState: {
            ...context,
            collectedData: collected,
            stage: 'collecting',
            lastIntention: 'reservar',
          },
          missingFields: [resolution.missingFieldLabels['time'] || 'hora'],
        };
      }
    }

    // Validar y asignar recursos (mesas, productos, etc.)
    const resourceValidation = await this.resourceValidator.validateAndAssignResources(
      dto.companyId,
      collected.service!,
      collected.date!,
      collected.time!,
      {
        guests: collected.guests,
        products: collected.products,
        tableId: collected.tableId, // Si el usuario mencionó una mesa específica
      }
    );

    if (!resourceValidation.isValid) {
      // Si hay error de productos (stock insuficiente), guardar productos y dar mensaje inteligente
      const hasProductError = resourceValidation.unavailableItems && resourceValidation.unavailableItems.length > 0;
      
      if (hasProductError && collected.products) {
        // Separar productos válidos de los que tienen problemas
        const unavailableIds = new Set(resourceValidation.unavailableItems!.map((i: any) => i.id));
        const validProducts = collected.products.filter((p: any) => !unavailableIds.has(p.id));
        const invalidProducts = collected.products.filter((p: any) => unavailableIds.has(p.id));
        
        // Construir mensaje más inteligente
        let replyMsg = resourceValidation.message || '❌ Hay un problema con algunos productos.';
        
        if (validProducts.length > 0) {
          const productNames = validProducts.map((p: any) => {
            const product = catalogProducts.find((cp: any) => cp.id === p.id);
            return product ? `${p.quantity}x ${product.name}` : `${p.quantity}x ${p.id}`;
          }).join(', ');
          replyMsg += `\n\n✅ Estos productos sí están disponibles: ${productNames}`;
        }
        
        replyMsg += `\n\n¿Quieres ajustar las cantidades o elegir otros productos?`;
        
        return {
          reply: replyMsg,
          newState: {
            ...context,
            collectedData: {
              ...collected,
              products: validProducts, // Mantener solo los productos válidos
            },
            stage: 'collecting',
            lastIntention: 'reservar',
            metadata: {
              ...context.metadata,
              lastProductsAttempt: collected.products, // Guardar todos para referencia
              unavailableProducts: resourceValidation.unavailableItems, // Guardar cuáles fallaron
            },
          },
        };
      }
      
      // Error no relacionado con productos
      return {
        reply: resourceValidation.message || 'No hay disponibilidad de recursos.',
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }

    // Asignar mesa si se encontró una
    if (resourceValidation.assignedResource) {
      collected.tableId = resourceValidation.assignedResource.id;
    }

    const requiresPayment = resolution.validatorConfig.requiresPayment === true;
    const requiresProducts = resolution.validatorConfig.requiresProducts === true;
    const selectedService = collected.service ? availableServices[collected.service] : null;

    // ===== FLUJO DE PAGO (genérico) =====
    if (requiresPayment && context.stage !== 'awaiting_payment') {
      let paymentAmount = 0;
      let paymentDescription = '';

      if (requiresProducts && collected.products) {
        const products = config?.products || [];
        const productsList = Array.isArray(collected.products) ? collected.products : [];
        let subtotal = 0;

        for (const item of productsList) {
          if (typeof item === 'object' && (item as any).id) {
            const product = products.find((p: any) => p.id === (item as any).id);
            if (product) {
              const quantity = (item as any).quantity || 1;
              subtotal += (product.price || 0) * quantity;
            }
          }
        }

        const deliveryFee = selectedService?.deliveryFee || 0;
        paymentAmount = subtotal + deliveryFee;

        const totalItems = productsList.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);
        paymentDescription = `${resolution.reservationNoun === 'pedido' ? 'Pedido' : 'Reserva'} - ${totalItems} producto(s)`;
      }

      const paymentPercentage = (company as any)?.paymentPercentage || 100;
      const finalAmount = Math.round(paymentAmount * (paymentPercentage / 100));

      if (finalAmount > 0) {
        try {
          const conversationId = await this.conversations.findOrCreateConversation(dto.userId, dto.companyId);
          const existingPayment = await this.paymentsService.getPendingPayment(conversationId);

          let paymentUrl: string | null = null;
          let reservationId: string | null = context.metadata?.reservationId || null;
          
          // Obtener serviceId desde la BD si hay un service key
          let serviceIdForPayment: string | undefined;
          if (collected.service) {
            const serviceRecord = await this.servicesService.getServiceByKey(dto.companyId, collected.service);
            serviceIdForPayment = serviceRecord?.id;
          }
          
          // SIEMPRE crear reserva si no existe una para este pedido
          if (!reservationId) {
            const reservation = await this.reservations.create({
              company: { connect: { id: dto.companyId } },
              ...(serviceIdForPayment && { serviceRef: { connect: { id: serviceIdForPayment } } }),
              userId: dto.userId,
              date: collected.date!,
              time: collected.time!,
              guests: collected.guests || settings.defaultGuests || 1,
              phone: collected.phone,
              name: collected.name,
              service: collected.service, // Mantener key por compatibilidad
              status: 'pending', // Pendiente hasta que se confirme el pago
              metadata: {
                products: collected.products,
                treatment: collected.treatment || collected.product,
                address: collected.address,
                tableId: collected.tableId,
              },
            });
            reservationId = reservation.id;
            this.logger.log(`✅ Reserva creada con ID: ${reservationId}, serviceId: ${serviceIdForPayment || 'N/A'}, status: pending`);
            
            // ===== DESCONTAR STOCK INMEDIATAMENTE AL CREAR PEDIDO =====
            // El stock se reserva aunque el pago esté pendiente
            // Si el pago es rechazado, se devolverá el stock
            if (resolution.validatorConfig.requiresProducts && collected.products && collected.products.length > 0) {
              try {
                await this.resourceValidator.decrementProductStock(
                  dto.companyId,
                  collected.products
                );
                this.logger.log(`📦 Stock reservado para pedido pendiente: ${collected.products.length} producto(s)`);
              } catch (error) {
                this.logger.warn('Error reservando stock de productos:', error);
              }
            }
          }
          
          // Crear pago solo si no existe
          if (existingPayment?.paymentUrl) {
            paymentUrl = existingPayment.paymentUrl;
          } else {
            const user = await this.usersService.findOne(dto.userId);
            const payment = await this.paymentsService.createPayment({
              companyId: dto.companyId,
              conversationId,
              amount: finalAmount,
              description: paymentDescription || `${resolution.reservationNoun}`.trim(),
              customerEmail: user?.email || `user-${dto.userId}@example.com`,
              customerName: user?.name || collected.name || 'Cliente',
            });
            paymentUrl = payment.paymentUrl;
          }

          let reply = `📋 Resumen de tu ${resolution.reservationNoun}:\n\n`;
          reply += `📅 Fecha: ${DateHelper.formatDateReadable(collected.date!)}\n`;
          reply += `🕐 Hora: ${DateHelper.formatTimeReadable(collected.time!)}\n`;
          if (collected.service && availableServices[collected.service]) {
            reply += `🏷️ Servicio: ${availableServices[collected.service].name}\n`;
          }
          
          // Mostrar productos si los hay
          if (requiresProducts && collected.products) {
            const products = config?.products || [];
            const productsList = Array.isArray(collected.products) ? collected.products : [];
            reply += `\n🛒 Productos:\n`;
            
            let subtotal = 0;
            for (const item of productsList) {
              if (typeof item === 'object' && (item as any).id) {
                const product = products.find((p: any) => p.id === (item as any).id);
                if (product) {
                  const quantity = (item as any).quantity || 1;
                  const itemTotal = (product.price || 0) * quantity;
                  subtotal += itemTotal;
                  reply += `   • ${quantity}x ${product.name} - $${itemTotal.toLocaleString('es-CO')}\n`;
                }
              }
            }
            
            const deliveryFee = selectedService?.deliveryFee || 0;
            if (deliveryFee > 0) {
              reply += `   • Envío - $${deliveryFee.toLocaleString('es-CO')}\n`;
            }
            reply += `\n💰 Total: $${paymentAmount.toLocaleString('es-CO')}\n`;
          }
          
          reply += `\n💳 Anticipo requerido: $${finalAmount.toLocaleString('es-CO')} (${paymentPercentage}% del total)`;
          reply += `\n\n⚠️ Para confirmar tu ${resolution.reservationNoun}, debes realizar el pago.`;
          if (paymentUrl) reply += `\n\n🔗 Realiza el pago aquí: ${paymentUrl}`;
          reply += `\n\nUna vez pagues, escríbeme "ya pagué". 😊`;

          return {
            reply,
            newState: {
              ...context,
              collectedData: collected,
              stage: 'awaiting_payment',
              lastIntention: 'reservar',
              metadata: {
                ...context.metadata,
                reservationId, // Guardar ID de reserva para actualizarla cuando pague
              },
            },
            missingFields: [],
          };
        } catch (err) {
          this.logger.error('Error generando link de pago:', err);
        }
      }
    }

    // ===== CREAR RESERVA =====
    this.logger.log(`📝 Creando reserva con servicio: ${collected.service}`);
    
    // Obtener serviceId desde la BD si hay un service key
    let serviceId: string | undefined;
    if (collected.service) {
      const serviceRecord = await this.servicesService.getServiceByKey(dto.companyId, collected.service);
      serviceId = serviceRecord?.id;
      this.logger.debug(`🔗 ServiceId resuelto: ${serviceId || 'N/A'} para key: ${collected.service}`);
    }
    
    try {
      const reservation = await this.reservations.create({
        company: { connect: { id: dto.companyId } },
        ...(serviceId && { serviceRef: { connect: { id: serviceId } } }), // Conectar con Service si existe
        userId: dto.userId,
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests || settings.defaultGuests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service, // Mantener key por compatibilidad
        status: 'confirmed',
        metadata: {
          products: collected.products,
          treatment: collected.treatment || collected.product,
          address: collected.address, // Guardar dirección para domicilio
          tableId: collected.tableId, // Mesa asignada
        },
      });

      // Descontar stock de productos después de crear la reserva (si el servicio requiere productos)
      if (resolution.validatorConfig.requiresProducts && collected.products && collected.products.length > 0) {
        try {
          await this.resourceValidator.decrementProductStock(
            dto.companyId,
            collected.products
          );
          this.logger.log(`📦 Stock descontado: ${collected.products.length} producto(s)`);
        } catch (error) {
          this.logger.warn('Error descontando stock de productos:', error);
          // No fallar la reserva si hay error al descontar stock
        }
      }

      // Obtener el nombre del tratamiento/producto específico (si el servicio tiene productos)
      let productName: string | undefined;
      const serviceConf = collected.service ? availableServices[collected.service] : null;
      const showProductName = serviceConf?.showProductInConfirmation || serviceConf?.isAppointmentBased || serviceConf?.requiresAppointmentCheck;
      if (showProductName && collected.products && collected.products.length > 0) {
        const productId = collected.products[0]?.id;
        // Buscar en BD primero, luego en config
        const dbProduct = catalogProducts.find((p: any) => p.id === productId);
        const configProducts = config?.products || [];
        const configProduct = configProducts.find((p: any) => p.id === productId);
        const product = dbProduct || configProduct;
        if (product) {
          productName = product.name;
        }
      }

      // LOG PARA DEPURACIÓN - ANTES DE CONFIRMAR
      this.logger.log('\n========== CONFIRMACIÓN DE RESERVA/CITA ==========');
      this.logger.log(`🛠️ collected.service: "${collected.service}"`);
      this.logger.log(`🏢 companyType: "${companyType}"`);
      this.logger.log(`🏷️ availableServices[service]?.name: "${collected.service && availableServices[collected.service]?.name}"`);
      this.logger.log(`💊 productName: "${productName}"`);
      this.logger.log(`📝 collected completo: ${JSON.stringify(collected, null, 2)}`);
      this.logger.log('===================================================\n');

      let reply = await this.messagesTemplates.getReservationConfirm(companyType, {
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests,
        phone: collected.phone,
        service: collected.service,
        serviceName: collected.service && availableServices[collected.service]?.name,
        productName, // Nombre del tratamiento específico para citas
      });

      // VALIDACIÓN: NUNCA retornar respuesta vacía
      if (!reply || reply.trim().length === 0) {
        // Determinar terminología según config del servicio
        const svcConf = collected.service ? availableServices[collected.service] : null;
        let confirmType = svcConf?.confirmationText || 'Reserva confirmada';
        
        // Fallback inteligente si no hay config específico
        if (!svcConf?.confirmationText) {
          if (svcConf?.requiresAddress) {
            confirmType = 'Pedido confirmado';
          } else if (svcConf?.isAppointmentBased || svcConf?.requiresAppointmentCheck) {
            confirmType = 'Cita confirmada';
          }
        }
        reply = `✅ ¡${confirmType}! Te esperamos. 😊`;
      }

      return {
        reply,
        newState: {
          stage: 'completed',
          collectedData: {},
          conversationHistory: context.conversationHistory,
        },
        missingFields: [],
      };
    } catch (error) {
      this.logger.error('Error creando reserva:', error);
      return {
        reply: await this.messagesTemplates.getError(companyType),
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
        },
      };
    }
  }

  /**
   * Pregunta por un solo campo específico (enfoque uno a uno)
   */
  private async askForSingleField(
    fieldKey: string,
    collected: any,
    newData: any,
    fieldLabel: string,
    companyType: string,
    serviceConfig?: any,
  ): Promise<string> {
    const terminology = await this.messagesTemplates.getTerminology(companyType);
    // Determinar tipo de reserva dinámicamente desde config del servicio
    const reservationType = serviceConfig?.reservationNoun || 
                            (serviceConfig?.requiresAddress ? 'pedido' : 
                            (serviceConfig?.isAppointmentBased ? 'cita' : terminology.reservation));

    // Construir confirmación de datos que ya tenemos
    const confirmedParts: string[] = [];
    
    if (collected.date && !newData.date) {
      const dateReadable = DateHelper.formatDateReadable(collected.date);
      confirmedParts.push(`📅 Fecha: ${dateReadable}`);
    }
    
    if (collected.time && !newData.time) {
      const timeReadable = DateHelper.formatTimeReadable(collected.time);
      confirmedParts.push(`🕐 Hora: ${timeReadable}`);
    }
    
    if (collected.guests && !newData.guests) {
      const peopleText = collected.guests === 1 ? terminology.person : terminology.people;
      confirmedParts.push(`👥 ${collected.guests} ${peopleText}`);
    }

    // Construir pregunta contextualizada
    let question = '';
    switch (fieldKey) {
      case 'date':
        question = '¿Para qué fecha la necesitas?';
        break;
      case 'time':
        if (collected.date) {
          const dateReadable = DateHelper.formatDateReadable(collected.date);
          question = `Perfecto, ${dateReadable}. ¿A qué hora?`;
        } else {
          question = '¿A qué hora?';
        }
        break;
      case 'guests':
        if (collected.date && collected.time) {
          const dateReadable = DateHelper.formatDateReadable(collected.date);
          const timeReadable = DateHelper.formatTimeReadable(collected.time);
          question = `Excelente, ${dateReadable} a las ${timeReadable}. ¿Para cuántas ${terminology.people}?`;
        } else {
          question = `¿Para cuántas ${terminology.people}?`;
        }
        break;
      case 'phone':
        question = `¿Puedes darme tu número de teléfono para confirmar tu ${reservationType}?`;
        break;
      case 'name':
        question = `¿Cuál es tu nombre?`;
        break;
      case 'products':
        question = `¿Qué productos deseas pedir?`;
        break;
      case 'address':
        question = `¿Cuál es la dirección de entrega?`;
        break;
      default:
        question = `Necesito ${fieldLabel.toLowerCase()} para continuar.`;
    }

    // Si hay datos confirmados, mostrarlos primero
    if (confirmedParts.length > 0) {
      return `¡Perfecto! Tengo anotado:\n${confirmedParts.join('\n')}\n\n${question}`;
    }

    return question;
  }

  /**
   * Pregunta por todos los campos faltantes de una vez (primera vez)
   * La IA luego determinará qué campo es cada respuesta
   */
  private async askForAllFields(
    missingFieldsSpanish: string[],
    collected: any,
    newData: any,
    companyType: string,
    serviceConfig?: any,
  ): Promise<string> {
    const terminology = await this.messagesTemplates.getTerminology(companyType);
    // Determinar tipo de reserva dinámicamente desde config del servicio
    const reservationType = serviceConfig?.reservationNoun || 
                            (serviceConfig?.requiresAddress ? 'pedido' : 
                            (serviceConfig?.isAppointmentBased ? 'cita' : terminology.reservation));

    const parts: string[] = [];

    // Si hay datos nuevos, confirmarlos
    const receivedParts: string[] = [];
    if (newData.date) {
      const dateReadable = DateHelper.formatDateReadable(newData.date);
      receivedParts.push(`📅 Fecha: ${dateReadable}`);
    }
    if (newData.time) {
      const timeReadable = DateHelper.formatTimeReadable(newData.time);
      receivedParts.push(`🕐 Hora: ${timeReadable}`);
    }
    if (newData.guests) {
      const peopleText = newData.guests === 1 ? terminology.person : terminology.people;
      receivedParts.push(`👥 ${newData.guests} ${peopleText}`);
    }
    if (newData.phone && newData.phone !== 'null' && newData.phone !== null) {
      receivedParts.push(`📱 Teléfono: ${newData.phone}`);
    }
    
    // También mostrar datos previamente recopilados si no son nuevos
    if (!newData.date && collected.date) {
      const dateReadable = DateHelper.formatDateReadable(collected.date);
      receivedParts.push(`📅 Fecha: ${dateReadable}`);
    }
    if (!newData.time && collected.time) {
      const timeReadable = DateHelper.formatTimeReadable(collected.time);
      receivedParts.push(`🕐 Hora: ${timeReadable}`);
    }
    if (!newData.phone && collected.phone && collected.phone !== 'null' && collected.phone !== null) {
      receivedParts.push(`📱 Teléfono: ${collected.phone}`);
    }

    if (receivedParts.length > 0) {
      parts.push(`¡Perfecto! Tengo anotado:\n${receivedParts.join('\n')}`);
    }

    // Preguntar todos los campos faltantes
    const questions = missingFieldsSpanish.map((field, index) => {
      // Mapear campos en español a preguntas específicas
      const fieldLower = field.toLowerCase();
      if (fieldLower.includes('fecha') || fieldLower === 'date') {
        return `${index + 1}. ¿Para qué fecha?`;
      } else if (fieldLower.includes('hora') || fieldLower === 'time') {
        return `${index + 1}. ¿A qué hora?`;
      } else if (fieldLower.includes('persona') || fieldLower.includes('comensal') || fieldLower === 'guests') {
        return `${index + 1}. ¿Para cuántas ${terminology.people}?`;
      } else if (fieldLower.includes('teléfono') || fieldLower.includes('telefono') || fieldLower === 'phone') {
        return `${index + 1}. ¿Tu número de teléfono?`;
      } else if (fieldLower.includes('producto') || fieldLower === 'products') {
        return `${index + 1}. ¿Qué productos deseas?`;
      } else if (fieldLower.includes('dirección') || fieldLower.includes('direccion') || fieldLower === 'address') {
        return `${index + 1}. ¿Cuál es la dirección de entrega?`;
      } else if (fieldLower.includes('servicio') || fieldLower === 'service') {
        // Mostrar servicios disponibles si llegamos aquí
        return `${index + 1}. servicio (escribe el nombre del servicio que deseas)`;
      } else {
        return `${index + 1}. ${field}`;
      }
    });

    parts.push(`Para confirmar tu ${reservationType}, necesito:\n${questions.join('\n')}`);
    parts.push(`\n💡 Puedes darme todos los datos de una vez o uno por uno.`);

    return parts.join('\n\n');
  }
}

