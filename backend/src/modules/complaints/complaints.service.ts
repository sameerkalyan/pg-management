import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Complaint, ComplaintStatus, ComplaintPriority, ComplaintCategory } from '../../entities/complaint.entity';
import { Tenant } from '../../entities/tenant.entity';
import { User } from '../../entities/user.entity';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { UpdateComplaintDto } from './dto/update-complaint.dto';
import { EmailService } from '../email/email.service';
import { EmailType } from '../../entities/email-log.entity';

@Injectable()
export class ComplaintsService {
  private readonly logger = new Logger(ComplaintsService.name);

  constructor(
    @InjectRepository(Complaint)
    private complaintRepository: Repository<Complaint>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
  ) {}

  async create(organisationId: string, createComplaintDto: CreateComplaintDto, userId?: string, userRole?: string) {
    // Verify tenant belongs to this organisation (BUG-34)
    const tenant = await this.tenantRepository.findOne({
      where: { id: createComplaintDto.tenantId, organisationId },
    });
    if (!tenant) {
      throw new ForbiddenException('Tenant not found or access denied');
    }

    // Bug 4: If TENANT role creates complaint, verify tenantId matches their profile
    if (userRole === 'TENANT' && userId) {
      const userTenant = await this.tenantRepository.findOne({
        where: { userId },
      });
      if (!userTenant || userTenant.id !== createComplaintDto.tenantId) {
        throw new ForbiddenException('You can only create complaints for your own tenant profile');
      }
    }

    const complaint = this.complaintRepository.create({
      ...createComplaintDto,
      organisationId,
    });
    const saved = await this.complaintRepository.save(complaint);

    if (tenant.email) {
      try {
        await this.emailService.sendEmail({
          to: tenant.email,
          subject: `Complaint Created: ${complaint.title}`,
          html: `
            <h2>Complaint Created</h2>
            <p>Hello ${tenant.firstName} ${tenant.lastName || ''},</p>
            <p>Your complaint <strong>"${complaint.title}"</strong> has been registered.</p>
            <p>We will get back to you soon.</p>
            <p>Regards,<br>PG Management Team</p>
          `,
          emailType: EmailType.COMPLAINT_CREATED,
          organisationId,
        });
      } catch (err) {
        this.logger.warn(`Failed to send complaint created email: ${err.message}`);
      }
    }

    return saved;
  }

