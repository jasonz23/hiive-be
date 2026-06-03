import { Injectable } from '@nestjs/common';
import { AgentRun, AgentRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RunOptions, StepType } from './agent.types';

/**
 * Owns the AgentRun + AgentStep lifecycle: create a run, append timeline steps
 * with monotonically increasing order, and finalize with output + status.
 */
@Injectable()
export class AgentRunService {
  private readonly stepCounters = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async start(
    agentType: string,
    input: Record<string, unknown>,
    options: RunOptions = {},
  ): Promise<AgentRun> {
    const run = await this.prisma.agentRun.create({
      data: {
        agentType,
        input: input as Prisma.InputJsonValue,
        status: AgentRunStatus.running,
        missionId: options.missionId,
        entityType: options.entityType,
        entityId: options.entityId,
        startedAt: new Date(),
      },
    });
    this.stepCounters.set(run.id, 0);
    return run;
  }

  async step(
    runId: string,
    type: StepType,
    label: string,
    detail?: unknown,
  ): Promise<void> {
    const order = (this.stepCounters.get(runId) ?? 0) + 1;
    this.stepCounters.set(runId, order);
    await this.prisma.agentStep.create({
      data: {
        agentRunId: runId,
        order,
        type,
        label,
        detail: detail ?? undefined,
      },
    });
  }

  async finish(
    runId: string,
    result: {
      output: Record<string, unknown>;
      summary: string;
      status: AgentRunStatus;
    },
  ): Promise<AgentRun> {
    this.stepCounters.delete(runId);
    return this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        output: result.output as Prisma.InputJsonValue,
        summary: result.summary,
        status: result.status,
        finishedAt: new Date(),
      },
    });
  }

  list(filters: { agentType?: string; missionId?: string } = {}) {
    return this.prisma.agentRun.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { steps: true, recommendations: true } } },
    });
  }

  get(id: string) {
    return this.prisma.agentRun.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { order: 'asc' } },
        reflections: true,
        recommendations: true,
        approvals: true,
      },
    });
  }
}
