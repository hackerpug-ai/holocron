/** Sprint 18 real Postgres/fleet chat run and resumable SSE gate. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's18-rn', mcp: 's18-mcp', control: 's18-control' };

type ChatRunCreateBody = {
  runId: string;
  durableMessageId: string;
  status: string;
  role: string;
  replay?: boolean;
};

type ChatRunStatusBody = {
  status: string;
  errorCode?: string;
};

describe('Sprint 18 chat runs', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];
  // F1 (red-hat): nonprod default is now the REAL fleet path. These Sprint-18
  // tests assert the deterministic SSE shape (monotonic ids, completed status)
  // so they explicitly opt back into the canned emitter via the env flag — the
  // opt-in safety net preserved by AC-2. The flag is scoped to this file via
  // beforeAll/afterAll save-and-restore so other suites are unaffected.
  let savedDeterministicFlag: string | undefined;

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
    savedDeterministicFlag = process.env.HOLO_CHAT_DETERMINISTIC_STREAM;
    process.env.HOLO_CHAT_DETERMINISTIC_STREAM = '1';
  });

  afterAll(async () => {
    if (savedDeterministicFlag === undefined) delete process.env.HOLO_CHAT_DETERMINISTIC_STREAM;
    else process.env.HOLO_CHAT_DETERMINISTIC_STREAM = savedDeterministicFlag;
    if (!sql) return;
    for (const requestId of requestIds) {
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'creates an idempotent fleet run and replays monotonic SSE events',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const requestId = `s18-${Date.now()}`;
      requestIds.push(requestId);
      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, msg: 'Say hello in one short sentence.' }),
      });
      expect(create.status).toBe(200);
      const first = (await create.json()) as ChatRunCreateBody;
      expect(first.runId).toMatch(/[0-9a-f-]{36}/);
      expect(first.durableMessageId).toMatch(/[0-9a-f-]{36}/);
      expect(['pending', 'running']).toContain(first.status);
      expect(first.role).toBe('divergent');

      const replay = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, msg: 'different message ignored on replay' }),
      });
      const second = (await replay.json()) as ChatRunCreateBody;
      expect(second.replay).toBe(true);
      expect(second.runId).toBe(first.runId);
      expect(second.durableMessageId).toBe(first.durableMessageId);

      const events = await app.request(`/api/chat-runs/${first.runId}/events`, {
        headers: { authorization: `Bearer ${KEYS.rn}` },
      });
      expect(events.status).toBe(200);
      const body = await events.text();
      const ids = [...body.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1]));
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      expect(body).toContain('event: terminal');

      const lastId = ids.at(-2) ?? 0;
      const resumed = await app.request(`/api/chat-runs/${first.runId}/events`, {
        headers: { authorization: `Bearer ${KEYS.rn}`, 'Last-Event-ID': String(lastId) },
      });
      const resumedBody = await resumed.text();
      const resumedIds = [...resumedBody.matchAll(/^id: (\d+)$/gm)].map((match) =>
        Number(match[1])
      );
      expect(resumedIds.every((id) => id > lastId)).toBe(true);
      expect(resumedBody).toContain('event: terminal');
      const final = await app.request(`/api/chat-runs/${first.runId}`, {
        headers: { authorization: `Bearer ${KEYS.rn}` },
      });
      const finalBody = (await final.json()) as ChatRunStatusBody;
      expect(finalBody.status).toBe('completed');
    },
    180_000
  );

  itLive(
    'emits a typed blocked terminal without fleet dispatch',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const requestId = `s18-blocked-${Date.now()}`;
      requestIds.push(requestId);
      const response = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, msg: '[[tripwire]] unsafe request' }),
      });
      const body = (await response.json()) as ChatRunCreateBody;
      expect(response.status).toBe(200);
      expect(['pending', 'running']).toContain(body.status);
      const events = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: { authorization: `Bearer ${KEYS.rn}` },
      });
      expect(await events.text()).toContain('event: blocked');
      const final = await app.request(`/api/chat-runs/${body.runId}`, {
        headers: { authorization: `Bearer ${KEYS.rn}` },
      });
      const finalBody = (await final.json()) as ChatRunStatusBody;
      expect(finalBody.status).toBe('blocked');
      expect(finalBody.errorCode).toBe('CHAT_PROCESSOR_BLOCKED');
      const foreign = await app.request(`/api/chat-runs/${body.runId}`, {
        headers: { authorization: `Bearer ${KEYS.control}` },
      });
      expect(foreign.status).toBe(403);
    },
    30_000
  );

  itLive(
    'cancels a pending run with a typed terminal',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const requestId = `s18-cancel-${Date.now()}`;
      requestIds.push(requestId);
      const response = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({ requestId, msg: 'Answer with a detailed research summary.' }),
      });
      const body = (await response.json()) as ChatRunCreateBody;
      const cancel = await app.request(`/api/chat-runs/${body.runId}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}` },
      });
      expect(cancel.status).toBe(200);
      const cancelled = (await cancel.json()) as ChatRunStatusBody;
      expect(['blocked', 'completed']).toContain(cancelled.status);
    },
    30_000
  );
});
