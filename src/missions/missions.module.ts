import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  imports: [AgentsModule, CampaignsModule],
  controllers: [MissionsController],
  providers: [MissionsService],
  exports: [MissionsService],
})
export class MissionsModule {}
