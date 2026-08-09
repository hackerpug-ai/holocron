/**
 * S31-04 AC-5: chat completes with Convex credentials revoked / unreachable.
 * Lane: live (e2e) — PLATFORM_IT=1 pnpm test:live
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';

const itLive = PLATFORM_IT ? it : it.skip;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://127.0.0.1:5432/holocron_nonprod';
const KEYS = { rn: 's31-04-nocx-rn', mcp: 's31-04-nocx-mcp', control: 's31-04-nocx-ctl' };
const EVIDENCE_DIR = join(process.cwd(), '.tmp/S31-04');
const REPO = process.cwd();
const FLEET_URL = process.env.FLEET_URL ?? 'http://127.0.0.1:4545';

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

describe('S31-04 AC-5: chatSurvivesConvexRevocation', () => {
  let sql: Sql | undefined;
  const requestIds: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};
  const convexHosts = ['.convex.cloud', '.convex.site'];
  let convexRequestCount = 0;
  let origFetch: typeof globalThis.fetch;

  beforeAll(() => {
    if (!PLATFORM_IT) return;
    sql = createSql(DATABASE_URL);
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    // Revoke Convex credentials and point hosts at a closed port.
    for (const key of [
      'CONVEX_URL',
      'CONVEX_SITE_URL',
      'CONVEX_DEPLOY_KEY',
      'CONVEX_SELF_HOSTED_URL',
      'CONVEX_SELF_HOSTED_ADMIN_KEY',
      'NEXT_PUBLIC_CONVEX_URL',
      'VITE_CONVEX_URL',
      'EXPO_PUBLIC_CONVEX_URL',
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    process.env.CONVEX_URL = 'http://127.0.0.1:9';
    process.env.CONVEX_SITE_URL = 'http://127.0.0.1:9';

    origFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (convexHosts.some((h) => url.includes(h)) || url.includes('127.0.0.1:9')) {
        if (convexHosts.some((h) => url.includes(h))) convexRequestCount += 1;
      }
      return origFetch(input, init);
    }) as typeof globalThis.fetch;
  });

  afterAll(async () => {
    if (origFetch) globalThis.fetch = origFetch;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (!sql) return;
    for (const requestId of requestIds) {
      await sql`DELETE FROM chat_run_events WHERE run_id IN (SELECT id FROM chat_runs WHERE request_id = ${requestId})`;
      await sql`DELETE FROM chat_runs WHERE request_id = ${requestId}`;
    }
    await sql.end({ timeout: 5 });
  });

  itLive(
    'chatSurvivesConvexRevocation',
    async () => {
      const app = createHonoApp({ keys: KEYS });
      const health = await app.request('/health');
      expect(health.status).toBe(200);
      const fleet = await fetch(`${FLEET_URL}/v1/models`).catch(() => null);
      expect(fleet?.status).toBe(200);

      const requestId = `s31-04-ac5-nocx-${Date.now()}`;
      requestIds.push(requestId);
      convexRequestCount = 0;

      const create = await app.request('/api/chat-runs', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${KEYS.rn}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          msg: '[specialist:knowledge] Answer in one short sentence: what is specialist routing?',
        }),
      });
      expect(create.status).toBe(200);
      const body = (await create.json()) as CreateBody;
      const final = await pollTerminal(app, body.runId);

      const row = (
        await sql!<
          {
            status: string;
            role: string;
            final_text: string | null;
          }[]
        >`
          SELECT status, role, final_text FROM chat_runs WHERE id = ${body.runId}::uuid
        `
      )[0]!;

      // Module-graph scan: no runtime import of convex/ under chat path.
      let convexImportHits = 0;
      try {
        const out = execSync(
          `rg -n "from ['\\"]convex/|require\\(['\\"]convex/" services/platform/src/chat services/platform/src/http/chat-runs.ts services/platform/src/mastra/processors || true`,
          { encoding: 'utf8', cwd: REPO }
        );
        convexImportHits = out
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0).length;
      } catch {
        convexImportHits = 0;
      }

      const evidence = {
        at: new Date().toISOString(),
        run: row,
        api: final,
        convexRequestCount,
        convexImportHits,
        env: {
          CONVEX_URL: process.env.CONVEX_URL,
          CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
        },
      };
      writeFileSync(join(EVIDENCE_DIR, 'ac5-no-convex.json'), JSON.stringify(evidence, null, 2));

      expect(row.status).toBe('completed');
      expect((row.final_text ?? '').length).toBeGreaterThan(0);
      expect(row.role).not.toBe('divergent');
      expect(row.role).not.toBe('convergent');
      expect(convexRequestCount).toBe(0);
      expect(convexImportHits).toBe(0);
      expect(final.status).toBe('completed');
    },
    180_000
  );
});
