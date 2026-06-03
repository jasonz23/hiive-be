/**
 * Audience FIT — who is actually engaging matters more than raw social volume.
 * A comment from a venture-fund partner on a buy-side post is worth far more
 * than a like from a random account. Each mock handle maps to a prospect
 * profile, the segment it fits, and an importance weight (0..1).
 *
 * Buy-side = potential buyers of private shares (funds, family offices, etc.).
 * Sell-side = potential sellers of vested equity (employees, founders, etc.).
 */
export type Fit = 'buy_side' | 'sell_side' | 'none';

export interface AuthorProfile {
  handle: string;
  profile: string; // human-readable role
  fit: Fit;
  weight: number; // importance / "fits the mold" 0..1
}

const PROFILES: AuthorProfile[] = [
  // Buy-side prospects (investors / buyers)
  { handle: '@redpoint_gp', profile: 'Venture Fund Partner', fit: 'buy_side', weight: 0.95 },
  { handle: '@institutional_lp', profile: 'Institutional Investor', fit: 'buy_side', weight: 0.92 },
  { handle: '@familyoffice_kr', profile: 'Family Office PM', fit: 'buy_side', weight: 0.9 },
  { handle: '@hedge_analyst', profile: 'Hedge Fund Analyst', fit: 'buy_side', weight: 0.85 },
  { handle: '@accredited_amy', profile: 'Accredited Investor', fit: 'buy_side', weight: 0.7 },
  // Sell-side prospects (holders of equity who may want liquidity)
  { handle: '@founder_jane', profile: 'Early Founder', fit: 'sell_side', weight: 0.9 },
  { handle: '@stripe_earlyemp', profile: 'Startup Employee (vested)', fit: 'sell_side', weight: 0.85 },
  { handle: '@former_cxo', profile: 'Former Executive', fit: 'sell_side', weight: 0.8 },
  { handle: '@seed_fund_gp', profile: 'Early-stage Fund GP (exiting)', fit: 'sell_side', weight: 0.8 },
  { handle: '@angel_dev', profile: 'Angel Investor', fit: 'sell_side', weight: 0.75 },
  // Low-fit / retail noise
  { handle: '@liquidity_curious', profile: 'Curious / Retail', fit: 'none', weight: 0.2 },
  { handle: '@cap_table_nerd', profile: 'Enthusiast', fit: 'none', weight: 0.25 },
  // Legacy handles from earlier seed data — keep them classifiable.
  { handle: '@vc_mike', profile: 'Venture Investor', fit: 'buy_side', weight: 0.85 },
  { handle: '@startup_cto', profile: 'Startup CTO (vested)', fit: 'sell_side', weight: 0.8 },
  { handle: '@earlyemp_sara', profile: 'Early Employee (vested)', fit: 'sell_side', weight: 0.8 },
  { handle: '@preipo_pat', profile: 'Pre-IPO Holder', fit: 'sell_side', weight: 0.65 },
];

const BY_HANDLE = new Map(PROFILES.map((p) => [p.handle, p]));

export const BUY_SIDE_HANDLES = PROFILES.filter((p) => p.fit === 'buy_side').map((p) => p.handle);
export const SELL_SIDE_HANDLES = PROFILES.filter((p) => p.fit === 'sell_side').map((p) => p.handle);
export const NEUTRAL_HANDLES = PROFILES.filter((p) => p.fit === 'none').map((p) => p.handle);

export function classifyAuthor(handle: string): AuthorProfile {
  return (
    BY_HANDLE.get(handle) ?? {
      handle,
      profile: 'Unknown',
      fit: 'none',
      weight: 0.25,
    }
  );
}

/** Does a commenter's fit match the campaign's prospect segment? */
export function fitMatchesSegment(fit: Fit, segment: string): boolean {
  if (segment === 'buy_side') return fit === 'buy_side';
  // sell-side campaigns also cover employees/founders (all sellers)
  if (segment === 'sell_side' || segment === 'employee') return fit === 'sell_side';
  return false;
}
