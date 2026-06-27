import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BedStatus } from '../../../entities/bed.entity';

export class CreateBedDto {
  @ApiProperty({
    description: 'UUID of the room this bed belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({
    description: 'Unique bed number/identifier within the room',
    example: 'B1',
  })
  @IsString()
  @IsNotEmpty()
  bedNumber: string;

  @ApiProperty({
    description: 'Monthly rent amount for the bed in rupees',
    example: 5000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsNotEmpty()
  rent: number;

  @ApiProperty({
    description: 'Current status of the bed',
    enum: BedStatus,
    example: BedStatus.VACANT,
    required: false,
    default: BedStatus.VACANT,
  })
  @IsEnum(BedStatus)
  @IsOptional()
  status?: BedStatus;

  @ApiProperty({
    description: 'List of amenities available with this bed',
    example: ['AC', 'ATTACHED_BATHROOM', 'WIFI'],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];
}
