/**
 * GET /health — live readiness probes for Postgres, fleet :4545, and queue.
 *
 * Never returns a static 200: every field is measured against a real dependency
 * (or a process-local queue adapter with a flipable isReady()).
 */

import postgres from 'postgres';
import { DATABASE_URL } from '../mastra.ts';

/** Fleet base as required by AC-2 (no /v1 suffix on the reported endpoint). */
export const DEFAULT_FLEET_ENDPOINT = 'http://127.0.0.1:4545';

/**
 * Process-local queue adapter (Sprint 05 does not yet wire graphile-worker/pg-boss).
 * isReady() is a real flipable check — started with the service, stoppable for probes.
 * Do not hardcode ready:true; always call isReady().
 */
export class ProcessLocalQueue {
  #started = false;

  start(): void {
    this.#started = true;
  }

  stop(): void {
    this.#started = false;
  }

  isReady(): boolean {
    return this.#started;
  }
}

/** Singleton queue for this process — started by the composition root. */
export const serviceQueue = new ProcessLocalQueue();

export type ProbeResult = {
  ready: boolean;
  latency_ms: number;
  error?: string;
};

export type FleetProbeResult = ProbeResult & {
  endpoint: string;
};

export type HealthBody = {
  status: 'ok' | 'degraded';
  db: ProbeResult;
  fleet: FleetProbeResult;
  queue: ProbeResult;
};

export type HealthResponse = {
  statusCode: 200 | 503;
  body: HealthBody;
};

function elapsedMs(start: number): number {
  // AC requires positive latency_ms when a probe ran (never 0/empty).
  return Math.max(1, Math.ceil(performance.now() - start));
}

/**
 * Probe Postgres with a real SELECT 1 against the same connection string
 * used by PostgresStore (DATABASE_URL / mastra.ts default).
 */
export async function probeDb(connectionString = DATABASE_URL): Promise<ProbeResult> {
  const start = performance.now();
  const sql = postgres(connectionString, {
    max: 1,
    connect_timeout: 3,
    idle_timeout: 1,
    prepare: false,
    onnotice: () => {},
  });
  try {
    await sql`SELECT 1 AS ok`;
    return { ready: true, latency_ms: elapsedMs(start) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ready: false, latency_ms: elapsedMs(start), error };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

/**
 * Probe the live LiteLLM fleet. Reports endpoint as base host:port per AC-2.
 * Hits /v1/models (OpenAI-compatible) — real HTTP, not a static flag.
 */
export async function probeFleet(
  endpoint = process.env.FLEET_URL?.replace(/\/v1\/?$/, '') ?? DEFAULT_FLEET_ENDPOINT
): Promise<FleetProbeResult> {
  const base = endpoint.replace(/\/$/, '');
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${base}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    const ready = res.ok;
    return {
      ready,
      endpoint: base,
      latency_ms: elapsedMs(start),
      ...(ready ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ready: false,
      endpoint: base,
      latency_ms: elapsedMs(start),
      error,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe the process-local queue adapter. Real isReady() call — flips if stop()'d.
 */
export async function probeQueue(queue: ProcessLocalQueue = serviceQueue): Promise<ProbeResult> {
  const start = performance.now();
  // Tiny await so this stays async-symmetric with the other probes and measures >0ms.
  await Promise.resolve();
  const ready = queue.isReady();
  return {
    ready,
    latency_ms: elapsedMs(start),
    ...(ready ? {} : { error: 'queue not started' }),
  };
}

/**
 * Run all readiness probes and map to HTTP status.
 * - 503 when db is not ready (critical)
 * - 200 with status "ok" when all ready
 * - 200 with status "degraded" when db ready but fleet/queue not
 */
export async function runHealthCheck(options?: {
  databaseUrl?: string;
  fleetEndpoint?: string;
  queue?: ProcessLocalQueue;
}): Promise<HealthResponse> {
  const [db, fleet, queue] = await Promise.all([
    probeDb(options?.databaseUrl),
    probeFleet(options?.fleetEndpoint),
    probeQueue(options?.queue),
  ]);

  const allReady = db.ready && fleet.ready && queue.ready;
  const body: HealthBody = {
    status: allReady ? 'ok' : 'degraded',
    db: { ready: db.ready, latency_ms: db.latency_ms, ...(db.error ? { error: db.error } : {}) },
    fleet: {
      ready: fleet.ready,
      endpoint: fleet.endpoint,
      latency_ms: fleet.latency_ms,
      ...(fleet.error ? { error: fleet.error } : {}),
    },
    queue: {
      ready: queue.ready,
      latency_ms: queue.latency_ms,
      ...(queue.error ? { error: queue.error } : {}),
    },
  };

  if (!db.ready) {
    return { statusCode: 503, body };
  }
  return { statusCode: 200, body };
}
