/**
 * Discrete entailment labels via extractStructured (role judge).
 * Code maps labels → scores; only 'entails' clears the 0.8 floor.
 * Forward + reverse framing; disagreement rejects.
 * Context = claim + quote + bounded window — NEVER full sourceText.
 */
import { z } from 'zod';
import { extractStructured } from '../inference/extract-structured.ts';
import {
  buildDecoys,
  checkDecoyDiscrimination,
  type DecoyItem,
  RESEARCH_JUDGE_DISCRIMINATION_FAILED,
  shuffleWithRunId,
} from './decoys.ts';

export const EntailmentLabelSchema = z.enum(['entails', 'partial', 'neutral', 'contradicts']);
export type EntailmentLabel = z.infer<typeof EntailmentLabelSchema>;

export const EntailmentJudgmentSchema = z
  .object({
    label: EntailmentLabelSchema,
  })
  .strict();

export const LABEL_TO_SCORE: Record<EntailmentLabel, number> = {
  entails: 0.9,
  partial: 0.55,
  neutral: 0.1,
  contradicts: 0.05,
};

export function mapLabelToScore(label: EntailmentLabel): number {
  return LABEL_TO_SCORE[label];
}

/** Bound the quote window around the quote in sourceText (chars each side). */
export const ENTAILMENT_WINDOW_CHARS = 240;

export function buildEntailmentWindow(opts: {
  sourceText: string;
  quote: string;
  windowChars?: number;
}): string {
  const windowChars = opts.windowChars ?? ENTAILMENT_WINDOW_CHARS;
  const body = opts.sourceText;
  const idx = body.indexOf(opts.quote);
  if (idx < 0) {
    // Quote may differ by whitespace; fall back to a head slice — caller still
    // must have passed gate verifyQuote separately.
    return body.slice(0, Math.min(body.length, opts.quote.length + windowChars * 2));
  }
  const start = Math.max(0, idx - windowChars);
  const end = Math.min(body.length, idx + opts.quote.length + windowChars);
  return body.slice(start, end);
}

function buildPrompt(
  direction: 'forward' | 'reverse',
  claim: string,
  quote: string,
  window: string
): string {
  if (direction === 'forward') {
    return [
      'Judge whether the QUOTE (in context) entails the CLAIM.',
      'Respond with JSON {"label":"entails"|"partial"|"neutral"|"contradicts"}.',
      'entails = quote clearly supports the claim; contradicts = quote opposes it;',
      'partial = weak/incomplete support; neutral = unrelated.',
      `CLAIM: ${claim}`,
      `QUOTE: ${quote}`,
      `CONTEXT_WINDOW: ${window}`,
    ].join('\n');
  }
  return [
    'Judge whether the CLAIM entails the QUOTE (reverse framing).',
    'Respond with JSON {"label":"entails"|"partial"|"neutral"|"contradicts"}.',
    'entails = claim clearly implies the quote content; contradicts = they conflict;',
    'partial = weak; neutral = unrelated.',
    `CLAIM: ${claim}`,
    `QUOTE: ${quote}`,
    `CONTEXT_WINDOW: ${window}`,
  ].join('\n');
}

export type EntailmentItem = {
  id: string;
  claimText: string;
  quote: string;
  /** Bounded window — never full source. */
  windowText: string;
  kind: 'real' | 'decoy';
};

export type EntailmentScore = {
  id: string;
  kind: 'real' | 'decoy';
  forwardLabel: EntailmentLabel | null;
  reverseLabel: EntailmentLabel | null;
  score: number;
  rejected: boolean;
  reason?: string;
};

export type EntailmentBatchResult = {
  scores: EntailmentScore[];
  discarded: boolean;
  degraded: typeof RESEARCH_JUDGE_DISCRIMINATION_FAILED | null;
  /** Real items only (decoys stripped) when not discarded. */
  admitted: EntailmentScore[];
};

export type JudgeFn = (prompt: string) => Promise<EntailmentLabel>;

async function defaultJudge(prompt: string, extractionId?: string): Promise<EntailmentLabel> {
  const result = await extractStructured(EntailmentJudgmentSchema, prompt, 'judge', extractionId);
  return result.label;
}

async function scoreOne(item: EntailmentItem, judge: JudgeFn): Promise<EntailmentScore> {
  try {
    const forwardLabel = await judge(
      buildPrompt('forward', item.claimText, item.quote, item.windowText)
    );
    const reverseLabel = await judge(
      buildPrompt('reverse', item.claimText, item.quote, item.windowText)
    );

    if (forwardLabel !== reverseLabel) {
      return {
        id: item.id,
        kind: item.kind,
        forwardLabel,
        reverseLabel,
        score: Math.min(mapLabelToScore(forwardLabel), mapLabelToScore(reverseLabel)),
        rejected: true,
        reason: 'forward_reverse_disagreement',
      };
    }

    return {
      id: item.id,
      kind: item.kind,
      forwardLabel,
      reverseLabel,
      score: mapLabelToScore(forwardLabel),
      rejected: false,
    };
  } catch (err) {
    return {
      id: item.id,
      kind: item.kind,
      forwardLabel: null,
      reverseLabel: null,
      score: 0,
      rejected: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Score a batch with decoys shuffled in. Identical-label batches re-run at size 1.
 * Any decoy score ≥ 0.8 discards the whole batch.
 */
export async function scoreEntailmentBatch(opts: {
  runId: string;
  items: Array<Omit<EntailmentItem, 'kind'> & { kind?: 'real' }>;
  judge?: JudgeFn;
  /** Inject decoys (default true). */
  injectDecoys?: boolean;
  /** Test seam: override decoy builder. */
  decoys?: DecoyItem[];
}): Promise<EntailmentBatchResult> {
  const judge = opts.judge ?? ((prompt) => defaultJudge(prompt));
  const reals: EntailmentItem[] = opts.items.map((item) => ({
    ...item,
    kind: 'real' as const,
  }));

  const decoys: EntailmentItem[] =
    opts.injectDecoys === false
      ? []
      : (opts.decoys ?? buildDecoys({ runId: opts.runId, realCount: reals.length })).map((d) => ({
          id: d.id,
          claimText: d.claimText,
          quote: d.quote,
          windowText: d.windowText,
          kind: 'decoy' as const,
        }));

  const mixed = shuffleWithRunId([...reals, ...decoys], opts.runId, 'entailment-batch');

  let scores: EntailmentScore[] = [];
  for (const item of mixed) {
    scores.push(await scoreOne(item, judge));
  }

  // Identical-label batch → re-run each at size 1 for discrimination.
  const realLabels = scores
    .filter((s) => s.kind === 'real' && s.forwardLabel != null)
    .map((s) => s.forwardLabel);
  if (realLabels.length >= 2 && realLabels.every((l) => l === realLabels[0])) {
    const rerun: EntailmentScore[] = [];
    for (const item of mixed) {
      rerun.push(await scoreOne(item, judge));
    }
    scores = rerun;
  }

  const discrimination = checkDecoyDiscrimination(scores);
  if (discrimination.discarded) {
    return {
      scores,
      discarded: true,
      degraded: RESEARCH_JUDGE_DISCRIMINATION_FAILED,
      admitted: [],
    };
  }

  return {
    scores,
    discarded: false,
    degraded: null,
    admitted: scores.filter((s) => s.kind === 'real' && !s.rejected),
  };
}
