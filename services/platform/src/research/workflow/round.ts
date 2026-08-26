/**
 * Shared research round executor — search + rerank + acquireAdmissibleEvidence.
 * Grade / entailment(+decoys) / disconfirm / gate live in the Wave 3 pipeline.
 * evaluateEvidenceGate remains the only admission judge (via assembleAndEvaluate).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSql, type Sql, toSqlJsonValue } from '../../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../db/connection.ts';
import { extractStructured } from '../../inference/extract-structured.ts';
import { rerankCandidates } from '../../inference/rerank.ts';
import { resolveOrigin } from '../../web/origin.ts';
import { acquireDocument, ladderSearch } from '../../web/provider.ts';
import type { CapturedSource, SearchHit } from '../../web/types.ts';
import { insertCitation } from '../citation-writer.ts';
import { freezeComponents } from '../components.ts';
import { RESEARCH_JUDGE_DISCRIMINATION_FAILED } from '../decoys.ts';
import type { EvidenceGateResult } from '../evidence-gate.ts';
import { insertResearchFinding } from '../findings-writer.ts';
import { insertResearchIteration } from '../iteration-writer.ts';
import { acquireAdmissibleEvidence } from '../pipeline.ts';
import { recordResearchProgress, updateResearchSessionStatus } from '../session-writer.ts';
import { createWebCallLedger } from '../web-call-ledger.ts';
import { decideStop } from './decide-stop.ts';
import type { LedgerFinding, ResearchLedger, RoundHandle, SubQuestion } from './schemas.ts';

const QueriesSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(4),
});

const PlanSchema = z.object({
  components: z.array(z.string().min(1)).min(1).max(6),
  subQuestions: z
    .array(
      z.object({
        text: z.string().min(1),
        component: z.string().min(1),
      })
    )
    .min(1)
    .max(8),
});

export type ExecuteResearchRoundDeps = {
  sql?: Sql;
  databaseUrl?: string;
  abortSignal?: AbortSignal;
  extract?: typeof extractStructured;
  search?: typeof ladderSearch;
  rerank?: typeof rerankCandidates;
  nowMs?: () => number;
  /** Breadth branch attribution — stamped on iterations + web_calls. */
  branchId?: string;
};

export type ExecuteResearchRoundResult = {
  handle: RoundHandle;
  ledger: ResearchLedger;
  gate: EvidenceGateResult | null;
};

async function readSessionStatus(sql: Sql, sessionId: string): Promise<string | null> {
  const rows = await sql<{ status: string }[]>`
    SELECT status FROM research_sessions WHERE id = ${sessionId}::uuid LIMIT 1
  `;
  return rows[0]?.status ?? null;
}

function slugifyComponent(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug.length >= 2 && /^[a-z0-9]/.test(slug)) return slug;
  return `comp-${randomUUID().slice(0, 8)}`;
}

function pickOpenSubQuestion(ledger: ResearchLedger): SubQuestion | null {
  return ledger.subQuestions.find((q) => q.status === 'open') ?? null;
}

