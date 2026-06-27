import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Room, RoomStatus, RoomType } from '../../entities/room.entity';
import { Bed, BedStatus } from '../../entities/bed.entity';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Property } from '../../entities/property.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    private dataSource: DataSource,
  ) {}

  async create(organisationId: string, createRoomDto: CreateRoomDto) {
    const property = await this.propertyRepository.findOne({
      where: { id: createRoomDto.propertyId },
    });
    if (!property || property.organisationId !== organisationId) {
      throw new ForbiddenException('Invalid property or access denied');
    }

    const roomType = createRoomDto.type || RoomType.SINGLE;
    const typeCapacityMap: Record<RoomType, number | null> = {
      [RoomType.SINGLE]: 1,
      [RoomType.DOUBLE]: 2,
      [RoomType.TRIPLE]: 3,
      [RoomType.DORMITORY]: null,
    };
    const expectedCapacity = typeCapacityMap[roomType];
    if (expectedCapacity !== null && createRoomDto.capacity !== expectedCapacity) {
      throw new BadRequestException(
        `Room type ${roomType} requires capacity ${expectedCapacity}, got ${createRoomDto.capacity}`,
      );
    }

    const room = this.roomRepository.create({
      ...createRoomDto,
      type: roomType,
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedRoom = await queryRunner.manager.save(room);

      const beds: Bed[] = [];
      for (let i = 1; i <= createRoomDto.capacity; i++) {
        const bed = queryRunner.manager.create(Bed, {
          roomId: savedRoom.id,
          bedNumber: `${savedRoom.roomNumber}-B${i}`,
          rent: '0',
          status: BedStatus.VACANT,
        });
        beds.push(bed);
      }
      if (beds.length > 0) {
        await queryRunner.manager.save(Bed, beds);
      }

      await queryRunner.commitTransaction();
      return { ...savedRoom, beds };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async findByProperty(
    propertyId: string,
    organisationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId },
    });
    if (!property || property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }

    const skip = (page - 1) * limit;
    const [rooms, total] = await this.roomRepository.findAndCount({
      where: { propertyId },
      relations: ['beds'],
      order: { floor: 'ASC', roomNumber: 'ASC' },
      skip,
      take: limit,
    });
    return {
      data: rooms.map((room) => ({
        ...room,
        occupiedBeds: room.beds?.filter((b) => b.status === BedStatus.OCCUPIED).length || 0,
        totalBeds: room.beds?.length || 0,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findVacantBeds(propertyId: string, organisationId: string) {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId },
    });
    if (!property || property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }

    const rooms = await this.roomRepository.find({
      where: { propertyId },
      relations: ['beds'],
      order: { floor: 'ASC', roomNumber: 'ASC' },
    });

    const vacantBeds: Array<{ id: string; bedNumber: string; roomId: string; roomNumber: string; floor: number; rent: string }> = [];
    for (const room of rooms) {
      for (const bed of room.beds || []) {
        if (bed.status === BedStatus.VACANT) {
          vacantBeds.push({
            id: bed.id,
            bedNumber: bed.bedNumber,
            roomId: room.id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            rent: bed.rent,
          });
        }
      }
    }
    return { data: vacantBeds };
  }

  async findOne(id: string, organisationId: string) {
    const room = await this.roomRepository.findOne({
      where: { id },
      relations: ['property', 'beds'],
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    if (!room.property || room.property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }
    return room;
  }

  async update(id: string, organisationId: string, updateRoomDto: UpdateRoomDto) {
    const room = await this.findOne(id, organisationId);
    if (updateRoomDto.propertyId) {
      const property = await this.propertyRepository.findOne({
        where: { id: updateRoomDto.propertyId },
      });
      if (!property || property.organisationId !== organisationId) {
        throw new ForbiddenException('Invalid property or access denied');
      }
    }

    // Validate capacity vs room type (same rule as create)
    const roomType = updateRoomDto.type || room.type;
    const newCapacity = updateRoomDto.capacity ?? room.capacity;
    const typeCapacityMap: Record<RoomType, number | null> = {
      [RoomType.SINGLE]: 1,
      [RoomType.DOUBLE]: 2,
      [RoomType.TRIPLE]: 3,
      [RoomType.DORMITORY]: null,
    };
    const expectedCapacity = typeCapacityMap[roomType];
    if (expectedCapacity !== null && newCapacity !== expectedCapacity) {
      throw new BadRequestException(
        `Room type ${roomType} requires capacity ${expectedCapacity}, got ${newCapacity}`,
      );
    }

    // Sync beds if capacity is being updated
    if (updateRoomDto.capacity !== undefined && updateRoomDto.capacity !== room.capacity) {
      const existingBeds = room.beds || [];
      if (updateRoomDto.capacity > existingBeds.length) {
        // Create new beds
        const newBeds: Bed[] = [];
        for (let i = existingBeds.length + 1; i <= updateRoomDto.capacity; i++) {
          const bed = this.bedRepository.create({
            roomId: id,
            bedNumber: `${room.roomNumber}-B${i}`,
            rent: '0',
            status: BedStatus.VACANT,
          });
          newBeds.push(bed);
        }
        await this.bedRepository.save(newBeds);
      } else if (updateRoomDto.capacity < existingBeds.length) {
        // Check if any beds beyond the new capacity are occupied
        const bedsToRemove = existingBeds.slice(updateRoomDto.capacity);
        const occupiedBeds = bedsToRemove.filter((b) => b.status === BedStatus.OCCUPIED);
        if (occupiedBeds.length > 0) {
          throw new BadRequestException(
            'Cannot reduce capacity: some beds that would be removed are currently occupied',
          );
        }
        // Soft-delete excess beds
        for (const bed of bedsToRemove) {
          await this.bedRepository.softDelete(bed.id);
        }
      }
    }

    await this.roomRepository.update(id, updateRoomDto);
    return this.findOne(id, organisationId);
  }

  async remove(id: string, organisationId: string) {
    const room = await this.findOne(id, organisationId);
    // Soft-delete all beds belonging to this room
    if (room.beds && room.beds.length > 0) {
      for (const bed of room.beds) {
        await this.bedRepository.softDelete(bed.id);
      }
    }
    await this.roomRepository.softDelete(id);
  }

  async updateStatus(id: string, organisationId: string, status: RoomStatus) {
    await this.findOne(id, organisationId);
    await this.roomRepository.update(id, { status });
    return this.findOne(id, organisationId);
  }

  async updateBedStatus(
    roomId: string,
    bedId: string,
    organisationId: string,
    status: BedStatus,
  ) {
    await this.findOne(roomId, organisationId);
    const bed = await this.bedRepository.findOne({
      where: { id: bedId, roomId },
    });
    if (!bed) {
      throw new NotFoundException('Bed not found');
    }
    bed.status = status;
    await this.bedRepository.save(bed);
    return bed;
  }
}
