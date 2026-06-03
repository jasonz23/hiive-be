/**
 * Prospect segment for a campaign — the product is about buy-side vs sell-side
 * marketing, so we classify each campaign into a segment (derived from its
 * name/audience/objective, no extra schema needed).
 */
export type Segment = 'buy_side' | 'sell_side' | 'employee' | 'other';

export const SEGMENT_LABEL: Record<Segment, string> = {
  buy_side: 'buy-side',
  sell_side: 'sell-side',
  employee: 'employee',
  other: 'general',
};

export function segmentOf(campaign: {
  name?: string | null;
  audience?: string | null;
  objective?: string | null;
}): Segment {
  const t =
    `${campaign.name ?? ''} ${campaign.audience ?? ''} ${campaign.objective ?? ''}`.toLowerCase();
  if (/buy-?side|investor|accredited|\bfund/.test(t)) return 'buy_side';
  if (/sell-?side|seller|founder/.test(t)) return 'sell_side';
  if (/employee/.test(t)) return 'employee';
  return 'other';
}
