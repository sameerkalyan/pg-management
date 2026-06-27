import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ComplaintStatus } from '../../../entities/complaint.entity';

export class UpdateComplaintDto {
  @ApiProperty({ enum: ComplaintStatus, required: false })
  @IsEnum(ComplaintStatus)
  @IsOptional()
  status?: ComplaintStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  resolution?: string;
}
