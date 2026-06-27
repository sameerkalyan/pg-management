import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class UploadIdProofDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  idProofUrl: string;
}
