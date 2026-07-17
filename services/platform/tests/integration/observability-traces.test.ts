/**
 * obs-1 — Observability wiring: OTel → self-hosted Langfuse (per-run traces)
 *
 * Integration against REAL Mastra + Postgres + self-hosted Langfuse + local fleet.
 * No mocks of those seams.
 *
 * Run:
 *   PLATFORM_IT=1 \
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *   LANGFUSE_BASE_URL=http://127.0.0.1:3100 \
 *   LANGFUSE_PUBLIC_KEY=pk-lf-holocron-obs1-public \
 *   LANGFUSE_SECRET_KEY=sk-lf-holocron-obs1-secret \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm test -- services/platform/tests/integration/observability-traces.test.ts
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/obs-1');

const LANGFUSE_BASE_URL = (process.env.LANGFUSE_BASE_URL ?? 'http://127.0.0.1:3100').replace(
  /\/$/,
  ''
);
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? 'pk-lf-holocron-obs1-public';
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? 'sk-lf-holocron-obs1-secret';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';

const SECRET_SENTINEL = 'trace-secret-001';
const PII_EMAIL = 'trace@example.invalid';
const SERVICE_NAME = 'holocron-platform';

type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

function basicAuthHeader(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

async function runHolo(
  args: string[],
  env: Record<string, string | undefined> = {}
): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bun', [HOLO_CLI, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DATABASE_URL,
        FLEET_URL,
        FLEET_KEY: process.env.FLEET_KEY ?? 'sk-none',
        LANGFUSE_BASE_URL,
        LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

async function langfuseGet(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${LANGFUSE_BASE_URL}${path}`, {
    headers: {
      Authorization: basicAuthHeader(LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY),
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep raw text
  }
  return { status: res.status, body };
}

async function waitForTrace(
  traceId: string,
  timeoutMs = 30_000
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, body } = await langfuseGet(`/api/public/traces/${traceId}`);
    if (status === 200 && body && typeof body === 'object') {
      const rec = body as Record<string, unknown>;
      if (rec.id) return rec;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function parseJsonStdout(stdout: string): Record<string, unknown> {
  const trimmed = stdout.trim();
  // Prefer last JSON object in stdout (CLI may log progress lines first).
  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
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

function writeEvidence(name: string, content: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  writeFileSync(
    path,
    typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    'utf8'
  );
}

describe('obs-1 observability traces → self-hosted Langfuse', () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    // Fail closed if Langfuse is unreachable — never treat empty as green.
    const health = await fetch(`${LANGFUSE_BASE_URL}/api/public/health`).catch(() => null);
    if (!health?.ok) {
      throw new Error(
        `self-hosted Langfuse health failed at ${LANGFUSE_BASE_URL}/api/public/health`
      );
    }
    // Fleet must be up for real model spans.
    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`local fleet unreachable at ${FLEET_URL}/models`);
    }
  });

  itLive(
    'AC-1/TC-1: one Langfuse trace per research mission run (serviceName holocron-platform)',
    async () => {
      const goal = 'Observability trace fixture';
      const cli = await runHolo(['mission', 'run', 'research', '--goal', goal, '--json']);
      writeEvidence('ac1-cli.json', {
        exitCode: cli.exitCode,
        stdout: cli.stdout,
        stderr: cli.stderr,
      });

      expect(cli.exitCode, `cli stderr: ${cli.stderr}\nstdout: ${cli.stdout}`).toBe(0);
      const payload = parseJsonStdout(cli.stdout);
      writeEvidence('ac1-payload.json', payload);

      expect(payload.ok).toBe(true);
      expect(payload.errorCode ?? null).toBeNull();
      expect(payload.langfuseExportOk).toBe(true);
      expect(payload.serviceName).toBe(SERVICE_NAME);

      const traceId = String(payload.traceId ?? '');
      expect(traceId.length, 'traceId must be non-empty').toBeGreaterThan(0);

      const runId = String(payload.runId ?? '');
      expect(runId.length, 'runId must be non-empty').toBeGreaterThan(0);

      const trace = await waitForTrace(traceId);
      writeEvidence('ac1-langfuse-trace.json', trace);
      expect(trace, 'Langfuse must return the mission trace').not.toBeNull();
      expect(trace!.id).toBe(traceId);

      // Exactly one root trace for this run (query by run metadata / name).
      const list = await langfuseGet(
        `/api/public/traces?limit=50&name=${encodeURIComponent('research-mission')}`
      );
      writeEvidence('ac1-langfuse-list.json', list.body);
      expect(list.status).toBe(200);
      const data = (list.body as { data?: Array<Record<string, unknown>> }).data ?? [];
      const matching = data.filter((t) => {
        const meta = (t.metadata ?? {}) as Record<string, unknown>;
        return t.id === traceId || meta.runId === runId || meta.run_id === runId;
      });
      expect(matching.length, 'exactly one Langfuse trace for the run').toBe(1);

      const meta = (trace!.metadata ?? {}) as Record<string, unknown>;
      const serviceName =
        meta.serviceName ?? meta.service_name ?? payload.serviceName ?? trace!.name;
      expect(String(serviceName)).toContain(SERVICE_NAME);
    },
    180_000
  );

  itLive(
    'AC-2/TC-2: model-generation child span correlates to parent run (role metadata)',
    async () => {
      const goal = 'Observability child span fixture — one real model call';
      const cli = await runHolo(['mission', 'run', 'research', '--goal', goal, '--json']);
      writeEvidence('ac2-cli.json', {
        exitCode: cli.exitCode,
        stdout: cli.stdout,
        stderr: cli.stderr,
      });
      expect(cli.exitCode, `cli stderr: ${cli.stderr}\nstdout: ${cli.stdout}`).toBe(0);

      const payload = parseJsonStdout(cli.stdout);
      const traceId = String(payload.traceId ?? '');
      expect(traceId.length).toBeGreaterThan(0);

      const trace = await waitForTrace(traceId);
      writeEvidence('ac2-langfuse-trace.json', trace);
      expect(trace).not.toBeNull();

      const observations = (trace!.observations as Array<Record<string, unknown>> | undefined) ?? [];
      // Also fetch observations endpoint if embedded list is empty.
      let children = observations;
      if (children.length === 0) {
        const obs = await langfuseGet(`/api/public/observations?traceId=${traceId}&limit=100`);
        writeEvidence('ac2-langfuse-observations.json', obs.body);
        children =
          (obs.body as { data?: Array<Record<string, unknown>> }).data ??
          (Array.isArray(obs.body) ? (obs.body as Array<Record<string, unknown>>) : []);
      }

      expect(children.length, 'model-generation child spans: >=1').toBeGreaterThanOrEqual(1);

      const modelSpans = children.filter((c) => {
        const type = String(c.type ?? c.observationType ?? '').toLowerCase();
        const name = String(c.name ?? '').toLowerCase();
        return (
          type === 'generation' ||
          type === 'model_generation' ||
          name.includes('model') ||
          name.includes('generation') ||
          name.includes('agent')
        );
      });
      expect(modelSpans.length, 'at least one model-generation style child').toBeGreaterThanOrEqual(
        1
      );

      for (const span of modelSpans) {
        const parentTrace = String(span.traceId ?? span.trace_id ?? traceId);
        expect(parentTrace).toBe(traceId);
      }

      // Role metadata on root or child (divergent | convergent).
      const payloadMeta = (payload.metadata ?? {}) as Record<string, unknown>;
      const rootMeta = (trace!.metadata ?? {}) as Record<string, unknown>;
      const roleCandidates = [
        payload.role,
        payloadMeta.role,
        rootMeta.role,
        ...modelSpans.map((s) => (s.metadata as Record<string, unknown> | undefined)?.role),
        ...modelSpans.map((s) => s.model),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .filter(Boolean);
      const hasRole = roleCandidates.some(
        (r) => r.includes('divergent') || r.includes('convergent')
      );
      expect(hasRole, `role metadata missing; saw: ${roleCandidates.join(',')}`).toBe(true);
    },
    180_000
  );

  itLive(
    "AC-3/TC-3: export failure when Langfuse endpoint is unavailable (LANGFUSE_EXPORT_FAILED)",
    async () => {
      // Point at a dead local port — Postgres + fleet remain available.
      const deadUrl = 'http://127.0.0.1:3999';
      const cli = await runHolo(
        ['mission', 'run', 'research', '--goal', 'Observability trace failure fixture', '--json'],
        {
          LANGFUSE_BASE_URL: deadUrl,
        }
      );
      writeEvidence('ac3-export-failure.json', {
        exitCode: cli.exitCode,
        stdout: cli.stdout,
        stderr: cli.stderr,
      });

      expect(cli.exitCode, 'process exit must be 1 on export failure').toBe(1);

      const combined = `${cli.stdout}\n${cli.stderr}`;
      expect(combined).toMatch(/LANGFUSE_EXPORT_FAILED/);

      // Prefer structured JSON when present.
      let payload: Record<string, unknown> | null = null;
      try {
        payload = parseJsonStdout(cli.stdout);
      } catch {
        payload = null;
      }
      if (payload) {
        writeEvidence('ac3-payload.json', payload);
        expect(payload.langfuseExportOk === false || payload.ok === false).toBe(true);
        expect(String(payload.errorCode ?? payload.code ?? '')).toMatch(/LANGFUSE_EXPORT_FAILED/);
        // Must not claim a green Langfuse result.
        expect(payload.langfuseExportOk).not.toBe(true);
      }
    },
    180_000
  );

  itLive(
    'AC-4/TC-4: redaction — raw secret sentinel and synthetic PII absent from exported trace',
    async () => {
      const goal = `Redaction fixture secret=${SECRET_SENTINEL} email=${PII_EMAIL}`;
      const cli = await runHolo(['mission', 'run', 'research', '--goal', goal, '--json']);
      writeEvidence('ac4-cli.json', {
        exitCode: cli.exitCode,
        stdout: cli.stdout,
        stderr: cli.stderr,
      });
      expect(cli.exitCode, `cli stderr: ${cli.stderr}\nstdout: ${cli.stdout}`).toBe(0);

      const payload = parseJsonStdout(cli.stdout);
      const traceId = String(payload.traceId ?? '');
      expect(traceId.length).toBeGreaterThan(0);

      const trace = await waitForTrace(traceId);
      expect(trace).not.toBeNull();

      // Pull observations too — secrets often land in generation I/O.
      const obs = await langfuseGet(`/api/public/observations?traceId=${traceId}&limit=100`);
      const bundle = { trace, observations: obs.body };
      writeEvidence('ac4-langfuse-payload.json', bundle);

      const serialized = JSON.stringify(bundle);
      expect(serialized.length, 'empty trace payload').toBeGreaterThan(10);
      expect(serialized.includes(SECRET_SENTINEL), 'raw secret must be redacted').toBe(false);
      expect(serialized.includes(PII_EMAIL), 'raw PII email must be redacted').toBe(false);
      expect(serialized.includes('[REDACTED]'), 'must observe redacted field token').toBe(true);
    },
    180_000
  );
});
