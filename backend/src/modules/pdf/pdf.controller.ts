import { Controller, Get, Post, UseGuards, Param, Res, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { Payment } from '../../entities/payment.entity';
import { Invoice } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Bed } from '../../entities/bed.entity';
import { Room } from '../../entities/room.entity';
import { Property } from '../../entities/property.entity';

@ApiTags('pdf')
@Controller('pdf')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PdfController {
  constructor(
    private pdfService: PdfService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
  ) {}

  @Get('invoice/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.TENANT)
  @ApiOperation({ summary: 'Generate invoice PDF' })
  async generateInvoicePdf(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, organisationId },
      relations: ['tenant', 'tenant.bed', 'tenant.bed.room', 'tenant.bed.room.property'],
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // If user is a tenant, verify they own this invoice
    if (role === UserRole.TENANT) {
      const tenant = await this.tenantRepository.findOne({
        where: { userId },
      });
      
      if (!tenant || tenant.id !== invoice.tenantId || tenant.organisationId !== invoice.organisationId) {
        throw new ForbiddenException('You can only download your own invoices');
      }
    }

    const pdfBuffer = await this.pdfService.generateInvoice(invoice, invoice.tenant);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Get('receipt/:id')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Generate payment receipt PDF' })
  async generateReceiptPdf(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
    @Res() res: Response,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id, organisationId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Validate payment is completed
    if (payment.status !== 'COMPLETED') {
      throw new ForbiddenException('Receipt can only be generated for completed payments');
    }

    let invoice: Invoice | null = null;
    if (payment.invoiceId) {
      invoice = await this.invoiceRepository.findOne({
        where: { id: payment.invoiceId, organisationId },
      });
    }

    let tenant: Tenant | null = null;
    if (invoice?.tenantId) {
      tenant = await this.tenantRepository.findOne({
        where: { id: invoice.tenantId, organisationId },
      });
    }

    const pdfBuffer = await this.pdfService.generateReceipt(payment, invoice, tenant);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=receipt-${payment.paymentNumber}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
  @Post('receipt/:paymentId')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Generate payment receipt PDF (deprecated - use GET /pdf/receipt/:id)' })
  async generateReceipt(
    @Param('paymentId') paymentId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Res() res: Response,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, organisationId },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Validate payment is completed
    if (payment.status !== 'COMPLETED') {
      throw new ForbiddenException('Receipt can only be generated for completed payments');
    }

    let invoice: Invoice | null = null;
    if (payment.invoiceId) {
      invoice = await this.invoiceRepository.findOne({
        where: { id: payment.invoiceId, organisationId },
      });
    }

    let tenant: Tenant | null = null;
    if (invoice?.tenantId) {
      tenant = await this.tenantRepository.findOne({
        where: { id: invoice.tenantId, organisationId },
      });
    }

    const pdfBuffer = await this.pdfService.generateReceipt(payment, invoice, tenant);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=receipt-${paymentId}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Post('agreement/:tenantId')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Generate tenancy agreement PDF' })
  async generateAgreement(
    @Param('tenantId') tenantId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId, organisationId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    let bed: Bed | null = null;
    let room: Room | null = null;
    let property: Property | null = null;

    if (tenant.bedId) {
      bed = await this.bedRepository.findOne({
        where: { id: tenant.bedId },
      });
      if (bed?.roomId) {
        room = await this.roomRepository.findOne({
          where: { id: bed.roomId },
        });
      }
    }

    // Get property through the room's propertyId
    if (room?.propertyId) {
      property = await this.propertyRepository.findOne({
        where: { id: room.propertyId, organisationId },
      });
    }

    // Validate that we have the minimum required data
    if (!property || !room || !bed) {
      throw new NotFoundException('Unable to generate agreement: property, room, or bed information is missing');
    }

    const pdfBuffer = await this.pdfService.generateAgreement(
      tenant,
      property,
      room,
      bed,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=agreement-${tenantId}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}