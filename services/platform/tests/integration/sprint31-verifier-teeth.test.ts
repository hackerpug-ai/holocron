/**
 * S31-08 — Every cutover verifier refuses a seeded violation (fail closed).
 *
 * AC-1 PRIMARY: five toothless verifiers exit non-zero with a named reason.
 * AC-2: gate registry lists every verifier with an on-disk negative_control fixture.
 * AC-3: catalog:assets refuses a missing retained blob (ok:false).
 * AC-4: mcp:verify-rehost refuses throw-only dispatch cases.
 * AC-5: suite maps 1:1 to registry entries (no orphans / no gaps).
 *
 * NEGATIVE_CONTROL (would fail if):
 *   stub exit 0 | empty fixture | mock CLI | hardcod pass | it.skip under PLATFORM_IT=1
 *
 * Run:
 *   PLATFORM_IT=1 pnpm test:integration -- \
 *     services/platform/tests/integration/sprint31-verifier-teeth.test.ts
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildGateRegistryReport,
  GATE_REGISTRY,
  listGateRegistry,
} from '../../src/verify/gate-registry.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error('sprint31-verifier-teeth requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const FIXTURES = resolve(REPO_ROOT, 'services/platform/tests/fixtures/verifier-teeth');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-08');
const REAL_EXECUTOR = resolve(REPO_ROOT, 'services/platform/src/mcp/executor.ts');

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';

/** Registry id → the integration test that covers it (AC-5 mapping). */
const REGISTRY_TEST_COVERAGE: Record<string, string> = {
  'catalog-assets': 'catalogAssetsRefusesMissingBlob',
  'mcp-verify-rehost': 'mcpVerifyRehostRefusesThrowOnlyCase',
  'catalog-reconcile': 'catalogReconcileRefusesPlantedVariance',
  'verify-no-shells': 'verifyNoShellsRefusesShellResidue',
  'etl-fk-audit': 'etlFkAuditRefusesUnenforcedEdges',
};

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runHolo(
  args: string[],
  options?: { env?: Record<string, string>; cwd?: string }
): { status: number | null; stdout: string; stderr: string; combined: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: options?.cwd ?? REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      PLATFORM_IT: '1',
      ...options?.env,
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    status: result.status,
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
  };
}

function loadSeed(fixtureId: string): Record<string, unknown> {
  const seedPath = join(FIXTURES, fixtureId, 'seed.json');
  expect(existsSync(seedPath), `seed must exist: ${seedPath}`).toBe(true);
  return JSON.parse(readFileSync(seedPath, 'utf8')) as Record<string, unknown>;
}

function materializeThrowOnlyExecutor(toolId: string): string {
  const original = readFileSync(REAL_EXECUTOR, 'utf8');
  // Inject a dedicated throw-only case immediately after `switch (id) {`.
  const switchIdx = original.indexOf('switch (id)');
  expect(switchIdx, 'executor must contain switch (id)').toBeGreaterThanOrEqual(0);
  const braceIdx = original.indexOf('{', switchIdx);
  expect(braceIdx).toBeGreaterThan(switchIdx);
  const injection = `
      case '${toolId}': {
        throw new Error('not implemented — throw-only seed for S31-08');
      }
`;
  const modified = `${original.slice(0, braceIdx + 1)}${injection}${original.slice(braceIdx + 1)}`;
  const dir = mkdtempSync(join(tmpdir(), 's31-08-rehost-'));
  const out = join(dir, 'executor.ts');
  writeFileSync(out, modified, 'utf8');
  return out;
}

