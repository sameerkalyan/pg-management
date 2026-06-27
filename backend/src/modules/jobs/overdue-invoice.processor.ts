import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { EmailService } from '../email/email.service';

@Injectable()
@Processor('overdue-invoices')
export class OverdueInvoiceProcessor {
  private readonly logger = new Logger(OverdueInvoiceProcessor.name);

  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private emailService: EmailService,
  ) {}

  @Process('mark-overdue')
  async markOverdue(job: Job) {
    this.logger.log('Starting overdue invoice marking job');

    const now = new Date();

    try {
      const overdueInvoices = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .leftJoinAndSelect('invoice.tenant', 'tenant')
        .where('invoice.status = :status', { status: InvoiceStatus.PENDING })
        .andWhere('invoice.due_date < :now', { now })
        .andWhere('invoice.deleted_at IS NULL')
        .getMany();

      this.logger.log(`Found ${overdueInvoices.length} pending invoices past due date`);

      let emailed = 0;
      for (const invoice of overdueInvoices) {
        invoice.status = InvoiceStatus.OVERDUE;
        await this.invoiceRepository.save(invoice);

        if (invoice.tenant?.email) {
          try {
            await this.emailService.sendEmail({
              to: invoice.tenant.email,
              subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} is Overdue`,
              html: `
                <h2>Payment Reminder</h2>
                <p>Dear ${invoice.tenant.firstName} ${invoice.tenant.lastName || ''},</p>
                <p>Your invoice <strong>${invoice.invoiceNumber}</strong> is now overdue.</p>
                <p><strong>Amount Due:</strong> ₹${(invoice.amountPaise - (invoice.amountPaidPaise || 0)) / 100}</p>
                <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
                <p>Please log in to the Tenant Portal to make a payment.</p>
                <p>Regards,<br>PG Management Team</p>
              `,
            });
            invoice.sentReminderAt = now;
            await this.invoiceRepository.save(invoice);
            emailed++;
          } catch (err) {
            this.logger.warn(
              `Failed to send overdue reminder for invoice ${invoice.id}: ${err.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Overdue marking completed: ${overdueInvoices.length} marked, ${emailed} emails sent`,
      );

      return {
        success: true,
        marked: overdueInvoices.length,
        emailed,
      };
    } catch (error) {
      this.logger.error(`Overdue invoice marking failed: ${error.message}`, error.stack);
      throw error;
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
