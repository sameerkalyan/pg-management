import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export enum RazorpayEventType {
  PAYMENT_AUTHORIZED = 'payment.authorized',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_CAPTURED = 'payment.captured',
  PAYMENT_REFUNDED = 'payment.refunded',
}

export class RazorpayPaymentEntity {
  @IsString()
  @IsNotEmpty()
  id: string;

  amount: number;
  currency: string;
  status: string;
  order_id: string;
  invoice_id: string;
  notes: Record<string, any>;
}

export class RazorpayWebhookDto {
  @IsString()
  @IsNotEmpty()
  event: string;

  @IsObject()
  @IsNotEmpty()
  payload: {
    payment: {
      entity: RazorpayPaymentEntity;
    };
  };
}
