/**
 * Deterministic mock audience/social comments — stands in for pulling real
 * platform engagement (replies/mentions). Sentiment skews with how the post is
 * doing: viral → more praise, underperforming → more objections. Replaced by
 * real platform APIs later (same shape).
 */

import {
  BUY_SIDE_HANDLES,
  NEUTRAL_HANDLES,
  SELL_SIDE_HANDLES,
} from './audience-fit';

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type CommentSegment = 'buy_side' | 'sell_side' | 'employee' | 'other';

export interface MockAudienceComment {
  author: string;
  text: string;
  sentiment: Sentiment;
  theme: string;
}

/**
 * The handle pool skews by the post's prospect segment — buy-side posts draw
 * investor profiles, sell-side posts draw equity-holder profiles — plus some
 * low-fit/retail noise either way (so audience fit can be measured, not assumed).
 */
function handlePool(segment: CommentSegment): string[] {
  const core =
    segment === 'buy_side'
      ? BUY_SIDE_HANDLES
      : segment === 'sell_side' || segment === 'employee'
        ? SELL_SIDE_HANDLES
        : [...BUY_SIDE_HANDLES, ...SELL_SIDE_HANDLES];
  // Weight toward on-segment profiles, but keep retail noise in the mix.
  return [...core, ...core, ...NEUTRAL_HANDLES];
}

const POOL: Record<Sentiment, { text: string; theme: string }[]> = {
  positive: [
    {
      text: 'This is exactly what founders need before an IPO. 🙌',
      theme: 'value',
    },
    {
      text: 'Finally a clear way to think about pre-IPO liquidity.',
      theme: 'value',
    },
    { text: 'Sharing this with my whole team.', theme: 'reach' },
    { text: 'The transparency here is refreshing.', theme: 'trust' },
  ],
  neutral: [
    { text: 'How does the pricing actually work?', theme: 'pricing' },
    { text: 'Is this available outside the US?', theme: 'eligibility' },
    { text: 'What’s the minimum to get started?', theme: 'pricing' },
    {
      text: 'Do you support secondary sales for employees too?',
      theme: 'eligibility',
    },
  ],
  negative: [
    { text: 'Sounds a bit too good to be true tbh.', theme: 'trust' },
    { text: 'Isn’t selling pre-IPO shares really risky?', theme: 'risk' },
    {
      text: 'The fees on these marketplaces are usually brutal.',
      theme: 'pricing',
    },
    { text: 'How is any of this even compliant?', theme: 'compliance' },
  ],
};

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * @param skew 'viral' | 'underperforming' | 'normal' — shifts the sentiment mix.
 */
export function generateAudienceComments(
  seedBase: string,
  count: number,
  skew: 'viral' | 'underperforming' | 'normal',
  segment: CommentSegment = 'other',
): MockAudienceComment[] {
  const handles = handlePool(segment);
  const order: Sentiment[] =
    skew === 'viral'
      ? ['positive', 'positive', 'neutral', 'negative']
      : skew === 'underperforming'
        ? ['negative', 'negative', 'neutral', 'positive']
        : ['neutral', 'positive', 'negative', 'neutral'];

  return Array.from({ length: count }).map((_, i) => {
    const seed = hash(`${seedBase}:${i}`);
    const sentiment = order[seed % order.length];
    const pick = POOL[sentiment][(seed >> 3) % POOL[sentiment].length];
    return {
      author: handles[seed % handles.length],
      text: pick.text,
      sentiment,
      theme: pick.theme,
    };
  });
}
