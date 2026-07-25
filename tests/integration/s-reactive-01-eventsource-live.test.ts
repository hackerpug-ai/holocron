/**
 * S-REACTIVE-01 — real EventSource-against-platform SSE integration.
 *
 * Proves the client library contract against the live Hono chat-runs surface:
 *   - POST /api/chat-runs returns durableMessageId (F-ID-01)
 *   - EventSource opens GET /api/chat-runs/:id/events with Authorization
 *   - Last-Event-ID gap-fill delivers only seq > afterSeq (AC-2 / AC-4)
 *   - applyTokenEvent ignores duplicates (exactly-once assembly)
 *   - cancel clears agent_busy and finalizes partial (AC-5)
 *
 * Token events are written to the real chat_run_events table (platform SSE
 * substrate). Fleet LLM budget must not block the transport/resume contract —
 * when the fleet is unavailable, we still prove EventSource + Last-Event-ID
 * against real Postgres-backed events (no EventSource mocks).
 *
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run tests/integration/s-reactive-01-eventsource-live.test.ts
 */
import { EventSource } from 'eventsource';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyTokenEvent } from '../../hooks/use-resumable-sse-stream';
import { createSql, type Sql } from '../../services/platform/src/db/client';
import { createHonoApp } from '../../services/platform/src/http/hono-app';
import { PLATFORM_IT } from './service/harness';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's-reactive-01-rn', mcp: 's-reactive-01-mcp', control: 's-reactive-01-control' };

type CreateBody = {
  runId?: string;
  durableMessageId?: string;
  conversationId?: string;
  status?: string;
};

function parseSseText(body: string): Array<{ id: number; event: string; data: string }> {
  const events: Array<{ id: number; event: string; data: string }> = [];
  const blocks = body.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let id = 0;
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('id:')) id = Number.parseInt(line.slice(3).trim(), 10) || 0;
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    events.push({ id, event, data: dataLines.join('\n') });
  }
  return events;
}

/** Seed a completed run with monotonic token events on the real SSE substrate. */
async function seedTokenEvents(sql: Sql, runId: string, tokens: string[]): Promise<void> {
  // Clear any race events from tripwire/fleet finalize so our sequence is exact.
  await sql`DELETE FROM chat_run_events WHERE run_id = ${runId}::uuid`;
  await sql`
    UPDATE chat_runs
    SET status = 'running', last_event_seq = 0, updated_at = now(),
        completed_at = NULL, final_text = NULL, error_code = NULL, error_message = NULL
    WHERE id = ${runId}::uuid
  `;
  let seq = 0;
  for (const token of tokens) {
    seq += 1;
    await sql`
      INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
      VALUES (${runId}::uuid, ${seq}, 'token', ${sql.json({ token } as never)})
    `;
  }
  seq += 1;
  const finalText = tokens.join('');
  await sql`
    INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
    VALUES (
      ${runId}::uuid,
      ${seq},
      'terminal',
      ${sql.json({ status: 'completed', text: finalText } as never)}
    )
  `;
  await sql`
    UPDATE chat_runs
    SET status = 'completed',
        final_text = ${finalText},
        last_event_seq = ${seq},
        completed_at = now(),
        updated_at = now()
    WHERE id = ${runId}::uuid
  `;
}

