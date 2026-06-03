import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AdsModule } from './ads/ads.module';
import { AgentsModule } from './agents/agents.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AudienceModule } from './audience/audience.module';
import { AutonomousModule } from './autonomous/autonomous.module';
import { AuditModule } from './audit/audit.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ChatModule } from './chat/chat.module';
import { CommentsModule } from './comments/comments.module';
import configuration from './config/configuration';
import { FilesModule } from './files/files.module';
import { StorageModule } from './storage/storage.module';
import { HealthController } from './health/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsModule } from './jobs/jobs.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LearningModule } from './learning/learning.module';
import { LlmModule } from './llm/llm.module';
import { MemoryModule } from './memory/memory.module';
import { MissionsModule } from './missions/missions.module';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { ReflectionsModule } from './reflections/reflections.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel') ?? 'info',
          transport:
            config.get<string>('nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: false,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redisUrl') },
      }),
    }),
    PrismaModule,
    LlmModule,
    AuditModule,
    MemoryModule,
    StorageModule,
    FilesModule,
    CampaignsModule,
    PostsModule,
    AdsModule,
    RecommendationsModule,
    ReflectionsModule,
    LearningModule,
    ApprovalsModule,
    KnowledgeModule,
    CommentsModule,
    AudienceModule,
    AgentsModule,
    MissionsModule,
    ChatModule,
    JobsModule,
    AutonomousModule,
    IntegrationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
