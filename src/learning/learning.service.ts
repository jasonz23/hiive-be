import { Injectable } from '@nestjs/common';
import { LearningExample } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordLearningInput {
  agentRunId?: string;
  agentType: string;
  context?: string;
  originalOutput: string;
  editedOutput: string;
  reason?: string;
  approvalStatus?: 'approved' | 'rejected' | 'edited';
  campaignId?: string;
  postId?: string;
  outcomeScore?: number;
}

/**
 * The learning flywheel store. Every human edit/rejection of AI output is captured
 * here as a delta, and retrieved into future agent prompts so the system improves.
 */
@Injectable()
export class LearningService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordLearningInput): Promise<LearningExample> {
    return this.prisma.learningExample.create({ data: input });
  }

  list(agentType?: string) {
    return this.prisma.learningExample.findMany({
      where: { agentType },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Recent human-edit deltas injected into future agent prompts. */
  async retrieveForAgent(agentType: string, limit = 3): Promise<string[]> {
    const rows = await this.prisma.learningExample.findMany({
      where: { agentType },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(
      (r) =>
        `Humans previously ${r.approvalStatus ?? 'edited'} similar output${
          r.reason ? ` because: ${r.reason}` : ''
        }. They preferred: "${truncate(r.editedOutput, 240)}"`,
    );
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
