import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LearningService } from './learning.service';

@ApiTags('learning')
@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('examples')
  @ApiOperation({
    summary: 'List captured learning examples (human-edit deltas)',
  })
  @ApiQuery({ name: 'agentType', required: false })
  list(@Query('agentType') agentType?: string) {
    return this.learning.list(agentType);
  }
}
