import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BedsService } from './beds.service';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { UpdateBedStatusDto } from './dto/update-bed-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('beds')
@Controller('beds')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BedsController {
  constructor(private bedsService: BedsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new bed' })
  create(
    @Body() createBedDto: CreateBedDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.bedsService.create(organisationId, createBedDto);
  }

  @Get('room/:roomId/vacant')
  @ApiOperation({ summary: 'Get vacant beds by room' })
  getVacantBeds(
    @Param('roomId') roomId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    return this.bedsService.getVacantBeds(roomId, organisationId, pageNum, limitNum);
  }

  @Get('room/:roomId')
  @ApiOperation({ summary: 'Get beds by room' })
  findByRoom(
    @Param('roomId') roomId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    return this.bedsService.findByRoom(roomId, organisationId, pageNum, limitNum);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bed by ID' })
  findOne(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.bedsService.findOne(id, organisationId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update bed' })
  update(
    @Param('id') id: string,
    @Body() updateBedDto: UpdateBedDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.bedsService.update(id, organisationId, updateBedDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete bed' })
  remove(@Param('id') id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.bedsService.remove(id, organisationId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update bed status' })
  updateStatus(
    @Param('id') id: string,
    @Body() updateBedStatusDto: UpdateBedStatusDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.bedsService.updateStatus(id, organisationId, updateBedStatusDto.status);
  }
}
