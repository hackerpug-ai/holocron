/**
 * REDHAT-FIX-S29-R3-C02 — production cutover:verify-reads must not fall back to
 * committed test fixtures; require operator export/catalog/parity; inventory
 * threshold must not silently accept >=4 when N is declared.
 *
 * Run:
 *   pnpm vitest run --project unit \
 *     packages/platform/src/cli/__tests__/redhat-fix-s29-r3-c02-no-fixture-fallback.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  allowCutoverTestFixtures,
  CUTOVER_ALLOW_TEST_FIXTURES_ENV,
  defaultFixtureCutoverParityPath,
  isCommittedTestFixturePath,
  loadBoundExportCatalogBaseline,
  loadCutoverParityInventory,
} from '../../cutover/soak-fence.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S29-R3-C02');
const IMMUTABLE_PARITY_FIXTURE = resolve(
  REPO_ROOT,
  'packages/platform/tests/fixtures/sprint29/immutable-export-catalog/cutover-parity.json'
);
const IMMUTABLE_EXPORT_DIR = resolve(REPO_ROOT, 'packages/platform/tests/fixtures/export-sample');
const IMMUTABLE_ETL_FIXTURE = resolve(
  REPO_ROOT,
  'packages/platform/tests/fixtures/sprint29/watermark-report-multi-table.json'
);

function evidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(resolve(EVIDENCE, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

describe('REDHAT-FIX-S29-R3-C02 no production fixture fallback', () => {
  const prevAllow = process.env[CUTOVER_ALLOW_TEST_FIXTURES_ENV];
  let scratch: string;

  beforeEach(() => {
    delete process.env[CUTOVER_ALLOW_TEST_FIXTURES_ENV];
    scratch = mkdtempSync(resolve(tmpdir(), 'r3-c02-'));
    mkdirSync(EVIDENCE, { recursive: true });
  });

  afterEach(() => {
    if (prevAllow === undefined) {
      delete process.env[CUTOVER_ALLOW_TEST_FIXTURES_ENV];
    } else {
      process.env[CUTOVER_ALLOW_TEST_FIXTURES_ENV] = prevAllow;
    }
    rmSync(scratch, { recursive: true, force: true });
  });

  it('allowCutoverTestFixtures is false by default and true only for 1|true', () => {
    expect(allowCutoverTestFixtures({})).toBe(false);
    expect(allowCutoverTestFixtures({ [CUTOVER_ALLOW_TEST_FIXTURES_ENV]: '0' })).toBe(false);
    expect(allowCutoverTestFixtures({ [CUTOVER_ALLOW_TEST_FIXTURES_ENV]: '1' })).toBe(true);
    expect(allowCutoverTestFixtures({ [CUTOVER_ALLOW_TEST_FIXTURES_ENV]: 'true' })).toBe(true);
  });

  it('isCommittedTestFixturePath detects repo fixture trees', () => {
    expect(isCommittedTestFixturePath(IMMUTABLE_PARITY_FIXTURE, REPO_ROOT)).toBe(true);
    expect(isCommittedTestFixturePath(IMMUTABLE_EXPORT_DIR, REPO_ROOT)).toBe(true);
    expect(
      isCommittedTestFixturePath(resolve(REPO_ROOT, '.tmp/D06-04/cutover-parity.json'), REPO_ROOT)
    ).toBe(false);
  });

  it('AC-1: missing operator parity fails closed (no fixture default)', () => {
    const emptyCwd = resolve(scratch, 'empty-operator');
    mkdirSync(emptyCwd, { recursive: true });
    const bound = loadBoundExportCatalogBaseline({
      cwd: emptyCwd,
      // Intentionally omit parity/export/catalog — production CLI shape
    });
    evidence('missing-operator-parity.json', bound);
    expect(bound.ok).toBe(false);
    expect(bound.mismatches.length).toBeGreaterThan(0);
    expect(
      bound.mismatches.some(
        (m) =>
          /no production fixture fallback|missing or invalid|refuse verify-reads/i.test(m) &&
          !/looked at .*immutable-export-catalog/i.test(m)
      )
    ).toBe(true);
    // Must not silently bind to committed fixture
    expect(bound.parityPath).not.toContain('immutable-export-catalog');
    expect(bound.catalog_table_count).toBe(0);
  });

  it('AC-2: auto-resolved fixture parityRelPath is refused without allow flag', () => {
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
      parityHash: string;
      exportRelPath: string;
      parityRelPath: string;
    };
    const bound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      // No explicit parityPath/exportDir — only watermark-style rel paths into fixtures
      exportRelPath: frozen.exportRelPath,
      parityRelPath: frozen.parityRelPath,
      declaredExportArchiveHash: frozen.exportArchiveHash,
      declaredParityHash: frozen.parityHash,
    });
    evidence('auto-fixture-relpath-refused.json', bound);
    expect(bound.ok).toBe(false);
    expect(bound.mismatches.some((m) => /refusing committed test fixture/i.test(m))).toBe(true);
  });

  it('AC-3: explicit fixture paths are refused unless the in-process test opt-in is set', () => {
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
      parityHash: string;
    };
    const bound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      declaredExportArchiveHash: frozen.exportArchiveHash,
      declaredParityHash: frozen.parityHash,
    });
    evidence('explicit-fixture-paths-refused.json', bound);
    expect(bound.ok).toBe(false);
    expect(bound.mismatches.some((m) => /refusing committed test fixture/i.test(m))).toBe(true);

    const testBound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: IMMUTABLE_PARITY_FIXTURE,
      declaredExportArchiveHash: frozen.exportArchiveHash,
      declaredParityHash: frozen.parityHash,
      allowTestFixtures: true,
    });
    expect(testBound.ok).toBe(true);
    expect(testBound.catalog_table_count).toBe(7);
  });

  it('AC-4: HOLO_CUTOVER_ALLOW_TEST_FIXTURES=1 permits fixture fallback', () => {
    process.env[CUTOVER_ALLOW_TEST_FIXTURES_ENV] = '1';
    const emptyCwd = resolve(scratch, 'allow-fixtures');
    mkdirSync(emptyCwd, { recursive: true });
    // Fixture path is under REPO_ROOT; use repo cwd so defaultFixture path exists
    const fixturePath = defaultFixtureCutoverParityPath(REPO_ROOT);
    expect(existsSync(fixturePath)).toBe(true);
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
      parityHash: string;
    };
    const bound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      // Missing operator .tmp/D06-04 parity → fixture fallback under allow flag
      parityPath: resolve(emptyCwd, 'does-not-exist-parity.json'),
      exportDir: IMMUTABLE_EXPORT_DIR,
      declaredExportArchiveHash: frozen.exportArchiveHash,
      declaredParityHash: frozen.parityHash,
    });
    evidence('allow-test-fixtures-fallback.json', bound);
    expect(bound.ok).toBe(true);
    expect(bound.parityPath).toContain('immutable-export-catalog');
    expect(bound.catalog_table_count).toBe(7);
  });

  it('AC-5: catalog_table_count_expected mismatch fails (not silent >=4)', () => {
    const parity = loadCutoverParityInventory(IMMUTABLE_PARITY_FIXTURE);
    expect(parity).not.toBeNull();
    const loaded = { ...parity!.loadedByTable };
    const requireLoadedCount = (table: string): number => {
      const count = loaded[table];
      if (count === undefined) {
        throw new Error(`fixture parity is missing loadedByTable.${table}`);
      }
      return count;
    };
    // Truncate inventory while declaring full expected count
    const truncated: Record<string, number> = {
      documents: requireLoadedCount('documents'),
      conversations: requireLoadedCount('conversations'),
      tasks: requireLoadedCount('tasks'),
      researchSessions: requireLoadedCount('researchSessions'),
    };
    expect(Object.keys(truncated).length).toBe(4); // would pass old >=4 threshold
    const badParityPath = resolve(scratch, 'truncated-expected-parity.json');
    const body = {
      kind: 'cutover-verify-reads-parity',
      version: 1,
      boundExportArchiveHash: parity!.boundExportArchiveHash,
      exportRelPath: 'packages/platform/tests/fixtures/export-sample',
      catalogRelPath: parity!.catalogRelPath,
      catalog_table_count_expected: 7,
      loadedByTable: truncated,
    };
    writeFileSync(badParityPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      exportArchiveHash: string;
    };
    const bound = loadBoundExportCatalogBaseline({
      cwd: REPO_ROOT,
      exportDir: IMMUTABLE_EXPORT_DIR,
      parityPath: badParityPath,
      declaredExportArchiveHash: frozen.exportArchiveHash,
    });
    evidence('incomplete-inventory-threshold.json', bound);
    expect(bound.ok).toBe(false);
    expect(
      bound.mismatches.some(
        (m) =>
          /truncated\/incomplete-set/i.test(m) &&
          /catalog_table_count_expected=7/i.test(m) &&
          /loadedByTable has 4/i.test(m)
      )
    ).toBe(true);
  });

  it('AC-6: fixture parity catalog_table_count_expected equals loadedByTable size', () => {
    const parity = loadCutoverParityInventory(IMMUTABLE_PARITY_FIXTURE);
    expect(parity).not.toBeNull();
    const n = Object.keys(parity!.loadedByTable).length;
    expect(parity!.catalog_table_count_expected).toBe(n);
    expect(n).toBe(7);
    const raw = readFileSync(IMMUTABLE_PARITY_FIXTURE);
    const hash = createHash('sha256').update(raw).digest('hex');
    const frozen = JSON.parse(readFileSync(IMMUTABLE_ETL_FIXTURE, 'utf8')) as {
      parityHash: string;
    };
    expect(frozen.parityHash).toBe(hash);
    evidence('fixture-inventory-aligned.json', {
      catalog_table_count_expected: parity!.catalog_table_count_expected,
      loadedByTableKeys: n,
      parityHash: hash,
    });
  });
});
