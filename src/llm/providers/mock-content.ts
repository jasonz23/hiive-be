import { CompleteOptions, MockPurpose } from '../llm.types';

/**
 * Deterministic content engine for the MockProvider. Produces purpose-specific,
 * context-aware marketing output so the entire product is demoable without any
 * API key. Output is shaped to match what each agent parses.
 *
 * Determinism: every pseudo-random choice is seeded from a hash of the input, so
 * the same request always yields the same result (good for tests + repeatable demos).
 */

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function str(
  ctx: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = ctx?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function num(
  ctx: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number {
  const value = ctx?.[key];
  return typeof value === 'number' ? value : fallback;
}

const HOOKS = [
  'Thinking about liquidity before your IPO?',
  'Your equity is worth more than a number on a cap table.',
  'Pre-IPO doesn’t have to mean pre-liquidity.',
  'Founders: your hardest exit decision starts now, not at the bell.',
  'What if you could understand your options before the lock-up ends?',
];

const CTAS = [
  'Understand your options before an IPO →',
  'See what your shares could be worth today →',
  'Talk to a Hiive specialist about founder liquidity →',
  'Get a confidential, no-pressure valuation →',
];

function buildPosts(
  ctx: Record<string, unknown> | undefined,
  seed: number,
): unknown {
  const audience = str(ctx, 'audience', 'startup founders and early employees');
  const tone = str(ctx, 'brandTone', 'confident, clear, and compliance-aware');
  const campaign = str(ctx, 'campaignName', 'Founder Liquidity');
  const count = num(ctx, 'count', 5);
  const platform = str(ctx, 'platform', 'LinkedIn');

  const posts = Array.from({ length: count }).map((_, i) => {
    const s = seed + i * 7;
    const hook = pick(HOOKS, s);
    const cta = pick(CTAS, s + 3);
    return {
      platform: i % 3 === 2 ? 'X' : platform,
      hook,
      copy:
        `${hook}\n\n` +
        `For ${audience}, the window between a late-stage round and an IPO is when ` +
        `real decisions get made. Hiive helps you see what your equity is worth on the ` +
        `private market — with transparent pricing and no obligation.\n\n${cta}`,
      cta,
      rationale:
        `Tone: ${tone}. Leads with a pain point relevant to ${audience}; ` +
        `keeps claims factual to stay compliance-safe; single clear CTA.`,
      campaign,
    };
  });
  return { posts };
}

function buildSimulation(
  ctx: Record<string, unknown> | undefined,
  seed: number,
): unknown {
  const copy = str(ctx, 'copy', '');
  const hasCta = /→|sign up|talk to|see |get |learn/i.test(copy);
  const overpromises =
    /guarantee|guaranteed|risk-free|fastest|best price|will (?:double|increase)/i.test(
      copy,
    );
  const base = 70 + (seed % 18);
  const overallScore = Math.max(
    40,
    Math.min(94, base + (hasCta ? 6 : -4) - (overpromises ? 12 : 0)),
  );

  const personas = [
    {
      persona: 'Growth Marketer Agent',
      score: Math.min(95, overallScore + 4),
      reaction:
        'Strong hook and clear audience targeting. CTA could create more urgency.',
      strengths: ['Clear audience', 'Scroll-stopping hook'],
      risks: hasCta ? ['CTA could be sharper'] : ['No clear CTA'],
    },
    {
      persona: 'Brand Strategist Agent',
      score: overallScore,
      reaction:
        'On-brand: confident without hype. Keeps Hiive’s trusted-marketplace positioning.',
      strengths: ['On-brand tone', 'Consistent positioning'],
      risks: ['Could reference proof points / track record'],
    },
    {
      persona: 'Compliance Risk Agent',
      score: overpromises ? 48 : 86,
      reaction: overpromises
        ? 'Language overpromises liquidity/returns — revise to avoid implied guarantees.'
        : 'No material compliance issues. Claims are factual and appropriately hedged.',
      strengths: overpromises
        ? []
        : ['Factual framing', 'No implied guarantees'],
      risks: overpromises
        ? ['Implies guaranteed liquidity', 'Could be read as investment advice']
        : ['Add standard "not investment advice" context where appropriate'],
    },
    {
      persona: 'Sell-side Prospect Agent',
      score: Math.min(92, overallScore + 2),
      reaction:
        'As a founder, this speaks to me — I’d want to know what my shares are worth.',
      strengths: ['Speaks to founder pain', 'Low-pressure framing'],
      risks: ['Wants reassurance on confidentiality'],
    },
    {
      persona: 'Buy-side Prospect Agent',
      score: Math.max(55, overallScore - 8),
      reaction:
        'Less relevant to me as a buyer; messaging is clearly sell-side oriented.',
      strengths: ['Clear sell-side intent'],
      risks: ['Not targeted at buyers (expected for this campaign)'],
    },
    {
      persona: 'Skeptical Investor Agent',
      score: Math.max(50, overallScore - 12),
      reaction:
        'Sounds promising but I’d challenge any liquidity claim — where’s the proof?',
      strengths: ['Direct value proposition'],
      risks: [
        'Needs evidence / track record',
        overpromises ? 'Feels too good to be true' : 'Could feel generic',
      ],
    },
  ];

  const strengths = [
    'Clear sell-side audience',
    'Strong founder-focused hook',
    hasCta ? 'Has a CTA' : 'Concise copy',
  ];
  const risks = [
    overpromises
      ? 'Slightly overpromises liquidity'
      : 'CTA could be more specific',
    'Could add a concrete proof point',
  ];

  return {
    overallScore,
    personas,
    strengths,
    risks,
    suggestedRevision:
      `${pick(HOOKS, seed)}\n\nHiive shows ${str(ctx, 'audience', 'founders')} what their ` +
      `private shares are actually worth — transparent pricing, no obligation. ` +
      `${pick(CTAS, seed + 1)}`,
    verdict: overallScore >= 75 ? 'approve_with_edits' : 'revise',
  };
}

function buildCompliance(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const copy = str(ctx, 'copy', '');
  const patterns: {
    re: RegExp;
    issue: string;
    suggestion: string;
    severity: string;
  }[] = [
    {
      re: /guarantee|guaranteed/i,
      issue: 'Implies a guaranteed outcome',
      suggestion: 'Replace with "may" / "could" and remove guarantees',
      severity: 'critical',
    },
    {
      re: /risk-free|no risk/i,
      issue: 'Claims absence of risk',
      suggestion: 'Remove; private securities carry risk',
      severity: 'critical',
    },
    {
      re: /best price|highest price/i,
      issue: 'Superlative pricing claim',
      suggestion: 'Use "competitive, transparent pricing"',
      severity: 'warning',
    },
    {
      re: /will (?:double|increase|grow)/i,
      issue: 'Forward-looking return claim',
      suggestion: 'Avoid predicting returns',
      severity: 'critical',
    },
    {
      re: /insider|guaranteed liquidity/i,
      issue: 'Implies guaranteed liquidity',
      suggestion: 'Describe marketplace, not certainty',
      severity: 'warning',
    },
  ];
  const flags = patterns
    .filter((p) => p.re.test(copy))
    .map((p) => ({
      phrase: (copy.match(p.re) ?? [''])[0],
      issue: p.issue,
      suggestion: p.suggestion,
      severity: p.severity,
    }));

  const overallRisk = flags.some((f) => f.severity === 'critical')
    ? 'high'
    : flags.length > 0
      ? 'medium'
      : 'low';

  return {
    overallRisk,
    approved: overallRisk !== 'high',
    flags,
    summary:
      flags.length === 0
        ? 'No compliance-sensitive language detected. Claims appear factual and hedged.'
        : `${flags.length} compliance-sensitive phrase(s) detected (${overallRisk} risk).`,
  };
}

function buildPlanner(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const objective = str(ctx, 'objective', 'Increase inbound founder leads');
  return {
    rationale:
      `To achieve "${objective}", retrieve brand + compliance memory first, study past ` +
      `campaign performance, then generate and de-risk content before anything is published.`,
    steps: [
      {
        order: 1,
        agent: 'MemoryRetrievalAgent',
        action: 'Load brand voice, compliance rules, and buyer personas',
        requiresApproval: false,
      },
      {
        order: 2,
        agent: 'CampaignStrategyAgent',
        action: 'Analyze past campaigns and draft campaign plan + goals',
        requiresApproval: false,
      },
      {
        order: 3,
        agent: 'ContentGenerationAgent',
        action: 'Generate channel-specific posts grounded in brand memory',
        requiresApproval: false,
      },
      {
        order: 4,
        agent: 'ComplianceReviewAgent',
        action: 'Flag compliance-sensitive language and require fixes',
        requiresApproval: false,
      },
      {
        order: 5,
        agent: 'SocialSimulationSwarmAgent',
        action: 'Simulate audience reactions across 6 personas and score',
        requiresApproval: false,
      },
      {
        order: 6,
        agent: 'ApprovalGate',
        action: 'Create approval requests for publishing posts',
        requiresApproval: true,
      },
    ],
  };
}

function buildPerformance(
  ctx: Record<string, unknown> | undefined,
  seed: number,
): unknown {
  const ctr = num(ctx, 'ctr', 0.9);
  const goalCtr = num(ctx, 'goalCtr', 2.0);
  const channel = str(ctx, 'platform', 'LinkedIn');
  const underCta = ctr < goalCtr;
  return {
    severity: ctr < goalCtr * 0.5 ? 'critical' : underCta ? 'warning' : 'info',
    issue: `${channel} posts are getting impressions but click-through is ${ctr.toFixed(2)}% vs a ${goalCtr.toFixed(2)}% goal.`,
    likelyCause:
      'The CTA is too generic and does not clearly explain the value to sellers; messaging is not founder-specific enough.',
    recommendedActions: [
      'Rewrite the CTA around "understand your options before an IPO"',
      'Test founder-focused messaging that names the liquidity decision directly',
      'Pause the lowest-performing creative and reallocate impressions',
      'Generate 3 new post variants with sharper hooks',
    ],
    rewrittenCta: pick(CTAS, seed),
  };
}

function buildAds(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  return {
    bestChannel: str(ctx, 'bestChannel', 'LinkedIn'),
    weakAds: [
      {
        reason: 'CTR below 0.6% with above-average spend',
        action: 'Pause and replace creative',
      },
    ],
    budgetReallocation: [
      {
        from: 'X',
        to: 'LinkedIn',
        amountPct: 20,
        reason: 'LinkedIn CPA is 2.3x more efficient for sell-side leads',
      },
    ],
    creativeTests: [
      'Founder testimonial vs. value-prop headline',
      'Question hook vs. statement hook',
    ],
    audienceRecommendations: [
      'Narrow to Series B–D employees with >2yr tenure',
      'Exclude already-converted segments',
    ],
  };
}

function buildViral(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const currentCtr = num(ctx, 'ctr', 8);
  const expectedCtr = num(ctx, 'expectedCtr', 2);
  const isSpike = currentCtr >= expectedCtr * 2;
  return {
    isSpike,
    expectedCtr,
    currentCtr,
    headline: isSpike
      ? `Engagement spike detected: ${currentCtr.toFixed(1)}% CTR vs ${expectedCtr.toFixed(1)}% expected`
      : 'Performance within expected range',
    recommendations: isSpike
      ? [
          'Create 3 variants of the winning post',
          'Increase budget on the promoting ad by 25%',
          'Repurpose to LinkedIn + Email',
          'Brief the replication agent',
        ]
      : ['Continue monitoring'],
  };
}

function buildReplication(
  ctx: Record<string, unknown> | undefined,
  seed: number,
): unknown {
  const copy = str(
    ctx,
    'copy',
    'Hiive helps founders understand pre-IPO liquidity options.',
  );
  const base = copy.split('\n')[0];
  return {
    variants: [
      {
        channel: 'LinkedIn',
        copy: `${base}\n\nA thread for founders weighing liquidity before an IPO 👇\n\n${pick(CTAS, seed)}`,
      },
      { channel: 'X', copy: `${base} ${pick(CTAS, seed + 1)}` },
      {
        channel: 'Email',
        copy: `Subject: Your equity, before the IPO\n\nHi {{first_name}},\n\n${base}\n\n${pick(CTAS, seed + 2)}`,
      },
      { channel: 'Ad', copy: `${pick(HOOKS, seed)} ${pick(CTAS, seed + 3)}` },
      {
        channel: 'Blog',
        copy: `# ${base}\n\nFor founders, the path to liquidity is rarely a straight line...`,
      },
    ],
  };
}

function buildReflection(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const agentType = str(ctx, 'agentType', 'ContentGenerationAgent');
  const approved = ctx?.approved === true;
  return {
    whatWorked: approved
      ? 'Brand-grounded hooks and a single clear CTA passed human review without edits.'
      : 'Audience targeting and structure were solid.',
    whatFailed: approved
      ? 'Minor: some CTAs were generic on the first pass.'
      : 'Hook was weak and the CTA was too generic for sellers.',
    improvement:
      'Lead with concrete founder pain points and make the CTA action-specific ("understand your options before an IPO").',
    reflection: `${agentType}: ${approved ? 'reinforce successful pattern' : 'adjust hook and CTA strategy'} on future runs.`,
    score: approved ? 0.86 : 0.62,
  };
}

function buildCampaignSummary(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const name = str(ctx, 'campaignName', 'Founder Liquidity Campaign');
  return {
    summary:
      `${name} is targeting ${str(ctx, 'audience', 'founders and early employees')} across ` +
      `${str(ctx, 'channels', 'LinkedIn, Email, and X')}. Impressions are tracking to plan, but ` +
      `click-through is below target — the messaging needs sharper, seller-specific CTAs.`,
    highlights: [
      'Impressions on pace with goal',
      'Strong brand consistency across posts',
    ],
    risks: [
      'CTR below target on LinkedIn',
      'Lead volume trailing the 3-day checkpoint',
    ],
    nextActions: [
      'Rewrite CTAs',
      'Run swarm simulation on 3 new variants',
      'Pause weakest ad creative',
    ],
  };
}

function buildEngagementSummary(
  ctx: Record<string, unknown> | undefined,
  seed: number,
): unknown {
  const neg = num(ctx, 'negative', 0);
  const pos = num(ctx, 'positive', 0);
  const neu = num(ctx, 'neutral', 0);
  const topTheme = str(ctx, 'topTheme', 'pricing');
  const negativeSpike = neg > pos && neg >= 2;
  const sentiment = negativeSpike
    ? 'negative'
    : pos >= neg
      ? 'positive'
      : 'mixed';
  const replyByTheme: Record<string, string> = {
    pricing:
      'Great question — pricing is transparent with no hidden fees; happy to share specifics.',
    risk: 'Totally fair concern. Private shares carry risk; we focus on transparency, not guarantees.',
    compliance:
      'We keep everything compliant and factual — no guarantees, just a transparent marketplace.',
    eligibility:
      'We support founders and employees with vested equity — happy to confirm your case.',
    trust:
      'Appreciate the skepticism — here’s how the marketplace actually works, no hype.',
    value:
      'Thanks! Glad it resonates — let us know if you’d like a walkthrough.',
    reach: 'Thank you for sharing! 🙏',
  };
  const reply = replyByTheme[topTheme] ?? replyByTheme.trust;

  return {
    sentiment,
    summary:
      `Audience reaction is ${sentiment}: ${pos} positive, ${neu} neutral, ${neg} negative. ` +
      `The recurring theme is "${topTheme}".` +
      (negativeSpike
        ? ' A negative spike around objections needs attention.'
        : ''),
    themes: [topTheme, 'liquidity', 'transparency'].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
    replies: [
      { label: 'Helpful', text: reply },
      {
        label: 'Concise',
        text: pick([reply.split('.')[0] + '.', 'Happy to help — DM us.'], seed),
      },
      {
        label: 'Invite',
        text: 'Good question — want a quick walkthrough? Sending you a note.',
      },
    ],
    objection: negativeSpike ? topTheme : null,
    copySuggestion: negativeSpike
      ? `Pre-empt the "${topTheme}" objection up front: lead with transparency and a single clear, no-pressure CTA.`
      : null,
  };
}

interface InsightSignal {
  kind: 'working' | 'not_working';
  segment: string;
  channel: string;
  convRate: number;
  qualified: number;
  effectiveness: number;
  driver: string;
  posts: number;
}

/**
 * Narrates the analyzer's already-computed signals (signal vs noise is decided
 * deterministically upstream — this only phrases the confirmed patterns).
 */
function buildMarketingInsights(
  ctx: Record<string, unknown> | undefined,
  _seed: number,
): unknown {
  const signals = Array.isArray(ctx?.signals)
    ? (ctx?.signals as InsightSignal[])
    : [];
  const insights = signals.map((s) => {
    const headline =
      s.kind === 'working'
        ? `${s.channel} converts ${s.segment} prospects well`
        : `${s.channel} is underperforming with ${s.segment} prospects`;
    const detail =
      s.kind === 'working'
        ? `Across ${s.posts} units it runs at ${s.effectiveness.toFixed(2)}× blended effectiveness, driven by ${s.driver} (${s.convRate.toFixed(1)}% link→lead, fit-weighted engagement ${s.qualified.toFixed(2)}/unit). Double down on ${s.channel} for ${s.segment} prospects.`
        : `Across ${s.posts} units it runs at only ${s.effectiveness.toFixed(2)}× blended effectiveness — weak ${s.driver} (${s.convRate.toFixed(1)}% link→lead, fit-weighted engagement ${s.qualified.toFixed(2)}/unit). Rework messaging or shift spend away from ${s.channel} for ${s.segment} prospects.`;
    return {
      kind: s.kind,
      segment: s.segment,
      channel: s.channel,
      headline,
      detail,
    };
  });
  const working = insights.filter((i) => i.kind === 'working').length;
  const summary = signals.length
    ? `${working} segment/channel combos converting well, ${insights.length - working} underperforming — weighted by who actually converts, with low-sample one-offs filtered as noise.`
    : 'Not enough reliable data to separate signal from noise yet.';
  return { summary, insights };
}

const BUILDERS: Record<
  MockPurpose,
  (ctx: Record<string, unknown> | undefined, _seed: number) => unknown
> = {
  planner: buildPlanner,
  content_generation: buildPosts,
  compliance_review: buildCompliance,
  social_simulation: buildSimulation,
  performance_analysis: buildPerformance,
  ads_analysis: buildAds,
  viral_opportunity: buildViral,
  replication: buildReplication,
  reflection: buildReflection,
  campaign_summary: buildCampaignSummary,
  engagement_summary: buildEngagementSummary,
  marketing_insights: buildMarketingInsights,
  chat: () => ({ answer: 'See tool results.' }),
};

/**
 * Returns a deterministic JSON string for the requested purpose, templated from
 * the provided context.
 */
export function generateMockJson(
  options: CompleteOptions,
  seedSource: string,
): string {
  const purpose = options.purpose ?? 'chat';
  const seed = hashString(seedSource + purpose);
  const builder = BUILDERS[purpose] ?? BUILDERS.chat;
  return JSON.stringify(builder(options.context, seed));
}

/** Free-text fallback used when JSON output is not requested. */
export function generateMockText(
  options: CompleteOptions,
  seedSource: string,
): string {
  const seed = hashString(seedSource);
  const ctx = options.context;
  return (
    `${pick(HOOKS, seed)}\n\n` +
    `For ${str(ctx, 'audience', 'founders and early employees')}, Hiive provides transparent ` +
    `pricing on the private market with no obligation.\n\n${pick(CTAS, seed + 1)}`
  );
}
