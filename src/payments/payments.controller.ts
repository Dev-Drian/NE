import { Controller, Post, Body, Headers, Get, Param, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.createPayment(createPaymentDto);
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('x-signature') signature: string,
    @Headers('x-timestamp') timestamp: string,
    @Body() payload: any,
  ) {
    this.logger.log('Webhook received:', JSON.stringify(payload));
    await this.paymentsService.handleWebhook(signature, timestamp, payload);
    return { received: true };
  }

  @Get(':id/status')
  async checkStatus(@Param('id') id: string) {
    return this.paymentsService.checkPaymentStatus(id);
  }

  @Get('conversation/:conversationId')
  async getPaymentsByConversation(@Param('conversationId') conversationId: string) {
    return this.paymentsService.getPaymentsByConversation(conversationId);
  }

  @Get('conversation/:conversationId/pending')
  async getPendingPayment(@Param('conversationId') conversationId: string) {
    return this.paymentsService.getPendingPayment(conversationId);
  }

  @Get('callback')
  async paymentCallback() {
    // Página de retorno después del pago
    return {
      message: 'Pago procesado. Por favor revisa tu WhatsApp para continuar.',
    };
  }
}
