import { IsString, IsNotEmpty } from 'class-validator';

export class RejectOrganisationDto {
  @IsString()
  @IsNotEmpty()
  rejectionReason: string;
}

export class SuspendOrganisationDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
