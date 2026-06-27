import { Controller, Get, Post, Put, UseGuards, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../entities/user.entity';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SkipSubscriptionCheck } from '../../common/decorators/skip-subscription.decorator';
import { SkipOrgStatusCheck } from '../../common/decorators/skip-org-status.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Get all users in organisation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    return this.usersService.findAll(organisationId, pageNum, limitNum);
  }

  @Get('me')
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Get current user profile' })
  getMyProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getMyProfile(userId);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.usersService.findOne(id, organisationId);
  }

  @Post('invite')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Invite a new user (Manager or Accountant)' })
  inviteUser(
    @Body() inviteUserDto: InviteUserDto,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') invitedBy: string,
  ) {
    return this.usersService.inviteUser(organisationId, inviteUserDto, invitedBy);
  }

  @Put(':id/role')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Update user role' })
  updateRole(
    @Param('id') id: string,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') requestingUserId: string,
  ) {
    return this.usersService.updateRole(id, organisationId, updateUserRoleDto, requestingUserId);
  }

  @Put(':id/deactivate')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate user (invalidates all sessions)' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
    @CurrentUser('id') requestingUserId: string,
  ) {
    return this.usersService.deactivate(id, organisationId, requestingUserId);
  }

  @Put(':id/reactivate')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Reactivate user' })
  reactivate(
    @Param('id') id: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.usersService.reactivate(id, organisationId);
  }

  @Put(':id/profile')
  @SkipSubscriptionCheck()
  @SkipOrgStatusCheck()
  @ApiOperation({ summary: 'Update user profile (own profile only)' })
  updateProfile(
    @Param('id') id: string,
    @Body() updateProfileDto: UpdateProfileDto,
    @CurrentUser('id') requestingUserId: string,
  ) {
    // Users can only update their own profile
    if (id !== requestingUserId) {
      throw new BadRequestException('You can only update your own profile');
    }
    return this.usersService.updateProfile(id, updateProfileDto);
  }
}
