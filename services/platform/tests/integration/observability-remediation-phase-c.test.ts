/**
 * OBS remediation — phase C focused tests (C1/C2/C3).
 *
 *   C1  GET /observability/export-health serves the live snapshot (queue
 *       depth/capacity, external state, last success/failure) — 200 when the
 *       pipeline answers, 503 only when everything is unreachable.
 *   C2  The periodic end-to-end probe updates the shared export-health state
 *       (success on reachable Langfuse v2, LANGFUSE_UNREACHABLE otherwise).
 *   C3  compose orders mastra after otel-collector (service_started) so spans
 *       have a collector from process start.
 *
 * Network seams stub global fetch — deterministic, no live collector. The
 * compose assertion is a static YAML parse (docker render is covered by the
 * phase-a PLATFORM_IT lane).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { createHonoApp } from '../../src/http/hono-app.ts';
import { DEFAULT_KEYS } from '../../src/http/middleware/scoped-key.ts';
import {
  ExportFailureCode,
  probeExportPipeline,
  readExportHealth,
  startExportHealthProbe,
  stopExportHealthProbe,
} from '../../src/observability/export-health.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.yaml');

const METRICS_URL = 'http://127.0.0.1:18888/metrics';
const LANGFUSE_BASE = 'http://langfuse-web:3000';
const PROM_TEXT = [
  '# HELP otelcol_exporter_queue_size Queue size',
  '# TYPE otelcol_exporter_queue_size gauge',
  'otelcol_exporter_queue_size{exporter="otlphttp/langfuse"} 3',
  '# HELP otelcol_exporter_queue_capacity Queue capacity',
  '# TYPE otelcol_exporter_queue_capacity gauge',
  'otelcol_exporter_queue_capacity{exporter="otlphttp/langfuse"} 1000',
  '',
].join('\n');

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(stub: FetchStub): void {
  vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) =>
    stub(typeof input === 'string' ? input : input.toString(), init)
  );
}

/** Everything reachable: collector metrics + langfuse health + v2 observations. */
function allReachableFetch(): FetchStub {
  return async (url) => {
    if (url.startsWith(METRICS_URL)) {
      return new Response(PROM_TEXT, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.startsWith(`${LANGFUSE_BASE}/api/public/health`)) {
      return jsonResponse(200, {});
    }
    if (url.startsWith(`${LANGFUSE_BASE}/api/public/v2/observations`)) {
      return jsonResponse(200, { data: [] });
    }
    throw new Error(`unexpected fetch in stub: ${url}`);
  };
}

describe('OBS remediation C1 — GET /observability/export-health', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('serves the live snapshot with queue depth/capacity and externalState ready', async () => {
    vi.stubEnv('OTEL_COLLECTOR_METRICS_URL', METRICS_URL);
    vi.stubEnv('LANGFUSE_BASE_URL', LANGFUSE_BASE);
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    stubFetch(allReachableFetch());

    const app = createHonoApp({ keys: { ...DEFAULT_KEYS } });
    const res = await app.request('/observability/export-health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.externalState).toBe('ready');
    expect(body.queueDepth).toBe(3);
    expect(body.queueCapacity).toBe(1000);
    expect(body.queueMetricSource).toBe('otel-collector');
    expect(typeof body.langfuseReachable).toBe('boolean');
    expect(body.collectorMetricsReachable).toBe(true);
  });

  it('returns 503 only when both collector metrics and Langfuse are unreachable', async () => {
    vi.stubEnv('OTEL_COLLECTOR_METRICS_URL', METRICS_URL);
    vi.stubEnv('LANGFUSE_BASE_URL', LANGFUSE_BASE);
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    stubFetch(async () => new Response('not found', { status: 404 }));

    const app = createHonoApp({ keys: { ...DEFAULT_KEYS } });
    const res = await app.request('/observability/export-health');
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.externalState).toBe('unavailable');
  });

  it('needs no scoped key (open like /health on the tailnet surface)', async () => {
    vi.stubEnv('OTEL_COLLECTOR_METRICS_URL', METRICS_URL);
    // No LANGFUSE_BASE_URL → langfuse probe null; metrics reachable keeps 200.
    stubFetch(async (url) => {
      if (url.startsWith(METRICS_URL)) {
        return new Response(PROM_TEXT, { status: 200 });
      }
      throw new Error(`unexpected fetch in stub: ${url}`);
    });

    const app = createHonoApp({ keys: { ...DEFAULT_KEYS } });
    const res = await app.request('/observability/export-health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.langfuseReachable).toBeNull();
  });
});

describe('OBS remediation C2 — periodic end-to-end probe updates state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    stopExportHealthProbe();
  });

  it('records success when Langfuse v2 answers', async () => {
    vi.stubEnv('LANGFUSE_BASE_URL', LANGFUSE_BASE);
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    stubFetch(allReachableFetch());

    const verdict = await probeExportPipeline();
    expect(verdict).toBe('ready');
    const snapshot = await readExportHealth();
    expect(snapshot.lastSuccessAt).not.toBeNull();
  });

  it('records LANGFUSE_UNREACHABLE when the pipeline is down', async () => {
    vi.stubEnv('LANGFUSE_BASE_URL', LANGFUSE_BASE);
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-test');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-test');
    stubFetch(async () => new Response('down', { status: 503 }));

    const verdict = await probeExportPipeline();
    expect(verdict).toBe('degraded');
    const snapshot = await readExportHealth();
    expect(snapshot.lastFailureCode).toBe(ExportFailureCode.LANGFUSE_UNREACHABLE);
    expect(snapshot.terminalFailureCodes).toContain(ExportFailureCode.LANGFUSE_UNREACHABLE);
  });

  it('start/stop are lifecycle-safe: disabled at <=0, idempotent stop', () => {
    expect(() => {
      startExportHealthProbe(0); // disabled — no timer created
      startExportHealthProbe(-1);
      stopExportHealthProbe();
      stopExportHealthProbe();
    }).not.toThrow();
  });
});

describe('OBS remediation C3 — compose orders mastra after the collector', () => {
  it('mastra depends_on otel-collector (service_started) plus postgres healthy', () => {
    const doc = parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as {
      services: Record<string, { depends_on?: Record<string, { condition: string }> }>;
    };
    const mastra = doc.services.mastra;
    expect(mastra).toBeDefined();
    expect(mastra?.depends_on?.postgres?.condition).toBe('service_healthy');
    expect(mastra?.depends_on?.['otel-collector']?.condition).toBe('service_started');
  });
});
