import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class MfaGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const mfaCode = request.headers['x-mfa-code'];

    if (!user || user.mfaEnabled === false) {
      throw new UnauthorizedException('User not found or MFA is not enabled');
    }

    // Verify MFA code
    if (!mfaCode) {
      throw new UnauthorizedException(
        'MFA code is required in the x-mfa-code header',
      );
    }

    const isValid = await this.authService.verifyMfaForUser(user.id, mfaCode);
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    return true;
  }
}
