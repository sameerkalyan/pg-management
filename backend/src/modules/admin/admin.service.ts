import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import Redis from 'ioredis';
import { Organisation, OrganisationStatus } from '../../entities/organisation.entity';
import { User, UserRole, UserStatus } from '../../entities/user.entity';
import { Subscription, SubscriptionStatus } from '../../entities/subscription.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { RejectOrganisationDto, SuspendOrganisationDto } from './dto/approve-organisation.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private emailService: EmailService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  private async invalidateOrgStatusCache(organisationId: string): Promise<void> {
    // SWE-55 — invalidate cached organisation status so guards re-query the DB
    try {
      await this.redis.del(`org:status:${organisationId}`);
      // Also invalidate cached user data for all users in this organisation
      // so JWT strategy re-checks organisation status
      const userKeys = await this.redis.keys('user:*');
      if (userKeys.length > 0) {
        await this.redis.del(...userKeys);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate organisation status cache for ${organisationId}: ${(error as Error).message}`,
      );
    }
  }

  private async revokeAllOrgUserTokens(organisationId: string): Promise<void> {
    try {
      const users = await this.userRepository.find({
        where: { organisationId },
        select: ['id'],
      });
      for (const user of users) {
        const stream = this.redis.scanStream({
          match: `refresh:${user.id}:*`,
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
    } catch (error) {
      this.logger.warn(
        `Failed to revoke refresh tokens for org ${organisationId}: ${(error as Error).message}`,
      );
    }
  }

  async findAllOrganisations(status?: OrganisationStatus, page = 1, limit = 50) {
    const validatedLimit = Math.min(limit, 100); // Max 100 per page
    const validatedPage = Math.max(page, 1);
    const skip = (validatedPage - 1) * validatedLimit;

    const query = this.organisationRepository
      .createQueryBuilder('organisation')
      .leftJoinAndSelect('organisation.users', 'users', 'users.role = :ownerRole', {
        ownerRole: UserRole.OWNER,
      })
      .orderBy('organisation.createdAt', 'DESC')
      .skip(skip)
      .take(validatedLimit);

    if (status) {
      query.andWhere('organisation.status = :status', { status });
    }

    const [organisations, total] = await query.getManyAndCount();

    // Get subscription status for each organisation
    const organisationIds = organisations.map((org) => org.id);
    const subscriptions = await this.subscriptionRepository.find({
      where: { organisationId: In(organisationIds) },
    });

    const subscriptionMap = new Map<string, any>();
    subscriptions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .forEach((sub) => {
        // Only set if not already set (latest subscription wins)
        if (!subscriptionMap.has(sub.organisationId)) {
          subscriptionMap.set(sub.organisationId, {
            status: sub.status,
            endDate: sub.endDate,
            amountPaise: sub.amountPaise,
          });
        }
      });

    return {
      data: organisations.map((org) => ({
        id: org.id,
        name: org.name,
        email: org.email,
        phone: org.phone,
        address: org.address,
        city: org.city,
        state: org.state,
        pincode: org.pincode,
        status: org.status,
        rejectionReason: org.rejectionReason,
        createdAt: org.createdAt,
        userCount: org.users.length,
        owner: (() => {
          const owner = org.users.find((u) => u.role === UserRole.OWNER);
          return owner ? { id: owner.id, firstName: owner.firstName, lastName: owner.lastName, email: owner.email } : null;
        })(),
        subscription: subscriptionMap.get(org.id) || null,
      })),
      meta: {
        total,
        page: validatedPage,
        limit: validatedLimit,
        totalPages: Math.ceil(total / validatedLimit),
      },
    };
  }

  async findOneOrganisation(id: string) {
    const organisation = await this.organisationRepository.findOne({
      where: { id },
      relations: ['users', 'properties'],
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Fetch latest subscription for the organisation
    const subscription = await this.subscriptionRepository.findOne({
      where: { organisationId: id },
      order: { createdAt: 'DESC' },
    });

    return {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      phone: organisation.phone,
      address: organisation.address,
      city: organisation.city,
      state: organisation.state,
      pincode: organisation.pincode,
      status: organisation.status,
      rejectionReason: organisation.rejectionReason,
      settings: organisation.settings,
      createdAt: organisation.createdAt,
      updatedAt: organisation.updatedAt,
      users: organisation.users.map((user) => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      })),
      properties: organisation.properties.map((property) => ({
        id: property.id,
        name: property.name,
        address: property.address,
        status: property.status,
        createdAt: property.createdAt,
      })),
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            planId: subscription.planId,
            amountPaise: subscription.amountPaise,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
          }
        : null,
    };
  }

  async approveOrganisation(id: string, adminUserId: string) {
    const result = await this.organisationRepository.manager.transaction(async (manager) => {
      const organisation = await manager.findOne(Organisation, { where: { id } });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      if (organisation.status !== OrganisationStatus.PENDING) {
        throw new ForbiddenException('Can only approve pending organisations');
      }

      // Check if organisation has an active subscription payment
      const subscription = await manager.findOne(Subscription, {
        where: { organisationId: id },
        order: { createdAt: 'DESC' },
      });

      if (!subscription) {
        throw new ForbiddenException('Organisation must have a paid subscription before approval');
      }

      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new ForbiddenException('Organisation subscription must be active before approval');
      }

      // Validate subscription is not expired
      const now = new Date();
      if (new Date(subscription.endDate) < now) {
        throw new BadRequestException('Subscription has expired. Please renew before approval.');
      }

      const previousStatus = organisation.status;
      organisation.status = OrganisationStatus.APPROVED;
      organisation.rejectionReason = null;
      await manager.save(organisation);

      // Log audit
      this.logger.log({
        action: 'ORGANISATION_APPROVED',
        entityType: 'Organisation',
        entityId: organisation.id,
        performedBy: adminUserId,
        details: {
          previousStatus,
          newStatus: organisation.status,
          organisationName: organisation.name,
          subscriptionId: subscription.id,
        },
      });

      // Send approval email to organisation owner
      const owner = await manager.findOne(User, {
        where: { organisationId: id, role: UserRole.OWNER },
      });
      if (owner?.email) {
        await this.emailService.sendOrganisationApprovalNotification(
          owner.email,
          organisation.name,
        );
      }

      return {
        message: 'Organisation approved successfully',
        organisation: {
          id: organisation.id,
          name: organisation.name,
          status: organisation.status,
        },
      };
    });

    // SWE-55 — Invalidate cached organisation status AFTER transaction commits
    await this.invalidateOrgStatusCache(id);
    return result;
  }

  async rejectOrganisation(id: string, rejectDto: RejectOrganisationDto, adminUserId: string) {
    const result = await this.organisationRepository.manager.transaction(async (manager) => {
      const organisation = await manager.findOne(Organisation, { where: { id } });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      if (organisation.status !== OrganisationStatus.PENDING) {
        throw new ForbiddenException('Can only reject pending organisations');
      }

      const previousStatus = organisation.status;
      organisation.status = OrganisationStatus.REJECTED;
      organisation.rejectionReason = rejectDto.rejectionReason || 'No reason provided';
      await manager.save(organisation);

      // Log audit
      this.logger.log({
        action: 'ORGANISATION_REJECTED',
        entityType: 'Organisation',
        entityId: organisation.id,
        performedBy: adminUserId,
        details: {
          previousStatus,
          newStatus: organisation.status,
          organisationName: organisation.name,
          rejectionReason: organisation.rejectionReason,
        },
      });

      // Send rejection email to organisation owner
      const owner = await manager.findOne(User, {
        where: { organisationId: id, role: UserRole.OWNER },
      });
      if (owner?.email) {
        await this.emailService.sendOrganisationRejectionNotification(
          owner.email,
          organisation.name,
          organisation.rejectionReason,
        );
      }

      return {
        message: 'Organisation rejected successfully',
        organisation: {
          id: organisation.id,
          name: organisation.name,
          status: organisation.status,
          rejectionReason: organisation.rejectionReason,
        },
      };
    });

    // SWE-55 — Invalidate cached organisation status AFTER transaction commits
    await this.invalidateOrgStatusCache(id);
    return result;
  }

  async suspendOrganisation(id: string, suspendDto: SuspendOrganisationDto, adminUserId: string) {
    const result = await this.organisationRepository.manager.transaction(async (manager) => {
      const organisation = await manager.findOne(Organisation, { where: { id } });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      if (organisation.status !== OrganisationStatus.APPROVED) {
        throw new ForbiddenException('Can only suspend approved organisations');
      }

      const previousStatus = organisation.status;
      organisation.status = OrganisationStatus.SUSPENDED;
      organisation.rejectionReason = suspendDto.reason || 'No reason provided';
      await manager.save(organisation);

      // Disable all active users in the organisation
      await manager.update(
        User,
        { organisationId: id, status: UserStatus.ACTIVE },
        { status: UserStatus.SUSPENDED },
      );

      // Log audit
      this.logger.log({
        action: 'ORGANISATION_SUSPENDED',
        entityType: 'Organisation',
        entityId: organisation.id,
        performedBy: adminUserId,
        details: {
          previousStatus,
          newStatus: organisation.status,
          organisationName: organisation.name,
        },
      });

      // Send suspension email to organisation owner
      const owner = await manager.findOne(User, {
        where: { organisationId: id, role: UserRole.OWNER },
      });
      if (owner?.email) {
        await this.emailService.sendOrganisationSuspensionNotification(
          owner.email,
          organisation.name,
        );
      }

      return {
        message: 'Organisation suspended successfully',
        organisation: {
          id: organisation.id,
          name: organisation.name,
          status: organisation.status,
        },
      };
    });

    // SWE-55 — Invalidate cached organisation status AFTER transaction commits
    await this.invalidateOrgStatusCache(id);
    // Revoke all refresh tokens so suspended users can't get new access tokens
    await this.revokeAllOrgUserTokens(id);
    return result;
  }

  async reactivateOrganisation(id: string, adminUserId: string) {
    const result = await this.organisationRepository.manager.transaction(async (manager) => {
      const organisation = await manager.findOne(Organisation, { where: { id } });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      if (
        organisation.status !== OrganisationStatus.SUSPENDED &&
        organisation.status !== OrganisationStatus.INACTIVE
      ) {
        throw new ForbiddenException('Can only reactivate suspended or inactive organisations');
      }

      // Check if organisation has an active subscription before reactivating
      const subscription = await manager.findOne(Subscription, {
        where: { organisationId: id },
        order: { createdAt: 'DESC' },
      });

      if (!subscription) {
        throw new ForbiddenException('Organisation must have an active subscription before reactivation');
      }

      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        throw new ForbiddenException('Organisation subscription must be active before reactivation');
      }

      const now = new Date();
      if (new Date(subscription.endDate) < now) {
        throw new BadRequestException('Subscription has expired. Please renew before reactivation.');
      }

      const previousStatus = organisation.status;
      organisation.status = OrganisationStatus.APPROVED;
      await manager.save(organisation);

      // Re-enable all suspended users in the organisation
      await manager.update(
        User,
        { organisationId: id, status: In([UserStatus.SUSPENDED, UserStatus.INACTIVE]) },
        { status: UserStatus.ACTIVE },
      );

      // Log audit
      this.logger.log({
        action: 'ORGANISATION_REACTIVATED',
        entityType: 'Organisation',
        entityId: organisation.id,
        performedBy: adminUserId,
        details: {
          previousStatus,
          newStatus: organisation.status,
          organisationName: organisation.name,
        },
      });

      // Send reactivation email to organisation owner
      const owner = await manager.findOne(User, {
        where: { organisationId: id, role: UserRole.OWNER },
      });
      if (owner?.email) {
        await this.emailService.sendOrganisationReactivationNotification(
          owner.email,
          organisation.name,
        );
      }

      return {
        message: 'Organisation reactivated successfully',
        organisation: {
          id: organisation.id,
          name: organisation.name,
          status: organisation.status,
        },
      };
    });

    // SWE-55 — Invalidate cached organisation status AFTER transaction commits
    await this.invalidateOrgStatusCache(id);
    return result;
  }

  async getOrganisationStats() {
    // Optimized single query for organisation stats
    const orgStats = await this.organisationRepository
      .createQueryBuilder('organisation')
      .select('organisation.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('organisation.status')
      .getRawMany();

    const statsMap = new Map<string, number>();
    orgStats.forEach((stat) => {
      statsMap.set(stat.status, parseInt(stat.count));
    });

    const total =
      (statsMap.get(OrganisationStatus.PENDING) || 0) +
      (statsMap.get(OrganisationStatus.APPROVED) || 0) +
      (statsMap.get(OrganisationStatus.REJECTED) || 0) +
      (statsMap.get(OrganisationStatus.SUSPENDED) || 0) +
      (statsMap.get(OrganisationStatus.INACTIVE) || 0);

    const totalUsers = await this.userRepository.count();
    const activeUsers = await this.userRepository.count({ where: { status: UserStatus.ACTIVE } });

    // Total revenue from completed payments
    const revenueResult = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amountPaise), 0)', 'totalRevenue')
      .where('payment.status = :status', { status: PaymentStatus.COMPLETED })
      .getRawOne();

    return {
      organisations: {
        total,
        pending: statsMap.get(OrganisationStatus.PENDING) || 0,
        approved: statsMap.get(OrganisationStatus.APPROVED) || 0,
        rejected: statsMap.get(OrganisationStatus.REJECTED) || 0,
        suspended: statsMap.get(OrganisationStatus.SUSPENDED) || 0,
      },
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      revenue: {
        totalRevenuePaise: parseInt(revenueResult.totalRevenue) || 0,
      },
    };
  }
}
