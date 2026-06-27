import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, IsUUID, IsArray } from 'class-validator';
import { RoomStatus, RoomType } from '../../../entities/room.entity';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ description: 'Property ID', example: 'uuid-here' })
  @IsUUID()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ description: 'Floor number', example: 1 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  floor: number;

  @ApiProperty({ description: 'Room number', example: '101' })
  @IsString()
  @IsNotEmpty()
  roomNumber: string;

  @ApiProperty({ description: 'Total bed capacity', example: 4 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  capacity: number;

  @ApiProperty({ description: 'Room type', enum: RoomType, required: false })
  @IsEnum(RoomType)
  @IsOptional()
  type?: RoomType;

  @ApiProperty({ description: 'Room status', enum: RoomStatus, required: false })
  @IsEnum(RoomStatus)
  @IsOptional()
  status?: RoomStatus;

  @ApiProperty({ description: 'Room description', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Room amenities', type: [String], required: false, example: ['WiFi', 'AC', 'TV'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @ApiProperty({ description: 'Monthly rent per bed in rupees', example: 5000, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  rentPerBed?: number;
}
