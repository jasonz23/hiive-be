import { chunkText, countTokens } from './chunk';

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hiive brand voice: confident and clear.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].tokenCount).toBeGreaterThan(0);
  });

  it('returns empty array for blank input', () => {
    expect(chunkText('   ')).toEqual([]);
  });

  it('splits long text into multiple overlapping chunks', () => {
    const longText = Array.from(
      { length: 600 },
      (_, i) => `sentence-${i}`,
    ).join(' ');
    const chunks = chunkText(longText, { maxTokens: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.tokenCount).toBeLessThanOrEqual(100));
    // indices are sequential
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it('countTokens is consistent with chunk token counts', () => {
    const text = 'Pre-IPO founder liquidity on the private market.';
    expect(countTokens(text)).toBe(chunkText(text)[0].tokenCount);
  });
});
