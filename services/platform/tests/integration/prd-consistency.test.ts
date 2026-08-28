import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { runPrdConsistency } from '../../src/prd/consistency.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('D02-07 prd-consistency', () => {
  test('AC-1 current PRD derives 60/49', () => {
    const r = runPrdConsistency({
      root: resolve(repoRoot, '.spec/prds/mk6-migration'),
    });
    expect(r.ok).toBe(true);
    expect(r.table_count).toBe(60);
    expect(r.tool_count).toBe(49);
    expect(r.uc_unique).toBe(true);
    expect(r.uc_count).toBeGreaterThanOrEqual(20);
  });

  test('AC-2 stale count fails closed', () => {
    const r = runPrdConsistency({
      root: resolve(repoRoot, 'tests/fixtures/prd-consistency/stale-count'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/stale/);
  });

  test('AC-3 broken link fails', () => {
    const r = runPrdConsistency({
      root: resolve(repoRoot, 'tests/fixtures/prd-consistency/broken-link'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/broken/);
  });

  test('AC-4 future-dated protocol fails', () => {
    const r = runPrdConsistency({
      root: resolve(repoRoot, 'tests/fixtures/prd-consistency/future-date'),
      today: new Date('2026-07-18T00:00:00Z'),
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/future/);
  });
});
