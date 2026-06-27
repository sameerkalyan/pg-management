import { IsString, IsNotEmpty, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RenewSubscriptionDto {
  @ApiProperty({ description: 'New subscription plan ID' })
  @IsString()
  @MaxLength(50)
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ description: 'Payment ID for the renewal', required: false })
  @IsUUID()
  @IsOptional()
  paymentId?: string;
}
