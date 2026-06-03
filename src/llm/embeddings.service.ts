import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER } from './llm.types';
import type { LlmProvider } from './llm.types';

/**
 * Produces embedding vectors via the active provider and formats them for
 * pgvector. Storage/query lives in the memory repository; this owns the vectors.
 */
@Injectable()
export class EmbeddingsService {
  readonly dim: number;

  constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    config: ConfigService,
  ) {
    this.dim = config.get<number>('embeddingDim') ?? 1536;
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.provider.embed(texts);
  }

  async embedOne(text: string): Promise<number[]> {
    const [vector] = await this.provider.embed([text]);
    return vector;
  }

  /** pgvector literal, e.g. "[0.1,0.2,...]". */
  toVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}
