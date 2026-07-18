/**
 * AC-3 (T-PLAT-007): correct scoped key reaches the REAL mission/MCP handlers
 *
 * Drives the REAL booted Mastra service (PLATFORM_IT=1). No mocks.
 * Asserts the live key store (env-loaded HOLO_KEY_*) — not an always-valid stub.
 *
 * NEGATIVE CONTROL (would fail if):
 * - key validation stubbed always-valid AND this test still only checks auth bypass
 * - wrong key store (configured keys not loaded) → real key gets 401
 * - mission endpoints still return placeholder 200s instead of real validation/not-found contracts
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
const MISSING_RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('AC-3: keyed requests reach real handlers (real booted service)', () => {
  let svc: LiveService | undefined;

  beforeAll(async () => {
    if (!PLATFORM_IT) return;
    svc = await startLiveService({ keys: DEFAULT_KEYS });
  }, 30_000);

  afterAll(async () => {
    await svc?.stop();
  });

  itLive(
    'RN key POST /api/missions reaches validation and returns 422 for malformed create',
    async () => {
      const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions', {
        key: DEFAULT_KEYS.rn,
        body: JSON.stringify({}),
      });
      expect(res.status, `body=${res.text}`).toBe(422);
      expect(res.body).toMatchObject({ code: 'INVALID_REQUEST', errorCode: 'INVALID_REQUEST' });
    }
  );

  itLive(
    'RN key POST /api/missions rejects unsupported args with 422 before template lookup',
    async () => {
      const res = await httpJson(requireService(svc).baseUrl, 'POST', '/api/missions', {
        key: DEFAULT_KEYS.rn,
        body: JSON.stringify({
          templateKey: 'missing-template',
          goal: 'reject unsupported args before any write',
          idempotencyKey: 'keyed-200-unsupported-args',
          args: {
            goal: 'reject unsupported args before any write',
            operator: 'keyed-200',
            foo: 'unsupported',
          },
        }),
      });
      expect(res.status, `body=${res.text}`).toBe(422);
      expect(res.body).toMatchObject({ code: 'INVALID_REQUEST', errorCode: 'INVALID_REQUEST' });
    }
  );

  itLive(
    'RN key POST /api/missions/:id/steer reaches the real handler and returns 404',
    async () => {
      const res = await httpJson(
        requireService(svc).baseUrl,
        'POST',
        `/api/missions/${MISSING_RUN_ID}/steer`,
        {
          key: DEFAULT_KEYS.rn,
          body: JSON.stringify({ note: 'steer missing run' }),
        }
      );
      expect(res.status, `body=${res.text}`).toBe(404);
      expect(res.body).toMatchObject({ code: 'MISSION_NOT_FOUND', errorCode: 'MISSION_NOT_FOUND' });
    }
  );

  itLive('MCP key POST /mcp → 200', async () => {
    const res = await httpJson(requireService(svc).baseUrl, 'POST', '/mcp', {
      key: DEFAULT_KEYS.mcp,
    });
    expect(res.status, `body=${res.text}`).toBe(200);
    expect(res.body).toMatchObject({ ok: true, scope: 'mcp' });
  });

  itLive(
    'CONTROL key POST /api/missions/:id/verdicts reaches the real handler and returns 404',
    async () => {
      const res = await httpJson(
        requireService(svc).baseUrl,
        'POST',
        `/api/missions/${MISSING_RUN_ID}/verdicts`,
        {
          key: DEFAULT_KEYS.control,
          body: JSON.stringify({ verdict: 'advance', rationale: 'missing run' }),
        }
      );
      expect(res.status, `body=${res.text}`).toBe(404);
      expect(res.body).toMatchObject({ code: 'MISSION_NOT_FOUND', errorCode: 'MISSION_NOT_FOUND' });
    }
  );

  itLive(
    'NEGATIVE CONTROL: service booted without matching keys rejects rn-test as 401',
    async () => {
      const misconfigured = await startLiveService({
        keys: {
          rn: 'other-rn-key',
          mcp: 'other-mcp-key',
          control: 'other-ctl-key',
        },
      });
      try {
        const res = await httpJson(misconfigured.baseUrl, 'POST', '/api/missions', {
          key: DEFAULT_KEYS.rn,
        });
        expect(res.status, `body=${res.text}`).toBe(401);
      } finally {
        await misconfigured.stop();
      }
    },
    30_000
  );
});
