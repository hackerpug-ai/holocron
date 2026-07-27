/**
 * Sprint 25 / F1 — chat fleet-stream production-real proof.
 *
 * Three layers:
 *   1. Truth-table unit test for `shouldUseDeterministicChatStream` (AC-3).
 *      Pure predicate, no Postgres, no fleet — runs in every suite.
 *   2. vi.mock path-entry + fail-closed proofs (AC-4, AC-5). Mocks the fleet
 *      module so the real `createFleetAgentWithResolved` is NEVER called; this
 *      is the in-repo vi.mock pattern (convex/research/actions.test.ts:27).
 *      PLATFORM_IT-gated because it drives the real Hono + Postgres path.
 *   3. Smoking-gun mask proof (AC-6). Under default nonprod (no FLEET_ONLY),
 *      asserts the fleet IS called AND tokens DO NOT match the deterministic
 *      body — proving the silent-default mask is GONE post-F1. Pre-F1, this
 *      same setup captured the bug (fleet NOT called, deterministic tokens
 *      observed); that capture is preserved in the test comments below.
 *
 * Mock-only: NO real fleet at :4545 is required for any of these cases. The
 * test mounts the real `createHonoApp` and posts to `/api/chat-runs` so the
 * platform's actual SSE reconciliation path is exercised — only the fleet
 * itself is mocked, never `@mastra/core` / `@mastra/client-js`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's25-f1-rn', mcp: 's25-f1-mcp', control: 's25-f1-control' };

const DETERMINISTIC_BODY_REGEX = /Rivers mountains valleys forests oceans clouds/;

// NOTE: the truth-table unit test for `shouldUseDeterministicChatStream` lives
// in sprint25-chat-truth-table.test.ts (pure predicate, no drizzle chain so it
// runs in every env). This file owns the mock-based proofs (AC-4/5/6) only.

/**
 * AC-4 / AC-5 / AC-6 — mock-based proof, no real fleet needed.
 *
 * Mocks `createFleetAgentWithResolved` so the path-entry is observable without
 * hitting :4545. The Hono app + Postgres + SSE reconciliation are REAL — only
 * the fleet module is mocked, mirroring convex/research/actions.test.ts:27.
 *
 * Each test does vi.resetModules() + vi.doMock + dynamic import so the chat-runs
 * module picks up the mocked agent bundle.
 */
