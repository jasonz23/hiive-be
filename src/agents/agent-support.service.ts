import { Injectable } from '@nestjs/common';
import { LearningService } from '../learning/learning.service';
import { MemoryService } from '../memory/memory.service';
import { ReflectionsService } from '../reflections/reflections.service';

/**
 * Cross-cutting helpers every agent uses: pull prior reflections + learning
 * deltas (the feedback loops) and retrieve grounding memory for prompts.
 */
@Injectable()
export class AgentSupportService {
  constructor(
    private readonly reflections: ReflectionsService,
    private readonly learning: LearningService,
    private readonly memory: MemoryService,
  ) {}

  /** Reflections + human-edit learning for an agent type, as a prompt block. */
  async guidance(agentType: string): Promise<string> {
    const [reflections, learnings] = await Promise.all([
      this.reflections.retrieveForAgent(agentType),
      this.learning.retrieveForAgent(agentType),
    ]);
    const lines = [...reflections, ...learnings];
    return lines.length
      ? `Prior guidance learned from past runs and human feedback:\n${lines.map((l) => `- ${l}`).join('\n')}`
      : '';
  }

  retrieveContext(query: string, tags?: string[]): Promise<string> {
    return this.memory.retrieveContext(query, { tags, limit: 5 });
  }
}
