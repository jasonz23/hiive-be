import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AudienceService } from './audience.service';

@ApiTags('audience')
@Controller('posts/:postId/audience')
export class AudienceController {
  constructor(private readonly audience: AudienceService) {}

  @Get()
  @ApiOperation({
    summary: 'Audience comments + the engagement agent’s latest summary',
  })
  get(@Param('postId') postId: string) {
    return this.audience.getAudience(postId);
  }

  @Post(':commentId/reply')
  @ApiOperation({
    summary: 'Send a reply to an audience comment (mock) + record it in memory',
  })
  reply(
    @Param('postId') _postId: string,
    @Param('commentId') commentId: string,
    @Body('text') text: string,
  ) {
    return this.audience.reply(commentId, text);
  }
}
