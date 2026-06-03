import { Injectable } from '@nestjs/common';
import { ApprovalType, PostStatus } from '@prisma/client';
import { ApprovalsService } from '../../approvals/approvals.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { CommentsService } from '../../comments/comments.service';
import { computeCtr } from '../../common/metrics/metrics';
import { LlmService } from '../../llm/llm.service';
import { MetricSnapshot, PostsService } from '../../posts/posts.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import { Agent, AgentContext, AgentResult, AgentType } from '../agent.types';

interface PerfResult {
  severity: string;
  issue: string;
  likelyCause: string;
  recommendedActions: string[];
  rewrittenCta: string;
}

interface ReplicationResult {
  variants: { channel: string; copy: string }[];
}

type Verdict = 'too_early' | 'on_track' | 'underperforming' | 'viral';

type FullPost = Awaited<ReturnType<PostsService['findOne']>>;

/**
 * Active Performance Agent. On every metrics refresh it evaluates a post against
 * FOUR references — its own trajectory (velocity since posting), peer posts in the
 * campaign, the campaign's goal, and time elapsed — then runs a human-in-the-loop
 * loop of comments, edits, and additions:
 *   underperforming → comment (diagnosis) + edit (rewrite suggestion) + additions
 *                     (variant drafts) + approval to publish
 *   viral           → comment (spike) + additions (channel replication) + budget approval
 * It never publishes or spends on its own.
 */
@Injectable()
export class PerformanceMonitoringAgent implements Agent {
  readonly type: AgentType = 'PerformanceMonitoringAgent';

  constructor(
    private readonly posts: PostsService,
    private readonly campaigns: CampaignsService,
    private readonly llm: LlmService,
    private readonly recommendations: RecommendationsService,
    private readonly approvals: ApprovalsService,
    private readonly comments: CommentsService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    if (ctx.input.campaignId && !ctx.input.postId) {
      return this.runCampaign(ctx, String(ctx.input.campaignId));
    }
    return this.runPost(ctx, String(ctx.input.postId ?? ''));
  }

  private async runPost(
    ctx: AgentContext,
    postId: string,
  ): Promise<AgentResult> {
    const post = await this.posts.findOne(postId);
    const metrics = this.posts.metricsOf(post);
    const history = this.posts.historyOf(post);
    const ageHours = this.posts.ageHours(post);
    const goals = (post.campaign.goals ?? {}) as Record<string, number>;
    const goalCtr =
      goals.impressions && goals.clicks
        ? computeCtr(goals.clicks, goals.impressions)
        : 2.0;
    const bench = await this.posts.campaignBenchmarks(post.campaignId, postId);
    const velocity = this.impressionsPerHour(history);
    // Expected CTR blends the goal with how peers in this campaign actually do.
    const expectedCtr = bench.peerCount
      ? Number(((goalCtr + bench.medianCtr) / 2).toFixed(2))
      : goalCtr;
    const ratio = expectedCtr > 0 ? metrics.ctr / expectedCtr : 1;
    const verdict = this.classify(metrics.impressions, ageHours, ratio);

    // Visible comparison steps.
    await ctx.step(
      'thought',
      `${ageHours.toFixed(0)}h since posted · ${metrics.impressions.toLocaleString()} impressions (~${velocity}/h) · ${metrics.conversions} conv`,
    );
    await ctx.step(
      'thought',
      `CTR ${metrics.ctr}% vs goal ${goalCtr}% · peers median ${bench.medianCtr}% (top ${bench.topCtr}%, n=${bench.peerCount}) → expected ${expectedCtr}%`,
    );
    await ctx.step(
      'thought',
      `Verdict: ${verdict.replace('_', ' ')} (CTR is ${ratio.toFixed(2)}× expected)`,
    );

    const compare =
      `After ${ageHours.toFixed(0)}h this post has ${metrics.impressions.toLocaleString()} impressions and a ` +
      `${metrics.ctr}% CTR — vs a ${goalCtr}% goal and a ${bench.medianCtr}% campaign median ` +
      `(${bench.peerCount} peer posts).`;

    if (verdict === 'too_early' || verdict === 'on_track') {
      await this.posts.saveAnalysis(postId, {
        verdict,
        expectedCtr,
        bench,
        compare,
      });
      if (post.status === PostStatus.analyzing) {
        await this.posts.setStatus(postId, PostStatus.published);
      }
      await ctx.step(
        'output',
        verdict === 'too_early'
          ? 'Within expected pace for its age — continuing to monitor.'
          : 'On track vs goal and peers — no action needed.',
      );
      return {
        summary: `${verdict === 'too_early' ? 'Too early' : 'On track'}: CTR ${metrics.ctr}% vs expected ${expectedCtr}%.`,
        output: { verdict, expectedCtr, bench, velocity, ageHours },
      };
    }

    if (verdict === 'viral') {
      return this.handleViral(ctx, post, metrics.ctr, expectedCtr, compare);
    }
    return this.handleUnderperforming(
      ctx,
      post,
      metrics.ctr,
      expectedCtr,
      compare,
    );
  }

