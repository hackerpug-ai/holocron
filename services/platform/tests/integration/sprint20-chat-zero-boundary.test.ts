/** Sprint 20 boundary proof: Hono chat runs persist messages on the Zero publication surface. */
// F1 (red-hat): every Sprint-20 POST uses the `[[tripwire]]` marker which
// short-circuits chat-runs.ts BEFORE the deterministic/fleet branch fires, so
// the nonprod-default flip (AC-1) does not affect this suite. No env opt-in
// needed here; sprint18 is the only suite that requires HOLO_CHAT_DETERMINISTIC_STREAM=1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client';
import { createHonoApp } from '../../src/http/hono-app';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's20-rn', mcp: 's20-mcp', control: 's20-control' };

type ChatRunBody = {
  runId: string;
  replay?: boolean;
  conversationId?: string;
};

describe('Sprint 20 chat/Zero boundary', () => {
  let sql: Sql | undefined;
  let conversationId: string | undefined;
  let createdConversationId: string | undefined;
  const requestId = `s20-zero-${Date.now()}`;
  const createRequestId = `s20-zero-create-${Date.now()}`;

  beforeAll(() => {
    if (PLATFORM_IT) sql = createSql(DATABASE_URL);
  });

  afterAll(async () => {
    if (!sql) return;
    if (conversationId) {
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
      await sql`DELETE FROM chat_messages WHERE conversation_id = ${conversationId}`;
      await sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`;
    }
    if (createdConversationId) {
      await sql`DELETE FROM chat_runs WHERE request_id = ${createRequestId}`;
      await sql`DELETE FROM chat_messages WHERE conversation_id = ${createdConversationId}`;
      await sql`DELETE FROM conversations WHERE id = ${createdConversationId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive('persists a Hono chat input on the Zero-published conversation surface', async () => {
    if (!sql) throw new Error('Postgres is required');
    conversationId = crypto.randomUUID();
    await sql`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (${conversationId}::uuid, 'Sprint 20 reference conversation', now(), now())
    `;
    const app = createHonoApp({ keys: KEYS });
    const response = await app.request('/api/chat-runs', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        msg: '[[tripwire]] Sprint 20 boundary probe',
        conversationId,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ChatRunBody;
    expect(body.runId).toMatch(/[0-9a-f-]{36}/);
    const replayResponse = await app.request('/api/chat-runs', {
      method: 'POST',
      headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        requestId,
        msg: '[[tripwire]] Sprint 20 boundary probe',
        conversationId,
      }),
    });
    expect(replayResponse.status).toBe(200);
    const replayBody = (await replayResponse.json()) as ChatRunBody;
    expect(replayBody.replay).toBe(true);
    const messages = await sql`
      SELECT role, content, conversation_id AS "conversationId"
      FROM chat_messages WHERE conversation_id = ${conversationId}
      ORDER BY created_at ASC
    `;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: '[[tripwire]] Sprint 20 boundary probe',
      conversationId,
    });
  });

  itLive(
    'creates and returns a durable conversation when the composer has no conversation ID',
    async () => {
      if (!sql) throw new Error('Postgres is required');
      const app = createHonoApp({ keys: KEYS });
      const response = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEYS.rn}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId: createRequestId,
          msg: '[[tripwire]] create a durable conversation for the new-chat composer',
        }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as ChatRunBody;
      expect(body.conversationId).toMatch(/[0-9a-f-]{36}/);
      if (!body.conversationId) throw new Error('chat run response omitted conversationId');
      createdConversationId = body.conversationId;

      const [conversation] = await sql`
      SELECT id, title, last_message_preview AS "lastMessagePreview"
      FROM conversations WHERE id = ${createdConversationId}::uuid
    `;
      expect(conversation).toMatchObject({
        id: createdConversationId,
        title: '[[tripwire]] create a durable conversation for the new-chat composer',
        lastMessagePreview: '[[tripwire]] create a durable conversation for the new-chat composer',
      });

      const messages = await sql`
      SELECT role, content FROM chat_messages
      WHERE conversation_id = ${createdConversationId}
      ORDER BY created_at ASC
    `;
      expect(messages).toEqual([
        {
          role: 'user',
          content: '[[tripwire]] create a durable conversation for the new-chat composer',
        },
      ]);
    }
  );
});
