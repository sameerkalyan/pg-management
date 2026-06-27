import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { User, UserStatus, UserRole } from '../../../entities/user.entity';
import { Organisation, OrganisationStatus } from '../../../entities/organisation.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    // Handle MFA-pending tokens — only allow access to MFA verification endpoints
    if (payload.mfaPending) {
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        organisationId: user.organisationId,
        mfaEnabled: user.mfaEnabled || false,
        mfaPending: true,
      };
    }

    // Handle subscription-pending tokens — allow access to subscription endpoints only
    if (payload.subscriptionPending) {
      return {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        organisationId: payload.organisationId,
        mfaEnabled: false,
        subscriptionPending: true,
      };
    }

    // Try cache first
    const cacheKey = `user:${payload.sub}`;
    const cachedUser = await this.redis.get(cacheKey);

    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: ['organisation'],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Check organisation status (not for SUPER_ADMIN)
    if (user.organisationId && user.role !== UserRole.SUPER_ADMIN) {
      if (!user.organisation) {
        throw new UnauthorizedException('Organisation not found');
      }
      if (user.organisation.status === OrganisationStatus.REJECTED) {
        throw new UnauthorizedException('Organisation has been rejected');
      }
      if (user.organisation.status === OrganisationStatus.SUSPENDED) {
        throw new UnauthorizedException('Organisation is suspended');
      }
    }

    const result = {
      id: user.id,
      email: user.email,
      role: user.role,
      organisationId: user.organisationId,
      mfaEnabled: user.mfaEnabled || false,
    };

    // Cache for 1 minute to reduce stale data risk
    await this.redis.setex(cacheKey, 60, JSON.stringify(result));

    return result;
  }
}
