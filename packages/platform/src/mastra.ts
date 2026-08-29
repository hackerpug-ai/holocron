import {
  MastraStorageExporter,
  Observability,
  SamplingStrategyType,
  SensitiveDataFilter,
} from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
import { PostgresStore } from '@mastra/pg';
import { HOLOCRON_SERVICE_NAME, readObservabilityConfig } from './observability/config.ts';
import type { HolocronOtelBridge } from './observability/langfuse-exporter.ts';
import { HolocronRedactionProcessor } from './observability/redaction.ts';

// ── environment ──────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/postgres';
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1';
const FLEET_KEY = process.env.FLEET_KEY ?? 'sk-none';

export { DATABASE_URL, FLEET_KEY, FLEET_URL, HOLOCRON_SERVICE_NAME };

// ── storage ───────────────────────────────────────────────────
export function createStorage(): PostgresStore {
  return new PostgresStore({
    id: 'compat-storage',
    connectionString: DATABASE_URL,
  });
}

function createCollectorExporter(): OtelExporter {
  const cfg = readObservabilityConfig();
  return new OtelExporter({
    provider: {
      custom: {
        endpoint: cfg.otelCollectorUrl,
        protocol: 'http/json',
        headers: {},
      },
    },
    timeout: 10_000,
    batchSize: 16,
    signals: { traces: true, logs: false },
    logLevel: 'error',
  });
}

// ── observability ─────────────────────────────────────────────
/**
 * Mastra Observability composition root (OBS-02).
 * - serviceName: holocron-platform
 * - Parallel exporters: Postgres MastraStorageExporter + @mastra/otel-exporter → Collector
 * - SensitiveDataFilter redacts secrets before export
 * - External sink failure is soft (failOnExportError stays false)
 */
export function createObservability(options?: {
  otelExporter?: OtelExporter | HolocronOtelBridge;
}): Observability {
  const external = options?.otelExporter ?? createCollectorExporter();

  return new Observability({
    configs: {
      default: {
        serviceName: HOLOCRON_SERVICE_NAME,
        sampling: { type: SamplingStrategyType.ALWAYS },
        exporters: [new MastraStorageExporter(), external],
        spanOutputProcessors: [
          new HolocronRedactionProcessor(),
          new SensitiveDataFilter({
            sensitiveFields: [
              'password',
              'token',
              'secret',
              'key',
              'apikey',
              'auth',
              'authorization',
              'bearer',
              'jwt',
              'credential',
              'clientsecret',
              'privatekey',
              'refresh',
              'ssn',
              'email',
            ],
            redactionToken: '[REDACTED]',
            redactionStyle: 'full',
          }),
        ],
      },
    },
  });
}

// ── inference telemetry wiring (obs-2) ────────────────────────
// Per-call detective control substrate. Call sites record via
// recordInferenceTelemetry / runFleetModelCall / runBudgetedEscapeWithTelemetry.
// OTel spans (above) remain the distributed-trace substrate (obs-1);
// inference_telemetry is the durable per-call Postgres ledger for operators.
export {
  listInferenceTelemetry,
  recordInferenceTelemetry,
  runBudgetedEscapeWithTelemetry,
  runFleetFailureFixture,
  runFleetModelCall,
  runResearchModelMission,
} from './inference/telemetry.ts';
