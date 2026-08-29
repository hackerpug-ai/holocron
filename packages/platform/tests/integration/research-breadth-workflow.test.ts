/**
 * Wave 7 — research-breadth Mastra workflow: foreach width 2, origin dedupe,
 * branch_id attribution, async kickoff.
 *
 * Fail-closed: beforeAll THROWS if PLATFORM_IT unset, Postgres unreachable,
 * holocron_nonprod missing, fleet down, or JINA/EXA keys missing. NO it.skip.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   FLEET_URL=http://127.0.0.1:4545/v1 \
 *   pnpm vitest run --project integration \
 *     packages/platform/tests/integration/research-breadth-workflow.test.ts
 */
import { randomUUID } from 'node:crypto';
import { connect as netConnect } from 'node:net';
import { Mastra } from '@mastra/core/mastra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assimilateRepoWorkflow } from '../../src/assimilate/workflow.ts';
import { getSecretValue } from '../../src/config/secrets.ts';
import { createSql, type Sql } from '../../src/db/client.ts';
import { createObservability, createStorage } from '../../src/mastra.ts';
import { kickoffDeepResearch } from '../../src/research/kickoff.ts';
import {
  FOREACH_CONCURRENCY,
  mergeSubResults,
  researchBreadthWorkflow,
} from '../../src/research/workflow/research-breadth.ts';
import { researchDepthWorkflow } from '../../src/research/workflow/research-depth.ts';
import { emptySpend } from '../../src/research/workflow/schemas.ts';
import { resolveOrigin } from '../../src/web/origin.ts';

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

