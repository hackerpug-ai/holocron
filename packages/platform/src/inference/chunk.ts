/**
 * Passage chunker — ~512-token self-locating passages with overlap.
 *
 * search-1 / CAP-EMB-01 / T-DATA-009:
 *   Splits documents so a relevant span past character 8000 lands in its own
 *   passage (defeats the old 8K whole-document truncation).
 *
 * Pure helper: returns plain objects. Persistence to `passages` is search-2.
 */

/** Approximate characters per token for English prose (tokenizer-free estimate). */
export const CHARS_PER_TOKEN = 4;

export type ChunkDocumentOptions = {
  /** Document title used in situatingHeader (self-locating context). */
  title?: string;
  /** Max tokens per passage (default 512). */
  maxTokens?: number;
  /** Overlap in tokens between consecutive passages (default 64). */
  overlap?: number;
};

export type PassageChunk = {
  /** Passage body (document text slice, without the situating header). */
  text: string;
  /** 0-based order within the source document. */
  ordinal: number;
  /** Estimated token count of `text` (must be ≤ maxTokens). */
  tokenCount: number;
  /** Inclusive character offset in the original document. */
  startOffset: number;
  /** Exclusive character offset in the original document. */
  endOffset: number;
  /**
   * Self-locating header so a chunk can stand alone at retrieve time.
   * Always non-empty when a passage is returned; includes title when provided.
   */
  situatingHeader: string;
};

/**
 * Estimate token count from character length (same heuristic used for packing).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

/**
 * Build a non-empty situating header so every passage is self-locating.
 */
export function buildSituatingHeader(opts: {
  title?: string;
  ordinal: number;
  total?: number;
}): string {
  const title = (opts.title ?? '').trim() || 'Untitled';
  const index = opts.ordinal + 1;
  if (opts.total !== undefined && opts.total > 0) {
    return `Document: ${title} | Passage ${index}/${opts.total}`;
  }
  return `Document: ${title} | Passage ${index}`;
}

/**
 * Split `text` into ~maxTokens passages with overlap and situating headers.
 *
 * - Empty / whitespace-only input → []
 * - Short text fitting in one window → single passage, ordinal 0
 * - Long docs → ≥2 passages; content past char 8000 survives in later passages
 *
 * Token accounting uses CHARS_PER_TOKEN so packing and tokenCount stay consistent.
 */
export function chunkDocument(text: string, opts: ChunkDocumentOptions = {}): PassageChunk[] {
  const maxTokens = opts.maxTokens ?? 512;
  const overlap = opts.overlap ?? 64;

  if (maxTokens <= 0) {
    throw new Error(`chunkDocument: maxTokens must be positive (got ${maxTokens})`);
  }
  if (overlap < 0 || overlap >= maxTokens) {
    throw new Error(
      `chunkDocument: overlap must be in [0, maxTokens) (got overlap=${overlap}, maxTokens=${maxTokens})`
    );
  }

  // Empty / whitespace-only → zero passages (AC-3).
  if (text.length === 0 || text.trim().length === 0) {
    return [];
  }

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;
  const stride = Math.max(1, maxChars - overlapChars);

  // First pass: collect raw text windows.
  const windows: Array<{ text: string; startOffset: number }> = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    // Prefer breaking on whitespace near the window end (structure-aware soft break).
    let sliceEnd = end;
    if (end < text.length) {
      const searchFrom = Math.max(start + Math.floor(maxChars * 0.6), start + 1);
      const window = text.slice(searchFrom, end);
      const lastBreak = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf(' ')
      );
      if (lastBreak > 0) {
        sliceEnd = searchFrom + lastBreak + 1;
      }
    }
    const slice = text.slice(start, sliceEnd);
    if (slice.length > 0) {
      windows.push({ text: slice, startOffset: start });
    }
    if (sliceEnd >= text.length) break;
    // Advance with overlap: next start rewinds by overlapChars from sliceEnd.
    const next = sliceEnd - overlapChars;
    start = next <= start ? sliceEnd : next;
  }

  // Safety: if soft-break logic produced nothing, fall back to hard windows.
  if (windows.length === 0) {
    for (let i = 0; i < text.length; i += stride) {
      windows.push({
        text: text.slice(i, Math.min(i + maxChars, text.length)),
        startOffset: i,
      });
    }
  }

  const total = windows.length;
  const passages: PassageChunk[] = windows.map((window, ordinal) => {
    // Clamp to maxTokens if soft break still overshot (shouldn't, but belt-and-suspenders).
    let body = window.text;
    let tokenCount = estimateTokenCount(body);
    if (tokenCount > maxTokens) {
      body = body.slice(0, maxChars);
      tokenCount = estimateTokenCount(body);
      // Hard cap: if still over (e.g. empty edge), truncate by chars strictly.
      while (tokenCount > maxTokens && body.length > 0) {
        body = body.slice(0, Math.max(0, body.length - CHARS_PER_TOKEN));
        tokenCount = estimateTokenCount(body);
      }
    }
    return {
      text: body,
      ordinal,
      tokenCount: Math.min(tokenCount, maxTokens),
      startOffset: window.startOffset,
      endOffset: window.startOffset + body.length,
      situatingHeader: buildSituatingHeader({ title: opts.title, ordinal, total }),
    };
  });

  return passages;
}
