import { Injectable } from '@nestjs/common';
import { CampaignStatus } from '@prisma/client';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { LlmService } from '../../llm/llm.service';
import { AgentSupportService } from '../agent-support.service';
import { Agent, AgentContext, AgentResult, AgentType } from '../agent.types';

/**
 * Analyzes past campaigns from memory and drafts a new campaign (name, audience,
 * channels, goals). Creates the campaign when `create` is requested (mission flow).
 */
@Injectable()
export class CampaignStrategyAgent implements Agent {
  readonly type: AgentType = 'CampaignStrategyAgent';

  constructor(
    private readonly campaigns: CampaignsService,
    private readonly llm: LlmService,
    private readonly support: AgentSupportService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const objective = String(
      ctx.input.objective ?? 'Increase inbound founder leads',
    );
    const audience = String(
      ctx.input.audience ?? 'Startup founders and early employees',
    );

    await ctx.step('memory', 'Studying past campaign performance');
    const past = await this.support.retrieveContext(
      `past campaign performance for ${objective}`,
      ['past_performance', 'campaign_report'],
    );
    await ctx.step('thought', 'Drafting campaign plan and goals');

    const summary = await this.llm.completeJson<{
      summary: string;
      highlights: string[];
      nextActions: string[];
    }>('Draft a campaign strategy.', {
      purpose: 'campaign_summary',
      context: {
        campaignName: `${objective} Campaign`,
        audience,
        past: past.slice(0, 200),
      },
    });

    const proposed = {
      name: String(ctx.input.name ?? `${objective}`),
      objective,
      audience,
      channels: (ctx.input.channels as string[]) ?? ['LinkedIn', 'Email', 'X'],
      budget: Number(ctx.input.budget ?? 25000),
      goals: (ctx.input.goals as Record<string, number>) ?? {
        impressions: 50000,
        clicks: 1500,
        leads: 100,
      },
    };

    let campaignId: string | undefined;
    if (ctx.input.create) {
      const campaign = await this.campaigns.create({
        ...proposed,
        status: CampaignStatus.active,
        missionId: ctx.input.missionId as string | undefined,
      });
      campaignId = campaign.id;
      await ctx.step('output', `Created campaign "${campaign.name}"`, {
        campaignId,
      });
    }

    return {
      summary: `Proposed campaign "${proposed.name}" targeting ${audience}.`,
      output: { proposed, campaignId, strategy: summary },
    };
  }
}
