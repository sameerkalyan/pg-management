import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Bed } from '../../entities/bed.entity';
import { CreateBedDto } from './dto/create-bed.dto';
import { UpdateBedDto } from './dto/update-bed.dto';
import { BedStatus } from '../../entities/bed.entity';
import { Room } from '../../entities/room.entity';
import { Property } from '../../entities/property.entity';

@Injectable()
export class BedsService {
  constructor(
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
  ) {}

  async create(organisationId: string, createBedDto: CreateBedDto) {
    const room = await this.roomRepository.findOne({
      where: { id: createBedDto.roomId },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const property = await this.propertyRepository.findOne({
      where: { id: room.propertyId },
    });
    if (!property || property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }

    // Use transaction with pessimistic locking to prevent race condition
    const queryRunner = this.bedRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the room row for update
      const lockedRoom = await queryRunner.manager
        .createQueryBuilder(Room, 'room')
        .setLock('pessimistic_write')
        .where('room.id = :id', { id: room.id })
        .getOne();

      if (!lockedRoom) {
        throw new NotFoundException('Room not found');
      }

      const existingBedsCount = await queryRunner.manager.count(Bed, {
        where: { roomId: room.id, deletedAt: null },
      });

      if (existingBedsCount >= lockedRoom.capacity) {
        throw new BadRequestException(
          `Room capacity (${lockedRoom.capacity}) reached. Cannot add more beds.`,
        );
      }

      const bed = queryRunner.manager.create(Bed, {
        ...createBedDto,
        rent: createBedDto.rent.toString(),
      });
      const savedBed = await queryRunner.manager.save(bed);

      await queryRunner.commitTransaction();
      return savedBed;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findByRoom(roomId: string, organisationId: string, page: number = 1, limit: number = 50) {
    const room = await this.roomRepository.findOne({
      where: { id: roomId },
    });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    const property = await this.propertyRepository.findOne({
      where: { id: room.propertyId },
    });
    if (!property || property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }

    const skip = (page - 1) * limit;
    const [beds, total] = await this.bedRepository.findAndCount({
      where: { roomId },
      order: { bedNumber: 'ASC' },
      skip,
      take: limit,
    });
    return {
      data: beds,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organisationId: string) {
    const bed = await this.bedRepository.findOne({
      where: { id },
      relations: ['room', 'room.property'],
    });
    if (!bed) {
      throw new NotFoundException('Bed not found');
    }
    if (!bed.room || !bed.room.property || bed.room.property.organisationId !== organisationId) {
      throw new ForbiddenException('Access denied');
    }
    return bed;
  }

  async update(id: string, organisationId: string, updateBedDto: UpdateBedDto) {
    await this.findOne(id, organisationId);
    if (updateBedDto.roomId) {
      const room = await this.roomRepository.findOne({
        where: { id: updateBedDto.roomId },
      });
      if (!room) {
        throw new NotFoundException('Room not found');
      }
      const property = await this.propertyRepository.findOne({
        where: { id: room.propertyId },
      });
      if (!property || property.organisationId !== organisationId) {
        throw new ForbiddenException('Access denied');
      }

      // Check capacity of the new room
      const existingBedsCount = await this.bedRepository.count({
        where: { roomId: room.id, deletedAt: null },
      });
      if (existingBedsCount >= room.capacity) {
        throw new BadRequestException(
          `Target room capacity (${room.capacity}) reached. Cannot move bed to this room.`,
        );
      }
    }
    await this.bedRepository.update({ id }, {
      ...updateBedDto,
      ...(updateBedDto.rent !== undefined && { rent: updateBedDto.rent.toString() }),
    });
    return this.findOne(id, organisationId);
  }

  async remove(id: string, organisationId: string) {
    await this.findOne(id, organisationId);
    await this.bedRepository.softDelete({ id });
  }

  async updateStatus(id: string, organisationId: string, status: BedStatus) {
    await this.findOne(id, organisationId);
    await this.bedRepository.update({ id }, { status });
    return this.findOne(id, organisationId);
  }

  async getVacantBeds(
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

    const rooms = await this.roomRepository.find({
      where: { propertyId },
    });
    const roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const skip = (page - 1) * limit;
    const [beds, total] = await this.bedRepository.findAndCount({
      where: { roomId: In(roomIds), status: BedStatus.VACANT },
      order: { bedNumber: 'ASC' },
      skip,
      take: limit,
    });
    return {
      data: beds,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
