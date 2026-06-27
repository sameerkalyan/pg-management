import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  UseGuards,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { MoveOutDto } from './dto/move-out.dto';
import { UploadPhotoDto } from './dto/upload-photo.dto';
import { UploadIdProofDto } from './dto/upload-id-proof.dto';
import { TenantStatus } from '../../entities/tenant.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new tenant' })
  create(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.tenantsService.create(organisationId, createTenantDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get all tenants' })
  findAll(
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: TenantStatus,
    @Query('propertyId') propertyId?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    return this.tenantsService.findAll(organisationId, pageNum, limitNum, status, propertyId);
  }

  @Get('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Get own tenant profile' })
  findMyProfile(@CurrentUser('id') userId: string) {
    return this.tenantsService.findMyProfile(userId);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.TENANT)
  @ApiOperation({ summary: 'Update own tenant profile (phone, emergency contact only)' })
  updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() updateMyProfileDto: UpdateMyProfileDto,
  ) {
    return this.tenantsService.updateMyProfile(userId, updateMyProfileDto);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get tenant by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.tenantsService.findOne(id, organisationId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update tenant' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.tenantsService.update(id, organisationId, updateTenantDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete tenant' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.tenantsService.remove(id, organisationId);
  }

  @Post(':id/moveout')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Move out tenant (check-out)' })
  moveOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOutDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.tenantsService.moveOut(id, organisationId, new Date(dto.moveOutDate));
  }

  @Patch(':id/photo')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Upload tenant photo' })
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadPhotoDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.tenantsService.uploadPhoto(id, organisationId, dto.photoUrl);
  }

  @Patch(':id/id-proof')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Upload tenant ID proof' })
  uploadIdProof(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadIdProofDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.tenantsService.uploadIdProof(id, organisationId, dto.idProofUrl);
  }
}
