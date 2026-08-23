/**
 * UNIT_TEST_JUSTIFIED: pure PRNG / decoy-count / discrimination math, zero I/O.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDecoys,
  checkDecoyDiscrimination,
  createRunIdPrng,
  decoyCountForBatch,
  RESEARCH_JUDGE_DISCRIMINATION_FAILED,
  shuffleWithRunId,
} from './decoys.ts';

describe('decoys', () => {
  it('K = max(2, ceil(N/8))', () => {
    expect(decoyCountForBatch(1)).toBe(2);
    expect(decoyCountForBatch(8)).toBe(2);
    expect(decoyCountForBatch(9)).toBe(2);
    expect(decoyCountForBatch(16)).toBe(2);
    expect(decoyCountForBatch(17)).toBe(3);
  });

  it('runId PRNG is deterministic', () => {
    const a = createRunIdPrng('run-1');
    const b = createRunIdPrng('run-1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('buildDecoys count matches K and is runId-stable', () => {
    const d1 = buildDecoys({ runId: 'abc', realCount: 5 });
    const d2 = buildDecoys({ runId: 'abc', realCount: 5 });
    expect(d1).toHaveLength(2);
    expect(d1.map((d) => d.claimText)).toEqual(d2.map((d) => d.claimText));
  });

  it('shuffleWithRunId is deterministic for same seed', () => {
    const items = [1, 2, 3, 4, 5];
    expect(shuffleWithRunId(items, 'seed')).toEqual(shuffleWithRunId(items, 'seed'));
  });

  it('decoy score ≥ 0.8 discards batch', () => {
    const check = checkDecoyDiscrimination([
      { id: 'r1', kind: 'real', score: 0.9 },
      { id: 'd1', kind: 'decoy', score: 0.9 },
    ]);
    expect(check.discarded).toBe(true);
    expect(check.degraded).toBe(RESEARCH_JUDGE_DISCRIMINATION_FAILED);
    expect(check.offendingDecoyIds).toEqual(['d1']);
  });

  it('decoy score < 0.8 does not discard', () => {
    const check = checkDecoyDiscrimination([
      { id: 'r1', kind: 'real', score: 0.9 },
      { id: 'd1', kind: 'decoy', score: 0.55 },
    ]);
    expect(check.discarded).toBe(false);
    expect(check.degraded).toBeNull();
  });
});
