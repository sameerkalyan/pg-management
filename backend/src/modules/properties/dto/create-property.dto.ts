import { IsString, IsNotEmpty, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum Amenity {
  AC = 'AC',
  ATTACHED_BATHROOM = 'ATTACHED_BATHROOM',
  WIFI = 'WIFI',
  FOOD_INCLUDED = 'FOOD_INCLUDED',
  LAUNDRY = 'LAUNDRY',
  SECURITY = 'SECURITY',
  PARKING = 'PARKING',
}

export class CreatePropertyDto {
  @ApiProperty({
    description: 'Name of the property/PG',
    example: 'Green Valley PG',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Complete address of the property',
    example: '123 Main Street, Near Central Park',
  })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({
    description: 'City where the property is located',
    example: 'Bangalore',
    required: false,
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({
    description: 'State where the property is located',
    example: 'Karnataka',
    required: false,
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({
    description: 'Postal code of the property location',
    example: '560001',
    required: false,
  })
  @IsString()
  @IsOptional()
  pincode?: string;

  @ApiProperty({
    description: 'Total number of floors in the property',
    example: 3,
    minimum: 1,
    required: false,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  totalFloors?: number;

  @ApiProperty({
    description: 'List of amenities available at the property',
    example: ['AC', 'WIFI', 'PARKING', 'LAUNDRY'],
    required: false,
    type: [String],
  })
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @ApiProperty({
    description: 'Detailed description of the property',
    example: 'A comfortable PG with all modern amenities in a safe neighborhood',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
