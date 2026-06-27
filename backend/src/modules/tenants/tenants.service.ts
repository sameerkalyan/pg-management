import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant, TenantStatus, PaymentStatus } from '../../entities/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Bed, BedStatus } from '../../entities/bed.entity';
import { Room } from '../../entities/room.entity';
import { Property } from '../../entities/property.entity';
import { FilesService } from '../files/files.service';
import { EmailService } from '../email/email.service';
import { User, UserRole } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(Bed)
    private bedRepository: Repository<Bed>,
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private filesService: FilesService,
    private emailService: EmailService,
  ) {}

  async create(organisationId: string, createTenantDto: CreateTenantDto) {
    let welcomeEmailData: { email: string; password: string } | null = null;

    const savedTenant = await this.tenantRepository.manager.transaction(async (manager) => {
      // Lock the bed row first (without relations to avoid FOR UPDATE on outer join)
      const bedLock = await manager.findOne(Bed, {
        where: { id: createTenantDto.bedId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bedLock) {
        throw new NotFoundException('Bed not found');
      }

      // Then load with relations (no lock needed, bed is already locked)
      const bed = await manager.findOne(Bed, {
        where: { id: createTenantDto.bedId },
        relations: ['room', 'room.property'],
      });
      if (!bed) {
        throw new NotFoundException('Bed not found');
      }
      if (!bed.room || !bed.room.property || bed.room.property.organisationId !== organisationId) {
        throw new ForbiddenException('Access denied');
      }
      if (bed.status !== 'VACANT') {
        throw new BadRequestException('Bed is not available');
      }

      // Deactivate any existing active tenant on this bed (bed assignment constraint)
      const existingActiveTenant = await manager.findOne(Tenant, {
        where: { bedId: createTenantDto.bedId, status: TenantStatus.ACTIVE },
      });
      if (existingActiveTenant) {
        await manager.update(Tenant, existingActiveTenant.id, { status: TenantStatus.INACTIVE });
      }

      // Tenant self-registration: create a user account with TENANT role if email is provided
      let userId: string | null = null;
      if (createTenantDto.email) {
        const normalizedEmail = createTenantDto.email.trim().toLowerCase();

        // Check if a user with this email already exists
        const existingUser = await manager.findOne(User, {
          where: { email: normalizedEmail },
        });
        if (existingUser) {
          // Link existing user if they belong to the same organisation
          if (existingUser.organisationId === organisationId) {
            userId = existingUser.id;
          } else {
            throw new BadRequestException('Email already registered in another organisation');
          }
        } else {
          // Generate a random temporary password
          const tempPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
          const hashedPassword = await bcrypt.hash(tempPassword, 12);

          const newUser = manager.create(User, {
            email: normalizedEmail,
            password: hashedPassword,
            firstName: createTenantDto.firstName,
            lastName: createTenantDto.lastName || null,
            phoneNumber: createTenantDto.phoneNumber,
            role: UserRole.TENANT,
            organisationId,
          });
          const savedUser = await manager.save(newUser);
          userId = savedUser.id;
          welcomeEmailData = { email: normalizedEmail, password: tempPassword };
        }
      }

      const tenant = manager.create(Tenant, {
        ...createTenantDto,
        email: createTenantDto.email ? createTenantDto.email.trim().toLowerCase() : undefined,
        organisationId,
        userId,
        checkInDate: new Date(createTenantDto.checkInDate),
        checkOutDate: createTenantDto.checkOutDate ? new Date(createTenantDto.checkOutDate) : null,
      });
      const saved = await manager.save(tenant);

      // Only mark bed as OCCUPIED if the tenant is active
      const tenantStatus = createTenantDto.status || TenantStatus.ACTIVE;
      if (tenantStatus === TenantStatus.ACTIVE) {
        await manager.update(Bed, bed.id, { status: BedStatus.OCCUPIED });
      }

      return saved;
    });

    // Send welcome email after transaction commits (non-blocking)
    if (welcomeEmailData) {
      this.sendWelcomeEmail(welcomeEmailData.email, welcomeEmailData.password).catch((err) => {
        this.logger.error(`Failed to send welcome email to ${welcomeEmailData!.email}: ${err.message}`);
      });
    }

    // Enrich with signed URLs after transaction completes
    return this.findOne(savedTenant.id, organisationId);
  }

  async findAll(
    organisationId: string,
    page: number = 1,
    limit: number = 10,
    status?: TenantStatus,
    propertyId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { organisationId };
    if (status) {
      where.status = status;
    }
    if (propertyId) {
      where.bed = { room: { propertyId } };
    }
    const [tenants, total] = await this.tenantRepository.findAndCount({
      where,
      relations: ['bed', 'bed.room'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    const enrichedTenants = await Promise.all(tenants.map((t) => this.enrichWithSignedUrls(t)));
    return {
      data: enrichedTenants,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, organisationId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id, organisationId },
      relations: ['bed'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return this.enrichWithSignedUrls(tenant);
  }

  async findMyProfile(userId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
      relations: ['bed', 'bed.room', 'bed.room.property'],
    });
    if (!tenant) {
      throw new NotFoundException('Tenant profile not found');
    }
    return this.enrichWithSignedUrls(tenant);
  }

  async updateMyProfile(userId: string, updateMyProfileDto: any) {
    const tenant = await this.tenantRepository.findOne({
      where: { userId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant profile not found');
    }

    // Only allow updating specific fields
    const allowedUpdates: any = {};
    if (updateMyProfileDto.phoneNumber !== undefined) {
      allowedUpdates.phoneNumber = updateMyProfileDto.phoneNumber;
    }
    if (updateMyProfileDto.emergencyContactName !== undefined) {
      allowedUpdates.emergencyContactName = updateMyProfileDto.emergencyContactName;
    }
    if (updateMyProfileDto.emergencyContactPhone !== undefined) {
      allowedUpdates.emergencyContactPhone = updateMyProfileDto.emergencyContactPhone;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      // No valid fields to update, just return current tenant
      return this.enrichWithSignedUrls(tenant);
    }

    await this.tenantRepository.update(tenant.id, allowedUpdates);

    // Fetch and return updated tenant
    const updated = await this.tenantRepository.findOne({
      where: { id: tenant.id },
      relations: ['bed', 'bed.room', 'bed.room.property'],
    });

    return this.enrichWithSignedUrls(updated!);
  }

  async update(id: string, organisationId: string, updateTenantDto: UpdateTenantDto) {
    await this.tenantRepository.manager.transaction(async (manager) => {
      const tenant = await manager.findOne(Tenant, {
        where: { id, organisationId },
        relations: ['bed'],
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      // Bug 3 Fix: Validate bed availability when changing status to ACTIVE
      if (updateTenantDto.status === TenantStatus.ACTIVE && tenant.status !== TenantStatus.ACTIVE) {
        if (tenant.bedId) {
          const bed = await manager.findOne(Bed, {
            where: { id: tenant.bedId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!bed) {
            throw new NotFoundException('Bed not found');
          }
          if (bed.status !== BedStatus.VACANT) {
            throw new BadRequestException('Bed is not available');
          }
        }
      }

      if (updateTenantDto.bedId && updateTenantDto.bedId !== tenant.bedId) {
        const newBed = await manager.findOne(Bed, {
          where: { id: updateTenantDto.bedId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!newBed) {
          throw new NotFoundException('New bed not found');
        }
        if (newBed.status !== 'VACANT') {
          throw new BadRequestException('New bed is not available');
        }

        const room = await manager.findOne(Room, {
          where: { id: newBed.roomId },
        });
        if (!room) {
          throw new NotFoundException('Room not found for new bed');
        }
        const property = await manager.findOne(Property, {
          where: { id: room.propertyId },
        });
        if (!property || property.organisationId !== organisationId) {
          throw new ForbiddenException('Access denied');
        }

        if (tenant.status === TenantStatus.ACTIVE) {
          await manager.update(Bed, tenant.bedId, { status: BedStatus.VACANT });
          await manager.update(Bed, newBed.id, { status: BedStatus.OCCUPIED });
        }
      }

      // Bug 6 Fix: Update bed status when tenant status changes
      if (updateTenantDto.status && updateTenantDto.status !== tenant.status) {
        if (tenant.status === TenantStatus.ACTIVE && 
            (updateTenantDto.status === TenantStatus.INACTIVE || 
             updateTenantDto.status === TenantStatus.EVICTED || 
             updateTenantDto.status === TenantStatus.VACATED)) {
          // Tenant becoming inactive - mark bed as vacant
          if (tenant.bedId) {
            await manager.update(Bed, tenant.bedId, { status: BedStatus.VACANT });
          }
        } else if (updateTenantDto.status === TenantStatus.ACTIVE && tenant.status !== TenantStatus.ACTIVE) {
          // Tenant becoming active - mark bed as occupied
          if (tenant.bedId) {
            await manager.update(Bed, tenant.bedId, { status: BedStatus.OCCUPIED });
          }
        }
      }

      // Bug 8 Fix: Apply email normalization consistently
      const updateData = { ...updateTenantDto };
      if (updateData.email) {
        updateData.email = updateData.email.trim().toLowerCase();
      }

      await manager.update(Tenant, { id, organisationId }, updateData);
    });
    // Enrich with signed URLs after transaction completes
    return this.findOne(id, organisationId);
  }

  async remove(id: string, organisationId: string) {
    return await this.tenantRepository.manager.transaction(async (manager) => {
      const tenant = await manager.findOne(Tenant, {
        where: { id, organisationId },
        relations: ['bed'],
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      if (tenant.status === TenantStatus.ACTIVE) {
        await manager.update(Bed, tenant.bedId, { status: BedStatus.VACANT });
      }
      await manager.softDelete(Tenant, { id, organisationId });
    });
  }

  async uploadPhoto(id: string, organisationId: string, photoUrl: string) {
    if (!photoUrl || typeof photoUrl !== 'string') {
      throw new BadRequestException('photoUrl is required');
    }
    await this.findOne(id, organisationId);
    // Validate the URL hostname against the configured S3 endpoint to prevent SSRF
    this.validateUrlHost(photoUrl);
    // Store the S3 key, not the signed URL (BUG-33 fix)
    const key = this.extractS3Key(photoUrl);
    await this.tenantRepository.update({ id, organisationId }, { photoUrl: key });
    return this.findOne(id, organisationId);
  }

  async uploadIdProof(id: string, organisationId: string, idProofUrl: string) {
    if (!idProofUrl || typeof idProofUrl !== 'string') {
      throw new BadRequestException('idProofUrl is required');
    }
    await this.findOne(id, organisationId);
    // Validate the URL hostname against the configured S3 endpoint to prevent SSRF
    this.validateUrlHost(idProofUrl);
    // Store the S3 key, not the signed URL (BUG-33 fix)
    const key = this.extractS3Key(idProofUrl);
    await this.tenantRepository.update({ id, organisationId }, { idProofUrl: key });
    return this.findOne(id, organisationId);
  }

  async moveOut(id: string, organisationId: string, moveOutDate: Date) {
    await this.tenantRepository.manager.transaction(async (manager) => {
      const tenant = await manager.findOne(Tenant, {
        where: { id, organisationId },
        relations: ['bed'],
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      if (tenant.status !== TenantStatus.ACTIVE) {
        throw new BadRequestException('Only active tenants can be moved out');
      }

      // Update tenant
      tenant.checkOutDate = moveOutDate;
      tenant.status = TenantStatus.INACTIVE;
      await manager.save(tenant);

      // Reset bed to vacant
      if (tenant.bedId) {
        await manager.update(Bed, tenant.bedId, { status: BedStatus.VACANT });
      }

      // Bug 2 Fix: Initiate security deposit refund for PAID deposits (not PENDING)
      if (tenant.securityDepositStatus === PaymentStatus.PAID) {
        tenant.securityDepositStatus = PaymentStatus.REFUNDED;
        await manager.save(tenant);
      }
    });
    // Enrich with signed URLs after transaction completes
    return this.findOne(id, organisationId);
  }

  /**
   * Validate that the URL's hostname matches the configured S3 endpoint to prevent SSRF.
   * Throws BadRequestException if the hostname is not allowed.
   */
  private validateUrlHost(url: string): void {
    try {
      const parsed = new URL(url);
      const s3Endpoint = this.filesService.getEndpoint();
      if (s3Endpoint) {
        const endpointHost = new URL(s3Endpoint).hostname;
        if (parsed.hostname !== endpointHost) {
          throw new BadRequestException(
            `URL hostname '${parsed.hostname}' is not allowed. Must match configured S3 endpoint.`,
          );
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid URL format');
    }
  }

  private async sendWelcomeEmail(email: string, tempPassword: string): Promise<void> {
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    await this.emailService.sendEmail({
      to: email,
      subject: 'Welcome to PG Management — Your Tenant Account',
      html: `
        <h2>Welcome to PG Management</h2>
        <p>A tenant account has been created for you. You can now log in to the Tenant Portal to view your invoices, payments, and profile.</p>
        <p><strong>Your temporary password:</strong> ${tempPassword}</p>
        <p>Please log in and change your password as soon as possible.</p>
        <p><a href="${loginUrl}">Log in to Tenant Portal</a></p>
        <p>Regards,<br>PG Management Team</p>
      `,
    });
  }

  /**
   * Extract the S3 key from a URL or return the value as-is if it's already a key.
   * Handles both signed URLs (with query params) and plain keys.
   */
  private extractS3Key(urlOrKey: string): string {
    // If it's already a key (no protocol), return as-is
    if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
      return urlOrKey;
    }

    try {
      const parsed = new URL(urlOrKey);
      // Path is like /bucket-name/organisations/orgId/file.jpg
      // We need: organisations/orgId/file.jpg
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      // Skip the bucket name (first part) and join the rest
      return pathParts.slice(1).join('/');
    } catch {
      // If URL parsing fails, return as-is
      return urlOrKey;
    }
  }

  /**
   * Generate fresh signed URLs for photoUrl and idProofUrl fields.
   * These are stored as S3 keys to avoid expiry issues (BUG-33).
   */
  private async enrichWithSignedUrls(tenant: Tenant): Promise<Tenant> {
    try {
      if (tenant.photoUrl && !tenant.photoUrl.startsWith('http')) {
        tenant.photoUrl = await this.filesService.getSignedUrl(tenant.photoUrl, tenant.organisationId);
      }
      if (tenant.idProofUrl && !tenant.idProofUrl.startsWith('http')) {
        tenant.idProofUrl = await this.filesService.getSignedUrl(tenant.idProofUrl, tenant.organisationId);
      }
    } catch (error) {
      this.logger.warn(`Failed to generate signed URL for tenant ${tenant.id}: ${error.message}`);
    }
    return tenant;
  }
}
