import { MastraStorageExporter, Observability, SensitiveDataFilter } from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import {
  createLangfuseExporterFromEnv,
  HOLOCRON_SERVICE_NAME,
  type HolocronLangfuseExporter,
} from './observability/langfuse-exporter.ts';

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

// ── observability ─────────────────────────────────────────────
/**
 * Mastra Observability composition root.
 * - serviceName: holocron-platform (obs-1)
 * - Parallel exporters: Postgres MastraStorageExporter + self-hosted Langfuse
 * - SensitiveDataFilter redacts secrets before export
 */
export function createObservability(options?: {
  langfuseExporter?: HolocronLangfuseExporter;
}): Observability {
  const langfuseExporter =
    options?.langfuseExporter ??
    createLangfuseExporterFromEnv({
      serviceName: HOLOCRON_SERVICE_NAME,
      failOnExportError: true,
    });

  return new Observability({
    configs: {
      default: {
        serviceName: HOLOCRON_SERVICE_NAME,
        sampling: { type: 'always' as const },
        exporters: [new MastraStorageExporter(), langfuseExporter],
        spanOutputProcessors: [
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
