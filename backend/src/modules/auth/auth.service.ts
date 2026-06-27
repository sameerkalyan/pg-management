import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as base32 from 'hi-base32';
import { User, UserRole, UserStatus } from '../../entities/user.entity';
import { Organisation, OrganisationStatus } from '../../entities/organisation.entity';
import { Subscription, SubscriptionStatus } from '../../entities/subscription.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConfigService } from '@nestjs/config';
import { sanitizeString } from '../../common/utils/sanitizer.util';
import { EmailService } from '../email/email.service';
import { EmailType } from '../../entities/email-log.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(registerDto: RegisterDto) {
    if (registerDto.email.length > 254) {
      throw new BadRequestException('Email is too long');
    }
    const normalizedEmail = registerDto.email.trim().toLowerCase();
    if (!this.isValidEmail(normalizedEmail)) {
      throw new BadRequestException('Invalid email format');
    }
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // NEVER allow SUPER_ADMIN or role override via self-registration
    const assignedRole = UserRole.OWNER;
    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Create organisation — use provided name or derive from user's name
    const orgName = registerDto.organisationName?.trim()
      ? sanitizeString(registerDto.organisationName.trim().substring(0, 200))
      : `${registerDto.firstName.trim()}'s Organisation`;

    // Ensure org name is unique
    let uniqueOrgName = orgName;
    let counter = 1;
    while (await this.organisationRepository.findOne({ where: { name: uniqueOrgName } })) {
      uniqueOrgName = `${orgName} (${counter})`;
      counter++;
    }

    let organisation = this.organisationRepository.create({
      name: uniqueOrgName,
      email: normalizedEmail,
      phone: registerDto.phoneNumber,
      status: OrganisationStatus.PENDING,
    });
    organisation = await this.organisationRepository.save(organisation);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      firstName: sanitizeString(registerDto.firstName?.trim().substring(0, 100)),
      lastName: sanitizeString(registerDto.lastName?.trim().substring(0, 100)),
      phoneNumber: registerDto.phoneNumber,
      role: assignedRole,
      organisationId: organisation?.id,
    });

    await this.userRepository.save(user);

    const tokens = await this.generateTokens(user);

    try {
      await this.emailService.sendEmail({
        to: normalizedEmail,
        subject: 'Welcome to PG Management',
        html: `
          <h2>Welcome to PG Management!</h2>
          <p>Hello ${registerDto.firstName},</p>
          <p>Your account has been created successfully.</p>
          <p>Your organisation <strong>${uniqueOrgName}</strong> is now pending approval.</p>
          <p>You will be notified once your organisation is approved.</p>
          <p>Regards,<br>PG Management Team</p>
        `,
        emailType: EmailType.WELCOME,
        organisationId: organisation.id,
      });
    } catch (err) {
      this.logger.warn(`Failed to send welcome email: ${err.message}`);
    }

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const normalizedEmail = loginDto.email.trim().toLowerCase();

    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.organisation', 'organisation')
      .where('user.email = :email', { email: normalizedEmail })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked — return 423 Locked status
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Account locked. Try again in ${remainingMinutes} minutes.`,
        423,
      );
    }

    // Clear lockout if expired
    if (user.lockedUntil && new Date() >= user.lockedUntil) {
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
      await this.userRepository.save(user);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check organisation status (not for SUPER_ADMIN)
    if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
      const org = await this.organisationRepository.findOne({
        where: { id: user.organisationId },
      });
      if (!org) {
        throw new UnauthorizedException('Organisation not found');
      }
      if (org.status === OrganisationStatus.REJECTED) {
        throw new UnauthorizedException('Organisation has been rejected');
      }
      if (org.status === OrganisationStatus.SUSPENDED) {
        throw new ForbiddenException('Organisation is suspended');
      }
      if (org.status === OrganisationStatus.PENDING) {
        throw new ForbiddenException('Organisation pending admin approval');
      }
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      // Increment failed attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        // Progressive lockout: 15 min, 30 min, 1 hour, 2 hours, 4 hours
        const lockoutMinutes = Math.min(15 * Math.pow(2, user.failedLoginAttempts - 5), 240);
        user.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
        this.logger.warn(
          `Account ${normalizedEmail} locked for ${lockoutMinutes} minutes after ${user.failedLoginAttempts} failed attempts`,
        );
      }

      await this.userRepository.save(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    // If MFA is enabled, return a limited-scope token for MFA verification only
    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, email: user.email, mfaPending: true },
        {
          secret: this.configService.get('JWT_SECRET'),
          expiresIn: '5m',
        },
      );
      return {
        user: this.sanitizeUser(user),
        accessToken: mfaToken,
        mfaRequired: true,
      };
    }

    // Check subscription status before issuing full tokens
    if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { organisationId: user.organisationId, status: SubscriptionStatus.ACTIVE },
      });
      if (!subscription) {
        // Return limited token so user can access subscription payment page
        const limitedToken = this.jwtService.sign(
          { sub: user.id, email: user.email, role: user.role, organisationId: user.organisationId, subscriptionPending: true },
          {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: '15m',
          },
        );
        return {
          user: this.sanitizeUser(user),
          accessToken: limitedToken,
          subscriptionRequired: true,
        };
      }
    }

    const tokens = await this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Check if token exists in Redis
      const storedToken = await this.redis.get(
        `refresh:${payload.sub}:${refreshTokenDto.refreshToken}`,
      );
      if (!storedToken) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['organisation'],
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check organisation status (not for SUPER_ADMIN)
      if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
        const org = await this.organisationRepository.findOne({
          where: { id: user.organisationId },
        });
        if (!org) {
          throw new UnauthorizedException('Organisation not found');
        }
        if (org.status === OrganisationStatus.REJECTED) {
          throw new UnauthorizedException('Organisation has been rejected');
        }
        if (org.status === OrganisationStatus.SUSPENDED) {
          throw new ForbiddenException('Organisation is suspended');
        }
        if (org.status === OrganisationStatus.PENDING) {
          throw new ForbiddenException('Organisation pending admin approval');
        }
      }

      // Delete old token (rotation)
      await this.redis.del(`refresh:${payload.sub}:${refreshTokenDto.refreshToken}`);

      const tokens = await this.generateTokens(user);

      return {
        user: this.sanitizeUser(user),
        ...tokens,
      };
    } catch (error) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(refreshTokenDto.refreshToken)
        .digest('hex')
        .substring(0, 16);
      this.logger.warn({
        message: 'Refresh token failed',
        error: error.message,
        tokenHash,
      });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION') || '7d',
    });

    // Store refresh token in Redis for validation and revocation
    const ttlSeconds =
      parseInt(this.configService.get('JWT_REFRESH_EXPIRATION', '7')) * 24 * 60 * 60;
    const sessionKey = `refresh:${user.id}:${refreshToken}`;

    // Check concurrent session limit (max 3) using Lua script for atomicity
    const luaScript = `
      local userId = ARGV[1]
      local sessionKey = ARGV[2]
      local ttl = tonumber(ARGV[3])
      local sessionData = ARGV[4]
      
      -- Get all existing sessions for this user
      local keys = redis.call('KEYS', 'refresh:' .. userId .. ':*')
      
      -- If we have 3 or more sessions, delete the oldest one
      if #keys >= 3 then
        local oldest = nil
        local oldestTime = nil
        
        for _, key in ipairs(keys) do
          local data = redis.call('GET', key)
          if data then
            local createdAt = string.match(data, '"createdAt":"([^"]+)"')
            if createdAt then
              if not oldestTime or createdAt < oldestTime then
                oldestTime = createdAt
                oldest = key
              end
            end
          end
        end
        
        if oldest then
          redis.call('DEL', oldest)
        end
      end
      
      -- Store the new session
      redis.call('SETEX', sessionKey, ttl, sessionData)
      return 1
    `;

    await this.redis.eval(
      luaScript,
      0,
      user.id,
      sessionKey,
      ttlSeconds.toString(),
      JSON.stringify({ userId: user.id, email: user.email, createdAt: new Date().toISOString() }),
    );

    return { accessToken, refreshToken };
  }

  sanitizeUser(user: User) {
    const { password, ...result } = user;
    return result;
  }

  async invalidateRefreshToken(userId: string, refreshToken: string) {
    await this.redis.del(`refresh:${userId}:${refreshToken}`);
  }

  async invalidateAllUserTokens(userId: string) {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const stream = this.redis.scanStream({
      match: `refresh:${userId}:*`,
      count: 100,
    });

    const keys: string[] = [];
    stream.on('data', (resultKeys: string[]) => keys.push(...resultKeys));

    await new Promise<void>((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }

  private isValidEmail(email: string): boolean {
    // More robust email validation
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  async validateOAuthUser(oauthUser: any) {
    const { googleId, email, firstName, lastName, picture } = oauthUser;

    // Validate required fields
    if (!googleId || !email || !firstName) {
      throw new UnauthorizedException('Invalid OAuth data');
    }

    // Sanitize inputs
    const sanitizedFirstName = firstName.trim().substring(0, 100);
    const sanitizedLastName = lastName?.trim().substring(0, 100) || '';
    const sanitizedEmail = email.trim().toLowerCase();

    // Validate email format
    if (!this.isValidEmail(sanitizedEmail)) {
      throw new UnauthorizedException('Invalid email format');
    }

    let user = await this.userRepository.findOne({
      where: { email: sanitizedEmail },
      relations: ['organisation'],
    });

    if (user) {
      // Check if account is locked — OAuth should not bypass lockout
      if (user.lockedUntil && new Date() < user.lockedUntil) {
        const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
        throw new HttpException(
          `Account locked. Try again in ${remainingMinutes} minutes.`,
          423,
        );
      }

      // Check if account is active
      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      // Update existing user with Google info if not already linked
      if (!user.googleId) {
        user.googleId = googleId;
        user.pictureUrl = picture;
        await this.userRepository.save(user);
      }
    } else {
      // Create new user from Google OAuth
      // Check if this email should be SUPER_ADMIN (from env whitelist)
      const superAdminEmails = this.configService
        .get('SUPER_ADMIN_EMAILS', '')
        .split(',')
        .map((e: string) => e.trim().toLowerCase())
        .filter((e: string) => e.length > 0);
      const isSuperAdmin = superAdminEmails.includes(sanitizedEmail);

      let organisationId: string | null = null;

      // If creating OWNER from OAuth, they need an organisation
      if (!isSuperAdmin) {
        // Check if organisation with this email already exists
        let org = await this.organisationRepository.findOne({
          where: { email: sanitizedEmail },
        });

        if (!org) {
          // Create new organisation with unique name
          const baseName = `${sanitizedFirstName}'s Organisation`;
          let orgName = baseName;
          let counter = 1;

          // Ensure name is unique
          while (await this.organisationRepository.findOne({ where: { name: orgName } })) {
            orgName = `${baseName} (${counter})`;
            counter++;
          }

          org = this.organisationRepository.create({
            name: orgName,
            email: sanitizedEmail,
            status: OrganisationStatus.PENDING,
          });
          org = await this.organisationRepository.save(org);
        }

        organisationId = org.id;
      }

      user = this.userRepository.create({
        googleId,
        email: sanitizedEmail,
        firstName: sanitizedFirstName,
        lastName: sanitizedLastName,
        pictureUrl: picture,
        role: isSuperAdmin ? UserRole.SUPER_ADMIN : UserRole.OWNER,
        organisationId,
      });
      await this.userRepository.save(user);
    }

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return user;
  }

  async getUserById(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });
    return user;
  }

  async getOAuthLoginResult(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new HttpException(
        `Account locked. Try again in ${remainingMinutes} minutes.`,
        423,
      );
    }

    // If MFA is enabled, return MFA-pending token
    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.sign(
        { sub: user.id, email: user.email, mfaPending: true },
        {
          secret: this.configService.get('JWT_SECRET'),
          expiresIn: '5m',
        },
      );
      return {
        user: this.sanitizeUser(user),
        accessToken: mfaToken,
        mfaRequired: true,
      };
    }

    // Check organisation status (not for SUPER_ADMIN)
    if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
      const org = await this.organisationRepository.findOne({
        where: { id: user.organisationId },
      });
      if (!org) {
        throw new UnauthorizedException('Organisation not found');
      }
      if (org.status === OrganisationStatus.REJECTED) {
        throw new UnauthorizedException('Organisation has been rejected');
      }
      if (org.status === OrganisationStatus.SUSPENDED) {
        throw new ForbiddenException('Organisation is suspended');
      }
      if (org.status === OrganisationStatus.PENDING) {
        throw new ForbiddenException('Organisation pending admin approval');
      }

      // Check subscription status
      const subscription = await this.subscriptionRepository.findOne({
        where: { organisationId: user.organisationId, status: SubscriptionStatus.ACTIVE },
      });
      if (!subscription) {
        const limitedToken = this.jwtService.sign(
          { sub: user.id, email: user.email, role: user.role, organisationId: user.organisationId, subscriptionPending: true },
          {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: '15m',
          },
        );
        return {
          user: this.sanitizeUser(user),
          accessToken: limitedToken,
          subscriptionRequired: true,
        };
      }
    }

    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  async exportUserData(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        googleId: !!user.googleId,
        pictureUrl: user.pictureUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      },
      organisation: user.organisation
        ? {
            id: user.organisation.id,
            name: user.organisation.name,
            status: user.organisation.status,
            createdAt: user.organisation.createdAt,
          }
        : null,
      exportedAt: new Date().toISOString(),
    };
  }

  async deleteUserAccount(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Prevent owners from deleting without transferring ownership
    if (user.role === UserRole.OWNER) {
      throw new BadRequestException(
        'Organisation owners must transfer ownership before deleting their account',
      );
    }

    // Anonymize PII and mark as deleted
    const anonymizedEmail = `deleted_${user.id.substring(0, 8)}@anonymized.local`;
    await this.userRepository.update(userId, {
      email: anonymizedEmail,
      firstName: 'Deleted',
      lastName: 'User',
      phoneNumber: null,
      password: '',
      googleId: null,
      pictureUrl: null,
      status: UserStatus.INACTIVE,
    });

    // Invalidate all tokens
    await this.invalidateAllUserTokens(userId);

    return { message: 'Account deleted successfully', anonymizedAt: new Date().toISOString() };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Hash the token before storing
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await this.userRepository.update(user.id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: resetExpires,
    });

    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    try {
      await this.emailService.sendEmail({
        to: normalizedEmail,
        subject: 'Password Reset - PG Management',
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your PG Management account.</p>
          <p>Click the link below to reset your password (valid for 1 hour):</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>If you did not request this, please ignore this email.</p>
          <p>Regards,<br>PG Management Team</p>
        `,
        emailType: EmailType.PASSWORD_RESET,
        organisationId: user.organisationId,
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${normalizedEmail}: ${error.message}`);
    }

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepository.findOne({
      where: { passwordResetToken: hashedToken },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!user.passwordResetExpires || new Date() > user.passwordResetExpires) {
      throw new BadRequestException('Reset token has expired');
    }

    // Check password reuse — compare new password with existing hash
    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw new BadRequestException('New password cannot be the same as the old password');
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    // Invalidate all existing sessions
    await this.invalidateAllUserTokens(user.id);

    return { message: 'Password reset successfully' };
  }

  async generateMfaSecret(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate a random secret (base32 encoded for TOTP compatibility)
    const buffer = crypto.randomBytes(20);
    const secret = base32.encode(buffer).replace(/=/g, ''); // Remove padding

    // Encrypt the secret before storing
    const encryptionKey =
      this.configService.get('MFA_ENCRYPTION_KEY') || this.configService.get('JWT_SECRET');
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new BadRequestException(
        'MFA encryption key must be at least 32 characters. Set MFA_ENCRYPTION_KEY or ensure JWT_SECRET is at least 32 characters.',
      );
    }
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey.slice(0, 32)),
      iv,
    );
    let encryptedSecret = cipher.update(secret, 'utf8', 'hex');
    encryptedSecret += cipher.final('hex');
    const encryptedSecretWithIv = iv.toString('hex') + ':' + encryptedSecret;

    // Store the encrypted secret temporarily (not enabled yet)
    await this.userRepository.update(userId, {
      mfaSecret: encryptedSecretWithIv,
      mfaEnabled: false,
    });

    // Generate QR code URI for TOTP apps
    const issuer = 'PG Management';
    const accountName = user.email;
    const otpauthUri = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

    return {
      otpauthUri,
      secret,
      message: 'Scan this QR code with your authenticator app',
    };
  }

  async enableMfa(userId: string, token: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'mfaSecret', 'mfaEnabled'],
    });
    if (!user || !user.mfaSecret) {
      throw new BadRequestException('MFA setup not initiated');
    }

    // Decrypt the secret
    const encryptionKey =
      this.configService.get('MFA_ENCRYPTION_KEY') || this.configService.get('JWT_SECRET');
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new BadRequestException('MFA encryption key misconfigured');
    }
    const encryptedSecretWithIv = user.mfaSecret;
    const parts = encryptedSecretWithIv.split(':');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed MFA secret - invalid format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedSecret = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey.slice(0, 32)),
      iv,
    );
    let decryptedSecret = decipher.update(encryptedSecret, 'hex', 'utf8');
    decryptedSecret += decipher.final('utf8');

    if (!this.verifyTotpToken(decryptedSecret, token)) {
      throw new BadRequestException('Invalid TOTP token');
    }

    // Enable MFA
    await this.userRepository.update(userId, {
      mfaEnabled: true,
    });

    // Invalidate cached user so JWT strategy picks up mfaEnabled: true
    await this.redis.del(`user:${userId}`);

    return { message: 'MFA enabled successfully' };
  }

  async disableMfa(userId: string, token: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'mfaSecret', 'mfaEnabled'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.mfaEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    // Decrypt the secret
    const encryptionKey =
      this.configService.get('MFA_ENCRYPTION_KEY') || this.configService.get('JWT_SECRET');
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new BadRequestException('MFA encryption key misconfigured');
    }
    const encryptedSecretWithIv = user.mfaSecret;
    const parts = encryptedSecretWithIv.split(':');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed MFA secret - invalid format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedSecret = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey.slice(0, 32)),
      iv,
    );
    let decryptedSecret = decipher.update(encryptedSecret, 'hex', 'utf8');
    decryptedSecret += decipher.final('utf8');

    // Verify TOTP before disabling
    if (!this.verifyTotpToken(decryptedSecret, token)) {
      throw new BadRequestException('Invalid TOTP token');
    }

    // Disable MFA
    await this.userRepository.update(userId, {
      mfaSecret: null,
      mfaEnabled: false,
    });

    // Invalidate cached user
    await this.redis.del(`user:${userId}`);

    return { message: 'MFA disabled successfully' };
  }

  async completeMfaLogin(userId: string, mfaCode: string) {
    const isValid = await this.verifyMfaForUser(userId, mfaCode);
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check subscription status before issuing full tokens
    if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { organisationId: user.organisationId, status: SubscriptionStatus.ACTIVE },
      });
      if (!subscription) {
        const limitedToken = this.jwtService.sign(
          { sub: user.id, email: user.email, role: user.role, organisationId: user.organisationId, subscriptionPending: true },
          {
            secret: this.configService.get('JWT_SECRET'),
            expiresIn: '15m',
          },
        );
        return {
          user: this.sanitizeUser(user),
          accessToken: limitedToken,
          subscriptionRequired: true,
        };
      }
    }

    const tokens = await this.generateTokens(user);
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  private async isTotpCodeReused(userId: string, token: string, timeStep: number): Promise<boolean> {
    const reuseKey = `mfa:used:${userId}:${timeStep}`;
    const reused = await this.redis.get(reuseKey);
    return !!reused;
  }

  private async markTotpCodeUsed(userId: string, token: string, timeStep: number): Promise<void> {
    // Store for 90 seconds (3 TOTP windows) to prevent replay
    await this.redis.setex(`mfa:used:${userId}:${timeStep}`, 90, token);
  }

  verifyTotpToken(secret: string, token: string): boolean | number {
    // Decode base32 secret to raw bytes using hi-base32
    const key = Buffer.from(base32.decode(secret));

    // Simple TOTP verification
    const time = Math.floor(Date.now() / 1000 / 30);

    // Check current time step and 1 step before/after for clock skew
    for (let i = -1; i <= 1; i++) {
      const timeStep = time + i;
      const hmac = crypto.createHmac('sha1', key);
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(timeStep));
      hmac.update(counter);
      const digest = hmac.digest();

      const offset = digest[digest.length - 1] & 0x0f;
      const code =
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff);

      const otp = (code % 1000000).toString().padStart(6, '0');

      if (otp === token) {
        return timeStep; // Return the matched time step
      }
    }

    return false;
  }

  async verifyMfaForUser(userId: string, token: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'mfaSecret', 'mfaEnabled', 'failedLoginAttempts', 'lockedUntil'],
    });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return false;
    }

    // Check if account is locked from failed MFA attempts
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      this.logger.warn(`MFA verification blocked — account locked for user ${userId}`);
      return false;
    }

    // Decrypt the secret
    const encryptionKey =
      this.configService.get('MFA_ENCRYPTION_KEY') || this.configService.get('JWT_SECRET');
    if (!encryptionKey || encryptionKey.length < 32) {
      return false;
    }
    const encryptedSecretWithIv = user.mfaSecret;
    const parts = encryptedSecretWithIv.split(':');
    if (parts.length !== 2) {
      this.logger.error(`Malformed MFA secret for user ${userId}`);
      return false;
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedSecret = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(encryptionKey.slice(0, 32)),
      iv,
    );
    let decryptedSecret = decipher.update(encryptedSecret, 'hex', 'utf8');
    decryptedSecret += decipher.final('utf8');

    const matchedTimeStep = this.verifyTotpToken(decryptedSecret, token);

    if (matchedTimeStep !== false) {
      // Check for replay — prevent reusing the same TOTP code
      if (await this.isTotpCodeReused(userId, token, matchedTimeStep as number)) {
        this.logger.warn(`MFA replay detected for user ${userId}`);
        return false;
      }
      // Mark only the specific time step that matched as used
      await this.markTotpCodeUsed(userId, token, matchedTimeStep as number);
      // Reset failed attempts on successful MFA
      if (user.failedLoginAttempts > 0 || user.lockedUntil) {
        await this.userRepository.update(userId, {
          failedLoginAttempts: 0,
          lockedUntil: null,
        });
      }
      return true;
    }

    // Increment failed MFA attempts — lock after 5
    const failedAttempts = (user.failedLoginAttempts || 0) + 1;
    if (failedAttempts >= 5) {
      const lockoutMinutes = Math.min(15 * Math.pow(2, failedAttempts - 5), 240);
      await this.userRepository.update(userId, {
        failedLoginAttempts: failedAttempts,
        lockedUntil: new Date(Date.now() + lockoutMinutes * 60000),
      });
      this.logger.warn(
        `Account ${user.email} locked for ${lockoutMinutes} minutes after ${failedAttempts} failed MFA attempts`,
      );
    } else {
      await this.userRepository.update(userId, {
        failedLoginAttempts: failedAttempts,
      });
    }

    return false;
  }
}
