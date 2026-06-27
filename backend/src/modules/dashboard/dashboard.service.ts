import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bed, BedStatus } from '../../entities/bed.entity';
import { Invoice, InvoiceStatus } from '../../entities/invoice.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
  ) {}

  async getOccupancyStats(organisationId: string) {
    const totalBeds = await this.bedRepository
      .createQueryBuilder('bed')
      .innerJoin('bed.room', 'room')
      .innerJoin('room.property', 'property')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('bed.deleted_at IS NULL')
      .andWhere('room.deleted_at IS NULL')
      .andWhere('property.deleted_at IS NULL')
      .getCount();

    const occupiedBeds = await this.bedRepository
      .createQueryBuilder('bed')
      .innerJoin('bed.room', 'room')
      .innerJoin('room.property', 'property')
      .where('property.organisation_id = :organisationId', { organisationId })
      .andWhere('bed.status = :status', { status: BedStatus.OCCUPIED })
      .andWhere('bed.deleted_at IS NULL')
      .andWhere('room.deleted_at IS NULL')
      .andWhere('property.deleted_at IS NULL')
      .getCount();

    return {
      totalBeds,
      occupiedBeds,
      vacantBeds: totalBeds - occupiedBeds,
      occupancyRate: totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0,
    };
  }

  async getCollectionStats(organisationId: string) {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const result = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('SUM(invoice.amount_paise)', 'totalAmount')
      .addSelect(
        "SUM(CASE WHEN invoice.status != 'DRAFT' THEN invoice.amount_paid_paise ELSE 0 END)",
        'collectedAmount',
      )
      .addSelect(
        "SUM(CASE WHEN invoice.status = 'OVERDUE' THEN (invoice.amount_paise - invoice.amount_paid_paise) ELSE 0 END)",
        'overdueAmount',
      )
      .where('invoice.organisation_id = :organisationId', { organisationId })
      .andWhere('invoice.created_at >= :monthStart', { monthStart: currentMonth })
      .andWhere("invoice.status != 'DRAFT'")
      .andWhere('invoice.deleted_at IS NULL')
      .getRawOne();

    const totalAmount = Number(result.totalAmount) || 0;
    const collectedAmount = Number(result.collectedAmount) || 0;
    const overdueAmount = Number(result.overdueAmount) || 0;

    return {
      total: totalAmount,
      collected: collectedAmount,
      pending: totalAmount - collectedAmount,
      overdue: overdueAmount,
    };
  }
}
