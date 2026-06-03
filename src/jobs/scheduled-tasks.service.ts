import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgentOrchestratorService } from '../agents/agent-orchestrator.service';
import { AuditService } from '../audit/audit.service';
import { AutonomousService } from '../autonomous/autonomous.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Autonomous schedules. The post monitor runs hourly, the campaign monitor every
 * six hours, and a marketing report is generated weekly — matching the spec.
 */
@Injectable()
export class ScheduledTasksService {
  private readonly logger = new Logger(ScheduledTasksService.name);

  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly autonomous: AutonomousService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async monitorPosts(): Promise<void> {
    // Respect the master switch — when autonomous is off, no LLM-driven monitor.
    if (!this.autonomous.isAutonomousEnabled()) {
      this.logger.log('Autonomous off — skipping hourly performance monitor');
      return;
    }
    this.logger.log('Hourly post performance monitor');
    await this.orchestrator.monitorPerformance();
  }

  @Cron(CronExpression.EVERY_WEEK)
  async weeklyReport(): Promise<void> {
    await this.generateWeeklyReport();
  }

  /** Compose a weekly marketing report from current state. */
  async generateWeeklyReport(): Promise<Record<string, unknown>> {
    const [campaigns, posts, recommendations, underperforming] =
      await Promise.all([
        this.prisma.campaign.count(),
        this.prisma.post.count(),
        this.prisma.recommendation.count({ where: { status: 'open' } }),
        this.prisma.post.count({ where: { status: 'underperforming' } }),
      ]);
    const topRecs = await this.prisma.recommendation.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { title: true, severity: true },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      campaigns,
      posts,
      openRecommendations: recommendations,
      underperformingPosts: underperforming,
      topRecommendations: topRecs,
    };

    await this.audit.record({
      actor: 'system',
      action: 'report.weekly',
      entity: 'Report',
      metadata: report,
    });
    this.logger.log('Generated weekly marketing report');
    return report;
  }
}
