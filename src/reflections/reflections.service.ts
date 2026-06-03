import { Injectable } from '@nestjs/common';
import { AgentReflection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateReflectionInput {
  agentRunId: string;
  agentType: string;
  whatWorked?: string;
  whatFailed?: string;
  improvement?: string;
  reflection: string;
  score?: number;
}

export interface AgentHealthRow {
  agentType: string;
  runs: number;
  avgReflectionScore: number;
  approvalRate: number;
  rejectionRate: number;
  successRate: number;
  recommendations: number;
}

@Injectable()
export class ReflectionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateReflectionInput): Promise<AgentReflection> {
    return this.prisma.agentReflection.create({ data: input });
  }

  list(agentType?: string) {
    return this.prisma.agentReflection.findMany({
      where: { agentType },
      orderBy: { createdAt: 'desc' },
      include: {
        agentRun: { select: { id: true, agentType: true, status: true } },
      },
    });
  }

  /** Recent reflections injected into future agent prompts (the reflection loop). */
  async retrieveForAgent(agentType: string, limit = 3): Promise<string[]> {
    const rows = await this.prisma.agentReflection.findMany({
      where: { agentType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows
      .map((r) =>
        [
          r.whatFailed ? `Avoid: ${r.whatFailed}` : '',
          r.improvement ? `Improve: ${r.improvement}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
      .filter(Boolean);
  }

  /**
   * Agent health: approval/rejection/success rates and average reflection score
   * per agent type, computed from AgentRuns, ApprovalRequests, and reflections.
   */
  async agentHealth(): Promise<AgentHealthRow[]> {
    const runs = await this.prisma.agentRun.findMany({
      select: { id: true, agentType: true, status: true },
    });
    const reflections = await this.prisma.agentReflection.findMany({
      select: { agentType: true, score: true },
    });
    const approvals = await this.prisma.approvalRequest.findMany({
      select: { status: true, agentRun: { select: { agentType: true } } },
    });
    const recs = await this.prisma.recommendation.groupBy({
      by: ['agentType'],
      _count: { _all: true },
    });
    const recCount = new Map(recs.map((r) => [r.agentType, r._count._all]));

    const byType = new Map<string, AgentHealthRow>();
    const ensure = (agentType: string): AgentHealthRow => {
      if (!byType.has(agentType)) {
        byType.set(agentType, {
          agentType,
          runs: 0,
          avgReflectionScore: 0,
          approvalRate: 0,
          rejectionRate: 0,
          successRate: 0,
          recommendations: recCount.get(agentType) ?? 0,
        });
      }
      return byType.get(agentType)!;
    };

    const successByType = new Map<string, { total: number; ok: number }>();
    for (const run of runs) {
      const row = ensure(run.agentType);
      row.runs += 1;
      // A skipped run is a correct "nothing to do" decision, not a failure —
      // exclude it from the success-rate denominator so it doesn't skew health.
      if (run.status === 'skipped') continue;
      const s = successByType.get(run.agentType) ?? { total: 0, ok: 0 };
      s.total += 1;
      if (run.status === 'completed') s.ok += 1;
      successByType.set(run.agentType, s);
    }

    const scoreByType = new Map<string, { sum: number; n: number }>();
    for (const r of reflections) {
      if (r.score == null) continue;
      const s = scoreByType.get(r.agentType) ?? { sum: 0, n: 0 };
      s.sum += r.score;
      s.n += 1;
      scoreByType.set(r.agentType, s);
    }

    const apprByType = new Map<
      string,
      { total: number; approved: number; rejected: number }
    >();
    for (const a of approvals) {
      const type = a.agentRun?.agentType ?? 'unknown';
      const s = apprByType.get(type) ?? { total: 0, approved: 0, rejected: 0 };
      s.total += 1;
      if (a.status === 'approved' || a.status === 'edited') s.approved += 1;
      if (a.status === 'rejected') s.rejected += 1;
      apprByType.set(type, s);
    }

    for (const row of byType.values()) {
      const sc = scoreByType.get(row.agentType);
      row.avgReflectionScore =
        sc && sc.n ? Number((sc.sum / sc.n).toFixed(2)) : 0;
      const su = successByType.get(row.agentType);
      row.successRate =
        su && su.total ? Number(((su.ok / su.total) * 100).toFixed(0)) : 0;
      const ap = apprByType.get(row.agentType);
      if (ap && ap.total) {
        row.approvalRate = Number(((ap.approved / ap.total) * 100).toFixed(0));
        row.rejectionRate = Number(((ap.rejected / ap.total) * 100).toFixed(0));
      }
    }

    return [...byType.values()].sort((a, b) => b.runs - a.runs);
  }
}