describe('AC-4/5/6: chat-runs fleet-only + mask-is-default (mock fleet)', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    for (const requestId of requestIds) {
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    for (const conversationId of conversationIds) {
      await sql`DELETE FROM chat_messages WHERE conversation_id = ${conversationId}::uuid`;
      await sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  /**
   * Build a mock agentBundle whose `.agent.stream()` yields the supplied token
   * deltas. Tokens flow through the real `for await (chunk of result.fullStream)`
   * loop in chat-runs.ts:324 — proving path-entry end-to-end.
   */
  function buildMockAgentBundle(tokens: string[]) {
    const fullStream = (async function* () {
      for (const token of tokens) {
        yield { type: 'text-delta', textDelta: token };
      }
    })();
    const stream = vi.fn(async () => ({ fullStream }));
    return { agent: { stream }, resolved: { provider: 'mock', role: 'divergent' } };
  }

  /**
   * Mount the real Hono app with the fleet module mocked. Returns the app and
   * the spy on createFleetAgentWithResolved so callers can assert call count.
   */
  async function mountAppWithFleetMock(tokens: string[]): Promise<{
    createHonoApp: typeof import('../../src/http/hono-app')['createHonoApp'];
    fleetSpy: ReturnType<typeof vi.fn>;
  }> {
    const fleetSpy = vi.fn(async () => buildMockAgentBundle(tokens));
    vi.resetModules();
    vi.doMock('../../src/compat/cells/agent.ts', () => ({
      createFleetAgentWithResolved: fleetSpy,
      // Re-export the other names chat-runs may pull in transitively.
    }));
    const { createHonoApp } = await import('../../src/http/hono-app');
    return { createHonoApp, fleetSpy };
  }

  async function teardownFleetMock() {
    vi.doUnmock('../../src/compat/cells/agent.ts');
    vi.resetModules();
  }

  /**
   * POST a chat-run and poll until terminal, returning the final row.
   * Env mutations are scoped to this call (saved + restored).
   */
  async function postChatRunAndWait(
    createHonoApp: typeof import('../../src/http/hono-app')['createHonoApp'],
    msg: string,
    env: Record<string, string>
  ): Promise<{
    runId: string;
    row: {
      status: string;
      final_text?: string | null;
      error?: string | null;
      error_code?: string | null;
    } | null;
  }> {
    const requestId = `s25-f1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    requestIds.push(requestId);
    const savedEnv: Record<string, string | undefined> = {};
    for (const k of Object.keys(env)) {
      savedEnv[k] = process.env[k];
      process.env[k] = env[k];
    }
    try {
      const app = createHonoApp({ keys: KEYS });
      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestId, msg }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as { runId?: string; conversationId?: string };
      expect(body.runId).toMatch(/[0-9a-f-]{36}/);
      if (body.conversationId) conversationIds.push(body.conversationId);

      const deadline = Date.now() + 30_000;
      let row: {
        status: string;
        final_text?: string | null;
        error?: string | null;
        error_code?: string | null;
      } | null = null;
      while (Date.now() < deadline) {
        const rows = await sql!`
          SELECT status, final_text, error, error_code
          FROM chat_runs WHERE id = ${body.runId}::uuid
        `;
        row = rows[0] ?? null;
        if (row && ['completed', 'failed', 'blocked'].includes(row.status)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      return { runId: body.runId!, row };
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  /** Read every token event for a run — what the client SSE wire would observe. */
  async function readTokenEvents(runId: string): Promise<string> {
    const rows = await sql!`
      SELECT (payload::jsonb ->> 'token') AS token
      FROM chat_run_events
      WHERE run_id = ${runId}::uuid AND event = 'token'
      ORDER BY seq ASC
    `;
    return rows.map((r: { token?: string }) => r.token ?? '').join('');
  }

  // ── AC-4: HOLO_CHAT_FLEET_ONLY=1 → fleet IS called + tokens NOT canned ──
  itLive(
    'AC-4: under HOLO_CHAT_FLEET_ONLY=1, createFleetAgentWithResolved IS called and tokens do NOT match the deterministic body',
    async () => {
      if (!sql) throw new Error('Postgres required for AC-4 mock proof');

      const { createHonoApp, fleetSpy } = await mountAppWithFleetMock([
        'FLEET_ALIVE_TOKEN_A ',
        'FLEET_ALIVE_TOKEN_B ',
      ]);
      try {
        const result = await postChatRunAndWait(createHonoApp, 'AC-4 mock path-entry probe', {
          HOLO_CHAT_FLEET_ONLY: '1',
        });

        expect(result.row?.status).toBe('completed');
        expect(fleetSpy).toHaveBeenCalled();
        const tokens = await readTokenEvents(result.runId);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens).not.toMatch(DETERMINISTIC_BODY_REGEX);
      } finally {
        await teardownFleetMock();
      }
    },
    60_000
  );

  // ── AC-5: empty stream + FLEET_ONLY=1 → fail-closed envelope ──
  itLive(
    'AC-5: empty fleet stream under HOLO_CHAT_FLEET_ONLY=1 -> status=failed with regex envelope',
    async () => {
      if (!sql) throw new Error('Postgres required for AC-5 fail-closed proof');

      const { createHonoApp, fleetSpy } = await mountAppWithFleetMock([]);
      try {
        const result = await postChatRunAndWait(createHonoApp, 'AC-5 empty stream probe', {
          HOLO_CHAT_FLEET_ONLY: '1',
        });

        expect(result.row?.status).toBe('failed');
        // Sanity: the mock WAS called (path-entry), then empty-stream fired.
        expect(fleetSpy).toHaveBeenCalled();
        const envelope = `${result.row?.error ?? ''} ${result.row?.final_text ?? ''} ${result.row?.error_code ?? ''}`;
        // use-resumable-sse-stream.ts:204 client regex.
        expect(envelope).toMatch(
          /empty stream under HOLO_CHAT_FLEET_ONLY|fleet role ['"]?[\w-]+['"]? unreachable/i
        );
      } finally {
        await teardownFleetMock();
      }
    },
    60_000
  );

  // ── AC-6 (AFTER F1 flip): mask is GONE — fleet IS called under default nonprod ──
  // Pre-F1 (the smoking gun), this same setup showed:
  //   - createFleetAgentWithResolved was NOT called (mask routed around it)
  //   - tokens matched /Rivers mountains valleys forests oceans clouds/
  // That was the proof that the silent-default mask WAS the nonprod default.
  // Post-F1: shouldUseDeterministicChatStream returns FALSE under nonprod + no
  // env, so the real fleet path runs and tokens are NOT the canned body.
  itLive(
    'AC-6 (AFTER): under default nonprod, createFleetAgentWithResolved IS called and tokens do NOT match the deterministic body (mask gone)',
    async () => {
      if (!sql) throw new Error('Postgres required for AC-6 smoking-gun proof');

      const { createHonoApp, fleetSpy } = await mountAppWithFleetMock([
        'FLEET_DEFAULT_PROBE_A ',
        'FLEET_DEFAULT_PROBE_B ',
      ]);
      try {
        const result = await postChatRunAndWait(createHonoApp, 'AC-6 default-nonprod probe', {});

        expect(result.row?.status).toBe('completed');
        // AFTER the F1 flip: real fleet path runs (mock called).
        expect(fleetSpy).toHaveBeenCalled();
        const tokens = await readTokenEvents(result.runId);
        expect(tokens).not.toMatch(DETERMINISTIC_BODY_REGEX);
      } finally {
        await teardownFleetMock();
      }
    },
    60_000
  );
});
