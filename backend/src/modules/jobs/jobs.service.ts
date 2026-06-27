import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly timezone: string;

  constructor(
    @InjectQueue('invoice-generation')
    private invoiceQueue: Queue,
    @InjectQueue('overdue-invoices')
    private overdueInvoiceQueue: Queue,
    @InjectQueue('subscription-expiry')
    private subscriptionExpiryQueue: Queue,
    configService: ConfigService,
  ) {
    // SWE-54 — read cron timezone from configuration (default UTC for backward compat)
    this.timezone = configService.get('CRON_TIMEZONE', 'UTC');
  }

  async onModuleInit() {
    try {
      await this.scheduleInvoiceGeneration();
      this.logger.log(`Scheduled daily invoice generation (midnight ${this.timezone})`);
    } catch (error) {
      this.logger.error('Failed to schedule invoice generation:', error);
    }

    try {
      await this.scheduleSubscriptionExpiryCheck();
      this.logger.log(`Scheduled daily subscription expiry check (midnight ${this.timezone})`);
    } catch (error) {
      this.logger.error('Failed to schedule subscription expiry check:', error);
    }

    try {
      await this.scheduleSubscriptionReminders();
      this.logger.log(`Scheduled daily subscription reminders (9 AM ${this.timezone})`);
    } catch (error) {
      this.logger.error('Failed to schedule subscription reminders:', error);
    }

    try {
      await this.scheduleOverdueInvoiceMarking();
      this.logger.log(`Scheduled daily overdue invoice marking (1 AM ${this.timezone})`);
    } catch (error) {
      this.logger.error('Failed to schedule overdue invoice marking:', error);
    }
  }

  async scheduleInvoiceGeneration() {
    // SWE-54 — use configurable timezone (e.g. 'Asia/Kolkata') instead of hardcoded UTC
    await this.invoiceQueue.add(
      'generate-invoices',
      {},
      {
        repeat: { cron: '0 0 * * *', tz: this.timezone },
      },
    );
  }

  async scheduleSubscriptionExpiryCheck() {
    await this.subscriptionExpiryQueue.add(
      'check-expiry',
      {},
      {
        repeat: { cron: '0 0 * * *', tz: this.timezone },
      },
    );
  }

  async scheduleSubscriptionReminders() {
    await this.subscriptionExpiryQueue.add(
      'check-reminders',
      {},
      {
        repeat: { cron: '0 9 * * *', tz: this.timezone },
      },
    );
  }

  async scheduleOverdueInvoiceMarking() {
    await this.overdueInvoiceQueue.add(
      'mark-overdue',
      {},
      {
        repeat: { cron: '0 1 * * *', tz: this.timezone },
      },
    );
  }
}
