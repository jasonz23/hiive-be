import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

@ApiTags('comments')
@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List comments + agent suggestions on a post' })
  list(@Param('postId') postId: string) {
    return this.comments.list(postId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a human comment or suggestion to a post' })
  create(@Param('postId') postId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(postId, {
      authorKind: 'human',
      author: 'You',
      type: dto.type,
      body: dto.body,
      quotedText: dto.quotedText,
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      suggestedText: dto.suggestedText,
    });
  }

  @Post(':commentId/accept')
  @ApiOperation({
    summary: 'Accept a suggestion (applies the edit + records learning)',
  })
  accept(
    @Param('postId') _postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.accept(commentId);
  }

  @Post(':commentId/choose')
  @ApiOperation({
    summary: 'Pick one of a suggestion’s options — the agent applies it',
  })
  choose(
    @Param('postId') _postId: string,
    @Param('commentId') commentId: string,
    @Body('optionId') optionId: string,
  ) {
    return this.comments.choose(commentId, optionId);
  }

  @Post(':commentId/reject')
  @ApiOperation({ summary: 'Reject a suggestion (records learning)' })
  reject(
    @Param('postId') _postId: string,
    @Param('commentId') commentId: string,
    @Body('feedback') feedback?: string,
  ) {
    return this.comments.reject(commentId, feedback);
  }

  @Post(':commentId/resolve')
  @ApiOperation({ summary: 'Resolve a comment thread' })
  resolve(
    @Param('postId') _postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.resolve(commentId);
  }
}

@ApiTags('posts')
@Controller('posts')
export class PostCopyEditController {
  constructor(private readonly comments: CommentsService) {}

  @Post(':id/copy-edit')
  @ApiOperation({
    summary:
      'Human copy edit — edits a draft in place, or (if the post is live) saves ' +
      'it to the memory bank and spins a new draft variant instead of mutating it',
  })
  copyEdit(@Param('id') id: string, @Body('copy') copy: string) {
    return this.comments.recordCopyEdit(id, copy);
  }
}
