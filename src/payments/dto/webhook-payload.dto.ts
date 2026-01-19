export interface WompiWebhookPayload {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: string;
      payment_method_type: string;
      payment_method: any;
      status: string;
      status_message: string;
      created_at: string;
      finalized_at?: string;
      shipping_address?: any;
      redirect_url?: string;
      payment_link_id?: string;
      customer_data?: any;
    };
  };
  sent_at: string;
  timestamp: number;
  signature?: {
    checksum: string;
    properties: string[];
  };
  environment: string;
}
