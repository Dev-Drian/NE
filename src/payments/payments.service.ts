import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

    if (!payment.wompiTransactionId) {
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
      this.logger.error('Error checking payment status:', error);
      throw error;
    }
  }

  async handleWebhook(
    signature: string,
    timestamp: string,
    payload: any,
  ) {
    const { event, data } = payload;

    if (event === 'transaction.updated') {
      const reference = data.transaction.reference;
      
      const payment = await this.prisma.payment.findUnique({
        where: { wompiReference: reference },
        include: { company: true },
      });

      if (!payment) {
        this.logger.warn(`Payment not found for reference: ${reference}`);
        return;
      }

      // Verificar firma con el secret de la empresa
      if (payment.company.wompiEventsSecret) {
        const isValid = this.wompi.verifySignature(
          payment.company.wompiEventsSecret,
          signature,
          timestamp,
          payload,
        );

        if (!isValid) {
          throw new BadRequestException('Invalid signature');
        }
      }

      await this.checkPaymentStatus(payment.id);
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
}
