import { randomBytes } from 'node:crypto';

/**
 * File storage abstraction. The raw file lives in storage (local disk in dev,
 * Google Cloud Storage in prod); only the resulting URL is persisted in the DB.
 */
export interface SaveOptions {
  filename: string;
  mimeType: string;
}

export interface SavedFile {
  /** Storage key / object path. */
  key: string;
  /** Public link to the stored file (what gets saved in the database). */
  url: string;
}

export interface StorageProvider {
  readonly name: 'local' | 'gcs';
  save(buffer: Buffer, options: SaveOptions): Promise<SavedFile>;
  /**
   * Read a stored object back (local dev only — in prod the URL points straight
   * at GCS). Returns null if the object isn't found or isn't locally served.
   */
  read?(key: string): Promise<{ buffer: Buffer; contentType: string } | null>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/** Stable, filesystem/object-safe key for an upload. */
export function buildStorageKey(filename: string): string {
  const safe = (filename || 'file')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-80);
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}-${safe}`;
}
