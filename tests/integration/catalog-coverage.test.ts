/**
 * catalog-1 / catalog-5 coverage suite — 60/60 + merges + storage + deleted-entry teeth.
 * Run: pnpm vitest run tests/integration/catalog-coverage.test.ts
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const HOLO = resolve(ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_SAMPLE = resolve(ROOT, 'services/platform/tests/fixtures/export-sample');
const CATALOG = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const CATALOG_MISSING_TABLE = resolve(
  ROOT,
  'services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml'
);

function runHolo(args: string[]) {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('catalog coverage 60/60', () => {
  it('60/60 tables approved with disposition+formula+owner+approval per table', () => {
    const r = runHolo(['catalog:verify', '--export', EXPORT_SAMPLE, '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/60\/60 tables approved/);
    expect(out).toMatch(/storage refs: 6\/6 approved/);
    // sample of real tables
    for (const t of [
      'conversations',
      'researchSessions',
      'documentCounters',
      'revenueValidationSessions',
      'rateLimits',
    ]) {
      expect(out).toContain(`${t}: disposition=`);
    }
    expect(out).toMatch(/documentCounters: disposition=drop/);
  });

  it('merges resolves business 12→3 analysis_* + research 5→3 research_*', () => {
    const r = runHolo(['catalog:merges', '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/business: 12 → 3/);
    expect(out).toMatch(/research: 5 → 3/);
    expect(out).toMatch(/analysis_sessions/);
    expect(out).toMatch(/research_sessions/);
    expect(out).toMatch(/per_domain_shell_targets: 0/);
  });

  it('coverage|storage: every field + 6 storage refs dispositioned; drops approved', () => {
    const r = runHolo(['catalog:coverage', '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/storage_refs: 6\/6/);
    expect(out).toMatch(/audioTranscriptJobs\.audioStorageId → drop/);
    expect(out).toMatch(/improvementImages\.storageId → preserve/);
    expect(out).toMatch(/documentCounters\./); // fields under drop table
    // documentCounters table drop is visible via verify
    const v = runHolo(['catalog:verify', '--export', EXPORT_SAMPLE, '--catalog', CATALOG]);
    expect(v.stdout).toMatch(/documentCounters: disposition=drop/);
    expect(v.stdout).toMatch(/APR-MIG-DROP-DOC-COUNTERS-001/);
  });

  it('deleted entry flips verify non-zero naming the unmapped table', () => {
    const r = runHolo([
      'catalog:verify',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG_MISSING_TABLE,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/voiceCommands/);
    expect(out).toMatch(/59\/60|unmapped table:\s*voiceCommands/);
  });
});
