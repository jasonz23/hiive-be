import { Injectable } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { Segment, SEGMENT_LABEL, segmentOf } from '../../common/segment';
import { CommentsService } from '../../comments/comments.service';
import { LlmService } from '../../llm/llm.service';
import { PostsService } from '../../posts/posts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentSupportService } from '../agent-support.service';
import {
  Agent,
  AgentContext,
  AgentResult,
  AgentType,
} from '../agent.types';

interface Feedback {
  alignment: 'aligned' | 'mixed' | 'off';
  summary: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
}

const LIVE = [
  PostStatus.published,
  PostStatus.analyzing,
  PostStatus.underperforming,
  PostStatus.completed,
];

/**
 * Pre-Publish Review. When a post is approved (before it goes live), this agent
 * checks it against MEMORY — the marketing learnings the agents have written
 * ("what works / what doesn't" per segment + channel), human-preferred copy
 * choices, brand voice — AND the performance of relevant *previous* posts in the
 * same segment + channel. It leaves grounded feedback as a comment so the human
 * sees how this post stacks up against what's worked before, ahead of publishing.
 */
@Injectable()
export class PrePublishReviewAgent implements Agent {
  readonly type: AgentType = 'PrePublishReviewAgent';

  constructor(
    private readonly posts: PostsService,
    private readonly support: AgentSupportService,
    private readonly llm: LlmService,
    private readonly comments: CommentsService,
    private readonly prisma: PrismaService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = String(ctx.input.postId ?? '');
    const post = await this.posts.findOne(postId);
    const segment = segmentOf(post.campaign);
    const segLabel = SEGMENT_LABEL[segment];

    await ctx.step(
      'memory',
      `Loading what's worked before for ${segLabel} prospects on ${post.platform}`,
    );
    // What the agents have LEARNED + what humans preferred + brand voice.
    const insights = await this.support.retrieveContext(
      `what marketing works vs not for ${segLabel} prospects on ${post.platform}`,
      ['marketing_insight'],
    );
    const humanFeedback = await this.support.retrieveContext(
      `copy and CTA choices humans preferred for ${segLabel} prospects`,
      ['human_feedback'],
    );
    const brand = await this.support.retrieveContext(
      `brand voice and ${segLabel} messaging`,
      ['brand_guideline', 'sell_side_messaging'],
    );

    // Relevant PREVIOUS posts (same segment + channel) and how they did.
    const pastSummary = await this.similarPostsSummary(
      segment,
      post.platform,
      postId,
    );
    await ctx.step('thought', pastSummary || 'No comparable past posts yet.');

    const result = await this.llm.completeJson<Feedback>(
      'Give pre-publish feedback grounded in memory + past posts, as json.',
      {
        purpose: 'pre_publish_feedback',
        context: {
          copy: post.copy,
          segment: segLabel,
          channel: post.platform,
          pastSummary,
          memory: `${insights}\n${humanFeedback}\n${brand}`.slice(0, 900),
        },
      },
    );

    const body =
      `**Pre-publish review** — grounded in memory of past ${segLabel} ${post.platform} posts.\n` +
      `${result.summary}\n\n` +
      (result.strengths.length ? `✅ ${result.strengths.join(' · ')}\n` : '') +
      (result.risks.length ? `⚠️ ${result.risks.join(' · ')}\n` : '') +
      (result.suggestions.length ? `💡 ${result.suggestions.join(' · ')}` : '');

    await this.comments.create(postId, {
      authorKind: 'agent',
      author: this.type,
      agentRunId: ctx.run.id,
      type: 'comment',
      body,
    });

    await ctx.step('recommendation', `Pre-publish feedback (${result.alignment})`, result);
    await ctx.step('output', result.summary);

    return {
      summary: `Pre-publish review (${result.alignment}) — left memory-grounded feedback on the approved ${segLabel} ${post.platform} post.`,
      output: { ...result, segment: segLabel, channel: post.platform },
    };
  }

  /** Summarize how previous same-segment, same-channel posts performed. */
  private async similarPostsSummary(
    segment: Segment,
    platform: string,
    excludeId: string,
  ): Promise<string> {
    const rows = await this.prisma.post.findMany({
      where: {
        status: { in: LIVE },
        platform,
        id: { not: excludeId },
      },
      select: {
        copy: true,
        metrics: true,
        campaign: { select: { name: true, audience: true, objective: true } },
      },
    });
    const peers = rows
      .filter((r) => segmentOf(r.campaign) === segment)
      .map((r) => ({
        copy: r.copy,
        ctr: Number((r.metrics as { ctr?: number } | null)?.ctr ?? 0),
        impressions: Number(
          (r.metrics as { impressions?: number } | null)?.impressions ?? 0,
        ),
      }))
      .filter((p) => p.impressions > 0)
      .sort((a, b) => b.ctr - a.ctr);

    if (peers.length === 0) return '';
    const avg = peers.reduce((s, p) => s + p.ctr, 0) / peers.length;
    const best = peers[0];
    const worst = peers[peers.length - 1];
    const label = SEGMENT_LABEL[segment];
    return (
      `Across ${peers.length} past ${platform} post(s) for ${label} prospects: avg ${avg.toFixed(2)}% CTR. ` +
      `Best ${best.ctr.toFixed(2)}% ("${best.copy.split('\n')[0].slice(0, 60)}"); ` +
      `weakest ${worst.ctr.toFixed(2)}% ("${worst.copy.split('\n')[0].slice(0, 60)}").`
    );
  }
}
