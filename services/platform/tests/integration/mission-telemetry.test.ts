/**
 * FIX-obs-5-H1 — Research mission must write durable inference_telemetry rows.
 *
 * AC-2 / TC-2: after a real `holo mission run research`, Postgres has ≥1
 * inference_telemetry row for that runId (tokens, wall-ms, endpoint, role)
 * correlated by run_id + trace_id, and `holo telemetry:tail` surfaces it.
 *
 * RED: mission completes (Langfuse ok) but inference_telemetry has 0 rows.
 * GREEN: every real model call under the research mission inserts one row.
 *
 * No mocks of fleet / Postgres. PLATFORM_IT=1 required.
 *
 * Run:
 *   PLATFORM_IT=1 \
 *   DATABASE_URL=postgres://inference1@127.0.0.1:5432/holocron \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   LANGFUSE_BASE_URL=http://127.0.0.1:3100 \
 *   LANGFUSE_PUBLIC_KEY=pk-lf-holocron-obs1-public \
 *   LANGFUSE_SECRET_KEY=sk-lf-holocron-obs1-secret \
 *   pnpm vitest run services/platform/tests/integration/mission-telemetry.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client';
import { resolveDatabaseUrl } from '../../src/db/connection';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/FIX-obs-5-H1');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL ?? resolveDatabaseUrl({ preferHolocron: true });
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';
const LANGFUSE_BASE_URL = (process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3100').replace(
  /\/$/,
  ''
);
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? 'pk-lf-holocron-obs1-public';
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? 'sk-lf-holocron-obs1-secret';

const itLive = (
  name: string,
  fn: () => Promise<unknown> | undefined,
  timeout: number = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function runHolo(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL,
      FLEET_URL,
      FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
      LANGFUSE_BASE_URL,
      LANGFUSE_PUBLIC_KEY,
      LANGFUSE_SECRET_KEY,
    },
    timeout: FLEET_TIMEOUT_MS,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function parseJsonStdout(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (line.startsWith('{') || line.startsWith('[')) {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        // try full stdout below
      }
    }
  }
  return JSON.parse(trimmed) as Record<string, unknown>;
}

type TelemetryRow = {
  id: string;
  runId: string | null;
  stepId: string | null;
  traceId: string | null;
  role: string;
  provider: string;
  endpoint: string;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  wallMs: number;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
};

async function queryTelemetryByRunId(sql: Sql, runId: string): Promise<TelemetryRow[]> {
  const rows = await sql<
    {
      id: string;
      run_id: string | null;
      step_id: string | null;
      trace_id: string | null;
      role: string;
      provider: string;
      endpoint: string;
      model_id: string | null;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      wall_ms: number;
      status: string;
      error_code: string | null;
      error_message: string | null;
    }[]
  >`
    SELECT
      id::text,
      run_id,
      step_id,
      trace_id,
      role,
      provider,
      endpoint,
      model_id,
      input_tokens,
      output_tokens,
      total_tokens,
      wall_ms,
      status,
      error_code,
      error_message
    FROM inference_telemetry
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `;
  return rows.map((r) => ({
    id: r.id,
    runId: r.run_id,
    stepId: r.step_id,
    traceId: r.trace_id,
    role: r.role,
    provider: r.provider,
    endpoint: r.endpoint,
    modelId: r.model_id,
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    totalTokens: Number(r.total_tokens),
    wallMs: Number(r.wall_ms),
    status: r.status,
    errorCode: r.error_code,
    errorMessage: r.error_message,
  }));
}

describe('FIX-obs-5-H1 mission research → inference_telemetry', () => {
  beforeAll(() => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  itLive(
    'AC-2: holo mission run research writes ≥1 inference_telemetry row (tokens/wall-ms/endpoint/role)',
    async () => {
      const goal = 'One-sentence finding on durable inference telemetry for research missions.';
      const mission = runHolo(['mission', 'run', 'research', '--goal', goal, '--json']);

      writeArtifact('mission-run.json', {
        status: mission.status,
        stdout: mission.stdout.slice(0, 8000),
        stderr: mission.stderr.slice(0, 4000),
      });

      expect(
        mission.status,
        `mission run exit: status=${mission.status} stderr=${mission.stderr.slice(0, 500)}`
      ).toBe(0);

      const payload = parseJsonStdout(mission.stdout);
      const runId = String(payload.runId ?? '');
      const traceId = payload.traceId != null ? String(payload.traceId) : '';

      expect(runId.length, 'runId present').toBeGreaterThan(0);
      expect(traceId.length, 'traceId present').toBeGreaterThan(0);
      expect(payload.ok, `mission ok: ${JSON.stringify(payload).slice(0, 400)}`).toBe(true);

      const sql = createSql(DATABASE_URL);
      let rows: TelemetryRow[] = [];
      try {
        rows = await queryTelemetryByRunId(sql, runId);
        writeArtifact('AC-2-db-query.json', {
          runId,
          traceId,
          rowCount: rows.length,
          rows,
        });
      } finally {
        await sql.end({ timeout: 5 });
      }

      expect(
        rows.length,
        `inference_telemetry rows for runId=${runId}: expected ≥1, got ${rows.length}`
      ).toBeGreaterThanOrEqual(1);

      for (const row of rows) {
        expect(row.runId).toBe(runId);
        expect(row.wallMs, 'wallMs > 0').toBeGreaterThan(0);
        expect(row.role, 'role non-empty').toBeTruthy();
        expect(
          row.endpoint.includes('127.0.0.1:4545') ||
            row.endpoint.includes('localhost:4545') ||
            row.endpoint === FLEET_URL,
          `endpoint local fleet, got ${row.endpoint}`
        ).toBe(true);
        // Successful model call should report token usage from the fleet.
        if (row.status === 'success') {
          expect(row.totalTokens, 'totalTokens ≥ 1 on success').toBeGreaterThanOrEqual(1);
          expect(row.inputTokens + row.outputTokens).toBeGreaterThanOrEqual(1);
        }
        // Correlation: row.traceId should match mission trace when both set.
        if (row.traceId && traceId) {
          expect(row.traceId).toBe(traceId);
        }
        // Never persist prompt/response bodies.
        const serialized = JSON.stringify(row).toLowerCase();
        expect(serialized).not.toMatch(/research mission goal:|prompt\s*[:=]|assistant:/i);
      }

      // Operator surface: holo telemetry:tail --run-id <runId> --json
      const tail = runHolo(['telemetry:tail', '--run-id', runId, '--json']);
      writeArtifact('AC-2-telemetry-tail.json', {
        status: tail.status,
        stdout: tail.stdout.slice(0, 8000),
        stderr: tail.stderr.slice(0, 2000),
      });
      expect(tail.status, `telemetry:tail exit: ${tail.stderr}`).toBe(0);
      const tailPayload = parseJsonStdout(tail.stdout);
      expect(tailPayload.ok).toBe(true);
      expect(Number(tailPayload.count ?? 0), 'telemetry:tail count ≥ 1').toBeGreaterThanOrEqual(1);
      const tailRows = (tailPayload.rows as TelemetryRow[] | undefined) ?? [];
      expect(tailRows.length).toBeGreaterThanOrEqual(1);
      expect(tailRows.some((r) => r.runId === runId)).toBe(true);
      expect(
        tailRows.some(
          (r) =>
            typeof r.wallMs === 'number' &&
            r.wallMs > 0 &&
            typeof r.role === 'string' &&
            r.role.length > 0 &&
            typeof r.endpoint === 'string' &&
            r.endpoint.length > 0
        )
      ).toBe(true);
    }
  );
});
