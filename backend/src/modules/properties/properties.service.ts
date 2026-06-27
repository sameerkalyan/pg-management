import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property, PropertyStatus } from '../../entities/property.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UserRole } from '../../entities/user.entity';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
  ) {}

  async create(organisationId: string, createPropertyDto: CreatePropertyDto, userId?: string, role?: string) {
    const property = this.propertyRepository.create({
      ...createPropertyDto,
      organisationId,
      managedByUserId: role === UserRole.MANAGER ? userId : null,
    });
    return this.propertyRepository.save(property);
  }

  async findAll(
    organisationId: string,
    userId: string,
    role: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { organisationId };

    // Managers only see properties assigned to them
    if (role === UserRole.MANAGER) {
      where.managedByUserId = userId;
    }

    const [properties, total] = await this.propertyRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: properties,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organisationId: string, userId?: string, role?: string) {
    const property = await this.propertyRepository.findOne({
      where: { id, organisationId },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    // Managers can only access properties assigned to them
    if (role === UserRole.MANAGER && property.managedByUserId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return property;
  }

  async update(
    id: string,
    organisationId: string,
    updatePropertyDto: UpdatePropertyDto,
    userId?: string,
    role?: string,
  ) {
    await this.findOne(id, organisationId, userId, role);
    await this.propertyRepository.update({ id, organisationId }, updatePropertyDto);
    return this.findOne(id, organisationId, userId, role);
  }

  async remove(id: string, organisationId: string, userId?: string, role?: string) {
    await this.findOne(id, organisationId, userId, role);
    await this.propertyRepository.softDelete({ id, organisationId });
  }

  async getStats(organisationId: string) {
    const total = await this.propertyRepository
      .createQueryBuilder('property')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('property.deleted_at IS NULL')
      .getCount();
    const active = await this.propertyRepository
      .createQueryBuilder('property')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('property.status = :status', { status: PropertyStatus.ACTIVE })
      .andWhere('property.deleted_at IS NULL')
      .getCount();
    const inMaintenance = await this.propertyRepository
      .createQueryBuilder('property')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('property.status = :status', { status: PropertyStatus.MAINTENANCE })
      .andWhere('property.deleted_at IS NULL')
      .getCount();
    const totalRoomsResult = await this.propertyRepository
      .createQueryBuilder('property')
      .innerJoin('property.rooms', 'room')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('property.deleted_at IS NULL')
      .andWhere('room.deleted_at IS NULL')
      .select('COUNT(room.id)', 'totalRooms')
      .getRawOne();
    const totalRooms = parseInt(totalRoomsResult?.totalRooms || '0', 10);
    return {
      total,
      active,
      inMaintenance,
      inactive: total - active - inMaintenance,
      totalRooms,
    };
  }
}
