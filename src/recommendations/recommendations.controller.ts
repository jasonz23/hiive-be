import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RecommendationStatus } from '@prisma/client';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'List agent recommendations' })
  @ApiQuery({ name: 'campaignId', required: false })
  @ApiQuery({ name: 'postId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: RecommendationStatus })
  list(
    @Query('campaignId') campaignId?: string,
    @Query('postId') postId?: string,
    @Query('status') status?: RecommendationStatus,
  ) {
    return this.recommendations.list({ campaignId, postId, status });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Accept / dismiss a recommendation' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: RecommendationStatus,
  ) {
    return this.recommendations.updateStatus(id, status);
  }
}
