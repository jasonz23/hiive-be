import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PostStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ example: 'campaign id' })
  @IsString()
  campaignId!: string;

  @ApiProperty({ example: 'LinkedIn' })
  @IsString()
  platform!: string;

  @ApiProperty({ example: 'Thinking about liquidity before your IPO? ...' })
  @IsString()
  @MinLength(1)
  copy!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @ApiPropertyOptional({ enum: PostStatus })
  @IsOptional()
  @IsEnum(PostStatus)
  status?: PostStatus;

  @ApiPropertyOptional({ example: '2026-06-10T09:00:00.000Z' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

export class UpdatePostDto extends PartialType(CreatePostDto) {}

export class UpdateMetricsDto {
  @ApiProperty({
    example: {
      impressions: 1000,
      likes: 50,
      comments: 5,
      shares: 2,
      clicks: 12,
      conversions: 1,
    },
    description:
      'Manually entered metrics. CTR is recomputed from clicks/impressions.',
  })
  @IsObject()
  metrics!: Record<string, number>;
}
