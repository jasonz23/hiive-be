import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Post, PostStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  computeCtr,
  EMPTY_POST_METRICS,
  growMetrics,
  PostMetrics,
} from '../common/metrics/metrics';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto, UpdateMetricsDto, UpdatePostDto } from './dto/post.dto';

export interface MetricSnapshot {
  capturedAt: string;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
}

export interface CampaignBenchmark {
  peerCount: number;
  medianCtr: number;
  avgCtr: number;
  avgImpressions: number;
  topCtr: number;
}

/** Emitted (awaited) when a post's metrics change so monitoring runs inline. */
export const POST_METRICS_REFRESHED = 'post.metrics.refreshed';

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  create(dto: CreatePostDto): Promise<Post> {
    return this.prisma.post.create({
      data: {
        campaignId: dto.campaignId,
        platform: dto.platform,
        copy: dto.copy,
        mediaUrl: dto.mediaUrl,
        status: dto.status ?? PostStatus.draft,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        metrics: { ...EMPTY_POST_METRICS },
      },
    });
  }

  findAll(filters: { campaignId?: string; status?: PostStatus } = {}) {
    return this.prisma.post.findMany({
      where: { campaignId: filters.campaignId, status: filters.status },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      include: { campaign: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        campaign: {
          select: { id: true, name: true, goals: true, budget: true },
        },
        recommendations: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async update(id: string, dto: UpdatePostDto): Promise<Post> {
    await this.ensureExists(id);
    return this.prisma.post.update({
      where: { id },
      data: {
        platform: dto.platform,
        copy: dto.copy,
        mediaUrl: dto.mediaUrl,
        status: dto.status,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
    });
  }

  /** Manual metrics entry. CTR is always recomputed; a history snapshot is kept. */
  async setMetrics(id: string, dto: UpdateMetricsDto): Promise<Post> {
    const post = await this.ensureExists(id);
    const current = this.metricsOf(post);
    const merged: PostMetrics = { ...current, ...dto.metrics };
    merged.ctr = computeCtr(merged.clicks, merged.impressions);

    return this.prisma.post.update({
      where: { id },
      data: {
        metrics: merged as unknown as Prisma.InputJsonValue,
        metricsHistory: this.appendHistory(
          post,
          merged,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Simulates a social-platform "Refresh". Metrics may only INCREASE, the new
   * values + a history snapshot persist, and the Performance Monitoring agent is
   * run inline (awaited) so the comparative comment/edit/addition loop fires
   * within the user's cycle.
   */
  async refreshMetrics(
    id: string,
  ): Promise<{ post: Post; previous: PostMetrics }> {
    const post = await this.ensureExists(id);
    const previous = this.metricsOf(post);
    const next = growMetrics(
      previous,
      `${post.id}:${this.historyOf(post).length}`,
    );

    await this.prisma.post.update({
      where: { id },
      data: {
        metrics: next as unknown as Prisma.InputJsonValue,
        metricsHistory: this.appendHistory(
          post,
          next,
        ) as unknown as Prisma.InputJsonValue,
        status:
          post.status === PostStatus.draft ||
          post.status === PostStatus.review ||
          post.status === PostStatus.scheduled
            ? post.status
            : PostStatus.analyzing,
        publishedAt: post.publishedAt ?? new Date(),
      },
    });

    await this.audit.record({
      actor: 'user',
      action: 'post.metrics.refresh',
      entity: 'Post',
      entityId: id,
      metadata: { previous, next },
    });

    // Run the comparative monitoring loop inline (listener lives in AgentsModule).
    await this.events.emitAsync(POST_METRICS_REFRESHED, { postId: id });

    const updated = await this.findOne(id);
    return { post: updated, previous };
  }

  async setStatus(id: string, status: PostStatus): Promise<Post> {
    await this.ensureExists(id);
    return this.prisma.post.update({ where: { id }, data: { status } });
  }

  /** Human approves a draft/reviewed post to move it forward. */
  async approve(id: string): Promise<Post> {
    await this.ensureExists(id);
    const post = await this.prisma.post.update({
      where: { id },
      data: { status: PostStatus.approved, approvalStatus: 'approved' },
    });
    await this.audit.record({
      actor: 'user',
      action: 'post.approve',
      entity: 'Post',
      entityId: id,
    });
    return post;
  }

  /**
   * Publish a post — simulates it going live on the platform. From here the
   * autonomous metric-checker pulls (mock) analytics on a cron and runs the agent
   * loops; no manual simulate/refresh/analyze. (Real platform APIs will later
   * replace the mock metric pull.)
   */
  async publish(id: string): Promise<Post> {
    const existing = await this.ensureExists(id);
    const post = await this.prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.published,
        approvalStatus: 'approved',
        publishedAt: existing.publishedAt ?? new Date(),
      },
    });
    await this.audit.record({
      actor: 'user',
      action: 'post.publish',
      entity: 'Post',
      entityId: id,
    });
    return post;
  }

  async saveSimulation(id: string, simulation: unknown): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data: { simulation: simulation as Prisma.InputJsonValue },
    });
  }

  async saveAnalysis(id: string, analysis: unknown): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data: { aiAnalysis: analysis as Prisma.InputJsonValue },
    });
  }

  metricsOf(post: Post): PostMetrics {
    return {
      ...EMPTY_POST_METRICS,
      ...((post.metrics ?? {}) as Partial<PostMetrics>),
    };
  }

  historyOf(post: Post): MetricSnapshot[] {
    return Array.isArray(post.metricsHistory)
      ? (post.metricsHistory as unknown as MetricSnapshot[])
      : [];
  }

  /** Hours since the post went live (publishedAt → scheduledAt → createdAt). */
  ageHours(post: Post): number {
    const start = post.publishedAt ?? post.scheduledAt ?? post.createdAt;
    return Math.max(0, (Date.now() - new Date(start).getTime()) / 3_600_000);
  }

  /** Peer benchmark across other posts in the same campaign that have traction. */
  async campaignBenchmarks(
    campaignId: string,
    excludePostId?: string,
  ): Promise<CampaignBenchmark> {
    const peers = await this.prisma.post.findMany({
      where: {
        campaignId,
        id: excludePostId ? { not: excludePostId } : undefined,
      },
      select: { metrics: true },
    });
    const ctrs: number[] = [];
    const impressionsList: number[] = [];
    for (const p of peers) {
      const m = (p.metrics ?? {}) as Partial<PostMetrics>;
      if ((m.impressions ?? 0) > 0) {
        ctrs.push(m.ctr ?? 0);
        impressionsList.push(m.impressions ?? 0);
      }
    }
    if (ctrs.length === 0) {
      return {
        peerCount: 0,
        medianCtr: 0,
        avgCtr: 0,
        avgImpressions: 0,
        topCtr: 0,
      };
    }
    const sorted = [...ctrs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const avg = ctrs.reduce((s, c) => s + c, 0) / ctrs.length;
    const avgImpr =
      impressionsList.reduce((s, c) => s + c, 0) / impressionsList.length;
    return {
      peerCount: ctrs.length,
      medianCtr: Number(median.toFixed(2)),
      avgCtr: Number(avg.toFixed(2)),
      avgImpressions: Math.round(avgImpr),
      topCtr: Number(Math.max(...ctrs).toFixed(2)),
    };
  }

  private appendHistory(post: Post, metrics: PostMetrics): MetricSnapshot[] {
    const history = this.historyOf(post);
    history.push({
      capturedAt: new Date().toISOString(),
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      ctr: metrics.ctr,
      conversions: metrics.conversions,
    });
    return history.slice(-30);
  }

  private async ensureExists(id: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }
}
