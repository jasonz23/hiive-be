import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AgentOrchestratorService } from '../agents/agent-orchestrator.service';
import {
  JOB_MONITOR_CAMPAIGN,
  JOB_MONITOR_POST,
  QUEUE_MONITORING,
} from '../common/queues';

/**
 * In-process BullMQ worker for the monitoring queue. The post metrics "Refresh"
 * enqueues JOB_MONITOR_POST; this worker runs the Performance Monitoring agent
 * asynchronously, closing the autonomous monitoring loop.
 */
@Processor(QUEUE_MONITORING)
export class MonitoringProcessor extends WorkerHost {
  private readonly logger = new Logger(MonitoringProcessor.name);

  constructor(private readonly orchestrator: AgentOrchestratorService) {
    super();
  }

  async process(
    job: Job<{ postId?: string; campaignId?: string }>,
  ): Promise<void> {
    this.logger.log(`Processing ${job.name} (${job.id})`);
    if (job.name === JOB_MONITOR_POST && job.data.postId) {
      await this.orchestrator.runAgent(
        'PerformanceMonitoringAgent',
        { postId: job.data.postId },
        { auto: true },
      );
    } else if (job.name === JOB_MONITOR_CAMPAIGN && job.data.campaignId) {
      await this.orchestrator.runAgent(
        'PerformanceMonitoringAgent',
        { campaignId: job.data.campaignId },
        { auto: true },
      );
    }
  }
}
