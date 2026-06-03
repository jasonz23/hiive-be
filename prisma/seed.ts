/* eslint-disable no-console */
import { NestFactory } from '@nestjs/core';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { AgentOrchestratorService } from '../src/agents/agent-orchestrator.service';
import { AdsService } from '../src/ads/ads.service';
import { AppModule } from '../src/app.module';
import { CampaignsService } from '../src/campaigns/campaigns.service';
import { KnowledgeService } from '../src/knowledge/knowledge.service';
import { MemoryIngestionService } from '../src/memory/memory-ingestion.service';
import { MissionsService } from '../src/missions/missions.service';
import { PostsService } from '../src/posts/posts.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { computeCtr } from '../src/common/metrics/metrics';
import { PostStatus } from '@prisma/client';
import { seedMarketingSignals } from './seed-marketing';

const MEMORY_DOCS: {
  title: string;
  tags: string[];
  importance: number;
  locked: boolean;
  text: string;
}[] = [
  {
    title: 'Brand Voice Guidelines',
    tags: ['brand_guideline', 'sell_side_messaging'],
    importance: 0.8,
    locked: false,
    text:
      'Hiive Brand Voice. We are confident, clear, and compliance-aware. We speak to founders ' +
      'and early employees with empathy about the liquidity decision before an IPO. We never ' +
      'guarantee returns or liquidity, never use hype or superlatives, and always frame Hiive ' +
      'as a transparent marketplace for private-company shares. Tone: trusted advisor, not a hard sell.',
  },
  {
    title: 'Compliance Guidelines',
    tags: ['compliance'],
    importance: 0.95,
    locked: true, // regulatory — must never be auto-changed by agents
    text:
      'Compliance Rules for Marketing. Prohibited language: "guarantee", "risk-free", "best price", ' +
      'and any forward-looking return claims. Private securities carry risk and this must never be ' +
      'obscured. Describe liquidity as a marketplace outcome, not a certainty. Avoid anything that ' +
      'could be construed as investment advice. Always keep claims factual and appropriately hedged.',
  },
  {
    title: 'Buyer & Seller Personas',
    tags: ['buyer_persona', 'sell_side_messaging'],
    importance: 0.6,
    locked: false,
    text:
      'Audience Personas. Sell-side: startup founders and early employees with vested equity who ' +
      'want partial liquidity before an IPO or while staying private. Their pain: illiquid net worth, ' +
      'uncertainty about valuation, and lock-up anxiety. Buy-side: accredited investors and funds ' +
      'seeking access to pre-IPO names. Messaging to founders should lead with understanding their ' +
      'options, not pressure.',
  },
  {
    title: 'Q1 Founder Liquidity Campaign Report',
    tags: ['past_performance', 'campaign_report'],
    importance: 0.4, // older episodic memory — lower importance
    locked: false,
    text:
      'Past Campaign Report — Q1 Founder Liquidity. LinkedIn drove the most qualified sell-side leads ' +
      'at roughly 2.3x better CPA than X. Posts that led with a concrete founder pain point and a single ' +
      'specific CTA ("understand your options before an IPO") outperformed generic value-prop posts by ' +
      '~40% on click-through. Vague CTAs were the top cause of underperformance.',
  },
  {
    title: 'Marketing Playbook',
    tags: ['playbook'],
    importance: 0.7,
    locked: false,
    text:
      'Successful Workflow Playbook. For each campaign: (1) ground content in brand + compliance memory, ' +
      '(2) generate 3-5 channel-specific variants, (3) run the compliance agent, (4) run the 6-persona ' +
      'simulation swarm and require a score above 75 before publishing, (5) after publishing, monitor CTR ' +
      'against goal and rewrite weak CTAs, (6) replicate winners across channels.',
  },
];

