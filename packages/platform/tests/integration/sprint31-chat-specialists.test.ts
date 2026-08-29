/**
 * S31-04 AC-1 [PRIMARY]: chat routes to real named specialists.
 * Proves routing from persisted chat_runs.role — not source-level map asserts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { SPECIALIST_NAMES } from '../../src/chat/specialists.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-04-rn', mcp: 's31-04-mcp', control: 's31-04-control' };
const EVIDENCE_DIR = join(process.cwd(), '.tmp/S31-04');
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';

const SPECIALIST_PROBES: { specialist: (typeof SPECIALIST_NAMES)[number]; msg: string }[] = [
  {
    specialist: 'knowledge',
    msg: '[specialist:knowledge] Search my knowledge base for saved notes about routing.',
  },
  {
    specialist: 'research',
    msg: '[specialist:research] Research the latest developments in agent frameworks.',
  },
  {
    specialist: 'podcast',
    msg: '[specialist:podcast] Summarize themes from a podcast about systems design.',
  },
  {
    specialist: 'commerce',
    msg: '[specialist:commerce] Shop for a mechanical keyboard under $100.',
  },
  {
    specialist: 'subscriptions',
    msg: '[specialist:subscriptions] List my content subscriptions and check for updates.',
  },
  { specialist: 'discovery', msg: "[specialist:discovery] What's new in AI tooling this week?" },
  {
    specialist: 'documents',
    msg: '[specialist:documents] Save a short document about specialist routing.',
  },
  {
    specialist: 'analysis',
    msg: '[specialist:analysis] Assimilate this repository architecture overview.',
  },
  {
    specialist: 'improvements',
    msg: '[specialist:improvements] Add an improvement request for chat routing.',
  },
  {
    specialist: 'planner',
    msg: '[specialist:planner] Create a multi-step plan to research and save findings.',
  },
];

type CreateBody = { runId: string; status: string; role: string };
type StatusBody = { status: string; role?: string; finalText?: string; error?: string };

async function pollTerminal(
  app: ReturnType<typeof createHonoApp>,
  runId: string,
  timeoutMs = 120_000
): Promise<StatusBody> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await app.request(`/api/chat-runs/${runId}`, {
      headers: { authorization: `Bearer ${KEYS.rn}` },
    });
    const body = (await res.json()) as StatusBody;
    if (['completed', 'blocked', 'failed'].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`chat run ${runId} did not reach terminal within ${timeoutMs}ms`);
}

describe('S31-04 AC-1: chatRoutesToRealSpecialists', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];

  beforeAll(async () => {
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
    'chatRoutesToRealSpecialists',
    async () => {
      // Preflight: health + fleet (fixture ten_specialist_probe_set)
      const app = createHonoApp({ keys: KEYS });
      const health = await app.request('/health');
      expect(health.status).toBe(200);

      const fleet = await fetch(`${FLEET_URL}/v1/models`).catch(() => null);
      expect(fleet?.status).toBe(200);

      const stamp = Date.now();
      const runIds: string[] = [];
      const labels: string[] = [];

      for (const probe of SPECIALIST_PROBES) {
        const requestId = `s31-04-ac1-${probe.specialist}-${stamp}`;
        requestIds.push(requestId);
        labels.push(probe.specialist);
        const create = await app.request('/api/chat-runs', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${KEYS.rn}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ requestId, msg: probe.msg }),
        });
        expect(create.status).toBe(200);
        const body = (await create.json()) as CreateBody;
        expect(body.runId).toMatch(/[0-9a-f-]{36}/i);
        runIds.push(body.runId);
      }

      const terminals: Array<{
        id: string;
        role: string;
        status: string;
        final_text: string | null;
        label: string;
      }> = [];

      for (let i = 0; i < runIds.length; i++) {
        const runId = runIds[i]!;
        const label = labels[i]!;
        await pollTerminal(app, runId);
        const rows = await sql!<
          {
            id: string;
            role: string;
            status: string;
            final_text: string | null;
          }[]
        >`
          SELECT id::text AS id, role, status, final_text
          FROM chat_runs WHERE id = ${runId}::uuid
        `;
        expect(rows.length).toBe(1);
        terminals.push({ ...rows[0]!, label });
      }

      writeFileSync(
        join(EVIDENCE_DIR, 'ac1-specialist-roles.json'),
        JSON.stringify({ at: new Date().toISOString(), terminals }, null, 2)
      );

      expect(terminals).toHaveLength(10);

      const roles = terminals.map((t) => t.role);
      const distinct = new Set(roles);
      expect(distinct.size).toBeGreaterThan(2);

      const outsideLegacy = roles.filter((r) => r !== 'divergent' && r !== 'convergent');
      expect(outsideLegacy.length).toBeGreaterThan(0);

      const allowed = new Set<string>(SPECIALIST_NAMES);
      for (const t of terminals) {
        expect(allowed.has(t.role)).toBe(true);
        expect(t.status).toBe('completed');
        expect((t.final_text ?? '').length).toBeGreaterThan(0);
      }

      // At least 8 roles match their labelled specialist.
      const matches = terminals.filter((t) => t.role === t.label).length;
      expect(matches).toBeGreaterThanOrEqual(8);

      // Negative: not all rows stuck on the old 2-role set.
      expect(roles.every((r) => r === 'divergent' || r === 'convergent')).toBe(false);
    },
    300_000
  );
});
