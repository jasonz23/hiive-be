import { Injectable } from '@nestjs/common';
import { AgentRunStatus } from '@prisma/client';
import { AgentRunService } from '../agents/agent-run.service';
import { ToolRegistryService } from '../agents/tools/tool-registry.service';
import { LlmService } from '../llm/llm.service';
import { ChatMessage } from '../llm/llm.types';

const SYSTEM_PROMPT =
  'You are Hiive’s marketing co-pilot with full access to the platform’s tools. ' +
  'Use read tools (searchMemory, listCampaigns, getCampaign, getPost, getAudience, ' +
  'listRecommendations, getKnowledgeGraph, …) to ground every answer in real data — ' +
  'never invent metrics. You can also TAKE ACTIONS when the user asks: approvePost, ' +
  'publishPost, refreshPostMetrics, runAgent (run any Hiive agent on a post/campaign), ' +
  'createPostDraft, updatePost, connectIntegration, syncIntegration, createRecommendation. ' +
  'When the user asks you to do something, call the appropriate action tool and then ' +
  'confirm what you did. Be concise, specific, and actionable. If you need an id you ' +
  'don’t have, look it up with a list/search tool first.';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export interface ChatResult {
  answer: string;
  toolCalls: ChatToolCall[];
  runId: string;
}

/**
 * Tool-calling chatbot. Runs an agentic loop (LLM → tool calls → tool results →
 * answer), recording each step as a visible ChatAgent run.
 */
@Injectable()
export class ChatService {
  private readonly maxIterations = 5;

  constructor(
    private readonly llm: LlmService,
    private readonly tools: ToolRegistryService,
    private readonly runService: AgentRunService,
  ) {}

  async chat(message: string, history: ChatTurn[] = []): Promise<ChatResult> {
    const run = await this.runService.start('ChatAgent', { message });
    const messages: ChatMessage[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];
    // The co-pilot has access to the full tool registry — read + action tools.
    const toolSpecs = this.tools.specs();
    const toolTrace: ChatToolCall[] = [];
    let answer = '';

    for (let i = 0; i < this.maxIterations; i++) {
      const completion = await this.llm.complete(messages, {
        system: SYSTEM_PROMPT,
        tools: toolSpecs,
      });

      if (completion.toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: completion.content,
          toolCalls: completion.toolCalls,
        });
        for (const call of completion.toolCalls) {
          await this.runService.step(
            run.id,
            'tool_call',
            `Calling ${call.name}`,
            call.arguments,
          );
          const result = await this.tools.execute(call.name, call.arguments, {
            agentRunId: run.id,
          });
          await this.runService.step(
            run.id,
            'tool_result',
            `${call.name} result`,
            this.truncate(result),
          );
          toolTrace.push({
            tool: call.name,
            arguments: call.arguments,
            result: this.truncate(result),
          });
          messages.push({
            role: 'tool',
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      answer = completion.content;
      break;
    }

    await this.runService.step(run.id, 'output', 'Answer composed');
    await this.runService.finish(run.id, {
      output: { answer, toolCalls: toolTrace },
      summary: answer.slice(0, 140),
      status: AgentRunStatus.completed,
    });

    return { answer, toolCalls: toolTrace, runId: run.id };
  }

  private truncate(value: unknown): unknown {
    const json = JSON.stringify(value);
    return json.length > 1500 ? `${json.slice(0, 1500)}…` : value;
  }
}
