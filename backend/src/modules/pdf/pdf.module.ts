import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PdfService } from './pdf.service';
import { PdfController } from './pdf.controller';
import { Payment } from '../../entities/payment.entity';
import { Invoice } from '../../entities/invoice.entity';
import { Tenant } from '../../entities/tenant.entity';
import { Bed } from '../../entities/bed.entity';
import { Room } from '../../entities/room.entity';
import { Property } from '../../entities/property.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Invoice, Tenant, Bed, Room, Property]),
  ],
  controllers: [PdfController],
  providers: [PdfService],
  exports: [PdfService],
})
export class PdfModule {}
