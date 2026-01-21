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
    @Headers('x-signature') headerSignature: string,
    @Headers('x-timestamp') headerTimestamp: string,
    @Headers() allHeaders: Record<string, string>,
    @Body() payload: any,
  ) {
    // Log completo de headers
    this.logger.log('=== WEBHOOK RECIBIDO ===');
    this.logger.log('Timestamp:', new Date().toISOString());
    this.logger.log('Headers completos:', JSON.stringify(allHeaders, null, 2));
    
    // Wompi envía la firma en el payload, no en headers
    const signature = payload?.signature?.checksum || headerSignature;
    const timestamp = payload?.timestamp?.toString() || headerTimestamp;
    
    this.logger.log('Signature (del payload):', payload?.signature?.checksum);
    this.logger.log('Signature (del header):', headerSignature);
    this.logger.log('Timestamp (del payload):', payload?.timestamp);
    this.logger.log('Timestamp (del header):', headerTimestamp);
    this.logger.log('Signature usado:', signature);
    this.logger.log('Timestamp usado:', timestamp);
    
    // Log del payload completo
    this.logger.log('Payload completo:', JSON.stringify(payload, null, 2));
    this.logger.log('Event:', payload?.event);
    this.logger.log('Data:', JSON.stringify(payload?.data, null, 2));
    
    try {
      await this.paymentsService.handleWebhook(signature, timestamp, payload);
      this.logger.log('✅ Webhook procesado correctamente');
      return { received: true, processed: true };
    } catch (error) {
      this.logger.error('❌ Error procesando webhook:', error);
      this.logger.error('Error stack:', error?.stack);
      throw error;
    }
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
