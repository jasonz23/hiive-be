import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MissionStatus, Priority } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateMissionDto {
  @ApiProperty({ example: 'Increase sell-side founder leads by 30%' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({
    example: 'Drive more inbound founders who want pre-IPO liquidity',
  })
  @IsString()
  objective!: string;

  @ApiPropertyOptional({ enum: Priority })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiProperty({
    example: {
      metric: 'founder_leads',
      baseline: 100,
      target: 130,
      unit: 'leads',
    },
  })
  @IsObject()
  targetMetric!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Startup founders and early employees' })
  @IsOptional()
  @IsString()
  audience?: string;
}

export class UpdateMissionDto extends PartialType(CreateMissionDto) {
  @ApiPropertyOptional({ enum: MissionStatus })
  @IsOptional()
  @IsEnum(MissionStatus)
  status?: MissionStatus;
}
