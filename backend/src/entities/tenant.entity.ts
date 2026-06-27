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
import { User } from './user.entity';
import { Bed } from './bed.entity';
import { Invoice } from './invoice.entity';
import { Complaint } from './complaint.entity';

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EVICTED = 'EVICTED',
  VACATED = 'VACATED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  REFUNDED = 'REFUNDED',
}

@Entity('tenants')
@Index(['organisationId'])
@Index(['status'])
@Index(['createdAt'])
@Index(['bedId', 'status'], { unique: true, where: "status = 'ACTIVE'" })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organisation_id' })
  organisationId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @ManyToOne(() => User, (user) => user.tenants, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'bed_id' })
  bedId: string;

  @ManyToOne(() => Bed, (bed) => bed.tenants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bed_id' })
  bed: Bed;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name', nullable: true })
  lastName: string;

  @Column({ name: 'phone_number' })
  phoneNumber: string;

  @Column({ name: 'email', nullable: true })
  email: string;

  @Column({ name: 'id_proof_type', nullable: true })
  idProofType: string;

  @Column({ name: 'id_proof_url', nullable: true })
  idProofUrl: string;

  @Column({ name: 'photo_url', nullable: true })
  photoUrl: string;

  @Column({ name: 'emergency_contact_name', nullable: true })
  emergencyContactName: string;

  @Column({ name: 'emergency_contact_phone', nullable: true })
  emergencyContactPhone: string;

  @Column({ name: 'check_in_date' })
  checkInDate: Date;

  @Column({ name: 'check_out_date', nullable: true })
  checkOutDate: Date;

  @Column({ name: 'security_deposit', type: 'decimal', precision: 10, scale: 2, nullable: true })
  securityDeposit: number;

  @Column({
    name: 'security_deposit_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  securityDepositStatus: PaymentStatus;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.ACTIVE,
  })
  status: TenantStatus;

  @Column({ name: 'agreement_url', nullable: true })
  agreementUrl: string;

  @Column({ name: 'billing_date', type: 'integer', default: 1 })
  billingDate: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => Invoice, (invoice) => invoice.tenant)
  invoices: Invoice[];

  @OneToMany(() => Complaint, (complaint) => complaint.tenant)
  complaints: Complaint[];
}
