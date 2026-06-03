import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { POST_METRICS_REFRESHED } from '../posts/posts.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';

/**
 * Bridges the posts module to the agent system without a circular import. When a
 * post's metrics are refreshed, run the comparative Performance Monitoring agent
 * inline (the emit is awaited) so its comment/edit/addition loop fires within the
 * user's refresh cycle.
 */
@Injectable()
export class PostMonitorListener {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  @OnEvent(POST_METRICS_REFRESHED, { async: true })
  async handleRefresh(payload: { postId: string }): Promise<void> {
    await this.orchestrator.runAgent('PerformanceMonitoringAgent', {
      postId: payload.postId,
      trigger: 'refresh',
    });
  }
}
