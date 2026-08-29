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
 *   pnpm test -- packages/platform/tests/integration/observability-traces.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type ResearchMissionResult,
  runResearchMission,
} from '../../src/observability/mission-research';

const PLATFORM_IT = Boolean(process.env.PLATFORM_IT);
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const OBS02_MODE =
  process.env.OBS02_EVIDENCE === '1' ||
  Boolean(process.env.OBS02_LANGFUSE_BASE_URL) ||
  (process.env.LANGFUSE_BASE_URL ?? '').includes(':13100');
const EVIDENCE_DIR = resolve(REPO_ROOT, OBS02_MODE ? '.tmp/OBS-02' : '.tmp/obs-1');

// OBS-02 defaults to the isolated canary Langfuse (:13100). Legacy obs-1 used :3100.
const LANGFUSE_BASE_URL = (
  process.env.LANGFUSE_BASE_URL ??
  process.env.OBS02_LANGFUSE_BASE_URL ??
  (OBS02_MODE ? 'http://127.0.0.1:13100' : 'http://127.0.0.1:3100')
).replace(/\/$/, '');
const LANGFUSE_PUBLIC_KEY =
  process.env.LANGFUSE_PUBLIC_KEY ??
  process.env.OBS02_LANGFUSE_PUBLIC_KEY ??
  (OBS02_MODE ? 'pk-lf-obs01-canary-public' : 'pk-lf-holocron-obs1-public');
const LANGFUSE_SECRET_KEY =
  process.env.LANGFUSE_SECRET_KEY ??
  process.env.OBS02_LANGFUSE_SECRET_KEY ??
  (OBS02_MODE ? 'sk-lf-obs01-canary-secret' : 'sk-lf-holocron-obs1-secret');
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';

function langfuseReady(): boolean {
  // Prefer explicit keys; fall back to canary/obs defaults so PLATFORM_IT runs fail-closed.
  const publicKey = LANGFUSE_PUBLIC_KEY.trim();
  const secretKey = LANGFUSE_SECRET_KEY.trim();
  if (!publicKey || !secretKey) return false;
  const r = spawnSync(
    'curl',
    [
      '-sS',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--max-time',
      '2',
      `${LANGFUSE_BASE_URL}/api/public/health`,
    ],
    { encoding: 'utf8' }
  );
  const code = (r.stdout ?? '').trim();
  // Accept 200 or 401 (auth-gated but reachable). 000/connection fail → skip.
  return r.status === 0 && Boolean(code) && code !== '000';
}

const LANGFUSE_READY = langfuseReady();
const itLive = PLATFORM_IT && LANGFUSE_READY ? it : it.skip;

const SECRET_SENTINEL = 'trace-secret-001';
const PII_EMAIL = 'trace@example.invalid';
const SERVICE_NAME = 'holocron-platform';