  async findByTenant(
    tenantId: string,
    organisationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId, organisationId },
    });
    if (!tenant) {
      throw new ForbiddenException('Access denied');
    }
    const skip = (page - 1) * limit;
    const [complaints, total] = await this.complaintRepository.findAndCount({
      where: { tenantId, organisationId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: complaints,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAll(
    organisationId: string,
    page: number = 1,
    limit: number = 50,
    status?: ComplaintStatus,
    priority?: ComplaintPriority,
    category?: ComplaintCategory,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { organisationId };
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }
    if (category) {
      where.category = category;
    }
    const [complaints, total] = await this.complaintRepository.findAndCount({
      where,
      relations: ['tenant'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: complaints,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organisationId: string, userId?: string, userRole?: string) {
    const complaint = await this.complaintRepository.findOne({
      where: { id, organisationId },
      relations: ['tenant'],
    });
    if (!complaint) {
      throw new NotFoundException('Complaint not found');
    }
    
    // If user is a tenant, verify they own this complaint
    if (userRole === 'TENANT' && userId) {
      const tenant = await this.tenantRepository.findOne({
        where: { userId },
      });
      if (!tenant || complaint.tenantId !== tenant.id) {
        throw new ForbiddenException('Access denied');
      }
    }
    
    return complaint;
  }

  async findMyComplaints(userId: string, page: number = 1, limit: number = 50) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant profile not found');
    }
    const skip = (page - 1) * limit;
    const [complaints, total] = await this.complaintRepository.findAndCount({
      where: { tenantId: tenant.id, organisationId: tenant.organisationId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return {
      data: complaints,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, organisationId: string, updateComplaintDto: UpdateComplaintDto) {
    const complaint = await this.findOne(id, organisationId);

    // Validate that only allowed fields are being updated
    const allowedFields = ['status', 'assignedTo', 'resolution'];
    const providedFields = Object.keys(updateComplaintDto);
    const invalidFields = providedFields.filter(field => !allowedFields.includes(field));
    
    if (invalidFields.length > 0) {
      throw new ForbiddenException(`Cannot update fields: ${invalidFields.join(', ')}`);
    }

    // Validate empty payload
    if (Object.keys(updateComplaintDto).length === 0) {
      throw new ForbiddenException('No changes detected');
    }

    // Validate assignedTo user exists and belongs to same organization
    if (updateComplaintDto.assignedTo) {
      const assignee = await this.userRepository.findOne({
        where: { id: updateComplaintDto.assignedTo, organisationId },
      });
      if (!assignee) {
        throw new NotFoundException('Assigned user not found in this organization');
      }
    }

    const updateData: any = { ...updateComplaintDto };
    const oldStatus = complaint.status;
    const isBeingAssigned = updateComplaintDto.assignedTo && updateComplaintDto.assignedTo !== complaint.assignedTo;
    const isBeingUnassigned = updateComplaintDto.assignedTo === null;

    // Handle status logic carefully to avoid conflicts
    let finalStatus = updateComplaintDto.status || complaint.status;
    
    // Only auto-change to IN_PROGRESS if no explicit status was provided
    if (isBeingAssigned && complaint.status === ComplaintStatus.OPEN && !updateComplaintDto.status) {
      finalStatus = ComplaintStatus.IN_PROGRESS;
      updateData.status = ComplaintStatus.IN_PROGRESS;
    }

    // Set resolvedAt when status changes to RESOLVED
    if (finalStatus === ComplaintStatus.RESOLVED && oldStatus !== ComplaintStatus.RESOLVED) {
      updateData.resolvedAt = new Date();
    }

    // Set closedAt when status changes to CLOSED
    if (finalStatus === ComplaintStatus.CLOSED && oldStatus !== ComplaintStatus.CLOSED) {
      updateData.closedAt = new Date();
    }

    // Handle unassignment
    if (isBeingUnassigned) {
      updateData.assignedTo = null;
    }

    // Bug 6: Wrap update and fetch in transaction
    await this.complaintRepository.manager.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.update(Complaint, id, updateData);
    });
    
    // Fetch updated complaint with relations before sending notifications
    const updatedComplaint = await this.complaintRepository.findOne({
      where: { id, organisationId },
      relations: ['tenant'],
    });

    if (!updatedComplaint) {
      throw new NotFoundException('Complaint not found after update');
    }
    
    // Send notifications asynchronously but don't block the response
    this.sendNotifications(updatedComplaint, isBeingAssigned, oldStatus, finalStatus, organisationId).catch(err => {
      this.logger.error('Failed to send complaint notifications:', err);
    });
    
    return updatedComplaint;
  }

  private async sendNotifications(
    complaint: Complaint,
    isBeingAssigned: boolean,
    oldStatus: ComplaintStatus,
    newStatus: ComplaintStatus,
    organisationId: string,
  ): Promise<void> {
    try {
      // Bug 5: Fetch tenant once at the beginning if needed for notifications
      let tenant: Tenant | null = null;
      if (isBeingAssigned || newStatus !== oldStatus) {
        tenant = await this.tenantRepository.findOne({
          where: { id: complaint.tenantId, organisationId },
        });
      }

      // Send assignment notification
      if (isBeingAssigned && complaint.assignedTo) {
        const assignee = await this.userRepository.findOne({
          where: { id: complaint.assignedTo, organisationId },
        });
        
        if (assignee && assignee.email) {
          if (tenant) {
            const tenantName = `${tenant.firstName} ${tenant.lastName || ''}`.trim();
            const assigneeName = `${assignee.firstName || ''} ${assignee.lastName || ''}`.trim() || 'User';
            
            await this.emailService.sendComplaintAssignmentNotification(
              assignee.email,
              assigneeName,
              complaint.title,
              complaint.id,
              tenantName,
              complaint.priority,
              complaint.category,
            );
            this.logger.log(`Assignment notification sent to ${assignee.email}`);
          } else {
            this.logger.warn(`Tenant ${complaint.tenantId} not found for notification`);
          }
        } else {
          this.logger.warn(`Assignee ${complaint.assignedTo} has no email or not found`);
        }
      }

      // Send status change notification to tenant
      if (newStatus !== oldStatus) {
        if (tenant && tenant.email) {
          const tenantName = `${tenant.firstName} ${tenant.lastName || ''}`.trim();
          
          await this.emailService.sendComplaintStatusChangeNotification(
            tenant.email,
            tenantName,
            complaint.title,
            oldStatus,
            newStatus,
            organisationId,
          );
          this.logger.log(`Status change notification sent to ${tenant.email}`);
        } else if (tenant && !tenant.email) {
          this.logger.warn(`Tenant ${complaint.tenantId} has no email address - notification skipped`);
        } else {
          this.logger.warn(`Tenant ${complaint.tenantId} not found for status change notification`);
        }
      }
    } catch (error) {
      this.logger.error('Error in sendNotifications:', error);
      // Don't re-throw - notifications are non-critical
    }
  }

  async remove(id: string, organisationId: string) {
    const complaint = await this.findOne(id, organisationId);
    await this.complaintRepository.softDelete(id);
    return { message: 'Complaint deleted successfully' };
  }
}
