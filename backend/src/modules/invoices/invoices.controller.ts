import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Body,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InvoiceStatus } from '../../entities/invoice.entity';

@ApiTags('invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Create a new invoice' })
  create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.invoicesService.create(organisationId, createInvoiceDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get all invoices for organisation' })
  findAll(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const statusEnum = status && Object.values(InvoiceStatus).includes(status as InvoiceStatus)
      ? (status as InvoiceStatus)
      : undefined;
    return this.invoicesService.findAll(organisationId, pageNum, limitNum, statusEnum, tenantId);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get invoice statistics' })
  getInvoiceStats(
    @CurrentUser('organisationId') organisationId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (start > end) {
      throw new BadRequestException('startDate must be before endDate');
    }
    return this.invoicesService.getInvoiceStats(organisationId, start, end);
  }

  @Get('my-invoices')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Get invoices for the logged-in tenant' })
  findMyInvoices(
    @CurrentUser('id') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    return this.invoicesService.findMyInvoices(userId, pageNum, limitNum);
  }

  @Post('mark-overdue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Mark pending invoices as overdue if due date has passed' })
  markOverdue(@CurrentUser('organisationId') organisationId: string) {
    return this.invoicesService.markOverdue(organisationId);
  }

  @Post('send-overdue-reminders')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Send overdue reminder emails' })
  sendOverdueReminders(@CurrentUser('organisationId') organisationId: string) {
    return this.invoicesService.markOverdue(organisationId);
  }

  @Get('tenant/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get invoices by tenant' })
  findByTenant(
    @Param('tenantId') tenantId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    return this.invoicesService.findByTenant(tenantId, organisationId, pageNum, limitNum);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get invoice by ID' })
  findOne(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.invoicesService.findOne(id, organisationId);
  }

  @Post(':id/send-email')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Send invoice email to tenant' })
  sendInvoiceEmail(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.invoicesService.sendInvoiceEmail(id, organisationId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Update invoice' })
  update(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.invoicesService.update(id, organisationId, updateInvoiceDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete invoice' })
  remove(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.invoicesService.remove(id, organisationId);
  }
}
