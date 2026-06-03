import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AdStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdDto {
  @ApiProperty() @IsString() campaignId!: string;
  @ApiProperty({ example: 'Founder liquidity — value prop A' })
  @IsOptional()
  @IsString()
  name?: string;
  @ApiProperty({ example: 'LinkedIn' }) @IsString() platform!: string;
  @ApiProperty({ example: 5000 }) @IsNumber() @Min(0) budget!: number;
  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  spend?: number;
  @ApiPropertyOptional({ example: 40000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  impressions?: number;
  @ApiPropertyOptional({ example: 380 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  clicks?: number;
  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  conversions?: number;
  @ApiPropertyOptional({ enum: AdStatus })
  @IsOptional()
  @IsEnum(AdStatus)
  status?: AdStatus;
  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startDate?: string;
  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class UpdateAdDto extends PartialType(CreateAdDto) {}
