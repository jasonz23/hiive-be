import { Module } from '@nestjs/common';
import { MemoryController } from './memory.controller';
import { MemoryIngestionService } from './memory-ingestion.service';
import { MemoryService } from './memory.service';

@Module({
  controllers: [MemoryController],
  providers: [MemoryService, MemoryIngestionService],
  exports: [MemoryService, MemoryIngestionService],
})
export class MemoryModule {}
