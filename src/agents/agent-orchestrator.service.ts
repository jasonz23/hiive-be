import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AgentRunStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReflectionsService } from '../reflections/reflections.service';
import { AgentRunService } from './agent-run.service';
import { Agent, AgentResult, AgentType, RunOptions } from './agent.types';
import { AdsOptimizationAgent } from './impl/ads.agent';
import { ComplianceReviewAgent } from './impl/compliance.agent';
import { ContentGenerationAgent } from './impl/content.agent';
import { EngagementAgent } from './impl/engagement.agent';
import { MarketingPerformanceAnalyzerAgent } from './impl/insights.agent';
import { PrePublishReviewAgent } from './impl/pre-publish-review.agent';
import { MemoryRetrievalAgent } from './impl/memory-retrieval.agent';
import { PerformanceMonitoringAgent } from './impl/performance.agent';
import { PlannerAgent } from './impl/planner.agent';
import { ReplicationAgent } from './impl/replication.agent';
import { CampaignStrategyAgent } from './impl/strategy.agent';
import { SocialSimulationSwarmAgent } from './impl/simulation.agent';
import { ViralOpportunityAgent } from './impl/viral.agent';

interface ReflectionOut {
  whatWorked?: string;
  whatFailed?: string;
  improvement?: string;
  reflection?: string;
  score?: number;
}

/**
 * Runs any agent through a uniform loop: create AgentRun → execute with a step
 * recorder → finalize → auto-generate a reflection. This is the single entry
 * point used by the controller, missions orchestration, and background jobs.
 */
@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly registry: Map<string, Agent>;

  constructor(
    private readonly runService: AgentRunService,
    private readonly reflections: ReflectionsService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    planner: PlannerAgent,
    strategy: CampaignStrategyAgent,
    content: ContentGenerationAgent,
    compliance: ComplianceReviewAgent,
    simulation: SocialSimulationSwarmAgent,
    performance: PerformanceMonitoringAgent,
    ads: AdsOptimizationAgent,
    viral: ViralOpportunityAgent,
    replication: ReplicationAgent,
    memory: MemoryRetrievalAgent,
    engagement: EngagementAgent,
    insights: MarketingPerformanceAnalyzerAgent,
    prePublish: PrePublishReviewAgent,
  ) {
    const all: Agent[] = [
      planner,
      strategy,
      content,
      compliance,
      simulation,
      performance,
      ads,
      viral,
      replication,
      memory,
      engagement,
      insights,
      prePublish,
    ];
    this.registry = new Map(all.map((a) => [a.type, a]));
  }

  availableAgents(): AgentType[] {
    return [...this.registry.keys()] as AgentType[];
  }

  /**
   * Autonomous sweep: monitor every published/analyzing post and every active
   * campaign, running the performance agent on each. Used by the manual trigger
   * and the scheduled background jobs.
   */
  async monitorPerformance(): Promise<{
    postsChecked: number;
    campaignsChecked: number;
  }> {
    const posts = await this.prisma.post.findMany({
      where: { status: { in: ['published', 'analyzing', 'underperforming'] } },
      select: { id: true },
    });
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    for (const post of posts) {
      await this.runAgent('PerformanceMonitoringAgent', { postId: post.id });
    }
    for (const campaign of campaigns) {
      await this.runAgent('PerformanceMonitoringAgent', {
        campaignId: campaign.id,
      });
    }
    return { postsChecked: posts.length, campaignsChecked: campaigns.length };
  }

  async runAgent(
    agentType: string,
    input: Record<string, unknown>,
    options: RunOptions = {},
  ) {
    const agent = this.registry.get(agentType);
    if (!agent) {
      throw new BadRequestException(
        `Unknown agent "${agentType}". Available: ${this.availableAgents().join(', ')}`,
      );
    }

    // Let the agent bow out before any expensive work if it has nothing to do.
    if (agent.shouldRun) {
      let decision: { run: boolean; reason?: string } = { run: true };
      try {
        decision = await agent.shouldRun(input);
      } catch (error) {
        // A flaky pre-check should never block the agent — default to running.
        this.logger.warn(`${agentType} shouldRun failed: ${String(error)}`);
      }
      if (!decision.run) {
        const reason = decision.reason ?? 'not needed';
        const skipped = await this.runService.start(agentType, input, options);
        await this.runService.step(skipped.id, 'output', `Skipped — ${reason}`);
        await this.runService.finish(skipped.id, {
          output: { skipped: true, reason },
          summary: `Skipped — ${reason}`,
          status: AgentRunStatus.skipped,
        });
        return this.runService.get(skipped.id);
      }
    }

    const run = await this.runService.start(agentType, input, options);
    const ctx = {
      run,
      input,
      step: (
        type: Parameters<typeof this.runService.step>[1],
        label: string,
        detail?: unknown,
      ) => this.runService.step(run.id, type, label, detail),
    };

    try {
      const result = await agent.run(ctx);
      // Reflect before finalizing so the reflection step keeps timeline order.
      if (!options.skipReflection) {
        await this.reflect(run.id, agentType, result);
      }
      await this.runService.finish(run.id, {
        output: result.output,
        summary: result.summary,
        status: AgentRunStatus.completed,
      });
      await this.audit.record({
        actor: agentType,
        action: 'agent.run',
        entity: 'AgentRun',
        entityId: run.id,
        metadata: { summary: result.summary },
      });
      return this.runService.get(run.id);
    } catch (error) {
      this.logger.error(`Agent ${agentType} failed: ${String(error)}`);
      await this.runService.step(
        run.id,
        'output',
        `Agent failed: ${String(error)}`,
      );
      await this.runService.finish(run.id, {
        output: { error: String(error) },
        summary: `Failed: ${String(error)}`,
        status: AgentRunStatus.failed,
      });
      return this.runService.get(run.id);
    }
  }

  private async reflect(
    runId: string,
    agentType: string,
    result: AgentResult,
  ): Promise<void> {
    const reflection = await this.llm.completeJson<ReflectionOut>(
      'Reflect on this agent run.',
      {
        purpose: 'reflection',
        context: { agentType, summary: result.summary },
      },
    );
    await this.runService.step(
      runId,
      'reflection',
      reflection.reflection ?? 'Reflection',
      reflection,
    );
    await this.reflections.create({
      agentRunId: runId,
      agentType,
      whatWorked: reflection.whatWorked,
      whatFailed: reflection.whatFailed,
      improvement: reflection.improvement,
      reflection: reflection.reflection ?? result.summary,
      score: reflection.score,
    });
  }
}
