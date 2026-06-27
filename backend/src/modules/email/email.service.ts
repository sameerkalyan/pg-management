import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resend } from 'resend';
import { EmailLog, EmailType, EmailStatus } from '../../entities/email-log.entity';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  emailType?: EmailType;
  organisationId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | null = null;
  private fromEmail: string;
  private isDev: boolean;
  private frontendUrl: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
  ) {
    this.fromEmail = this.configService.get('EMAIL_FROM', 'noreply@pgmanagement.local');
    this.isDev = this.configService.get('NODE_ENV', 'development') !== 'production';
    this.frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:5173');

    const resendApiKey = this.configService.get('RESEND_API_KEY');

    if (resendApiKey) {
      this.resendClient = new Resend(resendApiKey);
      this.logger.log('Resend client initialized');
    } else {
      this.logger.warn('RESEND_API_KEY not configured. Emails will be logged only.');
    }
  }

  private async logEmail(
    organisationId: string,
    recipientEmail: string,
    emailType: EmailType,
    subject: string,
    html: string,
    text: string | undefined,
    status: EmailStatus,
    metadata?: Record<string, any>,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const log = this.emailLogRepository.create({
        organisationId,
        recipientEmail,
        emailType,
        subject,
        htmlBody: html,
        textBody: text || null,
        status,
        metadata: metadata || null,
        errorMessage: errorMessage || null,
      });
      await this.emailLogRepository.save(log);
    } catch (err) {
      this.logger.error(`Failed to log email: ${err.message}`);
    }
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const emailType = options.emailType || EmailType.OTHER;
    const orgId = options.organisationId || '00000000-0000-0000-0000-000000000000';

    if (this.isDev || !this.resendClient) {
      this.logger.log(`[DEV EMAIL] To: ${options.to}, Subject: ${options.subject}`);
      this.logger.debug(`[DEV EMAIL] HTML: ${options.html.substring(0, 200)}...`);
      await this.logEmail(orgId, options.to, emailType, options.subject, options.html, options.text, EmailStatus.SENT, options.metadata);
      return;
    }

    try {
      const { error } = await this.resendClient.emails.send({
        from: this.fromEmail,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        ...(options.text && { text: options.text }),
      });

      if (error) {
        throw new Error(error.message);
      }

      this.logger.log(`Email sent successfully to ${options.to}`);
      await this.logEmail(orgId, options.to, emailType, options.subject, options.html, options.text, EmailStatus.SENT, options.metadata);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      await this.logEmail(orgId, options.to, emailType, options.subject, options.html, options.text, EmailStatus.FAILED, options.metadata, error.message);
      throw error;
    }
  }

  async sendSubscriptionExpiryNotification(
    to: string,
    orgName: string,
    expiryDate: Date,
    graceEndDate: Date,
  ): Promise<void> {
    const subject = `Action Required: Your PG Management subscription grace period ends ${graceEndDate.toDateString()}`;
    const renewUrl = `${this.frontendUrl}/subscription-payment`;
    const html = `
      <h2>Subscription Expired — Grace Period Active</h2>
      <p>Hello,</p>
      <p>Your subscription for <strong>${orgName}</strong> expired on <strong>${expiryDate.toDateString()}</strong>.</p>
      <p><strong>Your grace period ends on ${graceEndDate.toDateString()}.</strong> Please renew before this date to avoid service interruption.</p>
      <p>Renew now to keep your account active.</p>
      <p><a href="${renewUrl}">Renew Subscription</a></p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html, emailType: EmailType.SUBSCRIPTION_EXPIRY_WARNING });
  }

  async sendSubscriptionReminder(
    to: string,
    orgName: string,
    expiryDate: Date,
    daysRemaining: number,
  ): Promise<void> {
    const subject = `Your PG Management subscription expires in ${daysRemaining} days`;
    const renewUrl = `${this.frontendUrl}/subscription-payment`;
    const html = `
      <h2>Subscription Renewal Reminder</h2>
      <p>Hello,</p>
      <p>Your subscription for <strong>${orgName}</strong> will expire on <strong>${expiryDate.toDateString()}</strong> (${daysRemaining} days remaining).</p>
      <p>Please renew soon to avoid service interruption.</p>
      <p><a href="${renewUrl}">Renew Subscription</a></p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html, emailType: EmailType.SUBSCRIPTION_RENEWED });
  }

  async sendOrganisationApprovalNotification(to: string, orgName: string): Promise<void> {
    const subject = `Your organisation ${orgName} has been approved`;
    const html = `
      <h2>Organisation Approved</h2>
      <p>Hello,</p>
      <p>Your organisation <strong>${orgName}</strong> has been approved and is now active.</p>
      <p>You can now log in and start managing your properties.</p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html });
  }

  async sendOrganisationRejectionNotification(
    to: string,
    orgName: string,
    reason: string,
  ): Promise<void> {
    const subject = `Your organisation ${orgName} has been rejected`;
    const html = `
      <h2>Organisation Rejected</h2>
      <p>Hello,</p>
      <p>Your organisation <strong>${orgName}</strong> has been rejected.</p>
      <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
      <p>If you believe this is an error, please contact support.</p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html });
  }

  async sendOrganisationSuspensionNotification(to: string, orgName: string): Promise<void> {
    const subject = `Your organisation ${orgName} has been suspended`;
    const html = `
      <h2>Organisation Suspended</h2>
      <p>Hello,</p>
      <p>Your organisation <strong>${orgName}</strong> has been suspended.</p>
      <p>All users in the organisation have been deactivated.</p>
      <p>Please contact support for more information.</p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html });
  }

  async sendOrganisationReactivationNotification(to: string, orgName: string): Promise<void> {
    const subject = `Your organisation ${orgName} has been reactivated`;
    const html = `
      <h2>Organisation Reactivated</h2>
      <p>Hello,</p>
      <p>Your organisation <strong>${orgName}</strong> has been reactivated and is now fully operational.</p>
      <p>All previously suspended users have been reactivated.</p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html });
  }

  async sendComplaintAssignmentNotification(
    to: string,
    assigneeName: string,
    complaintTitle: string,
    complaintId: string,
    tenantName: string,
    priority: string,
    category: string,
  ): Promise<void> {
    const subject = `New Complaint Assigned: ${complaintTitle}`;
    const complaintUrl = `${this.frontendUrl}/complaints`;
    const html = `
      <h2>New Complaint Assigned to You</h2>
      <p>Hello ${assigneeName},</p>
      <p>A new complaint has been assigned to you:</p>
      <ul>
        <li><strong>Title:</strong> ${complaintTitle}</li>
        <li><strong>Tenant:</strong> ${tenantName}</li>
        <li><strong>Priority:</strong> ${priority}</li>
        <li><strong>Category:</strong> ${category}</li>
      </ul>
      <p>Please review and take necessary action.</p>
      <p><a href="${complaintUrl}">View Complaints</a></p>
      <p>Regards,<br>PG Management Team</p>
    `;
    await this.sendEmail({ to, subject, html, emailType: EmailType.COMPLAINT_ASSIGNED });
  }

  async sendComplaintStatusChangeNotification(
    to: string,
    tenantName: string,
    complaintTitle: string,
    oldStatus: string,
    newStatus: string,
    organisationId?: string,
  ): Promise<void> {
    const subject = `Complaint Status Updated: ${complaintTitle}`;
    const html = `
      <h2>Complaint Status Updated</h2>
      <p>Hello ${tenantName},</p>
      <p>Your complaint <strong>"${complaintTitle}"</strong> status has been updated:</p>
      <ul>
        <li><strong>Previous Status:</strong> ${oldStatus}</li>
        <li><strong>New Status:</strong> ${newStatus}</li>
      </ul>
      <p>Thank you for your patience.</p>
      <p>Regards,<br>PG Management Team</p>
    `;
    const emailType = newStatus === 'RESOLVED' ? EmailType.COMPLAINT_RESOLVED : EmailType.COMPLAINT_STATUS_CHANGED;
    await this.sendEmail({ to, subject, html, emailType, organisationId });
  }
}
