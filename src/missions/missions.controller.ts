import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateMissionDto, UpdateMissionDto } from './dto/mission.dto';
import { MissionsService } from './missions.service';

@ApiTags('missions')
@Controller('missions')
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a mission (the unit of goal-driven work)' })
  @ApiResponse({ status: 201, description: 'Mission created' })
  create(@Body() dto: CreateMissionDto) {
    return this.missions.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List missions' })
  findAll() {
    return this.missions.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a mission with campaigns + agent runs' })
  findOne(@Param('id') id: string) {
    return this.missions.findOne(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Mission goal progress vs target metric' })
  progress(@Param('id') id: string) {
    return this.missions.progress(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a mission' })
  update(@Param('id') id: string, @Body() dto: UpdateMissionDto) {
    return this.missions.update(id, dto);
  }

  @Post(':id/run')
  @ApiOperation({
    summary:
      'Run the mission: Planner → Strategy (creates campaign) → Content → Compliance → ' +
      'Swarm → Approval gates. Returns the mission with its full agent-run timeline.',
  })
  run(@Param('id') id: string, @Body('audience') audience?: string) {
    return this.missions.run(id, audience);
  }
}
