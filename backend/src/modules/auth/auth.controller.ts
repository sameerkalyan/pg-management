import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Res,
  Query,
  Inject,
  UnauthorizedException,
  Req,
  Delete,
  BadRequestException,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetupMfaDto } from './dto/setup-mfa.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { User } from '../../entities/user.entity';
import { Public } from '../../common/decorators/public.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { SkipOrgStatusCheck } from '../../common/decorators/skip-org-status.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../../common/guards/google-auth.guard';

@ApiTags('auth')
@Controller('auth')
@SkipSubscriptionCheck()
@SkipOrgStatusCheck()
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 900 } })
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.register(registerDto);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { user, accessToken };
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result: any = await this.authService.login(loginDto);

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    const { refreshToken: _, ...response } = result;
    return response;
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Request() req, @Res() res: Response) {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedException('OAuth authentication failed');
    }

    // Generate state parameter for secure token exchange
    const state = crypto.randomBytes(32).toString('hex');
    await this.redis.setex(`oauth:state:${state}`, 300, JSON.stringify({ userId: req.user.id }));

    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const redirectUrl = `${frontendUrl}/oauth/callback?state=${state}`;

    return res.redirect(redirectUrl);
  }

  @Public()
  @Post('oauth/exchange')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Exchange OAuth state for tokens' })
  async exchangeOAuthToken(
    @Body('state') state: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!state) {
      throw new UnauthorizedException('State parameter required');
    }

    const stateData = await this.redis.get(`oauth:state:${state}`);
    if (!stateData) {
      throw new UnauthorizedException('Invalid or expired state');
    }

    const { userId } = JSON.parse(stateData);

    // Delete state after use
    await this.redis.del(`oauth:state:${state}`);

    const result: any = await this.authService.getOAuthLoginResult(userId);

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    const { refreshToken: _, ...response } = result;
    return response;
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Req() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const result = await this.authService.refreshToken({ refreshToken });

    // Rotate refresh token
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const { refreshToken: _, ...response } = result;
    return response;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user' })
  @ApiBearerAuth()
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    const user = req.user;

    // Invalidate all tokens for this user
    await this.authService.invalidateAllUserTokens(user.id);

    // Clear refresh token cookie with matching options
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    });

    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiBearerAuth()
  async me(@Request() req) {
    const user = await this.authService.getUserById(req.user.id);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.authService.sanitizeUser(user);
  }

  @Get('me/export')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Export user personal data (GDPR)' })
  @ApiBearerAuth()
  async exportData(@Request() req) {
    return this.authService.exportUserData(req.user.id);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete user account and anonymize data (GDPR)' })
  @ApiBearerAuth()
  async deleteAccount(@Request() req, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.deleteUserAccount(req.user.id);
    res.clearCookie('refreshToken');
    return result;
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600 } })
  @ApiOperation({ summary: 'Request password reset link' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 300 } })
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.password);
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate MFA secret for TOTP setup' })
  @ApiBearerAuth()
  async setupMfa(@Request() req) {
    return this.authService.generateMfaSecret(req.user.id);
  }

  @Post('mfa/enable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Enable MFA with TOTP token verification' })
  @ApiBearerAuth()
  async enableMfa(@Request() req, @Body() setupMfaDto: SetupMfaDto) {
    return this.authService.enableMfa(req.user.id, setupMfaDto.token);
  }

  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Disable MFA with TOTP token verification' })
  @ApiBearerAuth()
  async disableMfa(@Request() req, @Body() verifyMfaDto: VerifyMfaDto) {
    return this.authService.disableMfa(req.user.id, verifyMfaDto.code);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify MFA token' })
  @ApiBearerAuth()
  async verifyMfa(@Request() req, @Body() verifyMfaDto: VerifyMfaDto) {
    const isValid = await this.authService.verifyMfaForUser(req.user.id, verifyMfaDto.code);
    return { valid: isValid };
  }

  @Post('mfa/login')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Complete login with MFA verification' })
  @ApiBearerAuth()
  async mfaLogin(@Request() req, @Body() verifyMfaDto: VerifyMfaDto, @Res({ passthrough: true }) res: Response) {
    // Check lockout status BEFORE calling completeMfaLogin
    const user = await this.userRepository.findOne({
      where: { id: req.user.id },
      select: ['id', 'lockedUntil'],
    });

    if (user && user.lockedUntil && new Date() < user.lockedUntil) {
      const remainingTime = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        {
          statusCode: 423,
          message: `Account is locked. Please try again in ${remainingTime} minutes.`,
          remainingTime,
        },
        423,
      );
    }

    const result: any = await this.authService.completeMfaLogin(req.user.id, verifyMfaDto.code);

    if (result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    const { refreshToken: _, ...response } = result;
    return response;
  }
}
