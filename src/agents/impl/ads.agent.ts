import { Injectable } from '@nestjs/common';
import { AdsService } from '../../ads/ads.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

/** Analyzes a campaign's ads and recommends budget/creative/audience optimizations. */
@Injectable()
export class AdsOptimizationAgent implements Agent {
  readonly type: AgentType = 'AdsOptimizationAgent';

  constructor(
    private readonly ads: AdsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const campaignId = String(input.campaignId ?? '');
    if (!campaignId) return { run: false, reason: 'no campaign specified' };
    const ads = await this.ads.findAll(campaignId);
    if (ads.length === 0) {
      return { run: false, reason: 'campaign has no ads to optimize' };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const campaignId = String(ctx.input.campaignId ?? '');
    await ctx.step('thought', 'Analyzing ad performance across channels');
    const { analysis, ads } = await this.ads.analyze(campaignId);

    await ctx.step(
      'recommendation',
      'Ad optimization recommendations',
      analysis,
    );
    await this.recommendations.create({
      agentRunId: ctx.run.id,
      agentType: this.type,
      campaignId,
      title: `Ad optimization: best channel ${String(analysis.bestChannel ?? 'n/a')}`,
      body: 'Budget reallocation and creative testing recommendations available.',
      severity: 'info',
      actions: analysis,
    });

    return {
      summary: `Analyzed ${ads.length} ads; raised optimization recommendation.`,
      output: { analysis, adCount: ads.length },
    };
  }
}
