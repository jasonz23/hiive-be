import { join } from 'node:path';
import { parseCorsAllowList } from '../common/cors';

/**
 * Typed configuration loaded from environment variables. Registered with
 * @nestjs/config so it can be injected via ConfigService.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  corsAllowList: string[];
  databaseUrl: string;
  redisUrl: string;
  openaiApiKey: string;
  openaiChatModel: string;
  openaiEmbeddingModel: string;
  embeddingDim: number;
  llmProvider: 'openai' | 'mock';
  storageProvider: 'local' | 'gcs';
  gcsBucket: string;
  storageLocalDir: string;
  backendOrigin: string;
}

export default (): AppConfig => {
  const openaiApiKey = process.env.OPENAI_API_KEY?.trim() ?? '';

  return {
    port: parseInt(process.env.PORT ?? '8001', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    corsAllowList: parseCorsAllowList(
      process.env.CORS_ALLOW_LIST ?? 'http://localhost:8000',
    ),
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:63799',
    openaiApiKey,
    openaiChatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o-mini',
    openaiEmbeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    embeddingDim: parseInt(process.env.EMBEDDING_DIM ?? '1536', 10),
    // The presence of an API key decides which LLM/embedding implementation runs.
    llmProvider: openaiApiKey ? 'openai' : 'mock',
    // File storage: local disk in dev, Google Cloud Storage in prod (Cloud Run
    // provides credentials automatically via ADC). Only the URL is stored in DB.
    storageProvider:
      (process.env.STORAGE_PROVIDER as 'local' | 'gcs' | undefined) ??
      (process.env.NODE_ENV === 'production' ? 'gcs' : 'local'),
    gcsBucket: process.env.GCS_BUCKET_NAME ?? '',
    storageLocalDir:
      process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), 'uploads'),
    backendOrigin:
      process.env.BACKEND_ORIGIN ??
      `http://localhost:${process.env.PORT ?? '8001'}`,
  };
};
