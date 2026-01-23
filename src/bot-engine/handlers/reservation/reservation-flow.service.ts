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
    const collected: any = {
      ...context.collectedData,
      ...Object.fromEntries(
        Object.entries(extracted).filter(([_, value]) => value !== null && value !== undefined),
      ),
    };

    // Identificar datos nuevos del mensaje actual
    const newData: any = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && (previousData as any)[key] !== value) {
        newData[key] = value;
      }
    }

    // Si cambia de servicio, limpiar datos específicos del servicio anterior
    if (extracted.service && previousData.service && extracted.service !== previousData.service) {
      delete collected.products;
      delete collected.phone;
      delete collected.treatment;
      delete collected.product;
      delete collected.address; // Limpiar dirección si cambia de servicio
    }

    // Regla: si dice que NO quiere domicilio, pasar a mesa (si existe)
    const noQuiereDomicilio = this.keywordDetector.doesNotWantDelivery(dto.message);
    if (noQuiereDomicilio && collected.service === 'domicilio' && availableServices['mesa']) {
      collected.service = 'mesa';
      newData.service = 'mesa';
      if (collected.products) delete collected.products;
    }

    // Mapear productos/tratamientos a IDs del catálogo con cantidades
    const catalogProducts = Array.isArray(config?.products) ? config.products : [];
    if (catalogProducts.length > 0) {
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
        const mergedProducts = [...existing];

        for (const newProd of foundProducts) {
          const existingIndex = mergedProducts.findIndex((p: any) => p.id === newProd.id);
          if (existingIndex >= 0) mergedProducts[existingIndex].quantity += newProd.quantity;
          else mergedProducts.push(newProd);
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
        missing.push('products');
      }
    }

    if (missing.length > 0) {
      const missingFieldsSpanish = missing.map((f) => resolution.missingFieldLabels[f] || f);

      const reply = await this.messagesTemplates.getDynamicReservationResponse(
        companyType,
        collected,
        newData,
        missingFieldsSpanish,
      );

      return {
        reply,
        newState: {
          ...context,
          collectedData: collected,
          stage: 'collecting',
          lastIntention: 'reservar',
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
          if (existingPayment?.paymentUrl) paymentUrl = existingPayment.paymentUrl;
          else {
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
          reply += `🕐 Hora: ${collected.time}\n`;
          if (collected.service && availableServices[collected.service]) {
            reply += `🏷️ Servicio: ${availableServices[collected.service].name}\n`;
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
}

