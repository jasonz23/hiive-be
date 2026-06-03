import { Injectable } from '@nestjs/common';
import { EmbeddingsService } from '../llm/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { importanceTier, recencyScore, retrievalScore } from './memory-scoring';

export interface MemorySearchOptions {
  tags?: string[];
  memoryType?: string;
  limit?: number;
}

export interface MemorySearchHit {
  id: string;
  content: string;
  tags: string[];
  memoryType: string;
  fileId: string | null;
  importance: number;
  locked: boolean;
  tier: string;
  createdAt: string;
  relevance: number;
  recency: number;
  score: number;
}

interface RawHit {
  id: string;
  content: string;
  tags: string[];
  memoryType: string;
  fileId: string | null;
  importance: number;
  locked: boolean;
  createdAt: Date;
  relevance: number;
}

/**
 * Semantic retrieval over MemoryChunks using pgvector cosine distance.
 * This is the R in RAG — every agent grounds its output in these results.
 */
@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async search(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<MemorySearchHit[]> {
    const limit = Math.min(Math.max(options.limit ?? 6, 1), 50);
    const vector = await this.embeddings.embedOne(query);
    const literal = this.embeddings.toVectorLiteral(vector);

    const params: unknown[] = [literal];
    let where = `embedding IS NOT NULL`;

    if (options.tags?.length) {
      const placeholders = options.tags.map(
        (_, i) => `$${params.length + i + 1}`,
      );
      where += ` AND tags && ARRAY[${placeholders.join(',')}]::text[]`;
      params.push(...options.tags);
    }
    if (options.memoryType) {
      where += ` AND "memoryType" = $${params.length + 1}::"MemoryType"`;
      params.push(options.memoryType);
    }

    // Pull a wider candidate set by pure relevance, then re-rank by the human-like
    // blend of relevance × importance × recency.
    const candidateK = Math.min(Math.max(limit * 5, 24), 100);
    const sql = `
      SELECT id, content, tags, "memoryType", "fileId", importance, locked, "createdAt",
             1 - (embedding <=> $1::vector) AS relevance
      FROM "MemoryChunk"
      WHERE ${where}
      ORDER BY embedding <=> $1::vector
      LIMIT ${candidateK}
    `;

    const rows = await this.prisma.$queryRawUnsafe<RawHit[]>(sql, ...params);
    return rows
      .map((r) => {
        const relevance = Number(r.relevance);
        const importance = Number(r.importance);
        const recency = recencyScore(r.createdAt, importance);
        return {
          id: r.id,
          content: r.content,
          tags: r.tags,
          memoryType: r.memoryType,
          fileId: r.fileId,
          importance: Number(importance.toFixed(2)),
          locked: r.locked,
          tier: importanceTier(importance),
          createdAt: new Date(r.createdAt).toISOString(),
          relevance: Number(relevance.toFixed(4)),
          recency,
          score: retrievalScore(relevance, importance, recency),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Compact, prompt-ready context string from a search. Used by agents. */
  async retrieveContext(
    query: string,
    options: MemorySearchOptions = {},
  ): Promise<string> {
    const hits = await this.search(query, options);
    if (hits.length === 0) return 'No relevant memory found.';
    return hits
      .map(
        (h, i) =>
          `[${i + 1}] (${h.tier}-importance ${h.memoryType}, ${h.tags.join('/')}) ${h.content}`,
      )
      .join('\n\n');
  }

  /**
   * Memory evolution: when a new document arrives, find highly-similar OLDER,
   * non-locked memory and lower its importance — newer information supersedes
   * older. Locked memory is never touched. Returns the adjustments made.
   */
  async reconcileNewFile(
    fileId: string,
  ): Promise<{ chunkId: string; from: number; to: number; reason: string }[]> {
    const newChunks = await this.prisma.memoryChunk.findMany({
      where: { fileId },
      select: { id: true, content: true },
    });
    const adjustments: {
      chunkId: string;
      from: number;
      to: number;
      reason: string;
    }[] = [];
    const seen = new Set<string>();

    for (const chunk of newChunks) {
      const vector = await this.embeddings.embedOne(chunk.content);
      const literal = this.embeddings.toVectorLiteral(vector);
      const similar = await this.prisma.$queryRawUnsafe<
        { id: string; importance: number; relevance: number }[]
      >(
        `SELECT id, importance, 1 - (embedding <=> $1::vector) AS relevance
         FROM "MemoryChunk"
         WHERE embedding IS NOT NULL AND locked = false
           AND "fileId" IS DISTINCT FROM $2
           AND 1 - (embedding <=> $1::vector) > 0.5
         ORDER BY embedding <=> $1::vector LIMIT 3`,
        literal,
        fileId,
      );

      for (const old of similar) {
        if (seen.has(old.id)) continue;
        seen.add(old.id);
        const from = Number(old.importance);
        const to = Number(Math.max(0.1, from * 0.75).toFixed(2));
        if (to < from - 0.001) {
          await this.prisma.memoryChunk.update({
            where: { id: old.id },
            data: {
              importance: to,
              supersededCount: { increment: 1 },
              lastReviewedAt: new Date(),
            },
          });
          adjustments.push({
            chunkId: old.id,
            from: Number(from.toFixed(2)),
            to,
            reason: `Superseded by newer, similar memory (relevance ${Number(old.relevance).toFixed(2)})`,
          });
        }
      }
    }
    return adjustments;
  }

  async stats(): Promise<{
    totalChunks: number;
    byType: Record<string, number>;
  }> {
    const grouped = await this.prisma.memoryChunk.groupBy({
      by: ['memoryType'],
      _count: { _all: true },
    });
    const byType: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byType[g.memoryType] = g._count._all;
      total += g._count._all;
    }
    return { totalChunks: total, byType };
  }

  /**
   * Recent memory changes over time — what the agents have learned/ingested,
   * newest first, with importance + type so the UI can show the timeline and how
   * memory is evolving (insights appearing, importance, supersedes).
   */
  async timeline(limit = 60): Promise<
    Array<{
      id: string;
      preview: string;
      memoryType: string;
      tags: string[];
      importance: number;
      supersededCount: number;
      locked: boolean;
      fromFile: boolean;
      createdAt: Date;
    }>
  > {
    const rows = await this.prisma.memoryChunk.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        memoryType: true,
        tags: true,
        importance: true,
        supersededCount: true,
        locked: true,
        fileId: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      preview:
        r.content.length > 240 ? `${r.content.slice(0, 240)}…` : r.content,
      memoryType: r.memoryType,
      tags: r.tags,
      importance: r.importance,
      supersededCount: r.supersededCount,
      locked: r.locked,
      fromFile: r.fileId != null,
      createdAt: r.createdAt,
    }));
  }
}
