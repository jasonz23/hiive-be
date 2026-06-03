import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MemoryHitDto, SearchMemoryDto } from './dto/search-memory.dto';
import { MemoryService } from './memory.service';

@ApiTags('memory')
@Controller('memory')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Post('search')
  @ApiOperation({ summary: 'Semantic search over marketing memory (RAG)' })
  @ApiResponse({
    status: 200,
    description: 'Ranked memory chunks',
    type: [MemoryHitDto],
  })
  search(@Body() dto: SearchMemoryDto): Promise<MemoryHitDto[]> {
    return this.memory.search(dto.query, {
      tags: dto.tags,
      memoryType: dto.memoryType,
      limit: dto.limit,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Memory chunk counts by type' })
  @ApiResponse({ status: 200, description: 'Counts of stored memory chunks' })
  stats(): Promise<{ totalChunks: number; byType: Record<string, number> }> {
    return this.memory.stats();
  }

  @Get('timeline')
  @ApiOperation({
    summary: 'Recent memory changes over time (newest first, with importance)',
  })
  timeline() {
    return this.memory.timeline();
  }
}
