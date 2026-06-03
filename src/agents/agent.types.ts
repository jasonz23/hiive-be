import { AgentRun } from '@prisma/client';

export type AgentType =
  | 'PlannerAgent'
  | 'CampaignStrategyAgent'
  | 'ContentGenerationAgent'
  | 'ComplianceReviewAgent'
  | 'SocialSimulationSwarmAgent'
  | 'PerformanceMonitoringAgent'
  | 'AdsOptimizationAgent'
  | 'ViralOpportunityAgent'
  | 'ReplicationAgent'
  | 'MemoryRetrievalAgent'
  | 'EngagementAgent'
  | 'MarketingPerformanceAnalyzerAgent'
  | 'ChatAgent';

export type StepType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'memory'
  | 'output'
  | 'approval'
  | 'recommendation'
  | 'reflection';

export interface AgentContext {
  run: AgentRun;
  input: Record<string, unknown>;
  /** Record a visible timeline step. */
  step: (type: StepType, label: string, detail?: unknown) => Promise<void>;
}

export interface AgentResult {
  summary: string;
  output: Record<string, unknown>;
}

/** An agent's pre-flight decision on whether it has anything to do. */
export interface AgentDecision {
  run: boolean;
  reason?: string;
}

export interface Agent {
  readonly type: AgentType;
  run(ctx: AgentContext): Promise<AgentResult>;
  /**
   * Optional cheap pre-check (no LLM) that lets an agent bow out when there's
   * nothing to do — e.g. no spike to act on, no new comments, draft pool already
   * full. The orchestrator records a lightweight `skipped` run with the reason.
   */
  shouldRun?(input: Record<string, unknown>): Promise<AgentDecision> | AgentDecision;
}

export interface RunOptions {
  missionId?: string;
  entityType?: string;
  entityId?: string;
  /** Skip the automatic reflection step (used by sub-agents inside a swarm). */
  skipReflection?: boolean;
}
