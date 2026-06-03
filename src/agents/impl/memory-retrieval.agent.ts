import { Injectable } from '@nestjs/common';
import { MemoryService } from '../../memory/memory.service';
import { Agent, AgentContext, AgentResult, AgentType } from '../agent.types';

/** Thin agent that retrieves and summarizes relevant memory for a query. */
@Injectable()
export class MemoryRetrievalAgent implements Agent {
  readonly type: AgentType = 'MemoryRetrievalAgent';

  constructor(private readonly memory: MemoryService) {}

  async run(ctx: AgentContext): Promise<AgentResult> {
    const query = String(ctx.input.query ?? '');
    const tags = Array.isArray(ctx.input.tags)
      ? (ctx.input.tags as string[])
      : undefined;
    await ctx.step('thought', `Retrieving memory for: "${query}"`);
    const hits = await this.memory.search(query, { tags, limit: 6 });
    await ctx.step('memory', `Retrieved ${hits.length} memory chunks`, hits);
    return {
      summary: `Retrieved ${hits.length} relevant memory chunks.`,
      output: { hits },
    };
  }
}
