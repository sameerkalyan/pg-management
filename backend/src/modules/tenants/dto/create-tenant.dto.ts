import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
  IsNumber,
  IsInt,
  IsUUID,
  IsEmail,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TenantStatus } from '../../../entities/tenant.entity';

export class CreateTenantDto {
  @ApiProperty({
    description: 'First name of the tenant',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Last name of the tenant',
    example: 'Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({
    description: 'Contact phone number of the tenant (exactly 10 digits)',
    example: '9876543210',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  phoneNumber: string;

  @ApiProperty({
    description: 'Email address of the tenant',
    example: 'john.doe@example.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'UUID of the bed to assign to this tenant',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  bedId: string;

  @ApiProperty({
    description: 'Check-in date for the tenant (ISO 8601 format)',
    example: '2024-01-15',
  })
  @IsDateString()
  @IsNotEmpty()
  checkInDate: string;

  @ApiProperty({
    description: 'Expected check-out date for the tenant (ISO 8601 format)',
    example: '2024-12-31',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  checkOutDate?: string;

  @ApiProperty({
    description: 'Security deposit amount in rupees',
    example: 10000,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  securityDeposit?: number;

  @ApiProperty({
    description: 'Name of emergency contact person',
    example: 'Jane Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @ApiProperty({
    description: 'Phone number of emergency contact person (exactly 10 digits)',
    example: '9876543211',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'Phone number must be exactly 10 digits' })
  emergencyContactPhone?: string;

  @ApiProperty({
    description: 'Current status of the tenant',
    enum: TenantStatus,
    example: TenantStatus.ACTIVE,
    required: false,
    default: TenantStatus.ACTIVE,
  })
  @IsEnum(TenantStatus)
  @IsOptional()
  status?: TenantStatus;

  @ApiProperty({
    description: 'Type of ID proof document (e.g., Aadhar, PAN, Passport)',
    example: 'Aadhar',
    required: false,
  })
  @IsString()
  @IsOptional()
  idProofType?: string;

  @ApiProperty({
    description: 'Day of the month for billing (1-31)',
    example: 1,
    minimum: 1,
    maximum: 31,
    required: false,
    default: 1,
  })
  @IsInt()
  @IsOptional()
  billingDate?: number;
}
