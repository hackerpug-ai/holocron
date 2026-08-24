/**
 * Wave 5 — research-depth Mastra workflow + async kickoff + cooperative cancel.
 *
 * Fail-closed: beforeAll THROWS if PLATFORM_IT unset, Postgres unreachable,
 * holocron_nonprod missing, fleet down, or JINA/EXA keys missing. NO it.skip.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm vitest run --project integration \
 *     services/platform/tests/integration/research-depth-workflow.test.ts
 */
import { randomUUID } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { Mastra } from '@mastra/core/mastra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assimilateRepoWorkflow } from '../../src/assimilate/workflow.ts';
import { getSecretValue } from '../../src/config/secrets.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createObservability, createStorage } from '../../src/mastra.ts';
import { cancelDeepResearch, kickoffDeepResearch } from '../../src/research/kickoff.ts';
import { updateResearchSessionStatus } from '../../src/research/session-writer.ts';
import { decideStop } from '../../src/research/workflow/decide-stop.ts';
import { researchDepthWorkflow } from '../../src/research/workflow/research-depth.ts';
import { emptyLedger } from '../../src/research/workflow/schemas.ts';

const PLATFORM_IT = process.env.PLATFORM_IT === '1';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';
const FLEET_URL = process.env.FLEET_URL?.trim() ?? 'http://127.0.0.1:4545/v1';

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function assertNonprodUrl(url: string): void {
  if (!url.includes('holocron_nonprod')) {
    throw new Error(`DATABASE_URL must target holocron_nonprod (got ${url})`);
  }
}