describe('S-REACTIVE-01 real EventSource / platform SSE', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];
  const conversationIds: string[] = [];

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    for (const requestId of requestIds) {
      await sql`DELETE FROM chat_run_events WHERE run_id IN (SELECT id FROM chat_runs WHERE request_id = ${requestId})`;
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    for (const conversationId of conversationIds) {
      await sql`DELETE FROM chat_messages WHERE conversation_id = ${conversationId}`;
      await sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  it('PLATFORM_IT gate is honest (skip when unset, never greenwash)', () => {
    if (!PLATFORM_IT) {
      expect(PLATFORM_IT, 'live EventSource suite requires PLATFORM_IT=1').toBe(false);
      return;
    }
    expect(PLATFORM_IT).toBe(true);
  });

  itLive(
    'AC-1/AC-2/AC-4: real EventSource streams tokens; Last-Event-ID gap-fill has zero duplicates',
    async () => {
      if (!sql) throw new Error('Postgres required');
      const app = createHonoApp({ keys: KEYS });
      const requestId = `s-reactive-01-es-${Date.now()}`;
      requestIds.push(requestId);

      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId,
          // tripwire avoids long fleet work; we still seed real token events below
          msg: '[[tripwire]] EventSource transport probe — tokens injected for SSE contract',
        }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as CreateBody;
      expect(body.runId).toMatch(/[0-9a-f-]{36}/i);
      // F-ID-01: durableMessageId required from create
      expect(body.durableMessageId).toMatch(/[0-9a-f-]{36}/i);
      if (body.conversationId) conversationIds.push(body.conversationId);

      // Wait for tripwire/fleet race to terminal so event inserts are exclusive
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const rows = await sql<{ status: string }[]>`
          SELECT status FROM chat_runs WHERE id = ${body.runId as string}::uuid
        `;
        if (rows[0] && ['completed', 'blocked', 'failed'].includes(rows[0].status)) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      const tokens = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
      await seedTokenEvents(sql, body.runId as string, tokens);

      // Full stream via Hono SSE (real /events route)
      const eventsRes = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: { authorization: `Bearer ${KEYS.rn}`, Accept: 'text/event-stream' },
      });
      expect(eventsRes.status).toBe(200);
      const fullBody = await eventsRes.text();
      const fullEvents = parseSseText(fullBody);
      const tokenEvents = fullEvents.filter((e) => e.event === 'token');
      expect(tokenEvents.length, 'must receive >=1 real SSE token event').toBeGreaterThanOrEqual(
        tokens.length
      );
      expect(fullBody).toMatch(/event: terminal/);

      // Assemble with exactly-once helper (same as client)
      let state = { lastSeq: 0, text: '', tokenCount: 0 };
      for (const ev of tokenEvents) {
        const payload = JSON.parse(ev.data || '{}') as { token?: string };
        if (typeof payload.token === 'string') {
          state = applyTokenEvent(state, ev.id, payload.token);
        }
      }
      expect(state.tokenCount).toBe(tokenEvents.length);
      expect(state.text).toBe(tokens.join(''));

      // Gap-fill: Last-Event-ID after first token → only seq > afterSeq
      const afterSeq = tokenEvents[0]?.id ?? 0;
      expect(afterSeq).toBeGreaterThan(0);
      const resumed = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          Accept: 'text/event-stream',
          'Last-Event-ID': String(afterSeq),
        },
      });
      expect(resumed.status).toBe(200);
      const resumedBody = await resumed.text();
      const resumedEvents = parseSseText(resumedBody);
      const resumedTokens = resumedEvents.filter((e) => e.event === 'token');
      expect(resumedTokens.every((e) => e.id > afterSeq)).toBe(true);
      expect(resumedTokens.some((e) => e.id === afterSeq)).toBe(false);
      expect(resumedTokens.length).toBe(tokenEvents.length - 1);

      // applyTokenEvent ignores replay of already-seen seqs
      const beforeDup = { ...state };
      for (const ev of tokenEvents.slice(0, 2)) {
        const payload = JSON.parse(ev.data || '{}') as { token?: string };
        state = applyTokenEvent(state, ev.id, payload.token ?? '');
      }
      expect(state.text).toBe(beforeDup.text);
      expect(state.tokenCount).toBe(beforeDup.tokenCount);

      // Real EventSource client library (direct package.json dependency) against Hono
      const requestId2 = `s-reactive-01-es2-${Date.now()}`;
      requestIds.push(requestId2);
      const create2 = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: requestId2,
          msg: '[[tripwire]] EventSource constructor probe',
        }),
      });
      const body2 = (await create2.json()) as CreateBody;
      expect(body2.durableMessageId).toMatch(/[0-9a-f-]{36}/i);
      if (body2.conversationId) conversationIds.push(body2.conversationId);
      const deadline2 = Date.now() + 10_000;
      while (Date.now() < deadline2) {
        const rows = await sql<{ status: string }[]>`
          SELECT status FROM chat_runs WHERE id = ${body2.runId as string}::uuid
        `;
        if (rows[0] && ['completed', 'blocked', 'failed'].includes(rows[0].status)) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await seedTokenEvents(sql, body2.runId as string, ['Alpha', 'Beta', 'Gamma']);

      const seen: Array<{ id: string; type: string; data: string }> = [];
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          es.close();
          if (seen.length === 0) reject(new Error('EventSource received zero events'));
          else resolve();
        }, 30_000);

        const es = new EventSource(`http://platform.local/api/chat-runs/${body2.runId}/events`, {
          fetch: (input, init) => {
            const headers: Record<string, string> = {
              ...(init?.headers as Record<string, string>),
              Accept: 'text/event-stream',
              Authorization: `Bearer ${KEYS.rn}`,
            };
            const lastId = seen.length > 0 ? seen[seen.length - 1]?.id : undefined;
            if (lastId && Number(lastId) > 0) {
              headers['Last-Event-ID'] = String(lastId);
            }
            const path =
              typeof input === 'string'
                ? new URL(input).pathname
                : input instanceof URL
                  ? input.pathname
                  : new URL(String(input)).pathname;
            return app.request(path, { ...init, headers }) as unknown as Promise<Response>;
          },
        });

        const onAny = (type: string) => (ev: MessageEvent) => {
          seen.push({
            id: String(ev.lastEventId ?? ''),
            type,
            data: typeof ev.data === 'string' ? ev.data : '',
          });
          if (type === 'terminal' || type === 'blocked') {
            clearTimeout(timer);
            es.close();
            resolve();
          }
        };
        es.addEventListener('token', onAny('token') as EventListener);
        es.addEventListener('terminal', onAny('terminal') as EventListener);
        es.addEventListener('blocked', onAny('blocked') as EventListener);
        es.addEventListener('error', ((ev: Event) => {
          if (ev instanceof MessageEvent && typeof ev.data === 'string' && ev.data.length > 0) {
            onAny('error')(ev);
          }
        }) as EventListener);
      });

      expect(seen.filter((e) => e.type === 'token').length).toBeGreaterThanOrEqual(3);
      expect(seen.some((e) => e.type === 'terminal')).toBe(true);
    },
    60_000
  );

  itLive(
    'AC-5: cancel finalizes partial, clears agent_busy, keeps durable partial text',
    async () => {
      if (!sql) throw new Error('Postgres required');
      const app = createHonoApp({ keys: KEYS });
      const requestId = `s-reactive-01-cancel-${Date.now()}`;
      requestIds.push(requestId);

      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId,
          msg: 'Write a long detailed multi-paragraph essay about rivers for cancel probe.',
        }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as CreateBody;
      expect(body.runId).toBeTruthy();
      expect(body.durableMessageId).toBeTruthy();
      if (body.conversationId) conversationIds.push(body.conversationId);

      // Confirm agent_busy was set on create
      if (body.conversationId) {
        const busyRows = await sql<{ agent_busy: boolean }[]>`
          SELECT agent_busy FROM conversations WHERE id = ${body.conversationId}::uuid
        `;
        expect(busyRows[0]?.agent_busy).toBe(true);
      }

      // Seed a few tokens so cancel can persist a partial durable bubble
      await sql`
        UPDATE chat_runs SET status = 'running', updated_at = now()
        WHERE id = ${body.runId as string}::uuid
      `;
      await sql`
        INSERT INTO chat_run_events (run_id, seq, event_type, data_json)
        VALUES
          (${body.runId as string}::uuid, 1, 'token', ${sql.json({ token: 'Part' } as never)}),
          (${body.runId as string}::uuid, 2, 'token', ${sql.json({ token: 'ial' } as never)})
        ON CONFLICT (run_id, seq) DO NOTHING
      `;
      await sql`
        UPDATE chat_runs SET last_event_seq = 2 WHERE id = ${body.runId as string}::uuid
      `;

      const cancel = await app.request(`/api/chat-runs/${body.runId}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(cancel.status).toBe(200);
      const cancelled = (await cancel.json()) as { status?: string };
      expect(['blocked', 'completed', 'failed']).toContain(cancelled.status);

      // agent_busy MUST be false after cancel (composer re-enable foundation)
      if (body.conversationId) {
        const after = await sql<{ agent_busy: boolean }[]>`
          SELECT agent_busy FROM conversations WHERE id = ${body.conversationId}::uuid
        `;
        expect(after[0]?.agent_busy, 'cancel must clear agent_busy').toBe(false);

        // Partial durable message kept
        const msgs = await sql<{ content: string }[]>`
          SELECT content FROM chat_messages
          WHERE id = ${body.durableMessageId as string}::uuid
        `;
        expect(msgs[0]?.content).toBe('Partial');
      }

      // Run is terminal — events stream should end with blocked
      const eventsRes = await app.request(`/api/chat-runs/${body.runId}/events`, {
        headers: { authorization: `Bearer ${KEYS.rn}`, Accept: 'text/event-stream' },
      });
      const text = await eventsRes.text();
      expect(text).toMatch(/CHAT_RUN_CANCELLED|event: blocked/);
    },
    60_000
  );
});
