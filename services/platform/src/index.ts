/**
 * Mastra composition root — the sole backend process (AP-1 / C-2).
 *
 * Boots exactly ONE `new Mastra({...})` against @mastra/pg PostgresStore,
 * starts the Postgres-backed queue (pg-boss preferred), and serves Hono
 * HTTP/SSE on :4111 (PORT / HOLO_PORT override).
 *
 * Usage:
 *   bun run services/platform/src/index.ts
 *   bun services/platform/src/cli/holo.ts service:up
 */

import { Mastra } from '@mastra/core/mastra';
import { applyConsolidatedSecretsToEnv } from './config/secrets.ts';
import { serviceQueue } from './http/health.ts';
import { createHonoApp } from './http/hono-app.ts';
import { createObservability, createStorage, DATABASE_URL } from './mastra.ts';

export const DEFAULT_PORT = 4111;

/**
 * PostgresStore may surface async init failures (ECONNREFUSED, missing role)
 * without rejecting createStorage() itself. Keep the process alive so /health
 * can still report db.ready:false (AC-2 negative control).
 */
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (
    msg.includes('ECONNREFUSED') ||
    msg.includes('MASTRA_STORAGE') ||
    msg.includes('does not exist') ||
    msg.includes('connect')
  ) {
    console.error('[mastra-service] storage/async error (server stays up for /health):', msg);
    return;
  }
  console.error('[mastra-service] Unhandled rejection:', msg);
});

export type ServiceHandle = {
  mastra: Mastra;
  port: number;
  server: ReturnType<typeof Bun.serve>;
  stop: () => Promise<void>;
};

export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT ?? env.HOLO_PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) {
    throw new Error(`Invalid PORT/HOLO_PORT: ${raw}`);
  }
  return n;
}

/**
 * Create the single Mastra instance for this process.
 * Agents/workflows/tools are registered by later sprint tasks; storage +
 * observability are wired now so /health and durable runtime share one root.
 */
export function createMastra(): Mastra {
  const storage = createStorage();
  const observability = createObservability();
  return new Mastra({
    storage,
    observability,
    // Empty registries for service-1; service-2+ register tools/agents.
    agents: {},
    workflows: {},
  });
}

/**
 * Boot Mastra + Hono. Prints the AC-required Starting/Listening lines.
 */
export async function startService(options?: {
  port?: number;
  /** Network interface for native-simulator and tailnet callers. */
  hostname?: string;
  /** When true (default), log Starting/Listening lines to stdout. */
  log?: boolean;
}): Promise<ServiceHandle> {
  // RH-1: launchd injects only DATABASE_URL/PORT/FLEET_URL/HOLO_ROOT — not
  // HOLO_KEY_* / MASTRA_API_KEY / FLEET_KEY. Overlay missing keys from
  // consolidated secrets (env wins) BEFORE scoped-key middleware reads env.
  // Never write secret values into 0644 LaunchAgent plists.
  applyConsolidatedSecretsToEnv();

  const port = options?.port ?? resolvePort();
  const hostname = options?.hostname ?? process.env.HOLO_BIND_HOST ?? '0.0.0.0';
  const log = options?.log !== false;

  if (log) {
    console.log(`Starting Mastra service on :${port}`);
  }

  // Postgres-backed queue (pg-boss preferred) — probeQueue() measures live state.
  serviceQueue.startSync();
  // Await full backend start so /health queue.ready is honest on first probe.
  await serviceQueue.start();

  const mastra = createMastra();
  const app = createHonoApp();

  // Touch mastra so the instance is retained and storage is the active store.
  // listAgents() is a real 1.x API (not a stub); empty registry is expected here.
  void mastra.listAgents();

  const server = Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
    // /health + MCP tools (findRecommendations/Jina) can exceed default 10s idle.
    idleTimeout: 120,
  });

  if (log) {
    console.log(`Listening on :${port}`);
    console.log(`  health:  http://127.0.0.1:${port}/health`);
    console.log(`  storage: PostgresStore → ${DATABASE_URL}`);
    console.log(`  queue:   backend=${serviceQueue.getBackend()} (Postgres leased queue)`);
    console.log(`  mastra:  single composition root (agents/workflows deferred to later tasks)`);
  }

  const stop = async () => {
    await serviceQueue.stop();
    server.stop(true);
  };

  return { mastra, port, server, stop };
}

// Composition-root entry: `bun run services/platform/src/index.ts`
const isMain =
  typeof Bun !== 'undefined' &&
  (import.meta.path === Bun.main ||
    process.argv[1]?.endsWith('/services/platform/src/index.ts') ||
    process.argv[1]?.endsWith('services/platform/src/index.ts') ||
    process.argv[1]?.endsWith('/index.ts'));

if (isMain) {
  startService().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
