import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailType {
  WELCOME = 'WELCOME',
  PASSWORD_RESET = 'PASSWORD_RESET',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  INVOICE_OVERDUE = 'INVOICE_OVERDUE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  SUBSCRIPTION_EXPIRY_WARNING = 'SUBSCRIPTION_EXPIRY_WARNING',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  COMPLAINT_CREATED = 'COMPLAINT_CREATED',
  COMPLAINT_RESOLVED = 'COMPLAINT_RESOLVED',
  COMPLAINT_ASSIGNED = 'COMPLAINT_ASSIGNED',
  COMPLAINT_STATUS_CHANGED = 'COMPLAINT_STATUS_CHANGED',
  ORGANISATION_APPROVED = 'ORGANISATION_APPROVED',
  ORGANISATION_REJECTED = 'ORGANISATION_REJECTED',
  ORGANISATION_SUSPENDED = 'ORGANISATION_SUSPENDED',
  ORGANISATION_REACTIVATED = 'ORGANISATION_REACTIVATED',
  OTHER = 'OTHER',
}

export enum EmailStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}

@Entity('email_logs')
@Index(['organisationId'])
@Index(['recipientEmail'])
@Index(['emailType'])
@Index(['status'])
@Index(['sentAt'])
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organisation_id' })
  organisationId: string;

  @Column({ name: 'recipient_email' })
  recipientEmail: string;

  @Column({ name: 'email_type', type: 'enum', enum: EmailType })
  emailType: EmailType;

  @Column()
  subject: string;

  @Column({ name: 'html_body', type: 'text' })
  htmlBody: string;

  @Column({ name: 'text_body', type: 'text', nullable: true })
  textBody: string;

  @Column({ type: 'enum', enum: EmailStatus, default: EmailStatus.PENDING })
  status: EmailStatus;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @CreateDateColumn({ name: 'sent_at' })
  sentAt: Date;
}
