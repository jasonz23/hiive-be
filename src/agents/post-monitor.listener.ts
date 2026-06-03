import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { POST_METRICS_REFRESHED } from '../posts/posts.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentRuntimeService } from './agent-runtime.service';

/**
 * Bridges the posts module to the agent system without a circular import. When a
 * post's metrics are refreshed, run the comparative Performance Monitoring agent
 * inline (the emit is awaited) so its comment/edit/addition loop fires within the
 * user's refresh cycle.
 *
 * This is an *automatic* agent trigger, so it honors the autonomous master switch
 * (exactly like the hourly monitor cron): with autonomous off, a metric refresh
 * just updates the numbers and no agent — and no LLM call — runs.
 */
@Injectable()
export class PostMonitorListener {
  private readonly logger = new Logger(PostMonitorListener.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly runtime: AgentRuntimeService,
  ) {}

  @OnEvent(POST_METRICS_REFRESHED, { async: true })
  async handleRefresh(payload: { postId: string }): Promise<void> {
    if (!this.runtime.isAutonomousEnabled()) {
      this.logger.log('Autonomous off — skipping metric-refresh monitor');
      return;
    }
    await this.orchestrator.runAgent(
      'PerformanceMonitoringAgent',
      {
        postId: payload.postId,
        trigger: 'refresh',
      },
      { auto: true },
    );
  }
}
