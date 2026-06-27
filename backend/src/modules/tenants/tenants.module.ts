import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { Tenant } from '../../entities/tenant.entity';
import { Bed } from '../../entities/bed.entity';
import { Room } from '../../entities/room.entity';
import { Property } from '../../entities/property.entity';
import { User } from '../../entities/user.entity';
import { FilesModule } from '../files/files.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Bed, Room, Property, User]), FilesModule, EmailModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
