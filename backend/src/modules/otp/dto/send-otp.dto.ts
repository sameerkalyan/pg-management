import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  @Matches(/^[+]?[\d\s-()]+$/, { message: 'Invalid phone number format' })
  phoneNumber: string;
}
