import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SearchMemoryDto {
  @ApiProperty({
    example: 'sell-side messaging tone and compliance-safe claims',
  })
  @IsString()
  @MinLength(2)
  query!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['brand_guideline', 'compliance'],
    description: 'Restrict to chunks overlapping any of these tags',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: ['semantic', 'episodic', 'procedural'] })
  @IsOptional()
  @IsString()
  memoryType?: string;

  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class MemoryHitDto {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() memoryType!: string;
  @ApiProperty({ nullable: true }) fileId!: string | null;
  @ApiProperty({ example: 0.82 }) score!: number;
}
