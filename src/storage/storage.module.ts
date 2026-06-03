import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GcsStorageProvider } from './providers/gcs-storage.provider';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';

/**
 * Selects the storage backend from config: local disk in development, Google
 * Cloud Storage in production. Mirrors the LlmModule provider-factory pattern.
 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageProvider => {
        const logger = new Logger('StorageModule');
        const provider = config.get<string>('storageProvider');
        if (provider === 'gcs') {
          logger.log(
            `File storage: Google Cloud Storage (bucket ${config.get('gcsBucket')})`,
          );
          return new GcsStorageProvider(config.get<string>('gcsBucket') ?? '');
        }
        const dir = config.get<string>('storageLocalDir') ?? 'uploads';
        logger.log(`File storage: local disk (${dir})`);
        return new LocalStorageProvider(
          dir,
          config.get<string>('backendOrigin') ?? '',
        );
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
