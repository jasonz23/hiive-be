import { PostStatus, PrismaClient } from '@prisma/client';
import { computeCtr } from '../src/common/metrics/metrics';

/**
 * Mock marketing-performance data designed to contain clear SIGNAL and clear
 * NOISE, across buy-side / sell-side / employee segments and channels (LinkedIn,
 * X, Email-nurture). The MarketingPerformanceAnalyzerAgent should confirm the
 * consistent, well-sampled patterns and filter the thin/erratic ones.
 *
 * Idempotent: tagged via `mediaUrl = MARKER` so re-running is a no-op.
 */
const MARKER = 'seed:marketing-signal';

interface Spec {
  campaign: string;
  platform: string;
  impressions: number;
  ctr: number; // intended CTR %
  convRate?: number; // conversions / clicks %
  status?: PostStatus;
  copy: string;
}

const SPECS: Spec[] = [
  // SIGNAL — sell-side LinkedIn WORKS: 4 posts, consistent ~2.7% CTR (well above baseline).
  ...lin('Sell-side Founder Liquidity', 'LinkedIn', [
    [12000, 2.8],
    [9500, 2.6],
    [14000, 2.9],
    [8200, 2.7],
  ], 9, 'Founders: understand what your equity is worth before the IPO window.'),

  // SIGNAL — sell-side X does NOT work: 3 posts, consistently weak ~0.9% CTR.
  ...lin('Sell-side Founder Liquidity', 'X', [
    [9000, 0.9],
    [6500, 0.8],
    [7800, 1.0],
  ], 4, 'Pre-IPO doesn’t have to mean pre-liquidity. See your options.'),

  // SIGNAL — buy-side EMAIL nurture WORKS: 4-step sequence, ~3.2% CTR + strong conversions.
  ...lin('Buy-side Investor Access', 'Email', [
    [5200, 3.1],
    [4800, 3.4],
    [6100, 3.0],
    [4500, 3.3],
  ], 16, 'Accredited investors: access vetted pre-IPO opportunities (nurture step).'),

  // INCONCLUSIVE — buy-side LinkedIn sits on the baseline (~1.8%), no clear signal.
  ...lin('Buy-side Investor Access', 'LinkedIn', [
    [11000, 1.8],
    [9000, 1.9],
    [10000, 1.7],
  ], 7, 'Build a diversified pre-IPO portfolio with transparent pricing.'),

  // NOISE — employee X is erratic: one outlier carries the group (high variance → filtered).
  ...lin('Employee Liquidity Education', 'X', [
    [6000, 5.2],
    [5500, 0.6],
    [5000, 0.7],
  ], 5, 'Your vested equity has options — here’s how to think about them.'),

  // NOISE — tiny-sample posts that look amazing but are statistically meaningless (<400 impressions).
  {
    campaign: 'Sell-side Founder Liquidity',
    platform: 'Email',
    impressions: 180,
    ctr: 7.8,
    copy: 'Early test: founder liquidity teaser (tiny audience).',
    status: PostStatus.published,
  },
  {
    campaign: 'Buy-side Investor Access',
    platform: 'X',
    impressions: 120,
    ctr: 9.1,
    copy: 'Early test: investor access teaser (tiny audience).',
    status: PostStatus.published,
  },
];

function lin(
  campaign: string,
  platform: string,
  pairs: [number, number][],
  convRate: number,
  copy: string,
): Spec[] {
  return pairs.map(([impressions, ctr]) => ({
    campaign,
    platform,
    impressions,
    ctr,
    convRate,
    status: PostStatus.published,
    copy,
  }));
}

function buildMetrics(impressions: number, ctr: number, convRate: number) {
  const clicks = Math.round((impressions * ctr) / 100);
  const conversions = Math.round((clicks * convRate) / 100);
  return {
    impressions,
    clicks,
    likes: Math.round(impressions * 0.02),
    comments: Math.round(impressions * 0.004),
    shares: Math.round(impressions * 0.002),
    conversions,
    ctr: computeCtr(clicks, impressions),
  };
}

export async function seedMarketingSignals(prisma: PrismaClient): Promise<number> {
  const already = await prisma.post.count({ where: { mediaUrl: MARKER } });
  if (already > 0) return 0;

  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
  });
  const idByName = new Map(campaigns.map((c) => [c.name, c.id]));
  const now = Date.now();
  let created = 0;

  for (let i = 0; i < SPECS.length; i++) {
    const s = SPECS[i];
    const campaignId = idByName.get(s.campaign);
    if (!campaignId) continue;
    const metrics = buildMetrics(s.impressions, s.ctr, s.convRate ?? 8);
    const publishedAt = new Date(now - (24 + i * 6) * 3_600_000);
    await prisma.post.create({
      data: {
        campaignId,
        platform: s.platform,
        copy: s.copy,
        mediaUrl: MARKER,
        status: s.status ?? PostStatus.published,
        publishedAt,
        scheduledAt: publishedAt,
        metrics,
        metricsHistory: [
          {
            capturedAt: publishedAt.toISOString(),
            impressions: Math.round(metrics.impressions * 0.5),
            clicks: Math.round(metrics.clicks * 0.5),
            ctr: metrics.ctr,
            conversions: Math.round(metrics.conversions * 0.5),
          },
          {
            capturedAt: new Date(now - 2 * 3_600_000).toISOString(),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            ctr: metrics.ctr,
            conversions: metrics.conversions,
          },
        ],
      },
    });
    created += 1;
  }
  return created;
}

// Standalone runner: `npm run db:seed:marketing`
if (require.main === module) {
  const prisma = new PrismaClient();
  seedMarketingSignals(prisma)
    .then((n) => {
      // eslint-disable-next-line no-console
      console.log(`Seeded ${n} marketing-signal posts.`);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e);
      process.exit(1);
    })
    .finally(() => void prisma.$disconnect());
}
