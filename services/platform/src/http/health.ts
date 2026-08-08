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
import { type DatabaseTargetIdentity, parseDatabaseTargetIdentity } from '../db/connection.ts';
import { DATABASE_URL } from '../mastra.ts';
import {
  isProcessQueueReady,
  probeQueueBackend,
  type QueueBackendName,
  type QueueBackendStatus,
  setProcessQueueReady,
  startQueueBackend,
  stopQueueBackend,
} from '../queue/backend.ts';
import { type DeploymentIdentityProbe, readDeploymentIdentity } from './deployment-identity.ts';

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
    void this.start().catch(() => {
      console.error('[queue] start failed: database queue startup failed');
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

export type EndpointProbeResult = ProbeResult & {
  endpoint: string | null;
};

export type HealthBody = {
  status: 'ok' | 'degraded';
  /** Credential-free identity of the exact serving database target probed. */
  database_target: DatabaseTargetIdentity | null;
  db: ProbeResult;
  /** Production alias retained alongside db for explicit dependency reporting. */
  postgres: ProbeResult;
  fleet: FleetProbeResult;
  queue: ProbeResult;
  zeroCache: EndpointProbeResult;
  deployment: DeploymentIdentityProbe;
  failing_dependency: 'postgres' | 'fleet' | 'queue' | 'zero-cache' | 'deployment' | null;
  host: string | null;
  runtime: 'container' | null;
  imageDigest: string | null;
  sourceRevision: string | null;
  composeGeneration: string | null;
  /**
   * Observed serving data-plane (UC-SYNC-04 / R2-C04).
   * Fresh control-plane re-read — null when unset.
   */
  data_plane: string | null;
  /** Observed rollback routing target (e.g. convex-frozen). */
  target: string | null;
  /** Nested rollback observation for clients that probe `.rollback.target`. */
  rollback: {
    target: string | null;
    data_plane: string | null;
    source: string;
  };
  /**
   * Serving-process identity (REDHAT-FIX-S29-R3-C03).
   * Reported by the already-listening process — not caller-minted by verify CLI.
   */
  pid: number;
  /** Optional deployment label from the serving process env (HOLO_SERVICE_LABEL). */
  service_label: string | null;
  /** Optional generation/build id from the serving process env. */
  generation: string | null;
  /** process.uptime() in ms at health observation time. */
  uptime_ms: number;
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
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(connectionString, {
      max: 1,
      connect_timeout: 3,
      idle_timeout: 1,
      prepare: false,
      onnotice: () => {},
    });
    await sql`SELECT 1 AS ok`;
    return { ready: true, latency_ms: elapsedMs(start) };
  } catch {
    return {
      ready: false,
      latency_ms: elapsedMs(start),
      error: 'database probe failed',
    };
  } finally {
    await sql?.end({ timeout: 2 }).catch(() => {});
  }
}

/**
 * Probe the live LiteLLM fleet. Reports endpoint as base host:port per AC-2.
 * Hits /v1/models (OpenAI-compatible) — real HTTP, not a static flag.
 */
export async function probeFleet(
  endpoint = process.env.FLEET_URL?.replace(/\/v1\/?$/, '') ?? DEFAULT_FLEET_ENDPOINT
): Promise<FleetProbeResult> {
  const start = performance.now();
  let base: string;
  try {
    const parsed = new URL(endpoint);
    if (parsed.username || parsed.password) {
      return {
        ready: false,
        endpoint: parsed.origin,
        latency_ms: elapsedMs(start),
        error: 'fleet endpoint credentials are forbidden',
      };
    }
    base = parsed.origin;
  } catch {
    return {
      ready: false,
      endpoint: 'invalid',
      latency_ms: elapsedMs(start),
      error: 'fleet endpoint is invalid',
    };
  }
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
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // postgres.js can spend substantially longer than the HTTP readiness budget
    // retrying a disappeared server. Bound the queue probe independently so
    // production /health can fail closed with a prompt 503 instead of leaving
    // the request open until the caller aborts it.
    const timeoutMs = 3_500;
    const timedOut = new Promise<QueueBackendStatus>((resolveTimeout) => {
      timeout = setTimeout(
        () =>
          resolveTimeout({
            backend: 'pg-boss',
            ready: false,
            placeholder: false,
            detail: 'queue probe timed out',
            error: `queue probe exceeded ${timeoutMs}ms`,
          }),
        timeoutMs
      );
    });
    const backend = await Promise.race([probeQueueBackend(databaseUrl ?? DATABASE_URL), timedOut]);
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
            error: backend.error
              ? 'queue probe failed'
              : processReady
                ? backend.detail
                : 'queue not started',
          }),
    };
  } catch {
    return {
      ready: false,
      latency_ms: elapsedMs(start),
      error: 'queue probe failed',
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** Probe zero-cache's real keepalive endpoint. */
export async function probeZeroCache(
  endpoint = process.env.ZERO_CACHE_URL,
  required = process.env.HOLO_PRODUCTION_READINESS === '1'
): Promise<EndpointProbeResult> {
  const start = performance.now();
  const raw = endpoint?.trim() ?? '';
  if (!raw) {
    return {
      ready: !required,
      endpoint: null,
      latency_ms: elapsedMs(start),
      ...(required ? { error: 'ZERO_CACHE_URL is required for production readiness' } : {}),
    };
  }
  let base: string;
  try {
    base = new URL(raw).origin;
  } catch {
    return {
      ready: false,
      endpoint: raw,
      latency_ms: elapsedMs(start),
      error: 'ZERO_CACHE_URL is invalid',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${base}/keepalive`, {
      method: 'GET',
      headers: { accept: 'application/json, text/plain, */*' },
      signal: controller.signal,
    });
    return {
      ready: response.ok,
      endpoint: base,
      latency_ms: elapsedMs(start),
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      ready: false,
      endpoint: base,
      latency_ms: elapsedMs(start),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run all readiness probes and map to HTTP status.
 * Production mode (HOLO_PRODUCTION_READINESS=1) is fail-closed: every required
 * dependency and deployment identity must be ready or the endpoint returns 503.
 * Non-production mode retains the historical db-only HTTP status behavior.
 */
export async function runHealthCheck(options?: {
  databaseUrl?: string;
  fleetEndpoint?: string;
  queue?: QueueLike;
  zeroCacheEndpoint?: string;
  strictReadiness?: boolean;
  deploymentEnv?: NodeJS.ProcessEnv;
  processFacts?: { pid?: number; uptimeMs?: number };
}): Promise<HealthResponse> {
  const strictReadiness = options?.strictReadiness ?? process.env.HOLO_PRODUCTION_READINESS === '1';
  const databaseUrl = options?.databaseUrl ?? DATABASE_URL;
  let database_target: DatabaseTargetIdentity | null = null;
  try {
    database_target = parseDatabaseTargetIdentity(databaseUrl);
  } catch {
    // A malformed serving URL must not make /health echo the URL or parser detail.
    database_target = null;
  }
  const deployment = readDeploymentIdentity(options?.deploymentEnv, options?.processFacts);
  const [db, fleet, queue, zeroCache] = await Promise.all([
    probeDb(databaseUrl),
    probeFleet(options?.fleetEndpoint),
    probeQueue(options?.queue, databaseUrl),
    probeZeroCache(options?.zeroCacheEndpoint, strictReadiness),
  ]);

  const allReady = db.ready && fleet.ready && queue.ready && zeroCache.ready && deployment.ready;
  const failingDependency = !db.ready
    ? 'postgres'
    : !fleet.ready
      ? 'fleet'
      : !queue.ready
        ? 'queue'
        : !zeroCache.ready
          ? 'zero-cache'
          : !deployment.ready
            ? 'deployment'
            : null;
  // Fresh control-plane re-read every health request (R2-C04 live ack surface)
  const observed = resolveObservedDataPlane();
  const serviceLabelRaw =
    process.env.HOLO_SERVICE_LABEL ??
    process.env.HOLO_VERIFY_SERVICE_LABEL ??
    process.env.HOLO_SOAK_SERVICE_LABEL ??
    '';
  const generationRaw =
    process.env.HOLO_GENERATION ??
    process.env.HOLO_VERIFY_GENERATION ??
    process.env.HOLO_SOAK_GENERATION ??
    '';
  const body: HealthBody = {
    status: allReady ? 'ok' : 'degraded',
    db: {
      ready: db.ready,
      latency_ms: db.latency_ms,
      ...(db.error ? { error: db.error } : {}),
    },
    postgres: {
      ready: db.ready,
      latency_ms: db.latency_ms,
      ...(db.error ? { error: db.error } : {}),
    },
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
    zeroCache: {
      ready: zeroCache.ready,
      endpoint: zeroCache.endpoint,
      latency_ms: zeroCache.latency_ms,
      ...(zeroCache.error ? { error: zeroCache.error } : {}),
    },
    deployment,
    database_target,
    failing_dependency: failingDependency,
    host: deployment.identity?.host ?? null,
    runtime: deployment.identity?.runtime ?? null,
    imageDigest: deployment.identity?.imageDigest ?? null,
    sourceRevision: deployment.identity?.sourceRevision ?? null,
    composeGeneration: deployment.identity?.composeGeneration ?? null,
    data_plane: observed.data_plane,
    target: observed.target,
    rollback: {
      target: observed.target,
      data_plane: observed.data_plane,
      source: observed.source,
    },
    // R3-C03: identity bound to this already-listening process (never caller-minted).
    pid: options?.processFacts?.pid ?? process.pid,
    service_label: serviceLabelRaw.trim().length > 0 ? serviceLabelRaw.trim() : null,
    generation: generationRaw.trim().length > 0 ? generationRaw.trim() : null,
    uptime_ms: Math.max(1, Math.ceil(options?.processFacts?.uptimeMs ?? process.uptime() * 1000)),
  };

  if (!db.ready || (strictReadiness && !allReady)) {
    return { statusCode: 503, body };
  }
  return { statusCode: 200, body };
}
