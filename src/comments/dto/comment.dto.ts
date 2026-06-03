import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ enum: ['comment', 'suggestion'] })
  @IsIn(['comment', 'suggestion'])
  type!: 'comment' | 'suggestion';

  @ApiProperty({ example: 'This CTA is too vague.' })
  @IsString()
  @MinLength(1)
  body!: string;

  @ApiPropertyOptional({
    description: 'Highlighted span the comment refers to',
  })
  @IsOptional()
  @IsString()
  quotedText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  rangeStart?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  rangeEnd?: number;

  @ApiPropertyOptional({ description: 'Replacement text for a suggestion' })
  @IsOptional()
  @IsString()
  suggestedText?: string;
}
