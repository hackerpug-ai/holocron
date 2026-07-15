/**
 * AC-3 (T-PLAT-007): correct scoped key → HTTP 200
 *
 * Drives the REAL booted Mastra service (PLATFORM_IT=1). No mocks.
 * Asserts the live key store (env-loaded HOLO_KEY_*) — not a always-valid stub.
 *
 * NEGATIVE CONTROL (would fail if):
 * - key validation stubbed always-valid AND this test still only checks 200 with no key
 * - wrong key store (configured keys not loaded) → real key gets 401
 * - test does not assert HTTP 200
 *
 * Controlled RED demo: start with empty HOLO_KEY_* → rn-test becomes unknown → 401.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/keyed-200.test.ts
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

describe('AC-3: keyed → HTTP 200 with real key store (real booted service)', () => {
  let svc: LiveService | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    svc = await startLiveService({ keys: DEFAULT_KEYS });
  }, 30_000);

  afterAll(async () => {
    await svc?.stop();
  });

  itLive('RN key POST /api/missions → 200', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions', {
      key: DEFAULT_KEYS.rn,
    });
    expect(res.status, `body=${res.text}`).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'rn' });
  });

  itLive('RN key POST /api/missions/:id/steer → 200', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions/x/steer', {
      key: DEFAULT_KEYS.rn,
    });
    expect(res.status, `body=${res.text}`).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'rn' });
  });

  itLive('MCP key POST /mcp → 200', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/mcp', {
      key: DEFAULT_KEYS.mcp,
    });
    expect(res.status, `body=${res.text}`).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'mcp' });
  });

  itLive('CONTROL key POST /api/missions/:id/verdicts → 200', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions/x/verdicts', {
      key: DEFAULT_KEYS.control,
    });
    expect(res.status, `body=${res.text}`).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'control' });
  });

  itLive(
    'NEGATIVE CONTROL: service booted without matching keys rejects rn-test as 401',
    async () => {
      // would fail if validation were stubbed always-valid (would return 200 with any/no key match)
      const misconfigured = await startLiveService({
        keys: {
          rn: 'other-rn-key',
          mcp: 'other-mcp-key',
          control: 'other-ctl-key',
        },
      });
      try {
        const res = await httpJson(misconfigured.baseUrl, 'POST', '/api/missions', {
          key: DEFAULT_KEYS.rn, // not in this process's key store
        });
        expect(res.status, `body=${res.text}`).toBe(401);
      } finally {
        await misconfigured.stop();
      }
    },
    30_000
  );
});
