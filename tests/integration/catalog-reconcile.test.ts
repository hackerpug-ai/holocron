/**
 * Integration tests for catalog:reconcile + catalog:assets.
 * Run: CATALOG_IT=1 pnpm vitest run tests/integration/catalog-reconcile.test.ts
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const HOLO = resolve(ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_SAMPLE = resolve(ROOT, 'services/platform/tests/fixtures/export-sample');
const EXPORT_VARIANCE = resolve(ROOT, 'services/platform/tests/fixtures/export-variance');
const CATALOG = resolve(
  ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
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

describe('catalog:reconcile', () => {
  it('zero unexplained variance against export-sample + committed catalog', () => {
    const r = runHolo([
      'catalog:reconcile',
      '--dry-run',
      '--json',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const report = JSON.parse(r.stdout) as {
      unexplained_variance: number;
      tables: Array<{ table: string; source_count: number; variance: number }>;
      exceptions: Array<{ name: string; approved: boolean; kind: string }>;
      ok: boolean;
    };
    expect(report.ok).toBe(true);
    expect(report.unexplained_variance).toBe(0);
    expect(report.tables.length).toBeGreaterThanOrEqual(60);
    // per-table rows present
    const research = report.tables.find((t) => t.table === 'researchFindings');
    expect(research).toBeTruthy();
    expect(research!.variance).toBe(0);
  });

  it('approved exceptions fold business 12→3 + research 5→3 + documentCounters drop', () => {
    const r = runHolo([
      'catalog:reconcile',
      '--dry-run',
      '--json',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG,
    ]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const report = JSON.parse(r.stdout) as {
      exceptions: Array<{ name: string; approved: boolean; kind: string; detail: string }>;
      unexplained_variance: number;
      merge_targets: {
        analysis_sessions_expected: number;
        research_sessions_expected: number;
      };
    };
    expect(report.unexplained_variance).toBe(0);
    const names = report.exceptions.map((e) => e.name).join(' | ');
    expect(names).toMatch(/business 12→3/);
    expect(names).toMatch(/research 5→3/);
    expect(names).toMatch(/documentCounters/);
    expect(report.exceptions.every((e) => e.approved || e.kind === 'unmapped_export_table')).toBe(
      true
    );
    // merge sums: 4 session tables contribute to analysis_sessions
    expect(report.merge_targets.analysis_sessions_expected).toBeGreaterThan(0);
    expect(report.merge_targets.research_sessions_expected).toBeGreaterThan(0);
  });

  it('asset integrity: sha256 matches bytes on disk', () => {
    const r = runHolo([
      'catalog:assets',
      '--json',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const inv = JSON.parse(r.stdout) as {
      objects: Array<{
        legacy_id: string;
        sha256: string;
        bytes: number;
        target: string;
        path: string;
      }>;
      retained_count: number;
    };
    expect(inv.retained_count).toBeGreaterThan(0);
    expect(inv.objects.length).toBe(inv.retained_count);

    const sample = inv.objects[0];
    expect(sample).toBeTruthy();
    const disk = readFileSync(sample.path);
    const digest = createHash('sha256').update(disk).digest('hex');
    expect(sample.sha256).toBe(digest);
    expect(sample.bytes).toBe(disk.length);
    expect(sample.bytes).toBe(statSync(sample.path).size);
    expect(sample.target).toBe(`cas://sha256/${digest}`);

    // temporary drop blob must not appear as retained
    const droppedTemp = inv.objects.find((o) => o.legacy_id.includes('audioTranscriptJobs'));
    expect(droppedTemp).toBeUndefined();
  });

  it('export-variance fails closed with named table + numeric variance', () => {
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
    expect(out).toMatch(/orphanExportTable/);
    expect(out).toMatch(/variance=3 \(unexplained\)|unexplained_variance: 3/);
  });
});

describe('catalog:assets storage completeness', () => {
  it('retained inventory count matches non-dropped _storage files referenced by retained refs', () => {
    const r = runHolo([
      'catalog:assets',
      '--json',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG,
    ]);
    expect(r.status).toBe(0);
    const inv = JSON.parse(r.stdout) as { retained_count: number; objects: unknown[] };
    const storageDir = join(EXPORT_SAMPLE, '_storage');
    expect(existsSync(storageDir)).toBe(true);
    const files = readdirSync(storageDir).filter((f) => statSync(join(storageDir, f)).isFile());
    // 6 blobs on disk; 1 is temporary drop → 5 retained
    expect(files.length).toBe(6);
    expect(inv.retained_count).toBe(5);
  });
});
