import { Inject, Injectable, Logger } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.types';
import type {
  ChatMessage,
  CompleteOptions,
  LlmCompletion,
  LlmProvider,
} from './llm.types';

/**
 * Facade over the active LLM provider. Agents inject this, never a concrete
 * provider. Adds JSON parsing convenience on top of the raw provider contract.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(@Inject(LLM_PROVIDER) private readonly provider: LlmProvider) {}

  get providerName(): 'openai' | 'mock' {
    return this.provider.name;
  }

  complete(
    messages: ChatMessage[],
    options?: CompleteOptions,
  ): Promise<LlmCompletion> {
    return this.provider.complete(messages, options);
  }

  /** Convenience for a single user prompt. */
  async prompt(content: string, options?: CompleteOptions): Promise<string> {
    const { content: out } = await this.provider.complete(
      [{ role: 'user', content }],
      options,
    );
    return out;
  }

  /**
   * Request a JSON object and parse it. Falls back to an empty object on parse
   * failure so a malformed model response never crashes an agent.
   */
  async completeJson<T>(content: string, options: CompleteOptions): Promise<T> {
    const { content: raw } = await this.provider.complete(
      [{ role: 'user', content }],
      { ...options, json: true },
    );
    return this.parseJson<T>(raw);
  }

  parseJson<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Tolerate fenced or prefixed JSON from real models.
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]) as T;
        } catch {
          /* fall through */
        }
      }
      this.logger.warn(`Failed to parse JSON from LLM; returning empty object`);
      return {} as T;
    }
  }
}
