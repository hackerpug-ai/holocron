/**
 * Integration tests for catalog:verify / coverage / merges.
 * Run: CATALOG_IT=1 pnpm vitest run tests/integration/catalog-verify.test.ts
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
const CATALOG_MISSING_STORAGE = resolve(
  ROOT,
  'services/platform/tests/fixtures/catalog-missing-improvementImages-storage.yaml'
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

describe('catalog:verify coverage gate', () => {
  it('60/60 tables approved against export-sample', () => {
    const r = runHolo([
      'catalog:verify',
      '--json',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const report = JSON.parse(r.stdout) as {
      tables_approved: number;
      tables_total: number;
      storage_refs_approved: number;
      storage_refs_total: number;
      ok: boolean;
      per_table: Array<{ table: string; disposition: string }>;
    };
    expect(report.ok).toBe(true);
    expect(report.tables_approved).toBe(60);
    expect(report.tables_total).toBe(60);
    expect(report.storage_refs_approved).toBe(6);
    expect(report.storage_refs_total).toBe(6);
    expect(report.per_table.length).toBe(60);
    for (const t of report.per_table) {
      expect(['preserve', 'merge', 'drop', 'regenerate', 'archive']).toContain(t.disposition);
    }
  });

  it('owner and approval present on every field and storage ref via catalog:coverage', () => {
    const r = runHolo(['catalog:coverage', '--json', '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const report = JSON.parse(r.stdout) as {
      fields: Array<{ surface: string; owner: string; approval: string; disposition: string }>;
      storage_refs: Array<{ surface: string; owner: string; approval: string }>;
      ok: boolean;
    };
    expect(report.ok).toBe(true);
    expect(report.fields.length).toBeGreaterThan(100);
    for (const f of report.fields) {
      expect(f.owner.trim().length, f.surface).toBeGreaterThan(0);
      expect(f.approval.trim().length, f.surface).toBeGreaterThan(0);
    }
    expect(report.storage_refs.length).toBe(6);
    for (const s of report.storage_refs) {
      expect(s.owner.trim().length, s.surface).toBeGreaterThan(0);
      expect(s.approval.trim().length, s.surface).toBeGreaterThan(0);
    }
  });

  it('no per-domain shells: business 12→3 and research 5→3', () => {
    const r = runHolo(['catalog:merges', '--json', '--catalog', CATALOG]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).toBe(0);
    const report = JSON.parse(r.stdout) as {
      business: { source_count: number; target_count: number; targets: string[] };
      research: {
        source_count: number;
        target_count: number;
        targets: string[];
        discriminators: Record<string, string>;
      };
      per_domain_shell_targets: string[];
      ok: boolean;
    };
    expect(report.ok).toBe(true);
    expect(report.business.source_count).toBe(12);
    expect(report.business.target_count).toBe(3);
    expect(report.business.targets).toEqual([
      'analysis_sessions',
      'analysis_items',
      'analysis_evidence',
    ]);
    expect(report.research.source_count).toBe(5);
    expect(report.research.target_count).toBe(3);
    expect(report.research.discriminators.research_sessions).toBe('system');
    expect(report.per_domain_shell_targets).toEqual([]);
  });

  it('deleted table entry fails closed naming the surface', () => {
    const r = runHolo([
      'catalog:verify',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG_MISSING_TABLE,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/unmapped table:\s*voiceCommands/);
    expect(out).toMatch(/59\/60/);
  });

  it('missing storage-ref disposition fails closed naming improvementImages.storageId', () => {
    const r = runHolo([
      'catalog:verify',
      '--export',
      EXPORT_SAMPLE,
      '--catalog',
      CATALOG_MISSING_STORAGE,
    ]);
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status, out).not.toBe(0);
    expect(out).toMatch(/unmapped storage ref:\s*improvementImages\.storageId/);
  });
});
