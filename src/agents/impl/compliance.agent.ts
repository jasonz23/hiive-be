import { Injectable } from '@nestjs/common';
import { CommentsService } from '../../comments/comments.service';
import { LlmService } from '../../llm/llm.service';
import { PostsService } from '../../posts/posts.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import { AgentSupportService } from '../agent-support.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

const REVIEWABLE = ['draft', 'review'];

// Compliant replacements applied when a flagged phrase suggestion is accepted.
const SAFE_REPLACEMENTS: Record<string, string> = {
  guarantee: 'may help',
  guaranteed: 'potential',
  'risk-free': 'transparent',
  'no risk': 'transparent',
  'best price': 'competitive pricing',
  'highest price': 'competitive pricing',
};

function safeReplacement(phrase: string): string {
  return SAFE_REPLACEMENTS[phrase.toLowerCase()] ?? '';
}

interface ComplianceResult {
  overallRisk: string;
  approved: boolean;
  flags: {
    phrase: string;
    issue: string;
    suggestion: string;
    severity: string;
  }[];
  summary: string;
}

/** Flags compliance-sensitive language in post copy and raises a recommendation on risk. */
@Injectable()
export class ComplianceReviewAgent implements Agent {
  readonly type: AgentType = 'ComplianceReviewAgent';

  constructor(
    private readonly llm: LlmService,
    private readonly posts: PostsService,
    private readonly recommendations: RecommendationsService,
    private readonly comments: CommentsService,
    private readonly support: AgentSupportService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const postId = input.postId as string | undefined;
    const copy = String(input.copy ?? '');
    if (!postId) {
      return copy ? { run: true } : { run: false, reason: 'nothing to review' };
    }
    const post = await this.posts.findOne(postId);
    if (!REVIEWABLE.includes(post.status)) {
      return { run: false, reason: `post already ${post.status} — past review` };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = ctx.input.postId as string | undefined;
    let copy = String(ctx.input.copy ?? '');
    if (postId && !copy) {
      const post = await this.posts.findOne(postId);
      copy = post.copy;
    }

    await ctx.step('memory', 'Loading compliance guidelines');
    const rules = await this.support.retrieveContext(
      'compliance rules and prohibited claims',
      ['compliance'],
    );

    await ctx.step(
      'thought',
      'Scanning copy for compliance-sensitive language',
    );
    const result = await this.llm.completeJson<ComplianceResult>(
      'Review for compliance.',
      {
        purpose: 'compliance_review',
        context: { copy, rules: rules.slice(0, 200) },
      },
    );

    if (result.overallRisk === 'high' || result.flags.length > 0) {
      await ctx.step(
        'recommendation',
        `Compliance risk: ${result.overallRisk}`,
        result.flags,
      );
      await this.recommendations.create({
        agentRunId: ctx.run.id,
        agentType: this.type,
        postId,
        title: `Compliance review: ${result.overallRisk} risk`,
        body: result.summary,
        severity: result.overallRisk === 'high' ? 'critical' : 'warning',
        actions: result.flags,
      });

      // Author an inline suggestion on each flagged phrase — with two options to pick.
      if (postId) {
        for (const flag of result.flags) {
          const idx = copy.indexOf(flag.phrase);
          await this.comments.create(postId, {
            authorKind: 'agent',
            author: this.type,
            agentRunId: ctx.run.id,
            type: 'suggestion',
            body: `${flag.issue}. ${flag.suggestion}`,
            quotedText: flag.phrase,
            rangeStart: idx >= 0 ? idx : undefined,
            rangeEnd: idx >= 0 ? idx + flag.phrase.length : undefined,
            options: [
              {
                id: 'safe',
                label: 'Compliant rewrite',
                text: safeReplacement(flag.phrase),
              },
              { id: 'remove', label: 'Remove phrase', text: '' },
            ],
          });
        }
      }
    }

    return {
      summary: `Compliance ${result.overallRisk} risk — ${result.flags.length} flag(s).`,
      output: result as unknown as Record<string, unknown>,
    };
  }
}
