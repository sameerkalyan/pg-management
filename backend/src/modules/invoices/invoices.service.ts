import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Invoice, InvoiceStatus, InvoiceType } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { EmailService } from '../email/email.service';
import { EmailType } from '../../entities/email-log.entity';
import * as crypto from 'crypto';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
  ) {}

  private generateInvoiceNumber(): string {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
    return `INV-${ymd}-${rand}`;
  }

  async create(organisationId: string, createInvoiceDto: CreateInvoiceDto) {
    // Verify tenant belongs to this organisation
    const tenant = await this.tenantRepository.findOne({
      where: { id: createInvoiceDto.tenantId, organisationId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found or access denied');
    }

    // Convert amount (rupees) to paise
    const amountPaise = Math.round(createInvoiceDto.amount * 100);

    // Auto-generate invoice number if not provided
    const invoiceNumber = createInvoiceDto.invoiceNumber || this.generateInvoiceNumber();

    // Set billing date to today if not provided
    const billingDate = createInvoiceDto.billingDate
      ? new Date(createInvoiceDto.billingDate)
      : new Date();

    const invoice = this.invoiceRepository.create({
      tenantId: createInvoiceDto.tenantId,
      organisationId,
      invoiceNumber,
      amountPaise,
      amountPaidPaise: 0,
      type: createInvoiceDto.type || InvoiceType.RENT,
      billingDate,
      dueDate: new Date(createInvoiceDto.dueDate),
      status: InvoiceStatus.PENDING,
      description: createInvoiceDto.description || null,
    });

    try {
      return await this.invoiceRepository.save(invoice);
    } catch (err: any) {
      // Handle unique constraint violation (duplicate invoice for same tenant+billingDate+type)
      if (err.code === '23505') {
        throw new ConflictException(
          'Duplicate invoice: an invoice already exists for this tenant, billing date, and type',
        );
      }
      throw err;
    }
  }

  async findByTenant(
    tenantId: string,
    organisationId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId, organisationId },
    });
    if (!tenant) {
      throw new ForbiddenException('Access denied');
    }
    const skip = (page - 1) * limit;
    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: { tenantId, organisationId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organisationId: string) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, organisationId },
      relations: ['tenant'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async findAll(
    organisationId: string,
    page: number = 1,
    limit: number = 10,
    status?: InvoiceStatus,
    tenantId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { organisationId };
    if (status) {
      where.status = status;
    }
    if (tenantId) {
      where.tenantId = tenantId;
    }
    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where,
      relations: ['tenant'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMyInvoices(userId: string, page: number = 1, limit: number = 10) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant profile not found');
    }
    const skip = (page - 1) * limit;
    const [invoices, total] = await this.invoiceRepository.findAndCount({
      where: { tenantId: tenant.id, organisationId: tenant.organisationId },
      relations: ['tenant'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, organisationId: string, updateInvoiceDto: UpdateInvoiceDto) {
    const invoice = await this.findOne(id, organisationId);

    // Prevent modifying amount or type of paid or partially-paid invoices
    if (
      (invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.PARTIALLY_PAID) &&
      (updateInvoiceDto.amount !== undefined || updateInvoiceDto.type !== undefined)
    ) {
      throw new BadRequestException(
        'Cannot modify amount or type of a paid or partially-paid invoice',
      );
    }

    // Convert amount (rupees) to paise if provided
    const updateData: any = { ...updateInvoiceDto };
    // Strip fields that must not be changed via update
    delete updateData.tenantId;
    delete updateData.invoiceNumber;
    if (updateInvoiceDto.amount !== undefined) {
      if (updateInvoiceDto.amount <= 0) {
        throw new BadRequestException('Amount must be greater than 0');
      }
      updateData.amountPaise = Math.round(updateInvoiceDto.amount * 100);
      delete updateData.amount;
    }
    if (updateInvoiceDto.dueDate !== undefined) {
      updateData.dueDate = new Date(updateInvoiceDto.dueDate);
    }
    if (updateInvoiceDto.billingDate !== undefined) {
      updateData.billingDate = new Date(updateInvoiceDto.billingDate);
    }

    try {
      await this.invoiceRepository.update({ id, organisationId }, updateData);
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException(
          'Duplicate invoice: an invoice with these details already exists',
        );
      }
      throw err;
    }
    return this.findOne(id, organisationId);
  }

  async remove(id: string, organisationId: string) {
    const invoice = await this.findOne(id, organisationId);
    if (invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.PARTIALLY_PAID) {
      throw new BadRequestException('Cannot delete a paid or partially-paid invoice');
    }
    await this.invoiceRepository.softDelete({ id, organisationId });
  }

  async markOverdue(organisationId?: string): Promise<{ marked: number; emailed: number }> {
    const now = new Date();
    const qb = this.invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.tenant', 'tenant')
      .where('invoice.status = :status', { status: InvoiceStatus.PENDING })
      .andWhere('invoice.due_date < :now', { now })
      .andWhere('invoice.deleted_at IS NULL');

    if (organisationId) {
      qb.andWhere('invoice.organisation_id = :organisationId', { organisationId });
    }

    const overdueInvoices = await qb.getMany();

    let emailed = 0;
    for (const invoice of overdueInvoices) {
      // Use optimistic locking to prevent race conditions
      const result = await this.invoiceRepository
        .createQueryBuilder()
        .update(Invoice)
        .set({ status: InvoiceStatus.OVERDUE })
        .where('id = :id', { id: invoice.id })
        .andWhere('status = :status', { status: InvoiceStatus.PENDING })
        .execute();
      
      // Skip if another process already updated this invoice
      if (result.affected === 0) {
        continue;
      }
      
      invoice.status = InvoiceStatus.OVERDUE;

      // Send reminder email to tenant if they have an email
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
            emailType: EmailType.INVOICE_OVERDUE,
            organisationId: invoice.organisationId,
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
      `Marked ${overdueInvoices.length} invoices as overdue, sent ${emailed} reminder emails`,
    );
    return { marked: overdueInvoices.length, emailed };
  }

  async getInvoiceStats(organisationId: string, startDate: Date, endDate: Date) {
    const result = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('COUNT(*)', 'totalInvoices')
      .addSelect("SUM(CASE WHEN invoice.status = 'PAID' THEN 1 ELSE 0 END)", 'paidInvoices')
      .addSelect("SUM(CASE WHEN invoice.status = 'PENDING' THEN 1 ELSE 0 END)", 'pendingInvoices')
      .addSelect("SUM(CASE WHEN invoice.status = 'OVERDUE' THEN 1 ELSE 0 END)", 'overdueInvoices')
      .addSelect('SUM(invoice.amount_paise)', 'totalAmount')
      .addSelect(
        "SUM(CASE WHEN invoice.status = 'PAID' THEN invoice.amount_paise ELSE 0 END)",
        'paidAmount',
      )
      .addSelect(
        "SUM(CASE WHEN invoice.status = 'PENDING' THEN invoice.amount_paise ELSE 0 END)",
        'pendingAmount',
      )      .addSelect("SUM(CASE WHEN invoice.status = 'OVERDUE' THEN invoice.amount_paise ELSE 0 END)",
        'overdueAmount',
      )
      .addSelect("SUM(CASE WHEN invoice.status = 'PARTIALLY_PAID' THEN 1 ELSE 0 END)",
        'partiallyPaidInvoices',
      )
      .addSelect(
        "SUM(CASE WHEN invoice.status = 'PARTIALLY_PAID' THEN invoice.amount_paise ELSE 0 END)",
        'partiallyPaidAmount',
      )
      .where('invoice.organisation_id = :organisationId', { organisationId })
      .andWhere('invoice.billing_date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('invoice.deleted_at IS NULL')
      .getRawOne();

    return {
      totalInvoices: parseInt(result.totalInvoices) || 0,
      paidInvoices: parseInt(result.paidInvoices) || 0,
      pendingInvoices: parseInt(result.pendingInvoices) || 0,
      overdueInvoices: parseInt(result.overdueInvoices) || 0,
      partiallyPaidInvoices: parseInt(result.partiallyPaidInvoices) || 0,
      totalAmount: parseInt(result.totalAmount) || 0,
      paidAmount: parseInt(result.paidAmount) || 0,
      pendingAmount: parseInt(result.pendingAmount) || 0,
      overdueAmount: parseInt(result.overdueAmount) || 0,
      partiallyPaidAmount: parseInt(result.partiallyPaidAmount) || 0,
    };
  }

  async sendInvoiceEmail(id: string, organisationId: string): Promise<{ sent: boolean }> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, organisationId },
      relations: ['tenant'],
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.tenant?.email) {
      return { sent: false };
    }

    await this.emailService.sendEmail({
      to: invoice.tenant.email,
      subject: `Invoice ${invoice.invoiceNumber} Generated`,
      html: `
        <h2>Invoice Generated</h2>
        <p>Dear ${invoice.tenant.firstName} ${invoice.tenant.lastName || ''},</p>
        <p>Your invoice <strong>${invoice.invoiceNumber}</strong> has been generated.</p>
        <p><strong>Amount:</strong> ₹${invoice.amountPaise / 100}</p>
        <p><strong>Due Date:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
        <p>Please log in to the Tenant Portal to make a payment.</p>
        <p>Regards,<br>PG Management Team</p>
      `,
      emailType: EmailType.INVOICE_GENERATED,
      organisationId,
      metadata: { invoiceId: id },
    });

    return { sent: true };
  }
}
