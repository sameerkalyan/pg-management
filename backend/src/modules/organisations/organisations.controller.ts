import { Controller, Get, Put, UseGuards, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganisationsService } from './organisations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { SkipOrgStatusCheck } from '../../common/decorators/skip-org-status.decorator';

@ApiTags('organisations')
@Controller('organisations')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrganisationsController {
  constructor(private organisationsService: OrganisationsService) {}

  @Get('me')
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Get current user\'s organisation' })
  getMyOrganisation(@CurrentUser('organisationId') organisationId: string) {
    return this.organisationsService.findByUserId(organisationId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Get organisation by ID' })
  findOne(@Param('id') id: string) {
    return this.organisationsService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.OWNER)
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Update organisation settings' })
  update(
    @Param('id') id: string,
    @Body() updateOrganisationDto: UpdateOrganisationDto,
    @CurrentUser('organisationId') requestingUserOrgId: string,
  ) {
    return this.organisationsService.update(id, requestingUserOrgId, updateOrganisationDto);
  }
}
