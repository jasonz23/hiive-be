import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from './embeddings.service';
import { LlmService } from './llm.service';
import { LLM_PROVIDER, LlmProvider } from './llm.types';
import { MockProvider } from './providers/mock.provider';
import { OpenAIProvider } from './providers/openai.provider';

/**
 * Wires the active LLM provider from configuration. MockProvider is the default
 * (no key required); OpenAIProvider is used when OPENAI_API_KEY is present.
 */
@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LlmProvider => {
        const logger = new Logger('LlmModule');
        const dim = config.get<number>('embeddingDim') ?? 1536;
        if (config.get<string>('llmProvider') === 'openai') {
          logger.log('Using OpenAIProvider (OPENAI_API_KEY detected)');
          return new OpenAIProvider(
            config.get<string>('openaiApiKey') ?? '',
            config.get<string>('openaiChatModel') ?? 'gpt-4o-mini',
            config.get<string>('openaiEmbeddingModel') ??
              'text-embedding-3-small',
          );
        }
        logger.log(
          'Using MockProvider (no API key — deterministic, keyless mode)',
        );
        return new MockProvider(dim);
      },
    },
    LlmService,
    EmbeddingsService,
  ],
  exports: [LlmService, EmbeddingsService, LLM_PROVIDER],
})
export class LlmModule {}
