import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { AudienceController } from './audience.controller';
import { AudienceService } from './audience.service';

@Global()
@Module({
  imports: [MemoryModule],
  controllers: [AudienceController],
  providers: [AudienceService],
  exports: [AudienceService],
})
export class AudienceModule {}
