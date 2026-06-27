import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMyProfileDto {
  @ApiProperty({ description: 'Phone number', required: false, example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone number must not exceed 20 characters' })
  @Matches(/^[\d\s\-\+\(\)]+$/, { message: 'Phone number must contain only digits, spaces, dashes, plus signs, and parentheses' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Emergency contact name', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Emergency contact name must not exceed 100 characters' })
  emergencyContactName?: string;

  @ApiProperty({ description: 'Emergency contact phone', required: false, example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Emergency contact phone must not exceed 20 characters' })
  @Matches(/^[\d\s\-\+\(\)]+$/, { message: 'Phone number must contain only digits, spaces, dashes, plus signs, and parentheses' })
  emergencyContactPhone?: string;
}
