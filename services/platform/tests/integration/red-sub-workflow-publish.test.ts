/**
 * pipes-4 / AC-5 — RED: subscriptions sub-workflow publish missing document row.
 *
 * Start: subscription_run_without_publish — completed subscriptions run, no document.
 * Desired: documents row with source_run_id + published_at.
 *
 * Seeded data probe (TC-3): psql $DATABASE_URL -c "SELECT id FROM documents WHERE source_run_id=..."
 */
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureRedTestEnvironment, withSql } from './mission-red.helpers';
import {
  captureHoloArtifact,
  DATABASE_URL,
  ensurePipes4EvidenceDirs,
  PLATFORM_IT,
  PSQL_DATABASE_URL_MARKER,
  registerEchoTemplateAs,
  resetMissionState,
  runHolo,
  runPsql,
  writePipes4Artifact,
} from './pipes-4-red.helpers';

describe.sequential('pipes-4 AC-5 RED — sub-workflow publish document row', () => {
  beforeAll(async () => {
    ensurePipes4EvidenceDirs();
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
    expect(PSQL_DATABASE_URL_MARKER).toContain('psql $DATABASE_URL');
  }, 120_000);

  beforeEach(async () => {
    await resetMissionState();
  }, 30_000);

  it('RED missing document: subscriptions complete must publish document with source_run_id', async () => {
    // Seed a subscriptions stub template and attempt a run (may complete as echo or fail).
    registerEchoTemplateAs('subscriptions', 'subscriptions-stub');

    const idempotencyKey = `pipes4-ac5-${randomUUID()}`;
    const cli = runHolo('pipes4-ac5-subscriptions', [
      'mission',
      'run',
      'subscriptions',
      '--goal',
      'standing subscriptions publish check',
      '--idempotency-key',
      idempotencyKey,
      '--json',
    ]);
    captureHoloArtifact('AC-5-mission-run-subscriptions', cli);

    // Resolve run id from CLI output or Postgres mission_runs.
    let runId =
      (cli.parsed &&
      typeof cli.parsed === 'object' &&
      typeof (cli.parsed as { runId?: unknown }).runId === 'string'
        ? (cli.parsed as { runId: string }).runId
        : null) ??
      (cli.parsed &&
      typeof cli.parsed === 'object' &&
      typeof (cli.parsed as { run_id?: unknown }).run_id === 'string'
        ? (cli.parsed as { run_id: string }).run_id
        : null);

    if (!runId) {
      runId = await withSql(async (sql) => {
        const rows = await sql<{ id: string }[]>`
            SELECT id::text AS id
            FROM mission_runs
            WHERE template_key = 'subscriptions'
            ORDER BY created_at DESC
            LIMIT 1
          `;
        return rows[0]?.id ?? null;
      });
    }

    // Fixture fallback: synthetic completed-run id when no run row yet.
    const sourceRunId = runId ?? randomUUID();

    // Real seed verification via psql $DATABASE_URL — documents for this run must exist.
    // Column source_run_id / published_at may not exist yet (RED schema gap).
    const psqlDocs = runPsql(
      `SELECT id::text, source_run_id::text, published_at
         FROM documents
         WHERE source_run_id::text = '${sourceRunId}'
         LIMIT 5`
    );
    writePipes4Artifact('AC-5-psql-probe.txt', {
      marker: 'psql $DATABASE_URL',
      sourceRunId,
      status: psqlDocs.status,
      stdout: psqlDocs.stdout,
      stderr: psqlDocs.stderr,
    });

    // Count documents linked to the run (or any documents if column missing).
    const docState = await withSql(async (sql) => {
      const cols = await sql<{ column_name: string }[]>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'documents'
        `;
      const names = new Set(cols.map((c) => c.column_name));
      const total = await sql<{ count: string }[]>`SELECT count(*)::text AS count FROM documents`;
      let linked = 0;
      let publishedAt: string | null = null;
      if (names.has('source_run_id')) {
        const linkedRows = await sql.unsafe(
          `SELECT id::text AS id, published_at::text AS published_at
             FROM documents WHERE source_run_id::text = $1 LIMIT 5`,
          [sourceRunId]
        );
        linked = (linkedRows as Array<{ id?: string }>).length;
        publishedAt =
          ((linkedRows as Array<{ published_at?: string | null }>)[0]?.published_at as
            | string
            | null
            | undefined) ?? null;
      }
      return {
        columns: [...names],
        total: Number(total[0]?.count ?? 0),
        linked,
        publishedAt,
        hasSourceRunId: names.has('source_run_id'),
        hasPublishedAt: names.has('published_at'),
      };
    });

    writePipes4Artifact('AC-5-document-state.json', {
      sourceRunId,
      runId,
      cliStatus: cli.status,
      docState,
      psqlStatus: psqlDocs.status,
    });

    // Desired GREEN: a published document row exists for the subscriptions run.
    // RED-against-start: documents table empty / missing source_run_id → fail.
    expect(
      docState.hasSourceRunId,
      'expected document to exist — documents table empty or missing source_run_id column'
    ).toBe(true);
    expect(
      docState.linked,
      `expected document to exist — documents table empty for source_run_id=${sourceRunId}`
    ).toBeGreaterThan(0);
    expect(
      docState.publishedAt,
      `expected document to exist with published_at; got published_at=${String(docState.publishedAt)}`
    ).toBeTruthy();
  }, 120_000);
});
