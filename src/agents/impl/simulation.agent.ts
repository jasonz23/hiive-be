import { Injectable } from '@nestjs/common';
import { CommentsService } from '../../comments/comments.service';
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

interface PersonaReview {
  persona: string;
  score: number;
  reaction: string;
  strengths: string[];
  risks: string[];
}

interface SimulationResult {
  overallScore: number;
  personas: PersonaReview[];
  strengths: string[];
  risks: string[];
  suggestedRevision: string;
  verdict: string;
}

/**
 * Social Media Simulation Swarm: six persona agents each react to the post from
 * a different perspective, producing a blended score + suggested revision before
 * the post is approved. Each persona is recorded as a visible timeline step.
 */
@Injectable()
export class SocialSimulationSwarmAgent implements Agent {
  readonly type: AgentType = 'SocialSimulationSwarmAgent';

  constructor(
    private readonly llm: LlmService,
    private readonly posts: PostsService,
    private readonly comments: CommentsService,
    private readonly support: AgentSupportService,
  ) {}

  async shouldRun(input: Record<string, unknown>): Promise<AgentDecision> {
    const postId = input.postId as string | undefined;
    const copy = String(input.copy ?? '');
    // Ad-hoc copy can always be test-run; a real post is only worth simulating
    // before it ships (draft/review).
    if (!postId) {
      return copy ? { run: true } : { run: false, reason: 'nothing to simulate' };
    }
    const post = await this.posts.findOne(postId);
    if (!['draft', 'review'].includes(post.status)) {
      return { run: false, reason: `post already ${post.status} — no need to pre-test` };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const postId = ctx.input.postId as string | undefined;
    let copy = String(ctx.input.copy ?? '');
    const audience = String(
      ctx.input.audience ?? 'founders and early employees',
    );
    if (postId) {
      const post = await this.posts.findOne(postId);
      copy = copy || post.copy;
    }

    await ctx.step(
      'memory',
      'Loading brand + audience memory for persona grounding',
    );
    const brand = await this.support.retrieveContext(
      'brand voice and audience personas',
    );

    await ctx.step('thought', 'Dispatching 6-persona simulation swarm');
    const result = await this.llm.completeJson<SimulationResult>(
      'Simulate audience reactions.',
      {
        purpose: 'social_simulation',
        context: { copy, audience, brandTone: brand.slice(0, 160) },
      },
    );

    for (const persona of result.personas ?? []) {
      await ctx.step(
        'thought',
        `${persona.persona}: ${persona.score}/100`,
        persona,
      );
    }

    if (postId) {
      await this.posts.saveSimulation(postId, result);
      // Surface the swarm's risks + suggested revision as an inline suggestion.
      if (result.suggestedRevision) {
        await this.comments.create(postId, {
          authorKind: 'agent',
          author: this.type,
          agentRunId: ctx.run.id,
          type: 'suggestion',
          body: `Swarm scored ${result.overallScore}/100. Risks: ${(result.risks ?? []).join('; ')}. Suggested revision below.`,
          quotedText: copy,
          rangeStart: 0,
          rangeEnd: copy.length,
          suggestedText: result.suggestedRevision,
        });
      }
    }
    await ctx.step(
      'output',
      `Overall score ${result.overallScore}/100 (${result.verdict})`,
    );

    return {
      summary: `Swarm scored the post ${result.overallScore}/100; verdict: ${result.verdict}.`,
      output: result as unknown as Record<string, unknown>,
    };
  }
}
