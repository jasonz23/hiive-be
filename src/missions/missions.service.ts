import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalType, Mission, MissionStatus, Prisma } from '@prisma/client';
import { AgentOrchestratorService } from '../agents/agent-orchestrator.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMissionDto, UpdateMissionDto } from './dto/mission.dto';

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AgentOrchestratorService,
    private readonly approvals: ApprovalsService,
    private readonly campaigns: CampaignsService,
    private readonly knowledge: KnowledgeService,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateMissionDto): Promise<Mission> {
    return this.prisma.mission.create({
      data: {
        title: dto.title,
        objective: dto.objective,
        priority: dto.priority ?? 'medium',
        targetMetric: dto.targetMetric as Prisma.InputJsonValue,
        status: MissionStatus.created,
      },
    });
  }

  findAll() {
    return this.prisma.mission.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { campaigns: true, agentRuns: true } } },
    });
  }

  async findOne(id: string) {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        campaigns: true,
        agentRuns: {
          orderBy: { createdAt: 'asc' },
          include: { _count: { select: { steps: true } } },
        },
      },
    });
    if (!mission) throw new NotFoundException('Mission not found');
    return mission;
  }

  async update(id: string, dto: UpdateMissionDto): Promise<Mission> {
    await this.ensureExists(id);
    return this.prisma.mission.update({
      where: { id },
      data: {
        title: dto.title,
        objective: dto.objective,
        priority: dto.priority,
        status: dto.status,
        targetMetric: dto.targetMetric as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * The mission control loop: Planner decomposes the objective, then subagents
   * execute in sequence — strategy creates a campaign, content generates posts,
   * compliance + swarm de-risk them, and approval requests gate publishing.
   * Every sub-run is linked to the mission and visible on its timeline.
   */
  async run(id: string, audience?: string): Promise<unknown> {
    const mission = await this.ensureExists(id);
    await this.setStatus(id, MissionStatus.planning);

    // 1. Plan
    await this.orchestrator.runAgent(
      'PlannerAgent',
      { objective: mission.objective },
      { missionId: id },
    );

    // 2. Strategy → create a campaign linked to the mission
    await this.setStatus(id, MissionStatus.executing);
    const strategy = await this.orchestrator.runAgent(
      'CampaignStrategyAgent',
      {
        objective: mission.objective,
        audience: audience ?? 'Startup founders and early employees',
        name: mission.title,
        create: true,
        missionId: id,
      },
      { missionId: id },
    );
    const campaignId = (strategy?.output as { campaignId?: string } | undefined)
      ?.campaignId;

    if (campaignId) {
      await this.knowledge.link(
        { type: 'mission', refId: id, label: mission.title },
        { type: 'campaign', refId: campaignId, label: mission.title },
        'MISSION_SPAWNED_CAMPAIGN',
      );

      // 3. Content generation
      const content = await this.orchestrator.runAgent(
        'ContentGenerationAgent',
        { campaignId, count: 3 },
        { missionId: id, entityType: 'campaign', entityId: campaignId },
      );
      const posts =
        (content?.output as { posts?: { id: string }[] } | undefined)?.posts ??
        [];

      // 4. Compliance + 5. Swarm simulation on the first post
      if (posts[0]) {
        await this.orchestrator.runAgent(
          'ComplianceReviewAgent',
          { postId: posts[0].id },
          { missionId: id },
        );
        await this.orchestrator.runAgent(
          'SocialSimulationSwarmAgent',
          { postId: posts[0].id },
          { missionId: id },
        );
      }

      // 6. Gate publishing behind human approval
      await this.setStatus(id, MissionStatus.awaiting_approval);
      for (const post of posts) {
        const full = await this.prisma.post.findUnique({
          where: { id: post.id },
        });
        await this.approvals.create({
          type: ApprovalType.publish_post,
          entityType: 'post',
          entityId: post.id,
          title: `Publish post from mission "${mission.title}"`,
          proposedAction: { copy: full?.copy ?? '' },
        });
        await this.knowledge.link(
          { type: 'campaign', refId: campaignId, label: mission.title },
          {
            type: 'post',
            refId: post.id,
            label: `${full?.platform ?? 'post'}`,
          },
          'CAMPAIGN_CREATED_POST',
        );
      }
    }

    await this.audit.record({
      actor: 'PlannerAgent',
      action: 'mission.run',
      entity: 'Mission',
      entityId: id,
      metadata: { campaignId },
    });

    return this.findOne(id);
  }

  /** Mission goal progress: actual conversions across mission campaigns vs target. */
  async progress(id: string) {
    const mission = await this.findOne(id);
    const target = mission.targetMetric as {
      target?: number;
      baseline?: number;
      unit?: string;
    };
    let actual = 0;
    for (const campaign of mission.campaigns) {
      const a = await this.campaigns.actuals(campaign.id);
      actual += a.conversions;
    }
    const targetValue = typeof target.target === 'number' ? target.target : 0;
    const pct =
      targetValue > 0 ? Number(((actual / targetValue) * 100).toFixed(1)) : 0;
    return { actual, target: targetValue, unit: target.unit ?? 'leads', pct };
  }

  private async setStatus(id: string, status: MissionStatus): Promise<void> {
    await this.prisma.mission.update({ where: { id }, data: { status } });
  }

  private async ensureExists(id: string): Promise<Mission> {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException('Mission not found');
    return mission;
  }
}
