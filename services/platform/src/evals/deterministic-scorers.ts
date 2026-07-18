/**
 * obs-4 — Deterministic invariant scorers (independent of judge prose).
 *
 * Fail-closed structural checks for research outputs: non-empty, min length,
 * required citation markers. Results are structured with invariantId so CI
 * can name the exact failure without consulting model-graded scores.
 *
 * Anti-pattern: deriving pass/fail from judge reasoning, soft-warn only.
 */

export const INVARIANT_REQUIRED_CITATION = 'required-citation';
export const INVARIANT_NON_EMPTY = 'non-empty';
export const INVARIANT_MIN_LENGTH = 'min-length';

export type DeterministicFailure = {
  invariantId: string;
  reason: string;
};

export type DeterministicInvariantResult = {
  passed: boolean;
  failures: DeterministicFailure[];
  checks: {
    nonEmpty: boolean;
    minLength: boolean;
    hasCitationMarker: boolean;
    length: number;
  };
  /** Composite 0..1 score (same weights as createResearchInvariantScorer). */
  score: number;
};

const MIN_LENGTH = 80;

/**
 * Citation markers that count as evidence of sourcing.
 * Bare word "sources" without links/numbers is NOT enough.
 */
export function hasCitationMarker(text: string): boolean {
  const trimmed = text.trim();
  return (
    /\[\d+\]/.test(trimmed) ||
    /https?:\/\//i.test(trimmed) ||
    /\bdoi:\s*10\.\d+/i.test(trimmed) ||
    /\bSources:\s*\n/i.test(trimmed) ||
    /\[[^\]]+\]\(https?:\/\//i.test(trimmed)
  );
}

/**
 * Run deterministic structural invariants over research output text.
 * Independent of any model-graded / judge score.
 */
export function runDeterministicInvariants(output: string): DeterministicInvariantResult {
  const trimmed = (output ?? '').trim();
  const nonEmpty = trimmed.length > 0;
  const minLength = trimmed.length >= MIN_LENGTH;
  const cited = hasCitationMarker(trimmed);

  const failures: DeterministicFailure[] = [];
  if (!nonEmpty) {
    failures.push({
      invariantId: INVARIANT_NON_EMPTY,
      reason: 'output is empty',
    });
  }
  if (!minLength) {
    failures.push({
      invariantId: INVARIANT_MIN_LENGTH,
      reason: `output length ${trimmed.length} < ${MIN_LENGTH}`,
    });
  }
  if (!cited) {
    failures.push({
      invariantId: INVARIANT_REQUIRED_CITATION,
      reason: 'missing required citation markers ([n], URL, doi, or Sources: block)',
    });
  }

  let score = 0;
  if (nonEmpty) score += 0.34;
  if (minLength) score += 0.33;
  if (cited) score += 0.33;

  return {
    passed: failures.length === 0,
    failures,
    checks: {
      nonEmpty,
      minLength,
      hasCitationMarker: cited,
      length: trimmed.length,
    },
    score: Math.min(1, Math.max(0, score)),
  };
}
