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
import { Tenant } from './tenant.entity';
import { Payment } from './payment.entity';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceType {
  RENT = 'RENT',
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT',
  OTHER = 'OTHER',
}

@Entity('invoices')
@Index(['organisationId'])
@Index(['tenantId'])
@Index(['status'])
@Index(['billingDate'])
@Index(['createdAt'])
@Index(['tenantId', 'billingDate', 'type'], { unique: true })
@Index(['tenantId', 'billingDate', 'status'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organisation_id' })
  organisationId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.invoices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'invoice_number', unique: true })
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: InvoiceType,
    default: InvoiceType.RENT,
  })
  type: InvoiceType;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: Date;

  @Column({ name: 'billing_date', type: 'date' })
  billingDate: Date;

  @Column({ name: 'amount_paise', type: 'bigint' })
  amountPaise: number;

  @Column({ name: 'amount_paid_paise', type: 'bigint', default: 0 })
  amountPaidPaise: number;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING,
  })
  status: InvoiceStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'json', nullable: true })
  items: Array<{
    description: string;
    amount: number;
  }>;

  @Column({ name: 'sent_reminder_at', type: 'timestamp', nullable: true })
  sentReminderAt: Date;

  @Column({ name: 'generated_at', type: 'timestamp', nullable: true })
  generatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @OneToMany(() => Payment, (payment) => payment.invoice)
  payments: Payment[];
}