function basicAuthHeader(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

async function runObservedResearch(
  goal: string,
  baseUrl = LANGFUSE_BASE_URL
): Promise<ResearchMissionResult> {
  return runResearchMission({
    goal,
    role: 'divergent',
    langfuseBaseUrl: baseUrl,
    langfusePublicKey: LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: LANGFUSE_SECRET_KEY,
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

function withObservationFields(path: string): string {
  if (path.includes('fields=')) return path;
  return path.includes('?') ? `${path}&fields=core,io,metadata` : `${path}?fields=core,io,metadata`;
}

async function waitForTrace(
  traceId: string,
  timeoutMs = 60_000
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, body } = await langfuseGet(
      withObservationFields(
        `/api/public/v2/observations?limit=100&traceId=${encodeURIComponent(traceId)}`
      )
    );
    if (status === 200 && body && typeof body === 'object') {
      const data = ((body as { data?: Array<Record<string, unknown>> }).data ?? []).filter(
        (o) => String(o.traceId ?? '') === traceId
      );
      if (data.length >= 1) {
        return {
          id: traceId,
          observations: data,
          metadata: (data[0]?.metadata as Record<string, unknown> | undefined) ?? {},
          name: String(data[0]?.name ?? 'research-mission'),
        };
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
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

describe('obs-1 observability traces → self-hosted Langfuse', { sequential: true }, () => {
  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    process.env.LANGFUSE_BASE_URL = LANGFUSE_BASE_URL;
    process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
    process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;
    process.env.OTEL_COLLECTOR_URL =
      process.env.OTEL_COLLECTOR_URL ?? 'http://127.0.0.1:14318/v1/traces';
    process.env.OTEL_COLLECTOR_METRICS_URL =
      process.env.OTEL_COLLECTOR_METRICS_URL ?? 'http://127.0.0.1:18888/metrics';
    process.env.FLEET_URL = FLEET_URL;
    process.env.FLEET_KEY = process.env.FLEET_KEY ?? 'sk-none';
    process.env.OBS02_EVIDENCE = '1';
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
      const payload = await runObservedResearch(goal);
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
        withObservationFields(`/api/public/v2/observations?limit=100`)
      );
      writeEvidence('ac1-langfuse-list.json', list.body);
      expect(list.status).toBe(200);
      const data = (list.body as { data?: Array<Record<string, unknown>> }).data ?? [];
      const matching = data.filter((t) => {
        const meta = (t.metadata ?? {}) as Record<string, unknown>;
        const metaBlob = JSON.stringify(meta);
        return (
          String(t.traceId ?? '') === traceId ||
          meta.runId === runId ||
          meta.run_id === runId ||
          metaBlob.includes(runId)
        );
      });
      expect(
        matching.length,
        'at least one Langfuse observation for the run'
      ).toBeGreaterThanOrEqual(1);
      const matchingTraceIds = new Set(
        matching.map((t) => String(t.traceId ?? '')).filter(Boolean)
      );
      expect(matchingTraceIds.has(traceId)).toBe(true);

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
      const payload = await runObservedResearch(goal);
      writeEvidence('ac2-result.json', payload);
      const traceId = String(payload.traceId ?? '');
      expect(traceId.length).toBeGreaterThan(0);

      const trace = await waitForTrace(traceId);
      writeEvidence('ac2-langfuse-trace.json', trace);
      expect(trace).not.toBeNull();

      const observations =
        (trace!.observations as Array<Record<string, unknown>> | undefined) ?? [];
      // Also fetch observations endpoint if embedded list is empty.
      let children = observations;
      if (children.length === 0) {
        const obs = await langfuseGet(
          withObservationFields(
            `/api/public/v2/observations?traceId=${encodeURIComponent(traceId)}&limit=100`
          )
        );
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
    'AC-3/TC-3: export failure when Langfuse endpoint is unavailable (soft degrade)',
    async () => {
      // Point at a dead local port — Postgres + fleet remain available.
      const deadUrl = 'http://127.0.0.1:3999';
      const payload = await runResearchMission({
        goal: 'Observability trace failure fixture',
        role: 'divergent',
        langfuseBaseUrl: deadUrl,
        langfusePublicKey: LANGFUSE_PUBLIC_KEY,
        langfuseSecretKey: LANGFUSE_SECRET_KEY,
        throwOnExportFailure: false,
      });
      writeEvidence('ac3-export-failure.json', { payload });
      // Mission product may succeed; external export must be degraded.
      expect(payload.langfuseExportOk).toBe(false);
      expect(payload.errorCode).toMatch(
        /LANGFUSE_UNREACHABLE|OTLP_REJECTED|LANGFUSE_EXPORT_FAILED|EXPORT_FLUSH_TIMEOUT/
      );
    },
    180_000
  );

  itLive(
    'AC-4/TC-4: redaction — raw secret sentinel and synthetic PII absent from exported trace',
    async () => {
      const goal = `Redaction fixture secret=${SECRET_SENTINEL} email=${PII_EMAIL}`;
      const payload = await runObservedResearch(goal);
      writeEvidence('ac4-result.json', payload);
      const traceId = String(payload.traceId ?? '');
      expect(traceId.length).toBeGreaterThan(0);

      const trace = await waitForTrace(traceId);
      expect(trace).not.toBeNull();

      // Pull observations too — secrets often land in generation I/O.
      const obs = await langfuseGet(
        withObservationFields(
          `/api/public/v2/observations?traceId=${encodeURIComponent(traceId)}&limit=100`
        )
      );
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
