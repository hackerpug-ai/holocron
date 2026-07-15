/**
 * AC-5 (T-PLAT-005): /health readiness booleans from real probes
 *
 * Drives the REAL booted Mastra service (PLATFORM_IT=1). No mocks.
 * Asserts db.ready / fleet.ready / queue.ready from live Postgres + fleet :4545
 * + process-local queue adapter — not a static {status:'ok'} stub.
 *
 * NEGATIVE CONTROL (would fail if):
 * - /health returns static ok without probing
 * - test does not assert the three readiness booleans
 * - probes stubbed ready:true with no dependency
 *
 * Controlled RED: wrong DATABASE_URL → db.ready === false (still real probe).
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/health-readiness.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_DATABASE_URL,
  DEFAULT_KEYS,
  httpJson,
  type LiveService,
  PLATFORM_IT,
  requireService,
  startLiveService,
} from './harness';

const itLive = PLATFORM_IT ? it : it.skip;

type HealthBody = {
  status: 'ok' | 'degraded';
  db: { ready: boolean; latency_ms: number; error?: string };
  fleet: { ready: boolean; latency_ms: number; endpoint?: string; error?: string };
  queue: { ready: boolean; latency_ms: number; error?: string };
};

describe('AC-5: /health readiness booleans (real booted service + real probes)', () => {
  let svc: LiveService | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    svc = await startLiveService({
      keys: DEFAULT_KEYS,
      databaseUrl: DEFAULT_DATABASE_URL,
    });
  }, 30_000);

  afterAll(async () => {
    await svc?.stop();
  });

  itLive('GET /health unauthenticated (no 401/403)', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'GET', '/health');
    expect([200, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  itLive('GET /health asserts db.ready AND fleet.ready AND queue.ready', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'GET', '/health');
    expect(res.status, `body=${res.text}`).toBe(200);
    const body = res.body as HealthBody;

    // Three concrete readiness booleans — the gate surface
    expect(body.db.ready).toBe(true);
    expect(body.fleet.ready).toBe(true);
    expect(body.queue.ready).toBe(true);

    // Prove probes actually ran (positive latency_ms, never empty)
    expect(body.db.latency_ms).toBeGreaterThan(0);
    expect(body.fleet.latency_ms).toBeGreaterThan(0);
    expect(body.queue.latency_ms).toBeGreaterThan(0);

    // Fleet endpoint reports live :4545 base (not a fake flag)
    expect(body.fleet.endpoint).toMatch(/:4545/);
    expect(body.status).toBe('ok');
  });

  itLive(
    'NEGATIVE CONTROL: dead DATABASE_URL ⇒ db.ready === false (probe not stubbed)',
    async () => {
      // would fail if /health returned static ready:true without probing Postgres
      const dead = await startLiveService({
        keys: DEFAULT_KEYS,
        databaseUrl: 'postgres://127.0.0.1:1/dead',
        readyTimeoutMs: 15_000,
      });
      try {
        const res = await httpJson(dead.baseUrl, 'GET', '/health');
        // db down → 503 per runHealthCheck
        expect(res.status, `body=${res.text}`).toBe(503);
        const body = res.body as HealthBody;
        expect(body.db.ready).toBe(false);
        expect(typeof body.db.error === 'string' || body.db.ready === false).toBe(true);
        // queue still real isReady() from process start
        expect(typeof body.queue.ready).toBe('boolean');
        expect(typeof body.fleet.ready).toBe('boolean');
      } finally {
        await dead.stop();
      }
    },
    30_000
  );
});
