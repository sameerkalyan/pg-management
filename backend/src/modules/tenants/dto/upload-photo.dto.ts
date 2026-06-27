import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class UploadPhotoDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  photoUrl: string;
}
