import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus, InvoiceType } from '../../entities/invoice.entity';
import { Tenant, TenantStatus } from '../../entities/tenant.entity';
import { Bed } from '../../entities/bed.entity';

@Injectable()
@Processor('invoice-generation')
export class InvoiceGenerationProcessor {
  private readonly logger = new Logger(InvoiceGenerationProcessor.name);

  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
  ) {}

  @Process('generate-invoices')
  async generateInvoices(job: Job) {
    this.logger.log('Starting invoice generation job');

    const billingPeriod = new Date();
    billingPeriod.setDate(1); // First of month
    billingPeriod.setHours(0, 0, 0, 0);

    const nextMonth = new Date(billingPeriod);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    try {
      // Get all active tenants with their beds, filtering by active organisations
      const tenants = await this.tenantRepository
        .createQueryBuilder('tenant')
        .leftJoinAndSelect('tenant.bed', 'bed')
        .leftJoinAndSelect('tenant.organisation', 'organisation')
        .where('tenant.status = :status', { status: TenantStatus.ACTIVE })
        .andWhere('tenant.deleted_at IS NULL')
        .andWhere('organisation.status IN (:...activeStatuses)', {
          activeStatuses: ['APPROVED'],
        })
        .getMany();

      this.logger.log(`Found ${tenants.length} active tenants`);

      let createdCount = 0;
      let skippedCount = 0;

      for (const tenant of tenants) {
        if (!tenant.bed) {
          this.logger.warn(`Tenant ${tenant.id} has no bed assigned, skipping`);
          skippedCount++;
          continue;
        }

        // Check if invoice already exists for this billing period and type (idempotency)
        const existing = await this.invoiceRepository.findOne({
          where: {
            tenantId: tenant.id,
            billingDate: billingPeriod,
            type: InvoiceType.RENT,
          },
        });

        if (existing) {
          this.logger.log(
            `Invoice already exists for tenant ${tenant.id} for billing period ${billingPeriod.toISOString()}, skipping`,
          );
          skippedCount++;
          continue;
        }

        // Create invoice with deterministic invoice number to prevent collisions
        const timestamp = Date.now();
        const shortTenantId = tenant.id.slice(-6);
        const invoiceNumber = `INV-${billingPeriod.toISOString().slice(0, 7)}-${shortTenantId}-${timestamp}`;

        const invoice = this.invoiceRepository.create({
          tenantId: tenant.id,
          organisationId: tenant.organisationId,
          amountPaise: Math.round(parseFloat(tenant.bed.rent) * 100), // Convert to paise
          amountPaidPaise: 0,
          billingDate: billingPeriod,
          dueDate: new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 5), // 5th of next month
          status: InvoiceStatus.PENDING,
          type: InvoiceType.RENT,
          invoiceNumber,
        });

        await this.invoiceRepository.save(invoice);
        createdCount++;
        this.logger.log(`Created invoice for tenant ${tenant.id}`);
      }

      this.logger.log(
        `Invoice generation completed: ${createdCount} created, ${skippedCount} skipped`,
      );

      return {
        success: true,
        created: createdCount,
        skipped: skippedCount,
        total: tenants.length,
      };
    } catch (error) {
      this.logger.error(`Invoice generation failed: ${error.message}`, error.stack);
      throw error; // Re-throw to trigger BullMQ retry
    }
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `Completed job ${job.id} of type ${job.name}. Result: ${JSON.stringify(result)}`,
    );
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(`Failed job ${job.id} of type ${job.name}: ${error.message}`, error.stack);
  }
}
