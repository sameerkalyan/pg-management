import {
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
  Body,
  Param,
  Req,
  Query,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { RazorpayWebhookDto } from './dto/razorpay-webhook.dto';
import { InitiateTenantPaymentDto } from './dto/initiate-tenant-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentStatus, PaymentMethod } from '../../entities/payment.entity';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private configService: ConfigService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a new payment' })
  create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.paymentsService.create(organisationId, createPaymentDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get all payments for organisation' })
  findAll(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('method') method?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const statusEnum = status && Object.values(PaymentStatus).includes(status as PaymentStatus)
      ? (status as PaymentStatus)
      : undefined;
    const methodEnum = method && Object.values(PaymentMethod).includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : undefined;
    return this.paymentsService.findAll(organisationId, pageNum, limitNum, statusEnum, methodEnum);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get payment statistics' })
  getStats(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (start > end) {
      throw new BadRequestException('startDate must be before endDate');
    }
    return this.paymentsService.getPaymentStats(organisationId, start, end);
  }

  @Get('my-payments')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Get payments for the logged-in tenant' })
  findMyPayments(
    @CurrentUser('id') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    return this.paymentsService.findMyPayments(userId, pageNum, limitNum);
  }

  @Post('initiate-tenant-payment')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Initiate payment for tenant invoice' })
  async initiateTenantPayment(
    @Body() dto: InitiateTenantPaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    // Verify invoice belongs to this tenant
    const invoice = await this.paymentsService.verifyTenantInvoice(dto.invoiceId, userId);
    
    if (!invoice) {
      throw new BadRequestException('Invoice not found or does not belong to you');
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already paid');
    }

    // Validate amount matches invoice amount or remaining balance
    const remainingAmount = invoice.amountPaise - (invoice.amountPaidPaise || 0);
    if (dto.amountPaise !== invoice.amountPaise && dto.amountPaise !== remainingAmount) {
      throw new BadRequestException(
        `Invalid amount. Expected ${invoice.amountPaise} paise (full amount) or ${remainingAmount} paise (remaining balance)`
      );
    }

    if (dto.amountPaise > remainingAmount) {
      throw new BadRequestException(
        `Amount exceeds remaining balance. Remaining: ${remainingAmount} paise`
      );
    }

    // Create Razorpay order and payment record using the service
    const result = await this.paymentsService.createRazorpayOrder(dto.invoiceId, invoice.organisationId);

    return {
      orderId: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
      keyId: this.configService.get('RAZORPAY_KEY_ID'),
      paymentId: result.paymentId,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      },
    };
  }

  @Get('invoice/:invoiceId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get payments by invoice' })
  findByInvoice(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.paymentsService.findByInvoice(invoiceId, organisationId);
  }

  @Post('razorpay/order/:invoiceId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT, UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create Razorpay order' })
  createRazorpayOrder(
    @Param('invoiceId') invoiceId: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.paymentsService.createRazorpayOrder(invoiceId, organisationId);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @Post('razorpay/webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Razorpay webhook' })
  async handleWebhook(
    @Body() webhookData: RazorpayWebhookDto,
    @Req() req: Request,
  ) {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);
    await this.paymentsService.verifyWebhook(webhookData, signature, rawBody);
    return { received: true };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60 } })
  @Post('verify')
  @ApiOperation({ summary: 'Verify Razorpay payment' })
  async verifyPayment(
    @Body()
    body: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    },
  ) {
    try {
      const secret = this.configService.get('RAZORPAY_KEY_SECRET');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(body.razorpay_order_id + '|' + body.razorpay_payment_id)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const expectedSigBuffer = Buffer.from(expectedSignature, 'hex');
      const receivedSigBuffer = Buffer.from(body.razorpay_signature, 'hex');
      
      if (expectedSigBuffer.length !== receivedSigBuffer.length) {
        return { verified: false, error: 'Invalid payment signature' };
      }
      
      const isValid = crypto.timingSafeEqual(expectedSigBuffer, receivedSigBuffer);
      
      if (isValid) {
        // Find payment by razorpay order ID
        const payment = await this.paymentsService.findByRazorpayOrderId(body.razorpay_order_id);
        return { verified: true, paymentId: payment?.id };
      }
      
      return { verified: false };
    } catch (error) {
      return { verified: false, error: error?.message || 'Invalid payment signature' };
    }
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get payment by ID' })
  findOne(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.paymentsService.findOne(id, organisationId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update payment' })
  update(
    @Param('id') id: string,
    @Body() updatePaymentDto: UpdatePaymentDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.paymentsService.update(id, organisationId, updatePaymentDto);
  }
}