  // --- underperforming: comment + edit + additions + approval -----------------

  private async handleUnderperforming(
    ctx: AgentContext,
    post: FullPost,
    ctr: number,
    expectedCtr: number,
    compare: string,
  ): Promise<AgentResult> {
    const postId = post.id;
    const alreadyFlagged = await this.hasOpenAgentSuggestion(postId);
    const result = await this.llm.completeJson<PerfResult>(
      'Analyze post performance.',
      {
        purpose: 'performance_analysis',
        context: { ctr, goalCtr: expectedCtr, platform: post.platform },
      },
    );
    await this.posts.saveAnalysis(postId, { ...result, compare });
    await this.posts.setStatus(postId, PostStatus.underperforming);

    // 1) Comment — the diagnosis grounded in the comparison.
    await this.comments.create(postId, {
      authorKind: 'agent',
      author: this.type,
      agentRunId: ctx.run.id,
      type: 'comment',
      body: `${compare} ${result.likelyCause}`,
    });

    if (alreadyFlagged) {
      // A rewrite suggestion from a prior refresh is still open — don't duplicate
      // the edit/additions/approval; just record the latest diagnosis.
      await ctx.step(
        'thought',
        'Existing rewrite suggestion still open — added a fresh diagnosis only',
      );
      return {
        summary: `Still underperforming (CTR ${ctr}% < ${expectedCtr}%). Updated diagnosis; prior suggestion still pending review.`,
        output: {
          verdict: 'underperforming',
          expectedCtr,
          alreadyFlagged: true,
          ...result,
        },
      };
    }

    await ctx.step('recommendation', result.issue, result.recommendedActions);
    await this.recommendations.create({
      agentRunId: ctx.run.id,
      agentType: this.type,
      postId,
      campaignId: post.campaignId,
      title: `Underperforming on ${post.platform} (CTR below peers + goal)`,
      body: `${compare}\n\nLikely cause: ${result.likelyCause}`,
      severity: 'warning',
      actions: result.recommendedActions,
    });

    // 2) Edit — a suggestion that replaces the copy (accept applies it).
    const improvedCopy = `${post.copy.split('\n')[0]}\n\n${result.rewrittenCta}`;
    // 2) Edit — offer the human 2-3 rewrite OPTIONS to pick from; the agent applies the pick.
    const variants = await this.llm.completeJson<ReplicationResult>(
      'Generate variants.',
      {
        purpose: 'replication',
        context: { copy: post.copy },
      },
    );
    const variantCopies = (variants.variants ?? [])
      .filter((v) => ['LinkedIn', 'X'].includes(v.channel))
      .map((v) => v.copy);
    const options = [
      { id: 'cta', label: 'Sharper CTA', text: improvedCopy },
      ...variantCopies
        .slice(0, 2)
        .map((text, i) => ({ id: `v${i}`, label: `Variant ${i + 1}`, text })),
    ];
    await this.comments.create(postId, {
      authorKind: 'agent',
      author: this.type,
      agentRunId: ctx.run.id,
      type: 'suggestion',
      body: 'Pick a rewrite to lift click-through — I’ll apply your choice.',
      quotedText: post.copy,
      rangeStart: 0,
      rangeEnd: post.copy.length,
      options,
    });

    // 3) Additions — generate fresh variant drafts to test (human approves publishing).
    const added = await this.createVariantDrafts(ctx, post, 2);

    // 4) Approval gate to publish the rewritten variant.
    await ctx.step(
      'approval',
      'Requesting approval to publish the improved variant',
    );
    await this.approvals.create({
      agentRunId: ctx.run.id,
      type: ApprovalType.publish_post,
      entityType: 'post',
      entityId: postId,
      title: `Publish improved variant for ${post.platform} post`,
      proposedAction: { copy: improvedCopy, reason: result.likelyCause },
    });

    return {
      summary: `Underperforming (CTR ${ctr}% < ${expectedCtr}% expected). Left a comment + rewrite suggestion, drafted ${added} variants, and requested approval.`,
      output: {
        verdict: 'underperforming',
        expectedCtr,
        variantsAdded: added,
        ...result,
      },
    };
  }

