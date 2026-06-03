import { CampaignHealth } from '@prisma/client';

export interface PostMetrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  conversions: number;
  ctr: number; // percent
}

export const EMPTY_POST_METRICS: PostMetrics = {
  impressions: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  clicks: 0,
  conversions: 0,
  ctr: 0,
};

export function computeCtr(clicks: number, impressions: number): number {
  if (impressions <= 0) return 0;
  return Number(((clicks / impressions) * 100).toFixed(2));
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Simulate a "Refresh Metrics" tick from a social platform. Values may only
 * INCREASE (never decrease). The per-post seed makes growth deterministic and
 * gives each post a stable "click efficiency" — so some posts naturally trend
 * toward underperformance (low CTR) and others toward viral (high CTR), which
 * is exactly what the monitoring + viral agents react to.
 */
export function growMetrics(current: PostMetrics, seed: string): PostMetrics {
  const h = hash(seed);
  // Impression growth: +30%..+120% of current (min absolute bump so new posts move).
  const impressionGrowth = 0.3 + (h % 90) / 100;
  const addedImpressions = Math.max(
    400,
    Math.round(current.impressions * impressionGrowth),
  );
  const impressions = current.impressions + addedImpressions;

  // Click efficiency in [0.3%, 4.5%] CTR band, stable per post.
  const efficiency = 0.003 + ((h >> 3) % 42) / 1000;
  const addedClicks = Math.max(1, Math.round(addedImpressions * efficiency));
  const clicks = current.clicks + addedClicks;

  // Engagement scales with impressions but with its own variance.
  const likeRate = 0.01 + ((h >> 6) % 40) / 1000;
  const commentRate = 0.001 + ((h >> 9) % 8) / 1000;
  const shareRate = 0.0005 + ((h >> 12) % 5) / 1000;
  const convRate = 0.05 + ((h >> 15) % 15) / 100; // of clicks

  return {
    impressions,
    clicks,
    likes: current.likes + Math.max(1, Math.round(addedImpressions * likeRate)),
    comments:
      current.comments +
      Math.max(0, Math.round(addedImpressions * commentRate)),
    shares:
      current.shares + Math.max(0, Math.round(addedImpressions * shareRate)),
    conversions:
      current.conversions + Math.max(0, Math.round(addedClicks * convRate)),
    ctr: computeCtr(clicks, impressions),
  };
}

export interface AdDerivedMetrics {
  ctr: number; // percent
  cpc: number; // cost per click
  cpa: number; // cost per acquisition
  conversionRate: number; // percent
}

export function deriveAdMetrics(ad: {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}): AdDerivedMetrics {
  return {
    ctr: computeCtr(ad.clicks, ad.impressions),
    cpc: ad.clicks > 0 ? Number((ad.spend / ad.clicks).toFixed(2)) : 0,
    cpa:
      ad.conversions > 0 ? Number((ad.spend / ad.conversions).toFixed(2)) : 0,
    conversionRate:
      ad.clicks > 0
        ? Number(((ad.conversions / ad.clicks) * 100).toFixed(2))
        : 0,
  };
}

export interface GoalProgress {
  attainment: Record<string, { actual: number; goal: number; pct: number }>;
  overallPct: number;
  health: CampaignHealth;
}

/**
 * Snapshot goal attainment for a campaign by comparing actuals to goal targets.
 * `leads` maps to conversions. overallPct is the mean attainment (capped at 1
 * per metric). Health bands: >=80 healthy, >=50 warning, >=25 at_risk, else critical.
 */
export function computeGoalProgress(
  goals: Record<string, number>,
  actuals: { impressions: number; clicks: number; conversions: number },
): GoalProgress {
  const actualFor = (key: string): number => {
    if (key === 'leads' || key === 'conversions') return actuals.conversions;
    if (key === 'impressions') return actuals.impressions;
    if (key === 'clicks') return actuals.clicks;
    return 0;
  };

  const attainment: GoalProgress['attainment'] = {};
  const ratios: number[] = [];
  for (const [key, goal] of Object.entries(goals)) {
    if (typeof goal !== 'number' || goal <= 0) continue;
    const actual = actualFor(key);
    const pct = Number(((actual / goal) * 100).toFixed(1));
    attainment[key] = { actual, goal, pct };
    ratios.push(Math.min(1, actual / goal));
  }

  const overallPct = ratios.length
    ? Number(
        ((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100).toFixed(1),
      )
    : 0;

  const health =
    overallPct >= 80
      ? CampaignHealth.healthy
      : overallPct >= 50
        ? CampaignHealth.warning
        : overallPct >= 25
          ? CampaignHealth.at_risk
          : CampaignHealth.critical;

  return { attainment, overallPct, health };
}
