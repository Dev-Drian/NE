import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';

export interface WompiCredentials {
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
}

@Injectable()
export class WompiService {
  private readonly logger = new Logger(WompiService.name);
  private readonly apiUrl = 'https://sandbox.wompi.co/v1';

  async createPaymentLink(
    credentials: WompiCredentials,
    data: {
      reference: string;
      amount: number;
      currency?: string;
      description: string;
      customerEmail: string;
      customerName?: string;
      redirectUrl?: string;
    },
  ) {
    try {
      const payload = {
        name: `Pago ${data.reference}`,
        description: data.description,
        single_use: false,
        collect_shipping: false,
        currency: data.currency || 'COP',
        amount_in_cents: Math.round(data.amount * 100),
        reference: data.reference,
        customer_data: {
          email: data.customerEmail,
          full_name: data.customerName || 'Cliente',
        },
        redirect_url: data.redirectUrl || `${process.env.APP_URL || 'http://localhost:3030'}/payments/callback`,
      };

      this.logger.log(`Creating payment link for ${data.customerEmail}`);

      // Payment links requieren autenticación con llave PRIVADA (Bearer token)
      const response = await axios.post(
        `${this.apiUrl}/payment_links`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${credentials.privateKey}`,
          },
        },
      );

      this.logger.log(`Payment link created: ${response.data.data.id}`);
      
      // Wompi no devuelve permalink, se construye con el transaction ID
      const paymentData = {
        ...response.data.data,
        permalink: `https://checkout.wompi.co/l/${response.data.data.id}`,
      };
      
      return paymentData;
    } catch (error) {
      this.logger.error(
        'Error creating payment link:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async getTransactionStatus(
    publicKey: string,
    transactionId: string,
  ) {
    try {
      const response = await axios.get(
        `${this.apiUrl}/transactions/${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${publicKey}`,
          },
        },
      );

      return response.data.data;
    } catch (error) {
      this.logger.error(
        'Error getting transaction status:',
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  verifySignature(
    eventsSecret: string,
    signature: string,
    timestamp: string,
    payload: any,
  ): boolean {
    try {
      const concatenated = `${timestamp}.${JSON.stringify(payload)}`;
      const expectedSignature = crypto
        .createHmac('sha256', eventsSecret)
        .update(concatenated)
        .digest('hex');

      return signature === expectedSignature;
    } catch (error) {
      this.logger.error('Error verifying signature:', error);
      return false;
    }
  }

  mapWompiStatus(wompiStatus: string): string {
    const statusMap: Record<string, string> = {
      APPROVED: 'APPROVED',
      DECLINED: 'DECLINED',
      VOIDED: 'VOIDED',
      ERROR: 'ERROR',
      PENDING: 'PENDING',
    };
    return statusMap[wompiStatus] || 'PENDING';
  }
}
