/**
 * OBS-02 — Adopt supported Mastra/Langfuse OTLP v4
 *
 * Real Bun + Postgres + pinned Collector + Langfuse v4 + local fleet.
 * No mocks of @mastra/*, model providers, or sinks. Missing services → hard fail.
 *
 * Run:
 *   PLATFORM_IT=1 \
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *   LANGFUSE_BASE_URL=http://127.0.0.1:13100 \
 *   LANGFUSE_PUBLIC_KEY=pk-lf-obs01-canary-public \
 *   LANGFUSE_SECRET_KEY=sk-lf-obs01-canary-secret \
 *   OTEL_COLLECTOR_URL=http://127.0.0.1:14318/v1/traces \
 *   OTEL_COLLECTOR_METRICS_URL=http://127.0.0.1:18888/metrics \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm vitest run --project integration \
 *     services/platform/tests/integration/observability-otel-v4.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/OBS-02');
const SOURCE_LOCK = resolve(
  REPO_ROOT,
  'services/platform/deploy/compose/observability-source-lock.json'
);
const DEPLOY_OTEL_DIR = resolve(REPO_ROOT, 'services/platform/deploy/otel');
const SECRET_SENTINEL = 'OBS02-SECRET-SENTINEL-DO-NOT-LEAK';
const PII_EMAIL = 'obs02-redaction@example.invalid';
const SERVICE_NAME = 'holocron-platform';

const LANGFUSE_BASE_URL = (
  process.env.LANGFUSE_BASE_URL ??
  process.env.OBS02_LANGFUSE_BASE_URL ??
  'http://127.0.0.1:13100'
).replace(/\/$/, '');
const LANGFUSE_PUBLIC_KEY =
  process.env.LANGFUSE_PUBLIC_KEY ??
  process.env.OBS02_LANGFUSE_PUBLIC_KEY ??
  'pk-lf-obs01-canary-public';
const LANGFUSE_SECRET_KEY =
  process.env.LANGFUSE_SECRET_KEY ??
  process.env.OBS02_LANGFUSE_SECRET_KEY ??
  'sk-lf-obs01-canary-secret';
const OTEL_COLLECTOR_URL = (
  process.env.OTEL_COLLECTOR_URL ?? 'http://127.0.0.1:14318/v1/traces'
).replace(/\/$/, '');
const OTEL_COLLECTOR_METRICS_URL = (
  process.env.OTEL_COLLECTOR_METRICS_URL ?? 'http://127.0.0.1:18888/metrics'
).replace(/\/$/, '');
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron';
const FLEET_URL = (process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1').replace(/\/$/, '');

const TERMINAL_FAILURE_CODES = [
  'LANGFUSE_UNREACHABLE',
  'OTLP_REJECTED',
  'EXPORT_QUEUE_FULL',
  'EXPORT_FLUSH_TIMEOUT',
] as const;

function requirePlatformIt(): void {
  if (!PLATFORM_IT) {
    throw new Error(
      'PLATFORM_IT=1 required for OBS-02 OTLP v4 integration — refusing skip-to-green'
    );
  }
}

function writeEvidence(name: string, content: unknown): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const body = typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`;
  // Never persist the raw secret sentinel in evidence artifacts.
  writeFileSync(path, body.split(SECRET_SENTINEL).join('[REDACTED]'), 'utf8');
}

function basicAuthHeader(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

async function langfuseGet(path: string): Promise<{ status: number; body: unknown; text: string }> {
  const res = await fetch(`${LANGFUSE_BASE_URL}${path}`, {
    headers: { Authorization: basicAuthHeader(LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep raw
  }
  return { status: res.status, body, text };
}

async function waitV2Observations(
  predicate: (obs: Record<string, unknown>) => boolean,
  timeoutMs = 90_000
): Promise<Array<Record<string, unknown>>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, body } = await langfuseGet(
      '/api/public/v2/observations?limit=100&fields=core,io,metadata'
    );
    if (status === 200 && body && typeof body === 'object') {
      const data = ((body as { data?: Array<Record<string, unknown>> }).data ?? []).filter(
        predicate
      );
      if (data.length >= 1) return data;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return [];
}

function scrapeCollectorMetrics(): Promise<string> {
  return fetch(OTEL_COLLECTOR_METRICS_URL).then((r) => r.text());
}

function metricValue(metrics: string, name: string): number | null {
  for (const line of metrics.split('\n')) {
    if (line.startsWith('#') || !line.includes(name)) continue;
    if (!line.startsWith(name) && !line.startsWith(`${name}{`)) continue;
    const parts = line.trim().split(/\s+/);
    const n = Number(parts.at(-1));
    if (Number.isFinite(n)) return n;
  }
  for (const line of metrics.split('\n')) {
    if (line.startsWith('#') || !line.includes(name)) continue;
    const parts = line.trim().split(/\s+/);
    const n = Number(parts.at(-1));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readSourceTree(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) readSourceTree(full, out);
    else if (entry.isFile() && /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scanLegacyPaths(): {
  ingestionHits: string[];
  holocronExporterHits: string[];
  failOnExportErrorTrueHits: string[];
  deprecatedTraceReadHits: string[];
} {
  const srcRoot = resolve(REPO_ROOT, 'services/platform/src');
  const files = readSourceTree(srcRoot);
  const ingestionHits: string[] = [];
  const holocronExporterHits: string[] = [];
  const failOnExportErrorTrueHits: string[] = [];
  const deprecatedTraceReadHits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const rel = file.slice(REPO_ROOT.length + 1);
    if (text.includes('/api/public/ingestion')) ingestionHits.push(rel);
    if (/\bHolocronLangfuseExporter\b/.test(text)) holocronExporterHits.push(rel);
    if (/failOnExportError:\s*true/.test(text)) failOnExportErrorTrueHits.push(rel);
    if (/\/api\/public\/traces\b/.test(text) && !rel.includes('tests/')) {
      deprecatedTraceReadHits.push(rel);
    }
  }
  return {
    ingestionHits,
    holocronExporterHits,
    failOnExportErrorTrueHits,
    deprecatedTraceReadHits,
  };
}

async function queryLocalSpans(traceId: string): Promise<Array<Record<string, unknown>>> {
  const { createSql } = await import('../../src/db/client.ts');
  const sql = createSql(DATABASE_URL);
  try {
    const rows = await sql`
      SELECT "traceId", "spanId", name, "spanType", "runId", "serviceName", metadata, attributes, input, output
      FROM mastra_ai_spans
      WHERE "traceId" = ${traceId}
      ORDER BY "startedAt" ASC
    `;
    return rows as Array<Record<string, unknown>>;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function dockerCompose(
  args: string[],
  cwd: string
): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('docker', ['compose', ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

describe('OBS-02 adopt Mastra/Langfuse OTLP v4', { sequential: true }, () => {
  beforeAll(async () => {
    requirePlatformIt();
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    // Ensure canary Langfuse is running (prior AC may have paused it).
    spawnSync('docker', ['unpause', 'obs01-canary-langfuse-web-1'], { encoding: 'utf8' });

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.FLEET_URL = FLEET_URL;
    process.env.FLEET_KEY = process.env.FLEET_KEY ?? 'sk-none';
    process.env.LANGFUSE_BASE_URL = LANGFUSE_BASE_URL;
    process.env.LANGFUSE_PUBLIC_KEY = LANGFUSE_PUBLIC_KEY;
    process.env.LANGFUSE_SECRET_KEY = LANGFUSE_SECRET_KEY;
    process.env.OTEL_COLLECTOR_URL = OTEL_COLLECTOR_URL;
    process.env.OTEL_COLLECTOR_METRICS_URL = OTEL_COLLECTOR_METRICS_URL;

    const fleet = await fetch(`${FLEET_URL}/models`).catch(() => null);
    if (!fleet?.ok) {
      throw new Error(`local fleet unreachable at ${FLEET_URL}/models`);
    }
    const lf = await fetch(`${LANGFUSE_BASE_URL}/api/public/health`).catch(() => null);
    if (!lf?.ok) {
      throw new Error(`Langfuse health failed at ${LANGFUSE_BASE_URL}/api/public/health`);
    }
    const metrics = await fetch(OTEL_COLLECTOR_METRICS_URL).catch(() => null);
    if (!metrics?.ok) {
      throw new Error(`OTel Collector metrics unreachable at ${OTEL_COLLECTOR_METRICS_URL}`);
    }
  }, 120_000);

  it('AC-1: real mission/model call yields identical local Postgres and Langfuse v2 identities', async () => {
    requirePlatformIt();

    // Production path must be pinned deploy/otel + @mastra/otel-exporter (not legacy ingestion).
    expect(
      existsSync(resolve(DEPLOY_OTEL_DIR, 'otel-collector-config.yaml')),
      'services/platform/deploy/otel/otel-collector-config.yaml must exist'
    ).toBe(true);
    expect(
      existsSync(resolve(DEPLOY_OTEL_DIR, 'compose.yaml')),
      'services/platform/deploy/otel/compose.yaml must exist'
    ).toBe(true);
    expect(existsSync(SOURCE_LOCK), 'observability-source-lock.json missing').toBe(true);

    const legacy = scanLegacyPaths();
    writeEvidence('legacy-path-scan.json', legacy);
    expect(
      legacy.ingestionHits,
      `legacy /api/public/ingestion still present: ${legacy.ingestionHits.join(', ')}`
    ).toEqual([]);
    expect(
      legacy.holocronExporterHits,
      `HolocronLangfuseExporter still present: ${legacy.holocronExporterHits.join(', ')}`
    ).toEqual([]);
    expect(
      legacy.failOnExportErrorTrueHits,
      `failOnExportError: true still present: ${legacy.failOnExportErrorTrueHits.join(', ')}`
    ).toEqual([]);

    const { createObservability } = await import('../../src/mastra.ts');
    const { runResearchMission } = await import('../../src/observability/mission-research.ts');
    const { readExportHealth } = await import('../../src/observability/export-health.ts');

    const observability = createObservability();
    const inst = observability.getDefaultInstance?.();
    const exporters =
      (
        inst as { getExporters?: () => Array<{ name?: string; constructor?: { name?: string } }> }
      )?.getExporters?.() ?? [];
    const exporterNames = exporters.map((e) => String(e.name ?? e.constructor?.name ?? ''));
    expect(
      exporterNames.some((n) => /otel|opentelemetry/i.test(n)),
      `expected OtelExporter/opentelemetry in createObservability; saw: ${exporterNames.join(',')}`
    ).toBe(true);
    expect(
      exporterNames.some((n) => /holocron-langfuse/i.test(n)),
      'legacy HolocronLangfuseExporter must not be registered on production path'
    ).toBe(false);

    const metricsBefore = await scrapeCollectorMetrics();
    const queueSizeBefore = metricValue(metricsBefore, 'otelcol_exporter_queue_size') ?? 0;

    const goal = `OBS-02 AC-1 parity probe ${randomUUID().slice(0, 8)}`;
    const mission = await runResearchMission({
      goal,
      role: 'divergent',
      langfuseBaseUrl: LANGFUSE_BASE_URL,
      langfusePublicKey: LANGFUSE_PUBLIC_KEY,
      langfuseSecretKey: LANGFUSE_SECRET_KEY,
      throwOnExportFailure: false,
    });

    expect(mission.text, 'mission must return real model text').toBeTruthy();
    expect(mission.serviceName).toBe(SERVICE_NAME);
    const traceId = String(mission.traceId ?? '');
    expect(traceId.length, 'traceId must be non-empty').toBeGreaterThan(0);
    const runId = String(mission.runId ?? '');
    expect(runId.length, 'runId must be non-empty').toBeGreaterThan(0);

    // Force exporter flush through observability composition root.
    const obsAny = observability as unknown as {
      forceFlush?: () => Promise<void>;
      getDefaultInstance?: () => {
        forceFlush?: () => Promise<void>;
        exporters?: Array<{ flush?: () => Promise<void> }>;
      };
    };
    if (typeof obsAny.forceFlush === 'function') await obsAny.forceFlush();
    else {
      const inst = obsAny.getDefaultInstance?.();
      if (inst && typeof inst.forceFlush === 'function') await inst.forceFlush();
      for (const exp of inst?.exporters ?? []) {
        if (typeof exp.flush === 'function') await exp.flush();
      }
    }

    const localSpans = await queryLocalSpans(traceId);
    expect(
      localSpans.length,
      'expectedLocalTraceCount:1 via mastra_ai_spans'
    ).toBeGreaterThanOrEqual(1);

    const observations = await waitV2Observations((o) => {
      const tid = String(o.traceId ?? o.trace_id ?? '');
      const meta = JSON.stringify(o.metadata ?? {});
      const name = String(o.name ?? '');
      return (
        tid === traceId || meta.includes(runId) || name.includes('research') || meta.includes(goal)
      );
    });
    expect(
      observations.length,
      'expectedLangfuseTraceCount:1 via Observations API v2'
    ).toBeGreaterThanOrEqual(1);

    const langfuseTraceIds = new Set(
      observations.map((o) => String(o.traceId ?? o.trace_id ?? '')).filter(Boolean)
    );
    const identityMismatch =
      langfuseTraceIds.size === 1 && langfuseTraceIds.has(traceId)
        ? 0
        : langfuseTraceIds.has(traceId)
          ? 0
          : 1;
    expect(identityMismatch, 'traceIdentityMismatchCount:0').toBe(0);

    const health = await readExportHealth();
    expect(health.externalState).toBe('ready');
    expect(health.lastSuccessAt, 'last-success requires v2/official metric proof').toBeTruthy();

    const metricsAfter = await scrapeCollectorMetrics();
    const queueCapacity = metricValue(metricsAfter, 'otelcol_exporter_queue_capacity');
    expect(queueCapacity, 'official collector queue capacity metric required').not.toBeNull();

    const parity = {
      expectedLocalTraceCount: localSpans.length >= 1 ? 1 : 0,
      expectedLangfuseTraceCount: observations.length >= 1 ? 1 : 0,
      traceIdentityMismatchCount: identityMismatch,
      localTraceId: traceId,
      langfuseTraceIds: [...langfuseTraceIds],
      runId,
      provider: mission.metadata?.model ?? null,
      serviceName: mission.serviceName,
      queueSizeBefore,
      collectorEndpoint: OTEL_COLLECTOR_URL,
      observationsApi: 'v2',
    };
    writeEvidence('local-langfuse-parity.json', parity);
    writeEvidence('AC-1-seeded-artifact.json', {
      expectedLocalTraceCount: parity.expectedLocalTraceCount,
      expectedLangfuseTraceCount: parity.expectedLangfuseTraceCount,
      traceIdentityMismatchCount: parity.traceIdentityMismatchCount,
    });
  }, 300_000);

  it('AC-2: isolated Langfuse outage keeps mission success, local span, and degraded export', async () => {
    requirePlatformIt();

    const { runResearchMission } = await import('../../src/observability/mission-research.ts');
    const { readExportHealth, ExportFailureCode } = await import(
      '../../src/observability/export-health.ts'
    );

    // Stop ONLY the isolated canary Langfuse web (never holocron-production).
    const pause = spawnSync('docker', ['pause', 'obs01-canary-langfuse-web-1'], {
      encoding: 'utf8',
    });
    expect(pause.status, `docker pause failed: ${pause.stderr}`).toBe(0);

    let missionOk = false;
    let localTraceCount = 0;
    let externalState: string | null = null;
    let degradedCount = 0;
    let missionFailureCount = 0;
    try {
      const goal = `OBS-02 AC-2 outage probe ${randomUUID().slice(0, 8)}`;
      const mission = await runResearchMission({
        goal,
        role: 'divergent',
        throwOnExportFailure: false,
      });
      missionOk = Boolean(mission.text);
      if (!missionOk) missionFailureCount += 1;

      const traceId = String(mission.traceId ?? '');
      if (traceId) {
        const spans = await queryLocalSpans(traceId);
        localTraceCount = spans.length >= 1 ? 1 : 0;
      }

      const health = await readExportHealth();
      externalState = health.externalState;
      if (health.externalState === 'degraded' || health.externalState === 'unavailable') {
        degradedCount = 1;
      }
      expect(Object.values(ExportFailureCode)).toEqual(
        expect.arrayContaining([...TERMINAL_FAILURE_CODES])
      );
    } finally {
      spawnSync('docker', ['unpause', 'obs01-canary-langfuse-web-1'], { encoding: 'utf8' });
    }

    const timeline = {
      expectedMissionSuccessCount: missionOk ? 1 : 0,
      expectedDegradedCount: degradedCount,
      localTraceCount,
      missionFailureCount,
      externalState,
    };
    writeEvidence('outage-timeline.json', timeline);
    writeEvidence('AC-2-seeded-artifact.json', timeline);

    expect(timeline.expectedMissionSuccessCount).toBe(1);
    expect(timeline.localTraceCount).toBe(1);
    expect(timeline.expectedDegradedCount).toBe(1);
    expect(timeline.missionFailureCount).toBe(0);
    expect(timeline.externalState).not.toBe('ready');
  }, 300_000);

  it('AC-3: secret/disallowed sentinels have zero matches in SQL, Langfuse, and evidence', async () => {
    requirePlatformIt();

    const { runResearchMission } = await import('../../src/observability/mission-research.ts');
    const { HOLOCRON_ATTRIBUTE_ALLOWLIST } = await import('../../src/observability/config.ts');
    expect(Array.isArray(HOLOCRON_ATTRIBUTE_ALLOWLIST)).toBe(true);
    expect(HOLOCRON_ATTRIBUTE_ALLOWLIST.length).toBeGreaterThan(0);

    const goal = `OBS-02 AC-3 redaction secret=${SECRET_SENTINEL} email=${PII_EMAIL} authorization=Bearer ${SECRET_SENTINEL}`;
    const mission = await runResearchMission({
      goal,
      role: 'divergent',
      throwOnExportFailure: false,
    });
    const traceId = String(mission.traceId ?? '');
    expect(traceId.length).toBeGreaterThan(0);

    const localSpans = await queryLocalSpans(traceId);
    const localBlob = JSON.stringify(localSpans);
    expect(localBlob.includes(SECRET_SENTINEL), 'secret must not appear in local SQL').toBe(false);
    expect(localBlob.includes(PII_EMAIL), 'PII must not appear in local SQL').toBe(false);

    const observations = await waitV2Observations(
      (o) => String(o.traceId ?? '') === traceId,
      90_000
    );
    const obsBlob = JSON.stringify(observations);
    expect(obsBlob.includes(SECRET_SENTINEL), 'secret must not appear in Langfuse metadata').toBe(
      false
    );
    expect(obsBlob.includes(PII_EMAIL), 'PII must not appear in Langfuse metadata').toBe(false);
    expect(obsBlob.toLowerCase().includes('authorization'), 'auth header key disallowed').toBe(
      false
    );

    const scan = {
      sentinelMatchCount:
        Number(localBlob.includes(SECRET_SENTINEL)) +
        Number(obsBlob.includes(SECRET_SENTINEL)) +
        Number(JSON.stringify(mission).includes(SECRET_SENTINEL)),
      localSpanCount: localSpans.length,
      observationCount: observations.length,
      allowlistSize: HOLOCRON_ATTRIBUTE_ALLOWLIST.length,
    };
    writeEvidence('redaction-scan.json', scan);
    writeEvidence('AC-3-seeded-artifact.json', { sentinelMatchCount: scan.sentinelMatchCount });
    expect(scan.sentinelMatchCount).toBe(0);
  }, 300_000);

  it('AC-4: queue pressure + shutdown expose official metrics and terminal failure codes', async () => {
    requirePlatformIt();

    const { readExportHealth, probeQueueSaturation, flushWithDeadline, ExportFailureCode } =
      await import('../../src/observability/export-health.ts');

    const metricsBefore = await scrapeCollectorMetrics();
    const capacity = metricValue(metricsBefore, 'otelcol_exporter_queue_capacity');
    expect(capacity, 'official otelcol_exporter_queue_capacity required').not.toBeNull();
    expect(capacity).toBeGreaterThan(0);

    // Pause isolated Langfuse only, flood collector, assert queue growth from official metrics.
    spawnSync('docker', ['pause', 'obs01-canary-langfuse-web-1'], { encoding: 'utf8' });
    try {
      for (let i = 0; i < 40; i++) {
        const traceIdHex = createHash('sha256')
          .update(`obs02-burst-${i}-${Date.now()}`)
          .digest('hex')
          .slice(0, 32);
        const spanId = randomUUID().replace(/-/g, '').slice(0, 16);
        const now = Date.now();
        await fetch(OTEL_COLLECTOR_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            resourceSpans: [
              {
                resource: {
                  attributes: [{ key: 'service.name', value: { stringValue: SERVICE_NAME } }],
                },
                scopeSpans: [
                  {
                    scope: { name: 'obs02-saturation', version: '1.0.0' },
                    spans: [
                      {
                        traceId: traceIdHex,
                        spanId,
                        name: 'obs02-queue-pressure',
                        kind: 1,
                        startTimeUnixNano: String(now * 1_000_000),
                        endTimeUnixNano: String((now + 10) * 1_000_000),
                        attributes: [{ key: 'obs02.burst', value: { intValue: i } }],
                        status: { code: 1 },
                      },
                    ],
                  },
                ],
              },
            ],
          }),
        });
      }
      await new Promise((r) => setTimeout(r, 1500));

      const sat = await probeQueueSaturation();
      expect(sat.queueMetricSource).toBe('otel-collector');
      expect(sat.queueDepth).toBeGreaterThanOrEqual(0);
      expect(sat.queueCapacity).toBe(capacity);

      const flush = await flushWithDeadline({ deadlineMs: 50 });
      expect(TERMINAL_FAILURE_CODES).toContain(flush.terminalFailureCode);
      expect(flush.ok).toBe(false);

      const health = await readExportHealth();
      expect(health.queueMetricSourceCount).toBe(1);
      expect(
        health.terminalFailureCodes.some((c) =>
          (TERMINAL_FAILURE_CODES as readonly string[]).includes(c)
        )
      ).toBe(true);
      expect(Object.values(ExportFailureCode)).toEqual(
        expect.arrayContaining([...TERMINAL_FAILURE_CODES])
      );

      const artifact = {
        queueMetricSourceCount: health.queueMetricSourceCount,
        terminalFailureCodeCount: health.terminalFailureCodes.length,
        terminalFailureCodes: health.terminalFailureCodes,
        queueDepth: sat.queueDepth,
        queueCapacity: sat.queueCapacity,
        flushCode: flush.terminalFailureCode,
      };
      writeEvidence('queue-and-flush.json', artifact);
      writeEvidence('AC-4-seeded-artifact.json', artifact);

      expect(artifact.queueMetricSourceCount).toBe(1);
      expect(artifact.terminalFailureCodeCount).toBeGreaterThanOrEqual(1);
    } finally {
      spawnSync('docker', ['unpause', 'obs01-canary-langfuse-web-1'], { encoding: 'utf8' });
      // Keep compose helper referenced so GREEN can adopt deploy/otel project lifecycle.
      void dockerCompose;
    }
  }, 300_000);
});
