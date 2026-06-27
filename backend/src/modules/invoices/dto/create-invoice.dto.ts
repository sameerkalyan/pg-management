import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  MaxLength,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InvoiceType } from '../../../entities/invoice.entity';

export class CreateInvoiceDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty({ required: false, description: 'Auto-generated if not provided' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  invoiceNumber?: string;

  @ApiProperty({ description: 'Amount in rupees (will be converted to paise)' })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  amount: number;

  @ApiProperty({ required: false, enum: InvoiceType })
  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  billingDate?: string;

  @ApiProperty()
  @IsDateString()
  @IsNotEmpty()
  dueDate: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
