import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AgentRunService } from './agent-run.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { RunAgentDto } from './dto/run-agent.dto';
import { ToolRegistryService } from './tools/tool-registry.service';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly runService: AgentRunService,
    private readonly tools: ToolRegistryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List available agent types' })
  available() {
    return { agents: this.orchestrator.availableAgents() };
  }

  @Get('tools')
  @ApiOperation({ summary: 'List the tool registry (specs agents can call)' })
  toolSpecs() {
    return this.tools.specs();
  }

  @Get('insights')
  @ApiOperation({
    summary:
      "Latest marketing performance analysis — what's working vs not (signal) " +
      'and what was filtered out (noise), per buy-side / sell-side segment',
  })
  async insights() {
    const runs = await this.runService.list({
      agentType: 'MarketingPerformanceAnalyzerAgent',
    });
    const latest = runs.find((r) => r.status === 'completed' && r.output);
    return {
      analyzedAt: latest?.createdAt ?? null,
      summary: latest?.summary ?? null,
      output: latest?.output ?? null,
    };
  }

  @Post('run')
  @ApiOperation({ summary: 'Run an agent and return its run with timeline' })
  @ApiResponse({ status: 201, description: 'Completed agent run with steps' })
  run(@Body() dto: RunAgentDto) {
    return this.orchestrator.runAgent(dto.agentType, dto.input, {
      missionId: dto.missionId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    });
  }

  @Get('runs')
  @ApiOperation({ summary: 'List agent runs' })
  @ApiQuery({ name: 'agentType', required: false })
  @ApiQuery({ name: 'missionId', required: false })
  listRuns(
    @Query('agentType') agentType?: string,
    @Query('missionId') missionId?: string,
  ) {
    return this.runService.list({ agentType, missionId });
  }

  @Get('runs/:id')
  @ApiOperation({
    summary: 'Get an agent run with full timeline + reflections',
  })
  getRun(@Param('id') id: string) {
    return this.runService.get(id);
  }

  @Post('monitor-performance')
  @ApiOperation({
    summary: 'Trigger an autonomous performance sweep across posts + campaigns',
  })
  monitor() {
    return this.orchestrator.monitorPerformance();
  }
}
