import { MockProvider } from './mock.provider';

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  return dot; // vectors are L2-normalized
}

describe('MockProvider', () => {
  const provider = new MockProvider(1536);

  describe('embed', () => {
    it('produces normalized vectors of the configured dimension', async () => {
      const [vec] = await provider.embed(['founder liquidity pre-IPO']);
      expect(vec).toHaveLength(1536);
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('ranks semantically related text higher than unrelated text', async () => {
      const [query] = await provider.embed(['founder liquidity before an IPO']);
      const [related] = await provider.embed([
        'pre-IPO founder liquidity options and selling shares',
      ]);
      const [unrelated] = await provider.embed([
        'best chocolate chip cookie recipe with butter',
      ]);
      expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
    });

    it('is deterministic', async () => {
      const [a] = await provider.embed(['same text']);
      const [b] = await provider.embed(['same text']);
      expect(a).toEqual(b);
    });
  });

  describe('complete', () => {
    it('returns purpose-shaped JSON for content generation', async () => {
      const { content } = await provider.complete(
        [{ role: 'user', content: 'generate posts' }],
        {
          json: true,
          purpose: 'content_generation',
          context: { count: 3, audience: 'founders' },
        },
      );
      const parsed = JSON.parse(content) as { posts: unknown[] };
      expect(parsed.posts).toHaveLength(3);
    });

    it('flags compliance-sensitive language', async () => {
      const { content } = await provider.complete(
        [{ role: 'user', content: 'review' }],
        {
          json: true,
          purpose: 'compliance_review',
          context: {
            copy: 'We guarantee risk-free liquidity for your shares.',
          },
        },
      );
      const parsed = JSON.parse(content) as {
        overallRisk: string;
        flags: unknown[];
      };
      expect(parsed.overallRisk).toBe('high');
      expect(parsed.flags.length).toBeGreaterThan(0);
    });

    it('drives a one-tool then answer loop when tools are provided', async () => {
      const tools = [
        { name: 'searchMemory', description: 'search', parameters: {} },
        { name: 'listCampaigns', description: 'list', parameters: {} },
      ];
      const first = await provider.complete(
        [
          {
            role: 'user',
            content: 'Summarize what we know about sell-side messaging',
          },
        ],
        { tools },
      );
      expect(first.toolCalls?.[0]?.name).toBe('searchMemory');

      const second = await provider.complete(
        [
          {
            role: 'user',
            content: 'Summarize what we know about sell-side messaging',
          },
          { role: 'assistant', content: '' },
          {
            role: 'tool',
            name: 'searchMemory',
            content: 'Sell-side tone is confident and factual.',
          },
        ],
        { tools },
      );
      expect(second.toolCalls).toBeUndefined();
      expect(second.content).toContain('searchMemory');
    });
  });
});
