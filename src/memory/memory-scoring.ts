/**
 * Human-like memory scoring. Retrieval blends three signals:
 *  - relevance  : semantic similarity to the query (pgvector cosine)
 *  - importance : the stored tier (0..1), set at upload, evolved by agents
 *  - recency    : newer memory is favored — BUT important memory resists decay,
 *                 so a very important old fact stays strong.
 */

const HALF_LIFE_DAYS = 21;

export function recencyScore(createdAt: Date, importance: number): number {
  const ageDays = Math.max(
    0,
    (Date.now() - new Date(createdAt).getTime()) / 86_400_000,
  );
  const base = Math.pow(0.5, ageDays / HALF_LIFE_DAYS); // 1.0 fresh → 0.5 at 21d
  // Important memory decays little; unimportant memory fades with age.
  return Number((base + (1 - base) * clamp01(importance)).toFixed(4));
}

export function retrievalScore(
  relevance: number,
  importance: number,
  recency: number,
): number {
  return Number(
    (0.6 * relevance + 0.25 * clamp01(importance) + 0.15 * recency).toFixed(4),
  );
}

export function importanceTier(
  importance: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (importance >= 0.85) return 'critical';
  if (importance >= 0.6) return 'high';
  if (importance >= 0.35) return 'medium';
  return 'low';
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
