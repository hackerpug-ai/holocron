/**
 * S31-CX-03 — Content-level reconciliation + empty source fail-closed.
 *
 * AC-2 empty retained source table
 * AC-3 clean archive zero field digest mismatches
 * AC-4 defaulted_column inventory when DB defaults substitute null/missing source
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm test:integration -- packages/platform/tests/integration/sprint31-cx-03-content-reconcile.test.ts
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error('sprint31-cx-03-content-reconcile requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const EXPORT_FIXTURE = resolve(REPO_ROOT, 'packages/platform/tests/fixtures/etl-valid-export');
const FIXTURE_DIR = resolve(REPO_ROOT, 'packages/platform/tests/fixtures/s31-cx-03');
const CATALOG = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const TMP_DIR = resolve(REPO_ROOT, '.tmp/S31-CX-03');
const BLOB_ROOT = resolve(TMP_DIR, 'blob-store');
const EMPTY_EXPORT = resolve(TMP_DIR, 'empty-retained-source-export');
const DEFAULTED_EXPORT = resolve(TMP_DIR, 'defaulted-column-export');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/s31-cx-03'
);

const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod',
  context: 'sprint31-cx-03-content-reconcile test',
});

type ReconcileReport = {
  ok: boolean;
  fieldDigestMismatches?: number;
  fieldDigestMismatchDetails?: Array<{ table: string; field: string }>;
  defaulted_column?: Array<{ table: string; column: string; count: number }>;
  emptySourceTables?: Array<{ table: string; reason: string }>;
  tables: Array<{
    table: string;
    sourceCount: number;
    loadedCount: number;
    variance: number;
  }>;
};

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const normalized = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(resolve(EVIDENCE_DIR, name), normalized, 'utf8');
  writeFileSync(resolve(TMP_DIR, name), normalized, 'utf8');
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('bun', [HOLO, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      PLATFORM_IT: '1',
      HOLO_BLOB_ROOT: BLOB_ROOT,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

async function truncateEtlTables(sql: Sql): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      upload_intents,
      etl_stage,
      etl_runs,
      file_objects,
      convex_id_map,
      passages,
      sources,
      chat_messages,
      tool_calls,
      agent_plan_steps,
      agent_plans,
      agent_telemetry,
      citations,
      imports,
      research_findings,
      research_iterations,
      research_sessions,
      analysis_evidence,
      analysis_items,
      analysis_sessions,
      audio_segments,
      audio_jobs,
      video_transcripts,
      transcript_jobs,
      audio_transcripts,
      audio_transcript_jobs,
      improvement_images,
      improvement_requests,
      voice_commands,
      voice_sessions,
      tasks,
      documents,
      conversations
    RESTART IDENTITY CASCADE
  `);
}

function materializeEmptyRetainedSourceExport(dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  cpSync(EXPORT_FIXTURE, dest, { recursive: true });
  // Table file present with 0 rows — catalog disposition preserve (not approved-empty).
  writeFileSync(join(dest, 'documents', 'documents.jsonl'), '', 'utf8');
}

function materializeDefaultedColumnExport(dest: string): void {
  rmSync(dest, { recursive: true, force: true });
  cpSync(EXPORT_FIXTURE, dest, { recursive: true });
  const path = join(dest, 'documents', 'documents.jsonl');
  const lines = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line) as Record<string, unknown>;
      if (row._id === 'doc_legacy_1') {
        // Null source status → load skips non-null column with default → DB default 'draft'.
        row.status = null;
      }
      return JSON.stringify(row);
    });
  writeFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

describe('S31-CX-03 content reconcile + empty source fail-closed', () => {
  let sql: Sql | null = null;

  beforeAll(async () => {
    expect(existsSync(EXPORT_FIXTURE), 'etl-valid-export fixture').toBe(true);
    mkdirSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    rmSync(BLOB_ROOT, { recursive: true, force: true });
    mkdirSync(BLOB_ROOT, { recursive: true });

    materializeEmptyRetainedSourceExport(EMPTY_EXPORT);
    materializeDefaultedColumnExport(DEFAULTED_EXPORT);

    const migrate = runHolo(['db:migrate', '--json']);
    expect(migrate.status, `${migrate.stdout}\n${migrate.stderr}`).toBe(0);

    sql = createSql(DATABASE_URL);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('emptyRetainedSourceTableFailsClosed', async () => {
    const db = sql;
    expect(db).toBeTruthy();
    await truncateEtlTables(db!);

    // Seed a successful run (required by loadLatestRunContext) from the full fixture.
    const load = runHolo(['etl:run', '--export', EXPORT_FIXTURE, '--catalog', CATALOG, '--json']);
    expect(load.status, `etl:run seed must succeed:\n${load.stdout}\n${load.stderr}`).toBe(0);

    // Reconcile against archive with empty retained documents table.
    const reconcile = runHolo([
      'etl:reconcile',
      '--json',
      '--export',
      EMPTY_EXPORT,
      '--catalog',
      CATALOG,
    ]);
    let report: ReconcileReport | null = null;
    try {
      report = JSON.parse(reconcile.stdout) as ReconcileReport;
    } catch {
      report = null;
    }

    const combined = `${reconcile.stdout}\n${reconcile.stderr}`;
    writeEvidence('ac2-empty-source-observation.json', {
      status: reconcile.status,
      ok: report?.ok ?? null,
      emptySourceTables: report?.emptySourceTables ?? null,
      documents: report?.tables?.find((row) => row.table === 'documents') ?? null,
      stdout_head: reconcile.stdout.slice(0, 2_000),
      stderr_head: reconcile.stderr.slice(0, 1_000),
    });

    expect(reconcile.status, `must exit non-zero:\n${combined}`).not.toBe(0);
    expect(report, `must emit JSON:\n${combined}`).toBeTruthy();
    expect(report?.ok).toBe(false);

    const empty = report?.emptySourceTables ?? [];
    expect(empty.length, 'emptySourceTables must list the empty retained table').toBeGreaterThan(0);
    const documentsEmpty = empty.find((row) => row.table === 'documents');
    expect(documentsEmpty, 'documents must be named as EMPTY_SOURCE_TABLE').toBeTruthy();
    expect(documentsEmpty?.reason).toBe('EMPTY_SOURCE_TABLE');

    // Text / JSON must name EMPTY_SOURCE_TABLE + table.
    expect(combined).toMatch(/EMPTY_SOURCE_TABLE/);
    expect(combined).toMatch(/documents/);
  }, 180_000);

  it('cleanArchiveZeroFieldDigestMismatches', async () => {
    const db = sql;
    expect(db).toBeTruthy();
    await truncateEtlTables(db!);

    const load = runHolo(['etl:run', '--export', EXPORT_FIXTURE, '--catalog', CATALOG, '--json']);
    expect(load.status, `etl:run must succeed:\n${load.stdout}\n${load.stderr}`).toBe(0);

    const reconcile = runHolo([
      'etl:reconcile',
      '--json',
      '--export',
      EXPORT_FIXTURE,
      '--catalog',
      CATALOG,
    ]);
    let report: ReconcileReport | null = null;
    try {
      report = JSON.parse(reconcile.stdout) as ReconcileReport;
    } catch {
      report = null;
    }

    writeEvidence('ac3-clean-archive-observation.json', {
      status: reconcile.status,
      ok: report?.ok ?? null,
      fieldDigestMismatches: report?.fieldDigestMismatches ?? null,
      defaulted_column_count: report?.defaulted_column?.length ?? null,
      emptySourceTables: report?.emptySourceTables ?? null,
      mismatch_details: report?.fieldDigestMismatchDetails?.slice(0, 10) ?? null,
      stdout_head: reconcile.stdout.slice(0, 2_000),
      stderr_head: reconcile.stderr.slice(0, 1_000),
    });

    expect(report, `must emit JSON:\n${reconcile.stdout}\n${reconcile.stderr}`).toBeTruthy();
    expect(typeof report?.fieldDigestMismatches, 'fieldDigestMismatches must be present').toBe(
      'number'
    );
    expect(
      report?.fieldDigestMismatches,
      `clean archive must have zero field digest mismatches; details=${JSON.stringify(report?.fieldDigestMismatchDetails?.slice(0, 5))}`
    ).toBe(0);
    expect(report?.emptySourceTables ?? []).toHaveLength(0);

    // ok depends on digests + variance + empty (and orphans/blob). Clean fixture should pass.
    expect(reconcile.status, `${reconcile.stdout}\n${reconcile.stderr}`).toBe(0);
    expect(report?.ok).toBe(true);
  }, 180_000);

  it('defaultedColumnsReported', async () => {
    const db = sql;
    expect(db).toBeTruthy();
    await truncateEtlTables(db!);

    const load = runHolo(['etl:run', '--export', DEFAULTED_EXPORT, '--catalog', CATALOG, '--json']);
    expect(
      load.status,
      `etl:run defaulted fixture must succeed:\n${load.stdout}\n${load.stderr}`
    ).toBe(0);

    // Confirm DB received default 'draft' for the null-source status.
    const planted = await db!`
      SELECT status, legacy_convex_id
      FROM documents
      WHERE legacy_convex_id = 'doc_legacy_1'
    `;
    expect(planted).toHaveLength(1);
    expect(planted[0]?.status).toBe('draft');

    const reconcile = runHolo([
      'etl:reconcile',
      '--json',
      '--export',
      DEFAULTED_EXPORT,
      '--catalog',
      CATALOG,
    ]);
    let report: ReconcileReport | null = null;
    try {
      report = JSON.parse(reconcile.stdout) as ReconcileReport;
    } catch {
      report = null;
    }

    writeEvidence('ac4-defaulted-column-observation.json', {
      status: reconcile.status,
      ok: report?.ok ?? null,
      fieldDigestMismatches: report?.fieldDigestMismatches ?? null,
      defaulted_column: report?.defaulted_column ?? null,
      planted_status: planted[0]?.status ?? null,
      stdout_head: reconcile.stdout.slice(0, 2_000),
      stderr_head: reconcile.stderr.slice(0, 1_000),
    });

    expect(report, `must emit JSON:\n${reconcile.stdout}\n${reconcile.stderr}`).toBeTruthy();
    expect(Array.isArray(report?.defaulted_column), 'defaulted_column inventory required').toBe(
      true
    );

    const statusDefaulted = report?.defaulted_column?.find(
      (row) => row.table === 'documents' && row.column === 'status'
    );
    expect(
      statusDefaulted,
      `documents.status must appear in defaulted_column; got ${JSON.stringify(report?.defaulted_column)}`
    ).toBeTruthy();
    expect(statusDefaulted?.count ?? 0).toBeGreaterThanOrEqual(1);

    // Default substitution is inventory — must not be counted as a field digest mismatch for that column.
    const statusMismatch = report?.fieldDigestMismatchDetails?.find(
      (row) => row.table === 'documents' && row.field === 'status'
    );
    expect(statusMismatch, 'status default substitution must not be a digest mismatch').toBeFalsy();
  }, 180_000);
});
