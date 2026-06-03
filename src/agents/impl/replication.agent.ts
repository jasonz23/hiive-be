import { Injectable } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { LlmService } from '../../llm/llm.service';
import { PostsService } from '../../posts/posts.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

interface ReplicationResult {
  variants: { channel: string; copy: string }[];
}

/** Replicates a winning post into LinkedIn / X / Email / Ad / Blog variants as drafts. */
@Injectable()
export class ReplicationAgent implements Agent {
  readonly type: AgentType = 'ReplicationAgent';

  constructor(
    private readonly posts: PostsService,
    private readonly llm: LlmService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const postId = String(input.postId ?? '');
    if (!postId) return { run: false, reason: 'no post specified' };
    const post = await this.posts.findOne(postId);
    const m = this.posts.metricsOf(post);
    // Only worth replicating a proven winner — strong CTR on real reach.
    if (m.impressions < 1000 || m.ctr < 2.5) {
      return { run: false, reason: 'post is not a standout winner yet' };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = String(ctx.input.postId ?? '');
    const post = await this.posts.findOne(postId);

    await ctx.step('thought', 'Repurposing winning content across channels');
    const result = await this.llm.completeJson<ReplicationResult>(
      'Replicate content.',
      {
        purpose: 'replication',
        context: { copy: post.copy },
      },
    );

    const created: { id: string; channel: string }[] = [];
    for (const variant of result.variants ?? []) {
      // Email/Ad/Blog are non-post channels; create posts only for social channels.
      const isSocial = ['LinkedIn', 'X'].includes(variant.channel);
      if (isSocial) {
        const draft = await this.posts.create({
          campaignId: post.campaignId,
          platform: variant.channel,
          copy: variant.copy,
          status: PostStatus.draft,
        });
        created.push({ id: draft.id, channel: variant.channel });
      }
    }
    await ctx.step(
      'output',
      `Created ${created.length} social drafts + ${(result.variants?.length ?? 0) - created.length} other-channel variants`,
    );

    return {
      summary: `Replicated post into ${result.variants?.length ?? 0} channel variants.`,
      output: { variants: result.variants, createdDrafts: created },
    };
  }
}
