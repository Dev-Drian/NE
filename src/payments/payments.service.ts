import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { WompiService, WompiCredentials } from './wompi.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private wompi: WompiService,
  ) {}

  async createPayment(data: CreatePaymentDto) {
    // Verificar que la empresa existe y tiene Wompi configurado
    const company = await this.prisma.company.findUnique({
      where: { id: data.companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.wompiEnabled || !company.wompiPublicKey || !company.wompiPrivateKey) {
      throw new BadRequestException('Wompi is not configured for this company');
    }

    const reference = `PAY-${Date.now()}-${data.conversationId.slice(0, 8)}`;

    const payment = await this.prisma.payment.create({
      data: {
        companyId: data.companyId,
        conversationId: data.conversationId,
        amount: data.amount,
        status: 'PENDING',
        wompiReference: reference,
      },
    });

    try {
      const credentials: WompiCredentials = {
        publicKey: company.wompiPublicKey,
        privateKey: company.wompiPrivateKey,
        eventsSecret: company.wompiEventsSecret || '',
      };

      const wompiPayment = await this.wompi.createPaymentLink(credentials, {
        reference,
        amount: data.amount,
        description: data.description,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
      });

      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          paymentUrl: wompiPayment.permalink,
          wompiTransactionId: wompiPayment.id,
        },
      });

      this.logger.log(`Payment created: ${payment.id} - ${wompiPayment.permalink}`);

      return updatedPayment;
    } catch (error) {
      this.logger.error('Error creating payment:', error);
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'ERROR' },
      });
      throw error;
    }
  }

  async checkPaymentStatus(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        company: true,
        conversation: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Si no hay wompiTransactionId, el usuario aún no ha completado el pago en Wompi
    // Retornar el estado actual de la base de datos (probablemente PENDING)
    if (!payment.wompiTransactionId) {
      this.logger.log(`Payment ${paymentId} has no transaction ID yet - user hasn't paid`);
      return payment;
    }

    // Si ya está aprobado, no necesitamos consultar Wompi de nuevo
    if (payment.status === 'APPROVED') {
      this.logger.log(`Payment ${paymentId} already approved`);
      return payment;
    }

    try {
      const transaction = await this.wompi.getTransactionStatus(
        payment.company.wompiPublicKey!,
        payment.wompiTransactionId,
      );

      const status = this.wompi.mapWompiStatus(transaction.status);

      const updatedPayment = await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: status as any,
          paidAt: status === 'APPROVED' ? new Date() : null,
        },
      });

      if (status === 'APPROVED' && !payment.conversation.paymentCompleted) {
        await this.prisma.conversation.update({
          where: { id: payment.conversationId },
          data: { paymentCompleted: true },
        });
      }

      return updatedPayment;
    } catch (error) {
      // Si Wompi responde 404, significa que la transacción aún no existe
      // Retornar el pago con su estado actual (PENDING)
      if (error?.response?.status === 404) {
        this.logger.warn(`Transaction not found in Wompi for payment ${paymentId} - user hasn't completed payment yet`);
        return payment;
      }
      
      this.logger.error('Error checking payment status:', error);
      throw error;
    }
  }

  // Máximo tiempo permitido para webhooks (5 minutos) - protección contra replay attacks
  private readonly WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

  async handleWebhook(
    signature: string,
    timestamp: string,
    payload: any,
  ) {
    this.logger.log('=== PROCESANDO WEBHOOK ===');
    this.logger.log('Signature recibida:', signature);
    this.logger.log('Timestamp recibido:', timestamp);
    
    // Protección contra replay attacks - verificar que el timestamp no sea muy antiguo
    const isProduction = process.env.NODE_ENV === 'production';
    const webhookTimestamp = payload?.timestamp ? Number(payload.timestamp) * 1000 : Date.now();
    const now = Date.now();
    const age = now - webhookTimestamp;
    
    if (age > this.WEBHOOK_MAX_AGE_MS) {
      this.logger.error(`❌ Webhook timestamp too old: ${age}ms (max: ${this.WEBHOOK_MAX_AGE_MS}ms)`);
      if (isProduction) {
        throw new UnauthorizedException('Webhook timestamp too old - possible replay attack');
      } else {
        this.logger.warn('⚠️ Timestamp antiguo - permitido solo en modo desarrollo');
      }
    }
    
    this.logger.log('Payload recibido:', JSON.stringify(payload, null, 2));
    
    const { event, data } = payload;
    this.logger.log('Event type:', event);
    
    if (event === 'transaction.updated') {
      const transactionId = data?.transaction?.id;
      const paymentLinkId = data?.transaction?.payment_link_id;
      const transactionStatus = data?.transaction?.status;
      
      this.logger.log('Payment Link ID:', paymentLinkId);
      this.logger.log('Transaction ID:', transactionId);
      this.logger.log('Status:', transactionStatus);
      
      if (!paymentLinkId) {
        this.logger.warn('⚠️ No se encontró payment_link_id en la transacción');
        return;
      }
      
      // Buscar por payment_link_id (es el ID que guardamos al crear el payment link)
      const payment = await this.prisma.payment.findFirst({
        where: { wompiTransactionId: paymentLinkId },
        include: { company: true, conversation: true },
      });

      if (!payment) {
        this.logger.warn(`⚠️ Pago no encontrado para payment_link_id: ${paymentLinkId}`);
        return;
      }

      this.logger.log(`✅ Pago encontrado: ${payment.id}`);

      // VALIDACIÓN DE FIRMA OBLIGATORIA EN PRODUCCIÓN
      const isProduction = process.env.NODE_ENV === 'production';
      const skipSignatureValidation = process.env.SKIP_WOMPI_SIGNATURE_VALIDATION === 'true';
      
      if (payment.company.wompiEventsSecret) {
        this.logger.log('🔐 Verificando firma del webhook...');
        const isValid = this.wompi.verifySignature(
          payment.company.wompiEventsSecret,
          signature,
          timestamp,
          payload,
        );
        
        if (!isValid) {
          if (isProduction && !skipSignatureValidation) {
            this.logger.error('❌ FIRMA INVÁLIDA - Webhook rechazado en producción');
            throw new UnauthorizedException('Invalid webhook signature');
          } else {
            this.logger.warn('⚠️ Firma inválida - permitido solo en modo desarrollo');
          }
        } else {
          this.logger.log('✅ Firma del webhook verificada correctamente');
        }
      } else {
        // No hay eventsSecret configurado
        if (isProduction && !skipSignatureValidation) {
          this.logger.error('❌ WOMPI_EVENTS_SECRET no configurado - Webhook rechazado en producción');
          throw new UnauthorizedException('Wompi events secret not configured');
        } else {
          this.logger.warn('⚠️ wompiEventsSecret no configurado - permitido solo en modo desarrollo');
        }
      }

      // Mapear estado de Wompi a nuestro formato
      const status = this.wompi.mapWompiStatus(transactionStatus);
      
      // Actualizar pago con estado y transaction.id
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: status as any,
          wompiTransactionId: transactionId, // Actualizar al transaction.id real
          paidAt: status === 'APPROVED' ? new Date() : null,
        },
      });

      // Actualizar conversación si el pago fue aprobado
      if (status === 'APPROVED' && !payment.conversation.paymentCompleted) {
        await this.prisma.conversation.update({
          where: { id: payment.conversationId },
          data: { paymentCompleted: true },
        });
        this.logger.log('🎉 Pago aprobado y conversación actualizada!');
      }
      
      this.logger.log(`✅ Estado actualizado: ${updatedPayment.status}`);
      
      return updatedPayment;
    } else {
      this.logger.warn(`⚠️ Evento no manejado: ${event}`);
    }
  }

  async getPaymentsByConversation(conversationId: string) {
    return this.prisma.payment.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingPayment(conversationId: string) {
    return this.prisma.payment.findFirst({
      where: {
        conversationId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPaymentsByUser(userId: string, companyId: string) {
    // Obtener todas las conversaciones del usuario con la empresa
    const conversations = await this.prisma.conversation.findMany({
      where: {
        userId,
        companyId,
      },
      select: { id: true },
    });

    const conversationIds = conversations.map(c => c.id);

    if (conversationIds.length === 0) {
      return [];
    }

    // Buscar todos los pagos de esas conversaciones
    return this.prisma.payment.findMany({
      where: {
        conversationId: { in: conversationIds },
      },
      orderBy: { createdAt: 'desc' },
      take: 20, // Limitar a 20 pagos más recientes
    });
  }
}
