import { Injectable } from '@nestjs/common';
import { PostStatus, RecommendationStatus } from '@prisma/client';
import { LlmService } from '../../llm/llm.service';
import { ToolSpec } from '../../llm/llm.types';
import { AdsService } from '../../ads/ads.service';
import { AudienceService } from '../../audience/audience.service';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { LearningService } from '../../learning/learning.service';
import { MemoryService } from '../../memory/memory.service';
import { PostsService } from '../../posts/posts.service';
import { RecommendationsService } from '../../recommendations/recommendations.service';
import { ReflectionsService } from '../../reflections/reflections.service';
import { AgentOrchestratorService } from '../agent-orchestrator.service';

const AGENT_TYPES = [
  'PlannerAgent',
  'CampaignStrategyAgent',
  'ContentGenerationAgent',
  'ComplianceReviewAgent',
  'SocialSimulationSwarmAgent',
  'PerformanceMonitoringAgent',
  'AdsOptimizationAgent',
  'ViralOpportunityAgent',
  'ReplicationAgent',
  'MemoryRetrievalAgent',
  'EngagementAgent',
] as const;

export interface ToolExecContext {
  agentRunId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    ctx: ToolExecContext,
  ) => Promise<unknown>;
}

const STRING = { type: 'string' };

/**
 * Central tool registry. Agents (and the chatbot) call tools by name; the
 * registry validates against the JSON-schema specs and dispatches to services.
 */
@Injectable()
export class ToolRegistryService {
  private readonly tools: Map<string, Tool>;

  constructor(
    private readonly memory: MemoryService,
    private readonly campaigns: CampaignsService,
    private readonly posts: PostsService,
    private readonly ads: AdsService,
    private readonly recommendations: RecommendationsService,
    private readonly reflections: ReflectionsService,
    private readonly learning: LearningService,
    private readonly llm: LlmService,
    private readonly audience: AudienceService,
    private readonly integrations: IntegrationsService,
    private readonly knowledge: KnowledgeService,
    private readonly orchestrator: AgentOrchestratorService,
  ) {
    this.tools = new Map(this.build().map((t) => [t.name, t]));
  }

