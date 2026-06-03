import { Module } from '@nestjs/common';
import { AdsModule } from '../ads/ads.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MemoryModule } from '../memory/memory.module';
import { PostsModule } from '../posts/posts.module';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentRunService } from './agent-run.service';
import { AgentSupportService } from './agent-support.service';
import { AgentsController } from './agents.controller';
import { PostActionsController } from './post-actions.controller';
import { PostMonitorListener } from './post-monitor.listener';
import { AdsOptimizationAgent } from './impl/ads.agent';
import { ComplianceReviewAgent } from './impl/compliance.agent';
import { ContentGenerationAgent } from './impl/content.agent';
import { EngagementAgent } from './impl/engagement.agent';
import { MarketingPerformanceAnalyzerAgent } from './impl/insights.agent';
import { MemoryRetrievalAgent } from './impl/memory-retrieval.agent';
import { PerformanceMonitoringAgent } from './impl/performance.agent';
import { PlannerAgent } from './impl/planner.agent';
import { ReplicationAgent } from './impl/replication.agent';
import { CampaignStrategyAgent } from './impl/strategy.agent';
import { SocialSimulationSwarmAgent } from './impl/simulation.agent';
import { ViralOpportunityAgent } from './impl/viral.agent';
import { ToolRegistryService } from './tools/tool-registry.service';

@Module({
  imports: [MemoryModule, CampaignsModule, PostsModule, AdsModule, IntegrationsModule],
  controllers: [AgentsController, PostActionsController],
  providers: [
    AgentRunService,
    AgentSupportService,
    AgentOrchestratorService,
    PostMonitorListener,
    ToolRegistryService,
    PlannerAgent,
    CampaignStrategyAgent,
    ContentGenerationAgent,
    ComplianceReviewAgent,
    SocialSimulationSwarmAgent,
    PerformanceMonitoringAgent,
    AdsOptimizationAgent,
    ViralOpportunityAgent,
    ReplicationAgent,
    MemoryRetrievalAgent,
    EngagementAgent,
    MarketingPerformanceAnalyzerAgent,
  ],
  exports: [
    AgentOrchestratorService,
    AgentRunService,
    ToolRegistryService,
    AgentSupportService,
  ],
})
export class AgentsModule {}
