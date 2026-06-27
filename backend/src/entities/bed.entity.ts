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
import { Room } from './room.entity';
import { Tenant } from './tenant.entity';

export enum BedStatus {
  VACANT = 'VACANT',
  OCCUPIED = 'OCCUPIED',
  MAINTENANCE = 'MAINTENANCE',
  RESERVED = 'RESERVED',
}

@Entity('beds')
@Index(['roomId'])
@Index(['status'])
@Index(['createdAt'])
export class Bed {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, (room) => room.beds, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ name: 'bed_number' })
  bedNumber: string;

  // TypeORM returns decimal as string to preserve precision
  // Convert to number when needed: parseFloat(bed.rent)
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  rent: string;

  @Column({
    type: 'enum',
    enum: BedStatus,
    default: BedStatus.VACANT,
  })
  status: BedStatus;

  @Column({ type: 'json', nullable: true })
  amenities: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => Tenant, (tenant) => tenant.bed)
  tenants: Tenant[];
}
