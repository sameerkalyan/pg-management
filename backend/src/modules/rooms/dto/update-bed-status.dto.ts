import { IsEnum } from 'class-validator';
import { BedStatus } from '../../../entities/bed.entity';

export class UpdateBedStatusDto {
  @IsEnum(BedStatus)
  status: BedStatus;
}
