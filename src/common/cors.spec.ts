import { corsOriginMatcher, parseCorsAllowList } from './cors';

describe('parseCorsAllowList', () => {
  it('parses a comma-separated string', () => {
    expect(parseCorsAllowList('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('parses a JSON array string', () => {
    expect(
      parseCorsAllowList('["https://*.vercel.app","http://localhost:8000"]'),
    ).toEqual(['https://*.vercel.app', 'http://localhost:8000']);
  });

  it('returns [] for empty input', () => {
    expect(parseCorsAllowList('')).toEqual([]);
    expect(parseCorsAllowList(undefined)).toEqual([]);
  });
});

describe('corsOriginMatcher', () => {
  it('matches any subdomain of a wildcard host', () => {
    const ok = corsOriginMatcher(['https://*.vercel.app']);
    expect(ok('https://hiive.vercel.app')).toBe(true);
    expect(ok('https://hiive-fe-git-main-acme.vercel.app')).toBe(true);
    expect(ok('https://a.b.vercel.app')).toBe(true);
  });

  it('rejects look-alike domains', () => {
    const ok = corsOriginMatcher(['https://*.vercel.app']);
    expect(ok('https://vercel.app.evil.com')).toBe(false);
    expect(ok('https://evilvercel.app')).toBe(false);
    expect(ok('http://hiive.vercel.app')).toBe(false); // scheme must match
  });

  it('supports exact origins alongside wildcards', () => {
    const ok = corsOriginMatcher([
      'https://*.vercel.app',
      'http://localhost:8000',
    ]);
    expect(ok('http://localhost:8000')).toBe(true);
    expect(ok('http://localhost:9999')).toBe(false);
  });

  it('allows requests with no Origin header (non-browser)', () => {
    expect(corsOriginMatcher(['https://*.vercel.app'])(undefined)).toBe(true);
  });

  it('"*" allows everything', () => {
    const ok = corsOriginMatcher(['*']);
    expect(ok('https://anything.example.com')).toBe(true);
  });

  it('host-only patterns match any scheme', () => {
    const ok = corsOriginMatcher(['*.vercel.app']);
    expect(ok('http://x.vercel.app')).toBe(true);
    expect(ok('https://x.vercel.app')).toBe(true);
  });
});
