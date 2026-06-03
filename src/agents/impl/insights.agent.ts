import { Injectable } from '@nestjs/common';
import { AdStatus, PostStatus } from '@prisma/client';
import {
  classifyAuthor,
  fitMatchesSegment,
} from '../../common/audience/audience-fit';
import { computeCtr } from '../../common/metrics/metrics';
import { Segment, SEGMENT_LABEL, segmentOf } from '../../common/segment';
import { LlmService } from '../../llm/llm.service';
import { MemoryIngestionService } from '../../memory/memory-ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Agent,
  AgentContext,
  AgentDecision,
  AgentResult,
  AgentType,
} from '../agent.types';

// Signal-vs-noise gates — a pattern is only a learning if well sampled AND consistent.
const MIN_UNITS_PER_GROUP = 3;
const MIN_IMPRESSIONS_PER_GROUP = 3000;
const NOISE_UNIT_IMPRESSIONS = 400; // a single post/ad below this is too small to trust
const MAX_CV = 0.7; // CTR coefficient of variation above this = outlier-driven noise
const EFF_HI = 1.25; // ≥1.25× blended effectiveness → working
const EFF_LO = 0.8; // ≤0.8× → not working
const MIN_MEASURED_UNITS = 6;

// Effectiveness weights — conversion and audience FIT matter more than raw reach
// (social metrics alone aren't enough for a private-market trading platform).
const W_REACH = 0.2; // link CTR
const W_CONV = 0.5; // link → lead conversion
const W_FIT = 0.3; // fit-weighted engagement from the right prospects

interface Unit {
  id: string;
  kind: 'post' | 'ad';
  channel: string; // LinkedIn | X | Email | Ads
  segment: Segment;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  qualEngagement: number; // fit-weighted on-segment comments (posts only)
}
interface Group {
  segment: Segment;
  channel: string;
  units: Unit[];
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  convRate: number;
  qualPerUnit: number;
  cv: number;
}
type Verdict = 'working' | 'not_working' | 'inconclusive' | 'noise';

interface SignalCtx {
  kind: 'working' | 'not_working';
  segment: string;
  channel: string;
  ctr: number;
  convRate: number;
  qualified: number; // qualified engagement per unit
  effectiveness: number; // composite ratio vs baseline
  driver: string; // conversion | audience fit | reach
  posts: number;
}
interface NarratedInsight {
  kind: 'working' | 'not_working';
  segment: string;
  channel: string;
  headline: string;
  detail: string;
}

/**
 * Marketing Performance Analyzer — signal vs noise, beyond social metrics.
 *
 * For a private-market platform, raw impressions/CTR aren't the point: what
 * matters is whether the RIGHT prospects (buy-side funds, sell-side equity
 * holders) engage and CONVERT. So this scores each segment × channel on a
 * composite of link→lead conversion (×0.5), fit-weighted qualified engagement
 * (×0.3) and reach (×0.2), treats ads as a channel (to read ad conversion), and
 * only writes a learning to memory when the pattern is well sampled AND
 * consistent. Thin, lucky, or low-fit one-offs are reported as filtered noise.
 */
