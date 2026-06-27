import { ApiProperty } from '@nestjs/swagger';

export class CollectionStatsDto {
  @ApiProperty({ description: 'Total invoice amount in paise', example: 10000000 })
  total: number;

  @ApiProperty({ description: 'Collected amount in paise', example: 7500000 })
  collected: number;

  @ApiProperty({ description: 'Pending amount in paise', example: 2000000 })
  pending: number;

  @ApiProperty({ description: 'Overdue amount in paise', example: 500000 })
  overdue: number;
}
