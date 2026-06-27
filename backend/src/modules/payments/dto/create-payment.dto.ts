import { IsString, IsNotEmpty, IsNumber, IsEnum, Min, Max, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod, PaymentStatus } from '../../../entities/payment.entity';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'UUID of the invoice this payment is for',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @ApiProperty({
    description: 'Payment amount in paise (1 rupee = 100 paise)',
    example: 500000,
    minimum: 1,
    maximum: 10000000000,
  })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @Max(10000000000)
  amountPaise: number;

  @ApiProperty({
    description: 'Payment method used',
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
  })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  method: PaymentMethod;

  @ApiProperty({
    description: 'Transaction ID or reference number from payment gateway/bank',
    example: 'TXN123456789',
    required: false,
  })
  @IsString()
  @IsOptional()
  transactionId?: string;

  @ApiProperty({
    description: 'Additional notes or remarks about the payment',
    example: 'Payment received for January 2024 rent',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
