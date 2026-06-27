import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  async generateOtp(phoneNumber: string) {
    this.logger.warn('OTP service is not implemented. OTP generation is a stub.');
    throw new NotImplementedException('OTP service is not yet implemented');
  }

  async verifyOtp(phoneNumber: string, otp: string) {
    this.logger.warn('OTP service is not implemented. OTP verification is a stub.');
    throw new NotImplementedException('OTP service is not yet implemented');
  }
}