  // --- viral: comment + additions + budget approval ---------------------------

  private async handleViral(
    ctx: AgentContext,
    post: FullPost,
    ctr: number,
    expectedCtr: number,
    compare: string,
  ): Promise<AgentResult> {
    const postId = post.id;
    await this.posts.saveAnalysis(postId, {
      verdict: 'viral',
      ctr,
      expectedCtr,
      compare,
    });

    if (await this.hasPendingBudgetApproval(post.campaignId)) {
      await ctx.step(
        'thought',
        'Viral opportunity already actioned — not duplicating',
      );
      return {
        summary: `Still viral (CTR ${ctr}%). Replication + budget approval already pending review.`,
        output: { verdict: 'viral', ctr, expectedCtr, alreadyFlagged: true },
      };
    }

    await ctx.step(
      'recommendation',
      `🚀 Viral: ${ctr}% CTR vs ${expectedCtr}% expected`,
    );
    await this.comments.create(postId, {
      authorKind: 'agent',
      author: this.type,
      agentRunId: ctx.run.id,
      type: 'comment',
      body: `🚀 Engagement spike. ${compare} This is ${(ctr / Math.max(expectedCtr, 0.1)).toFixed(1)}× expected — worth scaling and repurposing now.`,
    });
    await this.recommendations.create({
      agentRunId: ctx.run.id,
      agentType: this.type,
      postId,
      campaignId: post.campaignId,
      title: '🚀 Viral opportunity — scale + repurpose',
      body: compare,
      severity: 'opportunity',
      actions: [
        'Replicate across channels',
        'Increase ad budget',
        'Repurpose to Email',
      ],
    });

    // Additions — replicate the winner across channels as drafts.
    const added = await this.createVariantDrafts(ctx, post, 3);

    // Human-in-the-loop: approve a budget increase to scale the winner.
    const currentBudget = (post.campaign as { budget?: number }).budget ?? 0;
    await ctx.step('approval', 'Requesting approval to increase ad budget 20%');
    await this.approvals.create({
      agentRunId: ctx.run.id,
      type: ApprovalType.budget_change,
      entityType: 'campaign',
      entityId: post.campaignId,
      title: `Increase budget 20% to scale viral ${post.platform} post`,
      proposedAction: {
        newBudget: Math.round(currentBudget * 1.2),
        deltaPct: 20,
      },
    });

    return {
      summary: `Viral spike (CTR ${ctr}% vs ${expectedCtr}% expected). Left a comment, drafted ${added} channel variants, and requested a budget increase.`,
      output: { verdict: 'viral', ctr, expectedCtr, variantsAdded: added },
    };
  }

