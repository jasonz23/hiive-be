import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ApprovalType, PostStatus } from '@prisma/client';
import { AgentOrchestratorService } from '../agents/agent-orchestrator.service';
import { AgentRuntimeService } from '../agents/agent-runtime.service';
import { RunOptions } from '../agents/agent.types';
import { ApprovalsService } from '../approvals/approvals.service';
import { AudienceService } from '../audience/audience.service';
import { AuditService } from '../audit/audit.service';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ActivityEntry {
  at: string;
  message: string;
}

const TICK_MS = 45_000; // background cadence
const MAX_PENDING_APPROVALS = 12; // stop creating work once the human has a full queue
const RETIRE_IMPRESSIONS = 400_000; // mature posts leave the live loop

/**
 * The autonomous engine. The product runs itself: on a background tick it pulls
 * fresh (mock) platform metrics, lets the agents react, advances drafts through
 * compliance + swarm simulation on their own, and sweeps campaigns — doing work
 * continuously until it reaches a point where a human must step in (an approval).
 * No human needs to click "simulate" / "refresh" / "analyze".
 */
@Injectable()
export class AutonomousService {
  private readonly logger = new Logger(AutonomousService.name);
  // The two switches (`enabled` = reactive data loop + hourly monitor cron +
  // metric-refresh performance loop; `heartbeatEnabled` = the roster heartbeat)
  // live in AgentRuntimeService, the single source of truth shared with the
  // agent orchestrator and the metric-refresh listener. When BOTH are off, no
  // agent runs anywhere and zero LLM calls are made.
  private tickCount = 0;
  private running = false;
  private lastTickAt: string | null = null;
  private activity: ActivityEntry[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly approvals: ApprovalsService,
    private readonly audit: AuditService,
    private readonly audience: AudienceService,
    private readonly runtime: AgentRuntimeService,
  ) {}

  status() {
    return {
      enabled: this.runtime.isAutonomousEnabled(),
      heartbeatEnabled: this.runtime.isHeartbeatEnabled(),
      // True only when nothing is running and no agent can make an LLM call.
      allOff: this.runtime.isAllOff(),
      running: this.running,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      cadenceSeconds: TICK_MS / 1000,
      pendingApprovalCap: MAX_PENDING_APPROVALS,
    };
  }

  recentActivity(): ActivityEntry[] {
    return this.activity.slice(0, 40);
  }

  /** Whether the reactive data loop (and hourly monitor cron) may run. */
  isAutonomousEnabled(): boolean {
    return this.runtime.isAutonomousEnabled();
  }

  setEnabled(enabled: boolean): { enabled: boolean } {
    this.runtime.setAutonomous(enabled);
    this.log(enabled ? 'Autonomous mode resumed' : 'Autonomous mode paused');
    return { enabled };
  }

  setHeartbeatEnabled(enabled: boolean): { heartbeatEnabled: boolean } {
    this.runtime.setHeartbeat(enabled);
    this.log(enabled ? 'Heartbeat resumed' : 'Heartbeat paused');
    return { heartbeatEnabled: enabled };
  }

  @Interval(TICK_MS)
  async scheduledTick(): Promise<void> {
    // Nothing scheduled to do if both switches are off — no work, no LLM calls.
    if (this.runtime.isAllOff()) return;
    await this.tick();
  }

