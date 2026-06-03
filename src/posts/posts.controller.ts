import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PostStatus } from '@prisma/client';
import { CreatePostDto, UpdateMetricsDto, UpdatePostDto } from './dto/post.dto';
import { PostsService } from './posts.service';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a post (content calendar entry)' })
  @ApiResponse({ status: 201, description: 'Post created' })
  create(@Body() dto: CreatePostDto) {
    return this.posts.create(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'List posts (optionally by campaign/status) — content calendar feed',
  })
  @ApiQuery({ name: 'campaignId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PostStatus })
  findAll(
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: PostStatus,
  ) {
    return this.posts.findAll({ campaignId, status });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a post with metrics, analysis, and recommendations',
  })
  findOne(@Param('id') id: string) {
    return this.posts.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a post' })
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(id, dto);
  }

  @Patch(':id/metrics')
  @ApiOperation({ summary: 'Manually set post metrics (CTR recomputed)' })
  setMetrics(@Param('id') id: string, @Body() dto: UpdateMetricsDto) {
    return this.posts.setMetrics(id, dto);
  }

  @Post(':id/metrics/refresh')
  @ApiOperation({
    summary:
      'Refresh metrics (simulates a platform refresh). Values only increase and ' +
      'a performance-monitoring job is triggered automatically.',
  })
  @ApiResponse({
    status: 201,
    description: 'Updated metrics + previous snapshot',
  })
  refresh(@Param('id') id: string) {
    return this.posts.refreshMetrics(id);
  }

  @Post(':id/publish')
  @ApiOperation({
    summary:
      'Publish a post (simulates going live). The autonomous metric-checker then ' +
      'pulls mock analytics on a cron and runs the agent loops automatically.',
  })
  @ApiResponse({ status: 201, description: 'Published post' })
  publish(@Param('id') id: string) {
    return this.posts.publish(id);
  }
}
