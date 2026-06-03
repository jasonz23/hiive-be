import { Global, Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { MemoryModule } from '../memory/memory.module';
import { PostsModule } from '../posts/posts.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Global()
@Module({
  imports: [CampaignsModule, PostsModule, MemoryModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
