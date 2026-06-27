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
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UpdateRoomStatusDto } from './dto/update-room-status.dto';
import { UpdateBedStatusDto } from './dto/update-bed-status.dto';
import { RoomStatus } from '../../entities/room.entity';
import { BedStatus } from '../../entities/bed.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('rooms')
@Controller('rooms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new room' })
  create(
    @Body() createRoomDto: CreateRoomDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.roomsService.create(organisationId, createRoomDto);
  }

  @Get('property/:propertyId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get rooms by property' })
  findByProperty(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser('organisationId') organisationId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
    return this.roomsService.findByProperty(propertyId, organisationId, pageNum, limitNum);
  }

  @Get('property/:propertyId/vacant-beds')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get vacant beds for a property' })
  findVacantBeds(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.roomsService.findVacantBeds(propertyId, organisationId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Get room by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.roomsService.findOne(id, organisationId);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update room' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.roomsService.update(id, organisationId, updateRoomDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Delete room' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('organisationId') organisationId: string) {
    return this.roomsService.remove(id, organisationId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update room status' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomStatusDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.roomsService.updateStatus(id, organisationId, dto.status);
  }

  @Patch(':roomId/beds/:bedId/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update bed status' })
  updateBedStatus(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('bedId', ParseUUIDPipe) bedId: string,
    @Body() dto: UpdateBedStatusDto,
    @CurrentUser('organisationId') organisationId: string,
  ) {
    return this.roomsService.updateBedStatus(roomId, bedId, organisationId, dto.status);
  }
}
