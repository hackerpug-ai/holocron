/**
 * RunId-seeded decoys for entailment discrimination control.
 * K = max(2, ceil(N/8)); any decoy mapped score ≥ 0.8 discards the whole batch.
 */

export const RESEARCH_JUDGE_DISCRIMINATION_FAILED = 'RESEARCH_JUDGE_DISCRIMINATION_FAILED' as const;

export type DecoyItem = {
  id: string;
  kind: 'decoy';
  claimText: string;
  quote: string;
  windowText: string;
};

/** Mulberry32 — deterministic PRNG from a string seed (runId). */
export function createRunIdPrng(runId: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < runId.length; i++) {
    h ^= runId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function decoyCountForBatch(n: number): number {
  if (n <= 0) return 0;
  return Math.max(2, Math.ceil(n / 8));
}

const DECOY_CLAIMS = [
  'The moon is made of green cheese according to 18th-century satire.',
  'Unicorns are the primary pollinators of alpine meadows.',
  'The Pacific Ocean freezes solid every February at the equator.',
  'Quantum bananas spontaneously generate Wi-Fi signals.',
  'Ancient Romans powered chariots with lithium-ion batteries.',
] as const;

const DECOY_QUOTES = [
  'No credible source supports this decoy claim; it is a discrimination control.',
  'This paragraph intentionally contradicts the decoy claim for control purposes.',
  'Laboratory measurements refute the decoy assertion under all tested conditions.',
  'Peer review discarded the decoy hypothesis as nonsensical.',
  'The archival record contains no evidence for the decoy statement.',
] as const;

export function buildDecoys(opts: {
  runId: string;
  realCount: number;
  startIndex?: number;
}): DecoyItem[] {
  const k = decoyCountForBatch(opts.realCount);
  const rng = createRunIdPrng(`${opts.runId}:decoys`);
  const start = opts.startIndex ?? 0;
  const out: DecoyItem[] = [];
  for (let i = 0; i < k; i++) {
    const claimIdx = Math.floor(rng() * DECOY_CLAIMS.length) % DECOY_CLAIMS.length;
    const quoteIdx = Math.floor(rng() * DECOY_QUOTES.length) % DECOY_QUOTES.length;
    const claimText = DECOY_CLAIMS[claimIdx] ?? DECOY_CLAIMS[0];
    const quote = DECOY_QUOTES[quoteIdx] ?? DECOY_QUOTES[0];
    out.push({
      id: `decoy-${opts.runId.slice(0, 8)}-${start + i}`,
      kind: 'decoy',
      claimText,
      quote,
      windowText: `${quote} Surrounding control text for decoy ${start + i}.`,
    });
  }
  return out;
}

/** Fisher–Yates shuffle with runId-seeded PRNG. */
export function shuffleWithRunId<T>(items: T[], runId: string, salt = 'shuffle'): T[] {
  const rng = createRunIdPrng(`${runId}:${salt}`);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    const swap = arr[j];
    if (tmp === undefined || swap === undefined) continue;
    arr[i] = swap;
    arr[j] = tmp;
  }
  return arr;
}

export type DiscriminationCheck = {
  discarded: boolean;
  degraded: typeof RESEARCH_JUDGE_DISCRIMINATION_FAILED | null;
  offendingDecoyIds: string[];
};

/**
 * If any decoy was mapped to score ≥ 0.8, discard the whole batch.
 */
export function checkDecoyDiscrimination(
  scored: ReadonlyArray<{ id: string; kind: 'real' | 'decoy'; score: number }>
): DiscriminationCheck {
  const offending = scored.filter((s) => s.kind === 'decoy' && s.score >= 0.8).map((s) => s.id);
  if (offending.length > 0) {
    return {
      discarded: true,
      degraded: RESEARCH_JUDGE_DISCRIMINATION_FAILED,
      offendingDecoyIds: offending,
    };
  }
  return { discarded: false, degraded: null, offendingDecoyIds: [] };
}
