import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OtpService } from './otp.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('otp')
@Controller('otp')
export class OtpController {
  constructor(private otpService: OtpService) {}

  @Public()
  @Post('send')
  @Throttle({ default: { limit: 3, ttl: 300 } })
  @ApiOperation({ summary: 'Send OTP to phone number' })
  send(@Body() sendOtpDto: SendOtpDto) {
    return this.otpService.generateOtp(sendOtpDto.phoneNumber);
  }

  @Public()
  @Post('verify')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Verify OTP' })
  verify(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.otpService.verifyOtp(verifyOtpDto.phoneNumber, verifyOtpDto.otp);
  }
}
