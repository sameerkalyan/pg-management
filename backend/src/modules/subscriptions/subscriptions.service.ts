import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Subscription, SubscriptionStatus } from '../../entities/subscription.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { Payment, PaymentMethod, PaymentStatus } from '../../entities/payment.entity';
import { Organisation } from '../../entities/organisation.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { EmailType } from '../../entities/email-log.entity';
const Razorpay = require('razorpay');

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private razorpay: any;

  constructor(
    @InjectRepository(SubscriptionPlan)
    private planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get('RAZORPAY_KEY_ID'),
      key_secret: this.configService.get('RAZORPAY_KEY_SECRET'),
    });
  }

  private validateStateTransition(
    currentStatus: SubscriptionStatus,
    newStatus: SubscriptionStatus,
  ): void {
    const validTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
      [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED],
      [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.CANCELLED]: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Invalid state transition from ${currentStatus} to ${newStatus}. ` +
          `Valid transitions from ${currentStatus}: ${validTransitions[currentStatus].join(', ')}`,
      );
    }
  }

  async initiatePayment(organisationId: string, planId: string) {
    const plan = await this.planRepository.findOne({
      where: { id: planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found or inactive');
    }

    const organisation = await this.organisationRepository.findOne({
      where: { id: organisationId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    // Create Razorpay order
    const options = {
      amount: plan.amountPaise,
      currency: 'INR',
      receipt: `sub_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      notes: {
        organisationId,
        planId,
        type: 'SUBSCRIPTION',
      },
    };

    try {
      const order = await this.razorpay.orders.create(options);

      // Create payment record for tracking in a transaction
      const payment = await this.paymentRepository.manager.transaction(async (manager) => {
        const payment = manager.create(Payment, {
          organisationId,
          amountPaise: plan.amountPaise,
          method: PaymentMethod.RAZORPAY,
          status: PaymentStatus.PENDING,
          transactionId: order.id,
          notes: 'Subscription payment',
          paymentNumber: `SUB_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        });
        return await manager.save(payment);
      });

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: this.configService.get('RAZORPAY_KEY_ID'),
        plan: {
          id: plan.id,
          name: plan.name,
          description: plan.description,
          amountPaise: plan.amountPaise,
          durationMonths: plan.durationMonths,
        },
      };
    } catch (error) {
      console.error('Razorpay order creation error:', {
        message: error?.error?.description || error?.message || 'Unknown error',
        statusCode: error?.statusCode,
        error: error?.error,
      });
      throw new BadRequestException(
        error?.error?.description || error?.message || 'Failed to create payment order',
      );
    }
  }

  async createSubscription(
    organisationId: string,
    createSubscriptionDto: CreateSubscriptionDto,
    paymentId?: string,
  ): Promise<Subscription> {
    return await this.subscriptionRepository.manager.transaction(async (manager) => {
      const plan = await manager.findOne(SubscriptionPlan, {
        where: { id: createSubscriptionDto.planId, isActive: true },
      });

      if (!plan) {
        throw new NotFoundException('Subscription plan not found or inactive');
      }

      const organisation = await manager.findOne(Organisation, {
        where: { id: organisationId },
      });

      if (!organisation) {
        throw new NotFoundException('Organisation not found');
      }

      // Check if organisation already has an active subscription with pessimistic locking
      const existingSubscription = await manager.findOne(Subscription, {
        where: {
          organisationId,
          status: SubscriptionStatus.ACTIVE,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (existingSubscription) {
        throw new BadRequestException('Organisation already has an active subscription');
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + plan.durationMonths);

      const subscription = manager.create(Subscription, {
        organisationId,
        planId: plan.id,
        amountPaise: plan.amountPaise,
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        paymentId,
      });

      const savedSubscription = await manager.save(subscription);

      // Invalidate cache
      await this.redis.del(`subscription:active:${organisationId}`);

      return savedSubscription;
    });
  }

  async createSubscriptionWithPaymentVerification(
    organisationId: string,
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<Subscription> {
    // Verify payment if paymentId is provided
    if (createSubscriptionDto.paymentId) {
      const payment = await this.paymentRepository.findOne({
        where: {
          id: createSubscriptionDto.paymentId,
          organisationId,
          status: PaymentStatus.COMPLETED,
        },
      });

      if (!payment) {
        throw new BadRequestException('Valid payment is required. Payment not found or not completed.');
      }

      // Verify payment amount matches plan amount
      const plan = await this.planRepository.findOne({
        where: { id: createSubscriptionDto.planId, isActive: true },
      });

      if (!plan) {
        throw new NotFoundException('Subscription plan not found or inactive');
      }

      if (payment.amountPaise < plan.amountPaise) {
        throw new BadRequestException('Payment amount is insufficient for the selected plan');
      }
    }

    return await this.createSubscription(
      organisationId,
      createSubscriptionDto,
      createSubscriptionDto.paymentId,
    );
  }

  async renewSubscription(
    subscriptionId: string,
    organisationId: string,
    renewSubscriptionDto: RenewSubscriptionDto,
  ): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId, organisationId },
      relations: ['organisation'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Cannot renew cancelled subscription. Please create a new subscription.');
    }

    // Allow changing plan during renewal
    const plan = await this.planRepository.findOne({
      where: { id: renewSubscriptionDto.planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found or inactive');
    }

    // If paymentId is provided, verify it exists and belongs to this organization
    if (renewSubscriptionDto.paymentId) {
      const payment = await this.paymentRepository.findOne({
        where: { 
          id: renewSubscriptionDto.paymentId, 
          organisationId,
          status: PaymentStatus.COMPLETED,
        },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found or not completed');
      }
      
      subscription.paymentId = payment.id;
    }

    if (subscription.status === SubscriptionStatus.EXPIRED) {
      // Validate state transition before changing status
      this.validateStateTransition(subscription.status, SubscriptionStatus.ACTIVE);
      
      // Reactivate from today
      subscription.startDate = new Date();
      subscription.endDate = new Date();
      subscription.endDate.setMonth(subscription.endDate.getMonth() + plan.durationMonths);
    } else {
      // ACTIVE: extend from current end date
      subscription.endDate = new Date(subscription.endDate.getTime());
      subscription.endDate.setMonth(subscription.endDate.getMonth() + plan.durationMonths);
    }

    subscription.status = SubscriptionStatus.ACTIVE;
    subscription.planId = plan.id;
    subscription.amountPaise = plan.amountPaise;
    subscription.gracePeriodEndDate = null; // Clear grace period on renewal

    const renewed = await this.subscriptionRepository.save(subscription);

    // Invalidate cache
    const cacheKey = `subscription:active:${organisationId}`;
    await this.redis.del(cacheKey);

    // Send renewal confirmation email
    try {
      const organisation = await this.organisationRepository.findOne({ where: { id: organisationId } });
      const owner = await this.organisationRepository.manager.findOne('User', {
        where: { organisationId },
      }) as any;

      if (owner && owner.email) {
        await this.emailService.sendEmail({
          to: owner.email,
          subject: `Subscription Renewed - ${organisation?.name || 'Your Organisation'}`,
          html: `
            <h2>Subscription Renewed Successfully</h2>
            <p>Hello ${owner.firstName || ''},</p>
            <p>Your subscription has been renewed successfully.</p>
            <p><strong>Plan:</strong> ${plan.name}</p>
            <p><strong>New End Date:</strong> ${new Date(subscription.endDate).toLocaleDateString()}</p>
            <p>Regards,<br>PG Management Team</p>
          `,
          emailType: EmailType.SUBSCRIPTION_RENEWED,
          organisationId,
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to send subscription renewal email: ${err.message}`);
    }

    return renewed;
  }

  async getSubscriptionByOrganisation(organisationId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organisationId },
      relations: ['payment', 'organisation'],
      order: {
        createdAt: 'DESC',
      },
      withDeleted: false,
    });

    if (!subscription) {
      throw new NotFoundException('No subscription found for organisation');
    }

    return subscription;
  }

  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return await this.planRepository.find({
      where: { isActive: true },
    });
  }

  async getPlanById(planId: string): Promise<SubscriptionPlan> {
    const plan = await this.planRepository.findOne({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }

    return plan;
  }

  async checkSubscriptionExpiry(): Promise<void> {
    const now = new Date();
    const expiredSubscriptions = await this.subscriptionRepository
      .createQueryBuilder('subscription')
      .where('subscription.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('subscription.end_date < :now', { now })
      .leftJoinAndSelect('subscription.organisation', 'organisation')
      .getMany();

    if (expiredSubscriptions.length > 0) {
      // Validate state transitions before updating
      for (const subscription of expiredSubscriptions) {
        this.validateStateTransition(subscription.status, SubscriptionStatus.EXPIRED);
      }

      await this.subscriptionRepository
        .createQueryBuilder()
        .update(Subscription)
        .set({ status: SubscriptionStatus.EXPIRED })
        .where('id IN (:...ids)', { ids: expiredSubscriptions.map((s) => s.id) })
        .execute();

      // Send notifications in background job
      for (const subscription of expiredSubscriptions) {
        // TODO: Send expiry notification email
        // TODO: Optionally suspend organisation after grace period
      }
    }
  }

  async cancelSubscription(subscriptionId: string, organisationId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId, organisationId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription already cancelled');
    }

    if (subscription.status === SubscriptionStatus.EXPIRED) {
      throw new BadRequestException('Cannot cancel an expired subscription. Please renew instead.');
    }

    this.validateStateTransition(subscription.status, SubscriptionStatus.CANCELLED);

    subscription.status = SubscriptionStatus.CANCELLED;
    
    const cancelled = await this.subscriptionRepository.save(subscription);

    // Invalidate cache
    const cacheKey = `subscription:active:${organisationId}`;
    await this.redis.del(cacheKey);

    return cancelled;
  }

  async getSubscriptionStatus(organisationId: string): Promise<{
    hasActiveSubscription: boolean;
    status: SubscriptionStatus | null;
    endDate: Date | null;
    daysRemaining: number;
    isInGracePeriod: boolean;
  }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organisationId },
      order: {
        createdAt: 'DESC',
      },
      withDeleted: false,
    });

    if (!subscription) {
      return {
        hasActiveSubscription: false,
        status: null,
        endDate: null,
        daysRemaining: 0,
        isInGracePeriod: false,
      };
    }

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    let daysRemaining: number;
    
    if (subscription.status === SubscriptionStatus.EXPIRED && subscription.gracePeriodEndDate) {
      // For expired subscriptions, calculate days remaining in grace period
      const gracePeriodEnd = new Date(subscription.gracePeriodEndDate);
      daysRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } else {
      // For active subscriptions, calculate days until end date
      daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Check if in grace period
    const isInGracePeriod = 
      subscription.status === SubscriptionStatus.EXPIRED &&
      subscription.gracePeriodEndDate !== null &&
      now <= new Date(subscription.gracePeriodEndDate);

    // Consider subscription "active" if ACTIVE or in grace period
    const hasActiveSubscription = 
      subscription.status === SubscriptionStatus.ACTIVE || isInGracePeriod;

    return {
      hasActiveSubscription,
      status: subscription.status,
      endDate: subscription.endDate,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isInGracePeriod,
    };
  }

  async sendExpiryWarnings(organisationId: string): Promise<{ sent: number }> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organisationId },
    });
    if (!subscription) {
      return { sent: 0 };
    }

    const now = new Date();
    const endDate = new Date(subscription.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining > 7 || daysRemaining < 0) {
      return { sent: 0 };
    }

    const organisation = await this.organisationRepository.findOne({
      where: { id: organisationId },
    });

    const owner = await this.organisationRepository.manager.findOne('User', {
      where: { organisationId },
    }) as any;

    if (!owner || !owner.email) {
      return { sent: 0 };
    }

    await this.emailService.sendEmail({
      to: owner.email,
      subject: `Subscription Expiring Soon - ${organisation?.name || 'Your Organisation'}`,
      html: `
        <h2>Subscription Expiry Warning</h2>
        <p>Hello ${owner.firstName || ''},</p>
        <p>Your subscription for <strong>${organisation?.name || 'your organisation'}</strong> will expire in ${daysRemaining} days.</p>
        <p>Please renew your subscription to avoid service interruption.</p>
        <p>Regards,<br>PG Management Team</p>
      `,
      emailType: EmailType.SUBSCRIPTION_EXPIRY_WARNING,
      organisationId,
    });

    return { sent: 1 };
  }
}
