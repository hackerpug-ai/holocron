/**
 * OBS remediation — phase A focused tests.
 *
 * Contract under test (A1–A5):
 *   A1  compose wires mastra → otel-collector → Langfuse via env + file-mounted
 *       secret WITHOUT changing load-bearing deployment defaults (service set,
 *       pinned image digests, host port bindings).
 *   A2  A successful span POST followed by an unreachable collector metrics
 *       endpoint must NOT mark the export failed (metrics only feed queue
 *       scraping in readExportHealth()).
 *   A3  Export failures log structured warnings (machine-parseable JSON
 *       events) instead of bare console noise.
 *   A4  Rendered compose output stays secret-free for LANGFUSE_SECRET_KEY
 *       (file-mounted secret, never interpolated into service environment).
 *   A5  Collector queue storage is bounded by a 168h TTL.
 *
 * The unit seams (A2/A3) stub global fetch — they need no infrastructure and
 * run in every lane. Compose/docker assertions are static file parses plus a
 * PLATFORM_IT-gated `docker compose config` render.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { REQUIRED_OBSERVABILITY_SECRET_NAMES } from '../../src/deploy/production-deploy.ts';
import {
  bufferMissionModelCall,
  HolocronOtelBridge,
} from '../../src/observability/langfuse-exporter.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const COMPOSE_PATH = resolve(REPO_ROOT, 'services/platform/deploy/compose/compose.yaml');
const OTEL_CONFIG_PATH = resolve(
  REPO_ROOT,
  'services/platform/deploy/otel/otel-collector-config.yaml'
);
const METRICS_URL = 'http://127.0.0.1:59999/metrics';

function compose(): Record<string, unknown> {
  return parseYaml(readFileSync(COMPOSE_PATH, 'utf8')) as Record<string, unknown>;
}

function otelConfig(): Record<string, unknown> {
  return parseYaml(readFileSync(OTEL_CONFIG_PATH, 'utf8')) as Record<string, unknown>;
}

function mastraService(): Record<string, unknown> {
  const services = compose().services as Record<string, Record<string, unknown>>;
  const mastra = services.mastra;
  if (!mastra) throw new Error('compose fixture is missing the mastra service');
  return mastra;
}

const EXPECTED_SERVICES = [
  'postgres',
  'scheduler',
  'zero-cache',
  'mastra',
  'edge',
  'langfuse-web',
  'langfuse-worker',
  'langfuse-postgres',
  'langfuse-clickhouse',
  'langfuse-redis',
  'langfuse-minio',
  'otel-collector',
];

const OTEL_COLLECTOR_IMAGE =
  'docker.io/otel/opentelemetry-collector-contrib@sha256:13b685dc9f68fbbb0fce06d3be84e9d70ba5b90085d79dcbd4c4c0d909ee2d6e';

/** Minimal local OTLP endpoint: accepts span POSTs on /v1/traces. */
async function startStubCollector(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    if ((req.url ?? '').includes('/v1/traces')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('stub collector failed to bind');
  return { server, url: `http://127.0.0.1:${address.port}/v1/traces` };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((r) => server.close(() => r()));
}

describe('OBS remediation phase A — compose collector wiring (static contract)', () => {
  it('wires mastra to the collector via static container-network URLs', () => {
    const environment = mastraService().environment as Record<string, string>;
    expect(environment.OTEL_COLLECTOR_URL).toBe('http://otel-collector:4318/v1/traces');
    expect(environment.OTEL_COLLECTOR_METRICS_URL).toBe('http://otel-collector:8888/metrics');
    expect(environment.LANGFUSE_BASE_URL).toBe('http://langfuse-web:3000');
    expect(environment.LANGFUSE_PUBLIC_KEY).toBe(
      '${LANGFUSE_PUBLIC_KEY:?LANGFUSE_PUBLIC_KEY is required}'
    );
  });

  it('keeps LANGFUSE_SECRET_KEY out of the environment and file-mounts it instead', () => {
    const service = mastraService();
    const environment = service.environment as Record<string, string>;
    expect(Object.keys(environment)).not.toContain('LANGFUSE_SECRET_KEY');

    const command = (
      Array.isArray(service.command) ? service.command.join(' ') : String(service.command)
    ) as string;
    expect(command).toContain('cat /run/secrets/langfuse_secret_key');

    const secrets = service.secrets as Array<{ source: string; target: string }>;
    expect(
      secrets.some((s) => s.source === 'langfuse-secret-key' && s.target === 'langfuse_secret_key')
    ).toBe(true);

    const topLevel = compose().secrets as Record<string, { environment: string }>;
    expect(topLevel['langfuse-secret-key']?.environment).toBe('LANGFUSE_SECRET_KEY');
  });

  it('leaves load-bearing deployment defaults unchanged', () => {
    const services = compose().services as Record<string, Record<string, unknown>>;
    expect(Object.keys(services).sort()).toEqual(EXPECTED_SERVICES.slice().sort());

    expect(services['otel-collector']?.image).toBe(OTEL_COLLECTOR_IMAGE);
    expect(services.mastra?.image).toBe(
      '${HOLO_PLATFORM_IMAGE:?HOLO_PLATFORM_IMAGE must use @sha256:<64-hex>}'
    );

    // The collector publishes no host ports — it stays on the compose network.
    const collectorPorts = services['otel-collector']?.ports;
    expect(collectorPorts ?? []).toEqual([]);

    // The only host-published app port is the edge (127.0.0.1:44111).
    expect(services.edge?.ports).toEqual(['127.0.0.1:44111:44111']);
    expect(services.mastra?.ports ?? []).toEqual([]);
  });
});

describe('OBS remediation phase A — collector queue TTL + pipeline config', () => {
  it('bounds file-backed queue lifetime to 168h', () => {
    const config = otelConfig();
    const extensions = config.extensions as Record<string, Record<string, unknown>>;
    expect(extensions.file_storage?.ttl).toBe('168h');
    expect(extensions.file_storage?.directory).toBe('/var/lib/otelcol/queue');
  });

  it('keeps the traces pipeline intact (otlp → memory_limiter/batch → langfuse+debug)', () => {
    const config = otelConfig();
    const service = config.service as { pipelines: Record<string, Record<string, string[]>> };
    const traces = service.pipelines.traces;
    expect(traces.receivers).toEqual(['otlp']);
    expect(traces.processors).toEqual(['memory_limiter', 'batch']);
    expect(traces.exporters).toEqual(['otlphttp/langfuse', 'debug']);

    const exporters = config.exporters as Record<string, Record<string, unknown>>;
    const langfuse = exporters['otlphttp/langfuse'];
    expect(langfuse?.endpoint).toBe('${env:LANGFUSE_OTLP_ENDPOINT}');
    const headers = langfuse?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe('${env:LANGFUSE_AUTH_HEADER}');
  });
});

describe('OBS remediation phase A — flush false-failure + structured warnings (unit seams)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let stub: { server: Server; url: string };

  /** Collects console.warn JSON events by `event` name for structured-log assertions. */
  function warnEvents(): Map<string, Record<string, unknown>> {
    const events = new Map<string, Record<string, unknown>>();
    for (const call of warnSpy.mock.calls) {
      const raw = String(call[0] ?? '');
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (typeof parsed.event === 'string') events.set(parsed.event, parsed);
      } catch {
        // Non-JSON warning lines are not part of this contract.
      }
    }
    return events;
  }

  beforeEach(async () => {
    // Metrics probe hits a dead port — the probe is informational only (A2).
    vi.stubEnv('OTEL_COLLECTOR_METRICS_URL', METRICS_URL);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stub = await startStubCollector();
  });

  afterEach(async () => {
    await closeServer(stub.server);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('A2: a successful span POST survives a dead metrics endpoint without failing the export', async () => {
    const bridge = new HolocronOtelBridge({ collectorUrl: stub.url });

    bufferMissionModelCall(bridge, {
      traceId: 'a'.repeat(32),
      runId: 'run-phase-a2',
      endpoint: '/research/test',
      modelId: 'test-model',
      startTime: new Date(),
      endTime: new Date(),
    });

    await bridge.flush();

    expect(bridge.exportFailed).toBe(false);
    expect(bridge.lastError).toBeNull();

    const events = warnEvents();
    const probe = events.get('langfuse_export_metrics_probe_failed');
    expect(probe, 'metrics probe failure must log a structured warning').toBeDefined();
    expect(probe?.code).toBe('METRICS_PROBE_FAILED');
    expect(probe?.metricsUrl).toBe(METRICS_URL);
    // It must NOT be reported as a Langfuse failure.
    expect(probe?.code).not.toBe('LANGFUSE_UNREACHABLE');
    expect(events.has('langfuse_export_v2_unreachable')).toBe(false);
    expect(events.has('langfuse_export_failed')).toBe(false);
  }, 30_000);

  it('A3: Langfuse v2 unreachable still fails the export but logs a structured warning', async () => {
    // Langfuse identity points at a dead port: every v2 confirmation attempt
    // fails fast, so the bounded retry loop exhausts in ~6s.
    const bridge = new HolocronOtelBridge({
      collectorUrl: stub.url,
      publicKey: 'pk-phase-a',
      secretKey: 'sk-phase-a',
      baseUrl: 'http://127.0.0.1:59998',
    });

    bufferMissionModelCall(bridge, {
      traceId: 'b'.repeat(32),
      runId: 'run-phase-a3',
      endpoint: '/research/test',
      modelId: 'test-model',
      startTime: new Date(),
      endTime: new Date(),
    });

    await bridge.flush();

    expect(bridge.exportFailed).toBe(true);

    const events = warnEvents();
    const unreachable = events.get('langfuse_export_v2_unreachable');
    expect(unreachable, 'v2 unreachable must log a structured warning').toBeDefined();
    expect(unreachable?.code).toBe('LANGFUSE_UNREACHABLE');
    expect(unreachable?.serviceName).toBe('holocron-platform');
  }, 30_000);
});

(PLATFORM_IT ? describe : describe.skip)(
  'OBS remediation phase A — secret-free compose render (docker)',
  () => {
    it('renders mastra observability wiring without interpolating the secret key', () => {
      const sentinel = 'OBS-A-SECRET-SENTINEL-DO-NOT-LEAK';
      const baseEnv: NodeJS.ProcessEnv = {
        HOLO_PLATFORM_IMAGE:
          'registry.example/holocron-platform@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        FLEET_URL: 'http://host.docker.internal:4545',
        POSTGRES_DB: 'holocron',
        POSTGRES_USER: 'holocron',
        POSTGRES_PASSWORD: sentinel,
        DATABASE_URL: 'postgres://holocron@127.0.0.1:44112/holocron',
        MASTRA_API_KEY: sentinel,
        FLEET_KEY: sentinel,
        ZERO_ADMIN_PASSWORD: sentinel,
        LANGFUSE_POSTGRES_USER: 'langfuse',
        LANGFUSE_POSTGRES_DB: 'langfuse',
        LANGFUSE_CLICKHOUSE_DB: 'default',
        LANGFUSE_CLICKHOUSE_USER: 'clickhouse',
        LANGFUSE_CLICKHOUSE_MIGRATION_URL: 'clickhouse://langfuse-clickhouse:9000',
        LANGFUSE_CLICKHOUSE_URL: 'http://langfuse-clickhouse:8123',
        LANGFUSE_S3_BUCKET: 'langfuse',
        LANGFUSE_S3_ENDPOINT: 'http://langfuse-minio:9000',
        LANGFUSE_NEXTAUTH_URL: 'http://127.0.0.1:44111',
        LANGFUSE_OTLP_ENDPOINT: 'http://langfuse-web:3000/api/public/otel',
        LANGFUSE_INIT_ORG_ID: 'holocron-observability',
        LANGFUSE_INIT_ORG_NAME: 'Holocron',
        LANGFUSE_INIT_PROJECT_ID: 'holocron',
        LANGFUSE_INIT_PROJECT_NAME: 'Holocron',
        LANGFUSE_INIT_USER_EMAIL: 'ops@example.invalid',
        LANGFUSE_INIT_USER_NAME: 'ops',
      };
      for (const name of REQUIRED_OBSERVABILITY_SECRET_NAMES) {
        baseEnv[name] = sentinel;
      }

      const rendered = spawnSync(
        'docker',
        ['compose', '-f', COMPOSE_PATH, 'config', '--format', 'json'],
        { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, ...baseEnv }, timeout: 60_000 }
      );
      expect(
        rendered.status,
        `docker compose config failed: ${rendered.stderr.trim() || rendered.stdout.trim()}`
      ).toBe(0);

      const parsed = JSON.parse(rendered.stdout) as {
        services: Record<string, Record<string, unknown>>;
      };
      const serviceNames = Object.keys(parsed.services).sort();
      expect(serviceNames).toEqual(EXPECTED_SERVICES.slice().sort());

      const mastra = parsed.services.mastra;
      const environment = mastra.environment as Record<string, string>;
      expect(environment.OTEL_COLLECTOR_URL).toBe('http://otel-collector:4318/v1/traces');
      expect(environment.OTEL_COLLECTOR_METRICS_URL).toBe('http://otel-collector:8888/metrics');
      expect(environment.LANGFUSE_BASE_URL).toBe('http://langfuse-web:3000');
      // The secret key must never be interpolated into the rendered environment.
      expect(Object.keys(environment)).not.toContain('LANGFUSE_SECRET_KEY');

      const secrets = mastra.secrets as Array<{ source: string }>;
      expect(secrets.some((s) => s.source === 'langfuse-secret-key')).toBe(true);
    }, 120_000);
  }
);
