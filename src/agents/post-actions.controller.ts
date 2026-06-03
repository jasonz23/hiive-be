import { Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PostsService } from '../posts/posts.service';
import { AgentOrchestratorService } from './agent-orchestrator.service';

/**
 * Agent-backed actions on a post. Lives in the agents module so it can use the
 * orchestrator without a circular dependency on PostsModule.
 */
@ApiTags('posts')
@Controller('posts')
export class PostActionsController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly posts: PostsService,
  ) {}

  @Post(':id/simulate')
  @ApiOperation({ summary: 'Run the social simulation swarm on a post' })
  @ApiResponse({
    status: 201,
    description: 'Swarm agent run with persona timeline',
  })
  simulate(@Param('id') id: string) {
    return this.orchestrator.runAgent(
      'SocialSimulationSwarmAgent',
      { postId: id },
      {
        entityType: 'post',
        entityId: id,
      },
    );
  }

  @Post(':id/analyze')
  @ApiOperation({ summary: 'Run the performance monitoring agent on a post' })
  analyze(@Param('id') id: string) {
    return this.orchestrator.runAgent(
      'PerformanceMonitoringAgent',
      { postId: id },
      {
        entityType: 'post',
        entityId: id,
      },
    );
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Human-approve a post (moves it to approved)' })
  approve(@Param('id') id: string) {
    return this.posts.approve(id);
  }
}