async function clearDatabase(prisma: PrismaService): Promise<void> {
  await prisma.knowledgeEdge.deleteMany();
  await prisma.knowledgeNode.deleteMany();
  await prisma.agentStep.deleteMany();
  await prisma.agentReflection.deleteMany();
  await prisma.learningExample.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.memoryChunk.deleteMany();
  await prisma.fileAsset.deleteMany();
  await prisma.post.deleteMany();
  await prisma.adCampaign.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  // Keep the autonomous engine idle while seeding.
  process.env.AUTONOMOUS_DISABLED = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const ingestion = app.get(MemoryIngestionService);
  const campaigns = app.get(CampaignsService);
  const posts = app.get(PostsService);
  const ads = app.get(AdsService);
  const missions = app.get(MissionsService);
  const orchestrator = app.get(AgentOrchestratorService);
  const approvals = app.get(ApprovalsService);
  const knowledge = app.get(KnowledgeService);

  console.log('🧹 Clearing database…');
  await clearDatabase(prisma);

  console.log('👤 Creating team user…');
  await prisma.user.create({
    data: {
      email: 'marketing@hiive.com',
      name: 'Hiive Marketing',
      role: 'marketer',
    },
  });

  console.log('📚 Ingesting memory documents…');
  for (const doc of MEMORY_DOCS) {
    const file = await prisma.fileAsset.create({
      data: {
        fileName: `${doc.title}.txt`,
        mimeType: 'text/plain',
        sizeBytes: doc.text.length,
        text: doc.text,
        tags: doc.tags,
        status: 'ready',
        importance: doc.importance,
        locked: doc.locked,
      },
    });
    await ingestion.ingestFileAsset(file);
  }

  console.log('📣 Creating campaigns…');
  const sellSide = await campaigns.create({
    name: 'Sell-side Founder Liquidity',
    objective: 'Increase inbound sellers of pre-IPO shares',
    audience: 'Startup founders and early employees',
    channels: ['LinkedIn', 'X', 'Email'],
    budget: 30000,
    goals: { impressions: 50000, clicks: 1500, leads: 100 },
    status: 'active',
  });
  const buySide = await campaigns.create({
    name: 'Buy-side Investor Access',
    objective: 'Grow accredited investor signups for pre-IPO access',
    audience: 'Accredited investors and funds',
    channels: ['LinkedIn', 'Email'],
    budget: 20000,
    // Ambitious goals so this campaign reads "at risk" against current actuals.
    goals: { impressions: 150000, clicks: 5000, leads: 250 },
    status: 'active',
  });
  const education = await campaigns.create({
    name: 'Employee Liquidity Education',
    objective: 'Educate startup employees on liquidity options',
    audience: 'Startup employees with vested equity',
    channels: ['LinkedIn', 'X'],
    budget: 12000,
    // Very ambitious goals so this campaign reads "critical" — needs attention.
    goals: { impressions: 300000, clicks: 10000, leads: 500 },
    status: 'active',
  });
  const allCampaigns = [sellSide, buySide, education];

  console.log('📝 Creating posts with varied statuses + metrics…');
  const COPIES = [
    'Thinking about liquidity before your IPO? Your equity is worth more than a number on a cap table.',
    'Founders: your hardest exit decision starts now, not at the bell. See what your shares are worth.',
    'Pre-IPO doesn’t have to mean pre-liquidity. Hiive gives you transparent pricing, no obligation.',
    'What if you could understand your options before the lock-up ends? Talk to a Hiive specialist.',
    'Accredited investors: access to pre-IPO names with transparent marketplace pricing.',
    'Your equity, before the IPO. A confidential, no-pressure valuation from Hiive.',
    'Employees with vested equity: here’s how private-market liquidity actually works.',
  ];
  const STATUS_PLAN: {
    status: PostStatus;
    impressions: number;
    ctrTarget: number;
  }[] = [
    { status: PostStatus.published, impressions: 8200, ctrTarget: 2.6 },
    { status: PostStatus.published, impressions: 6400, ctrTarget: 0.9 },
    { status: PostStatus.underperforming, impressions: 5100, ctrTarget: 0.7 },
    { status: PostStatus.published, impressions: 12400, ctrTarget: 3.4 },
    { status: PostStatus.analyzing, impressions: 3000, ctrTarget: 1.2 },
    { status: PostStatus.scheduled, impressions: 0, ctrTarget: 0 },
    { status: PostStatus.draft, impressions: 0, ctrTarget: 0 },
    { status: PostStatus.review, impressions: 0, ctrTarget: 0 },
    { status: PostStatus.completed, impressions: 9800, ctrTarget: 2.1 },
  ];

  // Spread posts across the current month so the calendar reads well.
  const now = new Date();
  const scheduledFor = (i: number): string => {
    const day = ((i * 3 + 2) % 27) + 1;
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      day,
      9,
      0,
      0,
    ).toISOString();
  };

  const createdPosts: { id: string; status: PostStatus; campaignId: string }[] =
    [];
  let copyIdx = 0;
  for (let i = 0; i < 20; i++) {
    const campaign = allCampaigns[i % allCampaigns.length];
    const plan = STATUS_PLAN[i % STATUS_PLAN.length];
    const platform = ['LinkedIn', 'X', 'Email'][i % 3];
    const post = await posts.create({
      campaignId: campaign.id,
      platform,
      copy: COPIES[copyIdx++ % COPIES.length],
      status: plan.status,
      scheduledAt: scheduledFor(i),
    });

    if (plan.impressions > 0) {
      // Published in the recent past with a 2-point trajectory so the time-aware
      // monitoring agent has real age + velocity to reason about.
      const ageHours = 20 + i * 7;
      const publishedAt = new Date(now.getTime() - ageHours * 3_600_000);
      const earlier = new Date(now.getTime() - 2 * 3_600_000);
      const clicks = Math.round((plan.impressions * plan.ctrTarget) / 100);
      const final = {
        impressions: plan.impressions,
        clicks,
        likes: Math.round(plan.impressions * 0.02),
        comments: Math.round(plan.impressions * 0.004),
        shares: Math.round(plan.impressions * 0.002),
        conversions: Math.round(clicks * 0.08),
        ctr: computeCtr(clicks, plan.impressions),
      };
      const history = [
        {
          capturedAt: publishedAt.toISOString(),
          impressions: Math.round(plan.impressions * 0.5),
          clicks: Math.round(clicks * 0.5),
          ctr: computeCtr(
            Math.round(clicks * 0.5),
            Math.round(plan.impressions * 0.5),
          ),
          conversions: Math.round(final.conversions * 0.5),
        },
        {
          capturedAt: earlier.toISOString(),
          impressions: final.impressions,
          clicks: final.clicks,
          ctr: final.ctr,
          conversions: final.conversions,
        },
      ];
      await prisma.post.update({
        where: { id: post.id },
        data: {
          metrics: final,
          metricsHistory: history,
          status: plan.status,
          publishedAt,
          scheduledAt: publishedAt,
        },
      });
    } else {
      await posts.setStatus(post.id, plan.status);
    }
    createdPosts.push({
      id: post.id,
      status: plan.status,
      campaignId: campaign.id,
    });
  }

  console.log('📊 Creating ads…');
  const ym = (day: number) =>
    new Date(now.getFullYear(), now.getMonth(), day, 0, 0, 0).toISOString();
  const adSpecs = [
    {
      c: sellSide,
      platform: 'LinkedIn',
      budget: 8000,
      spend: 5200,
      impressions: 62000,
      clicks: 1240,
      conversions: 58,
      start: 1,
      end: 20,
    },
    {
      c: sellSide,
      platform: 'X',
      budget: 5000,
      spend: 4100,
      impressions: 88000,
      clicks: 610,
      conversions: 12,
      start: 3,
      end: 24,
    },
    {
      c: buySide,
      platform: 'LinkedIn',
      budget: 6000,
      spend: 3800,
      impressions: 41000,
      clicks: 720,
      conversions: 34,
      start: 5,
      end: 28,
    },
    {
      c: buySide,
      platform: 'Email',
      budget: 3000,
      spend: 1200,
      impressions: 18000,
      clicks: 540,
      conversions: 41,
      start: 8,
      end: 18,
    },
    {
      c: education,
      platform: 'LinkedIn',
      budget: 4000,
      spend: 2600,
      impressions: 35000,
      clicks: 430,
      conversions: 19,
      start: 12,
      end: 27,
    },
  ];
  for (const a of adSpecs) {
    await ads.create({
      campaignId: a.c.id,
      name: `${a.c.name} — ${a.platform}`,
      platform: a.platform,
      budget: a.budget,
      spend: a.spend,
      impressions: a.impressions,
      clicks: a.clicks,
      conversions: a.conversions,
      startDate: ym(a.start),
      endDate: ym(a.end),
    });
  }

  console.log('🤖 Running agents to generate recommendations + reflections…');
  // Performance monitoring on the underperformers → recommendations + approvals
  for (const post of createdPosts.filter(
    (p) =>
      p.status === PostStatus.underperforming ||
      p.status === PostStatus.analyzing,
  )) {
    await orchestrator.runAgent('PerformanceMonitoringAgent', {
      postId: post.id,
    });
  }
  // Ads optimization for each campaign
  for (const c of allCampaigns) {
    await orchestrator.runAgent('AdsOptimizationAgent', { campaignId: c.id });
  }
  // A simulation run for richer reflections + swarm suggestion comments.
  const firstPublished = createdPosts.find(
    (p) => p.status === PostStatus.published,
  );
  if (firstPublished) {
    await orchestrator.runAgent('SocialSimulationSwarmAgent', {
      postId: firstPublished.id,
    });
  }
  // A post with non-compliant copy so the compliance agent leaves inline suggestions.
  const compliancePost = await posts.create({
    campaignId: sellSide.id,
    platform: 'LinkedIn',
    copy: 'We guarantee risk-free liquidity at the best price for your pre-IPO shares.',
    status: PostStatus.review,
  });
  await orchestrator.runAgent('ComplianceReviewAgent', {
    postId: compliancePost.id,
  });
  await orchestrator.runAgent('SocialSimulationSwarmAgent', {
    postId: compliancePost.id,
  });
  // Recompute campaign health from actuals
  for (const c of allCampaigns) {
    await campaigns.recomputeHealth(c.id);
  }

  console.log('🎯 Creating + running a mission…');
  const mission = await missions.create({
    title: 'Increase sell-side founder leads by 30%',
    objective: 'Drive more inbound founders who want pre-IPO liquidity',
    priority: 'high',
    targetMetric: {
      metric: 'founder_leads',
      baseline: 100,
      target: 130,
      unit: 'leads',
    },
  });
  await missions.run(mission.id);

  console.log('✍️  Simulating a human edit to seed the learning flywheel…');
  const pendingApprovals = await approvals.list('pending');
  // Prefer an approval raised by an agent so the learning is attributed correctly.
  const toEdit =
    pendingApprovals.find((a) => a.agentRun) ?? pendingApprovals[0];
  if (toEdit) {
    await approvals.edit(
      toEdit.id,
      {
        copy: 'Founders: understand your real liquidity options before your IPO. Book a confidential, no-pressure valuation.',
      },
      'Made the CTA specific and removed vague language — leads with the founder decision.',
    );
  }

  console.log('🕸️  Building knowledge graph…');
  await knowledge.rebuild();

  const counts = {
    campaigns: await prisma.campaign.count(),
    posts: await prisma.post.count(),
    ads: await prisma.adCampaign.count(),
    memoryChunks: await prisma.memoryChunk.count(),
    agentRuns: await prisma.agentRun.count(),
    recommendations: await prisma.recommendation.count(),
    reflections: await prisma.agentReflection.count(),
    approvals: await prisma.approvalRequest.count(),
    learning: await prisma.learningExample.count(),
    missions: await prisma.mission.count(),
  };
  const marketingPosts = await seedMarketingSignals(prisma);
  console.log('✅ Seed complete:', { ...counts, marketingPosts });

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
