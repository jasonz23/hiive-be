import { Injectable, NotFoundException } from '@nestjs/common';
import { AudienceComment } from '@prisma/client';
import {
  classifyAuthor,
  fitMatchesSegment,
} from '../common/audience/audience-fit';
import {
  CommentSegment,
  generateAudienceComments,
  Sentiment,
} from '../common/audience/audience-mock';
import { segmentOf } from '../common/segment';
import { MemoryIngestionService } from '../memory/memory-ingestion.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_OPEN = 8;

export interface AudienceSummary {
  positive: number;
  neutral: number;
  negative: number;
  topTheme: string;
}

@Injectable()
export class AudienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: MemoryIngestionService,
  ) {}

  /** Pull fresh (mock) audience comments for a post. Returns how many were added. */
  async pullComments(
    postId: string,
    skew: 'viral' | 'underperforming' | 'normal',
    count = 2,
  ): Promise<number> {
    const open = await this.prisma.audienceComment.count({
      where: { postId, status: 'open' },
    });
    if (open >= MAX_OPEN) return 0;
    const history = await this.prisma.audienceComment.count({
      where: { postId },
    });
    const segment = await this.segmentForPost(postId);
    const mock = generateAudienceComments(
      `${postId}:${history}`,
      count,
      skew,
      segment,
    );
    for (const c of mock) {
      await this.prisma.audienceComment.create({
        data: {
          postId,
          author: c.author,
          text: c.text,
          sentiment: c.sentiment,
          theme: c.theme,
        },
      });
    }
    return mock.length;
  }

  list(postId: string) {
    return this.prisma.audienceComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
    });
  }

  openComments(postId: string) {
    return this.prisma.audienceComment.findMany({
      where: { postId, status: 'open' },
      orderBy: { createdAt: 'desc' },
    });
  }

  counts(comments: AudienceComment[]): AudienceSummary {
    const tally: Record<Sentiment, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    const themes = new Map<string, number>();
    for (const c of comments) {
      tally[c.sentiment as Sentiment] =
        (tally[c.sentiment as Sentiment] ?? 0) + 1;
      if (c.theme) themes.set(c.theme, (themes.get(c.theme) ?? 0) + 1);
    }
    const topTheme =
      [...themes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general';
    return { ...tally, topTheme };
  }

  /** Human sends a reply to an audience comment (mock send) + records it in memory. */
  async reply(commentId: string, text: string): Promise<AudienceComment> {
    const comment = await this.prisma.audienceComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Audience comment not found');
    const updated = await this.prisma.audienceComment.update({
      where: { id: commentId },
      data: { status: 'replied', reply: text },
    });
    await this.ingestion.ingestText(
      `Human replied to a ${comment.sentiment} audience comment about "${comment.theme}" ("${comment.text}") with: "${text}".`,
      ['human_feedback', 'past_decisions'],
      { postId: comment.postId, theme: comment.theme },
      0.6,
    );
    return updated;
  }

  /** Audience comments (with prospect fit) + engagement summary + audience quality. */
  async getAudience(postId: string) {
    const raw = await this.list(postId);
    const segment = await this.segmentForPost(postId);
    // Annotate each comment with who it's from and how much they "fit the mold".
    const comments = raw.map((c) => {
      const prof = classifyAuthor(c.author);
      return {
        ...c,
        profile: prof.profile,
        fit: prof.fit,
        weight: prof.weight,
        onSegment: fitMatchesSegment(prof.fit, segment),
      };
    });
    const qualified = comments.filter((c) => c.onSegment);
    const quality = {
      segment,
      totalCount: comments.length,
      qualifiedCount: qualified.length,
      // Fit-weighted engagement: the right prospects matter more than raw volume.
      qualifiedScore: round(qualified.reduce((s, c) => s + c.weight, 0)),
      topProfiles: [...new Set(qualified.map((c) => c.profile))].slice(0, 4),
    };
    const run = await this.prisma.agentRun.findFirst({
      where: {
        agentType: 'EngagementAgent',
        entityId: postId,
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' },
      select: { output: true, createdAt: true },
    });
    return {
      comments,
      quality,
      summary: (run?.output as Record<string, unknown> | null) ?? null,
      summaryAt: run?.createdAt ?? null,
    };
  }

  private async segmentForPost(postId: string): Promise<CommentSegment> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        campaign: { select: { name: true, audience: true, objective: true } },
      },
    });
    return post ? segmentOf(post.campaign) : 'other';
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
