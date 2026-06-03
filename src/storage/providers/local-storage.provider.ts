import { Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import {
  buildStorageKey,
  SaveOptions,
  SavedFile,
  StorageProvider,
} from '../storage.types';

const EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.csv': 'text/csv',
  '.json': 'application/json',
};

/**
 * Local-disk storage for development. Writes the file under `dir` and returns a
 * URL served by the backend (`GET /api/files/raw/:key`). Only the URL is stored
 * in the database.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  private readonly logger = new Logger(LocalStorageProvider.name);

  constructor(
    private readonly dir: string,
    private readonly backendOrigin: string,
  ) {}

  async save(buffer: Buffer, options: SaveOptions): Promise<SavedFile> {
    const key = buildStorageKey(options.filename);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), buffer);
    const url = `${this.backendOrigin.replace(/\/$/, '')}/api/files/raw/${encodeURIComponent(key)}`;
    this.logger.log(`Stored ${key} on local disk (${buffer.length} bytes)`);
    return { key, url };
  }

  async read(
    key: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    // Guard against path traversal — keys are flat (no separators).
    if (!key || key.includes('/') || key.includes('\\') || key.includes('..')) {
      return null;
    }
    try {
      const buffer = await readFile(join(this.dir, key));
      const contentType =
        EXT_MIME[extname(key).toLowerCase()] ?? 'application/octet-stream';
      return { buffer, contentType };
    } catch {
      return null;
    }
  }
}
