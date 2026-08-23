/**
 * Wave 6 — async deep_research / quick_research MCP tools + HTTP cancel.
 *
 * Fail-closed: throws in beforeAll if PG / PLATFORM_IT / fleet missing.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     FLEET_URL=http://127.0.0.1:4545/v1 \
 *     pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-mcp-tools.test.ts
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';
import { executePostgresMcpTool } from '../../src/mcp/executor.ts';
import { getToolSchema, resolveToolId } from '../../src/tools/registry.ts';
import {
  deepResearchControlOutputSchema,
  deepResearchOutputSchema,
  deepResearchResultOutputSchema,
  getResearchSessionOutputSchema,
  quickResearchOutputSchema,
} from '../../src/tools/schemas/research.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';
const FLEET_URL = process.env.FLEET_URL?.trim() ?? '';
const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const KEYS = { rn: 'wave6-rn', mcp: 'wave6-mcp', control: 'wave6-control' };

describe('Wave 6 research MCP tools', () => {
  let sql: Sql;
  const cleanupSessionIds: string[] = [];

  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'research-mcp-tools requires PLATFORM_IT=1 — refusing skip-to-green for Wave 6 MCP surface'
      );
    }
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error(
        `DATABASE_URL must target holocron_nonprod (got ${DATABASE_URL}). Refusing to run.`
      );
    }
    if (!FLEET_URL) {
      throw new Error('research-mcp-tools requires FLEET_URL (already includes /v1)');
    }

    try {
      const fleet = await fetch(FLEET_URL.replace(/\/v1\/?$/, '/v1/models'), {
        signal: AbortSignal.timeout(5_000),
      });
      if (!fleet.ok) {
        throw new Error(`fleet /models returned HTTP ${fleet.status}`);
      }
    } catch (err) {
      throw new Error(
        `Fleet unreachable at ${FLEET_URL}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    try {
      sql = createSql(DATABASE_URL);
      await sql`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Postgres unreachable for ${DATABASE_URL}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    for (const id of cleanupSessionIds) {
      await sql`DELETE FROM research_iterations WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_sessions WHERE id = ${id}::uuid`.catch(() => undefined);
    }
    await sql.end({ timeout: 5 }).catch(() => undefined);
  });

  it('TOOL_ID_ALIASES does not shadow deep_research or quick_research', () => {
    const src = readFileSync(resolve(REPO_ROOT, 'services/platform/src/tools/registry.ts'), 'utf8');
    expect(src).not.toMatch(/quick_research\s*:\s*['"]search_research['"]/);
    expect(src).not.toMatch(/deep_research\s*:\s*['"]get_research_session['"]/);
    expect(resolveToolId('deep_research')).toBe('deep_research');
    expect(resolveToolId('quick_research')).toBe('quick_research');
    expect(getToolSchema('deep_research').inputSchema).toBeDefined();
    expect(getToolSchema('quick_research').inputSchema).toBeDefined();
  });

  it('output schemas are bare ZodObject (gateway-safe)', () => {
    expect(deepResearchOutputSchema).toBeInstanceOf(z.ZodObject);
    expect(quickResearchOutputSchema).toBeInstanceOf(z.ZodObject);
    expect(deepResearchResultOutputSchema).toBeInstanceOf(z.ZodObject);
    expect(deepResearchControlOutputSchema).toBeInstanceOf(z.ZodObject);
    expect(getResearchSessionOutputSchema).toBeInstanceOf(z.ZodObject);
    // Must not be top-level nullable (gateway drops .nullable()).
    expect(getResearchSessionOutputSchema).not.toBeInstanceOf(z.ZodNullable);
  });

  it('deep_research kickoff returns sessionId in <2s and writes a real DB row', async () => {
    const topic = `wave6-deep-${randomUUID().slice(0, 8)} async MCP kickoff`;
    const started = Date.now();
    const result = (await executePostgresMcpTool(
      'deep_research',
      { topic, mode: 'depth', maxRounds: 2, focus: ['latency', 'cancel-latch'] },
      { databaseUrl: DATABASE_URL }
    )) as Record<string, unknown>;
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(2_000);
    expect(typeof result.sessionId).toBe('string');
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.status).toBeTruthy();
    expect(result.mode).toBe('depth');
    expect(typeof result.pollAfterMs).toBe('number');
    expect(typeof result.estimatedMs).toBe('number');
    expect(deepResearchOutputSchema.safeParse(result).success).toBe(true);

    const sessionId = String(result.sessionId);
    cleanupSessionIds.push(sessionId);

    const rows = await sql<{ id: string; status: string; topic: string | null }[]>`
      SELECT id::text AS id, status, topic FROM research_sessions WHERE id = ${sessionId}::uuid
    `;
    expect(rows[0]?.id).toBe(sessionId);
    expect(rows[0]?.topic).toBe(topic);
    expect([
      'queued',
      'running',
      'completed',
      'cancelled',
      'failed',
      'paused',
      'pending',
    ]).toContain(rows[0]?.status);
  }, 30_000);

  it('deep_research_result poll shows real status/phase/iteration consistent with DB', async () => {
    const topic = `wave6-poll-${randomUUID().slice(0, 8)}`;
    const kickoff = (await executePostgresMcpTool(
      'deep_research',
      { topic, mode: 'depth', maxRounds: 2 },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string };
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    let snapshot: Record<string, unknown> | null = null;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      snapshot = (await executePostgresMcpTool(
        'deep_research_result',
        { sessionId, waitMs: 0, includeFindings: true },
        { databaseUrl: DATABASE_URL }
      )) as Record<string, unknown>;
      const last = snapshot.lastIteration as { summary?: string; n?: number } | undefined;
      if (
        last &&
        typeof last.summary === 'string' &&
        last.summary.length > 0 &&
        !/placeholder|TODO|coming soon/i.test(last.summary)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    expect(snapshot).toBeTruthy();
    expect(snapshot?.sessionId).toBe(sessionId);
    expect(typeof snapshot?.status).toBe('string');
    expect(String(snapshot?.status).length).toBeGreaterThan(0);
    expect(typeof snapshot?.terminal).toBe('boolean');
    expect(snapshot?.mode).toBe('depth');
    expect(snapshot?.progress).toMatchObject({
      round: expect.any(Number),
      maxRounds: expect.any(Number),
      elapsedMs: expect.any(Number),
    });
    expect(typeof snapshot?.elapsedMs).toBe('number');
    expect(typeof snapshot?.nextPollAfterMs).toBe('number');
    expect(snapshot?.gate).toMatchObject({
      admitted: expect.any(Boolean),
      reasonCode: expect.any(String),
    });
    const lastIteration = snapshot?.lastIteration as {
      n: number;
      summary: string;
      feedback: string;
    };
    expect(lastIteration.n).toBeGreaterThanOrEqual(1);
    expect(lastIteration.summary.length).toBeGreaterThan(0);
    expect(lastIteration.feedback.length).toBeGreaterThan(0);
    expect(deepResearchResultOutputSchema.safeParse(snapshot).success).toBe(true);

    const db = await sql<
      { status: string; phase: string | null; current_iteration: number | null }[]
    >`
      SELECT status, phase, current_iteration FROM research_sessions WHERE id = ${sessionId}::uuid
    `;
    expect(db[0]?.status).toBe(snapshot?.status);
    if (snapshot?.phase) {
      expect(db[0]?.phase).toBe(snapshot.phase);
    }
    const iterCount = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM research_iterations WHERE session_id = ${sessionId}::uuid
    `;
    expect(iterCount[0]?.c).toBeGreaterThanOrEqual(1);
  }, 45_000);

  it('HTTP POST /api/research/:id/cancel sets cancelled and stays cancelled', async () => {
    const topic = `wave6-http-cancel-${randomUUID().slice(0, 8)}`;
    const kickoff = (await executePostgresMcpTool(
      'deep_research',
      { topic, mode: 'breadth', maxRounds: 5 },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string };
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    const app = createHonoApp({ keys: KEYS });
    const res = await app.request(`/api/research/${sessionId}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEYS.rn}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.sessionId).toBe(sessionId);
    expect(body.status).toBe('cancelled');
    expect(typeof body.cancelRequestedAt).toBe('string');

    const db = await sql<{ status: string; cancel_requested_at: Date | string | null }[]>`
      SELECT status, cancel_requested_at FROM research_sessions WHERE id = ${sessionId}::uuid
    `;
    expect(db[0]?.status).toBe('cancelled');
    expect(db[0]?.cancel_requested_at).toBeTruthy();

    // Terminal latch: running must not clobber cancelled.
    await sql`
      UPDATE research_sessions SET status = 'cancelled', updated_at = now()
      WHERE id = ${sessionId}::uuid
    `;
    const { updateResearchSessionStatus } = await import('../../src/research/session-writer.ts');
    const latched = await updateResearchSessionStatus(sessionId, 'running', {
      databaseUrl: DATABASE_URL,
    });
    expect(latched.ok).toBe(true);
    if (latched.ok) {
      expect(latched.status).toBe('cancelled');
      expect(latched.latched).toBe(true);
    }
  }, 30_000);

  it('deep_research_control cancel is accepted and idempotent by controlRequestKey', async () => {
    const topic = `wave6-ctrl-cancel-${randomUUID().slice(0, 8)}`;
    const kickoff = (await executePostgresMcpTool(
      'quick_research',
      { topic },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string; mode: string };
    expect(kickoff.mode).toBe('quick');
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    const controlRequestKey = `wave6-${createHash('sha256').update(sessionId).digest('hex').slice(0, 12)}`;
    const first = (await executePostgresMcpTool(
      'deep_research_control',
      { sessionId, action: 'cancel', controlRequestKey },
      { databaseUrl: DATABASE_URL }
    )) as Record<string, unknown>;
    expect(first.accepted).toBe(true);
    expect(first.action).toBe('cancel');
    expect(first.status).toBe('cancelled');
    expect(first.replay).toBe(false);
    expect(deepResearchControlOutputSchema.safeParse(first).success).toBe(true);

    const second = (await executePostgresMcpTool(
      'deep_research_control',
      { sessionId, action: 'cancel', controlRequestKey },
      { databaseUrl: DATABASE_URL }
    )) as Record<string, unknown>;
    expect(second.accepted).toBe(true);
    expect(second.replay).toBe(true);
    expect(second.status).toBe('cancelled');

    const db = await sql<{ status: string }[]>`
      SELECT status FROM research_sessions WHERE id = ${sessionId}::uuid
    `;
    expect(db[0]?.status).toBe('cancelled');
  }, 30_000);
});
