import { Injectable } from '@nestjs/common';
import { AudienceService } from '../../audience/audience.service';
import { CommentsService } from '../../comments/comments.service';
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

interface EngagementResult {
  sentiment: string;
  summary: string;
  themes: string[];
  replies: { label: string; text: string }[];
  objection: string | null;
  copySuggestion: string | null;
}

/**
 * Reads (mock) audience comments pulled on a post and acts: summarizes sentiment
 * + themes (shown on the dashboard), drafts reply options the human picks + sends,
 * raises a copy-change suggestion when an objection recurs, and escalates a
 * recommendation on a negative spike. Human-in-the-loop throughout.
 */
@Injectable()
export class EngagementAgent implements Agent {
  readonly type: AgentType = 'EngagementAgent';

  constructor(
    private readonly audience: AudienceService,
    private readonly posts: PostsService,
    private readonly llm: LlmService,
    private readonly comments: CommentsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const postId = String(input.postId ?? '');
    if (!postId) return { run: false, reason: 'no post specified' };
    const open = await this.audience.openComments(postId);
    if (open.length === 0) {
      return { run: false, reason: 'no new audience comments to act on' };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = String(ctx.input.postId ?? '');
    const open = await this.audience.openComments(postId);
    if (open.length === 0) {
      await ctx.step('output', 'No new audience comments to act on');
      return {
        summary: 'No new audience comments.',
        output: { sentiment: 'none', counts: {} },
      };
    }

    const counts = this.audience.counts(open);
    await ctx.step('memory', `Read ${open.length} new audience comments`);
    await ctx.step(
      'thought',
      `Sentiment ${counts.positive}+ / ${counts.neutral}~ / ${counts.negative}- · top theme "${counts.topTheme}"`,
    );

    const result = await this.llm.completeJson<EngagementResult>(
      'Summarize audience.',
      {
        purpose: 'engagement_summary',
        context: { ...counts },
      },
    );

    // Escalate on a negative spike.
    if (result.objection || counts.negative >= 2) {
      await ctx.step(
        'recommendation',
        `Negative sentiment around "${counts.topTheme}"`,
      );
      await this.recommendations.create({
        agentRunId: ctx.run.id,
        agentType: this.type,
        postId,
        title: `Audience pushback on "${counts.topTheme}"`,
        body: result.summary,
        severity: counts.negative >= 3 ? 'critical' : 'warning',
        actions: ['Reply to objections', 'Pre-empt the objection in the copy'],
      });
    }

    // Recurring objection → a copy-change suggestion the human picks from.
    if (
      result.copySuggestion &&
      !(await this.hasOpenEngagementSuggestion(postId))
    ) {
      const post = await this.posts.findOne(postId);
      const base = post.copy.split('\n')[0];
      const cta = 'Understand your options before an IPO →';
      await ctx.step(
        'thought',
        'Raising a copy suggestion to pre-empt the objection',
      );
      await this.comments.create(postId, {
        authorKind: 'agent',
        author: this.type,
        agentRunId: ctx.run.id,
        type: 'suggestion',
        body: `Audience keeps raising "${counts.topTheme}". ${result.copySuggestion}`,
        quotedText: post.copy,
        rangeStart: 0,
        rangeEnd: post.copy.length,
        options: [
          {
            id: 'preempt',
            label: 'Address the objection',
            text: `${base}\n\nNo guarantees — transparent, no-pressure pricing. ${cta}`,
          },
          {
            id: 'trust',
            label: 'Lead with trust',
            text: `Transparent pricing, no obligation.\n\n${base} ${cta}`,
          },
        ],
      });
    }

    await ctx.step(
      'output',
      `Drafted ${result.replies?.length ?? 0} reply options for review`,
    );

    return {
      summary: `Audience ${result.sentiment}: ${result.summary}`,
      output: { ...result, counts, replyOptions: result.replies },
    };
  }

  private async hasOpenEngagementSuggestion(postId: string): Promise<boolean> {
    const existing = await this.comments.list(postId);
    return existing.some(
      (c) =>
        c.author === this.type &&
        c.type === 'suggestion' &&
        c.status === 'open',
    );
  }
}
