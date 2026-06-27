import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription, SubscriptionStatus } from '../../../entities/subscription.entity';
import { Organisation, OrganisationStatus } from '../../../entities/organisation.entity';
import { User, UserRole } from '../../../entities/user.entity';
import { EmailService } from '../../email/email.service';

@Processor('subscription-expiry')
export class SubscriptionExpiryProcessor {
  private readonly logger = new Logger(SubscriptionExpiryProcessor.name);
  private readonly LOCK_TTL = 60;

  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
    @Inject('REDIS_CLIENT')
    private redis: any,
  ) {}

  private async acquireLock(lockKey: string): Promise<boolean> {
    const result = await this.redis.set(lockKey, 'locked', 'NX', 'EX', this.LOCK_TTL);
    return result === 'OK';
  }

  private async releaseLock(lockKey: string): Promise<void> {
    await this.redis.del(lockKey);
  }

  @Process('check-expiry')
  async handleCheckExpiry(job: Job) {
    const lockKey = 'lock:subscription:expiry-check';
    const acquired = await this.acquireLock(lockKey);
    if (!acquired) {
      this.logger.log('Subscription expiry check already in progress, skipping');
      return;
    }

    try {
      this.logger.log('Starting subscription expiry check...');
      const now = new Date();
      const GRACE_PERIOD_DAYS = 7;

      // Step 1: Find active subscriptions past endDate without grace period set
      const newExpired = await this.subscriptionRepository
        .createQueryBuilder('subscription')
        .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('subscription.end_date < :now', { now })
        .andWhere('subscription.grace_period_end_date IS NULL')
        .getMany();

      // Grace period batch save (BUG-53 fix: single batch update instead of N+1 writes)
      if (newExpired.length > 0) {
        const ids = newExpired.map((s) => s.id);
        await this.subscriptionRepository
          .createQueryBuilder()
          .update(Subscription)
          .set({
            gracePeriodEndDate: () => `"end_date" + INTERVAL '${GRACE_PERIOD_DAYS} days'`,
          })
          .where('id IN (:...ids)', { ids })
          .execute();
        this.logger.log(`Set grace period for ${newExpired.length} subscriptions`);
      }

      // Step 2: Find subscriptions whose grace period has ended
      const graceExpired = await this.subscriptionRepository
        .createQueryBuilder('subscription')
        .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('subscription.grace_period_end_date IS NOT NULL')
        .andWhere('subscription.grace_period_end_date < :now', { now })
        .leftJoinAndSelect('subscription.organisation', 'organisation')
        .getMany();

      this.logger.log(`Found ${graceExpired.length} subscriptions past grace period`);

      if (graceExpired.length > 0) {
        const ids = graceExpired.map((s) => s.id);

        // Batch update all grace-expired subscriptions
        await this.subscriptionRepository
          .createQueryBuilder()
          .update(Subscription)
          .set({ status: SubscriptionStatus.EXPIRED })
          .where('id IN (:...ids)', { ids })
          .execute();

        this.logger.log(`Updated ${graceExpired.length} subscriptions to EXPIRED status`);

        for (const subscription of graceExpired) {
          // Skip if grace period notification already sent
          if (subscription.gracePeriodNotifiedAt) {
            this.logger.log(
              `Skipping grace period notification for subscription ${subscription.id} - already sent`,
            );
            continue;
          }

          const owner = await this.userRepository.findOne({
            where: {
              organisationId: subscription.organisationId,
              role: UserRole.OWNER,
            },
          });
          
          if (owner?.email) {
            await this.emailService.sendSubscriptionExpiryNotification(
              owner.email,
              subscription.organisation.name,
              subscription.endDate,
              subscription.gracePeriodEndDate,
            );
            
            // Mark as notified
            await this.subscriptionRepository.update(subscription.id, {
              gracePeriodNotifiedAt: new Date(),
            });
            
            this.logger.log(
              `Grace period notification sent to ${owner.email} for subscription ${subscription.id}`,
            );
          }
          // TODO: Optionally suspend organisation after grace period
        }
      }

      this.logger.log('Subscription expiry check completed successfully');
    } catch (error) {
      this.logger.error('Error during subscription expiry check:', error);
      throw error;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  @Process('check-reminders')
  async handleCheckReminders(job: Job) {
    this.logger.log('Starting subscription reminder check...');

    try {
      const now = new Date();
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      // Find subscriptions expiring in 4-7 days (exclusive of 3-day window to avoid duplicates)
      const sevenDayExpiring = await this.subscriptionRepository
        .createQueryBuilder('subscription')
        .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('subscription.end_date > :threeDays AND subscription.end_date <= :sevenDays', {
          threeDays: threeDaysFromNow,
          sevenDays: sevenDaysFromNow,
        })
        .leftJoinAndSelect('subscription.organisation', 'organisation')
        .leftJoinAndSelect('organisation.users', 'users')
        .getMany();

      // Find subscriptions expiring in 3 days
      const threeDayExpiring = await this.subscriptionRepository
        .createQueryBuilder('subscription')
        .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
        .andWhere('subscription.end_date BETWEEN :now AND :threeDays', {
          now,
          threeDays: threeDaysFromNow,
        })
        .leftJoinAndSelect('subscription.organisation', 'organisation')
        .leftJoinAndSelect('organisation.users', 'users')
        .getMany();

      this.logger.log(`Found ${sevenDayExpiring.length} subscriptions expiring in 7 days`);
      this.logger.log(`Found ${threeDayExpiring.length} subscriptions expiring in 3 days`);

      // Send reminders for 7-day expiry
      for (const subscription of sevenDayExpiring) {
        // Skip if reminder already sent recently (within last 24 hours)
        if (subscription.lastReminderSentAt) {
          const lastSent = new Date(subscription.lastReminderSentAt);
          const timeSinceLastReminder = new Date().getTime() - lastSent.getTime();
          
          if (timeSinceLastReminder < 24 * 60 * 60 * 1000) {
            this.logger.log(
              `Skipping 7-day reminder for subscription ${subscription.id} - already sent recently`,
            );
            continue;
          }
        }

        const owner = subscription.organisation.users.find((u) => u.role === UserRole.OWNER);
        if (owner?.email) {
          await this.emailService.sendSubscriptionReminder(
            owner.email,
            subscription.organisation.name,
            subscription.endDate,
            7,
          );
          
          // Update last reminder timestamp
          await this.subscriptionRepository.update(subscription.id, {
            lastReminderSentAt: new Date(),
          });
          
          this.logger.log(
            `7-day reminder sent to ${owner.email} for subscription ${subscription.id}`,
          );
        }
      }

      // Send reminders for 3-day expiry
      for (const subscription of threeDayExpiring) {
        // Skip if reminder already sent recently (within last 24 hours)
        if (subscription.lastReminderSentAt) {
          const lastSent = new Date(subscription.lastReminderSentAt);
          const timeSinceLastReminder = new Date().getTime() - lastSent.getTime();
          
          if (timeSinceLastReminder < 24 * 60 * 60 * 1000) {
            this.logger.log(
              `Skipping 3-day reminder for subscription ${subscription.id} - already sent recently`,
            );
            continue;
          }
        }

        const owner = subscription.organisation.users.find((u) => u.role === UserRole.OWNER);
        if (owner?.email) {
          await this.emailService.sendSubscriptionReminder(
            owner.email,
            subscription.organisation.name,
            subscription.endDate,
            3,
          );
          
          // Update last reminder timestamp
          await this.subscriptionRepository.update(subscription.id, {
            lastReminderSentAt: new Date(),
          });
          
          this.logger.log(
            `3-day reminder sent to ${owner.email} for subscription ${subscription.id}`,
          );
        }
      }

      this.logger.log('Subscription reminder check completed successfully');
    } catch (error) {
      this.logger.error('Error during subscription reminder check:', error);
      throw error;
    }
  }
}
