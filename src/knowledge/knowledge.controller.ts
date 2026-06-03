import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('graph')
  @ApiOperation({ summary: 'Knowledge graph (nodes + relationship edges)' })
  graph() {
    return this.knowledge.graph();
  }

  @Post('rebuild')
  @ApiOperation({
    summary: 'Rebuild the graph from current campaigns/posts/ads',
  })
  rebuild() {
    return this.knowledge.rebuild();
  }
}