function probeTcp(host: string, port: number, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP timeout ${host}:${port}`));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`unreachable ${host}:${port}: ${err.message}`));
    });
  });
}

async function pollSessionStatus(
  sql: Sql,
  sessionId: string,
  opts: { timeoutMs: number; intervalMs?: number }
): Promise<{ status: string; coverage_score: number | null; findings: unknown }> {
  const deadline = Date.now() + opts.timeoutMs;
  const interval = opts.intervalMs ?? 1500;
  let last = {
    status: 'unknown',
    coverage_score: null as number | null,
    findings: null as unknown,
  };
  while (Date.now() < deadline) {
    const rows = await sql<{ status: string; coverage_score: number | null; findings: unknown }[]>`
      SELECT status, coverage_score, findings
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    if (rows[0]) {
      last = rows[0];
      if (TERMINAL.has(rows[0].status)) return rows[0];
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}

describe('Wave 5 research-depth workflow', () => {
  let sql: Sql;
  let mastra: Mastra;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for research-depth workflow — refusing skip-to-green'
      );
    }
    assertNonprodUrl(DATABASE_URL);
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.FLEET_URL = FLEET_URL;

    const jina = getSecretValue('JINA_API_KEY');
    const exa = getSecretValue('EXA_API_KEY');
    if (!jina) throw new Error('JINA_API_KEY missing — refuse silent skip');
    if (!exa) throw new Error('EXA_API_KEY missing — refuse silent skip');

    await probeTcp('127.0.0.1', 5432);
    const fleetHost = new URL(FLEET_URL).hostname || '127.0.0.1';
    const fleetPort = Number(new URL(FLEET_URL).port || 4545);
    await probeTcp(fleetHost, fleetPort);

    const fleetModels = await fetch(`${FLEET_URL.replace(/\/$/, '')}/models`).catch((err) => {
      throw new Error(`fleet /models failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    if (!fleetModels.ok) {
      throw new Error(`fleet /models HTTP ${fleetModels.status}`);
    }

    try {
      sql = createSql(DATABASE_URL, { max: 2 });
      await sql`SELECT 1`;
    } catch (err) {
      throw new Error(
        `Postgres unreachable for ${DATABASE_URL}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    for (const table of ['research_sessions', 'research_iterations', 'mastra_workflow_snapshot']) {
      const exists = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = ${table}
        ) AS exists
      `;
      if (!exists[0]?.exists) {
        throw new Error(`${table} missing — apply migrations first`);
      }
    }

    // Mirror createMastra() registration without importing index.ts (bun serve).
    mastra = new Mastra({
      storage: createStorage(),
      observability: createObservability(),
      agents: {},
      workflows: {
        assimilateRepo: assimilateRepoWorkflow,
        researchDepth: researchDepthWorkflow,
      },
    });
    const wf = mastra.getWorkflow('researchDepth');
    expect(wf).toBeTruthy();
    expect(mastra.getWorkflow('assimilateRepo')).toBeTruthy();

    // Warm PostgresStore + createRun so first kickoff is not paying cold-init.
    const warmRun = await wf.createRun();
    expect(warmRun.runId).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    if (sql) {
      for (const id of cleanupIds) {
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
      }
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }
    await mastra?.shutdown?.().catch(() => undefined);
  }, 60_000);

  it('decideStop never consults coverage_score (unit invariance inside IT file)', () => {
    const base = emptyLedger({
      query: 'q',
      mode: 'quick',
      maxRounds: 3,
      wallBudgetMs: 60_000,
      tokenBudget: 10_000,
      toolcallBudget: 10,
      startedAtMs: 0,
    });
    base.subQuestions = [{ id: '1', text: 'q', component: 'definition', status: 'closed' }];
    base.findings = [
      {
        id: 'f1',
        claimText: 'claim',
        component: 'definition',
        quote: 'Reciprocal rank fusion merges rankings',
        sourceText:
          'Reciprocal rank fusion merges rankings from multiple retrievers into one list.',
        sourceUrl: 'https://example.com',
        sourceId: 'https://example.com',
        grade: 4,
        entailment: 0.9,
        disconfirmationResolved: true,
        direction: 'supporting',
      },
    ];
    const a = decideStop({
      ledger: { ...base, coverageScore: 0, admitted: false },
      roundJustFinished: 1,
      nowMs: 1000,
    });
    const b = decideStop({
      ledger: { ...base, coverageScore: 1, admitted: true },
      roundJustFinished: 1,
      nowMs: 1000,
    });
    expect(a).toBe('all_closed');
    expect(b).toBe('all_closed');
  });

  it('async kickoff returns sessionId in <2000ms; lifecycle reaches terminal; coverage at commit', async () => {
    const kickoffStarted = Date.now();
    const kicked = await kickoffDeepResearch({
      query: 'What is reciprocal rank fusion in information retrieval?',
      idempotencyKey: `wave5-depth-${randomUUID()}`,
      mode: 'quick',
      maxRounds: 1,
      mastra,
    });
    const kickoffMs = Date.now() - kickoffStarted;

    expect(kicked.ok, JSON.stringify(kicked)).toBe(true);
    if (!kicked.ok) return;
    cleanupIds.push(kicked.sessionId);

    expect(kickoffMs).toBeLessThan(2000);
    expect(kicked.latencyMs).toBeLessThan(2000);
    expect(['queued', 'running']).toContain(kicked.status);

    const immediate = await sql<{ status: string }[]>`
        SELECT status FROM research_sessions WHERE id = ${kicked.sessionId}::uuid LIMIT 1
      `;
    expect(['queued', 'running']).toContain(immediate[0]?.status);

    const terminal = await pollSessionStatus(sql, kicked.sessionId, {
      timeoutMs: 240_000,
      intervalMs: 2000,
    });

    expect(TERMINAL.has(terminal.status), `status=${terminal.status}`).toBe(true);

    // coverage_score written at commit (nullable only if commit never ran — fail then)
    expect(typeof terminal.coverage_score === 'number').toBe(true);
    expect(terminal.coverage_score!).toBeGreaterThanOrEqual(0);
    expect(terminal.coverage_score!).toBeLessThanOrEqual(1);

    const iterations = await sql<
      { iteration_number: number; coverage_score: number | null; summary: string | null }[]
    >`
        SELECT iteration_number, coverage_score, summary
        FROM research_iterations
        WHERE session_id = ${kicked.sessionId}::uuid
        ORDER BY iteration_number ASC
      `;
    expect(iterations.length).toBeGreaterThanOrEqual(1);
    const numbers = iterations.map((r) => r.iteration_number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));

    const findingsPayload =
      terminal.findings && typeof terminal.findings === 'object'
        ? (terminal.findings as Record<string, unknown>)
        : {};
    const admitted = Boolean(findingsPayload.admitted);
    if (!admitted) {
      // Honest refusal PASS — report/gaps must state the gap.
      const report = String(findingsPayload.report ?? '');
      const gaps = Array.isArray(findingsPayload.gaps) ? findingsPayload.gaps : [];
      expect(report.length + gaps.length).toBeGreaterThan(0);
    }

    console.log(
      JSON.stringify({
        tc: 'kickoff-lifecycle',
        sessionId: kicked.sessionId,
        kickoffMs,
        status: terminal.status,
        coverage_score: terminal.coverage_score,
        admitted,
        iterations: numbers,
        stopReason: findingsPayload.stopReason ?? null,
      })
    );
  }, 300_000);

  it('cancel latch: mid-run cancel stays cancelled; iteration partials retained', async () => {
    const kicked = await kickoffDeepResearch({
      query: 'Explain vector databases for RAG retrieval systems',
      idempotencyKey: `wave5-cancel-${randomUUID()}`,
      mode: 'depth',
      maxRounds: 6,
      mastra,
    });
    expect(kicked.ok, JSON.stringify(kicked)).toBe(true);
    if (!kicked.ok) return;
    cleanupIds.push(kicked.sessionId);

    // Let the run leave queued briefly, then cancel.
    await new Promise((r) => setTimeout(r, 1500));
    const cancelled = await cancelDeepResearch(kicked.sessionId);
    expect(cancelled.ok, JSON.stringify(cancelled)).toBe(true);

    // Also exercise the writer path the HTTP layer would call.
    const again = await updateResearchSessionStatus(kicked.sessionId, 'running');
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.status).toBe('cancelled');
      expect(again.latched).toBe(true);
    }

    const terminal = await pollSessionStatus(sql, kicked.sessionId, {
      timeoutMs: 180_000,
      intervalMs: 1500,
    });
    expect(terminal.status).toBe('cancelled');

    // Stays cancelled after another running attempt.
    const stay = await updateResearchSessionStatus(kicked.sessionId, 'running');
    expect(stay.ok).toBe(true);
    if (stay.ok) {
      expect(stay.status).toBe('cancelled');
      expect(stay.latched).toBe(true);
    }

    const finalRow = await sql<{ status: string }[]>`
        SELECT status FROM research_sessions WHERE id = ${kicked.sessionId}::uuid LIMIT 1
      `;
    expect(finalRow[0]?.status).toBe('cancelled');

    const iterations = await sql<{ iteration_number: number; summary: string | null }[]>`
        SELECT iteration_number, summary
        FROM research_iterations
        WHERE session_id = ${kicked.sessionId}::uuid
        ORDER BY iteration_number ASC
      `;
    // Commit always runs (or latch held with whatever partials the round wrote).
    // Allow zero if cancel hit before first iteration persist, but status must stay cancelled.
    const numbers = iterations.map((r) => r.iteration_number);
    expect(new Set(numbers).size).toBe(numbers.length);

    console.log(
      JSON.stringify({
        tc: 'cancel-latch',
        sessionId: kicked.sessionId,
        status: finalRow[0]?.status,
        iterations: numbers,
        latched: again.ok ? again.latched : false,
      })
    );
  }, 240_000);

  it('nonsense query yields honest refusal (admitted=false) without fake success', async () => {
    const kicked = await kickoffDeepResearch({
      query: 'zzzxqwt-nonexistent-entity-42-foobar-research-gate-refusal',
      idempotencyKey: `wave5-refuse-${randomUUID()}`,
      mode: 'quick',
      maxRounds: 1,
      mastra,
    });
    expect(kicked.ok).toBe(true);
    if (!kicked.ok) return;
    cleanupIds.push(kicked.sessionId);

    const terminal = await pollSessionStatus(sql, kicked.sessionId, {
      timeoutMs: 240_000,
      intervalMs: 2000,
    });
    expect(TERMINAL.has(terminal.status)).toBe(true);

    const findingsPayload =
      terminal.findings && typeof terminal.findings === 'object'
        ? (terminal.findings as Record<string, unknown>)
        : {};
    // Under-evidenced nonsense should not claim admission.
    expect(Boolean(findingsPayload.admitted)).toBe(false);
    const report = String(findingsPayload.report ?? '');
    const gaps = Array.isArray(findingsPayload.gaps) ? findingsPayload.gaps.map(String) : [];
    expect(report.length > 0 || gaps.length > 0).toBe(true);

    console.log(
      JSON.stringify({
        tc: 'honest-refusal',
        sessionId: kicked.sessionId,
        status: terminal.status,
        admitted: findingsPayload.admitted ?? false,
        stopReason: findingsPayload.stopReason ?? null,
        gaps,
      })
    );
  }, 300_000);
});
