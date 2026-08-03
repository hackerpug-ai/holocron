/**
 * REDHAT-FIX-S29-R2-C03 — bind verify-reads to immutable content-addressed
 * export/catalog (reject truncated / rewritten / self-hashed caller reports).
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     services/platform/tests/integration/redhat-fix-s29-r2-c03-export-catalog-bind.test.ts
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_URL, PLATFORM_IT } from '../../../../tests/integration/service/harness';
import {
  loadBoundExportCatalogBaseline,
  loadCutoverParityInventory,
  runVerifyReads,
} from '../../src/cutover/soak-fence.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';

if (!PLATFORM_IT) {
  throw new Error('redhat-fix-s29-r2-c03 requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R2-C03');
const SPRINT_EVIDENCE = resolve(
  REPO_ROOT,
  '.tmp/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip'
);
const IMMUTABLE_ETL_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/watermark-report-multi-table.json'
);
const IMMUTABLE_PARITY_FIXTURE = resolve(
  REPO_ROOT,
  'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json'
);
const IMMUTABLE_EXPORT_DIR = resolve(REPO_ROOT, 'services/platform/tests/fixtures/export-sample');
const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  context: 'redhat-fix-s29-r2-c03',
});

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(SPRINT_EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const payload = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE, name), payload, 'utf8');
  writeFileSync(resolve(SPRINT_EVIDENCE, name), payload, 'utf8');
}

describe('REDHAT-FIX-S29-R2-C03 immutable export/catalog bind', () => {
  let frozen: {
    runId: string;
    exportArchiveHash: string;
    parityHash?: string;
    loadedByTable: Record<string, number>;
  };

  beforeAll(() => {
    mkdirSync(EVIDENCE, { recursive: true });
    mkdirSync(SPRINT_EVIDENCE, { recursive: true });
    if (!existsSync(IMMUTABLE_ETL_FIXTURE)) {
      throw new Error(`missing watermark fixture: ${IMMUTABLE_ETL_FIXTURE}`);
    }
    if (!existsSync(IMMUTABLE_PARITY_FIXTURE)) {
      throw new Error(`missing parity fixture: ${IMMUTABLE_PARITY_FIXTURE}`);
    }
    if (!existsSync(IMMUTABLE_EXPORT_DIR)) {
      throw new Error(`missing export fixture: ${IMMUTABLE_EXPORT_DIR}`);
    }
    frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as typeof frozen;
    // Stage default D06-04 paths for CLI-shaped defaults.
    mkdirSync(resolve(REPO_ROOT, '.tmp/D06-04'), { recursive: true });
    writeFileSync(
      resolve(REPO_ROOT, '.tmp/D06-04/watermark-report.json'),
      readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8'),
      'utf8'
    );
    const defaultParityPath = resolve(REPO_ROOT, '.tmp/D06-04/cutover-parity.json');
    if (existsSync(defaultParityPath)) chmodSync(defaultParityPath, 0o644);
    writeFileSync(defaultParityPath, readFileSync(IMMUTABLE_PARITY_FIXTURE, 'utf8'), 'utf8');
  });

  it('AC-1/AC-4: immutable export/catalog rejects an unbacked fixture honestly', async () => {
    const bound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      declaredExportArchiveHash: frozen.exportArchiveHash,
      declaredParityHash: frozen.parityHash,
      allowTestFixtures: true,
    });
    evidence('bound-export-catalog.json', bound);
    expect(bound.ok).toBe(true);
    expect(bound.exportArchiveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(bound.exportArchiveHash).toBe(frozen.exportArchiveHash);
    expect(bound.catalog_table_count).toBeGreaterThanOrEqual(4);

    const parity = loadCutoverParityInventory(IMMUTABLE_PARITY_FIXTURE);
    expect(parity).not.toBeNull();
    expect(parity?.parityHash).toMatch(/^[a-f0-9]{64}$/);

    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: IMMUTABLE_ETL_FIXTURE,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
      allowTestFixtures: true,
    });
    evidence('verify-reads-green.json', report);
    expect(report.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.catalog_table_count).toBe(report.tablesTotal);
    // The fixture has no current export ID mappings in this database. It cannot
    // become a fake-green Step 7 oracle by matching whole target table counts.
    expect(report.ok).toBe(false);
    expect(report.mismatches.some((m) => m.includes('mapped='))).toBe(true);
    const expectedTables = new Set(
      Object.keys(frozen.loadedByTable).map((table) =>
        table.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
      )
    );
    for (const mismatch of report.mismatches) {
      const match = mismatch.match(/^([^:]+): mapped=\d+ baseline=\d+$/);
      expect(match, `unexpected non-count mismatch: ${mismatch}`).not.toBeNull();
      expect(expectedTables.has(match?.[1] ?? '')).toBe(true);
    }
    expect(report.exportArchiveHash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.exportArchiveHash.length).toBe(64);
    expect(report.baseline_hash).toBe(report.exportArchiveHash);
    expect(report.baseline_hash).not.toBe(report.report_sha256);
    expect(report.baseline_source).toMatch(/export-catalog|parity/i);
    expect(report.parity_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(report.export_dir).toContain('export-sample');
  }, 60_000);

  it('AC-2: truncated one-table caller report yields ok false with incomplete-set', async () => {
    const truncPath = resolve(EVIDENCE, 'truncated-one-table.json');
    writeFileSync(
      truncPath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-truncated',
          unexplainedVariance: 0,
          exportArchiveHash: frozen.exportArchiveHash,
          parityHash: frozen.parityHash,
          exportRelPath: 'services/platform/tests/fixtures/export-sample',
          parityRelPath:
            'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json',
          loadedByTable: { documents: frozen.loadedByTable.documents },
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: truncPath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
      allowTestFixtures: true,
    });
    evidence('verify-reads-truncated.json', report);
    expect(report.ok).toBe(false);
    expect(report.mismatches.length).toBeGreaterThan(0);
    expect(report.mismatches.some((m) => /truncated|incomplete-set/i.test(m))).toBe(true);
    // Full expected set still from parity (not caller length)
    expect(report.tablesTotal).toBeGreaterThanOrEqual(4);
    expect(report.catalog_table_count).toBe(report.tablesTotal);
  }, 60_000);

  it('AC-3: rewritten mutable report fails provenance/parity binding', async () => {
    const rewrittenPath = resolve(EVIDENCE, 'rewritten-mutable.json');
    const loaded = {
      ...frozen.loadedByTable,
      documents: (frozen.loadedByTable.documents ?? 0) + 999,
    };
    writeFileSync(
      rewrittenPath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-rewritten',
          unexplainedVariance: 0,
          exportArchiveHash: frozen.exportArchiveHash,
          parityHash: frozen.parityHash,
          exportRelPath: 'services/platform/tests/fixtures/export-sample',
          parityRelPath:
            'services/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json',
          loadedByTable: loaded,
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: rewrittenPath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
      allowTestFixtures: true,
    });
    evidence('verify-reads-rewritten.json', report);
    expect(report.ok).toBe(false);
    expect(
      report.mismatches.some((m) => /hash|archive|provenance|catalog|rewritten/i.test(m))
    ).toBe(true);
  }, 60_000);

  it('AC-3: self-hashed report alone is insufficient without matching archive digest', async () => {
    const fakePath = resolve(EVIDENCE, 'self-hash-only.json');
    writeFileSync(
      fakePath,
      `${JSON.stringify(
        {
          ok: true,
          runId: 'r2-c03-self-hash-only',
          unexplainedVariance: 0,
          // Freestanding 64-hex that does not match on-disk export-sample
          exportArchiveHash: 'b'.repeat(64),
          loadedByTable: frozen.loadedByTable,
          reconcile: { ok: true, unexplainedVariance: 0 },
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const report = await runVerifyReads({
      cwd: REPO_ROOT,
      etlReportPath: fakePath,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      databaseUrl: DATABASE_URL,
      allowTestFixtures: true,
    });
    evidence('verify-reads-self-hash-only.json', report);
    expect(report.ok).toBe(false);
    expect(report.mismatches.some((m) => /hash|archive|provenance/i.test(m))).toBe(true);
  }, 60_000);

  it('AC-5: this run preserves red evidence for the mutable self-hash defect', () => {
    const redLog = resolve(SPRINT_EVIDENCE, 'verify-reads-self-hash-only.json');
    expect(existsSync(redLog)).toBe(true);
    const bytes = readFileSync(redLog);
    expect(bytes.byteLength).toBeGreaterThan(0);
    evidence('red-log-present.json', { path: redLog, bytes: bytes.byteLength });
  });
});
