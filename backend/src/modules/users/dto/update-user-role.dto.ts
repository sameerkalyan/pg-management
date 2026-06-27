import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../entities/user.entity';

export class UpdateUserRoleDto {
  @ApiProperty({ description: 'New user role', enum: UserRole, example: UserRole.ACCOUNTANT })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
