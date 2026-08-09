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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client.ts';
import { applyMigrations } from '../../src/db/migrate.ts';
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
const FK_ZERO_FIXTURE = resolve(FIXTURES, 'fk_audit_zero_constraints');
const ETL_VALID_EXPORT = resolve(REPO_ROOT, 'services/platform/tests/fixtures/etl-valid-export');
const CATALOG_PATH = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);

/** Ambient nonprod URL (registry / other verifiers). FK-audit plant uses a disposable DB. */
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';

/** Domain tables the zero-constraint plant must find after migrate. */
const DOMAIN_TABLES_REQUIRED = [
  'chat_messages',
  'conversations',
  'documents',
  'research_sessions',
  'agent_telemetry',
] as const;

type ZeroConstraintPlant = {
  databaseUrl: string;
  databaseName: string;
  droppedCount: number;
  domainTablesPresent: string[];
  enforcedForeignKeysAfterPlant: number;
  env: Record<string, string>;
  restore: () => Promise<void>;
};

function adminUrlFrom(url: string): string {
  const u = new URL(url);
  u.pathname = '/postgres';
  return u.toString();
}

function dbUrlForName(baseUrl: string, name: string): string {
  const u = new URL(baseUrl);
  u.pathname = `/${name}`;
  return u.toString();
}

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

/**
 * Plant a real zero-constraint namespace for etl:fk-audit (not ambient nonprod).
 *
 * Creates a disposable database, applies migrations (domain tables present),
 * drops every public FOREIGN KEY, seeds etl:run, and returns a DATABASE_URL
 * that the verifier CLI runs against. Cleanup drops the database.
 */
