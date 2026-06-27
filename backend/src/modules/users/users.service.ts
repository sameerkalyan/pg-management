import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { User, UserRole, UserStatus } from '../../entities/user.entity';
import { Organisation, OrganisationStatus } from '../../entities/organisation.entity';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organisation)
    private organisationRepository: Repository<Organisation>,
    @Inject('REDIS_CLIENT')
    private redis: Redis,
  ) {}

  async findOne(id: string, organisationId: string) {
    const user = await this.userRepository.findOne({
      where: { id, organisationId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(organisationId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [users, total] = await this.userRepository.findAndCount({
      where: { organisationId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data: users.map(user => this.sanitizeUser(user)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async inviteUser(organisationId: string, inviteUserDto: InviteUserDto, invitedBy: string) {
    // Verify organisation exists and is approved
    const organisation = await this.organisationRepository.findOne({
      where: { id: organisationId },
    });

    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }

    if (organisation.status !== OrganisationStatus.APPROVED) {
      throw new ForbiddenException('Organisation must be approved before inviting users');
    }

    // Validate role - can only invite MANAGER or ACCOUNTANT
    if (![UserRole.MANAGER, UserRole.ACCOUNTANT].includes(inviteUserDto.role)) {
      throw new BadRequestException('Can only invite users with MANAGER or ACCOUNTANT role');
    }

    // Check if email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: inviteUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Generate temporary password
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Create user
    const user = this.userRepository.create({
      firstName: inviteUserDto.firstName,
      lastName: inviteUserDto.lastName,
      email: inviteUserDto.email,
      password: hashedPassword,
      role: inviteUserDto.role,
      status: UserStatus.ACTIVE,
      organisationId,
      mustChangePassword: true, // Force password change on first login
    });

    const savedUser = await this.userRepository.save(user);

    // TODO: Send welcome email with temp password
    // await this.emailService.sendWelcomeEmail(savedUser, tempPassword, organisation.name);

    return {
      user: this.sanitizeUser(savedUser),
      tempPassword, // Only returned in response, not stored
    };
  }

  async updateRole(id: string, organisationId: string, updateUserRoleDto: UpdateUserRoleDto, requestingUserId: string) {
    const user = await this.findOne(id, organisationId);

    // Cannot change your own role
    if (user.id === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    // Cannot change OWNER role
    if (user.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot change owner role');
    }

    // Can only assign MANAGER or ACCOUNTANT roles
    if (![UserRole.MANAGER, UserRole.ACCOUNTANT].includes(updateUserRoleDto.role)) {
      throw new BadRequestException('Can only assign MANAGER or ACCOUNTANT role');
    }

    user.role = updateUserRoleDto.role;
    await this.userRepository.save(user);

    return this.sanitizeUser(user);
  }

  async deactivate(id: string, organisationId: string, requestingUserId: string) {
    const user = await this.findOne(id, organisationId);

    // Cannot deactivate yourself
    if (user.id === requestingUserId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    // Cannot deactivate OWNER
    if (user.role === UserRole.OWNER) {
      throw new ForbiddenException('Cannot deactivate owner account');
    }

    // Update status
    user.status = UserStatus.INACTIVE;
    await this.userRepository.save(user);

    // Invalidate all active sessions for this user
    await this.invalidateUserSessions(user.id);

    return this.sanitizeUser(user);
  }

  async reactivate(id: string, organisationId: string) {
    const user = await this.findOne(id, organisationId);

    if (user.status !== UserStatus.INACTIVE) {
      throw new BadRequestException('User is not inactive');
    }

    user.status = UserStatus.ACTIVE;
    await this.userRepository.save(user);

    return this.sanitizeUser(user);
  }

  async updateProfile(id: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only allowed fields
    if (updateProfileDto.firstName !== undefined) {
      user.firstName = updateProfileDto.firstName;
    }
    if (updateProfileDto.lastName !== undefined) {
      user.lastName = updateProfileDto.lastName;
    }
    if (updateProfileDto.phoneNumber !== undefined) {
      user.phoneNumber = updateProfileDto.phoneNumber;
    }
    if (updateProfileDto.avatarUrl !== undefined) {
      user.avatarUrl = updateProfileDto.avatarUrl;
    }

    await this.userRepository.save(user);

    return this.sanitizeUser(user);
  }

  async getMyProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['organisation'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  private async invalidateUserSessions(userId: string) {
    try {
      // Find all Redis keys for this user's sessions
      const pattern = `sess:*`;
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        try {
          const sessionData = await this.redis.get(key);
          if (sessionData) {
            try {
              const session = JSON.parse(sessionData);
              if (session.userId === userId || session.user?.id === userId) {
                await this.redis.del(key);
              }
            } catch (parseError) {
              // If session data is corrupted (invalid JSON), delete it anyway for cleanup
              console.warn(`Corrupted session data in key ${key}, deleting:`, parseError);
              await this.redis.del(key);
            }
          }
        } catch (keyError) {
          // Log but continue processing other keys
          console.error(`Error processing session key ${key}:`, keyError);
        }
      }
    } catch (error) {
      console.error('Error invalidating user sessions:', error);
      // Don't throw error, session invalidation is best effort
    }
  }

  private generateTempPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one of each type using randomInt for security
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[randomInt(0, 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[randomInt(0, 26)];
    password += '0123456789'[randomInt(0, 10)];
    password += '!@#$%^&*'[randomInt(0, 8)];
    
    // Fill the rest randomly using randomInt
    for (let i = password.length; i < length; i++) {
      password += charset[randomInt(0, charset.length)];
    }
    
    // Shuffle the password using Fisher-Yates algorithm with randomInt
    const chars = password.split('');
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    
    return chars.join('');
  }

  private sanitizeUser(user: User) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}
