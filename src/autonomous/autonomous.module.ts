import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { PostsModule } from '../posts/posts.module';
import { AutonomousController } from './autonomous.controller';
import { AutonomousService } from './autonomous.service';

@Module({
  imports: [AgentsModule, PostsModule],
  controllers: [AutonomousController],
  providers: [AutonomousService],
  exports: [AutonomousService],
})
export class AutonomousModule {}
