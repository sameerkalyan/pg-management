import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { OccupancyStatsDto } from './dto/occupancy-stats.dto';
import { CollectionStatsDto } from './dto/collection-stats.dto';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('occupancy')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get occupancy statistics' })
  @ApiOkResponse({ 
    description: 'Returns occupancy statistics', 
    type: OccupancyStatsDto 
  })
  getOccupancy(@CurrentUser('organisationId') organisationId: string) {
    return this.dashboardService.getOccupancyStats(organisationId);
  }

  @Get('collection')
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get collection statistics' })
  @ApiOkResponse({ 
    description: 'Returns collection statistics', 
    type: CollectionStatsDto 
  })
  getCollection(@CurrentUser('organisationId') organisationId: string) {
    return this.dashboardService.getCollectionStats(organisationId);
  }
}
