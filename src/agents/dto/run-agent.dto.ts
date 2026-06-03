import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class RunAgentDto {
  @ApiProperty({
    example: 'ContentGenerationAgent',
    description: 'Agent type to run',
  })
  @IsString()
  agentType!: string;

  @ApiProperty({
    example: { campaignId: 'abc', count: 3 },
    description: 'Agent input payload',
  })
  @IsObject()
  input!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  missionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityId?: string;
}
