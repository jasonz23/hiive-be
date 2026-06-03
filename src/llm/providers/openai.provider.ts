import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import {
  ChatMessage,
  CompleteOptions,
  LlmCompletion,
  LlmProvider,
  ToolCall,
} from '../llm.types';
import { PURPOSE_SCHEMAS } from '../purpose-schemas';

/**
 * Real OpenAI-backed provider. Used only when OPENAI_API_KEY is set. Implements
 * the same contract as MockProvider so agents are provider-agnostic.
 */
export class OpenAIProvider implements LlmProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly chatModel: string,
    private readonly embeddingModel: string,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(
    messages: ChatMessage[],
    options: CompleteOptions = {},
  ): Promise<LlmCompletion> {
    const mapped: ChatCompletionMessageParam[] = [];
    const system = this.buildSystem(options);
    if (system) mapped.push({ role: 'system', content: system });

    for (const m of messages) {
      if (m.role === 'tool') {
        mapped.push({
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId ?? '',
        });
      } else if (m.role === 'assistant' && m.toolCalls?.length) {
        mapped.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: JSON.stringify(c.arguments) },
          })),
        });
      } else {
        mapped.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    const tools: ChatCompletionTool[] | undefined = options.tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: mapped,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      response_format: options.json ? { type: 'json_object' } : undefined,
      tools,
    });

    const choice = response.choices[0]?.message;
    const toolCalls: ToolCall[] | undefined = choice?.tool_calls
      ?.filter((c) => c.type === 'function')
      .map((c) => ({
        id: c.id,
        name: c.function.name,
        arguments: safeJson(c.function.arguments),
      }));

    return { content: choice?.content ?? '', toolCalls };
  }

  /**
   * Builds the system prompt. In JSON mode, OpenAI requires the word "json" in
   * the prompt; we also inject the exact expected shape (per purpose) and the
   * structured context so real GPT returns what the agents parse.
   */
  private buildSystem(options: CompleteOptions): string {
    const parts: string[] = [];
    if (options.system) parts.push(options.system);
    if (options.json) {
      parts.push(
        'Respond with a single valid JSON object — no prose, no code fences.',
      );
      if (options.purpose && PURPOSE_SCHEMAS[options.purpose]) {
        parts.push(
          `The JSON must match this shape: ${PURPOSE_SCHEMAS[options.purpose]}`,
        );
      }
    }
    if (options.context && Object.keys(options.context).length > 0) {
      parts.push(`Use this context:\n${JSON.stringify(options.context)}`);
    }
    return parts.join('\n\n');
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}

function safeJson(input: string): Record<string, unknown> {
  try {
    return JSON.parse(input) as Record<string, unknown>;
  } catch {
    return {};
  }
}
