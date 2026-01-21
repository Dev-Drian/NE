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
      // Wompi calcula la firma usando solo las propiedades especificadas en signature.properties
      // y el timestamp del payload
      const signatureObj = payload?.signature;
      const timestampFromPayload = payload?.timestamp?.toString() || timestamp;
      
      if (!signatureObj || !signatureObj.properties) {
        this.logger.warn('⚠️ No hay signature.properties en el payload, usando método simple');
        // Fallback: usar todo el payload (método anterior)
        const concatenated = `${timestampFromPayload}.${JSON.stringify(payload)}`;
        const expectedSignature = crypto
          .createHmac('sha256', eventsSecret)
          .update(concatenated)
          .digest('hex');
        return signature === expectedSignature;
      }

      // Construir string con los valores en el orden especificado en properties
      const transaction = payload?.data?.transaction || {};
      const values: any[] = [];
      
      signatureObj.properties.forEach((prop: string) => {
        // Propiedades como "transaction.id" se acceden como transaction.id
        const keys = prop.split('.');
        if (keys[0] === 'transaction' && keys.length > 1) {
          const transactionKey = keys[1];
          const value = transaction[transactionKey];
          if (value !== undefined && value !== null) {
            // Convertir a string para asegurar consistencia
            values.push(String(value));
          }
        } else {
          const value = payload[prop] !== undefined ? payload[prop] : payload?.data?.[prop];
          if (value !== undefined && value !== null) {
            values.push(String(value));
          }
        }
      });

      // Concatenar: timestamp.valor1.valor2.valor3
      const concatenated = `${timestampFromPayload}.${values.join('.')}`;
      
      this.logger.log('🔐 Propiedades usadas para firma:', JSON.stringify(signatureObj.properties));
      this.logger.log('🔐 Valores extraídos:', JSON.stringify(values));
      this.logger.log('🔐 String concatenado:', concatenated);
      this.logger.log('🔐 Events Secret (primeros 10 chars):', eventsSecret?.substring(0, 10));
      
      const expectedSignature = crypto
        .createHmac('sha256', eventsSecret)
        .update(concatenated)
        .digest('hex');

      const isValid = signature === expectedSignature;
      
      if (!isValid) {
        this.logger.error('❌ Firma no coincide');
        this.logger.log('🔐 Firma esperada (calculada):', expectedSignature);
        this.logger.log('🔐 Firma recibida (del webhook):', signature);
        this.logger.log('🔐 Diferencia:', signature.length, 'vs', expectedSignature.length);
      } else {
        this.logger.log('✅ Firma válida');
      }

      return isValid;
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