describe('Wave 7 research-breadth workflow', () => {
  let sql: Sql;
  let mastra: Mastra;
  const cleanupIds: string[] = [];

  beforeAll(async () => {
    if (!PLATFORM_IT) {
      throw new Error(
        'PLATFORM_IT=1 required for research-breadth workflow — refusing skip-to-green'
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

    for (const table of [
      'research_sessions',
      'research_iterations',
      'research_web_calls',
      'mastra_workflow_snapshot',
    ]) {
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

    expect(FOREACH_CONCURRENCY).toBe(2);

    mastra = new Mastra({
      storage: createStorage(),
      observability: createObservability(),
      agents: {},
      workflows: {
        assimilateRepo: assimilateRepoWorkflow,
        researchDepth: researchDepthWorkflow,
        researchBreadth: researchBreadthWorkflow,
      },
    });
    expect(mastra.getWorkflow('researchBreadth')).toBeTruthy();
    expect(mastra.getWorkflow('researchDepth')).toBeTruthy();

    const warmRun = await mastra.getWorkflow('researchBreadth').createRun();
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

  it('same origin on two branches counts once for independentSourceCount', () => {
    const sharedUrl = 'https://example.com/rrf-article';
    const origin = resolveOrigin({
      finalUrl: sharedUrl,
      text: 'Reciprocal rank fusion combines ranked lists from multiple retrievers.',
    });
    const sharedFinding = {
      id: 'f-shared',
      claimText: 'RRF merges rankings',
      component: 'definition',
      quote: 'Reciprocal rank fusion combines ranked lists',
      sourceText: 'Reciprocal rank fusion combines ranked lists from multiple retrievers.',
      sourceUrl: sharedUrl,
      sourceId: origin.sourceId,
      grade: 4,
      entailment: 0.9,
      disconfirmationResolved: true,
      direction: 'supporting' as const,
    };
    const branchBDup = {
      ...sharedFinding,
      id: 'f-shared-b',
      component: 'mechanism',
      claimText: 'RRF score formula',
    };
    const uniqueB = {
      id: 'f-unique-b',
      claimText: 'Vector DB ANN search',
      component: 'mechanism',
      quote: 'Approximate nearest neighbor indexes accelerate retrieval',
      sourceText:
        'Approximate nearest neighbor indexes accelerate retrieval over high-dimensional embeddings.',
      sourceUrl: 'https://other.example.org/ann',
      sourceId: resolveOrigin({
        finalUrl: 'https://other.example.org/ann',
        text: 'Approximate nearest neighbor indexes accelerate retrieval',
      }).sourceId,
      grade: 4,
      entailment: 0.9,
      disconfirmationResolved: true,
      direction: 'supporting' as const,
    };

    const { stats } = mergeSubResults({
      query: 'What is RRF and how do vector databases use ANN?',
      mode: 'breadth',
      maxRounds: 2,
      wallBudgetMs: 60_000,
      tokenBudget: 10_000,
      toolcallBudget: 10,
      startedAtMs: Date.now(),
      results: [
        {
          jobId: 'j1',
          branchId: 'breadth-a',
          component: 'definition',
          text: 'What is reciprocal rank fusion?',
          findings: [sharedFinding],
          queriesRun: ['rrf'],
          seenUrls: [sharedUrl],
          gaps: [],
          spend: emptySpend(),
          stopReason: 'all_closed',
          rounds: 1,
          degraded: false,
        },
        {
          jobId: 'j2',
          branchId: 'breadth-b',
          component: 'mechanism',
          text: 'How do vector databases use ANN?',
          findings: [branchBDup, uniqueB],
          queriesRun: ['ann'],
          seenUrls: [sharedUrl, uniqueB.sourceUrl],
          gaps: [],
          spend: emptySpend(),
          stopReason: 'all_closed',
          rounds: 1,
          degraded: false,
        },
      ],
    });

    // Shared origin across branches collapses to one independence unit.
    expect(stats.branchCount).toBe(2);
    expect(stats.findingCount).toBe(2);
    expect(stats.independentSourceCount).toBe(2);
    expect(stats.branchIds.sort()).toEqual(['breadth-a', 'breadth-b']);

    // Explicit once-proof: identical sourceId alone → count 1.
    const once = mergeSubResults({
      query: 'q',
      mode: 'breadth',
      maxRounds: 1,
      wallBudgetMs: 10_000,
      tokenBudget: 1000,
      toolcallBudget: 2,
      startedAtMs: Date.now(),
      results: [
        {
          jobId: 'a',
          branchId: 'breadth-a',
          component: 'definition',
          text: 'a',
          findings: [sharedFinding],
          queriesRun: [],
          seenUrls: [sharedUrl],
          gaps: [],
          spend: emptySpend(),
          stopReason: null,
          rounds: 1,
          degraded: false,
        },
        {
          jobId: 'b',
          branchId: 'breadth-b',
          component: 'mechanism',
          text: 'b',
          findings: [{ ...sharedFinding, id: 'other-id', quote: sharedFinding.quote }],
          queriesRun: [],
          seenUrls: [sharedUrl],
          gaps: [],
          spend: emptySpend(),
          stopReason: null,
          rounds: 1,
          degraded: false,
        },
      ],
    });
    expect(once.stats.independentSourceCount).toBe(1);
    expect(once.stats.findingCount).toBe(1);

    console.log(
      JSON.stringify({
        tc: 'independence-once',
        sharedOrigin: origin.sourceId,
        mixedIndependent: stats.independentSourceCount,
        sameOriginOnce: once.stats.independentSourceCount,
      })
    );
  });

  it('kickoff mode=breadth returns id <2s; foreach width-2 attributes branch_id', async () => {
    const kickoffStarted = Date.now();
    const kicked = await kickoffDeepResearch({
      // Enumerative but cheap: two facets so decompose stays ≥2.
      query: 'What is reciprocal rank fusion and how do vector databases use ANN indexes?',
      idempotencyKey: `wave7-breadth-${randomUUID()}`,
      mode: 'breadth',
      maxRounds: 1,
      wallBudgetMs: 180_000,
      tokenBudget: 24_000,
      toolcallBudget: 24,
      mastra,
    });
    const kickoffMs = Date.now() - kickoffStarted;

    expect(kicked.ok, JSON.stringify(kicked)).toBe(true);
    if (!kicked.ok) return;
    cleanupIds.push(kicked.sessionId);

    expect(kickoffMs).toBeLessThan(2000);
    expect(kicked.latencyMs).toBeLessThan(2000);
    expect(['queued', 'running']).toContain(kicked.status);

    const terminal = await pollSessionStatus(sql, kicked.sessionId, {
      timeoutMs: 360_000,
      intervalMs: 2500,
    });
    expect(TERMINAL.has(terminal.status), `status=${terminal.status}`).toBe(true);

    const iterations = await sql<{ iteration_number: number; branch_id: string | null }[]>`
      SELECT iteration_number, branch_id
      FROM research_iterations
      WHERE session_id = ${kicked.sessionId}::uuid
      ORDER BY iteration_number ASC
    `;
    const branchIds = [
      ...new Set(iterations.map((r) => r.branch_id).filter((b): b is string => Boolean(b))),
    ];
    const fanBranches = branchIds.filter((b) => b.startsWith('breadth-') && b !== 'breadth-commit');
    expect(
      fanBranches.length,
      `expected ≥2 attributed branches, got ${JSON.stringify(branchIds)}`
    ).toBeGreaterThanOrEqual(2);

    const webBranches = await sql<{ branch_id: string | null }[]>`
      SELECT DISTINCT branch_id
      FROM research_web_calls
      WHERE session_id = ${kicked.sessionId}::uuid
        AND branch_id IS NOT NULL
    `;
    const webBranchIds = webBranches
      .map((r) => r.branch_id)
      .filter((b): b is string => Boolean(b) && b.startsWith('breadth-'));
    // Prefer web_calls proof when search ran; iterations always carry branch_id.
    const attributed = new Set([...fanBranches, ...webBranchIds]);
    expect(attributed.size).toBeGreaterThanOrEqual(2);

    const findingsPayload =
      terminal.findings && typeof terminal.findings === 'object'
        ? (terminal.findings as Record<string, unknown>)
        : {};
    const mergeStats =
      findingsPayload.mergeStats && typeof findingsPayload.mergeStats === 'object'
        ? (findingsPayload.mergeStats as Record<string, unknown>)
        : {};
    const storedBranches = Array.isArray(findingsPayload.branchIds)
      ? findingsPayload.branchIds.map(String)
      : Array.isArray(mergeStats.branchIds)
        ? mergeStats.branchIds.map(String)
        : [];

    console.log(
      JSON.stringify({
        tc: 'breadth-foreach-attribution',
        sessionId: kicked.sessionId,
        kickoffMs,
        status: terminal.status,
        iterationBranches: branchIds,
        webBranches: webBranchIds,
        storedBranches,
        independentSourceCount: mergeStats.independentSourceCount ?? null,
        admitted: findingsPayload.admitted ?? null,
        stopReason: findingsPayload.stopReason ?? null,
      })
    );
  }, 420_000);
});
