import { IsString, IsNotEmpty, Matches, MaxLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[+]?[\d\s-()]+$/, { message: 'Invalid phone number format' })
  phoneNumber: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  otp: string;
}