  /** Generate channel variant drafts of a post (the "additions"). */
  private async createVariantDrafts(
    ctx: AgentContext,
    post: FullPost,
    max: number,
  ): Promise<number> {
    const result = await this.llm.completeJson<ReplicationResult>(
      'Generate variants.',
      {
        purpose: 'replication',
        context: { copy: post.copy },
      },
    );
    const social = (result.variants ?? [])
      .filter((v) => ['LinkedIn', 'X'].includes(v.channel))
      .slice(0, max);
    for (const variant of social) {
      await this.posts.create({
        campaignId: post.campaignId,
        platform: variant.channel,
        copy: variant.copy,
        status: PostStatus.draft,
      });
    }
    if (social.length)
      await ctx.step(
        'output',
        `Drafted ${social.length} variant post(s) to test`,
      );
    return social.length;
  }

  /** True if a prior refresh already left an open rewrite suggestion. */
  private async hasOpenAgentSuggestion(postId: string): Promise<boolean> {
    const existing = await this.comments.list(postId);
    return existing.some(
      (c) =>
        c.author === this.type &&
        c.type === 'suggestion' &&
        c.status === 'open',
    );
  }

  /** True if a budget increase for this campaign is already awaiting approval. */
  private async hasPendingBudgetApproval(campaignId: string): Promise<boolean> {
    const pending = await this.approvals.list('pending');
    return pending.some(
      (a) => a.type === 'budget_change' && a.entityId === campaignId,
    );
  }

  private classify(
    impressions: number,
    ageHours: number,
    ratio: number,
  ): Verdict {
    if (ageHours < 6 && impressions < 1500) return 'too_early';
    if (ratio >= 1.8 && impressions > 1500) return 'viral';
    if (ratio < 0.7 && impressions >= 800) return 'underperforming';
    return 'on_track';
  }

  /** Recent impression velocity (per hour) from the trajectory snapshots. */
  private impressionsPerHour(history: MetricSnapshot[]): number {
    if (history.length < 2) return 0;
    const a = history[history.length - 2];
    const b = history[history.length - 1];
    const hours =
      (new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()) /
      3_600_000;
    if (hours <= 0) return b.impressions - a.impressions;
    return Math.round((b.impressions - a.impressions) / hours);
  }

  // --- campaign-level (unchanged behavior) ------------------------------------

  private async runCampaign(
    ctx: AgentContext,
    campaignId: string,
  ): Promise<AgentResult> {
    const progress = await this.campaigns.goalProgress(campaignId);
    await this.campaigns.recomputeHealth(campaignId);
    await ctx.step(
      'thought',
      `Campaign at ${progress.overallPct}% of goals (${progress.health})`,
    );

    if (progress.health === 'healthy') {
      return {
        summary: `Campaign healthy at ${progress.overallPct}% of goals.`,
        output: { health: progress.health, progress },
      };
    }

    const result = await this.llm.completeJson<PerfResult>(
      'Analyze campaign performance.',
      {
        purpose: 'performance_analysis',
        context: { ctr: progress.attainment.clicks?.pct ?? 0, goalCtr: 100 },
      },
    );
    await ctx.step(
      'recommendation',
      `Campaign ${progress.health}`,
      result.recommendedActions,
    );
    await this.recommendations.create({
      agentRunId: ctx.run.id,
      agentType: this.type,
      campaignId,
      title: `Campaign underperforming (${progress.health})`,
      body: `${progress.overallPct}% of goals attained. ${result.likelyCause}`,
      severity: progress.health === 'critical' ? 'critical' : 'warning',
      actions: result.recommendedActions,
    });

    return {
      summary: `Campaign ${progress.health} at ${progress.overallPct}%; raised recommendation.`,
      output: { health: progress.health, progress, ...result },
    };
  }
}
