import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Query,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { RejectOrganisationDto, SuspendOrganisationDto } from './dto/approve-organisation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MfaGuard } from '../../common/guards/mfa.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { SkipOrgStatusCheck } from '../../common/decorators/skip-org-status.decorator';
import { UserRole } from '../../entities/user.entity';
import { OrganisationStatus } from '../../entities/organisation.entity';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, MfaGuard)
@Roles(UserRole.SUPER_ADMIN)
@SkipSubscriptionCheck()
@SkipOrgStatusCheck()
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('organisations')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @ApiOperation({ summary: 'Get all organisations (Super Admin only)' })
  async findAllOrganisations(
    @Query('status') status?: OrganisationStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, page ? parseInt(page) : 1);
    const limitNum = Math.min(100, Math.max(1, limit ? parseInt(limit) : 50));
    return this.adminService.findAllOrganisations(status, pageNum, limitNum);
  }

  @Get('organisations/:id')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @ApiOperation({ summary: 'Get organisation details (Super Admin only)' })
  async findOneOrganisation(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findOneOrganisation(id);
  }

  @Post('organisations/:id/approve')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Approve organisation (Super Admin only)' })
  async approveOrganisation(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.approveOrganisation(id, req.user.id);
  }

  @Post('organisations/:id/reject')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Reject organisation (Super Admin only)' })
  async rejectOrganisation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rejectDto: RejectOrganisationDto,
    @Request() req,
  ) {
    return this.adminService.rejectOrganisation(id, rejectDto, req.user.id);
  }

  @Post('organisations/:id/suspend')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Suspend organisation (Super Admin only)' })
  async suspendOrganisation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() suspendDto: SuspendOrganisationDto,
    @Request() req,
  ) {
    return this.adminService.suspendOrganisation(id, suspendDto, req.user.id);
  }

  @Post('organisations/:id/reactivate')
  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ApiOperation({ summary: 'Reactivate organisation (Super Admin only)' })
  async reactivateOrganisation(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.adminService.reactivateOrganisation(id, req.user.id);
  }

  @Get('stats')
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @ApiOperation({ summary: 'Get platform statistics (Super Admin only)' })
  async getStats() {
    return this.adminService.getOrganisationStats();
  }
}
