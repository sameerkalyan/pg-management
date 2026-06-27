import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsService } from './jobs.service';
import { SubscriptionExpiryProcessor } from './processors/subscription-expiry.processor';
import { InvoiceGenerationProcessor } from './invoice-generation.processor';
import { OverdueInvoiceProcessor } from './overdue-invoice.processor';
import { WebhookDlqProcessor } from './processors/webhook-dlq.processor';
import { EmailModule } from '../email/email.module';
import { Invoice } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Bed } from '../../entities/bed.entity';
import { Subscription } from '../../entities/subscription.entity';
import { User } from '../../entities/user.entity';
import { Organisation } from '../../entities/organisation.entity';

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  timeout: 30000,
  removeOnComplete: 100,
  removeOnFail: false, // Keep failed jobs for manual inspection / DLQ
};

const WEBHOOK_DLQ_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 10000,
  },
  timeout: 60000,
  removeOnComplete: 50,
  removeOnFail: false, // Keep permanently for inspection
};

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, Tenant, Bed, Subscription, User, Organisation]),
    BullModule.registerQueue({
      name: 'invoice-generation',
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: 'overdue-invoices',
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: 'subscription-expiry',
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    }),
    BullModule.registerQueue({
      name: 'webhook-dlq',
      defaultJobOptions: WEBHOOK_DLQ_OPTIONS,
    }),
    EmailModule,
  ],
  providers: [JobsService, SubscriptionExpiryProcessor, InvoiceGenerationProcessor, OverdueInvoiceProcessor, WebhookDlqProcessor],
})
export class JobsModule {}
