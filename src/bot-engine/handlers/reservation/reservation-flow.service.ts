import { Injectable, Logger } from '@nestjs/common';
import { DetectionResult } from '../../dto/detection-result.dto';
import { ProcessMessageDto } from '../../dto/process-message.dto';
import { MessagesTemplatesService } from '../../../messages-templates/messages-templates.service';
import { ContextCacheService } from '../../utils/context-cache.service';
import { CompaniesService } from '../../../companies/companies.service';
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

@Injectable()
export class ReservationFlowService {
  private readonly logger = new Logger(ReservationFlowService.name);

  constructor(
    private messagesTemplates: MessagesTemplatesService,
    private contextCache: ContextCacheService,
    private companies: CompaniesService,
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
    const availableServices = config?.services || {};
    const hasMultipleServices = Object.keys(availableServices).length > 1;

    const previousData = { ...context.collectedData };

    const extracted = detection.extractedData || {};
    
    // Detectar si el usuario quiere REEMPLAZAR (palabras como "solo", "mejor", "entonces")
    const wantsToReplace = /\b(solo|solamente|mejor|entonces|cambiar|cambia|quiero|dame|pon|ponme)\b/i.test(dto.message);
    
    // Filtrar datos extraídos: excluir arrays vacíos y valores null/undefined
    // También manejar productos de forma especial
    const filteredExtracted = Object.fromEntries(
      Object.entries(extracted).filter(([key, value]) => {
        if (value === null || value === undefined) return false;
        // No sobreescribir productos existentes con array vacío
        if (key === 'products' && Array.isArray(value) && value.length === 0) return false;
        return true;
      }),
    );
    
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

    // Regla: si dice que NO quiere domicilio, pasar a mesa (si existe)
    const noQuiereDomicilio = this.keywordDetector.doesNotWantDelivery(dto.message);
    if (noQuiereDomicilio && collected.service === 'domicilio' && availableServices['mesa']) {
      collected.service = 'mesa';
      newData.service = 'mesa';
      if (collected.products) delete collected.products;
    }

    // Mapear productos/tratamientos a IDs del catálogo con cantidades
    // SOLO si OpenAI NO extrajo productos (evitar doble merge)
    const openAIExtractedProducts = extracted.products && Array.isArray(extracted.products) && extracted.products.length > 0;
    const catalogProducts = Array.isArray(config?.products) ? config.products : [];
    
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
        const canSwitchToDomicilio = availableServices['domicilio']?.requiresProducts === true;
        const canSwitchToCita = availableServices['cita']?.requiresProducts === true;

        if (!currentService || !currentRequiresProducts) {
          if (canSwitchToDomicilio) {
            collected.service = 'domicilio';
            newData.service = 'domicilio';
          } else if (canSwitchToCita) {
            collected.service = 'cita';
            newData.service = 'cita';
          }
        }
      }

      // Heurística extra: si menciona productos o “domicilio”, forzar servicio con productos
      const mentionsDelivery = this.keywordDetector.mentionsDelivery(dto.message);
      const mentionsFood = this.keywordDetector.mentionsFood(dto.message);

      const currentService = collected.service;
      const currentRequiresProducts = currentService ? availableServices[currentService]?.requiresProducts : false;
      const canSwitchToDomicilio = availableServices['domicilio']?.requiresProducts === true;