async function plantZeroConstraintNamespace(): Promise<ZeroConstraintPlant> {
  expect(
    existsSync(join(FK_ZERO_FIXTURE, 'plant.sql')),
    'fk_audit_zero_constraints plant.sql must be committed'
  ).toBe(true);
  expect(existsSync(ETL_VALID_EXPORT), `etl-valid-export must exist: ${ETL_VALID_EXPORT}`).toBe(
    true
  );
  expect(existsSync(CATALOG_PATH), `catalog must exist: ${CATALOG_PATH}`).toBe(true);

  const databaseName = `holocron_s31_08_fk_zero_${process.pid}_${Date.now().toString(36)}`;
  // Name must stay non-production-like; dangerous override allows non-nonprod names.
  expect(databaseName.startsWith('holocron_s31_08_fk_zero_')).toBe(true);

  const ownerBase = process.env.DATABASE_URL_OWNER ?? DATABASE_URL;
  const adminUrl = adminUrlFrom(ownerBase);
  const databaseUrl = dbUrlForName(ownerBase, databaseName);

  const admin = createSql(adminUrl);
  try {
    await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName.replace(/"/g, '""')}"`);
    await admin.unsafe(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }

  let droppedCount = 0;
  const domainTablesPresent: string[] = [];

  try {
    const migrate = await applyMigrations({ databaseUrl });
    expect(migrate.ok, `plant migrate failed: ${migrate.errors?.join('; ')}`).toBe(true);

    const sql = createSql(databaseUrl);
    try {
      for (const table of DOMAIN_TABLES_REQUIRED) {
        const rows = await sql.unsafe<Array<{ reg: string | null }>>(
          `SELECT to_regclass($1)::text AS reg`,
          [`public.${table}`]
        );
        expect(rows[0]?.reg, `domain table missing after migrate: ${table}`).toBeTruthy();
        domainTablesPresent.push(table);
      }

      const existing = await sql<Array<{ table_name: string; constraint_name: string }>>`
        SELECT rel.relname AS table_name, c.conname AS constraint_name
        FROM pg_constraint c
        JOIN pg_class rel ON rel.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'
        ORDER BY rel.relname, c.conname
      `;
      for (const fk of existing) {
        await sql.unsafe(
          `ALTER TABLE "${fk.table_name.replace(/"/g, '""')}" DROP CONSTRAINT "${fk.constraint_name.replace(/"/g, '""')}"`
        );
        droppedCount += 1;
      }

      const remaining = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'
      `;
      const enforcedForeignKeysAfterPlant = Number(remaining[0]?.count ?? -1);
      expect(
        enforcedForeignKeysAfterPlant,
        'plant must leave zero public FOREIGN KEY constraints'
      ).toBe(0);
      expect(droppedCount, 'migrate must have produced FKs to drop (plant teeth)').toBeGreaterThan(
        0
      );

      // Seed a succeeded etl_runs row pointing at committed fixtures (no full ETL load).
      // fk-audit gates on unenforced edges; relationship orphans can be empty.
      await sql`
        INSERT INTO etl_runs (
          export_root,
          export_hash,
          catalog_path,
          catalog_version,
          checkpoint,
          status,
          completed_at
        ) VALUES (
          ${ETL_VALID_EXPORT},
          ${`s31-08-fk-zero-plant-${databaseName}`},
          ${CATALOG_PATH},
          ${'s31-08-plant'},
          ${'completed'},
          ${'succeeded'},
          now()
        )
      `;

      return {
        databaseUrl,
        databaseName,
        droppedCount,
        domainTablesPresent,
        enforcedForeignKeysAfterPlant,
        env: {
          DATABASE_URL: databaseUrl,
          HOLO_DANGEROUS_ALLOW_PROD_DB: '1',
        },
        restore: async () => {
          const dropAdmin = createSql(adminUrl);
          try {
            await dropAdmin.unsafe(
              `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName.replace(/'/g, "''")}' AND pid <> pg_backend_pid()`
            );
            await dropAdmin.unsafe(`DROP DATABASE IF EXISTS "${databaseName.replace(/"/g, '""')}"`);
          } finally {
            await dropAdmin.end({ timeout: 5 });
          }
        },
      };
    } finally {
      await sql.end({ timeout: 5 });
    }
  } catch (err) {
    // Best-effort drop of the disposable plant DB on failure.
    const dropAdmin = createSql(adminUrl);
    try {
      await dropAdmin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${databaseName.replace(/'/g, "''")}' AND pid <> pg_backend_pid()`
      );
      await dropAdmin.unsafe(`DROP DATABASE IF EXISTS "${databaseName.replace(/"/g, '""')}"`);
    } catch {
      // ignore cleanup errors
    } finally {
      await dropAdmin.end({ timeout: 5 });
    }
    throw err;
  }
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

  function parseFkAuditPayload(
    stdout: string,
    stderr: string
  ): {
    ok?: boolean;
    unenforcedEdges?: unknown[];
    enforcedForeignKeys?: number;
    violation_class?: string;
    error?: string;
  } | null {
    for (const chunk of [stdout, stderr]) {
      const start = chunk.indexOf('{');
      if (start < 0) continue;
      try {
        return JSON.parse(chunk.slice(start)) as {
          ok?: boolean;
          unenforcedEdges?: unknown[];
          enforcedForeignKeys?: number;
          violation_class?: string;
          error?: string;
        };
      } catch {
        // try next
      }
    }
    return null;
  }

  it('etlFkAuditRefusesUnenforcedEdges', async () => {
    // Disposable zero-constraint NS (not ambient holocron_nonprod).
    const seed = loadSeed('fk_audit_zero_constraints');
    expect(seed.violation_class).toBe('UNENFORCED_EDGES');
    expect(existsSync(join(FK_ZERO_FIXTURE, 'plant.sql'))).toBe(true);

    const plant = await plantZeroConstraintNamespace();
    try {
      const result = runHolo(['etl:fk-audit', '--json'], { env: plant.env });
      const payload = parseFkAuditPayload(result.stdout, result.stderr);

      writeEvidence('ac1-etl-fk-audit-unenforced.json', {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        plant: {
          seeded: true,
          method: 'disposable_db_migrate_drop_all_fks',
          databaseName: plant.databaseName,
          droppedCount: plant.droppedCount,
          domainTablesPresent: plant.domainTablesPresent,
          enforcedForeignKeysAfterPlant: plant.enforcedForeignKeysAfterPlant,
        },
      });

      expect(
        result.status,
        `etl:fk-audit must refuse unenforced edges:\n${result.combined}`
      ).not.toBe(0);

      expect(payload, 'fk-audit must emit JSON').not.toBeNull();
      expect(payload?.ok === true).toBe(false);
      expect(payload?.enforcedForeignKeys, 'planted zero-constraint NS').toBe(0);
      expect(result.combined).toMatch(/unenforced|UNENFORCED_EDGES|FOREIGN KEY|edge/i);
      expect(Array.isArray(payload?.unenforcedEdges)).toBe(true);
      expect(payload!.unenforcedEdges!.length).toBeGreaterThanOrEqual(1);
    } finally {
      await plant.restore();
    }
  });

  it('fiveToothlessVerifiersRefuseSeededViolations', async () => {
    /**
     * AC-1 PRIMARY — one seeded violation per registered verifier; all refuse.
     * Spawns real `bun src/cli/holo.ts …` children (never mocked).
     */
    const cases: Array<{
      id: string;
      run: () => Promise<{ status: number | null; combined: string; reasonToken: string }>;
    }> = [
      {
        id: 'catalog-assets',
        run: async () => {
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
        run: async () => {
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
        run: async () => {
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
        run: async () => {
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
        run: async () => {
          const plant = await plantZeroConstraintNamespace();
          try {
            const r = runHolo(['etl:fk-audit', '--json'], { env: plant.env });
            const payload = parseFkAuditPayload(r.stdout, r.stderr);
            // Planted zero-constraint NS must surface as zero enforced FKs.
            expect(payload?.enforcedForeignKeys).toBe(0);
            return {
              status: r.status,
              combined: r.combined,
              reasonToken: 'unenforced|UNENFORCED_EDGES|FOREIGN KEY|edge',
            };
          } finally {
            await plant.restore();
          }
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
      const { status, combined, reasonToken } = await c.run();
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
