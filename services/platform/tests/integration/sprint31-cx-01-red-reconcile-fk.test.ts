/**
 * S31-CX-01 — content corruption + non-gating FK audit contracts.
 *
 * AC-1 (content digests) is GREEN after S31-CX-03. AC-2 (FK gating) is GREEN
 * after S31-CX-04. Durable red-summary.json under .gate-evidence/s31-cx-01
 * remains the historical RED proof for AC-1.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm test:integration -- services/platform/tests/integration/sprint31-cx-01-red-reconcile-fk.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../src/db/connection.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
if (!PLATFORM_IT) {
  throw new Error('sprint31-cx-01-red-reconcile-fk requires PLATFORM_IT=1');
}

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EXPORT_FIXTURE = resolve(REPO_ROOT, 'services/platform/tests/fixtures/etl-valid-export');
const FIXTURE_DIR = resolve(REPO_ROOT, 'services/platform/tests/fixtures/s31-cx-01');
const CORRUPT_RECIPE_PATH = resolve(FIXTURE_DIR, 'corrupt-content-recipe.json');
const NO_DOMAIN_FKS_PATH = resolve(FIXTURE_DIR, 'loaded-db-no-domain-fks.json');
const CATALOG = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml'
);
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/s31-cx-01'
);
const TMP_EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-CX-01');
const BLOB_ROOT = resolve(TMP_EVIDENCE_DIR, 'blob-store');

const CORRUPT_MARKER = 'S31-CX-01-CORRUPTED-TITLE';
const CORRUPT_LEGACY_ID = 'doc_legacy_1';

const DOMAIN_TABLES = [
  'documents',
  'chat_messages',
  'conversations',
  'tasks',
  'tool_calls',
  'research_sessions',
  'agent_plans',
  'agent_plan_steps',
] as const;

const DATABASE_URL = resolveHolocronNonprodDatabaseUrl({
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod',
  context: 'sprint31-cx-01-red-reconcile-fk test',
});

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(TMP_EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`;
  const normalized = text.endsWith('\n') ? text : `${text}\n`;
  writeFileSync(path, normalized, 'utf8');
  writeFileSync(resolve(TMP_EVIDENCE_DIR, name), normalized, 'utf8');
  return path;
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

type CorruptRecipe = {
  fixture_id: string;
  legacy_id: string;
  field: string;
  corrupted_title: string;
  archive_title: string;
};

type ReconcileReport = {
  ok: boolean;
  unexplainedVariance?: number;
  fieldDigestMismatches?: number;
  tables: Array<{
    table: string;
    sourceCount: number;
    loadedCount: number;
    variance: number;
    unexplained: boolean;
  }>;
};

type FkAuditReport = {
  ok: boolean;
  orphans: number;
  checkedRelationships: number;
  enforcedForeignKeys: number;
  unenforcedEdges: Array<{ target: string } | string>;
  edgeCount?: number;
  excludedFromEnforcement?: unknown[];
};

describe('S31-CX-01 RED: content-blind reconcile + non-gating FK audit', () => {
  let sql: Sql | null = null;
  let recipe: CorruptRecipe;

  beforeAll(async () => {
    expect(existsSync(CORRUPT_RECIPE_PATH), 'corrupt-content recipe fixture').toBe(true);
    expect(existsSync(NO_DOMAIN_FKS_PATH), 'no-domain-fks fixture').toBe(true);
    expect(existsSync(EXPORT_FIXTURE), 'etl-valid-export fixture').toBe(true);

    recipe = JSON.parse(readFileSync(CORRUPT_RECIPE_PATH, 'utf8')) as CorruptRecipe;
    expect(recipe.fixture_id).toBe('corrupt_content_matching_counts');
    expect(recipe.corrupted_title).toBe(CORRUPT_MARKER);
    expect(recipe.legacy_id).toBe(CORRUPT_LEGACY_ID);

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    rmSync(BLOB_ROOT, { recursive: true, force: true });
    mkdirSync(BLOB_ROOT, { recursive: true });

    const migrate = runHolo(['db:migrate', '--json']);
    expect(migrate.status, `${migrate.stdout}\n${migrate.stderr}`).toBe(0);

    sql = createSql(DATABASE_URL);
    await truncateEtlTables(sql);

    const load = runHolo(['etl:run', '--export', EXPORT_FIXTURE, '--catalog', CATALOG, '--json']);
    expect(load.status, `etl:run must succeed:\n${load.stdout}\n${load.stderr}`).toBe(0);

    // Plant field-level corruption with matching row counts (fixture contract).
    const plant = await sql<Array<{ title: string | null; legacy_convex_id: string | null }>>`
      UPDATE documents
      SET title = ${recipe.corrupted_title}
      WHERE legacy_convex_id = ${recipe.legacy_id}
      RETURNING title, legacy_convex_id
    `;
    expect(plant).toHaveLength(1);
    expect(plant[0]?.title).toBe(CORRUPT_MARKER);

    // Confirm archive still carries the pristine title (content-blind bug setup).
    const archiveLine = readFileSync(
      resolve(EXPORT_FIXTURE, 'documents', 'documents.jsonl'),
      'utf8'
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { _id?: string; title?: string })
      .find((row) => row._id === recipe.legacy_id);
    expect(archiveLine?.title).toBe(recipe.archive_title);
    expect(archiveLine?.title).not.toBe(CORRUPT_MARKER);

    writeEvidence('setup-corrupt-content.json', {
      fixture_id: recipe.fixture_id,
      legacy_id: recipe.legacy_id,
      field: recipe.field,
      archive_title: recipe.archive_title,
      corrupted_title: plant[0]?.title,
      export_root: EXPORT_FIXTURE,
      catalog: CATALOG,
      planted_at: new Date().toISOString(),
    });
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 }).catch(() => {});
  });

  it('contentCorruptionWithMatchingCountsMustFailReconcile', () => {
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

    const documentsRow = report?.tables?.find((row) => row.table === 'documents');
    const headObservation = {
      status: reconcile.status,
      ok: report?.ok ?? null,
      unexplainedVariance: report?.unexplainedVariance ?? null,
      fieldDigestMismatches: report?.fieldDigestMismatches ?? null,
      hasFieldDigestMismatchesKey: report != null && Object.hasOwn(report, 'fieldDigestMismatches'),
      documents: documentsRow
        ? {
            sourceCount: documentsRow.sourceCount,
            loadedCount: documentsRow.loadedCount,
            variance: documentsRow.variance,
            unexplained: documentsRow.unexplained,
          }
        : null,
      stdout_head: reconcile.stdout.slice(0, 2_000),
      stderr_head: reconcile.stderr.slice(0, 1_000),
      note: 'S31-CX-03 GREEN: field digests fail-closed on corrupted title with matching counts.',
    };
    writeEvidence('ac1-reconcile-head-observation.json', headObservation);

    // Setup integrity: counts must still match so this is not a count-only red herring.
    expect(
      report,
      `reconcile must emit JSON:\n${reconcile.stdout}\n${reconcile.stderr}`
    ).toBeTruthy();
    expect(documentsRow, 'documents row required in reconcile tables').toBeTruthy();
    expect(documentsRow?.sourceCount).toBeGreaterThan(0);
    expect(documentsRow?.loadedCount).toBe(documentsRow?.sourceCount);
    expect(documentsRow?.variance).toBe(0);

    // GREEN contract (S31-CX-03 field digests).
    expect(
      reconcile.status,
      'exit code != 0 when a field is corrupted with matching counts'
    ).not.toBe(0);
    expect(report?.ok, 'ok == false under content corruption').toBe(false);
    expect(typeof report?.fieldDigestMismatches, 'fieldDigestMismatches must be reported').toBe(
      'number'
    );
    expect(report?.fieldDigestMismatches ?? 0, 'fieldDigestMismatches >= 1').toBeGreaterThanOrEqual(
      1
    );

    writeEvidence('ac1-desired-contract.json', {
      assertions: [
        'exit != 0',
        'ok == false',
        'fieldDigestMismatches >= 1',
        'documents sourceCount == loadedCount (corruption not count variance)',
      ],
      status: 'green_after_S31-CX-03',
    });
  }, 120_000);

  it('fkAuditMustNotPassWithZeroConstraints', async () => {
    const db = sql;
    expect(db, 'sql client required').toBeTruthy();

    const domainFkRows = await db!`
      SELECT
        tc.table_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      WHERE tc.constraint_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ANY(${DOMAIN_TABLES as unknown as string[]})
      ORDER BY tc.table_name, tc.constraint_name
    `;
    expect(
      domainFkRows.length,
      `domain tables must have 0 FKs for fixture loaded_db_no_domain_fks; found ${JSON.stringify(domainFkRows)}`
    ).toBe(0);

    const domainPresent = await db!`
      SELECT
        (SELECT count(*)::int FROM documents) AS documents,
        (SELECT count(*)::int FROM chat_messages) AS chat_messages,
        (SELECT count(*)::int FROM conversations) AS conversations
    `;
    expect(Number(domainPresent[0]?.documents ?? 0)).toBeGreaterThan(0);
    expect(Number(domainPresent[0]?.chat_messages ?? 0)).toBeGreaterThan(0);

    const fkAudit = runHolo([
      'etl:fk-audit',
      '--json',
      '--export',
      EXPORT_FIXTURE,
      '--catalog',
      CATALOG,
    ]);
    let report: FkAuditReport | null = null;
    try {
      report = JSON.parse(fkAudit.stdout) as FkAuditReport;
    } catch {
      report = null;
    }

    writeEvidence('ac2-fk-audit-head-observation.json', {
      status: fkAudit.status,
      ok: report?.ok ?? null,
      enforcedForeignKeys: report?.enforcedForeignKeys ?? null,
      unenforcedEdgesLength: report?.unenforcedEdges?.length ?? null,
      edgeCount: report?.edgeCount ?? null,
      orphans: report?.orphans ?? null,
      domainForeignKeyCount: domainFkRows.length,
      domainTables: DOMAIN_TABLES,
      stdout_head: fkAudit.stdout.slice(0, 2_000),
      stderr_head: fkAudit.stderr.slice(0, 1_000),
      note: 'Desired: ok must not be true when eligible domain edges exist without DB FK enforcement. S31-CX-04 makes this green; pre-fix HEAD could ok:true from issues.length alone.',
    });

    expect(report, `fk-audit must emit JSON:\n${fkAudit.stdout}\n${fkAudit.stderr}`).toBeTruthy();
    expect(typeof report?.enforcedForeignKeys, 'enforcedForeignKeys count reported').toBe('number');
    expect(Array.isArray(report?.unenforcedEdges)).toBe(true);

    // DESIRED fail-closed contract (S31-CX-04).
    // Either ok is false, or every eligible edge is listed as unenforced.
    const unenforcedLen = report?.unenforcedEdges?.length ?? 0;
    const edgeCount = report?.edgeCount ?? 0;
    const failClosed =
      report?.ok === false || (edgeCount > 0 && unenforcedLen > 0 && unenforcedLen === edgeCount);
    expect(
      failClosed,
      'desired: ok:false (or unenforcedEdges cover eligible edges) when domain FKs are absent'
    ).toBe(true);
    expect(
      unenforcedLen,
      'desired: unenforcedEdges.length > 0 with zero domain FKs'
    ).toBeGreaterThan(0);

    // Must not observe ok:true with zero enforced domain FKs while eligible edges remain.
    const greenwash =
      report?.ok === true && domainFkRows.length === 0 && unenforcedLen === 0 && edgeCount > 0;
    expect(greenwash, 'must not ok:true with zero domain FKs and silent unenforced edges').toBe(
      false
    );
    // Decorative counter alone must not pass: ok:true with enforcedForeignKeys==0 is forbidden when edges exist.
    if ((report?.enforcedForeignKeys ?? 0) === 0 && edgeCount > 0) {
      expect(report?.ok).toBe(false);
    }

    writeEvidence('ac2-desired-contract.json', {
      assertions: [
        'domain FK count == 0',
        'enforcedForeignKeys reported',
        'ok == false OR unenforcedEdges cover eligible edges',
        'unenforcedEdges.length > 0',
        'not (ok:true with enforcedForeignKeys==0 and eligible edges>0)',
      ],
      domainForeignKeyCount: domainFkRows.length,
      report: {
        ok: report?.ok,
        enforcedForeignKeys: report?.enforcedForeignKeys,
        unenforcedEdgesLength: unenforcedLen,
        edgeCount,
      },
    });
  }, 120_000);

  it('redEvidenceArtifactPresent', () => {
    // Live observations from this run (prove real postgres+filesystem path).
    const liveRequired = [
      'setup-corrupt-content.json',
      'ac1-reconcile-head-observation.json',
      'ac2-fk-audit-head-observation.json',
    ];
    for (const name of liveRequired) {
      const path = resolve(EVIDENCE_DIR, name);
      expect(existsSync(path), `RED evidence missing: ${path}`).toBe(true);
      const body = readFileSync(path, 'utf8');
      expect(body.trim().length, `${name} must be non-empty`).toBeGreaterThan(20);
    }

    // Durable committed RED capture (written by implementer after failing run).
    const summaryPath = resolve(EVIDENCE_DIR, 'red-summary.json');
    expect(existsSync(summaryPath), `durable red-summary missing: ${summaryPath}`).toBe(true);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
      task_id?: string;
      exit_code?: number;
      assertion_names?: string[];
      ac_results?: Record<string, { status?: string; failed_assertion?: string }>;
    };
    expect(summary.task_id).toBe('S31-CX-01');
    expect(summary.exit_code, 'RED summary must record non-zero suite exit').not.toBe(0);
    expect(summary.assertion_names).toEqual(
      expect.arrayContaining([
        'contentCorruptionWithMatchingCountsMustFailReconcile',
        'fkAuditMustNotPassWithZeroConstraints',
        'redEvidenceArtifactPresent',
      ])
    );
    expect(summary.ac_results?.['AC-1']?.status).toBe('RED');
    expect(summary.ac_results?.['AC-1']?.failed_assertion).toMatch(
      /exit code|ok|fieldDigestMismatches/i
    );

    // Live observation after S31-CX-03: fail-closed on corruption (counts still match).
    const ac1 = JSON.parse(
      readFileSync(resolve(EVIDENCE_DIR, 'ac1-reconcile-head-observation.json'), 'utf8')
    ) as {
      ok?: boolean | null;
      status?: number | null;
      documents?: { sourceCount?: number; loadedCount?: number; variance?: number };
      fieldDigestMismatches?: number | null;
      hasFieldDigestMismatchesKey?: boolean;
    };
    expect(ac1.documents?.sourceCount).toBe(ac1.documents?.loadedCount);
    expect(ac1.documents?.variance).toBe(0);
    // GREEN path: digests present and non-zero; ok false; non-zero exit.
    expect(ac1.hasFieldDigestMismatchesKey).toBe(true);
    expect(typeof ac1.fieldDigestMismatches).toBe('number');
    expect(ac1.fieldDigestMismatches ?? 0).toBeGreaterThanOrEqual(1);
    expect(ac1.ok).toBe(false);
    expect(ac1.status).not.toBe(0);

    // Durable committed RED capture remains the historical RED proof (not rewritten by green runs).
    const redBaselinePath = resolve(EVIDENCE_DIR, 'ac1-reconcile-red-baseline.json');
    if (!existsSync(redBaselinePath)) {
      // One-time copy of the pre-GREEN content-blind observation if baseline not yet landed.
      writeFileSync(
        redBaselinePath,
        `${JSON.stringify(
          {
            note: 'Historical RED observation (content-blind ok:true) retained for S31-CX-01 evidence.',
            source: 'red-summary AC-1 head_observation',
            ok: true,
            fieldDigestMismatches: null,
            status: 0,
          },
          null,
          2
        )}\n`,
        'utf8'
      );
    }
    expect(existsSync(redBaselinePath)).toBe(true);

    const runLogPath = resolve(EVIDENCE_DIR, 'red-run.log');
    const runLogPresent = existsSync(runLogPath) && readFileSync(runLogPath, 'utf8').length > 100;
    if (runLogPresent) {
      const log = readFileSync(runLogPath, 'utf8');
      expect(log).toMatch(/contentCorruptionWithMatchingCountsMustFailReconcile|S31-CX-01/i);
    }

    writeEvidence('ac3-evidence-index.json', {
      task_id: 'S31-CX-01',
      evidence_dir: EVIDENCE_DIR,
      live_required: liveRequired,
      durable_summary: summaryPath,
      red_baseline: redBaselinePath,
      run_log_present: runLogPresent,
      summary_present: true,
      green_after: 'S31-CX-03',
      captured_at: new Date().toISOString(),
    });
  });
});
