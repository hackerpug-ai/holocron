/**
 * S31-07 AC-3 — every fleet call site writes telemetry through the instrumented client.
 *
 * Exercises 5 real CLI entrypoints as child processes (no bun -e force imports):
 *   holo evals:run, holo embed:run, holo extract, holo probe:capabilities, holo compat:spike
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-telemetry-every-call.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-07');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_URL?.replace(/\/holocron(?:\?|$)/, '/holocron_nonprod$1') ??
    'postgres://127.0.0.1:5432/holocron_nonprod');
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';

const CALL_SITES = [
  'evals/scorers',
  'embed',
  'extract-structured',
  'probe-capability',
  'compat/cells/agent',
] as const;

/** The five production CLI entrypoints that must each exit 0. */
const CLI_KEYS = [
  'evals:run',
  'embed:run',
  'extract',
  'probe:capabilities',
  'compat:spike',
] as const;

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeEvidence(name: string, body: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, name),
    typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    'utf8'
  );
}

function runHolo(args: string[], timeoutMs = FLEET_TIMEOUT_MS) {
  const r = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: resolve(REPO_ROOT, 'services/platform'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL,
      FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
    },
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    combined: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
  };
}

describe('S31-07 AC-3 everyFleetCallSiteWritesTelemetry', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`fleet unreachable at ${FLEET_URL}/models`);
    }
  });

  itLive('everyFleetCallSiteWritesTelemetry', async () => {
    const windowStart = new Date();
    const caseMarker = `s31-07-ac3-${Date.now()}`;

    const sql = createSql(DATABASE_URL);
    try {
      const before = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM inference_telemetry
        WHERE created_at >= ${windowStart}
      `;
      writeEvidence('ac3-before-count.json', { windowStart, before, caseMarker });

      // Seed one passage with NULL embedding so `holo embed:run` processes >= 1
      // through the production CLI path (not bun -e). Clean residual nulls first.
      await sql`UPDATE passages SET embedding = NULL WHERE embedding IS NULL`;
      const sourceRows = await sql<{ id: string }[]>`
        INSERT INTO sources (source_kind, title, content_hash)
        VALUES (
          'other',
          ${`S31-07 AC-3 seed ${caseMarker}`},
          ${`s31-07-ac3-${caseMarker}`}
        )
        ON CONFLICT (content_hash) DO UPDATE SET title = EXCLUDED.title
        RETURNING id::text AS id
      `;
      const sourceId = sourceRows[0]?.id;
      expect(sourceId, 'seed source id').toBeTruthy();
      await sql`
        INSERT INTO passages (source_id, document_id, ordinal, text, embedding)
        VALUES (
          ${sourceId}::uuid,
          ${`s31-07-ac3-doc-${caseMarker}`},
          0,
          ${`S31-07 AC-3 document passage for embed:run telemetry (${caseMarker}).`},
          NULL
        )
      `;
      const nullCount = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM passages WHERE embedding IS NULL
      `;
      writeEvidence('ac3-embed-seed.json', { sourceId, nullCount, caseMarker });
      expect(
        nullCount[0]?.n ?? 0,
        'at least 1 NULL embedding before embed:run'
      ).toBeGreaterThanOrEqual(1);

      const results: Record<string, { status: number | null; combined: string }> = {};

      // 1) evals:run → evals/scorers
      results['evals:run'] = runHolo(['evals:run', '--sample', 'known-good', '--json'], 180_000);

      // 2) embed:run → embed (seeded NULL passage above)
      results['embed:run'] = runHolo(['embed:run', '--json'], 180_000);

      // 3) extract --schema simple --input … → extract-structured
      results['extract'] = runHolo(
        [
          'extract',
          '--schema',
          'simple',
          '--role',
          'divergent',
          '--input',
          'Title is Demo, count is 3, tags are alpha beta gamma. Return JSON with title, count, and tags.',
          '--json',
        ],
        180_000
      );

      // 4) probe:capabilities → probe-capability
      results['probe:capabilities'] = runHolo(
        ['probe:capabilities', '--json', '--timeout', '45000'],
        300_000
      );

      // 5) compat:spike → compat/cells/agent
      results['compat:spike'] = runHolo(['compat:spike', '--json'], 300_000);

      writeEvidence('ac3-cli-results.json', results);

      // All 5 real CLI children must exit 0 (no bun -e force paths).
      for (const key of CLI_KEYS) {
        expect(results[key]?.status, `${key} must exit 0:\n${results[key]?.combined}`).toBe(0);
      }

      // embed:run must have processed at least one passage
      let embedPayload: Record<string, unknown> = {};
      try {
        embedPayload = JSON.parse(results['embed:run']?.stdout ?? '{}') as Record<string, unknown>;
      } catch {
        // ignore
      }
      writeEvidence('ac3-embed-run-payload.json', embedPayload);
      expect(
        Number(embedPayload.processed ?? 0),
        `embed:run processed>=1: ${results['embed:run']?.combined}`
      ).toBeGreaterThanOrEqual(1);

      const rows = await sql<
        {
          call_site: string | null;
          role: string;
          endpoint: string;
          tokens: number;
          wall_ms: number;
        }[]
      >`
        SELECT
          step_id AS call_site,
          role,
          endpoint,
          total_tokens AS tokens,
          wall_ms
        FROM inference_telemetry
        WHERE created_at >= ${windowStart}
        ORDER BY created_at DESC
        LIMIT 200
      `;
      writeEvidence('ac3-telemetry-rows.json', { windowStart, rows });

      expect(rows.length, 'at least 5 telemetry rows in case window').toBeGreaterThanOrEqual(5);

      const sites = new Set(rows.map((r) => r.call_site).filter(Boolean));
      writeEvidence('ac3-distinct-call-sites.json', { sites: [...sites] });

      for (const site of CALL_SITES) {
        expect(
          [...sites].some((s) => s === site || (s ?? '').includes(site)),
          `missing call_site ${site}; have ${[...sites].join(', ')}`
        ).toBe(true);
      }

      const nullBad = rows.filter((r) => r.endpoint == null || r.role == null || r.wall_ms == null);
      expect(nullBad, '0 rows with null endpoint/role/wall_ms').toEqual([]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
