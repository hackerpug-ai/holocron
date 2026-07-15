/**
 * AC-2 (T-PLAT-007): wrong scope → HTTP 403
 *
 * Drives the REAL booted Mastra service (PLATFORM_IT=1). No mocks.
 *
 * NEGATIVE CONTROL (would fail if):
 * - middleware missing scope enforcement (wrong-scope key gets 200)
 * - test does not assert HTTP 403
 * - scope check is a stub that always allows
 *
 * Prior RED evidence: service-3 wrong-scope cases failed before isScopeAllowedForPath.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron \
 *     HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *     pnpm vitest run tests/integration/service/wrong-scope-403.test.ts
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

describe('AC-2: wrong-scope → HTTP 403 (real booted service)', () => {
  let svc: LiveService | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    svc = await startLiveService({ keys: DEFAULT_KEYS });
  }, 30_000);

  afterAll(async () => {
    await svc?.stop();
  });

  itLive('MCP key on POST /api/missions → 403', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions', {
      key: DEFAULT_KEYS.mcp,
    });
    expect(res.status, `body=${res.text}`).toBe(403);
    expect(res.body).toMatchObject({ error: 'forbidden', scope: 'mcp' });
  });

  itLive('RN key on POST /mcp → 403', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/mcp', {
      key: DEFAULT_KEYS.rn,
    });
    expect(res.status, `body=${res.text}`).toBe(403);
    expect(res.body).toMatchObject({ error: 'forbidden', scope: 'rn' });
  });

  itLive('CONTROL key on GET /api/missions (list) → 403', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'GET', '/api/missions', {
      key: DEFAULT_KEYS.control,
    });
    expect(res.status, `body=${res.text}`).toBe(403);
    expect(res.body).toMatchObject({ error: 'forbidden', scope: 'control' });
  });

  itLive('CONTROL key on POST /mcp → 403', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/mcp', {
      key: DEFAULT_KEYS.control,
    });
    expect(res.status, `body=${res.text}`).toBe(403);
  });
});
