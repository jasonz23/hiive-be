import { Injectable, NotFoundException } from '@nestjs/common';
import { AdCampaign, AdStatus, Prisma } from '@prisma/client';
import { deriveAdMetrics } from '../common/metrics/metrics';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdDto, UpdateAdDto } from './dto/ad.dto';

export type AdWithDerived = AdCampaign & {
  derived: ReturnType<typeof deriveAdMetrics>;
};

@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** AI optimization analysis across a campaign's ads (best channel, weak ads, budget). */
  async analyze(campaignId: string) {
    const ads = await this.findAll(campaignId);
    const bestChannel =
      [...ads].sort(
        (a, b) => b.derived.conversionRate - a.derived.conversionRate,
      )[0]?.platform ?? 'LinkedIn';

    const analysis = await this.llm.completeJson<Record<string, unknown>>(
      'Analyze ad performance and recommend optimizations.',
      {
        purpose: 'ads_analysis',
        context: {
          bestChannel,
          ads: ads.map((a) => ({
            name: a.name,
            platform: a.platform,
            ctr: a.derived.ctr,
            cpc: a.derived.cpc,
            cpa: a.derived.cpa,
          })),
        },
      },
    );

    for (const ad of ads) {
      await this.saveAnalysis(ad.id, analysis);
    }
    return { campaignId, ads, analysis };
  }

  async create(dto: CreateAdDto): Promise<AdWithDerived> {
    const ad = await this.prisma.adCampaign.create({
      data: {
        campaignId: dto.campaignId,
        name: dto.name ?? 'Untitled Ad',
        platform: dto.platform,
        budget: dto.budget,
        spend: dto.spend ?? 0,
        impressions: dto.impressions ?? 0,
        clicks: dto.clicks ?? 0,
        conversions: dto.conversions ?? 0,
        status: dto.status ?? AdStatus.active,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    return this.withDerived(ad);
  }

  async findAll(campaignId?: string): Promise<AdWithDerived[]> {
    const ads = await this.prisma.adCampaign.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { id: true, name: true } } },
    });
    return ads.map((ad) => this.withDerived(ad));
  }

  async findOne(id: string): Promise<AdWithDerived> {
    const ad = await this.prisma.adCampaign.findUnique({
      where: { id },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!ad) throw new NotFoundException('Ad not found');
    return this.withDerived(ad);
  }

  async update(id: string, dto: UpdateAdDto): Promise<AdWithDerived> {
    await this.ensureExists(id);
    const ad = await this.prisma.adCampaign.update({
      where: { id },
      data: {
        name: dto.name,
        platform: dto.platform,
        budget: dto.budget,
        spend: dto.spend,
        impressions: dto.impressions,
        clicks: dto.clicks,
        conversions: dto.conversions,
        status: dto.status,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
    return this.withDerived(ad);
  }

  async saveAnalysis(id: string, analysis: unknown): Promise<void> {
    await this.prisma.adCampaign.update({
      where: { id },
      data: { aiAnalysis: analysis as Prisma.InputJsonValue },
    });
  }

  withDerived<T extends AdCampaign>(
    ad: T,
  ): T & { derived: ReturnType<typeof deriveAdMetrics> } {
    return { ...ad, derived: deriveAdMetrics(ad) };
  }

  private async ensureExists(id: string): Promise<AdCampaign> {
    const ad = await this.prisma.adCampaign.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Ad not found');
    return ad;
  }
}
