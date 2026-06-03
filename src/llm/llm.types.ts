/**
 * Provider-agnostic LLM contract. Two implementations exist:
 *  - OpenAIProvider  (used when OPENAI_API_KEY is set)
 *  - MockProvider    (deterministic, keyless default — keeps the whole product
 *                     runnable and demoable with zero external dependencies)
 *
 * Agents code against this interface only; they never import a provider directly.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on role: 'tool' messages — the id of the tool call being answered. */
  toolCallId?: string;
  /** Tool/function name for role: 'tool' messages. */
  name?: string;
  /** Present on role: 'assistant' messages that requested tool calls. */
  toolCalls?: ToolCall[];
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface CompleteOptions {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Force the model to return a single JSON object. */
  json?: boolean;
  /** Enable tool/function calling. */
  tools?: ToolSpec[];
  /**
   * Hint used only by the MockProvider to pick a purpose-appropriate template.
   * Ignored by the OpenAIProvider.
   */
  purpose?: MockPurpose;
  /**
   * Structured context the MockProvider templates from (campaign names, metrics,
   * retrieved memory, etc.) so keyless output is contextual rather than canned.
   */
  context?: Record<string, unknown>;
}

export interface LlmCompletion {
  content: string;
  toolCalls?: ToolCall[];
}

export type MockPurpose =
  | 'planner'
  | 'content_generation'
  | 'compliance_review'
  | 'social_simulation'
  | 'performance_analysis'
  | 'ads_analysis'
  | 'viral_opportunity'
  | 'replication'
  | 'reflection'
  | 'campaign_summary'
  | 'engagement_summary'
  | 'marketing_insights'
  | 'pre_publish_feedback'
  | 'chat';

export interface LlmProvider {
  readonly name: 'openai' | 'mock';
  complete(
    messages: ChatMessage[],
    options?: CompleteOptions,
  ): Promise<LlmCompletion>;
  embed(texts: string[]): Promise<number[][]>;
}

/** DI token for the active provider. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
