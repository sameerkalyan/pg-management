import { Controller, Get, Post, Put, Delete, UseGuards, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ComplaintsService } from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ComplaintStatus, ComplaintPriority, ComplaintCategory } from '../../entities/complaint.entity';

@ApiTags('complaints')
@Controller('complaints')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ComplaintsController {
  constructor(private complaintsService: ComplaintsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.TENANT)
  @ApiOperation({ summary: 'Create a new complaint' })
  create(
    @Body() createComplaintDto: CreateComplaintDto,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.complaintsService.create(organisationId, createComplaintDto, userId, userRole);
  }

  @Get('my-complaints')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Get complaints for the logged-in tenant' })
  findMyComplaints(
    @CurrentUser('id') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return this.complaintsService.findMyComplaints(userId, pageNum, limitNum);
  }

  @Get('tenant/:tenantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get complaints by tenant' })
  findByTenant(
    @Param('tenantId') tenantId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    return this.complaintsService.findByTenant(tenantId, organisationId, pageNum, limitNum);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get all complaints for organisation' })
  findAll(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const statusEnum = status && Object.values(ComplaintStatus).includes(status as ComplaintStatus)
      ? (status as ComplaintStatus) : undefined;
    const priorityEnum = priority && Object.values(ComplaintPriority).includes(priority as ComplaintPriority)
      ? (priority as ComplaintPriority) : undefined;
    const categoryEnum = category && Object.values(ComplaintCategory).includes(category as ComplaintCategory)
      ? (category as ComplaintCategory) : undefined;
    return this.complaintsService.findAll(organisationId, pageNum, limitNum, statusEnum, priorityEnum, categoryEnum);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.TENANT)
  @ApiOperation({ summary: 'Get complaint by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.complaintsService.findOne(id, organisationId, userId, userRole);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update complaint' })
  update(
    @Param('id') id: string,
    @Body() updateComplaintDto: UpdateComplaintDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.complaintsService.update(id, organisationId, updateComplaintDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete complaint' })
  remove(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.complaintsService.remove(id, organisationId);
  }
}
