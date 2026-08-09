/**
 * S31-04 AC-2: specialist least-privilege tool grants persist and resolve.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';
import { getTool } from '../../src/tools/registry.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-04-grants-rn', mcp: 's31-04-grants-mcp', control: 's31-04-grants-ctl' };
const EVIDENCE_DIR = join(process.cwd(), '.tmp/S31-04');

const KNOWLEDGE_TOOLS = [
  'search_knowledge_base',
  'browse_category',
  'knowledge_base_stats',
  'get_document',
] as const;
const COMMERCE_TOOLS = ['shop_search'] as const;

type CreateBody = { runId: string; status: string; role: string };

async function pollTerminal(
  app: ReturnType<typeof createHonoApp>,
  runId: string,
  timeoutMs = 120_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.request(`/api/chat-runs/${runId}`, {
      headers: { authorization: `Bearer ${KEYS.rn}` },
    });
    const body = (await res.json()) as { status: string };
    if (['completed', 'blocked', 'failed'].includes(body.status)) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`chat run ${runId} did not reach terminal within ${timeoutMs}ms`);
}

function parseGrantTools(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const tools = (data as { tools?: unknown }).tools;
  return Array.isArray(tools) ? tools.map(String) : [];
}

describe('S31-04 AC-2: specialistToolGrantsAreLeastPrivilege', () => {
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
    'specialistToolGrantsAreLeastPrivilege',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const stamp = Date.now();

      const probes = [
        {
          key: 'knowledge',
          requestId: `s31-04-ac2-knowledge-${stamp}`,
          msg: '[specialist:knowledge] Search my knowledge base for grant-check docs.',
          expected: KNOWLEDGE_TOOLS,
        },
        {
          key: 'commerce',
          requestId: `s31-04-ac2-commerce-${stamp}`,
          msg: '[specialist:commerce] Shop search for a USB-C hub under $50.',
          expected: COMMERCE_TOOLS,
        },
      ] as const;

      const evidence: Record<string, unknown> = {};

      for (const probe of probes) {
        requestIds.push(probe.requestId);
        const create = await app.request('/api/chat-runs', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${KEYS.rn}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ requestId: probe.requestId, msg: probe.msg }),
        });
        expect(create.status).toBe(200);
        const body = (await create.json()) as CreateBody;
        expect(body.role).toBe(probe.key);
        await pollTerminal(app, body.runId);

        const grantRows = await sql!<{ data_json: unknown }[]>`
          SELECT data_json FROM chat_run_events
          WHERE run_id = ${body.runId}::uuid AND event_type = 'tool_grants'
          ORDER BY seq ASC
          LIMIT 1
        `;
        expect(grantRows.length).toBe(1);
        const granted = parseGrantTools(grantRows[0]!.data_json);
        expect(granted).toHaveLength(probe.expected.length);
        expect([...granted].sort()).toEqual([...probe.expected].sort());
        expect(granted).not.toContain('chat_context');

        for (const id of granted) {
          expect(() => getTool(id)).not.toThrow();
        }

        evidence[probe.key] = { role: body.role, granted, runId: body.runId };
      }

      // Commerce must not receive knowledge tools.
      const commerceGranted = (evidence.commerce as { granted: string[] }).granted;
      for (const k of KNOWLEDGE_TOOLS) {
        expect(commerceGranted).not.toContain(k);
      }

      writeFileSync(
        join(EVIDENCE_DIR, 'ac2-tool-grants.json'),
        JSON.stringify({ at: new Date().toISOString(), evidence }, null, 2)
      );
    },
    180_000
  );
});
