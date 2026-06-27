import { IsNotEmpty, IsUUID, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiateTenantPaymentDto {
  @ApiProperty({ description: 'Invoice ID to pay' })
  @IsUUID()
  @IsNotEmpty()
  invoiceId: string;

  @ApiProperty({ description: 'Amount to pay in paise' })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amountPaise: number;
}