  /** One unit of autonomous work. Exposed for on-demand demo acceleration. */
  async tick(): Promise<{ actions: string[] }> {
    if (this.running) return { actions: [] };
    if (this.runtime.isAllOff()) return { actions: [] };
    this.running = true;
    const actions: string[] = [];
    try {
      this.tickCount += 1;
      // Reactive data loop — only when autonomous is on.
      if (this.runtime.isAutonomousEnabled()) {
        await this.pullMetrics(actions);
        await this.advanceDraft(actions);
      }
      // Heartbeat roster loop — independently gated.
      if (this.runtime.isHeartbeatEnabled()) {
        await this.heartbeat(actions);
      }
      if (this.runtime.isAutonomousEnabled() && this.tickCount % 5 === 0) {
        await this.sweepCampaigns(actions);
      }
      this.lastTickAt = new Date().toISOString();
      actions.forEach((a) => this.log(a));
    } catch (error) {
      this.logger.error(`Autonomous tick failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
    return { actions };
  }

  // 1) Simulate the platform: pull fresh metrics. Never-measured posts (e.g. just
  // published) get their first reading first; otherwise rotate through the stalest.
  private async pullMetrics(actions: string[]): Promise<void> {
    const liveAll = await this.prisma.post.findMany({
      where: {
        status: {
          in: [
            PostStatus.published,
            PostStatus.analyzing,
            PostStatus.underperforming,
          ],
        },
      },
      orderBy: { updatedAt: 'asc' },
      select: { id: true, platform: true, metrics: true, updatedAt: true },
    });
    const impressionsOf = (m: unknown) =>
      (m as { impressions?: number } | null)?.impressions ?? 0;
    const live = [...liveAll]
      .sort((a, b) => {
        const aNew = impressionsOf(a.metrics) === 0 ? 0 : 1;
        const bNew = impressionsOf(b.metrics) === 0 ? 0 : 1;
        if (aNew !== bNew) return aNew - bNew; // unmeasured first
        return a.updatedAt.getTime() - b.updatedAt.getTime(); // then stalest
      })
      .slice(0, 2);
    for (const post of live) {
      const impressions =
        (post.metrics as { impressions?: number } | null)?.impressions ?? 0;
      if (impressions > RETIRE_IMPRESSIONS) {
        await this.posts.setStatus(post.id, PostStatus.completed);
        actions.push(
          `Retired a mature ${post.platform} post (completed its run)`,
        );
        continue;
      }
      // refreshMetrics runs the comparative Performance agent inline (event).
      const { post: updated } = await this.posts.refreshMetrics(post.id);
      actions.push(
        `Pulled fresh ${post.platform} metrics → performance agent re-evaluated vs goal + peers`,
      );

      // Also pull mock audience comments and let the Engagement agent act on them.
      const skew =
        updated.status === 'underperforming' ? 'underperforming' : 'normal';
      const added = await this.audience.pullComments(post.id, skew);
      if (added > 0) {
        await this.orchestrator.runAgent(
          'EngagementAgent',
          { postId: post.id },
          {
            entityType: 'post',
            entityId: post.id,
          },
        );
        actions.push(
          `Pulled ${added} ${post.platform} audience comments → engagement agent summarized + drafted replies`,
        );
      }
    }
  }

  // 2) Advance one draft through compliance + swarm, then park it for a human.
  private async advanceDraft(actions: string[]): Promise<void> {
    const pending = await this.prisma.approvalRequest.count({
      where: { status: 'pending' },
    });
    if (pending >= MAX_PENDING_APPROVALS) {
      actions.push(
        `Holding — ${pending} approvals already awaiting a human decision`,
      );
      return;
    }
    const draft = await this.prisma.post.findFirst({
      where: { status: PostStatus.draft },
      orderBy: { createdAt: 'asc' },
    });
    if (!draft) return;

    await this.orchestrator.runAgent('ComplianceReviewAgent', {
      postId: draft.id,
    });
    await this.orchestrator.runAgent('SocialSimulationSwarmAgent', {
      postId: draft.id,
    });
    await this.posts.setStatus(draft.id, PostStatus.review);
    await this.approvals.create({
      type: ApprovalType.publish_post,
      entityType: 'post',
      entityId: draft.id,
      title: `Publish ${draft.platform} post`,
      proposedAction: { copy: draft.copy },
    });
    actions.push(
      `Auto-ran compliance + 6-persona simulation on a ${draft.platform} draft → awaiting human approval`,
    );
  }

  // 2b) Heartbeat — every tick, evaluate each remaining agent's own trigger and
  // run those that fire (each on its own cadence). This keeps the WHOLE roster
  // active, not just the metric/engagement loop, while still being condition-
  // driven: ads/viral/replication only fire when there's something worth acting
  // on, content only refills when the draft pool is low, etc. Capped at a few
  // runs per beat to bound load.
  private async heartbeat(actions: string[]): Promise<void> {
    const t = this.tickCount;
    const [activeCampaigns, livePosts, draftCount, pending] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { status: 'active' },
        select: { id: true, name: true },
      }),
      this.prisma.post.findMany({
        where: {
          status: {
            in: [
              PostStatus.published,
              PostStatus.analyzing,
              PostStatus.underperforming,
              PostStatus.completed,
            ],
          },
        },
        select: { id: true, platform: true, metrics: true },
      }),
      this.prisma.post.count({ where: { status: PostStatus.draft } }),
      this.prisma.approvalRequest.count({ where: { status: 'pending' } }),
    ]);

    const ctrOf = (m: unknown) => (m as { ctr?: number } | null)?.ctr ?? 0;
    const imprOf = (m: unknown) =>
      (m as { impressions?: number } | null)?.impressions ?? 0;
    const measured = livePosts.filter((p) => imprOf(p.metrics) > 0);
    const topPerformer = [...measured].sort(
      (a, b) => ctrOf(b.metrics) - ctrOf(a.metrics),
    )[0];
    // Rotate which campaign each campaign-level agent looks at, for coverage.
    const rotateCampaign = activeCampaigns.length
      ? activeCampaigns[t % activeCampaigns.length]
      : null;

    interface Beat {
      type: string;
      input: Record<string, unknown>;
      options?: RunOptions;
      message: string;
    }
    const beats: Beat[] = [];

    // Ads — review an active campaign's ad spend (every 3rd beat).
    if (rotateCampaign && t % 3 === 0) {
      beats.push({
        type: 'AdsOptimizationAgent',
        input: { campaignId: rotateCampaign.id },
        options: { entityType: 'campaign', entityId: rotateCampaign.id },
        message: `Ads agent reviewed spend + creative on “${rotateCampaign.name}”`,
      });
    }
    // Viral — look at the top performer (every 2nd beat). The agent itself skips
    // unless there's a real spike, so we propose liberally and let it decide.
    if (topPerformer && t % 2 === 0) {
      beats.push({
        type: 'ViralOpportunityAgent',
        input: { postId: topPerformer.id },
        options: { entityType: 'post', entityId: topPerformer.id },
        message: `Viral agent checked the top ${topPerformer.platform} post for breakout potential`,
      });
    }
    // Replication — consider the top performer (every 4th beat). The agent skips
    // unless it's a proven winner worth repurposing.
    if (topPerformer && t % 4 === 0) {
      beats.push({
        type: 'ReplicationAgent',
        input: { postId: topPerformer.id },
        options: { entityType: 'post', entityId: topPerformer.id },
        message: `Replication agent assessed the top ${topPerformer.platform} post for repurposing`,
      });
    }
    // Content — consider refilling the draft pool (every 6th beat). The agent
    // skips when the pool is already healthy.
    if (rotateCampaign && t % 6 === 0) {
      beats.push({
        type: 'ContentGenerationAgent',
        input: { campaignId: rotateCampaign.id },
        options: { entityType: 'campaign', entityId: rotateCampaign.id },
        message: `Content agent considered fresh drafts for “${rotateCampaign.name}”`,
      });
    }
    // Memory retrieval — periodically resurface relevant context (every 5th beat).
    if (t % 5 === 0) {
      beats.push({
        type: 'MemoryRetrievalAgent',
        input: {
          query:
            'recent campaign performance — what is working, what to improve next',
        },
        message: 'Memory agent resurfaced relevant context from memory',
      });
    }
    // Marketing analyzer — separate signal from noise across buy-side/sell-side
    // and write confirmed learnings to the memory bank (every 7th beat).
    if (t % 7 === 0) {
      beats.push({
        type: 'MarketingPerformanceAnalyzerAgent',
        input: {},
        message:
          'Marketing analyzer reviewed performance (signal vs noise) and updated memory',
      });
    }
    // Strategy — re-examine a campaign's strategy (every 8th beat).
    if (rotateCampaign && t % 8 === 0) {
      beats.push({
        type: 'CampaignStrategyAgent',
        input: { objective: rotateCampaign.name },
        options: { entityType: 'campaign', entityId: rotateCampaign.id },
        message: `Strategy agent re-examined positioning for “${rotateCampaign.name}”`,
      });
    }
    // Planner — periodically re-plan next moves (every 10th beat).
    if (rotateCampaign && t % 10 === 0) {
      beats.push({
        type: 'PlannerAgent',
        input: { objective: `Improve results for ${rotateCampaign.name}` },
        options: { entityType: 'campaign', entityId: rotateCampaign.id },
        message: `Planner agent re-planned next moves for “${rotateCampaign.name}”`,
      });
    }
    // Compliance + Simulation — keep them alive when the approval queue is full
    // (advanceDraft is throttled by the cap). Pure analysis, no new approval.
    if (draftCount > 0 && pending >= MAX_PENDING_APPROVALS && t % 2 === 0) {
      // Rotate through the draft pool so we screen different drafts over time.
      const drafts = await this.prisma.post.findMany({
        where: { status: PostStatus.draft },
        orderBy: { createdAt: 'asc' },
        take: 12,
        select: { id: true, platform: true },
      });
      const draft = drafts.length ? drafts[t % drafts.length] : null;
      if (draft) {
        beats.push({
          type: 'ComplianceReviewAgent',
          input: { postId: draft.id },
          options: { entityType: 'post', entityId: draft.id },
          message: `Compliance agent pre-screened a ${draft.platform} draft (queue full — no new approval)`,
        });
        beats.push({
          type: 'SocialSimulationSwarmAgent',
          input: { postId: draft.id },
          options: { entityType: 'post', entityId: draft.id },
          message: `Simulation swarm test-ran a ${draft.platform} draft (queue full — no new approval)`,
        });
      }
    }

    // Bound cost: at most 3 heartbeat agents per beat (they're network-bound).
    for (const beat of beats.slice(0, 3)) {
      try {
        const result = (await this.orchestrator.runAgent(
          beat.type,
          beat.input,
          beat.options ?? {},
        )) as { status?: string; summary?: string } | null;
        // If the agent decided it had nothing to do, say so in the activity log.
        if (result?.status === 'skipped') {
          actions.push(
            `${beat.type} evaluated — ${result.summary ?? 'skipped (not needed)'}`,
          );
        } else {
          actions.push(beat.message);
        }
      } catch (error) {
        this.logger.warn(`Heartbeat ${beat.type} failed: ${String(error)}`);
      }
    }
  }

  // 3) Periodically sweep active campaigns for health.
  private async sweepCampaigns(actions: string[]): Promise<void> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    for (const campaign of campaigns) {
      await this.orchestrator.runAgent('PerformanceMonitoringAgent', {
        campaignId: campaign.id,
      });
    }
    actions.push(`Swept ${campaigns.length} active campaigns for goal health`);
  }

  private log(message: string): void {
    this.activity.unshift({ at: new Date().toISOString(), message });
    this.activity = this.activity.slice(0, 60);
    void this.audit.record({
      actor: 'AutonomousEngine',
      action: 'autonomous.tick',
      entity: 'System',
      metadata: { message },
    });
  }
}
