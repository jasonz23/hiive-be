import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import { AgentSupportService } from '../agent-support.service';
import { Agent, AgentContext, AgentResult, AgentType } from '../agent.types';

interface PlanStep {
  order: number;
  agent: string;
  action: string;
  requiresApproval: boolean;
}

interface PlannerResult {
  rationale: string;
  steps: PlanStep[];
}

/**
 * The Planner. Every mission/request flows through here first: it decides which
 * agents to use, which memory to load, and where approvals are required.
 */
@Injectable()
export class PlannerAgent implements Agent {
  readonly type: AgentType = 'PlannerAgent';

  constructor(
    private readonly llm: LlmService,
    private readonly support: AgentSupportService,
  ) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const objective = String(
      ctx.input.objective ?? ctx.input.request ?? 'Run a marketing mission',
    );

    await ctx.step('memory', 'Loading relevant memory for planning');
    const context = await this.support.retrieveContext(objective);

    await ctx.step('thought', `Decomposing objective: "${objective}"`);
    const result = await this.llm.completeJson<PlannerResult>(
      'Plan the mission.',
      {
        purpose: 'planner',
        context: { objective, memory: context.slice(0, 200) },
      },
    );

    for (const step of result.steps ?? []) {
      await ctx.step(
        'thought',
        `Step ${step.order}: ${step.agent} — ${step.action}${step.requiresApproval ? ' (approval)' : ''}`,
      );
    }

    return {
      summary: `Planned ${result.steps?.length ?? 0} steps to achieve: ${objective}`,
      output: result as unknown as Record<string, unknown>,
    };
  }
}
