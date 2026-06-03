/**
 * CORS allow-list parsing + matching with wildcard support.
 *
 * Entries may be:
 *   - an exact origin            "https://app.example.com"
 *   - a wildcard pattern         "https://*.vercel.app"  (any subdomain)
 *   - a host-only pattern        "*.vercel.app"          (any scheme)
 *   - "*"                        allow everything
 *
 * The raw env value can be a comma-separated string OR a JSON array string
 * (e.g. '["https://*.vercel.app","http://localhost:8000"]').
 */
export function parseCorsAllowList(raw?: string): string[] {
  const value = (raw ?? '').trim();
  if (!value) return [];
  if (value.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(value);
      if (Array.isArray(arr)) {
        return arr.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* fall through to comma-split */
    }
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A predicate that tests an incoming Origin header against the allow-list. */
export function corsOriginMatcher(
  allowList: string[],
): (origin?: string) => boolean {
  if (allowList.includes('*')) return () => true;
  const patterns = allowList.map(patternToRegExp);
  return (origin?: string): boolean => {
    // No Origin header → non-browser / same-origin request; allow it.
    if (!origin) return true;
    return patterns.some((re) => re.test(origin));
  };
}

/** Turn an allow-list entry into an anchored, case-insensitive RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const hasScheme = pattern.includes('://');
  // Escape regex specials, then turn `*` into `.*`.
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  // Host-only patterns match any http(s) scheme.
  const body = hasScheme ? escaped : `https?://${escaped}`;
  return new RegExp(`^${body}$`, 'i');
}
