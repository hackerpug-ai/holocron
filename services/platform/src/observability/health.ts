/**
 * Observability readiness probe (OBS-03).
 *
 * Combines two independent signals:
 *   - storage readiness: the durable service_events ledger is reachable via a real
 *     SELECT against DATABASE_URL Postgres.
 *   - export readiness: the OBS-02 exporter health (Langfuse + Collector) is 'ready'.
 *
 * `ready` is true only when BOTH are green. An unknown export state is NOT green
 * (spec: unknown/degraded never reports healthy). Core Postgres/queue readiness is
 * deliberately NOT this probe's concern — the /health endpoint already gates 503 on
 * the core database independently, so an observability-only outage degrades the body
 * to status:"degraded" with HTTP 200 while a core outage stays 503.
 */
import { createSql } from '../db/client.ts';
import { type ExternalExportState, readExportHealth } from './export-health.ts';

export type ObservabilityHealthResult = {
  ready: boolean;
  storageReady: boolean;
  storageError: string | null;
  exportState: ExternalExportState;
  exportReady: boolean;
  latency_ms: number;
};

export async function probeObservabilityHealth(
  databaseUrl?: string
): Promise<ObservabilityHealthResult> {
  const start = performance.now();
  let storageReady = false;
  let storageError: string | null = null;

  const sql = createSql(databaseUrl);
  try {
    await sql`SELECT 1 AS ok FROM service_events LIMIT 1`;
    storageReady = true;
  } catch (err) {
    storageReady = false;
    storageError = err instanceof Error ? err.message : String(err);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }

  const exportHealth = await readExportHealth();
  const exportReady = exportHealth.externalState === 'ready';

  return {
    ready: storageReady && exportReady,
    storageReady,
    storageError,
    exportState: exportHealth.externalState,
    exportReady,
    latency_ms: Math.max(1, Math.ceil(performance.now() - start)),
  };
}
