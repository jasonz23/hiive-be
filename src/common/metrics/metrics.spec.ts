import { CampaignHealth } from '@prisma/client';
import {
  computeCtr,
  computeGoalProgress,
  deriveAdMetrics,
  EMPTY_POST_METRICS,
  growMetrics,
} from './metrics';

describe('metrics helpers', () => {
  describe('computeCtr', () => {
    it('returns 0 for zero impressions', () => {
      expect(computeCtr(10, 0)).toBe(0);
    });
    it('computes percent with 2 decimals', () => {
      expect(computeCtr(15, 1000)).toBe(1.5);
    });
  });

  describe('growMetrics', () => {
    it('never decreases any metric', () => {
      const start = {
        ...EMPTY_POST_METRICS,
        impressions: 1000,
        clicks: 20,
        likes: 50,
        comments: 5,
        shares: 2,
        conversions: 3,
        ctr: 2,
      };
      const next = growMetrics(start, 'post-1');
      expect(next.impressions).toBeGreaterThanOrEqual(start.impressions);
      expect(next.clicks).toBeGreaterThanOrEqual(start.clicks);
      expect(next.likes).toBeGreaterThanOrEqual(start.likes);
      expect(next.comments).toBeGreaterThanOrEqual(start.comments);
      expect(next.shares).toBeGreaterThanOrEqual(start.shares);
      expect(next.conversions).toBeGreaterThanOrEqual(start.conversions);
    });

    it('is deterministic per seed', () => {
      const start = { ...EMPTY_POST_METRICS, impressions: 1000, clicks: 20 };
      expect(growMetrics(start, 'seed-x')).toEqual(
        growMetrics(start, 'seed-x'),
      );
    });

    it('keeps ctr consistent with clicks/impressions', () => {
      const start = { ...EMPTY_POST_METRICS, impressions: 1000, clicks: 20 };
      const next = growMetrics(start, 'seed-y');
      expect(next.ctr).toBe(computeCtr(next.clicks, next.impressions));
    });

    it('different posts get different growth profiles', () => {
      const start = { ...EMPTY_POST_METRICS, impressions: 1000, clicks: 20 };
      const a = growMetrics(start, 'post-a');
      const b = growMetrics(start, 'post-b');
      expect(a).not.toEqual(b);
    });
  });

  describe('deriveAdMetrics', () => {
    it('derives ctr/cpc/cpa/conversionRate', () => {
      const m = deriveAdMetrics({
        spend: 200,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      expect(m.ctr).toBe(1);
      expect(m.cpc).toBe(2);
      expect(m.cpa).toBe(20);
      expect(m.conversionRate).toBe(10);
    });
    it('avoids divide-by-zero', () => {
      expect(
        deriveAdMetrics({
          spend: 50,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        }),
      ).toEqual({
        ctr: 0,
        cpc: 0,
        cpa: 0,
        conversionRate: 0,
      });
    });
  });

  describe('computeGoalProgress', () => {
    it('maps leads to conversions and bands health', () => {
      const progress = computeGoalProgress(
        { impressions: 50000, clicks: 1500, leads: 100 },
        { impressions: 50000, clicks: 1500, conversions: 100 },
      );
      expect(progress.overallPct).toBe(100);
      expect(progress.health).toBe(CampaignHealth.healthy);
      expect(progress.attainment.leads.actual).toBe(100);
    });

    it('flags critical when far behind', () => {
      const progress = computeGoalProgress(
        { impressions: 50000, leads: 100 },
        { impressions: 5000, clicks: 0, conversions: 2 },
      );
      expect(progress.health).toBe(CampaignHealth.critical);
    });
  });
});
