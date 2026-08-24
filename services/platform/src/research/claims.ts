/**
 * Offset-based claim extraction via extractStructured (role divergent).
 * quote = passage.text.slice(quoteStart, quoteEnd); out-of-range dropped.
 * component not in frozen set dropped.
 * Empty model output throws unless the passage truly has no extractable claim.
 */
import { z } from 'zod';
import { ExtractionFailedError, extractStructured } from '../inference/extract-structured.ts';
import type { FrozenComponents } from './components.ts';
import { normalizeQuote } from './quote-match.ts';

export const ClaimExtractionItemSchema = z
  .object({
    claimText: z.string().min(1),
    component: z.string().min(1),
    quoteStart: z.number().int().nonnegative(),
    quoteEnd: z.number().int().positive(),
  })
  .strict();

export const ClaimExtractionResultSchema = z
  .object({
    claims: z.array(ClaimExtractionItemSchema),
  })
  .strict();

export type ClaimExtractionItem = z.infer<typeof ClaimExtractionItemSchema>;

export type ExtractedClaim = {
  claimText: string;
  component: string;
  quote: string;
  quoteStart: number;
  quoteEnd: number;
};

export class ClaimExtractionParseError extends Error {
  readonly code = 'RESEARCH_CLAIM_EXTRACTION_PARSE_FAILED' as const;
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ClaimExtractionParseError';
  }
}

function buildClaimPrompt(opts: {
  passageText: string;
  components: readonly string[];
  question: string;
}): string {
  return [
    'Extract atomic factual claims supported by the PASSAGE.',
    'Each claim must cite a contiguous quote via character offsets into PASSAGE.',
    `Allowed components (use exactly one per claim): ${opts.components.join(', ')}`,
    'Extract at most 6 claims — the highest-signal factual claims only, no padding.',
    'Respond with JSON: {"claims":[{"claimText":"...","component":"...","quoteStart":0,"quoteEnd":10}]}',
    'quoteStart inclusive, quoteEnd exclusive, 0-based into PASSAGE.',
    'If the passage contains no factual claim relevant to the question, return {"claims":[]}.',
    `QUESTION: ${opts.question}`,
    `PASSAGE:\n${opts.passageText}`,
  ].join('\n');
}

/**
 * Slice + validate model offsets against passage text and frozen components.
 */
export function materializeClaims(opts: {
  passageText: string;
  frozen: FrozenComponents;
  raw: ClaimExtractionItem[];
}): ExtractedClaim[] {
  const allowed = new Set(opts.frozen.components);
  const out: ExtractedClaim[] = [];
  for (const item of opts.raw) {
    if (!allowed.has(item.component)) continue;
    if (item.quoteEnd <= item.quoteStart) continue;
    if (item.quoteStart < 0 || item.quoteEnd > opts.passageText.length) continue;
    const quote = opts.passageText.slice(item.quoteStart, item.quoteEnd);
    if (normalizeQuote(quote).replace(/ /g, '').length < 12) continue;
    out.push({
      claimText: item.claimText.trim(),
      component: item.component,
      quote,
      quoteStart: item.quoteStart,
      quoteEnd: item.quoteEnd,
    });
  }
  return out;
}

/**
 * Extract claims from a passage. Distinguishes parse failure (throws) from
 * honest zero-claims (empty array when model returns {"claims":[]}).
 */
export async function extractClaimsFromPassage(opts: {
  passageText: string;
  frozen: FrozenComponents;
  question: string;
  extractionId?: string;
}): Promise<ExtractedClaim[]> {
  const prompt = buildClaimPrompt({
    passageText: opts.passageText,
    components: opts.frozen.components,
    question: opts.question,
  });

  let parsed: z.infer<typeof ClaimExtractionResultSchema>;
  try {
    parsed = await extractStructured(
      ClaimExtractionResultSchema,
      prompt,
      'divergent',
      opts.extractionId,
      // 6-claim cap → ~1-2K output tokens; the local fleet runs 5-25 tok/s so
      // uncapped extraction (6-10K tokens observed) always blew the timeout.
      { maxOutputTokens: 2048 }
    );
  } catch (err) {
    if (err instanceof ExtractionFailedError) {
      throw new ClaimExtractionParseError(
        `claim extraction failed after ${err.attempts} attempts`,
        err
      );
    }
    throw new ClaimExtractionParseError(err instanceof Error ? err.message : String(err), err);
  }

  // Schema-valid empty claims is honest zero — not a soft-empty success on failure.
  return materializeClaims({
    passageText: opts.passageText,
    frozen: opts.frozen,
    raw: parsed.claims,
  });
}
