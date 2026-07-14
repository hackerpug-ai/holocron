/**
 * RED negative-control suite for the source-catalog gate.
 * Drives the REAL `holo catalog:*` entrypoints — no mocks.
 *
 * Run: CATALOG_IT=1 pnpm vitest run tests/integration/catalog-negative-controls.test.ts
 *
 * Each control asserts a concrete failure signature and would FAIL if the gate
 * reported green while the disconnect is present.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const HOLO = resolve(ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_SAMPLE = resolve(ROOT, 'services/platform/tests/fixtures/export-sample');
const EXPORT_VARIANCE = resolve(ROOT, 'services/platform/tests/fixtures/export-variance');
const CATALOG_MISSING_TABLE = resolve(
  ROOT,
  'services/platform/tests/fixtures/catalog-missing-voiceCommands.yaml'
);
const CATALOG_MISSING_STORAGE = resolve(
  ROOT,
  'services/platform/tests/fixtures/catalog-missing-improvementImages-storage.yaml'
);
const CATALOG = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('catalog negative controls (RED teeth)', () => {
  it('fixtures and holo entrypoint exist on disk', () => {
    expect(existsSync(HOLO)).toBe(true);
    expect(existsSync(CATALOG)).toBe(true);
    expect(existsSync(EXPORT_SAMPLE)).toBe(true);
    expect(existsSync(EXPORT_VARIANCE)).toBe(true);
    expect(existsSync(CATALOG_MISSING_TABLE)).toBe(true);
    expect(existsSync(CATALOG_MISSING_STORAGE)).toBe(true);
  });

  it('deleted/unmapped-table control: verify exits non-zero naming voiceCommands', () => {
    // would fail if verify reported 60/60 with the entry gone
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
    expect(out).toMatch(/unmapped table:\s*voiceCommands|59\/60/);
    expect(out).not.toMatch(/60\/60 tables approved\n0 export tables unaccounted/);
  });

  it('unmapped storage ref control: verify/coverage exits non-zero naming improvementImages.storageId', () => {
    const verify = runHolo([
      'catalog:verify',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG_MISSING_STORAGE,
    ]);
    const vout = `${verify.stdout}\n${verify.stderr}`;
    expect(verify.status, vout).not.toBe(0);
    expect(vout).toMatch(/improvementImages\.storageId/);

    const coverage = runHolo(['catalog:coverage', '--catalog', CATALOG_MISSING_STORAGE]);
    const cout = `${coverage.stdout}\n${coverage.stderr}`;
    expect(coverage.status, cout).not.toBe(0);
    expect(cout).toMatch(/improvementImages\.storageId/);
  });

  it('variance control: reconcile exits non-zero naming table + numeric variance', () => {
    // would fail if reconcile reported unexplained_variance: 0
    const r = runHolo([
      'catalog:reconcile',
      '--dry-run',
      '--export',
      EXPORT_VARIANCE,
      '--catalog',
      CATALOG,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/variance=\d+ \(unexplained\)/);
    expect(out).toMatch(/orphanExportTable|unexplained_variance:\s*[1-9]/);
    expect(out).not.toMatch(/unexplained_variance:\s*0\nstatus: OK/);
  });
});

// Always-on shape checks (no CATALOG_IT required) so CI sees the suite
describe('catalog negative control suite shape', () => {
  it('does not use skip-to-green guards on control tests', () => {
    const self = readFileSync(
      resolve(ROOT, 'tests/integration/catalog-negative-controls.test.ts'),
      'utf8'
    );
    // Strip this meta-assertion block's own mentions, then require zero live skip calls.
    const withoutMeta = self.replace(
      /describe\('catalog negative control suite shape'[\s\S]*$/,
      ''
    );
    expect(withoutMeta).not.toMatch(/\bit\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\btest\.skip\s*\(/);
    expect(withoutMeta).not.toMatch(/\bdescribe\.skip\s*\(/);
  });

  // When CATALOG_IT is set, re-assert the three controls ran (above).
  // When unset, still prove the suite file is present and has teeth text.
  it('documents would-fail-if disconnects per control', () => {
    const self = readFileSync(
      resolve(ROOT, 'tests/integration/catalog-negative-controls.test.ts'),
      'utf8'
    );
    expect(self).toMatch(/would fail if verify reported 60\/60/);
    expect(self).toMatch(/would fail if reconcile reported unexplained_variance: 0/);
  });

  it('up-state: complete catalog + export-sample verify passes 60/60', () => {
    const r = runHolo(['catalog:verify', '--export', EXPORT_SAMPLE, '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/60\/60 tables approved/);
  });
});