@Injectable()
export class MarketingPerformanceAnalyzerAgent implements Agent {
  readonly type: AgentType = 'MarketingPerformanceAnalyzerAgent';

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly ingestion: MemoryIngestionService,
  ) {}

  async shouldRun(): Promise<AgentDecision> {
    const units = await this.loadUnits();
    const trusted = units.filter((u) => u.impressions >= NOISE_UNIT_IMPRESSIONS);
    if (trusted.length < MIN_MEASURED_UNITS) {
      return {
        run: false,
        reason: 'not enough measured performance data to separate signal from noise yet',
      };
    }
    return { run: true };
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const units = await this.loadUnits();
    const noise = units.filter((u) => u.impressions < NOISE_UNIT_IMPRESSIONS);
    const trusted = units.filter((u) => u.impressions >= NOISE_UNIT_IMPRESSIONS);
    await ctx.step(
      'thought',
      `Measured ${units.length} units (posts + ads). Set aside ${noise.length} as too small to trust (<${NOISE_UNIT_IMPRESSIONS} impressions).`,
    );

    // Blended baselines for each dimension.
    const base = this.baselines(trusted);
    await ctx.step(
      'thought',
      `Baselines — reach ${base.ctr.toFixed(2)}% CTR · conversion ${base.convRate.toFixed(2)}% (link→lead) · fit-engagement ${base.qual.toFixed(2)}/unit. Conversion + audience fit weighted over raw social.`,
    );

    const groups = this.buildGroups(trusted);
    const filtered: { label: string; reason: string }[] = [];
    const signals: SignalCtx[] = [];

    for (const g of groups) {
      const label = `${SEGMENT_LABEL[g.segment]} · ${g.channel}`;
      const eff = this.effectiveness(g, base);
      const verdict = this.classify(g, eff.ratio);
      if (verdict === 'noise') {
        const reason =
          g.units.length < MIN_UNITS_PER_GROUP ||
          g.impressions < MIN_IMPRESSIONS_PER_GROUP
            ? `only ${g.units.length} units / ${g.impressions.toLocaleString()} impressions`
            : `inconsistent (CV ${g.cv.toFixed(2)} — outlier-driven)`;
        filtered.push({ label, reason });
        await ctx.step('thought', `NOISE — ${label}: ${reason}.`);
        continue;
      }
      if (verdict === 'inconclusive') {
        await ctx.step(
          'thought',
          `On baseline — ${label}: effectiveness ${eff.ratio.toFixed(2)}× — no clear signal.`,
        );
        continue;
      }
      await ctx.step(
        'thought',
        `SIGNAL (${verdict}) — ${label}: ${eff.ratio.toFixed(2)}× effectiveness (conv ${g.convRate.toFixed(1)}%, fit-engagement ${g.qualPerUnit.toFixed(2)}/unit) across ${g.units.length} units. Driver: ${eff.driver}.`,
      );
      signals.push({
        kind: verdict,
        segment: SEGMENT_LABEL[g.segment],
        channel: g.channel,
        ctr: g.ctr,
        convRate: g.convRate,
        qualified: g.qualPerUnit,
        effectiveness: eff.ratio,
        driver: eff.driver,
        posts: g.units.length,
      });
    }

    if (signals.length === 0) {
      await ctx.step('output', 'No confirmed signals this cycle — only noise.');
      return {
        summary: `Analyzed ${trusted.length} units; no signal above noise (filtered ${filtered.length} thin/inconsistent groups).`,
        output: { baselines: base, working: [], notWorking: [], filtered, noiseUnits: noise.length },
      };
    }

    const narrated = await this.llm.completeJson<{
      summary: string;
      insights: NarratedInsight[];
    }>('Summarize what marketing is working vs not, as json.', {
      purpose: 'marketing_insights',
      context: { signals, baselines: base },
    });

    const working: NarratedInsight[] = [];
    const notWorking: NarratedInsight[] = [];
    let wrote = 0;
    for (const ins of narrated.insights ?? []) {
      (ins.kind === 'working' ? working : notWorking).push(ins);
      const src = signals.find(
        (s) => s.channel === ins.channel && s.segment === ins.segment,
      );
      const importance = clamp(
        0.55 + Math.abs((src?.effectiveness ?? 1) - 1) * 0.25 + Math.min(src?.posts ?? 0, 8) / 40,
        0.5,
        0.92,
      );
      const body =
        `Marketing learning (${ins.kind === 'working' ? 'what works' : "what doesn't"}) for ${ins.segment} prospects on ${ins.channel}: ${ins.headline}. ${ins.detail} ` +
        `Driver: ${src?.driver ?? 'mixed'} (conversion ${src?.convRate.toFixed(1)}% link→lead, fit-weighted engagement ${src?.qualified.toFixed(2)}/unit, ${(src?.effectiveness ?? 1).toFixed(2)}× blended effectiveness).`;
      await this.ingestion.ingestText(
        body,
        [
          'marketing_insight',
          ins.kind === 'working' ? 'what_works' : 'what_fails',
          'past_performance',
          `segment:${ins.segment}`,
          `channel:${ins.channel}`,
        ],
        {
          segment: ins.segment,
          channel: ins.channel,
          kind: ins.kind,
          driver: src?.driver,
          effectiveness: src?.effectiveness,
        },
        importance,
      );
      wrote += 1;
    }
    await ctx.step(
      'memory',
      `Wrote ${wrote} confirmed learning(s) to the memory bank (importance scaled by effect size).`,
    );
    await ctx.step('output', narrated.summary ?? 'Analysis complete.');

    return {
      summary: `${working.length} working, ${notWorking.length} underperforming across buy-side/sell-side; filtered ${filtered.length} noise groups + ${noise.length} thin units. Wrote ${wrote} learnings to memory.`,
      output: {
        baselines: base,
        working,
        notWorking,
        filtered,
        noiseUnits: noise.length,
        summary: narrated.summary,
      },
    };
  }

  // --- data ------------------------------------------------------------------

  private async loadUnits(): Promise<Unit[]> {
    const [posts, ads, comments] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          status: {
            in: [
              PostStatus.published,
              PostStatus.analyzing,
              PostStatus.underperforming,
              PostStatus.completed,
            ],
          },
        },
        select: {
          id: true,
          platform: true,
          metrics: true,
          campaign: { select: { name: true, audience: true, objective: true } },
        },
      }),
      this.prisma.adCampaign.findMany({
        where: { status: { in: [AdStatus.active, AdStatus.completed] } },
        select: {
          id: true,
          impressions: true,
          clicks: true,
          conversions: true,
          campaign: { select: { name: true, audience: true, objective: true } },
        },
      }),
      this.prisma.audienceComment.findMany({ select: { postId: true, author: true } }),
    ]);

    // Fit-weighted qualified engagement per post (only comments from the right segment count).
    const segByPost = new Map<string, Segment>();
    for (const p of posts) segByPost.set(p.id, segmentOf(p.campaign));
    const qualByPost = new Map<string, number>();
    for (const c of comments) {
      const seg = segByPost.get(c.postId);
      if (!seg) continue;
      const prof = classifyAuthor(c.author);
      if (fitMatchesSegment(prof.fit, seg)) {
        qualByPost.set(c.postId, (qualByPost.get(c.postId) ?? 0) + prof.weight);
      }
    }

    const postUnits: Unit[] = posts.map((p) => {
      const m = this.metricsOf(p.metrics);
      return {
        id: p.id,
        kind: 'post',
        channel: p.platform,
        segment: segmentOf(p.campaign),
        impressions: m.impressions,
        clicks: m.clicks,
        conversions: m.conversions,
        ctr: m.ctr,
        qualEngagement: qualByPost.get(p.id) ?? 0,
      };
    });
    const adUnits: Unit[] = ads.map((a) => ({
      id: a.id,
      kind: 'ad',
      channel: 'Ads',
      segment: segmentOf(a.campaign),
      impressions: a.impressions,
      clicks: a.clicks,
      conversions: a.conversions,
      ctr: computeCtr(a.clicks, a.impressions),
      qualEngagement: 0,
    }));
    return [...postUnits, ...adUnits].filter((u) => u.impressions > 0);
  }

  private baselines(units: Unit[]): { ctr: number; convRate: number; qual: number } {
    const impr = sum(units.map((u) => u.impressions));
    const clicks = sum(units.map((u) => u.clicks));
    const conv = sum(units.map((u) => u.conversions));
    const postUnits = units.filter((u) => u.kind === 'post');
    return {
      ctr: computeCtr(clicks, impr),
      convRate: clicks ? (conv / clicks) * 100 : 0,
      qual: postUnits.length
        ? sum(postUnits.map((u) => u.qualEngagement)) / postUnits.length
        : 0,
    };
  }

  private buildGroups(units: Unit[]): Group[] {
    const byKey = new Map<string, Unit[]>();
    for (const u of units) {
      const key = `${u.segment}|${u.channel}`;
      byKey.set(key, [...(byKey.get(key) ?? []), u]);
    }
    return [...byKey.entries()].map(([key, us]) => {
      const [segment, channel] = key.split('|') as [Segment, string];
      const impressions = sum(us.map((u) => u.impressions));
      const clicks = sum(us.map((u) => u.clicks));
      const conversions = sum(us.map((u) => u.conversions));
      return {
        segment,
        channel,
        units: us,
        impressions,
        clicks,
        conversions,
        ctr: computeCtr(clicks, impressions),
        convRate: clicks ? (conversions / clicks) * 100 : 0,
        qualPerUnit: us.length ? sum(us.map((u) => u.qualEngagement)) / us.length : 0,
        cv: coefficientOfVariation(us.map((u) => u.ctr)),
      };
    });
  }

  /** Composite effectiveness ratio + the dimension that drove it. */
  private effectiveness(
    g: Group,
    base: { ctr: number; convRate: number; qual: number },
  ): { ratio: number; driver: string } {
    const rCtr = base.ctr ? g.ctr / base.ctr : 1;
    const rConv = base.convRate ? g.convRate / base.convRate : 1;
    const rQual = base.qual ? g.qualPerUnit / base.qual : 1;
    // Ads carry no audience-comment signal — reweight onto conversion + reach.
    const ratio =
      g.channel === 'Ads'
        ? 0.3 * rCtr + 0.7 * rConv
        : W_REACH * rCtr + W_CONV * rConv + W_FIT * rQual;
    const contrib: [string, number][] = [
      ['reach', Math.abs(rCtr - 1) * (g.channel === 'Ads' ? 0.3 : W_REACH)],
      ['conversion', Math.abs(rConv - 1) * (g.channel === 'Ads' ? 0.7 : W_CONV)],
      ['audience fit', g.channel === 'Ads' ? 0 : Math.abs(rQual - 1) * W_FIT],
    ];
    const driver = contrib.sort((a, b) => b[1] - a[1])[0][0];
    return { ratio, driver };
  }

  private classify(g: Group, effRatio: number): Verdict {
    if (g.units.length < MIN_UNITS_PER_GROUP) return 'noise';
    if (g.impressions < MIN_IMPRESSIONS_PER_GROUP) return 'noise';
    if (g.cv > MAX_CV) return 'noise';
    if (effRatio >= EFF_HI) return 'working';
    if (effRatio <= EFF_LO) return 'not_working';
    return 'inconclusive';
  }

  private metricsOf(raw: unknown): {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
  } {
    const m = (raw ?? {}) as Record<string, number>;
    return {
      impressions: Number(m.impressions ?? 0),
      clicks: Number(m.clicks ?? 0),
      conversions: Number(m.conversions ?? 0),
      ctr: Number(m.ctr ?? 0),
    };
  }
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = sum(xs) / xs.length;
  if (mean === 0) return 0;
  const variance = sum(xs.map((x) => (x - mean) ** 2)) / xs.length;
  return Math.sqrt(variance) / mean;
}
