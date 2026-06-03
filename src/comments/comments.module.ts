import { Global, Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { PostsModule } from '../posts/posts.module';
import {
  CommentsController,
  PostCopyEditController,
} from './comments.controller';
import { CommentsService } from './comments.service';

@Global()
@Module({
  imports: [PostsModule, MemoryModule],
  controllers: [CommentsController, PostCopyEditController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
