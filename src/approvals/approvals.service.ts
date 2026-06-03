import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
  PostStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { LearningService } from '../learning/learning.service';
import { MemoryIngestionService } from '../memory/memory-ingestion.service';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateApprovalInput {
  agentRunId?: string;
  type: ApprovalType;
  entityType: string;
  entityId: string;
  title: string;
  proposedAction: Record<string, unknown>;
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly learning: LearningService,
    private readonly posts: PostsService,
    private readonly campaigns: CampaignsService,
    private readonly ingestion: MemoryIngestionService,
  ) {}

  create(input: CreateApprovalInput): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        agentRunId: input.agentRunId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        proposedAction: input.proposedAction as Prisma.InputJsonValue,
      },
    });
  }

  list(status?: ApprovalStatus) {
    return this.prisma.approvalRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: { agentRun: { select: { id: true, agentType: true } } },
    });
  }

  async get(id: string): Promise<ApprovalRequest> {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }

  /** Approve → execute the gated action. */
  async approve(id: string): Promise<ApprovalRequest> {
    const approval = await this.get(id);
    await this.executeAction(
      approval,
      approval.proposedAction as Record<string, unknown>,
    );
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.approved },
    });
    await this.audit.record({
      actor: 'user',
      action: 'approval.approve',
      entity: 'ApprovalRequest',
      entityId: id,
      metadata: { type: approval.type },
    });
    return updated;
  }

  /** Reject → capture the rejection as a learning example (flywheel). */
  async reject(id: string, feedback?: string): Promise<ApprovalRequest> {
    const approval = await this.withRun(id);
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: { status: ApprovalStatus.rejected, feedback },
    });
    await this.captureLearning(
      approval,
      approval.proposedAction,
      'rejected',
      feedback,
    );
    await this.audit.record({
      actor: 'user',
      action: 'approval.reject',
      entity: 'ApprovalRequest',
      entityId: id,
      metadata: { feedback },
    });
    return updated;
  }

  /** Edit → execute the human-edited action AND capture the delta as learning. */
  async edit(
    id: string,
    editedAction: Record<string, unknown>,
    feedback?: string,
  ): Promise<ApprovalRequest> {
    const approval = await this.withRun(id);
    await this.executeAction(approval, editedAction);
    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: ApprovalStatus.edited,
        editedAction: editedAction as Prisma.InputJsonValue,
        feedback,
      },
    });
    await this.captureLearning(approval, editedAction, 'edited', feedback);
    await this.audit.record({
      actor: 'user',
      action: 'approval.edit',
      entity: 'ApprovalRequest',
      entityId: id,
      metadata: { feedback },
    });
    return updated;
  }

  // --- internals -----------------------------------------------------------

  private async withRun(id: string) {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: { agentRun: { select: { id: true, agentType: true } } },
    });
    if (!approval) throw new NotFoundException('Approval not found');
    return approval;
  }

  private async executeAction(
    approval: ApprovalRequest,
    action: Record<string, unknown>,
  ): Promise<void> {
    switch (approval.type) {
      case ApprovalType.publish_post:
        await this.posts.setStatus(approval.entityId, PostStatus.published);
        if (typeof action.copy === 'string') {
          await this.posts.update(approval.entityId, {
            copy: action.copy,
          });
        }
        break;
      case ApprovalType.schedule_post:
        await this.posts.setStatus(approval.entityId, PostStatus.scheduled);
        break;
      case ApprovalType.budget_change:
        if (typeof action.newBudget === 'number') {
          await this.campaigns.update(approval.entityId, {
            budget: action.newBudget,
          });
        }
        break;
      case ApprovalType.campaign_launch:
        await this.campaigns.update(approval.entityId, {
          status: 'active',
        });
        break;
      case ApprovalType.external_message:
        // No external integration in MVP — recorded via audit only.
        break;
    }
  }

  private async captureLearning(
    approval: {
      agentRun: { agentType: string } | null;
      proposedAction: Prisma.JsonValue;
      title: string;
    },
    editedAction: unknown,
    status: 'rejected' | 'edited',
    feedback?: string,
  ): Promise<void> {
    const agentType = approval.agentRun?.agentType ?? 'unknown';
    const editedText =
      status === 'rejected' ? '(rejected)' : stringify(editedAction);
    await this.learning.record({
      agentType,
      context: approval.title,
      originalOutput: stringify(approval.proposedAction),
      editedOutput: editedText,
      reason: feedback,
      approvalStatus: status,
    });
    // Episodic memory so agents can semantically reference this decision later.
    const summary =
      `Human ${status} a ${agentType} proposal ("${approval.title}")` +
      `${feedback ? ` because: ${feedback}` : ''}.` +
      `${status === 'edited' ? ` They preferred: "${truncate(editedText, 200)}".` : ''}`;
    await this.ingestion.ingestText(
      summary,
      ['human_feedback', 'past_decisions'],
      { agentType, decision: status },
      0.6,
    );
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'copy' in value) {
    const copy = value.copy;
    if (typeof copy === 'string') return copy;
  }
  return JSON.stringify(value);
}
