import { IsString, IsNotEmpty, IsEmail, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganisationDto {
  @ApiProperty({ description: 'Organisation name', example: 'My PG Business', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Organisation address', required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiProperty({ description: 'City', required: false, example: 'Mumbai', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiProperty({ description: 'State', required: false, example: 'Maharashtra', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  state?: string;

  @ApiProperty({ description: 'Pincode (6 digits)', required: false, example: '400001' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[0-9]{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @ApiProperty({ description: 'Phone number', required: false, example: '+91-9876543210', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[\d\s\-\+\(\)]+$/, { message: 'Phone number must contain only digits, spaces, dashes, plus signs, and parentheses' })
  phone?: string;

  @ApiProperty({ description: 'Email address', required: false, example: 'contact@mypg.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
