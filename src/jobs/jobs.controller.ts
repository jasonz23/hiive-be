import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScheduledTasksService } from './scheduled-tasks.service';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly scheduled: ScheduledTasksService) {}

  @Post('weekly-report')
  @ApiOperation({ summary: 'Generate the weekly marketing report now' })
  weeklyReport() {
    return this.scheduled.generateWeeklyReport();
  }

  @Get('weekly-report')
  @ApiOperation({ summary: 'Preview the weekly marketing report' })
  preview() {
    return this.scheduled.generateWeeklyReport();
  }
}
