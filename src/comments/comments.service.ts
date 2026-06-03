import { Injectable, NotFoundException } from '@nestjs/common';
import { PostComment, PostStatus } from '@prisma/client';
import { LearningService } from '../learning/learning.service';
import { MemoryIngestionService } from '../memory/memory-ingestion.service';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';

// Once a post is live, editing its copy in place is pointless — the value of
// feedback is in LEARNING. So accepted improvements on a live post are written
// to the memory bank and spun into a fresh draft variant instead.
const LIVE_STATUSES: string[] = [
  PostStatus.published,
  PostStatus.analyzing,
  PostStatus.underperforming,
  PostStatus.completed,
];

export interface SuggestionOption {
  id: string;
  label: string;
  text: string;
}

export interface CreateCommentInput {
  authorKind: 'human' | 'agent';
  author: string;
  type: 'comment' | 'suggestion';
  body: string;
  quotedText?: string;
  rangeStart?: number;
  rangeEnd?: number;
  suggestedText?: string;
  options?: SuggestionOption[];
  agentRunId?: string;
}

/**
 * Notion-style comments + agent suggestions on a post's copy. A suggestion can
 * be a single replacement (accept/reject) OR carry multiple OPTIONS the human
 * picks from (choose). Every human decision feeds the learning loop AND is
 * written to episodic memory so agents can semantically reference it later.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly learning: LearningService,
    private readonly ingestion: MemoryIngestionService,
  ) {}

  list(postId: string) {
    return this.prisma.postComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(postId: string, input: CreateCommentInput): Promise<PostComment> {
    return this.prisma.postComment.create({
      data: {
        postId,
        authorKind: input.authorKind,
        author: input.author,
        type: input.type,
        body: input.body,
        quotedText: input.quotedText,
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        suggestedText: input.suggestedText,
        options: input.options ? (input.options as object) : undefined,
        agentRunId: input.agentRunId,
      },
    });
  }

  /** Accept a single-option suggestion → apply the replacement to the copy. */
  async accept(id: string): Promise<PostComment> {
    const comment = await this.get(id);
    if (comment.type === 'suggestion' && comment.suggestedText) {
      await this.applyAndLearn(comment, comment.suggestedText, 'accepted');
    }
    return this.prisma.postComment.update({
      where: { id },
      data: { status: 'accepted' },
    });
  }

  /** Pick one of several options → apply it. The agent "implements" the choice. */
  async choose(id: string, optionId: string): Promise<PostComment> {
    const comment = await this.get(id);
    const options = this.optionsOf(comment);
    const chosen = options.find((o) => o.id === optionId) ?? options[0];
    if (!chosen) throw new NotFoundException('Option not found');
    await this.applyAndLearn(comment, chosen.text, 'chose', chosen.label);
    return this.prisma.postComment.update({
      where: { id },
      data: { status: 'accepted', chosenOptionId: chosen.id },
    });
  }

  /** Reject a suggestion → keep human copy + record the rejection. */
  async reject(id: string, feedback?: string): Promise<PostComment> {
    const comment = await this.get(id);
    if (comment.type === 'suggestion') {
      const rejected =
        comment.suggestedText ?? this.optionsOf(comment)[0]?.text ?? '';
      await this.learning.record({
        agentType: comment.author,
        agentRunId: comment.agentRunId ?? undefined,
        context: `Post copy suggestion`,
        originalOutput: rejected,
        editedOutput: comment.quotedText ?? '(kept original)',
        reason: feedback,
        approvalStatus: 'rejected',
        postId: comment.postId,
      });
      await this.captureDecisionMemory(
        comment,
        'rejected',
        comment.quotedText ?? '(kept original)',
        feedback,
      );
    }
    return this.prisma.postComment.update({
      where: { id },
      data: {
        status: 'rejected',
        body: feedback
          ? `${comment.body}\n\n(rejected: ${feedback})`
          : comment.body,
      },
    });
  }

  resolve(id: string): Promise<PostComment> {
    return this.prisma.postComment.update({
      where: { id },
      data: { status: 'resolved' },
    });
  }

  // --- internals -----------------------------------------------------------

  private async applyAndLearn(
    comment: PostComment,
    replacement: string,
    decision: 'accepted' | 'chose',
    label?: string,
  ): Promise<void> {
    const post = await this.posts.findOne(comment.postId);
    const newCopy = this.applyReplacement(post.copy, comment, replacement);
    const outcome = await this.materialize(post, newCopy);
    await this.learning.record({
      agentType: comment.author,
      agentRunId: comment.agentRunId ?? undefined,
      context: label
        ? `Post copy suggestion (${label})`
        : 'Post copy suggestion',
      originalOutput: comment.quotedText ?? post.copy,
      editedOutput: replacement,
      approvalStatus: 'approved',
      postId: comment.postId,
    });
    await this.captureDecisionMemory(
      comment,
      decision,
      replacement,
      label,
      outcome,
    );
  }

  /**
   * Apply an improved copy to the right place: a draft is edited in-place, but a
   * live post is never mutated — instead the improvement becomes a new draft
   * variant (actionable future content). Returns where it landed.
   */
  private async materialize(
    post: { id: string; campaignId: string; platform: string; status: string },
    newCopy: string,
  ): Promise<{ live: boolean; variantId?: string }> {
    if (LIVE_STATUSES.includes(post.status)) {
      const variant = await this.posts.create({
        campaignId: post.campaignId,
        platform: post.platform,
        copy: newCopy,
        status: PostStatus.draft,
      });
      return { live: true, variantId: variant.id };
    }
    await this.posts.update(post.id, { copy: newCopy });
    return { live: false };
  }

  /** Write the human decision to episodic memory (semantically retrievable). */
  private async captureDecisionMemory(
    comment: PostComment,
    decision: string,
    preferredText: string,
    note?: string,
    outcome?: { live: boolean; variantId?: string },
  ): Promise<void> {
    const tail = outcome?.live
      ? ' The post was already live, so this was saved as learning and spun into a new draft variant; the live post was left unchanged.'
      : '';
    const summary =
      `Human ${decision} a ${comment.author} suggestion on post copy` +
      `${note ? ` (${note})` : ''}. They preferred: "${truncate(preferredText, 220)}".` +
      `${comment.quotedText ? ` Original was: "${truncate(comment.quotedText, 120)}".` : ''}${tail}`;
    await this.ingestion.ingestText(
      summary,
      ['human_feedback', 'past_decisions'],
      {
        postId: comment.postId,
        agentType: comment.author,
        decision,
        postPublish: outcome?.live ?? false,
        variantId: outcome?.variantId,
      },
      0.6,
    );
  }

  /**
   * A human's own manual copy edit. Same principle: drafts are edited in place,
   * but on a live post the change is captured as learning + a new variant. Either
   * way the human's voice is written to the memory bank so agents adapt to it.
   */
  async recordCopyEdit(
    postId: string,
    newCopy: string,
  ): Promise<{ appliedInPlace: boolean; variantId?: string; unchanged: boolean }> {
    const post = await this.posts.findOne(postId);
    if (newCopy.trim() === post.copy.trim()) {
      return { appliedInPlace: true, variantId: undefined, unchanged: true };
    }
    const outcome = await this.materialize(post, newCopy);
    await this.learning.record({
      agentType: 'human',
      context: 'Manual copy edit',
      originalOutput: post.copy,
      editedOutput: newCopy,
      approvalStatus: 'edited',
      postId,
    });
    const tail = outcome.live
      ? ' The post was already live, so this was saved as learning and spun into a new draft variant; the live post was left unchanged.'
      : '';
    await this.ingestion.ingestText(
      `Human manually rewrote a ${post.platform} post. New copy: "${truncate(newCopy, 220)}". Previous: "${truncate(post.copy, 160)}".${tail}`,
      ['human_feedback', 'past_decisions'],
      { postId, decision: 'manual_edit', postPublish: outcome.live, variantId: outcome.variantId },
      0.6,
    );
    return {
      appliedInPlace: !outcome.live,
      variantId: outcome.variantId,
      unchanged: false,
    };
  }

  private optionsOf(comment: PostComment): SuggestionOption[] {
    return Array.isArray(comment.options)
      ? (comment.options as unknown as SuggestionOption[])
      : [];
  }

  private applyReplacement(
    copy: string,
    comment: PostComment,
    replacement: string,
  ): string {
    if (
      comment.rangeStart != null &&
      comment.rangeEnd != null &&
      comment.rangeStart >= 0 &&
      comment.rangeEnd <= copy.length &&
      comment.rangeStart < comment.rangeEnd
    ) {
      return (
        copy.slice(0, comment.rangeStart) +
        replacement +
        copy.slice(comment.rangeEnd)
      );
    }
    if (comment.quotedText && copy.includes(comment.quotedText)) {
      return copy.replace(comment.quotedText, replacement);
    }
    return replacement;
  }

  private async get(id: string): Promise<PostComment> {
    const comment = await this.prisma.postComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
