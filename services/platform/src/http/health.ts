/**
 * GET /health — live readiness probes for Postgres, fleet :4545, and queue.
 *
 * Never returns a static 200: every field is measured against a real dependency.
 * Queue readiness is Postgres-backed (pg-boss preferred / graphile-worker fallback).
 *
 * REDHAT-FIX-S29-R2-C04: also exposes observed data_plane / rollback target from
 * the durable serving control-plane (fresh re-read every request — never cached).
 */

import postgres from 'postgres';
import { resolveObservedDataPlane } from '../cutover/soak-fence.ts';
import { DATABASE_URL } from '../mastra.ts';
import {
  isProcessQueueReady,
  probeQueueBackend,
  type QueueBackendName,
  setProcessQueueReady,
  startQueueBackend,
  stopQueueBackend,
} from '../queue/backend.ts';

/** Fleet base as required by AC-2 (no /v1 suffix on the reported endpoint). */
export const DEFAULT_FLEET_ENDPOINT = 'http://127.0.0.1:4545';

/**
 * @deprecated Process-local adapter kept for type-compat only.
 * Production path is PostgresQueue / serviceQueue (Postgres-backed).
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

/**
 * Postgres-backed queue adapter. start() kicks the preferred backend (pg-boss)
 * and marks process readiness; probeQueue always re-checks live Postgres state.
 */
export class PostgresQueue {
  #started = false;
  #backend: QueueBackendName = 'pg-boss';
  #databaseUrl: string;

  constructor(databaseUrl = DATABASE_URL) {
    this.#databaseUrl = databaseUrl;
  }

  async start(): Promise<void> {
    const status = await startQueueBackend(this.#databaseUrl);
    this.#started = status.ready;
    this.#backend = status.backend;
    setProcessQueueReady(status.ready);
  }

  /** Sync start shim for composition root (fire-and-forget with process flag). */
  startSync(): void {
    this.#started = true;
    setProcessQueueReady(true);
    void this.start().catch((err) => {
      console.error('[queue] start failed:', err instanceof Error ? err.message : String(err));
      this.#started = false;
      setProcessQueueReady(false);
    });
  }

  async stop(): Promise<void> {
    await stopQueueBackend();
    this.#started = false;
    setProcessQueueReady(false);
  }

  stopSync(): void {
    this.#started = false;
    setProcessQueueReady(false);
    void stopQueueBackend();
  }

  isReady(): boolean {
    return this.#started || isProcessQueueReady();
  }

  getBackend(): QueueBackendName {
    return this.#backend;
  }
}

/** Singleton queue for this process — started by the composition root. */
export const serviceQueue = new PostgresQueue();

export type ProbeResult = {
  ready: boolean;
  latency_ms: number;
  error?: string;
  backend?: QueueBackendName;
};

export type FleetProbeResult = ProbeResult & {
  endpoint: string;
};

export type HealthBody = {
  status: 'ok' | 'degraded';
  db: ProbeResult;
  fleet: FleetProbeResult;
  queue: ProbeResult;
  /**
   * Observed serving data-plane (UC-SYNC-04 / R2-C04).
   * Fresh control-plane re-read — null when unset.
   */
  data_plane: string | null;
  /** Observed rollback routing target (e.g. convex-frozen). */
  target: string | null;
  /** Nested rollback observation for clients that probe `.rollback.target`. */
  rollback: { target: string | null; data_plane: string | null; source: string };
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

export type QueueLike = {
  isReady(): boolean;
};

/**
 * Probe the Postgres-backed queue. Measures live backend readiness via
 * queue_backend_meta / lease tables — never a static ready:true.
 */
export async function probeQueue(
  queue: QueueLike = serviceQueue,
  databaseUrl?: string
): Promise<ProbeResult> {
  const start = performance.now();
  try {
    const backend = await probeQueueBackend(databaseUrl ?? DATABASE_URL);
    // Process adapter must also be started (composition root startSync).
    const processReady = queue.isReady();
    const ready = backend.ready && processReady;
    return {
      ready,
      latency_ms: elapsedMs(start),
      backend: backend.backend,
      ...(ready
        ? {}
        : {
            error: backend.error ?? (processReady ? backend.detail : 'queue not started'),
          }),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      ready: false,
      latency_ms: elapsedMs(start),
      error,
    };
  }
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
  queue?: QueueLike;
}): Promise<HealthResponse> {
  const [db, fleet, queue] = await Promise.all([
    probeDb(options?.databaseUrl),
    probeFleet(options?.fleetEndpoint),
    probeQueue(options?.queue, options?.databaseUrl),
  ]);

  const allReady = db.ready && fleet.ready && queue.ready;
  // Fresh control-plane re-read every health request (R2-C04 live ack surface)
  const observed = resolveObservedDataPlane();
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
      ...(queue.backend ? { backend: queue.backend } : {}),
      ...(queue.error ? { error: queue.error } : {}),
    },
    data_plane: observed.data_plane,
    target: observed.target,
    rollback: {
      target: observed.target,
      data_plane: observed.data_plane,
      source: observed.source,
    },
  };

  if (!db.ready) {
    return { statusCode: 503, body };
  }
  return { statusCode: 200, body };
}
