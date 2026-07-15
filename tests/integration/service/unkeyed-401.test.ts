/**
 * AC-1 (T-PLAT-007): unkeyed protected routes → HTTP 401
 *
 * Drives the REAL booted Mastra service (PLATFORM_IT=1). No mocks.
 *
 * NEGATIVE CONTROL (would fail if):
 * - middleware bypassed (unkeyed request reaches handler → 200)
 * - test does not assert HTTP 401
 * - scoped-key middleware is a no-op stub
 *
 * Prior RED evidence: service-3 middleware suite failed before middleware landed;
 * this suite is the gate that stays GREEN only while 401 is enforced on the wire.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/unkeyed-401.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYS,
  httpJson,
  type LiveService,
  PLATFORM_IT,
  requireService,
  startLiveService,
} from './harness';

const itLive = PLATFORM_IT ? it : it.skip;

describe('AC-1: unkeyed → HTTP 401 (real booted service)', () => {
  let svc: LiveService | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    svc = await startLiveService({ keys: DEFAULT_KEYS });
  }, 30_000);

  afterAll(async () => {
    await svc?.stop();
  });

  itLive('POST /api/missions without Authorization → 401', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions');
    expect(res.status, `body=${res.text}`).toBe(401);
    expect(res.body).toMatchObject({ error: 'unauthorized' });
  });

  itLive('POST /api/missions/:id/steer without Authorization → 401', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions/x/steer');
    expect(res.status, `body=${res.text}`).toBe(401);
  });

  itLive('POST /mcp without Authorization → 401', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/mcp');
    expect(res.status, `body=${res.text}`).toBe(401);
  });

  itLive('unknown Bearer token → 401 (not 403)', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions', {
      key: 'not-a-configured-key',
    });
    expect(res.status, `body=${res.text}`).toBe(401);
  });
});
