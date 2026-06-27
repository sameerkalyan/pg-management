import { Injectable, Logger, NotImplementedException } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendSms(phoneNumber: string, message: string) {
    this.logger.warn(
      `SMS service is not implemented. SMS to ${phoneNumber} was not sent. Message: ${message.substring(0, 50)}...`,
    );
    throw new NotImplementedException(
      'SMS service is not yet implemented. Configure an SMS provider (e.g., Twilio, MSG91) to enable SMS notifications.',
    );
  }
}
