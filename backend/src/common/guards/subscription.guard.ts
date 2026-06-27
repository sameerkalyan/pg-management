import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Subscription, SubscriptionStatus } from '../../entities/subscription.entity';
import { UserRole } from '../../entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    private reflector: Reflector,
  ) {}
  private readonly logger = new Logger(SubscriptionGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Skip for routes marked with @SkipSubscriptionCheck()
    const skipCheck = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user is set yet, skip - JwtAuthGuard will handle authentication
    if (!user) {
      return true;
    }

    // SUPER_ADMIN bypasses subscription checks
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Users without organisationId can't have subscriptions
    if (!user.organisationId) {
      throw new ForbiddenException('No organisation assigned. Please complete your registration.');
    }

    // Try cache first
    const cacheKey = `subscription:active:${user.organisationId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached === 'true') {
      return true;
    }

    if (cached === 'false') {
      throw new ForbiddenException('No active subscription. Please complete your subscription payment.');
    }

    // Check DB
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        organisationId: user.organisationId,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!subscription) {
      // Cache for 30 seconds to reduce DB load
      await this.redis.setex(cacheKey, 30, 'false');
      throw new ForbiddenException('No active subscription. Please complete your subscription payment.');
    }

    // Check if subscription is ACTIVE
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      // Cache for 60 seconds
      await this.redis.setex(cacheKey, 60, 'true');
      return true;
    }

    // Check if subscription is EXPIRED but within grace period
    if (subscription.status === SubscriptionStatus.EXPIRED) {
      if (subscription.gracePeriodEndDate && new Date() <= subscription.gracePeriodEndDate) {
        // Still within grace period - allow access
        this.logger.log(`Organisation ${user.organisationId} accessing during grace period`);
        await this.redis.setex(cacheKey, 60, 'true');
        return true;
      }
    }

    // No active subscription and not in grace period
    await this.redis.setex(cacheKey, 30, 'false');
    
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new ForbiddenException('Subscription cancelled. Please renew to continue access.');
    } else if (subscription.status === SubscriptionStatus.EXPIRED) {
      throw new ForbiddenException('Subscription expired. Please renew to continue access.');
    } else {
      throw new ForbiddenException('No active subscription. Please complete your subscription payment.');
    }
  }
}
