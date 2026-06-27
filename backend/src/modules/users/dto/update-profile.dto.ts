import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ description: 'First name', required: false, example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ description: 'Last name', required: false, example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ description: 'Phone number', required: false, example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[\d\s\-\+\(\)]+$/, { message: 'Phone number must contain only digits, spaces, dashes, plus signs, and parentheses' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Avatar URL', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}
