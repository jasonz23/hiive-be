import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CampaignStatus } from '@prisma/client';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Sell-side Founder Liquidity Campaign' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'Increase inbound sellers of pre-IPO shares' })
  @IsString()
  objective!: string;

  @ApiProperty({ example: 'Startup employees, founders, early investors' })
  @IsString()
  audience!: string;

  @ApiPropertyOptional({ type: [String], example: ['LinkedIn', 'Email', 'X'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  channels?: string[];

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiProperty({
    example: { impressions: 50000, clicks: 1500, leads: 100 },
    description: 'Goal targets (leads maps to conversions)',
  })
  @IsObject()
  goals!: Record<string, number>;

  @ApiPropertyOptional({ enum: CampaignStatus })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Owning mission id' })
  @IsOptional()
  @IsString()
  missionId?: string;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}
