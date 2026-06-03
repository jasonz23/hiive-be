import { Injectable } from '@nestjs/common';
import { computeCtr } from '../../common/metrics/metrics';
import { LlmService } from '../../llm/llm.service';
import { PostsService } from '../../posts/posts.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

interface ViralResult {
  isSpike: boolean;
  expectedCtr: number;
  currentCtr: number;
  headline: string;
  recommendations: string[];
}

/** Detects unexpected engagement spikes and recommends scaling/repurposing. */
@Injectable()
export class ViralOpportunityAgent implements Agent {
  readonly type: AgentType = 'ViralOpportunityAgent';

  constructor(
    private readonly posts: PostsService,
    private readonly llm: LlmService,
    private readonly recommendations: RecommendationsService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const postId = String(input.postId ?? '');
    if (!postId) return { run: false, reason: 'no post specified' };
    const post = await this.posts.findOne(postId);
    const m = this.posts.metricsOf(post);
    // Need enough traction to judge, and an actual over-performance vs target.
    if (m.impressions < 500) {
      return { run: false, reason: 'too little reach to assess a spike yet' };
    }
    const goals = (post.campaign.goals ?? {}) as Record<string, number>;
    const expectedCtr =
      goals.impressions && goals.clicks
        ? computeCtr(goals.clicks, goals.impressions)
        : 2.0;
    if (m.ctr <= expectedCtr * 1.1) {
      return { run: false, reason: 'no engagement spike (CTR at/below expected)' };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = String(ctx.input.postId ?? '');
    const post = await this.posts.findOne(postId);
    const metrics = this.posts.metricsOf(post);
    const goals = (post.campaign.goals ?? {}) as Record<string, number>;
    const expectedCtr =
      goals.impressions && goals.clicks
        ? computeCtr(goals.clicks, goals.impressions)
        : 2.0;

    await ctx.step(
      'thought',
      `Checking for spike: ${metrics.ctr}% vs expected ${expectedCtr}%`,
    );
    const result = await this.llm.completeJson<ViralResult>(
      'Detect viral opportunity.',
      {
        purpose: 'viral_opportunity',
        context: { ctr: metrics.ctr, expectedCtr },
      },
    );

    if (result.isSpike) {
      await ctx.step('recommendation', result.headline, result.recommendations);
      await this.recommendations.create({
        agentRunId: ctx.run.id,
        agentType: this.type,
        postId,
        campaignId: post.campaignId,
        title: '🚀 Viral opportunity detected',
        body: result.headline,
        severity: 'opportunity',
        actions: result.recommendations,
      });
    } else {
      await ctx.step('output', 'No spike detected');
    }

    return {
      summary: result.isSpike
        ? `Spike detected: ${result.headline}`
        : 'No viral spike detected.',
      output: result as unknown as Record<string, unknown>,
    };
  }
}
