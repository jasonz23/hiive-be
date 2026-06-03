import { decode, encode } from 'gpt-tokenizer';

export interface TextChunk {
  content: string;
  tokenCount: number;
  index: number;
}

export interface ChunkOptions {
  /** Target tokens per chunk. */
  maxTokens?: number;
  /** Token overlap between consecutive chunks (preserves context across splits). */
  overlap?: number;
}

/**
 * Token-aware splitter. Splits on token boundaries with overlap so retrieval
 * chunks never cut mid-token and adjacent chunks share context.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const maxTokens = options.maxTokens ?? 400;
  const overlap = options.overlap ?? 50;
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const tokens = encode(normalized);
  if (tokens.length <= maxTokens) {
    return [{ content: normalized, tokenCount: tokens.length, index: 0 }];
  }

  const chunks: TextChunk[] = [];
  const step = Math.max(1, maxTokens - overlap);
  let index = 0;

  for (let start = 0; start < tokens.length; start += step) {
    const slice = tokens.slice(start, start + maxTokens);
    if (slice.length === 0) break;
    chunks.push({
      content: decode(slice).trim(),
      tokenCount: slice.length,
      index: index++,
    });
    if (start + maxTokens >= tokens.length) break;
  }

  return chunks;
}

export function countTokens(text: string): number {
  return encode(text).length;
}