      if (!currentService || !currentRequiresProducts) {
        if (canSwitchToDomicilio && (foundProducts.length > 0 || mentionsDelivery || mentionsFood)) {
          collected.service = 'domicilio';
          newData.service = 'domicilio';
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

    // Si hay múltiples servicios y aún no hay service, pedirlo
    if (resolution.hasMultipleServices && !collected.service) {
      if (!missing.includes('service')) missing.push('service');
    }

    // VALIDACIÓN ESPECIAL: Domicilio requiere productos
    if (collected.service === 'domicilio' && resolution.validatorConfig.requiresProducts) {
      const hasProducts = collected.products && Array.isArray(collected.products) && collected.products.length > 0;
      if (!hasProducts && !missing.includes('products')) {
        // Insertar 'products' al INICIO del array para pedir productos primero
        missing.unshift('products');
      }
    }
    
    if (missing.length > 0) {
      const missingFieldsSpanish = missing.map((f) => resolution.missingFieldLabels[f] || f);

      // ENFOQUE HÍBRIDO: Preguntar todos la primera vez, luego uno a uno
      const hasAskedAllFields = context.metadata?.hasAskedAllFields || false;
      
      let reply: string;
      
      if (missing.length === 1) {
        // Solo falta 1 campo → preguntar ese específico (más natural)
        reply = await this.askForSingleField(
          missing[0],
          collected,
          newData,
          resolution.missingFieldLabels[missing[0]] || missing[0],
          companyType,
        );
      } else if (!hasAskedAllFields) {
        // Primera vez con múltiples campos faltantes → preguntar todos de una vez
        reply = await this.askForAllFields(
          missingFieldsSpanish,
          collected,
          newData,
          companyType,
        );
      } else {
        // Ya preguntamos todos antes → preguntar el primero que falta (uno a uno)
        reply = await this.askForSingleField(
          missing[0],
          collected,
          newData,
          resolution.missingFieldLabels[missing[0]] || missing[0],
          companyType,
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

    // Validar disponibilidad
    const available = await this.availability.check(dto.companyId, {
      date: collected.date!,
      time: collected.time!,
      guests: collected.guests,
      userId: dto.userId,
      service: collected.service,
    });

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
          
          // SIEMPRE crear reserva si no existe una para este pedido
          if (!reservationId) {
            const reservation = await this.reservations.create({
              company: { connect: { id: dto.companyId } },
              userId: dto.userId,
              date: collected.date!,
              time: collected.time!,
              guests: collected.guests || settings.defaultGuests || 1,
              phone: collected.phone,
              name: collected.name,
              service: collected.service,
              status: 'pending', // Pendiente hasta que se confirme el pago
              metadata: {
                products: collected.products,
                treatment: collected.treatment || collected.product,
                address: collected.address,
                tableId: collected.tableId,
              },
            });
            reservationId = reservation.id;
            console.log(`✅ Reserva creada con ID: ${reservationId}, status: pending`);
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
    try {
      const reservation = await this.reservations.create({
        company: { connect: { id: dto.companyId } },
        userId: dto.userId,
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests || settings.defaultGuests || 1,
        phone: collected.phone,
        name: collected.name,
        service: collected.service,
        status: 'confirmed',
        metadata: {
          products: collected.products,
          treatment: collected.treatment || collected.product,
          address: collected.address, // Guardar dirección para domicilio
          tableId: collected.tableId, // Mesa asignada
        },
      });

      // Descontar stock de productos después de crear la reserva
      if (collected.service === 'domicilio' && collected.products && collected.products.length > 0) {
        try {
          await this.resourceValidator.decrementProductStock(
            dto.companyId,
            collected.products
          );
        } catch (error) {
          this.logger.warn('Error descontando stock de productos:', error);
          // No fallar la reserva si hay error al descontar stock
        }
      }

      let reply = await this.messagesTemplates.getReservationConfirm(companyType, {
        date: collected.date!,
        time: collected.time!,
        guests: collected.guests,
        phone: collected.phone,
        service: collected.service,
        serviceName: collected.service && availableServices[collected.service]?.name,
      });

      // Ajuste de copy para domicilio
      if (resolution.reservationNoun === 'pedido') {
        reply = reply.replace(/reserva/gi, (match) =>
          match[0] === match[0].toUpperCase() ? 'Pedido' : 'pedido',
        );
      }

      // VALIDACIÓN: NUNCA retornar respuesta vacía
      if (!reply || reply.trim().length === 0) {
        reply = `✅ ${resolution.reservationNoun === 'pedido' ? 'Pedido' : 'Reserva'} confirmada exitosamente. ¡Te esperamos! 😊`;
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
  ): Promise<string> {
    const terminology = await this.messagesTemplates.getTerminology(companyType);
    const isDomicilio = collected.service === 'domicilio';
    const reservationType = isDomicilio ? 'pedido' : terminology.reservation;

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
  ): Promise<string> {
    const terminology = await this.messagesTemplates.getTerminology(companyType);
    const isDomicilio = collected.service === 'domicilio';
    const reservationType = isDomicilio ? 'pedido' : terminology.reservation;

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
    if (newData.phone) {
      receivedParts.push(`📱 Teléfono: ${newData.phone}`);
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
      } else {
        return `${index + 1}. ${field}`;
      }
    });

    parts.push(`Para confirmar tu ${reservationType}, necesito:\n${questions.join('\n')}`);
    parts.push(`\n💡 Puedes darme todos los datos de una vez o uno por uno. La IA entenderá qué es cada cosa 😊`);

    return parts.join('\n\n');
  }
}

