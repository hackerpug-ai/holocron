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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getSecretValue } from '../../src/config/secrets.ts';
import { createDb, createSql, type Sql } from '../../src/db/client.ts';
import { createHonoApp } from '../../src/http/hono-app.ts';
import { embedRun } from '../../src/inference/embed-run.ts';
import { executePostgresMcpTool } from '../../src/mcp/executor.ts';
import { rrfHybridSearch } from '../../src/search/rrf.ts';
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

    process.env.DATABASE_URL = DATABASE_URL;
    process.env.FLEET_URL = FLEET_URL;
    const jina = getSecretValue('JINA_API_KEY') || process.env.JINA_API_KEY;
    const exa = getSecretValue('EXA_API_KEY') || process.env.EXA_API_KEY;
    if (!jina) throw new Error('research-mcp-tools requires JINA_API_KEY');
    if (!exa) throw new Error('research-mcp-tools requires EXA_API_KEY');
    if (!process.env.FLEET_KEY) {
      process.env.FLEET_KEY = getSecretValue('FLEET_KEY') || 'sk-none';
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
      let docs: Array<{ document_id: string | null }> = [];
      try {
        docs = await sql<{ document_id: string | null }[]>`
          SELECT document_id::text AS document_id FROM research_sessions WHERE id = ${id}::uuid
        `;
      } catch {
        docs = [];
      }
      await sql`DELETE FROM research_web_calls WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM citations WHERE session_id = ${id}::uuid`.catch(() => undefined);
      await sql`DELETE FROM research_findings WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_iterations WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_sessions WHERE id = ${id}::uuid`.catch(() => undefined);
      for (const d of docs) {
        const documentId = d.document_id;
        if (!documentId) continue;
        await sql`DELETE FROM passages WHERE document_id = ${documentId}`.catch(() => undefined);
        await sql`DELETE FROM sources WHERE document_id = ${documentId}`.catch(() => undefined);
        await sql`DELETE FROM documents WHERE id = ${documentId}::uuid`.catch(() => undefined);
      }
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

    // Do not leave a depth workflow competing for the fleet during later tests.
    await executePostgresMcpTool(
      'deep_research_control',
      { sessionId, action: 'cancel', controlRequestKey: `wave6-kickoff-${sessionId.slice(0, 8)}` },
      { databaseUrl: DATABASE_URL }
    );
  }, 30_000);

  it('deep_research_result poll shows real status/phase/iteration consistent with DB', async () => {
    const topic = `wave6-poll-${randomUUID().slice(0, 8)} What is reciprocal rank fusion?`;
    const kickoff = (await executePostgresMcpTool(
      'quick_research',
      { topic },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string };
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    let snapshot: Record<string, unknown> | null = null;
    const deadline = Date.now() + 200_000;
    while (Date.now() < deadline) {
      snapshot = (await executePostgresMcpTool(
        'deep_research_result',
        { sessionId, waitMs: 0, includeFindings: true },
        { databaseUrl: DATABASE_URL }
      )) as Record<string, unknown>;
      const last = snapshot.lastIteration as { summary?: string; n?: number } | undefined;
      if (
        snapshot.terminal === true &&
        last &&
        typeof last.summary === 'string' &&
        last.summary.length > 0 &&
        !/placeholder|TODO|coming soon/i.test(last.summary)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    expect(snapshot).toBeTruthy();
    expect(snapshot?.sessionId).toBe(sessionId);
    expect(typeof snapshot?.status).toBe('string');
    expect(String(snapshot?.status).length).toBeGreaterThan(0);
    expect(typeof snapshot?.terminal).toBe('boolean');
    expect(snapshot?.mode).toBe('quick');
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

    const seedHits = await sql<{ url: string }[]>`
      SELECT COALESCE(src->>'url', '') AS url
      FROM research_iterations,
           LATERAL jsonb_array_elements(COALESCE(sources, '[]'::jsonb)) AS src
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(seedHits.some((r) => /holocron\.local/i.test(r.url))).toBe(false);
  }, 240_000);

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

  it('kickoff does not insert holocron.local seed iterations', async () => {
    const topic = `wave6-noseed-${randomUUID().slice(0, 8)} What is reciprocal rank fusion?`;
    const kickoff = (await executePostgresMcpTool(
      'quick_research',
      { topic },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string };
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    await new Promise((r) => setTimeout(r, 1500));
    const sources = await sql<{ url: string }[]>`
      SELECT COALESCE(src->>'url', '') AS url
      FROM research_iterations,
           LATERAL jsonb_array_elements(COALESCE(sources, '[]'::jsonb)) AS src
      WHERE session_id = ${sessionId}::uuid
    `;
    expect(sources.some((r) => /holocron\.local/i.test(r.url))).toBe(false);
    const summaries = await sql<{ summary: string | null }[]>`
      SELECT summary FROM research_iterations WHERE session_id = ${sessionId}::uuid
    `;
    expect(summaries.some((r) => /kickoff-seed/i.test(r.summary ?? ''))).toBe(false);
  }, 30_000);

  it('live MCP question writes real gate JSON, publishes document_id, rrf-hits report', async () => {
    const nonce = `live-rrf-${randomUUID().slice(0, 8)}`;
    const topic = `${nonce} What is reciprocal rank fusion in information retrieval?`;
    const kickoff = (await executePostgresMcpTool(
      'quick_research',
      { topic },
      { databaseUrl: DATABASE_URL }
    )) as { sessionId: string; mode: string };
    expect(kickoff.mode).toBe('quick');
    const sessionId = kickoff.sessionId;
    cleanupSessionIds.push(sessionId);

    let snapshot: Record<string, unknown> | null = null;
    const deadline = Date.now() + 280_000;
    while (Date.now() < deadline) {
      snapshot = (await executePostgresMcpTool(
        'deep_research_result',
        { sessionId, waitMs: 0, includeFindings: true },
        { databaseUrl: DATABASE_URL }
      )) as Record<string, unknown>;
      if (snapshot.terminal === true) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    expect(snapshot?.terminal).toBe(true);
    expect(
      String(snapshot?.gate && (snapshot.gate as { reasonCode?: string }).reasonCode)
    ).not.toBe('kickoff_complete');

    const row = await sql<
      {
        document_id: string | null;
        findings: unknown;
        status: string;
      }[]
    >`
      SELECT document_id::text AS document_id, findings, status
      FROM research_sessions WHERE id = ${sessionId}::uuid LIMIT 1
    `;
    const documentId = row[0]?.document_id;
    expect(documentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if (!documentId) throw new Error('document_id missing after research commit');

    const findings =
      row[0]?.findings && typeof row[0].findings === 'object' && !Array.isArray(row[0].findings)
        ? (row[0].findings as Record<string, unknown>)
        : {};
    expect(findings.gate).toBeTruthy();
    expect(findings.gateInput).toBeTruthy();
    const report = String(findings.report ?? snapshot?.summary ?? '');
    expect(report.length).toBeGreaterThan(0);

    const ledgerFindings = Array.isArray(findings.findings) ? findings.findings : [];
    for (const f of ledgerFindings as Array<Record<string, unknown>>) {
      if (typeof f.quote === 'string' && typeof f.sourceText === 'string') {
        expect(f.sourceText).not.toBe(f.quote);
        expect(String(f.sourceText).length).toBeGreaterThan(String(f.quote).length);
      }
    }

    const scratch = resolve(
      '/Users/justinrich/.cache/agent-scratch/grok-goal-43fb43cf2fe8/implementer'
    );
    mkdirSync(scratch, { recursive: true });
    writeFileSync(
      resolve(scratch, 'live-gate.json'),
      JSON.stringify(
        {
          sessionId,
          status: row[0]?.status,
          documentId,
          gate: findings.gate,
          gateInput: findings.gateInput,
          admitted: findings.admitted,
          reportExcerpt: report.slice(0, 1200),
          constructed: false,
        },
        null,
        2
      )
    );
    writeFileSync(resolve(scratch, 'live-report-excerpt.md'), report.slice(0, 4000));

    const embedResult = await embedRun({ databaseUrl: DATABASE_URL, sql });
    const pending = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c
      FROM passages
      WHERE document_id = ${documentId} AND embedding IS NULL
    `;
    expect(pending[0]?.c, `embedRun processed=${embedResult.processed}`).toBe(0);

    const token = `research-report-token-${sessionId.replace(/-/g, '').slice(0, 12)}`;
    const search = await rrfHybridSearch(createDb(sql), sql, {
      query: token,
      limit: 10,
    });
    const hit = search.results.find((r) => r.document_id === documentId || r._id === documentId);
    expect(hit, `expected rrf hit for ${token} document ${documentId}`).toBeTruthy();
  }, 360_000);
});
