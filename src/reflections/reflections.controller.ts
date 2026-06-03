import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReflectionsService } from './reflections.service';

@ApiTags('reflections')
@Controller()
export class ReflectionsController {
  constructor(private readonly reflections: ReflectionsService) {}

  @Get('reflections')
  @ApiOperation({
    summary: 'List agent reflections (what worked / failed / improve)',
  })
  @ApiQuery({ name: 'agentType', required: false })
  list(@Query('agentType') agentType?: string) {
    return this.reflections.list(agentType);
  }

  @Get('agents/health')
  @ApiOperation({
    summary: 'Agent health: approval/rejection/success rates + avg score',
  })
  health() {
    return this.reflections.agentHealth();
  }
}
