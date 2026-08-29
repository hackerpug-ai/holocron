/**
 * Wave 4 writers — research trio production writers + terminal status latch.
 *
 * Proves on real Postgres (holocron_nonprod):
 *   - source-audit: production INSERT call sites for sessions/iterations/findings
 *   - start → queued → running → completed
 *   - terminal latch: cancelled stays cancelled when running is attempted
 *   - iteration columns the RN hook reads (summary, feedback, refined_queries, sources)
 *   - replay-safe ON CONFLICT (session_id, iteration_number)
 *   - no forbidden status spellings from production writers
 *   - no raw UPDATE research_sessions SET status outside session-writer.ts
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration packages/platform/tests/integration/research-trio-writers.test.ts
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { insertCitation } from '../../src/research/citation-writer.ts';
import { insertResearchFinding } from '../../src/research/findings-writer.ts';
import { insertResearchIteration } from '../../src/research/iteration-writer.ts';
import {
  RESEARCH_SESSION_STATUS_FORBIDDEN,
  resetResearchProgressThrottle,
  startResearchSession,
  updateResearchSessionStatus,
} from '../../src/research/session-writer.ts';
import { recordResearchWebCall } from '../../src/research/web-call-ledger.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const PLATFORM_SRC = resolve(REPO_ROOT, 'packages/platform/src');

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

function rg(pattern: string, cwd: string, extraArgs: string[] = []): string {
  try {
    return execFileSync('rg', ['-n', pattern, ...extraArgs, cwd], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    });
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    if (e.status === 1) return e.stdout ?? '';
    throw err;
  }
}

function productionSrcArgs(): string[] {
  return [
    '--glob',
    '!**/migrations/**',
    '--glob',
    '!**/seed*',
    '--glob',
    '!**/*test*',
    '--glob',
    '!**/*.test.ts',
    '--glob',
    '!**/*.md',
    '--glob',
    '!**/__spike__/**',
  ];
}

