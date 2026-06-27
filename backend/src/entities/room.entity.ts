import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { Property } from './property.entity';
import { Bed } from './bed.entity';

export enum RoomStatus {
  VACANT = 'VACANT',
  OCCUPIED = 'OCCUPIED',
  PARTIALLY_OCCUPIED = 'PARTIALLY_OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
}

export enum RoomType {
  SINGLE = 'SINGLE',
  DOUBLE = 'DOUBLE',
  TRIPLE = 'TRIPLE',
  DORMITORY = 'DORMITORY',
}

@Entity('rooms')
@Index(['propertyId'])
@Index(['status'])
@Index(['createdAt'])
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'property_id' })
  propertyId: string;

  @ManyToOne(() => Property, (property) => property.rooms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'property_id' })
  property: Property;

  @Column({ name: 'room_number' })
  roomNumber: string;

  @Column({ type: 'integer' })
  floor: number;

  @Column({
    type: 'enum',
    enum: RoomType,
    default: RoomType.SINGLE,
  })
  type: RoomType;

  @Column({
    type: 'enum',
    enum: RoomStatus,
    default: RoomStatus.VACANT,
  })
  status: RoomStatus;

  @Column({ type: 'integer' })
  capacity: number;

  @Column({ type: 'json', nullable: true })
  amenities: string[];

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => Bed, (bed) => bed.room)
  beds: Bed[];
}