function candidateText(hit: SearchHit): string {
  return [hit.title, hit.snippet, hit.inlineContent?.slice(0, 800) ?? '']
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Plan step helper — freeze components + open sub-questions into the ledger.
 * Quick mode stays deterministic (no LLM) to bound wall cost.
 */
export async function planResearchLedger(opts: {
  query: string;
  ledger: ResearchLedger;
  extract?: typeof extractStructured;
}): Promise<ResearchLedger> {
  const extract = opts.extract ?? extractStructured;
  let components: string[] = ['definition', 'mechanism'];
  let subQuestions: SubQuestion[] = [
    {
      id: randomUUID(),
      text: opts.query,
      component: 'definition',
      status: 'open',
    },
  ];

  // Quick stays deterministic and single-component so one well-evidenced
  // question can clear the gate in a single round. Depth/breadth may plan.
  if (opts.ledger.mode === 'quick') {
    components = ['definition'];
    subQuestions = [
      {
        id: randomUUID(),
        text: opts.query,
        component: 'definition',
        status: 'open',
      },
    ];
  } else {
    try {
      const planned = await withTimeout(
        extract(
          PlanSchema,
          [
            'Plan a focused web research investigation.',
            `Query: ${opts.query}`,
            'Return short slug components (lowercase hyphenated) and concrete sub-questions.',
            'Keep to 2-3 components and matching sub-questions.',
          ].join('\n'),
          'divergent'
        ),
        45_000,
        'plan'
      );
      components = planned.components.map(slugifyComponent).slice(0, 3);
      subQuestions = planned.subQuestions.slice(0, 3).map((sq) => ({
        id: randomUUID(),
        text: sq.text,
        component: slugifyComponent(sq.component),
        status: 'open' as const,
      }));
      for (const sq of subQuestions) {
        if (!components.includes(sq.component)) {
          sq.component = components[0]!;
        }
      }
    } catch {
      // keep deterministic defaults
    }
  }

  const frozen = freezeComponents(components);
  return {
    ...opts.ledger,
    components: [...frozen.components],
    componentsHash: frozen.hash,
    subQuestions:
      subQuestions.length > 0
        ? subQuestions
        : [
            {
              id: randomUUID(),
              text: opts.query,
              component: frozen.components[0]!,
              status: 'open',
            },
          ],
  };
}

/**
 * Execute one research round. Cooperative cancel: if session status is cancelled,
 * set stopReason=canceled and return (do NOT bail()).
 */
export async function executeResearchRound(opts: {
  sessionId: string;
  mode: RoundHandle['mode'];
  round: number;
  ledger: ResearchLedger;
  deps?: ExecuteResearchRoundDeps;
}): Promise<ExecuteResearchRoundResult> {
  const deps = opts.deps ?? {};
  const nowMs = deps.nowMs ?? Date.now;
  const roundStarted = nowMs();
  const extract = deps.extract ?? extractStructured;
  const search = deps.search ?? ladderSearch;
  const rerank = deps.rerank ?? rerankCandidates;
  const branchId = deps.branchId;

  const ownsSql = !deps.sql;
  const sql =
    deps.sql ??
    createSql(
      resolveHolocronNonprodDatabaseUrl({
        databaseUrl: deps.databaseUrl,
        context: 'research round',
      }),
      { max: 1 }
    );

  let ledger: ResearchLedger = { ...opts.ledger, spend: { ...opts.ledger.spend } };
  let gate: EvidenceGateResult | null = null;
  const round = Math.max(1, Math.floor(opts.round));

  try {
    // Cancellation is terminal and takes precedence over claiming another round.
    const statusBeforeAdvance = await readSessionStatus(sql, opts.sessionId);
    if (statusBeforeAdvance === 'cancelled') {
      ledger = { ...ledger, stopReason: 'canceled' };
      return {
        handle: {
          sessionId: opts.sessionId,
          mode: opts.mode,
          round,
          stopReason: 'canceled',
        },
        ledger,
        gate: null,
      };
    }

    // 1) Atomically claim one slot from the session's global round budget.
    const progress = await recordResearchProgress({
      sessionId: opts.sessionId,
      phase: 'searching',
      advanceIteration: true,
      sourceCount: ledger.seenUrls.length,
      sql,
      force: true,
    });
    if (!progress.ok) {
      if (progress.errorCode === 'ITERATION_BOUNDS') {
        const statusAtBound = await readSessionStatus(sql, opts.sessionId);
        const stopReason = statusAtBound === 'cancelled' ? 'canceled' : 'round_cap';
        ledger = { ...ledger, stopReason };
        return {
          handle: {
            sessionId: opts.sessionId,
            mode: opts.mode,
            round,
            stopReason,
          },
          ledger,
          gate,
        };
      }
      throw new Error(`research progress advance failed: ${progress.error}`);
    }

    // 2) CANCEL check — cooperative latch; never bail()
    const status = await readSessionStatus(sql, opts.sessionId);
    if (status === 'cancelled') {
      ledger = { ...ledger, stopReason: 'canceled' };
      return {
        handle: {
          sessionId: opts.sessionId,
          mode: opts.mode,
          round,
          stopReason: 'canceled',
        },
        ledger,
        gate: null,
      };
    }

    // Ensure running (terminal latch will soft-no-op if cancelled raced in)
    await updateResearchSessionStatus(opts.sessionId, 'running', { sql });

    // 3) Select open sub-question
    const open = pickOpenSubQuestion(ledger);
    if (!open) {
      ledger = {
        ...ledger,
        stopReason: ledger.findings.length === 0 ? 'no_evidence' : 'all_closed',
      };
      const stopReason = decideStop({
        ledger,
        roundJustFinished: round,
        nowMs: nowMs(),
      });
      ledger = { ...ledger, stopReason };
      return {
        handle: {
          sessionId: opts.sessionId,
          mode: opts.mode,
          round,
          stopReason,
        },
        ledger,
        gate,
      };
    }

    // 4) Queries via extractStructured (divergent) — quick uses the open text only.
    let queries: string[] = [open.text];
    if (opts.mode !== 'quick') {
      try {
        const planned = await withTimeout(
          extract(
            QueriesSchema,
            [
              'Generate 1-2 divergent web search queries for this sub-question.',
              `Sub-question: ${open.text}`,
              `Component: ${open.component}`,
              `Overall query: ${ledger.query}`,
              'Return concrete searchable queries, not commentary.',
            ].join('\n'),
            'divergent'
          ),
          45_000,
          'query_plan'
        );
        queries = planned.queries.slice(0, 2);
      } catch {
        queries = [open.text];
        ledger = { ...ledger, degraded: true, gaps: [...ledger.gaps, 'query_plan_degraded'] };
      }
    }

    const ledgerQueries = [...ledger.queriesRun];
    const newFindings: LedgerFinding[] = [];
    const iterationSources: Array<{
      title?: string;
      url?: string;
      domain?: string;
      citationId?: string;
    }> = [];
    let roundToolCalls = 0;
    let roundTokens = 0;
    let roundCost = 0;
    let admittedThisRound = 0;

    const ledgerHandle = createWebCallLedger(sql, { branchId: branchId ?? null });
    const topN = opts.mode === 'quick' ? 2 : 4;
    const maxDocsToRead = opts.mode === 'quick' ? 2 : 3;
    const captured: CapturedSource[] = [];
    const titlesByUrl = new Map<string, string>();
    const publishedByUrl = new Map<string, string | null>();

    for (const query of queries) {
      if (deps.abortSignal?.aborted) break;
      const cancelMid = await readSessionStatus(sql, opts.sessionId);
      if (cancelMid === 'cancelled') {
        ledger = {
          ...ledger,
          stopReason: 'canceled',
          queriesRun: ledgerQueries,
          findings: [...ledger.findings, ...newFindings],
          spend: {
            wallMs: ledger.spend.wallMs + Math.max(0, nowMs() - roundStarted),
            tokens: ledger.spend.tokens + roundTokens,
            toolCalls: ledger.spend.toolCalls + roundToolCalls,
            costUsd: ledger.spend.costUsd + roundCost,
          },
        };
        await persistIterationPartial({
          sql,
          sessionId: opts.sessionId,
          round,
          ledger,
          queries,
          sources: iterationSources,
          feedback: 'cancelled mid-round',
          branchId,
        });
        return {
          handle: {
            sessionId: opts.sessionId,
            mode: opts.mode,
            round,
            stopReason: 'canceled',
          },
          ledger,
          gate,
        };
      }

      ledgerQueries.push(query);
      roundToolCalls += 1;

      let hits: SearchHit[] = [];
      try {
        const searchResult = await withTimeout(
          search(query, {
            runId: opts.sessionId,
            signal: deps.abortSignal,
            ledger: ledgerHandle,
          }),
          opts.mode === 'quick' ? 45_000 : 90_000,
          'search'
        );
        hits = searchResult.hits;
        for (const call of searchResult.calls) {
          roundCost += call.costUsd ?? 0;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ledger = {
          ...ledger,
          gaps: [...ledger.gaps, `search_failed:${msg.slice(0, 120)}`],
          degraded: true,
        };
        continue;
      }

      if (hits.length === 0) continue;

      const unseen = hits.filter((h) => !ledger.seenUrls.includes(h.url));
      const pool = unseen.length > 0 ? unseen : hits;

      let rankedIds: string[] = pool.map((h) => h.url);
      try {
        const ranked = await rerank({
          query,
          candidates: pool.map((h) => ({ id: h.url, text: candidateText(h) })),
          runId: opts.sessionId,
          topN,
          databaseUrl: deps.databaseUrl,
          abortSignal: deps.abortSignal,
          mode: 'labeled-degraded',
        });
        roundTokens += ranked.totalTokens;
        if (ranked.degraded) {
          ledger = { ...ledger, degraded: true, gaps: [...ledger.gaps, 'rerank_degraded'] };
        }
        rankedIds = ranked.results.map((r) => r.id);
      } catch {
        ledger = { ...ledger, degraded: true, gaps: [...ledger.gaps, 'rerank_failed'] };
      }

      const byUrl = new Map(pool.map((h) => [h.url, h]));
      const selected = rankedIds
        .map((id) => byUrl.get(id))
        .filter((h): h is SearchHit => Boolean(h))
        .slice(0, Math.min(topN, maxDocsToRead));

      for (const hit of selected) {
        if (ledger.seenUrls.includes(hit.url) && newFindings.some((f) => f.sourceUrl === hit.url)) {
          continue;
        }

        let sourceText = hit.inlineContent ?? hit.snippet ?? '';
        let title = hit.title;
        // Prefer inline when present; only read when necessary (bounded).
        try {
          const doc = await withTimeout(
            acquireDocument(hit, {
              runId: opts.sessionId,
              signal: deps.abortSignal,
              ledger: ledgerHandle,
            }),
            20_000,
            'read'
          );
          sourceText = doc.document.sourceText || sourceText;
          title = doc.document.title || title;
          if (doc.call) roundCost += doc.call.costUsd ?? 0;
          roundToolCalls += 1;
        } catch {
          ledger = {
            ...ledger,
            gaps: [...ledger.gaps, `read_failed:${hit.url}`],
          };
        }

        if (sourceText.trim().length < 40) continue;

        const origin = resolveOrigin({ finalUrl: hit.url, text: sourceText });
        titlesByUrl.set(hit.url, title);
        publishedByUrl.set(hit.url, hit.publishedAt);
        captured.push({
          sourceId: origin.sourceId,
          canonicalDomain: origin.canonicalDomain,
          url: hit.url,
          publishedDate: hit.publishedAt,
          retrievedAt: new Date().toISOString(),
          sourceText,
          provider: hit.provider,
          webCallId: hit.webCallId,
        });

        if (!ledger.seenUrls.includes(hit.url)) {
          ledger = { ...ledger, seenUrls: [...ledger.seenUrls, hit.url] };
        }
      }
    }

    const uniqueCaptured = [...new Map(captured.map((c) => [c.url, c])).values()];

    if (uniqueCaptured.length > 0 && ledger.components.length > 0) {
      try {
        const frozen = freezeComponents([...ledger.components]);
        const acquired = await withTimeout(
          acquireAdmissibleEvidence({
            question: open.text,
            components: frozen,
            mode: opts.mode === 'quick' ? 'shallow' : opts.mode === 'breadth' ? 'deep' : 'standard',
            runId: opts.sessionId,
            abortSignal: deps.abortSignal,
            sql,
            ledger: ledgerHandle,
            capturedSources: uniqueCaptured,
            maxHits: uniqueCaptured.length,
            maxPassagesPerDoc: opts.mode === 'quick' ? 1 : 2,
          }),
          opts.mode === 'quick' ? 240_000 : 300_000,
          'acquire_evidence'
        );
        gate = acquired.gate;
        ledger = {
          ...ledger,
          lastGate: acquired.gate,
          lastGateInput: acquired.gateInput,
        };
        if (acquired.degraded.length > 0) {
          const judgeFailed = acquired.degraded.includes(RESEARCH_JUDGE_DISCRIMINATION_FAILED);
          ledger = {
            ...ledger,
            degraded: judgeFailed || ledger.degraded,
            gaps: [...new Set([...ledger.gaps, ...acquired.degraded])],
          };
        }
        for (const call of acquired.webCalls) {
          roundCost += call.costUsd ?? 0;
          roundToolCalls += 1;
        }

        await sql`
          UPDATE research_sessions
          SET plan = COALESCE(plan, '{}'::jsonb) || ${sql.json(
            toSqlJsonValue({
              gate: {
                admitted: acquired.gate.admitted,
                missingComponents: acquired.gate.missingComponents,
                independentSourceCount: acquired.gate.independentSourceCount,
                reasonCode: acquired.gate.admitted
                  ? 'admitted'
                  : acquired.gate.missingComponents.length > 0
                    ? 'missing-components'
                    : acquired.gate.independentSourceCount < 2
                      ? 'independent-source-floor'
                      : acquired.gate.reason,
                coveredComponents: acquired.gate.coveredComponents,
                direction: acquired.gate.direction,
                admittedEvidenceIds: acquired.gate.admittedEvidenceIds,
                rejectedEvidenceIds: acquired.gate.rejectedEvidenceIds,
                reason: acquired.gate.reason,
              },
            })
          )},
              updated_at = now()
          WHERE id = ${opts.sessionId}::uuid
        `;

        const admittedIds = new Set(acquired.gate.admittedEvidenceIds);
        const sourceById = new Map(acquired.sources.map((s) => [s.sourceId, s]));
        const claimById = new Map(acquired.gateInput.claims.map((c) => [c.id, c]));

        for (const item of acquired.gateInput.evidence) {
          if (!admittedIds.has(item.id)) continue;
          const claim = claimById.get(item.claimId);
          if (!claim) continue;
          const src = sourceById.get(item.sourceId);
          const sourceUrl = src?.url ?? item.sourceId;
          const title = titlesByUrl.get(sourceUrl) ?? claim.text.slice(0, 120);
          if (item.quote === item.sourceText) {
            ledger = {
              ...ledger,
              gaps: [...new Set([...ledger.gaps, 'quote_equals_sourceText'])],
            };
            continue;
          }

          const citation = await insertCitation({
            sessionId: opts.sessionId,
            sourceUrl,
            sourceTitle: title,
            sourceDomain: src?.canonicalDomain,
            claimText: claim.text,
            claimMarker: item.quote.slice(0, 80),
            sourceType: item.sourceId.startsWith('doi:') ? 'doi' : 'web',
            credibilityScore: item.grade,
            evidenceType: item.direction,
            publishedDate: publishedByUrl.get(sourceUrl) ?? src?.publishedDate ?? undefined,
            sql,
          });

          const citationId = citation.ok ? citation.citationId : undefined;
          if (citation.ok) {
            iterationSources.push(citation.displaySource);
          } else {
            iterationSources.push({
              title,
              url: sourceUrl,
              domain: src?.canonicalDomain,
            });
          }

          if (citationId) {
            await insertResearchFinding({
              sessionId: opts.sessionId,
              claimText: claim.text,
              citationIds: [citationId],
              claimCategory: claim.component,
              sourceCredibilityScore: item.grade / 5,
              evidenceQualityScore: item.entailment,
              corroborationScore: acquired.gate.independentSourceCount >= 2 ? 0.8 : 0.4,
              recencyScore: (publishedByUrl.get(sourceUrl) ?? src?.publishedDate) ? 0.7 : 0.4,
              expertConsensusScore: 0.5,
              confidenceScore: Math.min(1, (item.grade / 5 + item.entailment) / 2),
              system: opts.mode === 'quick' ? 'simple' : 'deep',
              sql,
            });
          }

          newFindings.push({
            id: item.id,
            claimText: claim.text,
            component: claim.component,
            quote: item.quote,
            sourceText: item.sourceText,
            sourceUrl,
            sourceId: item.sourceId,
            grade: item.grade,
            entailment: item.entailment,
            disconfirmationResolved: item.disconfirmationResolved,
            direction: item.direction,
            citationId,
          });
          admittedThisRound += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ledger = {
          ...ledger,
          degraded: true,
          gaps: [...new Set([...ledger.gaps, `acquire_failed:${msg.slice(0, 160)}`])],
        };
      }
    }

    // 10) Update ledger: close sub-question when we admitted evidence for it
    let subQuestions = ledger.subQuestions.map((sq) => ({ ...sq }));
    if (admittedThisRound > 0) {
      subQuestions = subQuestions.map((sq) =>
        sq.id === open.id ? { ...sq, status: 'closed' as const } : sq
      );
    }

    const dryRounds = admittedThisRound === 0 ? ledger.dryRounds + 1 : 0;
    if (admittedThisRound === 0) {
      ledger = {
        ...ledger,
        gaps: [...new Set([...ledger.gaps, `no_admitted_evidence_round_${round}`])],
      };
    }

    ledger = {
      ...ledger,
      findings: [...ledger.findings, ...newFindings],
      subQuestions,
      queriesRun: ledgerQueries,
      dryRounds,
      spend: {
        wallMs: ledger.spend.wallMs + Math.max(0, nowMs() - roundStarted),
        tokens: ledger.spend.tokens + roundTokens,
        toolCalls: ledger.spend.toolCalls + roundToolCalls,
        costUsd: ledger.spend.costUsd + roundCost,
      },
    };

    // 12) Persist iteration ON CONFLICT DO NOTHING
    await persistIterationPartial({
      sql,
      sessionId: opts.sessionId,
      round,
      ledger,
      queries,
      sources: iterationSources,
      feedback:
        admittedThisRound > 0
          ? `admitted ${admittedThisRound} evidence item(s) for ${open.component}`
          : `no admissible evidence this round for ${open.component}`,
      branchId,
    });

    // Re-check cancel before deciding stop
    const statusAfter = await readSessionStatus(sql, opts.sessionId);
    if (statusAfter === 'cancelled') {
      ledger = { ...ledger, stopReason: 'canceled' };
      return {
        handle: {
          sessionId: opts.sessionId,
          mode: opts.mode,
          round,
          stopReason: 'canceled',
        },
        ledger,
        gate,
      };
    }

    // 13) decideStop (never coverage)
    const stopReason = decideStop({
      ledger,
      roundJustFinished: round,
      nowMs: nowMs(),
    });
    ledger = { ...ledger, stopReason };

    return {
      handle: {
        sessionId: opts.sessionId,
        mode: opts.mode,
        round,
        stopReason,
      },
      ledger,
      gate,
    };
  } finally {
    if (ownsSql) await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

async function persistIterationPartial(opts: {
  sql: Sql;
  sessionId: string;
  round: number;
  ledger: ResearchLedger;
  queries: string[];
  sources: Array<{ title?: string; url?: string; domain?: string; citationId?: string }>;
  feedback: string;
  branchId?: string;
}): Promise<void> {
  const summary =
    opts.ledger.findings.length > 0
      ? opts.ledger.findings
          .slice(-5)
          .map((f) => f.claimText)
          .join('; ')
          .slice(0, 2000)
      : `Round ${opts.round}: ${opts.feedback}`;

  await insertResearchIteration({
    sessionId: opts.sessionId,
    iterationNumber: opts.round,
    summary: summary.length > 0 ? summary : `Round ${opts.round} partial`,
    feedback: opts.feedback,
    refinedQueries: opts.queries,
    sources: opts.sources,
    status: opts.ledger.stopReason === 'canceled' ? 'cancelled' : 'completed',
    system: opts.ledger.mode === 'quick' ? 'simple' : 'deep',
    branchId: opts.branchId,
    findings: opts.ledger.findings,
    reviewGaps: opts.ledger.gaps,
    durationMs: Math.round(opts.ledger.spend.wallMs),
    estimatedCostUsd: opts.ledger.spend.costUsd,
    sql: opts.sql,
  });
}
