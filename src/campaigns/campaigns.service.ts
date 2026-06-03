import { Injectable, NotFoundException } from '@nestjs/common';
import { Campaign, CampaignHealth, CampaignStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { computeGoalProgress, GoalProgress } from '../common/metrics/metrics';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

export interface CampaignActuals {
  impressions: number;
  clicks: number;
  conversions: number;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly llm: LlmService,
  ) {}

  async create(dto: CreateCampaignDto): Promise<Campaign> {
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        objective: dto.objective,
        audience: dto.audience,
        channels: dto.channels ?? [],
        budget: dto.budget ?? 0,
        goals: dto.goals,
        status: dto.status ?? CampaignStatus.draft,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        missionId: dto.missionId,
      },
    });
    await this.audit.record({
      actor: 'user',
      action: 'campaign.create',
      entity: 'Campaign',
      entityId: campaign.id,
      metadata: { name: campaign.name },
    });
    return campaign;
  }

  findAll(filters: { status?: CampaignStatus; health?: CampaignHealth } = {}) {
    return this.prisma.campaign.findMany({
      where: { status: filters.status, health: filters.health },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { posts: true, ads: true } } },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        posts: { orderBy: { createdAt: 'desc' } },
        ads: true,
        recommendations: {
          where: { status: 'open' },
          orderBy: { createdAt: 'desc' },
        },
        mission: true,
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto): Promise<Campaign> {
    await this.ensureExists(id);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        objective: dto.objective,
        audience: dto.audience,
        channels: dto.channels,
        budget: dto.budget,
        goals: dto.goals,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    await this.audit.record({
      actor: 'user',
      action: 'campaign.update',
      entity: 'Campaign',
      entityId: id,
    });
    return campaign;
  }

  /** Aggregate published-post + ad actuals for a campaign. */
  async actuals(id: string): Promise<CampaignActuals> {
    const posts = await this.prisma.post.findMany({
      where: { campaignId: id },
      select: { metrics: true },
    });
    const ads = await this.prisma.adCampaign.findMany({
      where: { campaignId: id },
      select: { impressions: true, clicks: true, conversions: true },
    });

    const totals: CampaignActuals = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    for (const post of posts) {
      const m = (post.metrics ?? {}) as Record<string, number>;
      totals.impressions += m.impressions ?? 0;
      totals.clicks += m.clicks ?? 0;
      totals.conversions += m.conversions ?? 0;
    }
    for (const ad of ads) {
      totals.impressions += ad.impressions;
      totals.clicks += ad.clicks;
      totals.conversions += ad.conversions;
    }
    return totals;
  }

  async goalProgress(
    id: string,
  ): Promise<GoalProgress & { actuals: CampaignActuals }> {
    const campaign = await this.ensureExists(id);
    const actuals = await this.actuals(id);
    const progress = computeGoalProgress(
      (campaign.goals ?? {}) as Record<string, number>,
      actuals,
    );
    return { ...progress, actuals };
  }

  /** Recompute and persist campaign health from current actuals. */
  async recomputeHealth(id: string): Promise<CampaignHealth> {
    const { health } = await this.goalProgress(id);
    await this.prisma.campaign.update({ where: { id }, data: { health } });
    return health;
  }

  /** Rich summary used by the campaign detail page: progress + AI narrative. */
  async summary(id: string) {
    const campaign = await this.findOne(id);
    const progress = await this.goalProgress(id);

    const narrative = await this.llm.completeJson<{
      summary: string;
      highlights: string[];
      risks: string[];
      nextActions: string[];
    }>('Summarize this campaign for the marketing team.', {
      purpose: 'campaign_summary',
      context: {
        campaignName: campaign.name,
        audience: campaign.audience,
        channels: campaign.channels.join(', '),
        overallPct: progress.overallPct,
      },
    });

    return {
      campaign,
      progress,
      postCount: campaign.posts.length,
      adCount: campaign.ads.length,
      openRecommendations: campaign.recommendations,
      ai: narrative,
    };
  }

  private async ensureExists(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }
}