describe('Wave 4 research trio production writers', () => {
  let sql: Sql;
  const cleanupSessionIds: string[] = [];

  beforeAll(async () => {
    if (!DATABASE_URL.includes('holocron_nonprod')) {
      throw new Error(
        `DATABASE_URL must target holocron_nonprod (got ${DATABASE_URL}). Refusing to run.`
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

    resetResearchProgressThrottle();
  }, 60_000);

  afterAll(async () => {
    if (!sql) return;
    for (const id of cleanupSessionIds) {
      await sql`DELETE FROM research_web_calls WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_findings WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM citations WHERE session_id = ${id}::uuid`.catch(() => undefined);
      await sql`DELETE FROM research_iterations WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_sessions WHERE id = ${id}::uuid`.catch(() => undefined);
    }
    await sql.end({ timeout: 5 }).catch(() => undefined);
  });

  it('source-audit: production INSERT sites exist for sessions, iterations, findings', () => {
    const sessions = rg('INSERT INTO research_sessions', PLATFORM_SRC, productionSrcArgs());
    const iterations = rg('INSERT INTO research_iterations', PLATFORM_SRC, productionSrcArgs());
    const findings = rg('INSERT INTO research_findings', PLATFORM_SRC, productionSrcArgs());

    expect(sessions, 'research_sessions INSERT must exist outside tests').toMatch(
      /session-writer\.ts/
    );
    expect(iterations, 'research_iterations INSERT must exist outside tests').toMatch(
      /iteration-writer\.ts/
    );
    expect(findings, 'research_findings INSERT must exist outside tests').toMatch(
      /findings-writer\.ts/
    );

    // Mutation: writers must not live only in tests.
    expect(sessions).not.toMatch(/tests\//);
    expect(iterations).not.toMatch(/tests\//);
    expect(findings).not.toMatch(/tests\//);
  });

  it('source-audit: sole status writer is session-writer; no forbidden spellings', () => {
    const statusUpdates = rg(
      'UPDATE research_sessions[\\s\\S]{0,200}?SET[\\s\\S]{0,200}?status\\s*=',
      PLATFORM_SRC,
      [...productionSrcArgs(), '--multiline']
    );
    const lines = statusUpdates
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/mission-research\.ts/.test(l)); // ON CONFLICT DO UPDATE status = EXCLUDED (insert path)

    const offenders = lines.filter((l) => !/session-writer\.ts/.test(l));
    expect(
      offenders,
      `raw UPDATE research_sessions SET status outside session-writer:\n${offenders.join('\n')}`
    ).toEqual([]);

    for (const forbidden of RESEARCH_SESSION_STATUS_FORBIDDEN) {
      // Only flag actual status assignments / string literals used as status values.
      const hits = rg(
        `status\\s*[:=]\\s*['"]${forbidden}['"]|['"]${forbidden}['"]\\s*as\\s+ResearchSessionStatus|VALUES\\s*\\([^)]*['"]${forbidden}['"]`,
        resolve(PLATFORM_SRC, 'research'),
        ['--glob', '*-writer.ts', '--glob', 'web-call-ledger.ts', '--glob', 'session-writer.ts']
      );
      const emitHits = hits
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter(
          (l) => !/FORBIDDEN|forbidden|never emit|Never emit|spellings|FORBIDDEN_STATUS/i.test(l)
        );
      expect(
        emitHits,
        `production writer must not emit status '${forbidden}':\n${emitHits.join('\n')}`
      ).toEqual([]);
    }
  });

  it('start → queued → running → completed; terminal latch keeps cancelled', async () => {
    const key = `wave4-trio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const started = await startResearchSession({
      query: 'wave4 trio latch proof',
      idempotencyKey: key,
      sql,
      maxIterations: 5,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    cleanupSessionIds.push(started.sessionId);

    expect(started.status).toBe('queued');
    expect(started.reused).toBe(false);

    const dup = await startResearchSession({
      query: 'wave4 trio latch proof',
      idempotencyKey: key,
      sql,
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.sessionId).toBe(started.sessionId);
      expect(dup.reused).toBe(true);
    }

    const toRunning = await updateResearchSessionStatus(started.sessionId, 'running', { sql });
    expect(toRunning.ok).toBe(true);
    if (toRunning.ok) {
      expect(toRunning.status).toBe('running');
      expect(toRunning.latched).toBe(false);
    }

    const toCompleted = await updateResearchSessionStatus(started.sessionId, 'completed', { sql });
    expect(toCompleted.ok).toBe(true);
    if (toCompleted.ok) {
      expect(toCompleted.status).toBe('completed');
    }

    const row = await sql<{ status: string }[]>`
      SELECT status FROM research_sessions WHERE id = ${started.sessionId}::uuid
    `;
    expect(row[0]?.status).toBe('completed');

    // Fresh session for cancel latch
    const cancelKey = `wave4-cancel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cancelStart = await startResearchSession({
      query: 'wave4 cancel latch',
      idempotencyKey: cancelKey,
      sql,
    });
    expect(cancelStart.ok).toBe(true);
    if (!cancelStart.ok) return;
    cleanupSessionIds.push(cancelStart.sessionId);

    await updateResearchSessionStatus(cancelStart.sessionId, 'running', { sql });
    const cancelled = await updateResearchSessionStatus(cancelStart.sessionId, 'cancelled', {
      sql,
    });
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) expect(cancelled.status).toBe('cancelled');

    const attemptRunning = await updateResearchSessionStatus(cancelStart.sessionId, 'running', {
      sql,
    });
    expect(attemptRunning.ok).toBe(true);
    if (attemptRunning.ok) {
      expect(attemptRunning.status).toBe('cancelled');
      expect(attemptRunning.latched).toBe(true);
    }

    const latched = await sql<{ status: string }[]>`
      SELECT status FROM research_sessions WHERE id = ${cancelStart.sessionId}::uuid
    `;
    expect(latched[0]?.status).toBe('cancelled');

    // Repeat of completed query/key → fresh row
    const fresh = await startResearchSession({
      query: 'wave4 trio latch proof',
      idempotencyKey: key,
      sql,
    });
    expect(fresh.ok).toBe(true);
    if (fresh.ok) {
      cleanupSessionIds.push(fresh.sessionId);
      expect(fresh.sessionId).not.toBe(started.sessionId);
      expect(fresh.status).toBe('queued');
      expect(fresh.reused).toBe(false);
    }
  });

  it('iteration writer fills RN hook columns and is replay-safe', async () => {
    const key = `wave4-iter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const started = await startResearchSession({
      query: 'wave4 iteration columns',
      idempotencyKey: key,
      sql,
      system: 'deep',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    cleanupSessionIds.push(started.sessionId);
    await updateResearchSessionStatus(started.sessionId, 'running', { sql });

    const citation = await insertCitation({
      sessionId: started.sessionId,
      sourceUrl: 'https://example.com/wave4-proof',
      sourceTitle: 'Wave4 Proof Source',
      claimText: 'Example claim backed by source',
      sql,
    });
    expect(citation.ok).toBe(true);
    if (!citation.ok) return;

    const first = await insertResearchIteration({
      sessionId: started.sessionId,
      iterationNumber: 1,
      summary: 'Iteration summary visible to RN hook',
      feedback: 'Review feedback visible to RN hook',
      refinedQueries: ['refined query one', 'refined query two'],
      sources: [citation.displaySource],
      branchId: 'breadth-a',
      coverageScore: 0.72,
      sql,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.inserted).toBe(true);

    const selected = await sql<
      {
        summary: string | null;
        feedback: string | null;
        refined_queries: unknown;
        sources: unknown;
        findings_summary: string | null;
        review_feedback: string | null;
        branch_id: string | null;
      }[]
    >`
      SELECT summary, feedback, refined_queries, sources, findings_summary, review_feedback, branch_id
      FROM research_iterations
      WHERE session_id = ${started.sessionId}::uuid
        AND iteration_number = 1
    `;
    const iter = selected[0];
    expect(iter).toBeTruthy();
    expect(iter?.summary).toBe('Iteration summary visible to RN hook');
    expect(iter?.feedback).toBe('Review feedback visible to RN hook');
    expect(iter?.findings_summary).toBe('Iteration summary visible to RN hook');
    expect(iter?.review_feedback).toBe('Review feedback visible to RN hook');
    expect(iter?.branch_id).toBe('breadth-a');
    expect(Array.isArray(iter?.refined_queries)).toBe(true);
    expect(iter?.refined_queries).toEqual(['refined query one', 'refined query two']);
    expect(Array.isArray(iter?.sources)).toBe(true);
    expect(iter?.sources).not.toBeNull();
    const sources = iter?.sources as Array<{ url?: string; title?: string }>;
    expect(sources[0]?.url).toBe('https://example.com/wave4-proof');
    expect(sources[0]?.title).toBe('Wave4 Proof Source');

    const replay = await insertResearchIteration({
      sessionId: started.sessionId,
      iterationNumber: 1,
      summary: 'SHOULD NOT OVERWRITE',
      feedback: 'SHOULD NOT OVERWRITE',
      refinedQueries: ['nope'],
      sources: [],
      sql,
    });
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.inserted).toBe(false);
      expect(replay.iterationId).toBe(first.iterationId);
    }

    const count = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n
      FROM research_iterations
      WHERE session_id = ${started.sessionId}::uuid
        AND iteration_number = 1
    `;
    expect(count[0]?.n).toBe('1');

    const afterReplay = await sql<{ summary: string | null }[]>`
      SELECT summary FROM research_iterations WHERE id = ${first.iterationId}::uuid
    `;
    expect(afterReplay[0]?.summary).toBe('Iteration summary visible to RN hook');

    const finding = await insertResearchFinding({
      sessionId: started.sessionId,
      iterationId: first.iterationId,
      claimText: 'Durable claim with scored evidence',
      citationIds: [citation.citationId],
      sourceCredibilityScore: 0.9,
      evidenceQualityScore: 0.85,
      corroborationScore: 0.7,
      recencyScore: 0.6,
      expertConsensusScore: 0.5,
      confidenceScore: 0.8,
      confidenceLevel: 'high',
      sql,
    });
    expect(finding.ok).toBe(true);
    if (finding.ok) {
      expect(finding.citationIds).toEqual([citation.citationId]);
      expect(finding.scores.confidenceScore).toBe(0.8);
    }

    const findingRow = await sql<
      {
        claim_text: string | null;
        citation_ids: unknown;
        source_credibility_score: number | null;
        evidence_quality_score: number | null;
      }[]
    >`
      SELECT claim_text, citation_ids, source_credibility_score, evidence_quality_score
      FROM research_findings
      WHERE session_id = ${started.sessionId}::uuid
    `;
    expect(findingRow[0]?.claim_text).toBe('Durable claim with scored evidence');
    expect(findingRow[0]?.citation_ids).toEqual([citation.citationId]);
    expect(findingRow[0]?.source_credibility_score).toBe(0.9);
    expect(findingRow[0]?.evidence_quality_score).toBe(0.85);

    const web = await recordResearchWebCall({
      sessionId: started.sessionId,
      iterationId: first.iterationId,
      provider: 'jina',
      callKind: 'search',
      query: 'wave4 web call',
      resultCount: 3,
      wallMs: 42,
      sql,
    });
    expect(web.ok).toBe(true);
  });
});
