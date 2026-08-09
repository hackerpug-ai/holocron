/**
 * S31-04 AC-3: steps_used reflects the real agent loop; maxSteps terminates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-04-loop-rn', mcp: 's31-04-loop-mcp', control: 's31-04-loop-ctl' };
const EVIDENCE_DIR = join(process.cwd(), '.tmp/S31-04');
const DOC_TITLE = `S31-04-loop-doc-${Date.now()}`;

type CreateBody = { runId: string; status: string; role: string };
type StatusBody = { status: string; stepsUsed?: number; maxSteps?: number; finalText?: string };

async function pollTerminal(
  app: ReturnType<typeof createHonoApp>,
  runId: string,
  timeoutMs = 180_000
): Promise<StatusBody> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.request(`/api/chat-runs/${runId}`, {
      headers: { authorization: `Bearer ${KEYS.rn}` },
    });
    const body = (await res.json()) as StatusBody;
    if (['completed', 'blocked', 'failed'].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`chat run ${runId} did not reach terminal within ${timeoutMs}ms`);
}

describe('S31-04 AC-3: stepsUsedReflectsTheRealLoop', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];
  let documentId: string | undefined;

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
    if (documentId) {
      await sql`DELETE FROM documents WHERE id = ${documentId}::uuid`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'stepsUsedReflectsTheRealLoop',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const stamp = Date.now();

      // Seed a real document the knowledge specialist must find + read.
      const docRes = await app.request('/api/documents', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: DOC_TITLE,
          content: `Integration seed for tool-loop AC-3. Title marker: ${DOC_TITLE}. Body explains S31-04 chat steps.`,
          category: 'general',
        }),
      });
      expect([200, 201]).toContain(docRes.status);
      const docBody = (await docRes.json()) as { document?: { id: string; title: string } };
      documentId = docBody.document?.id;
      expect(documentId).toBeTruthy();

      // Case 1: two-tool message (search then get_document).
      const twoToolRequestId = `s31-04-ac3-two-tool-${stamp}`;
      requestIds.push(twoToolRequestId);
      const twoToolMsg =
        `[specialist:knowledge] First call search_knowledge_base with query "${DOC_TITLE}". ` +
        `Then call get_document with documentId "${documentId}". ` +
        `Finally reply with the document title ${DOC_TITLE} quoted verbatim. ` +
        'Use tools then write a short final answer (do not only call tools).';
      const createTwo = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestId: twoToolRequestId, msg: twoToolMsg, maxSteps: 6 }),
      });
      expect(createTwo.status).toBe(200);
      const twoBody = (await createTwo.json()) as CreateBody;
      const twoFinal = await pollTerminal(app, twoBody.runId);

      const twoRow = (
        await sql!<
          {
            steps_used: number;
            max_steps: number;
            status: string;
            final_text: string | null;
          }[]
        >`
          SELECT steps_used, max_steps, status, final_text
          FROM chat_runs WHERE id = ${twoBody.runId}::uuid
        `
      )[0]!;

      const toolCallEvents = await sql!<{ cnt: string }[]>`
        SELECT count(*)::text AS cnt FROM chat_run_events
        WHERE run_id = ${twoBody.runId}::uuid AND event_type = 'tool-call'
      `;
      const toolCallCount = Number(toolCallEvents[0]?.cnt ?? 0);

      // Case 2: max_steps=2 bound against a multi-tool task.
      const boundRequestId = `s31-04-ac3-maxsteps-${stamp}`;
      requestIds.push(boundRequestId);
      const boundMsg =
        `[specialist:knowledge] Perform at least 4 sequential tool calls: ` +
        `search_knowledge_base for "${DOC_TITLE}", get_document, browse_category, knowledge_base_stats, ` +
        'then another search. Never finish early.';
      const createBound = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ requestId: boundRequestId, msg: boundMsg, maxSteps: 2 }),
      });
      expect(createBound.status).toBe(200);
      const boundBody = (await createBound.json()) as CreateBody;
      await pollTerminal(app, boundBody.runId);

      const boundRow = (
        await sql!<
          {
            steps_used: number;
            max_steps: number;
            status: string;
          }[]
        >`
          SELECT steps_used, max_steps, status FROM chat_runs WHERE id = ${boundBody.runId}::uuid
        `
      )[0]!;

      const boundTerminal = await sql!<{ data_json: unknown }[]>`
        SELECT data_json FROM chat_run_events
        WHERE run_id = ${boundBody.runId}::uuid AND event_type IN ('terminal', 'blocked')
        ORDER BY seq DESC LIMIT 1
      `;

      const evidence = {
        at: new Date().toISOString(),
        documentId,
        docTitle: DOC_TITLE,
        twoTool: {
          runId: twoBody.runId,
          status: twoRow.status,
          steps_used: twoRow.steps_used,
          max_steps: twoRow.max_steps,
          toolCallCount,
          final_text: twoRow.final_text,
          api: twoFinal,
        },
        maxStepsBound: {
          runId: boundBody.runId,
          status: boundRow.status,
          steps_used: boundRow.steps_used,
          max_steps: boundRow.max_steps,
          terminal: boundTerminal[0]?.data_json ?? null,
        },
      };
      writeFileSync(join(EVIDENCE_DIR, 'ac3-tool-loop.json'), JSON.stringify(evidence, null, 2));

      // Case 1 oracles
      expect(twoRow.status).toBe('completed');
      expect(twoRow.steps_used).toBeGreaterThanOrEqual(2);
      expect(toolCallCount).toBeGreaterThanOrEqual(2);
      expect((twoRow.final_text ?? '').length).toBeGreaterThan(0);
      expect(twoRow.final_text ?? '').toContain(DOC_TITLE);
      // steps_used must not stay hardcoded at 1 when multiple tool-calls happened
      expect(!(twoRow.steps_used === 1 && toolCallCount >= 2)).toBe(true);

      // Case 2 oracles
      expect(boundRow.steps_used).toBe(2);
      expect(boundRow.steps_used).toBe(boundRow.max_steps);
      expect(boundRow.steps_used).toBeLessThanOrEqual(boundRow.max_steps);
      const terminalPayload = JSON.stringify(boundTerminal[0]?.data_json ?? {});
      expect(terminalPayload).toMatch(/max_steps|maxSteps/i);
      expect(terminalPayload).toMatch(/2/);
    },
    360_000
  );
});