  /** Tool specs for LLM tool-calling (subset selectable by name). */
  specs(names?: string[]): ToolSpec[] {
    const selected = names
      ? names.map((n) => this.tools.get(n)).filter((t): t is Tool => Boolean(t))
      : [...this.tools.values()];
    return selected.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolExecContext = {},
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) return { error: `Unknown tool: ${name}` };
    try {
      return await tool.execute(args, ctx);
    } catch (error) {
      return { error: String(error) };
    }
  }

  private build(): Tool[] {
    return [
      {
        name: 'searchMemory',
        description:
          'Semantic search over marketing memory (brand voice, compliance, personas, past campaigns).',
        parameters: {
          type: 'object',
          properties: { query: STRING, tags: { type: 'array', items: STRING } },
          required: ['query'],
        },
        execute: async (args) =>
          this.memory.search(String(args.query ?? ''), {
            tags: Array.isArray(args.tags)
              ? (args.tags as string[])
              : undefined,
            limit: 5,
          }),
      },
      {
        name: 'searchReflections',
        description:
          'Retrieve recent agent reflections (what worked / failed / improve).',
        parameters: { type: 'object', properties: { agentType: STRING } },
        execute: async (args) =>
          this.reflections.list(args.agentType as string | undefined),
      },
      {
        name: 'searchLearningExamples',
        description:
          'Retrieve human-edit learning examples to improve future output.',
        parameters: { type: 'object', properties: { agentType: STRING } },
        execute: async (args) =>
          this.learning.list(args.agentType as string | undefined),
      },
      {
        name: 'listCampaigns',
        description: 'List all campaigns with status and health.',
        parameters: { type: 'object', properties: {} },
        execute: async () => this.campaigns.findAll(),
      },
      {
        name: 'getCampaign',
        description:
          'Get a campaign with its posts, ads, and open recommendations.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING },
          required: ['campaignId'],
        },
        execute: async (args) =>
          this.campaigns.findOne(String(args.campaignId)),
      },
      {
        name: 'getCampaignMetrics',
        description: 'Get goal attainment, actuals, and health for a campaign.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING },
          required: ['campaignId'],
        },
        execute: async (args) =>
          this.campaigns.goalProgress(String(args.campaignId)),
      },
      {
        name: 'getGoalProgress',
        description: 'Alias for campaign goal progress vs targets.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING },
          required: ['campaignId'],
        },
        execute: async (args) =>
          this.campaigns.goalProgress(String(args.campaignId)),
      },
      {
        name: 'getPost',
        description: 'Get a post with metrics and AI analysis.',
        parameters: {
          type: 'object',
          properties: { postId: STRING },
          required: ['postId'],
        },
        execute: async (args) => this.posts.findOne(String(args.postId)),
      },
      {
        name: 'listPostsByCampaign',
        description: 'List posts for a campaign (content calendar).',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING },
          required: ['campaignId'],
        },
        execute: async (args) =>
          this.posts.findAll({ campaignId: String(args.campaignId) }),
      },
      {
        name: 'getAdMetrics',
        description: 'List ads with derived CTR/CPC/CPA for a campaign.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING },
          required: ['campaignId'],
        },
        execute: async (args) => this.ads.findAll(String(args.campaignId)),
      },
      {
        name: 'createPostDraft',
        description: 'Create a draft post in the content calendar.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING, platform: STRING, copy: STRING },
          required: ['campaignId', 'platform', 'copy'],
        },
        execute: async (args) =>
          this.posts.create({
            campaignId: String(args.campaignId),
            platform: String(args.platform ?? 'LinkedIn'),
            copy: String(args.copy ?? ''),
            status: PostStatus.draft,
          }),
      },
      {
        name: 'updatePost',
        description: 'Update a post’s copy or status.',
        parameters: {
          type: 'object',
          properties: { postId: STRING, copy: STRING, status: STRING },
          required: ['postId'],
        },
        execute: async (args) =>
          this.posts.update(String(args.postId), {
            copy: args.copy as string | undefined,
            status: args.status as PostStatus | undefined,
          }),
      },
      {
        name: 'generateVariants',
        description: 'Generate multi-channel variants of a piece of copy.',
        parameters: {
          type: 'object',
          properties: { copy: STRING },
          required: ['copy'],
        },
        execute: async (args) =>
          this.llm.completeJson('Generate channel variants.', {
            purpose: 'replication',
            context: { copy: String(args.copy ?? '') },
          }),
      },
      {
        name: 'createRecommendation',
        description: 'Create an agent recommendation for the marketing team.',
        parameters: {
          type: 'object',
          properties: {
            title: STRING,
            body: STRING,
            severity: STRING,
            campaignId: STRING,
            postId: STRING,
          },
          required: ['title', 'body'],
        },
        execute: async (args, ctx) =>
          this.recommendations.create({
            agentRunId: ctx.agentRunId,
            agentType: 'ChatAgent',
            title: String(args.title),
            body: String(args.body),
            severity: (args.severity as 'info') ?? 'info',
            campaignId: args.campaignId as string | undefined,
            postId: args.postId as string | undefined,
          }),
      },

      // --- Action tools: the co-pilot can actually change app state ----------
      {
        name: 'approvePost',
        description:
          'Human-approve a post so it can be published. Use when the user asks to approve a post.',
        parameters: {
          type: 'object',
          properties: { postId: STRING },
          required: ['postId'],
        },
        execute: async (args) => this.posts.approve(String(args.postId)),
      },
      {
        name: 'publishPost',
        description:
          'Publish a post (simulates going live). After this the autonomous engine pulls metrics and runs agents automatically.',
        parameters: {
          type: 'object',
          properties: { postId: STRING },
          required: ['postId'],
        },
        execute: async (args) => this.posts.publish(String(args.postId)),
      },
      {
        name: 'refreshPostMetrics',
        description:
          'Pull the latest metrics for a published post and run the performance-monitoring loop.',
        parameters: {
          type: 'object',
          properties: { postId: STRING },
          required: ['postId'],
        },
        execute: async (args) => this.posts.refreshMetrics(String(args.postId)),
      },
      {
        name: 'runAgent',
        description:
          `Run one of Hiive's agents on a post or campaign and return its run. Valid agentType values: ${AGENT_TYPES.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            agentType: { type: 'string', enum: [...AGENT_TYPES] },
            postId: STRING,
            campaignId: STRING,
          },
          required: ['agentType'],
        },
        execute: async (args) => {
          const agentType = String(args.agentType);
          const postId = args.postId as string | undefined;
          const campaignId = args.campaignId as string | undefined;
          const input: Record<string, unknown> = {};
          if (postId) input.postId = postId;
          if (campaignId) input.campaignId = campaignId;
          return this.orchestrator.runAgent(agentType, input, {
            entityType: postId ? 'post' : campaignId ? 'campaign' : undefined,
            entityId: postId ?? campaignId,
          });
        },
      },
      {
        name: 'listIntegrations',
        description:
          'List content-calendar integrations (Notion, Asana, Google, Buffer) and whether each is connected.',
        parameters: { type: 'object', properties: {} },
        execute: async () => this.integrations.list(),
      },
      {
        name: 'connectIntegration',
        description:
          'Connect an external content-calendar tool by provider id (e.g. notion, asana, google_calendar, buffer).',
        parameters: {
          type: 'object',
          properties: { provider: STRING },
          required: ['provider'],
        },
        execute: async (args) => this.integrations.connect(String(args.provider)),
      },
      {
        name: 'syncIntegration',
        description:
          'Sync a connected content-calendar tool — push the calendar out and pull external events in.',
        parameters: {
          type: 'object',
          properties: { provider: STRING },
          required: ['provider'],
        },
        execute: async (args) => this.integrations.sync(String(args.provider)),
      },

      // --- Knowledge tools ---------------------------------------------------
      {
        name: 'getAudience',
        description:
          'Get a post’s audience comments and the engagement agent’s sentiment summary.',
        parameters: {
          type: 'object',
          properties: { postId: STRING },
          required: ['postId'],
        },
        execute: async (args) => this.audience.getAudience(String(args.postId)),
      },
      {
        name: 'listRecommendations',
        description:
          'List agent recommendations, optionally filtered by campaign, post, or status.',
        parameters: {
          type: 'object',
          properties: { campaignId: STRING, postId: STRING, status: STRING },
        },
        execute: async (args) =>
          this.recommendations.list({
            campaignId: args.campaignId as string | undefined,
            postId: args.postId as string | undefined,
            status: args.status as RecommendationStatus | undefined,
          }),
      },
      {
        name: 'listAllPosts',
        description:
          'List all posts across campaigns (optionally filtered by status) — the full content calendar.',
        parameters: {
          type: 'object',
          properties: { status: STRING },
        },
        execute: async (args) =>
          this.posts.findAll({ status: args.status as PostStatus | undefined }),
      },
      {
        name: 'getMemoryStats',
        description:
          'Get memory index stats — total chunks and a breakdown by memory type.',
        parameters: { type: 'object', properties: {} },
        execute: async () => this.memory.stats(),
      },
      {
        name: 'getKnowledgeGraph',
        description:
          'Get the knowledge graph (entities + relationships across campaigns, posts, and memory).',
        parameters: { type: 'object', properties: {} },
        execute: async () => this.knowledge.graph(),
      },
    ];
  }
}
