import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lightweight knowledge graph over the marketing entities. Nodes are campaigns,
 * posts, ads, etc.; edges capture relationships (CAMPAIGN_CREATED_POST, ...).
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertNode(
    type: string,
    refId: string,
    label: string,
  ): Promise<string> {
    const node = await this.prisma.knowledgeNode.upsert({
      where: { type_refId: { type, refId } },
      update: { label },
      create: { type, refId, label },
    });
    return node.id;
  }

  async link(
    from: { type: string; refId: string; label: string },
    to: { type: string; refId: string; label: string },
    relation: string,
  ): Promise<void> {
    const fromId = await this.upsertNode(from.type, from.refId, from.label);
    const toId = await this.upsertNode(to.type, to.refId, to.label);
    const existing = await this.prisma.knowledgeEdge.findFirst({
      where: { fromId, toId, relation },
    });
    if (!existing) {
      await this.prisma.knowledgeEdge.create({
        data: { fromId, toId, relation },
      });
    }
  }

  async graph(): Promise<{ nodes: unknown[]; edges: unknown[] }> {
    const [nodes, edges] = await Promise.all([
      this.prisma.knowledgeNode.findMany(),
      this.prisma.knowledgeEdge.findMany(),
    ]);
    return { nodes, edges };
  }

  /** Rebuild the graph from current campaigns → posts → ads. */
  async rebuild(): Promise<{ nodes: number; edges: number }> {
    const campaigns = await this.prisma.campaign.findMany({
      include: { posts: true, ads: true },
    });
    for (const campaign of campaigns) {
      const campaignNode = {
        type: 'campaign',
        refId: campaign.id,
        label: campaign.name,
      };
      for (const post of campaign.posts) {
        await this.link(
          campaignNode,
          { type: 'post', refId: post.id, label: `${post.platform} post` },
          'CAMPAIGN_CREATED_POST',
        );
      }
      for (const ad of campaign.ads) {
        await this.link(
          campaignNode,
          { type: 'ad', refId: ad.id, label: ad.name },
          'CAMPAIGN_HAS_AD',
        );
      }
    }
    const { nodes, edges } = await this.graph();
    return { nodes: nodes.length, edges: edges.length };
  }
}