describe('S31-08 verifier teeth — fail closed on seeded violations', () => {
  const tmpDirs: string[] = [];

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  beforeAll(() => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  it('gateRegistryListsVerifiersWithFixtures', () => {
    const result = runHolo(['verify:gate-registry', '--json']);
    writeEvidence('ac2-gate-registry.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(result.status, `verify:gate-registry must exit 0:\n${result.combined}`).toBe(0);

    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      entries: Array<{
        id: string;
        command: string;
        negative_control: string;
        negative_control_abs: string;
        fixture_exists: boolean;
        violation_class: string;
      }>;
      issues: string[];
    };

    expect(payload.ok, `registry issues: ${payload.issues?.join('; ')}`).toBe(true);
    expect(payload.entries.length).toBeGreaterThanOrEqual(5);

    const ids = payload.entries.map((e) => e.id);
    expect(new Set(ids).size, 'duplicate command ids').toBe(ids.length);

    for (const entry of payload.entries) {
      expect(entry.fixture_exists, `${entry.id} fixture missing: ${entry.negative_control}`).toBe(
        true
      );
      expect(existsSync(entry.negative_control_abs)).toBe(true);
      expect(entry.violation_class.trim().length).toBeGreaterThan(0);
      expect(entry.command.trim().length).toBeGreaterThan(0);
    }
  });

  it('suiteCoversRegistryExactlyOnce', () => {
    const registry = listGateRegistry();
    const registryIds = registry.map((e) => e.id).sort();
    const coveredIds = Object.keys(REGISTRY_TEST_COVERAGE).sort();

    expect(coveredIds, 'coverage map must match registry 1:1').toEqual(registryIds);

    const testNames = Object.values(REGISTRY_TEST_COVERAGE);
    expect(new Set(testNames).size, 'orphan/duplicate test names').toBe(testNames.length);

    // Module-level report also agrees.
    const report = buildGateRegistryReport({ repoRoot: REPO_ROOT });
    expect(report.ok).toBe(true);
    expect(report.entries.map((e) => e.id).sort()).toEqual(registryIds);

    writeEvidence('ac5-suite-coverage.json', {
      registryIds,
      coveredIds,
      testNames,
    });
  });

  it('catalogAssetsRefusesMissingBlob', () => {
    const seed = loadSeed('assets_missing_blob');
    const exportDir = resolve(
      FIXTURES,
      'assets_missing_blob',
      String(seed.export_subdir ?? 'export')
    );
    expect(existsSync(exportDir)).toBe(true);
    const legacyId = String(seed.legacy_id ?? 'storage_audioSegments_storageId');
    // Fixture already deleted the blob; assert it is gone before the command runs.
    expect(existsSync(join(exportDir, '_storage', legacyId))).toBe(false);

    const result = runHolo(['catalog:assets', '--export', exportDir, '--json']);
    writeEvidence('ac3-catalog-assets-missing-blob.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      legacyId,
    });

    expect(result.status, `catalog:assets must refuse missing blob:\n${result.combined}`).not.toBe(
      0
    );

    // Prefer structured ok:false; also accept throw-path that names the blob.
    let okField: boolean | undefined;
    try {
      const start = result.stdout.indexOf('{');
      if (start >= 0) {
        const payload = JSON.parse(result.stdout.slice(start)) as {
          ok?: boolean;
          missing_blobs?: string[];
          violation_class?: string;
        };
        okField = payload.ok;
        if (payload.ok === false) {
          const named =
            payload.missing_blobs?.includes(legacyId) ||
            result.combined.includes(legacyId) ||
            payload.violation_class === 'MISSING_BLOB';
          expect(named, 'missing legacy_id must be named').toBe(true);
        }
      }
    } catch {
      // non-JSON path still valid if reason token present
    }

    expect(okField === true, 'must not report ok:true with missing blobs').toBe(false);
    expect(result.combined).toMatch(new RegExp(`${legacyId}|MISSING_BLOB|missing.*blob`, 'i'));
  });

  it('mcpVerifyRehostRefusesThrowOnlyCase', () => {
    const seed = loadSeed('rehost_throw_only');
    const toolId = String(seed.tool_id ?? 'throw_only_seed_tool');
    const executorPath = materializeThrowOnlyExecutor(toolId);
    tmpDirs.push(resolve(executorPath, '..'));

    const result = runHolo(['mcp:verify-rehost', '--json', '--executor', executorPath]);
    writeEvidence('ac4-mcp-verify-rehost-throw-only.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      toolId,
      executorPath,
    });

    expect(
      result.status,
      `mcp:verify-rehost must refuse throw-only case:\n${result.combined}`
    ).not.toBe(0);
    expect(result.combined).toMatch(new RegExp(`${toolId}|THROW_ONLY`, 'i'));

    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      throwOnlyCases?: string[];
      issues?: string[];
      violation_class?: string;
    };
    expect(payload.ok).toBe(false);
    const named =
      payload.throwOnlyCases?.includes(toolId) ||
      (payload.issues ?? []).some((i) => i.includes(toolId)) ||
      result.combined.includes(toolId);
    expect(named, 'tool id must be named in output').toBe(true);
  });

  it('catalogReconcileRefusesPlantedVariance', () => {
    const seed = loadSeed('reconcile_planted_variance');
    const exportDir = resolve(
      FIXTURES,
      'reconcile_planted_variance',
      String(seed.export_subdir ?? 'export')
    );
    const table = String(seed.table ?? 'orphanExportTable');
    expect(existsSync(join(exportDir, table, 'documents.jsonl'))).toBe(true);

    const result = runHolo(['catalog:reconcile', '--export', exportDir, '--json']);
    writeEvidence('ac1-catalog-reconcile-variance.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      table,
    });

    expect(
      result.status,
      `catalog:reconcile must refuse planted variance:\n${result.combined}`
    ).not.toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      unexplained_variance: number;
      tables: Array<{ table: string; unexplained: boolean }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.unexplained_variance).toBeGreaterThan(0);
    expect(result.combined).toMatch(new RegExp(`${table}|unexplained|UNEXPLAINED_VARIANCE`, 'i'));
  });

  it('verifyNoShellsRefusesShellResidue', () => {
    const seed = loadSeed('no_shells_residue');
    const repoRoot = resolve(FIXTURES, 'no_shells_residue', String(seed.repo_subdir ?? 'repo'));
    expect(existsSync(join(repoRoot, 'services/platform/src/whatsnew'))).toBe(true);

    const result = runHolo(['verify:no-shells', '--json', '--root', repoRoot]);
    writeEvidence('ac1-verify-no-shells-residue.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      repoRoot,
    });

    expect(
      result.status,
      `verify:no-shells must refuse shell residue:\n${result.combined}`
    ).not.toBe(0);
    const payload = JSON.parse(result.stdout) as { ok: boolean; found: string[]; n: number };
    expect(payload.ok).toBe(false);
    expect(payload.n).toBeGreaterThan(0);
    expect(result.combined).toMatch(/whatsnew|shell|residual|SHELL_RESIDUE/i);
  });

  function ensureEtlRunContext(): void {
    // fk-audit requires a succeeded etl_runs row + readable export. Seed from
    // the committed export-sample when the nonprod DB is empty (isolated runs).
    const probe = runHolo(['etl:fk-audit', '--json']);
    if (probe.status !== 0 && /no successful etl_runs/i.test(probe.combined)) {
      const exportSample = resolve(REPO_ROOT, 'services/platform/tests/fixtures/export-sample');
      const seedRun = runHolo(['etl:run', '--export', exportSample, '--json']);
      expect(seedRun.status, `etl:run seed for fk-audit must succeed:\n${seedRun.combined}`).toBe(
        0
      );
    }
  }

  it('etlFkAuditRefusesUnenforcedEdges', () => {
    // Fixture seed documents the violation class; the live nonprod DB is the
    // runtime surface (domain tables without full FK enforcement for schema edges).
    const seed = loadSeed('fk_audit_zero_constraints');
    expect(seed.violation_class).toBe('UNENFORCED_EDGES');

    ensureEtlRunContext();
    const result = runHolo(['etl:fk-audit', '--json']);
    writeEvidence('ac1-etl-fk-audit-unenforced.json', {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });

    expect(
      result.status,
      `etl:fk-audit must refuse unenforced edges:\n${result.combined}`
    ).not.toBe(0);

    // May be structured JSON on stdout or error JSON on stderr.
    const text = result.combined;
    let payload: {
      ok?: boolean;
      unenforcedEdges?: unknown[];
      enforcedForeignKeys?: number;
      violation_class?: string;
      error?: string;
    } | null = null;
    for (const chunk of [result.stdout, result.stderr]) {
      const start = chunk.indexOf('{');
      if (start < 0) continue;
      try {
        payload = JSON.parse(chunk.slice(start)) as typeof payload;
        break;
      } catch {
        // try next
      }
    }
    expect(payload, 'fk-audit must emit JSON').not.toBeNull();
    expect(payload?.ok === true).toBe(false);
    expect(text).toMatch(/unenforced|UNENFORCED_EDGES|FOREIGN KEY|edge/i);
    if (Array.isArray(payload?.unenforcedEdges)) {
      expect(payload!.unenforcedEdges!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('fiveToothlessVerifiersRefuseSeededViolations', () => {
    /**
     * AC-1 PRIMARY — one seeded violation per registered verifier; all refuse.
     * Spawns real `bun src/cli/holo.ts …` children (never mocked).
     */
    const cases: Array<{
      id: string;
      run: () => { status: number | null; combined: string; reasonToken: string };
    }> = [
      {
        id: 'catalog-assets',
        run: () => {
          const seed = loadSeed('assets_missing_blob');
          const exportDir = resolve(
            FIXTURES,
            'assets_missing_blob',
            String(seed.export_subdir ?? 'export')
          );
          const r = runHolo(['catalog:assets', '--export', exportDir, '--json']);
          return {
            status: r.status,
            combined: r.combined,
            reasonToken: 'MISSING_BLOB|missing.*blob|storage_audioSegments',
          };
        },
      },
      {
        id: 'mcp-verify-rehost',
        run: () => {
          const seed = loadSeed('rehost_throw_only');
          const toolId = String(seed.tool_id ?? 'throw_only_seed_tool');
          const executorPath = materializeThrowOnlyExecutor(toolId);
          tmpDirs.push(resolve(executorPath, '..'));
          const r = runHolo(['mcp:verify-rehost', '--json', '--executor', executorPath]);
          return {
            status: r.status,
            combined: r.combined,
            reasonToken: `${toolId}|THROW_ONLY`,
          };
        },
      },
      {
        id: 'catalog-reconcile',
        run: () => {
          const seed = loadSeed('reconcile_planted_variance');
          const exportDir = resolve(
            FIXTURES,
            'reconcile_planted_variance',
            String(seed.export_subdir ?? 'export')
          );
          const r = runHolo(['catalog:reconcile', '--export', exportDir, '--json']);
          return {
            status: r.status,
            combined: r.combined,
            reasonToken: 'orphanExportTable|unexplained|UNEXPLAINED_VARIANCE',
          };
        },
      },
      {
        id: 'verify-no-shells',
        run: () => {
          const seed = loadSeed('no_shells_residue');
          const repoRoot = resolve(
            FIXTURES,
            'no_shells_residue',
            String(seed.repo_subdir ?? 'repo')
          );
          const r = runHolo(['verify:no-shells', '--json', '--root', repoRoot]);
          return {
            status: r.status,
            combined: r.combined,
            reasonToken: 'whatsnew|SHELL_RESIDUE|residual|shell',
          };
        },
      },
      {
        id: 'etl-fk-audit',
        run: () => {
          ensureEtlRunContext();
          const r = runHolo(['etl:fk-audit', '--json']);
          return {
            status: r.status,
            combined: r.combined,
            reasonToken: 'unenforced|UNENFORCED_EDGES|FOREIGN KEY|edge',
          };
        },
      },
    ];

    // Exactly the registry set — no extras, no gaps.
    expect(cases.map((c) => c.id).sort()).toEqual(GATE_REGISTRY.map((e) => e.id).sort());

    const outcomes: Array<{
      id: string;
      status: number | null;
      reasonHit: boolean;
      combinedPreview: string;
    }> = [];

    for (const c of cases) {
      const { status, combined, reasonToken } = c.run();
      const reasonHit = new RegExp(reasonToken, 'i').test(combined);
      outcomes.push({
        id: c.id,
        status,
        reasonHit,
        combinedPreview: combined.slice(0, 400),
      });
      expect(status, `${c.id} must exit non-zero`).not.toBe(0);
      expect(reasonHit, `${c.id} must name violation class (${reasonToken})`).toBe(true);
    }

    writeEvidence('ac1-five-toothless.json', { outcomes });
    expect(outcomes).toHaveLength(5);
    expect(outcomes.every((o) => o.status !== 0 && o.reasonHit)).toBe(true);
  });
});
