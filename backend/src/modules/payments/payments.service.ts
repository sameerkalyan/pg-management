import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as crypto from 'crypto';
const Razorpay = require('razorpay');
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { Invoice, InvoiceStatus } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Subscription, SubscriptionStatus } from '../../entities/subscription.entity';
import { SubscriptionPlan } from '../../entities/subscription-plan.entity';
import { Organisation } from '../../entities/organisation.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { RazorpayWebhookDto } from './dto/razorpay-webhook.dto';
import { CircuitBreaker } from '../../common/utils/circuit-breaker.util';
import { EmailService } from '../email/email.service';
import { EmailType } from '../../entities/email-log.entity';

@Injectable()
export class PaymentsService {
  private razorpayKey: string;
  private razorpaySecret: string;
  private webhookSecret: string;
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpayCircuitBreaker: CircuitBreaker;
  private readonly razorpayInstance: any;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private planRepository: Repository<SubscriptionPlan>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    private configService: ConfigService,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
    private emailService: EmailService,
  ) {
    this.razorpayKey = this.configService.get<string>('RAZORPAY_KEY_ID');
    this.razorpaySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    this.webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');

    // Initialize Razorpay instance as singleton
    this.razorpayInstance = new Razorpay({
      key_id: this.razorpayKey,
      key_secret: this.razorpaySecret,
    });

    // Initialize circuit breaker for Razorpay API (5 failures, 1 min timeout, 30 sec half-open)
    this.razorpayCircuitBreaker = new CircuitBreaker(5, 60000, 30000);
  }

  private generatePaymentNumber(): string {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `PAY-${ymd}-${rand}`;
  }

  async create(organisationId: string, createPaymentDto: CreatePaymentDto) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: createPaymentDto.invoiceId, organisationId },
      relations: ['tenant'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const paymentNumber = this.generatePaymentNumber();

    const payment = this.paymentRepository.create({
      ...createPaymentDto,
      paymentNumber,
      organisationId,
      status: PaymentStatus.COMPLETED,
      paidAt: new Date(),
    });

    return this.paymentRepository.manager.transaction(async (manager) => {
      const savedPayment = await manager.save(payment);

      // Recalculate invoice amountPaidPaise from all COMPLETED payments
      const { totalPaid } = await manager
        .createQueryBuilder(Payment, 'payment')
        .select('SUM(payment.amount_paise)', 'totalPaid')
        .where('payment.invoice_id = :invoiceId', { invoiceId: createPaymentDto.invoiceId })
        .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
        .andWhere('payment.deleted_at IS NULL')
        .getRawOne();

      const totalPaidAmount = Number(totalPaid) || 0;

      let newStatus: InvoiceStatus;
      if (totalPaidAmount >= invoice.amountPaise) {
        newStatus = InvoiceStatus.PAID;
      } else if (totalPaidAmount > 0) {
        newStatus = InvoiceStatus.PARTIALLY_PAID;
      } else {
        newStatus = InvoiceStatus.PENDING;
      }

      await manager.update(Invoice, { id: invoice.id, organisationId }, {
        amountPaidPaise: totalPaidAmount,
        status: newStatus,
      });

      return savedPayment;
    }).then(async (savedPayment) => {
      if (invoice.tenant?.email) {
        try {
          await this.emailService.sendEmail({
            to: invoice.tenant.email,
            subject: `Payment Received - ${paymentNumber}`,
            html: `
              <h2>Payment Received</h2>
              <p>Dear ${invoice.tenant.firstName} ${invoice.tenant.lastName || ''},</p>
              <p>We have received your payment of <strong>₹${createPaymentDto.amountPaise / 100}</strong>.</p>
              <p><strong>Payment Number:</strong> ${paymentNumber}</p>
              <p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p>
              <p>Thank you for your payment.</p>
              <p>Regards,<br>PG Management Team</p>
            `,
            emailType: EmailType.PAYMENT_RECEIVED,
            organisationId,
            metadata: { invoiceId: invoice.id, paymentId: savedPayment.id },
          });
        } catch (err) {
          this.logger.warn(`Failed to send payment received email: ${err.message}`);
        }
      }
      return savedPayment;
    });
  }

  async findByInvoice(invoiceId: string, organisationId: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId, organisationId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return this.paymentRepository.find({
      where: { invoiceId, organisationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, organisationId: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id, organisationId },
      relations: ['invoice', 'invoice.tenant'],
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async findByRazorpayOrderId(razorpayOrderId: string) {
    return await this.paymentRepository.findOne({
      where: { razorpayOrderId },
    });
  }

  async findAll(
    organisationId: string,
    page: number = 1,
    limit: number = 10,
    status?: PaymentStatus,
    method?: PaymentMethod,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { organisationId };
    if (status) {
      where.status = status;
    }
    if (method) {
      where.method = method;
    }
    const [payments, total] = await this.paymentRepository.findAndCount({
      where,
      relations: ['invoice', 'invoice.tenant'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMyPayments(userId: string, page: number = 1, limit: number = 10) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
      relations: ['invoices'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant profile not found');
    }
    const skip = (page - 1) * limit;
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { organisationId: tenant.organisationId, invoiceId: In(tenant.invoices?.map((i) => i.id) || []) },
      relations: ['invoice'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async verifyTenantInvoice(invoiceId: string, userId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
    });

    if (!tenant) {
      return null;
    }

    const invoice = await this.invoiceRepository.findOne({
      where: { 
        id: invoiceId, 
        tenantId: tenant.id 
      },
    });

    return invoice;
  }

  async update(id: string, organisationId: string, updatePaymentDto: UpdatePaymentDto) {
    await this.findOne(id, organisationId);
    await this.paymentRepository.update({ id, organisationId }, updatePaymentDto);
    return this.findOne(id, organisationId);
  }

  async createRazorpayOrder(invoiceId: string, organisationId: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id: invoiceId, organisationId },
      relations: ['tenant'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (!invoice.tenant || invoice.tenant.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }

    const options = {
      amount: invoice.amountPaise,
      currency: 'INR',
      receipt: invoice.id,
      notes: {
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
      },
    };

    // Use circuit breaker for Razorpay API call
    const order = await this.razorpayCircuitBreaker.execute(async () => {
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error('Razorpay API timeout')), 10000);
      });
      try {
        return await Promise.race([
          this.razorpayInstance.orders.create(options),
          timeoutPromise,
        ]);
      } finally {
        clearTimeout(timeoutHandle);
      }
    });

    // Create PENDING payment record with razorpayOrderId
    const paymentNumber = this.generatePaymentNumber();
    const payment = this.paymentRepository.create({
      paymentNumber,
      organisationId,
      invoiceId: invoice.id,
      amountPaise: invoice.amountPaise,
      method: PaymentMethod.RAZORPAY,
      status: PaymentStatus.PENDING,
      razorpayOrderId: order.id,
      transactionId: order.id,
    });
    await this.paymentRepository.save(payment);

    return { order, paymentId: payment.id };
  }

  async verifyWebhook(
    webhookData: RazorpayWebhookDto,
    signature: string,
    rawBody?: string,
  ): Promise<void> {
    try {
      const webhookSecret = this.webhookSecret;
      const bodyToVerify = rawBody || JSON.stringify(webhookData);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyToVerify)
        .digest('hex');

      const expectedSigBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedSigBuffer = Buffer.from(signature, 'hex');
      if (expectedSigBuffer.length !== receivedSigBuffer.length) {
        this.logger.error('Invalid webhook signature received');
        throw new BadRequestException('Invalid webhook signature');
      }
      if (!crypto.timingSafeEqual(expectedSigBuffer, receivedSigBuffer)) {
        this.logger.error('Invalid webhook signature received');
        throw new BadRequestException('Invalid webhook signature');
      }

      const { event, payload } = webhookData;
      const paymentEntity = payload.payment.entity;
      const webhookId = `${paymentEntity.id}_${event}`;

      // Use Redis SETNX for atomic idempotency check (prevents race conditions)
      const lockKey = `webhook:processing:${webhookId}`;
      const processedKey = `webhook:processed:${webhookId}`;
      
      // Try to acquire lock atomically
      const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 300, 'NX');
      if (!lockAcquired) {
        this.logger.log(`Webhook ${webhookId} is being processed by another instance, skipping`);
        return;
      }

      try {
        // Check if already processed
        const existingWebhook = await this.redis.get(processedKey);
        if (existingWebhook) {
          this.logger.log(`Webhook ${webhookId} already processed, skipping`);
          return;
        }

        if (event === 'payment.captured' || event === 'payment.authorized') {
        try {
          // Look up payment by razorpayOrderId (order_id from webhook payload)
          const payment = await this.paymentRepository.findOne({
            where: { razorpayOrderId: paymentEntity.order_id },
          });

          if (payment) {
            // Skip if already completed
            if (payment.status === PaymentStatus.COMPLETED) {
              await this.redis.setex(processedKey, 86400, '1');
              return;
            }

            // For authorized events, log but don't mark as paid - only captured events should update payment status
            if (event === 'payment.authorized') {
              this.logger.log(`Payment authorized: ${paymentEntity.id} for payment ${payment.id} - awaiting capture`);
              await this.redis.setex(processedKey, 86400, '1');
              return;
            }

            await this.paymentRepository.manager.transaction(async (manager) => {
              // Update payment: status → COMPLETED, store razorpayPaymentId, razorpaySignature, paidAt
              await manager.update(Payment, { id: payment.id, organisationId: payment.organisationId }, {
                status: PaymentStatus.COMPLETED,
                razorpayPaymentId: paymentEntity.id,
                razorpaySignature: signature,
                paidAt: new Date(),
              });

              // Handle invoice payments
              if (payment.invoiceId) {
                const invoice = await manager.findOne(Invoice, {
                  where: { id: payment.invoiceId, organisationId: payment.organisationId },
                });
                if (invoice) {
                  // Calculate total paid amount using database-level SUM for atomicity
                  const { totalPaid } = await manager
                    .createQueryBuilder(Payment, 'payment')
                    .select('SUM(payment.amount_paise)', 'totalPaid')
                    .where('payment.invoice_id = :invoiceId', { invoiceId: payment.invoiceId })
                    .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
                    .andWhere('payment.deleted_at IS NULL')
                    .getRawOne();

                  const totalPaidAmount = Number(totalPaid) || 0;

                  // Update invoice amount paid and status in a single query
                  let newStatus: InvoiceStatus;
                  if (totalPaidAmount >= invoice.amountPaise) {
                    newStatus = InvoiceStatus.PAID;
                  } else if (totalPaidAmount > 0) {
                    newStatus = InvoiceStatus.PARTIALLY_PAID;
                  } else {
                    newStatus = InvoiceStatus.PENDING;
                  }

                  await manager.update(Invoice, { id: invoice.id, organisationId: invoice.organisationId }, {
                    amountPaidPaise: totalPaidAmount,
                    status: newStatus,
                  });
                }
              }

              // Handle subscription payments
              const notes = paymentEntity.notes;
              if (notes && notes.type === 'SUBSCRIPTION' && notes.organisationId && notes.planId) {
                // Validate that notes match the payment
                if (payment.organisationId !== notes.organisationId) {
                  this.logger.error(
                    `Organisation ID mismatch in webhook: payment=${payment.organisationId}, notes=${notes.organisationId}`,
                  );
                  throw new BadRequestException('Organisation ID mismatch');
                }

                const organisationId = notes.organisationId;
                const planId = notes.planId;

                // Validate plan exists and is active
                const plan = await manager.findOne(SubscriptionPlan, {
                  where: { id: planId, isActive: true },
                });

                if (!plan) {
                  this.logger.error(`Invalid plan ID in webhook: ${planId}`);
                  throw new BadRequestException('Invalid subscription plan');
                }

                // Validate payment amount is at least plan amount (allow overpayments)
                if (payment.amountPaise < plan.amountPaise) {
                  this.logger.error(
                    `Amount insufficient: expected=${plan.amountPaise}, received=${payment.amountPaise}`,
                  );
                  throw new BadRequestException('Payment amount is less than plan amount');
                }
                // Log overpayments for review
                if (payment.amountPaise > plan.amountPaise) {
                  this.logger.warn(
                    `Overpayment detected: expected=${plan.amountPaise}, received=${payment.amountPaise}`,
                  );
                }

                // Check if subscription already exists
                const existingSubscription = await manager.findOne(Subscription, {
                  where: { organisationId },
                  order: { createdAt: 'DESC' },
                });

                if (existingSubscription) {
                  // Renew existing subscription
                  const currentEndDate = new Date(existingSubscription.endDate);
                  const newEndDate = new Date(currentEndDate.getTime());
                  newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths);

                  if (existingSubscription.status === SubscriptionStatus.EXPIRED) {
                    existingSubscription.startDate = new Date();
                    existingSubscription.endDate = new Date();
                    existingSubscription.endDate.setMonth(
                      existingSubscription.endDate.getMonth() + plan.durationMonths,
                    );
                  } else {
                    existingSubscription.endDate = newEndDate;
                  }

                  existingSubscription.status = SubscriptionStatus.ACTIVE;
                  existingSubscription.planId = plan.id;
                  existingSubscription.amountPaise = plan.amountPaise;
                  existingSubscription.paymentId = payment.id;

                  await manager.save(existingSubscription);
                  
                  // Invalidate cache
                  await this.redis.del(`subscription:active:${organisationId}`);
                } else {
                  // Check for existing ACTIVE subscription before creating new one
                  const activeSubscription = await manager.findOne(Subscription, {
                    where: {
                      organisationId,
                      status: SubscriptionStatus.ACTIVE,
                    },
                    lock: { mode: 'pessimistic_write' },
                  });

                  if (activeSubscription) {
                    this.logger.warn(
                      `Attempted to create duplicate active subscription for organisation ${organisationId}, updating existing instead`,
                    );
                    // Update existing active subscription instead
                    const newEndDate = new Date(activeSubscription.endDate.getTime());
                    newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths);
                    
                    activeSubscription.endDate = newEndDate;
                    activeSubscription.planId = plan.id;
                    activeSubscription.amountPaise = plan.amountPaise;
                    activeSubscription.paymentId = payment.id;
                    
                    await manager.save(activeSubscription);
                    
                    // Invalidate cache
                    await this.redis.del(`subscription:active:${organisationId}`);
                  } else {
                    // Create new subscription
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
                      paymentId: payment.id,
                    });

                    await manager.save(subscription);
                    
                    // Invalidate cache
                    await this.redis.del(`subscription:active:${organisationId}`);
                  }
                }
              }
            });
          }
        } catch (error) {
          this.logger.error(`Error processing payment webhook for ${paymentEntity.id}:`, error);
          // Only swallow if it's an idempotency error (already processed)
          if (error.message?.includes('already completed')) {
            return;
          }
          throw error; // Re-throw for Razorpay retry
        }
      } else if (event === 'payment.failed') {
        try {
          const payment = await this.paymentRepository.findOne({
            where: { razorpayOrderId: paymentEntity.order_id },
          });

          if (payment) {
            await this.paymentRepository.update({ id: payment.id, organisationId: payment.organisationId }, {
              status: PaymentStatus.FAILED,
            });
          }
        } catch (error) {
          this.logger.error(
            `Error processing failed payment webhook for ${paymentEntity.id}:`,
            error,
          );
          throw error; // Re-throw for Razorpay retry
        }
      }

      // Mark webhook as processed (only after successful transaction)
      await this.redis.setex(processedKey, 86400, '1');
      } finally {
        // Release the lock
        await this.redis.del(lockKey);
      }
    } catch (error) {
      this.logger.error('Webhook processing failed:', error);
      throw error; // Re-throw for Razorpay retry
    }
  }

  async getPaymentStats(organisationId: string, startDate: Date, endDate: Date) {
    const result = await this.paymentRepository
      .createQueryBuilder('payment')
      .select('COUNT(*)', 'totalPayments')
      .addSelect('SUM(payment.amount_paise)', 'totalAmount')
      .addSelect(
        "SUM(CASE WHEN payment.status = 'COMPLETED' THEN 1 ELSE 0 END)",
        'completedPayments',
      )
      .addSelect(
        "SUM(CASE WHEN payment.status = 'COMPLETED' THEN payment.amount_paise ELSE 0 END)",
        'completedAmount',
      )
      .addSelect(
        "SUM(CASE WHEN payment.status = 'PENDING' THEN 1 ELSE 0 END)",
        'pendingPayments',
      )
      .addSelect(
        "SUM(CASE WHEN payment.status = 'PENDING' THEN payment.amount_paise ELSE 0 END)",
        'pendingAmount',
      )
      .where('payment.organisation_id = :organisationId', { organisationId })
      .andWhere('payment.created_at BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('payment.deleted_at IS NULL')
      .getRawOne();

    return {
      totalPayments: parseInt(result.totalPayments) || 0,
      totalAmount: parseInt(result.totalAmount) || 0,
      completedPayments: parseInt(result.completedPayments) || 0,
      completedAmount: parseInt(result.completedAmount) || 0,
      pendingPayments: parseInt(result.pendingPayments) || 0,
      pendingAmount: parseInt(result.pendingAmount) || 0,
    };
  }
}
