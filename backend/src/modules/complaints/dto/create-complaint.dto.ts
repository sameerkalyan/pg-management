import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ComplaintCategory, ComplaintPriority } from '../../../entities/complaint.entity';

export class CreateComplaintDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  tenantId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ enum: ComplaintPriority })
  @IsEnum(ComplaintPriority)
  @IsNotEmpty()
  priority: ComplaintPriority;

  @ApiProperty({ enum: ComplaintCategory })
  @IsEnum(ComplaintCategory)
  @IsNotEmpty()
  category: ComplaintCategory;
}
