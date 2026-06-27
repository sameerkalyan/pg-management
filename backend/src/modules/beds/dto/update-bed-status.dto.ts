import { IsEnum, IsNotEmpty } from 'class-validator';
import { BedStatus } from '../../../entities/bed.entity';

export class UpdateBedStatusDto {
  @IsEnum(BedStatus)
  @IsNotEmpty()
  status: BedStatus;
}
