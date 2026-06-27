import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Organisation, OrganisationStatus } from '../../entities/organisation.entity';
import { UserRole } from '../../entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_ORG_STATUS_KEY } from '../decorators/skip-org-status.decorator';

@Injectable()
export class OrganisationStatusGuard implements CanActivate {
  constructor(
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    private reflector: Reflector,
  ) {}
  private readonly logger = new Logger(OrganisationStatusGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip guard for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // Skip for routes marked with @SkipOrgStatusCheck()
    const skipOrgCheck = this.reflector.getAllAndOverride<boolean>(SKIP_ORG_STATUS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipOrgCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no user is set yet, skip - the JwtAuthGuard will handle authentication
    if (!user) {
      return true;
    }

    // SUPER_ADMIN bypasses organisation checks
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Users without organisationId (shouldn't happen for non-super-admins)
    if (!user.organisationId) {
      throw new UnauthorizedException('No organisation assigned');
    }

    // Try cache first
    const cacheKey = `org:status:${user.organisationId}`;
    const cachedStatus = await this.redis.get(cacheKey);

    if (cachedStatus === 'APPROVED') {
      return true;
    }

    if (cachedStatus === 'PENDING') {
      throw new ForbiddenException('Organisation pending admin approval');
    }

    if (cachedStatus && cachedStatus !== 'APPROVED' && cachedStatus !== 'PENDING') {
      throw new UnauthorizedException(`Organisation status: ${cachedStatus}`);
    }

    const organisation = await this.organisationRepository.findOne({
      where: { id: user.organisationId },
    });

    if (!organisation) {
      throw new UnauthorizedException('Organisation not found');
    }

    // Cache status
    await this.redis.setex(cacheKey, 60, organisation.status);

    if (organisation.status === OrganisationStatus.REJECTED) {
      throw new UnauthorizedException('Organisation has been rejected');
    }

    if (organisation.status === OrganisationStatus.SUSPENDED) {
      throw new UnauthorizedException('Organisation is suspended');
    }

    // Only APPROVED organisations can access feature routes
    if (organisation.status !== OrganisationStatus.APPROVED) {
      throw new ForbiddenException('Organisation pending admin approval');
    }

    return true;
  }
}
