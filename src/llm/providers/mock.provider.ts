import {
  ChatMessage,
  CompleteOptions,
  LlmCompletion,
  LlmProvider,
  ToolCall,
  ToolSpec,
} from '../llm.types';
import { generateMockJson, generateMockText } from './mock-content';

/**
 * Deterministic, keyless LLM provider. Default whenever OPENAI_API_KEY is unset.
 * - complete(): purpose-driven templated content (+ a simple tool-calling loop for chat)
 * - embed(): bag-of-words hashing into the embedding space so semantically similar
 *   text produces similar vectors — real cosine-similarity retrieval, no API needed.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock' as const;

  constructor(private readonly dim: number) {}

  async complete(
    messages: ChatMessage[],
    options: CompleteOptions = {},
  ): Promise<LlmCompletion> {
    const seedSource = messages.map((m) => `${m.role}:${m.content}`).join('|');

    // Tool-calling loop (used by the chat agent). Call one relevant tool, then,
    // once its result is present, synthesize a final answer.
    if (options.tools?.length) {
      const alreadyCalled = messages.some((m) => m.role === 'tool');
      if (!alreadyCalled) {
        const toolCall = this.chooseTool(messages, options.tools);
        if (toolCall) return { content: '', toolCalls: [toolCall] };
      }
      return { content: this.answerFromToolResults(messages) };
    }

    if (options.json) {
      return { content: generateMockJson(options, seedSource) };
    }
    return { content: generateMockText(options, seedSource) };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedOne(text));
  }

  // --- internals -----------------------------------------------------------

  private embedOne(text: string): number[] {
    const vector = new Array<number>(this.dim).fill(0);
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    for (const token of tokens) {
      const idx = this.hash(token) % this.dim;
      const sign = (this.hash(token + '#') & 1) === 0 ? 1 : -1;
      vector[idx] += sign;
    }

    // L2 normalize so cosine similarity is well-behaved.
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  private hash(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
  }

  private chooseTool(
    messages: ChatMessage[],
    tools: ToolSpec[],
  ): ToolCall | null {
    const lastUser =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const q = lastUser.toLowerCase();
    const names = new Set(tools.map((t) => t.name));

    const want = (name: string): boolean => names.has(name);
    const call = (name: string, args: Record<string, unknown>): ToolCall => ({
      id: `call_${this.hash(name + lastUser)}`,
      name,
      arguments: args,
    });

    if (
      /memory|know|messaging|brand|compliance|persona|insight|audience/.test(
        q,
      ) &&
      want('searchMemory')
    ) {
      return call('searchMemory', { query: lastUser });
    }
    if (
      /underperform|why|convert|performance|down|weak|ctr/.test(q) &&
      want('listCampaigns')
    ) {
      return call('listCampaigns', {});
    }
    if (/replicate|best|top|winning/.test(q) && want('listCampaigns')) {
      return call('listCampaigns', {});
    }
    if (/campaign/.test(q) && want('listCampaigns')) {
      return call('listCampaigns', {});
    }
    if (/(generate|create|write|ideas?)/.test(q) && want('searchMemory')) {
      return call('searchMemory', { query: lastUser });
    }
    // Default: ground the answer in memory.
    if (want('searchMemory')) return call('searchMemory', { query: lastUser });
    if (want('listCampaigns')) return call('listCampaigns', {});
    return null;
  }

  private answerFromToolResults(messages: ChatMessage[]): string {
    const lastUser =
      [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const toolMessages = messages.filter((m) => m.role === 'tool');
    const evidence = toolMessages
      .map((m) => `- ${m.name}: ${this.truncate(m.content, 400)}`)
      .join('\n');

    return (
      `Here's what I found relevant to "${lastUser.trim()}":\n\n${evidence}\n\n` +
      `Summary: Based on the retrieved memory and live campaign/analytics data above, ` +
      `the key drivers are sell-side messaging clarity and CTA specificity. I recommend ` +
      `tightening CTAs around "understand your options before an IPO", running a swarm ` +
      `simulation on new variants, and pausing the weakest creative. Want me to draft the variants?`
    );
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }
}
