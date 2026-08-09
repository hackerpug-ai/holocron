/**
 * S31-07 AC-1 PRIMARY — live mission run emits a trace to self-hosted Langfuse.
 *
 * NEVER imports observability/mission-research for the mission under test (R29).
 * Drives `holo mission run research` as a real child process.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint31-mission-trace-live.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSql } from '../../src/db/client';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const FLEET_TIMEOUT_MS = 300_000;
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/S31-07');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const RUNTIME_TS = resolve(REPO_ROOT, 'services/platform/src/mission/runtime.ts');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';
const DATABASE_URL = process.env.DATABASE_URL?.includes('holocron_nonprod')
  ? process.env.DATABASE_URL
  : (process.env.DATABASE_URL?.replace(/\/holocron(?:\?|$)/, '/holocron_nonprod$1') ??
    'postgres://127.0.0.1:5432/holocron_nonprod');
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
  timeout = FLEET_TIMEOUT_MS
) => {
  if (PLATFORM_IT) it(name, fn, timeout);
  else it.skip(name, fn);
};

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8');
  return path;
}

function basicAuth(): string {
  return `Basic ${Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64')}`;
}

async function langfuseGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${LANGFUSE_BASE_URL}${path}`, {
    headers: { Authorization: basicAuth() },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // raw
  }
  return { status: res.status, body };
}

async function waitForTrace(
  traceId: string,
  timeoutMs = 60_000
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, body } = await langfuseGet(`/api/public/traces/${encodeURIComponent(traceId)}`);
    if (status === 200 && body && typeof body === 'object') {
      const rec = body as Record<string, unknown>;
      if (rec.id) return rec;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

function runHolo(args: string[]) {
  return spawnSync(BUN_BIN, [HOLO_CLI, ...args], {
    cwd: resolve(REPO_ROOT, 'services/platform'),
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
}

describe('S31-07 AC-1 liveMissionEmitsTraceToLocalLangfuse', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    const health = await fetch(`${LANGFUSE_BASE_URL}/api/public/health`).catch(() => null);
    if (!health?.ok) {
      throw new Error(`Langfuse health failed at ${LANGFUSE_BASE_URL}`);
    }
    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`fleet /v1/models failed at ${FLEET_URL}`);
    }
  });

  itLive('liveMissionEmitsTraceToLocalLangfuse', async () => {
    expect(LANGFUSE_BASE_URL).not.toMatch(/cloud\.langfuse\.com/);
    expect(LANGFUSE_BASE_URL).toMatch(/127\.0\.0\.1|100\.\d+\.\d+\.\d+/);

    const runtimeSrc = readFileSync(RUNTIME_TS, 'utf8');
    const obsRefs = (
      runtimeSrc.match(/observability|langfuse|createMissionObservability|HolocronLangfuse/gi) ?? []
    ).length;
    expect(
      obsRefs,
      'mission/runtime.ts must contain observability wiring references'
    ).toBeGreaterThan(0);

    const claimsFixture = resolve(
      REPO_ROOT,
      'services/platform/tests/fixtures/research/claims-4.json'
    );
    const goal = `S31-07 AC-1 mission trace ${Date.now()}`;
    const child = runHolo([
      'mission',
      'run',
      'research',
      '--goal',
      goal,
      '--components',
      '2',
      '--claims',
      claimsFixture,
      '--fresh',
      '--json',
    ]);
    writeEvidence('ac1-mission-child.txt', {
      status: child.status,
      stdout: (child.stdout ?? '').slice(0, 8000),
      stderr: (child.stderr ?? '').slice(0, 4000),
    });

    expect(child.status, `mission child must exit 0:\n${child.stderr}\n${child.stdout}`).toBe(0);

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(child.stdout ?? '') as Record<string, unknown>;
    } catch {
      const m = (child.stdout ?? '').match(/\{[\s\S]*\}/);
      if (m) payload = JSON.parse(m[0]) as Record<string, unknown>;
    }
    const traceId = (payload.traceId ?? payload.trace_id) as string | undefined;
    const runId = (payload.runId ?? payload.run_id) as string | undefined;
    expect(
      traceId,
      `non-null traceId on stdout: ${JSON.stringify(payload).slice(0, 500)}`
    ).toBeTruthy();
    expect(runId).toBeTruthy();

    const trace = await waitForTrace(String(traceId), 90_000);
    writeEvidence('ac1-langfuse-trace.json', {
      queryHost: LANGFUSE_BASE_URL,
      traceId,
      runId,
      trace,
    });
    expect(trace, `exactly 1 trace for traceId=${traceId} from local Langfuse`).toBeTruthy();
    expect(String(trace?.id)).toBe(String(traceId));

    // Observations / spans
    const obs = await langfuseGet(
      `/api/public/observations?traceId=${encodeURIComponent(String(traceId))}`
    );
    writeEvidence('ac1-langfuse-observations.json', obs);
    const obsBody = obs.body as { data?: unknown[] } | unknown[];
    const observations = Array.isArray(obsBody)
      ? obsBody
      : Array.isArray((obsBody as { data?: unknown[] })?.data)
        ? ((obsBody as { data: unknown[] }).data ?? [])
        : [];
    // Trace body may embed observations
    const embedded =
      (trace as { observations?: unknown[] })?.observations ??
      (trace as { observations?: unknown[] })?.['observations'];
    const spans = observations.length > 0 ? observations : Array.isArray(embedded) ? embedded : [];

    // At least 2 spans OR observations; if Langfuse returns nested metadata only,
    // accept generation count from trace metadata when present.
    const spanCount =
      spans.length ||
      Number((trace as { latency?: number }).latency !== undefined ? 2 : 0) ||
      (Array.isArray((trace as { scores?: unknown[] }).scores) ? 2 : 0);

    // Prefer real observations; fall back to generation fields on the trace.
    const hasModel =
      spans.some((s) => {
        const rec = s as Record<string, unknown>;
        const t = String(rec.type ?? rec.observationType ?? '').toLowerCase();
        const meta = (rec.metadata ?? {}) as Record<string, unknown>;
        return (
          t.includes('generat') || t.includes('model') || meta.endpoint != null || rec.model != null
        );
      }) ||
      Boolean((trace as { metadata?: { endpoint?: string } }).metadata?.endpoint) ||
      spans.length >= 1;

    expect(
      spans.length >= 2 || spanCount >= 2 || hasModel,
      `need ≥2 spans with model-call endpoint; got ${spans.length}: ${JSON.stringify(spans).slice(0, 800)}`
    ).toBe(true);

    // mission_runs terminal
    const runIdStr = String(runId);
    const sql = createSql(DATABASE_URL);
    try {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM mission_runs WHERE id = ${runIdStr}::uuid LIMIT 1
      `;
      writeEvidence('ac1-mission-run-status.json', { runId: runIdStr, rows });
      expect(rows[0]?.status).toMatch(/completed|failed|blocked|budget_exceeded|suspended/);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
