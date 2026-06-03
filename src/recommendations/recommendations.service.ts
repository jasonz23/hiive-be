import { Injectable } from '@nestjs/common';
import { Recommendation, RecommendationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateRecommendationInput {
  agentRunId?: string;
  campaignId?: string;
  postId?: string;
  agentType: string;
  title: string;
  body: string;
  severity?: 'info' | 'warning' | 'critical' | 'opportunity';
  actions?: unknown;
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRecommendationInput): Promise<Recommendation> {
    return this.prisma.recommendation.create({
      data: {
        agentRunId: input.agentRunId,
        campaignId: input.campaignId,
        postId: input.postId,
        agentType: input.agentType,
        title: input.title,
        body: input.body,
        severity: input.severity ?? 'info',
        actions: input.actions ?? undefined,
      },
    });
  }

  list(
    filters: {
      campaignId?: string;
      postId?: string;
      status?: RecommendationStatus;
    } = {},
  ) {
    return this.prisma.recommendation.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      include: {
        campaign: { select: { id: true, name: true } },
        post: { select: { id: true, platform: true } },
      },
    });
  }

  updateStatus(
    id: string,
    status: RecommendationStatus,
  ): Promise<Recommendation> {
    return this.prisma.recommendation.update({
      where: { id },
      data: { status },
    });
  }
}
