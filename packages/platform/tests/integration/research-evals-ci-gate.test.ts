/**
 * Wave 8 — Deterministic research scorers + CI gate (quote-verifiability 1.0).
 *
 * Seeds real Postgres rows (research_sessions/iterations/findings/citations/
 * research_web_calls). A corrupted quote must drop quote-verifiability below 1.0
 * and fail runCiGate / runResearchCiGate.
 *
 * Run:
 *   PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *     pnpm vitest run --project integration \
 *     packages/platform/tests/integration/research-evals-ci-gate.test.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSql, type Sql } from '../../src/db/client.ts';
import { runCiGate, runResearchCiGate } from '../../src/evals/ci-gate.ts';
import {
  getScorerScore,
  scoreQuoteVerifiability,
  scoreResearchSession,
  scoreResearchSnapshot,
} from '../../src/evals/research-scorers.ts';
import { HOLOCRON_ATTRIBUTE_ALLOWLIST } from '../../src/observability/config.ts';
import { insertCitation } from '../../src/research/citation-writer.ts';
import { insertResearchFinding } from '../../src/research/findings-writer.ts';
import { insertResearchIteration } from '../../src/research/iteration-writer.ts';
import { verifyQuote } from '../../src/research/quote-match.ts';
import {
  startResearchSession,
  updateResearchSessionStatus,
} from '../../src/research/session-writer.ts';
import { recordResearchWebCall } from '../../src/research/web-call-ledger.ts';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.DATABASE_URL_OWNER ??
  'postgres://127.0.0.1:5432/holocron_nonprod';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const DATASET_PATH = resolve(REPO_ROOT, 'packages/platform/evals/datasets/research_v1.jsonl');

const SOURCE_TEXT =
  'Intermittent fasting may support short-term weight management for some adults when combined with dietary counseling. Evidence is mixed and benefits largely track caloric deficit.';
const GOOD_QUOTE = 'benefits largely track caloric deficit';
const BAD_QUOTE = 'guarantees permanent metabolic immortality in all adults within days';

const REQUIRED_ALLOWLIST_KEYS = [
  'researchSessionId',
  'iterationNumber',
  'researchMode',
  'researchSystem',
  'branchId',
  'branchIndex',
  'branchCount',
  'subQuestionId',
  'webProvider',
  'sourceCount',
  'admittedCount',
  'rejectedCount',
  'independentSourceCount',
  'coverageScore',
  'gateAdmitted',
  'gateReasonCode',
  'retryCount',
  'cacheHit',
  'phaseDurationMs',
] as const;

describe('Wave 8 research evals CI gate (quote-verifiability)', () => {
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
      await sql`DELETE FROM citations WHERE deep_research_session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_iterations WHERE session_id = ${id}::uuid`.catch(
        () => undefined
      );
      await sql`DELETE FROM research_sessions WHERE id = ${id}::uuid`.catch(() => undefined);
    }
    await sql.end({ timeout: 5 }).catch(() => undefined);
  });

  async function seedSession(opts: {
    quote: string;
    sourceText: string;
    url: string;
    admitted: boolean;
    coverageScore?: number;
    publishedDate?: string | null;
    skipWebCall?: boolean;
  }): Promise<string> {
    const key = `wave8-evals-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const started = await startResearchSession({
      query: `wave8 quote eval ${opts.quote.slice(0, 24)}`,
      idempotencyKey: key,
      sql,
      system: 'deep',
      maxIterations: 3,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.error);
    cleanupSessionIds.push(started.sessionId);

    await updateResearchSessionStatus(started.sessionId, 'running', { sql });

    const citation = await insertCitation({
      sessionId: started.sessionId,
      sourceUrl: opts.url,
      sourceTitle: 'Wave8 Eval Source',
      claimText: opts.quote,
      publishedDate:
        opts.publishedDate === undefined
          ? '2024-01-15T00:00:00.000Z'
          : (opts.publishedDate ?? undefined),
      metadataJson: {
        quote: opts.quote,
        sourceText: opts.sourceText,
        sourceId: 'src-wave8-a',
        independenceGroup: 'group-should-be-ignored',
        publishedDate:
          opts.publishedDate === undefined ? '2024-01-15T00:00:00.000Z' : opts.publishedDate,
      },
      sql,
    });
    expect(citation.ok).toBe(true);
    if (!citation.ok) throw new Error(citation.error);

    if (!opts.skipWebCall) {
      const web = await recordResearchWebCall({
        sessionId: started.sessionId,
        provider: 'jina',
        callKind: 'read',
        url: opts.url,
        sourceId: 'src-wave8-a',
        httpStatus: 200,
        resultCount: 1,
        wallMs: 12,
        sql,
      });
      expect(web.ok).toBe(true);
    }

    const findingsPayload = {
      claims: [{ id: 'c1', text: 'caloric deficit drives IF benefits', component: 'efficacy' }],
      evidence: [
        {
          id: 'e1',
          claimId: 'c1',
          component: 'efficacy',
          sourceId: 'src-wave8-a',
          independenceGroup: 'group-should-be-ignored',
          quote: opts.quote,
          sourceText: opts.sourceText,
          grade: 4,
          entailment: 0.9,
          disconfirmationResolved: true,
          direction: 'supporting' as const,
        },
      ],
      requiredComponents: ['efficacy'],
    };

    const iter = await insertResearchIteration({
      sessionId: started.sessionId,
      iterationNumber: 1,
      summary: opts.admitted
        ? 'Evidence admitted; report summarizes verified quotes.'
        : 'Insufficient evidence; gaps remain and gate not admitted.',
      feedback: opts.admitted
        ? 'Coverage adequate across independent sources.'
        : 'Gap: missing independent corroboration; not admitted.',
      refinedQueries: ['wave8 refined'],
      sources: [
        {
          ...citation.displaySource,
          quote: opts.quote,
          sourceText: opts.sourceText,
          sourceId: 'src-wave8-a',
        } as never,
      ],
      coverageScore: opts.coverageScore ?? 4,
      reviewGaps: opts.admitted ? [] : ['missing independent source'],
      sql,
    });
    expect(iter.ok).toBe(true);
    if (!iter.ok) throw new Error(iter.error);

    const finding = await insertResearchFinding({
      sessionId: started.sessionId,
      iterationId: iter.iterationId,
      claimText: 'caloric deficit drives IF benefits',
      citationIds: [citation.citationId],
      sourceCredibilityScore: 0.8,
      evidenceQualityScore: 0.8,
      corroborationScore: 0.7,
      recencyScore: 0.6,
      expertConsensusScore: 0.5,
      confidenceScore: 0.75,
      sql,
    });
    expect(finding.ok).toBe(true);

    await sql`
      UPDATE research_sessions
      SET
        findings = ${sql.json(findingsPayload)},
        final_confidence_summary = ${sql.json({
          admitted: opts.admitted,
          reason: opts.admitted ? 'admitted' : 'insufficient evidence gaps',
          independentSourceCount: 1,
          gateReasonCode: opts.admitted ? 'ADMITTED' : 'INSUFFICIENT_EVIDENCE',
        })},
        plan = ${sql.json({
          gate: {
            admitted: opts.admitted,
            independentSourceCount: 1,
            reason: opts.admitted ? 'admitted' : 'insufficient evidence gaps',
          },
        })},
        coverage_score = ${opts.coverageScore ?? 4},
        current_coverage_score = ${opts.coverageScore ?? 4},
        updated_at = now()
      WHERE id = ${started.sessionId}::uuid
    `;

    await updateResearchSessionStatus(started.sessionId, 'completed', { sql });
    return started.sessionId;
  }

  it('dataset research_v1 has ≥12 samples including ≥3 insufficient-evidence + corrupted quote', () => {
    const lines = readFileSync(DATASET_PATH, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThanOrEqual(12);
    const samples = lines.map(
      (l) => JSON.parse(l) as { id: string; metadata?: { tags?: string[] } }
    );
    const insufficient = samples.filter((s) =>
      (s.metadata?.tags ?? []).includes('insufficient-evidence')
    );
    expect(insufficient.length).toBeGreaterThanOrEqual(3);
    expect(samples.some((s) => s.id === 'adversarial-corrupted-quote')).toBe(true);
  });

  it('allowlist includes research operational keys and excludes content fields', () => {
    for (const key of REQUIRED_ALLOWLIST_KEYS) {
      expect(HOLOCRON_ATTRIBUTE_ALLOWLIST).toContain(key);
    }
    const banned = ['query', 'quote', 'sourceText', 'url', 'report', 'reason'];
    for (const key of banned) {
      expect(HOLOCRON_ATTRIBUTE_ALLOWLIST).not.toContain(key);
    }
  });

  it('control: matching quote scores quote-verifiability 1.0 and CI passes', async () => {
    expect(verifyQuote(GOOD_QUOTE, SOURCE_TEXT, { allowLines: false }).ok).toBe(true);

    const sessionId = await seedSession({
      quote: GOOD_QUOTE,
      sourceText: SOURCE_TEXT,
      url: 'https://example.com/wave8-good-quote',
      admitted: true,
      coverageScore: 4,
    });

    const report = await scoreResearchSession(sessionId, { sql });
    const quoteScore = getScorerScore(report, 'quote-verifiability');
    expect(quoteScore?.score).toBe(1.0);
    expect(quoteScore?.passed).toBe(true);

    const gate = await runResearchCiGate({
      researchSessionId: sessionId,
      databaseUrl: DATABASE_URL,
    });
    expect(gate.exitCode).toBe(0);
    expect(gate.verdict).toBe('passed');
    expect(gate.score).toBe(1.0);
  }, 120_000);

  it('corrupted quote: quote-verifiability < 1.0 and CI fails', async () => {
    expect(verifyQuote(BAD_QUOTE, SOURCE_TEXT, { allowLines: false }).ok).toBe(false);

    const sessionId = await seedSession({
      quote: BAD_QUOTE,
      sourceText: SOURCE_TEXT,
      url: 'https://example.com/wave8-bad-quote',
      admitted: false,
      coverageScore: 2,
    });

    const report = await scoreResearchSession(sessionId, { sql });
    const quoteScore = getScorerScore(report, 'quote-verifiability');
    expect(quoteScore).toBeTruthy();
    expect(quoteScore!.score).toBeLessThan(1.0);
    expect(quoteScore!.passed).toBe(false);

    // Mutation: a stub that always returns 1.0 must fail this assertion.
    expect(quoteScore!.score).not.toBe(1.0);

    const gate = await runCiGate({
      fixture: 'research-session',
      researchSessionId: sessionId,
      databaseUrl: DATABASE_URL,
      dryRun: true,
    });
    expect(gate.exitCode).not.toBe(0);
    expect(gate.verdict).toBe('failed');
    expect(gate.failureReason).toBe('research_scorer_failure');
    expect(gate.researchScorerFailures?.some((f) => f.id === 'quote-verifiability')).toBe(true);
    expect(gate.score).toBeLessThan(1.0);

    // Log-friendly artifact for implementer report
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        corruptedQuoteScore: quoteScore!.score,
        gateExitCode: gate.exitCode,
        failures: gate.researchScorerFailures?.map((f) => f.id),
      })
    );
  }, 120_000);

  it('mutation: scoreQuoteVerifiability drops when quote is corrupted in snapshot', async () => {
    const sessionId = await seedSession({
      quote: GOOD_QUOTE,
      sourceText: SOURCE_TEXT,
      url: 'https://example.com/wave8-mutation',
      admitted: true,
    });
    const good = await scoreResearchSession(sessionId, { sql });
    expect(getScorerScore(good, 'quote-verifiability')?.score).toBe(1.0);

    // Corrupt persisted findings quote without changing sourceText.
    await sql`
      UPDATE research_sessions
      SET findings = ${sql.json({
        claims: [{ id: 'c1', text: 'x', component: 'efficacy' }],
        evidence: [
          {
            id: 'e1',
            claimId: 'c1',
            component: 'efficacy',
            sourceId: 'src-wave8-a',
            independenceGroup: 'g',
            quote: BAD_QUOTE,
            sourceText: SOURCE_TEXT,
            grade: 4,
            entailment: 0.9,
            disconfirmationResolved: true,
            direction: 'supporting',
          },
        ],
        requiredComponents: ['efficacy'],
      })},
      updated_at = now()
      WHERE id = ${sessionId}::uuid
    `;
    await sql`
      UPDATE citations
      SET metadata_json = ${sql.json({
        quote: BAD_QUOTE,
        sourceText: SOURCE_TEXT,
        sourceId: 'src-wave8-a',
      })}
      WHERE session_id = ${sessionId}::uuid
    `;

    const bad = await scoreResearchSession(sessionId, { sql });
    const badScore = getScorerScore(bad, 'quote-verifiability')!;
    expect(badScore.score).toBeLessThan(1.0);

    // Direct pure-function mutation check (stub detection).
    const pure = scoreQuoteVerifiability({
      sessionId: 'pure',
      status: 'completed',
      coverageScore: 4,
      currentCoverageScore: 4,
      findings: {
        evidence: [
          {
            quote: BAD_QUOTE,
            sourceText: SOURCE_TEXT,
            sourceId: 's1',
          },
        ],
      },
      plan: null,
      finalConfidenceSummary: { admitted: true },
      errorText: null,
      iterations: [],
      findingsRows: [],
      citations: [],
      webCalls: [],
    });
    expect(pure.score).toBeLessThan(1.0);
    expect(
      scoreResearchSnapshot({
        sessionId: 'pure',
        status: 'completed',
        coverageScore: 4,
        currentCoverageScore: 4,
        findings: {
          evidence: [{ quote: GOOD_QUOTE, sourceText: SOURCE_TEXT, sourceId: 's1' }],
        },
        plan: null,
        finalConfidenceSummary: { admitted: true },
        errorText: null,
        iterations: [
          {
            id: 'i1',
            iterationNumber: 1,
            summary: 'ok report with citations https://example.com',
            feedback: 'ok',
            coverageScore: 4,
            sources: [{ url: 'https://example.com', sourceId: 's1' }],
            reviewGaps: null,
            status: 'completed',
          },
        ],
        findingsRows: [],
        citations: [
          {
            id: 'c1',
            sourceUrl: 'https://example.com',
            sourceDomain: 'example.com',
            claimText: GOOD_QUOTE,
            claimMarker: null,
            publishedDate: null,
            metadataJson: { quote: GOOD_QUOTE, sourceText: SOURCE_TEXT, sourceId: 's1' },
          },
        ],
        webCalls: [{ id: 'w1', url: 'https://example.com', sourceId: 's1', createdAt: new Date() }],
      }).scores.find((s) => s.id === 'quote-verifiability')?.score
    ).toBe(1.0);
  }, 120_000);
});
