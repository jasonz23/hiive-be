import { Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import {
  buildStorageKey,
  SaveOptions,
  SavedFile,
  StorageProvider,
} from '../storage.types';

/**
 * Google Cloud Storage for production. On Cloud Run the service account
 * credentials are provided automatically (Application Default Credentials), so
 * no key file is needed — `new Storage()` just works. Uploads the object and
 * returns its URL; only the URL is stored in the database.
 */
export class GcsStorageProvider implements StorageProvider {
  readonly name = 'gcs' as const;
  private readonly logger = new Logger(GcsStorageProvider.name);
  private readonly storage = new Storage(); // ADC on Cloud Run

  constructor(private readonly bucketName: string) {
    if (!bucketName) {
      throw new Error('GCS storage selected but GCS_BUCKET_NAME is not set');
    }
  }

  async save(buffer: Buffer, options: SaveOptions): Promise<SavedFile> {
    const key = buildStorageKey(options.filename);
    const file = this.storage.bucket(this.bucketName).file(key);
    await file.save(buffer, {
      contentType: options.mimeType,
      resumable: false,
      metadata: { cacheControl: 'private, max-age=0' },
    });
    // Canonical object URL. For a private bucket, swap this for a signed URL via
    // `file.getSignedUrl({ action: 'read', expires })` (Cloud Run's SA can sign).
    const url = `https://storage.googleapis.com/${this.bucketName}/${encodeURIComponent(key)}`;
    this.logger.log(`Uploaded ${key} to gs://${this.bucketName}`);
    return { key, url };
  }
}
