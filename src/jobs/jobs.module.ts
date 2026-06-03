import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { AutonomousModule } from '../autonomous/autonomous.module';
import { QUEUE_MONITORING } from '../common/queues';
import { JobsController } from './jobs.controller';
import { MonitoringProcessor } from './monitoring.processor';
import { ScheduledTasksService } from './scheduled-tasks.service';

@Module({
  imports: [
    AgentsModule,
    AutonomousModule,
    BullModule.registerQueue({ name: QUEUE_MONITORING }),
  ],
  controllers: [JobsController],
  providers: [MonitoringProcessor, ScheduledTasksService],
})
export class JobsModule {}
