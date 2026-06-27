import { ApiProperty } from '@nestjs/swagger';

export class OccupancyStatsDto {
  @ApiProperty({ description: 'Total number of beds', example: 100 })
  totalBeds: number;

  @ApiProperty({ description: 'Number of occupied beds', example: 75 })
  occupiedBeds: number;

  @ApiProperty({ description: 'Number of vacant beds', example: 25 })
  vacantBeds: number;

  @ApiProperty({ description: 'Occupancy rate as percentage', example: 75.0 })
  occupancyRate: number;
}
