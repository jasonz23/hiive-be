import { Injectable, Logger } from '@nestjs/common';
import { FileAsset, Prisma } from '@prisma/client';
import { chunkText } from '../common/text/chunk';
import { EmbeddingsService } from '../llm/embeddings.service';
import { PrismaService } from '../prisma/prisma.service';
import { memoryTypeForTags } from './text-extraction';

/**
 * Turns a FileAsset's extracted text into retrievable, embedded MemoryChunks.
 * Embeddings are written with a raw UPDATE because pgvector columns are an
 * Unsupported type in Prisma's typed client.
 */
@Injectable()
export class MemoryIngestionService {
  private readonly logger = new Logger(MemoryIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  async ingestFileAsset(file: FileAsset): Promise<number> {
    if (!file.text) {
      this.logger.warn(
        `File ${file.id} has no extracted text; skipping ingest`,
      );
      return 0;
    }

    // Clear any prior chunks so re-ingest is idempotent.
    await this.prisma.memoryChunk.deleteMany({ where: { fileId: file.id } });

    const chunks = chunkText(file.text, { maxTokens: 400, overlap: 50 });
    if (chunks.length === 0) return 0;

    const memoryType = memoryTypeForTags(file.tags);
    const vectors = await this.embeddings.embed(chunks.map((c) => c.content));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const row = await this.prisma.memoryChunk.create({
        data: {
          fileId: file.id,
          content: chunk.content,
          memoryType,
          tags: file.tags,
          tokenCount: chunk.tokenCount,
          chunkIndex: chunk.index,
          importance: file.importance,
          locked: file.locked,
        },
      });
      await this.prisma.$executeRawUnsafe(
        `UPDATE "MemoryChunk" SET embedding = $1::vector WHERE id = $2`,
        this.embeddings.toVectorLiteral(vectors[i]),
        row.id,
      );
    }

    this.logger.log(
      `Ingested ${chunks.length} chunks for file ${file.id} (${memoryType})`,
    );
    return chunks.length;
  }

  /** Embed an ad-hoc piece of text (e.g. seed memory, human decisions) without a file. */
  async ingestText(
    content: string,
    tags: string[],
    metadata?: Record<string, unknown>,
    importance = 0.5,
  ): Promise<number> {
    const chunks = chunkText(content, { maxTokens: 400, overlap: 50 });
    const memoryType = memoryTypeForTags(tags);
    const vectors = await this.embeddings.embed(chunks.map((c) => c.content));

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const row = await this.prisma.memoryChunk.create({
        data: {
          content: chunk.content,
          memoryType,
          tags,
          tokenCount: chunk.tokenCount,
          chunkIndex: chunk.index,
          importance,
          metadata: (metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
      await this.prisma.$executeRawUnsafe(
        `UPDATE "MemoryChunk" SET embedding = $1::vector WHERE id = $2`,
        this.embeddings.toVectorLiteral(vectors[i]),
        row.id,
      );
    }
    return chunks.length;
  }
}
