import { IsDateString, IsNotEmpty } from 'class-validator';

export class MoveOutDto {
  @IsDateString()
  @IsNotEmpty()
  moveOutDate: string;
}
