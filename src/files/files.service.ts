import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileAsset } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { MemoryIngestionService } from '../memory/memory-ingestion.service';
import { MemoryService } from '../memory/memory.service';
import { extractText } from '../memory/text-extraction';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER } from '../storage/storage.types';
import type { StorageProvider } from '../storage/storage.types';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadOptions {
  tags: string[];
  importance?: number;
  locked?: boolean;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: MemoryIngestionService,
    private readonly memory: MemoryService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  /**
   * Persist a file's extracted text and ingest it into vector memory with an
   * importance tier + lock. After ingest, reconcile against existing memory so
   * newer information lowers the importance of superseded (non-locked) memory.
   */
  async upload(
    file: UploadedFile,
    options: UploadOptions,
  ): Promise<FileAsset & { chunkCount: number; reconciled: number }> {
    // Store the raw file (local disk in dev, GCS in prod) — only the URL is
    // persisted in the database, never the file bytes.
    const saved = await this.storage.save(file.buffer, {
      filename: file.originalname,
      mimeType: file.mimetype,
    });

    let text = '';
    let status = 'ready';
    try {
      text = await extractText(file.buffer, file.mimetype, file.originalname);
    } catch (error) {
      status = 'failed';
      this.logger.error(
        `Extraction failed for ${file.originalname}: ${String(error)}`,
      );
    }

    const asset = await this.prisma.fileAsset.create({
      data: {
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        url: saved.url,
        text,
        tags: options.tags,
        status,
        importance: clamp01(options.importance ?? 0.5),
        locked: options.locked ?? false,
      },
    });

    let chunkCount = 0;
    let reconciled = 0;
    if (status === 'ready' && text) {
      chunkCount = await this.ingestion.ingestFileAsset(asset);
      const adjustments = await this.memory.reconcileNewFile(asset.id);
      reconciled = adjustments.length;
      if (reconciled > 0) {
        await this.audit.record({
          actor: 'MemoryReconciler',
          action: 'memory.reconcile',
          entity: 'FileAsset',
          entityId: asset.id,
          metadata: { adjustments },
        });
      }
    }

    await this.audit.record({
      actor: 'user',
      action: 'file.upload',
      entity: 'FileAsset',
      entityId: asset.id,
      metadata: { fileName: asset.fileName, tags: options.tags, chunkCount },
    });

    return { ...asset, chunkCount, reconciled };
  }

  /** Update a document's importance / lock / markdown text, and re-index memory. */
  async updateMeta(
    id: string,
    patch: { importance?: number; locked?: boolean; text?: string },
  ): Promise<FileAsset> {
    await this.get(id);
    const data: { importance?: number; locked?: boolean; text?: string } = {};
    if (patch.importance != null) data.importance = clamp01(patch.importance);
    if (patch.locked != null) data.locked = patch.locked;
    if (patch.text != null) data.text = patch.text;

    const file = await this.prisma.fileAsset.update({ where: { id }, data });

    if (patch.text != null) {
      // Edited content → re-chunk + re-embed, then reconcile against memory.
      await this.ingestion.ingestFileAsset(file);
      await this.memory.reconcileNewFile(file.id);
    } else {
      // Tier/lock only → propagate to existing chunks.
      await this.prisma.memoryChunk.updateMany({
        where: { fileId: id },
        data: { importance: data.importance, locked: data.locked },
      });
    }

    await this.audit.record({
      actor: 'user',
      action: 'file.updateMeta',
      entity: 'FileAsset',
      entityId: id,
      metadata: { importance: patch.importance, locked: patch.locked, textEdited: patch.text != null },
    });
    return file;
  }

  async list(): Promise<Array<FileAsset & { chunkCount: number }>> {
    const files = await this.prisma.fileAsset.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } },
    });
    return files.map(({ _count, ...f }) => ({
      ...f,
      chunkCount: _count.chunks,
    }));
  }

  async get(id: string): Promise<FileAsset> {
    const file = await this.prisma.fileAsset.findUnique({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
