import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { Room } from '../../entities/room.entity';
import { Bed } from '../../entities/bed.entity';
import { Property } from '../../entities/property.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Room, Bed, Property])],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
