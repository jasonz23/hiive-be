import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [MemoryModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
