/**
 * S31-04 AC-4: real processor abort → typed blocked outcome.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';
import {
  CHAT_POLICY_BLOCK_TOKEN,
  CHAT_POLICY_PROCESSOR_ID,
} from '../../src/mastra/processors/chat-policy-block.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-04-block-rn', mcp: 's31-04-block-mcp', control: 's31-04-block-ctl' };
const EVIDENCE_DIR = join(process.cwd(), '.tmp/S31-04');
const REPO = process.cwd();

type CreateBody = { runId: string; conversationId?: string; status: string };
type StatusBody = { status: string; errorCode?: string; finalText?: string };

async function pollTerminal(
  app: ReturnType<typeof createHonoApp>,
  runId: string,
  timeoutMs = 60_000
): Promise<StatusBody> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.request(`/api/chat-runs/${runId}`, {
      headers: { authorization: `Bearer ${KEYS.rn}` },
    });
    const body = (await res.json()) as StatusBody;
    if (['completed', 'blocked', 'failed'].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`chat run ${runId} did not reach terminal within ${timeoutMs}ms`);
}

function countRg(pattern: string, path: string): number {
  try {
    const out = execSync(
      `rg -n --glob '!*test*' --glob '!*__tests__*' ${JSON.stringify(pattern)} ${JSON.stringify(path)} || true`,
      {
        encoding: 'utf8',
        cwd: REPO,
      }
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}

describe('S31-04 AC-4: processorAbortProducesTypedBlocked', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];

  beforeAll(() => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  afterAll(async () => {
    if (!sql) return;
    for (const requestId of requestIds) {
      await sql`DELETE FROM chat_run_events WHERE run_id IN (SELECT id FROM chat_runs WHERE request_id = ${requestId})`;
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'processorAbortProducesTypedBlocked',
    async () => {
      const tripwireLiteralCount = countRg(
        '\\[\\[tripwire\\]\\]',
        'packages/platform/src/http/chat-runs.ts'
      );
      const inputProcessorsHits = countRg('inputProcessors', 'packages/platform/src');

      const app = createHonoApp({ keys: KEYS });
      const requestId = `s31-04-ac4-block-${Date.now()}`;
      requestIds.push(requestId);

      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          msg: `${CHAT_POLICY_BLOCK_TOKEN} [specialist:knowledge] this must be blocked by the chat policy processor`,
        }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as CreateBody;
      const final = await pollTerminal(app, body.runId);

      const runRow = (
        await sql!<
          {
            status: string;
            error_code: string | null;
            conversation_id: string | null;
            final_text: string | null;
          }[]
        >`
          SELECT status, error_code, conversation_id, final_text
          FROM chat_runs WHERE id = ${body.runId}::uuid
        `
      )[0]!;

      const agentMessages = await sql!<{ cnt: string }[]>`
        SELECT count(*)::text AS cnt FROM chat_messages
        WHERE conversation_id::text = ${runRow.conversation_id ?? ''}
          AND role = 'agent'
      `;
      const toolCalls = await sql!<{ cnt: string }[]>`
        SELECT count(*)::text AS cnt FROM chat_run_events
        WHERE run_id = ${body.runId}::uuid AND event_type = 'tool-call'
      `;
      const blockedEvents = await sql!<{ data_json: unknown }[]>`
        SELECT data_json FROM chat_run_events
        WHERE run_id = ${body.runId}::uuid AND event_type = 'blocked'
        ORDER BY seq ASC
      `;
      const conv = runRow.conversation_id
        ? (
            await sql!<{ agent_busy: boolean }[]>`
              SELECT agent_busy FROM conversations WHERE id::text = ${runRow.conversation_id}
            `
          )[0]
        : null;

      const evidence = {
        at: new Date().toISOString(),
        tripwireLiteralCount,
        inputProcessorsHits,
        run: runRow,
        api: final,
        agentMessageCount: Number(agentMessages[0]?.cnt ?? 0),
        toolCallCount: Number(toolCalls[0]?.cnt ?? 0),
        blockedEvents: blockedEvents.map((e) => e.data_json),
        agent_busy: conv?.agent_busy ?? null,
      };
      writeFileSync(join(EVIDENCE_DIR, 'ac4-blocked.json'), JSON.stringify(evidence, null, 2));

      expect(tripwireLiteralCount).toBe(0);
      expect(inputProcessorsHits).toBeGreaterThanOrEqual(1);

      expect(runRow.status).toBe('blocked');
      expect(runRow.error_code).toBe('CHAT_PROCESSOR_BLOCKED');
      expect(final.status).toBe('blocked');
      expect(final.errorCode).toBe('CHAT_PROCESSOR_BLOCKED');

      expect(blockedEvents.length).toBeGreaterThanOrEqual(1);
      const payload = JSON.stringify(blockedEvents[0]?.data_json ?? {});
      expect(payload).toContain(CHAT_POLICY_PROCESSOR_ID);

      expect(Number(agentMessages[0]?.cnt ?? 0)).toBe(0);
      expect(Number(toolCalls[0]?.cnt ?? 0)).toBe(0);
      expect(conv?.agent_busy).toBe(false);
    },
    90_000
  );
});
