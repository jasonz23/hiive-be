import { Injectable } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { SEGMENT_LABEL, segmentOf } from '../../common/segment';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { LlmService } from '../../llm/llm.service';
import { PostsService } from '../../posts/posts.service';
import { AgentSupportService } from '../agent-support.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

// Below this many drafts in a campaign, it's worth generating more.
const DRAFT_POOL_TARGET = 6;

interface GeneratedPost {
  platform: string;
  copy: string;
  hook?: string;
  cta?: string;
  rationale?: string;
}

/**
 * Generates channel-specific posts grounded in brand memory, prior reflections,
 * and human-edit learning, then drops them into the content calendar as drafts.
 */
@Injectable()
export class ContentGenerationAgent implements Agent {
  readonly type: AgentType = 'ContentGenerationAgent';

  constructor(
    private readonly campaigns: CampaignsService,
    private readonly posts: PostsService,
    private readonly llm: LlmService,
    private readonly support: AgentSupportService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    // Explicit generation requests (with a count) always run; the autonomous
    // pool-refill only runs when the campaign is short on drafts.
    if (input.count != null) return { run: true };
    const campaignId = String(input.campaignId ?? '');
    if (!campaignId) return { run: false, reason: 'no campaign specified' };
    const drafts = await this.posts.findAll({
      campaignId,
      status: PostStatus.draft,
    });
    if (drafts.length >= DRAFT_POOL_TARGET) {
      return {
        run: false,
        reason: `draft pool already healthy (${drafts.length} queued)`,
      };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const campaignId = String(ctx.input.campaignId ?? '');
    const count = Number(ctx.input.count ?? 3);
    const platform = (ctx.input.platform as string) ?? 'LinkedIn';
    const campaign = await this.campaigns.findOne(campaignId);

    await ctx.step('memory', 'Loading brand voice + compliance memory');
    const brand = await this.support.retrieveContext(
      `brand voice and sell-side messaging for ${campaign.audience}`,
      ['brand_guideline', 'sell_side_messaging'],
    );
    // Episodic memory of what humans previously picked/edited, so choices shape new copy.
    const humanFeedback = await this.support.retrieveContext(
      `copy and CTA choices humans preferred for ${campaign.audience}`,
      ['human_feedback'],
    );
    // What the marketing analyzer has learned is working vs not for this segment.
    const insights = await this.support.retrieveContext(
      `what marketing is working vs not for ${SEGMENT_LABEL[segmentOf(campaign)]} prospects on ${platform}`,
      ['marketing_insight'],
    );
    const guidance = await this.support.guidance(this.type);
    if (guidance || humanFeedback)
      await ctx.step(
        'thought',
        'Applying prior reflections + human feedback memory',
      );

    await ctx.step(
      'thought',
      `Generating ${count} ${platform} posts for "${campaign.name}"`,
    );
    const result = await this.llm.completeJson<{ posts: GeneratedPost[] }>(
      `Generate ${count} ${platform} posts.\n${brand}\n${humanFeedback}\n${insights}\n${guidance}`,
      {
        purpose: 'content_generation',
        context: {
          count,
          platform,
          audience: campaign.audience,
          campaignName: campaign.name,
          brandTone: brand.slice(0, 200),
        },
      },
    );

    const created: { id: string; platform: string; copy: string }[] = [];
    for (const post of result.posts ?? []) {
      const draft = await this.posts.create({
        campaignId,
        platform: post.platform ?? platform,
        copy: post.copy,
        status: PostStatus.draft,
      });
      created.push({
        id: draft.id,
        platform: draft.platform,
        copy: draft.copy,
      });
    }
    await ctx.step('output', `Created ${created.length} draft posts`, {
      created,
    });

    return {
      summary: `Generated ${created.length} grounded ${platform} drafts for "${campaign.name}".`,
      output: { posts: created },
    };
  }
}
