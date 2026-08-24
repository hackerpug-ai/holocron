/**
 * research-breadth Mastra workflow:
 *   preflight → decompose → .foreach(subResearch,{concurrency:2})
 *   → merge → optional .dountil(gapRound) cap 1 → synthesize → commit
 *
 * subResearch NEVER setState — merge is the sole ledger writer.
 * Independence is origin/sourceId based: same origin on two branches counts once.
 * Width 2 justified by fleet (convergent/judge share reviewer).
 */
import { randomUUID } from 'node:crypto';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { createSql } from '../../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../db/connection.ts';
import { extractStructured } from '../../inference/extract-structured.ts';
import { updateResearchSessionStatus } from '../session-writer.ts';
import { computeCoverageScore, finalizeResearchCommit } from './commit.ts';
import { decideStop } from './decide-stop.ts';
import { executeResearchRound } from './round.ts';
import {
  BreadthMergeStatsSchema,
  emptyLedger,
  emptySpend,
  MODE_DEFAULTS,
  ResearchInputSchema,
  type ResearchLedger,
  ResearchLedgerSchema,
  type ResearchOutput,
  ResearchOutputSchema,
  type StopReason,
  type SubQuestionJob,
  SubQuestionJobSchema,
  type SubResult,
  SubResultSchema,
} from './schemas.ts';

const MAX_SUB_JOBS = 6;
const FOREACH_CONCURRENCY = 2;
const MAX_INTERNAL_ROUNDS = 2;

const SynthesisSchema = z.object({
  report: z.string().min(1),
  gaps: z.array(z.string()).default([]),
});

const DecomposeSchema = z.object({
  components: z.array(z.string().min(1)).min(1).max(6),
  subQuestions: z
    .array(
      z.object({
        text: z.string().min(1),
        component: z.string().min(1),
      })
    )
    .min(1)
    .max(MAX_SUB_JOBS),
});

const StoredResultSchema = ResearchOutputSchema;

type PreflightOut = {
  sessionId: string;
  query: string;
  mode: 'quick' | 'depth' | 'breadth';
  maxRounds: number;
  wallBudgetMs: number;
  tokenBudget: number;
  toolcallBudget: number;
  replay: boolean;
  storedResult: ResearchOutput | null;
};

const PreflightOutSchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().min(1),
  mode: z.enum(['quick', 'depth', 'breadth']),
  maxRounds: z.number().int().positive(),
  wallBudgetMs: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
  toolcallBudget: z.number().int().positive(),
  replay: z.boolean(),
  storedResult: StoredResultSchema.nullable(),
});

const MergeHandleSchema = z.object({
  sessionId: z.string().uuid(),
  mode: z.enum(['quick', 'depth', 'breadth']),
  round: z.number().int().nonnegative(),
  stopReason: ResearchOutputSchema.shape.stopReason,
  needsGapRound: z.boolean(),
  mergeStats: BreadthMergeStatsSchema,
});

const GapHandleSchema = MergeHandleSchema;

function mapWorkflowStatusToDb(
  mastraStatus: string,
  stopReason: StopReason | null
): 'completed' | 'failed' | 'cancelled' | 'paused' {
  if (stopReason === 'canceled') return 'cancelled';
  if (mastraStatus === 'canceled' || mastraStatus === 'cancelled') return 'cancelled';
  if (mastraStatus === 'suspended' || mastraStatus === 'paused') return 'paused';
  if (mastraStatus === 'tripwire' || mastraStatus === 'failed') return 'failed';
  return 'completed';
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

async function loadStoredResult(sessionId: string): Promise<ResearchOutput | null> {
  const sql = createSql(
    resolveHolocronNonprodDatabaseUrl({ context: 'research-breadth preflight' }),
    { max: 1 }
  );
  try {
    const rows = await sql<
      {
        status: string;
        findings: unknown;
        coverage_score: number | null;
        error_text: string | null;
      }[]
    >`
      SELECT status, findings, coverage_score, error_text
      FROM research_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    if (row.status !== 'completed' && row.status !== 'failed' && row.status !== 'cancelled') {
      return null;
    }
    const findings =
      row.findings && typeof row.findings === 'object' && !Array.isArray(row.findings)
        ? (row.findings as Record<string, unknown>)
        : {};
    const parsed = StoredResultSchema.safeParse({
      sessionId,
      status: row.status,
      stopReason: (findings.stopReason as StopReason | null | undefined) ?? null,
      admitted: Boolean(findings.admitted),
      coverageScore:
        typeof row.coverage_score === 'number'
          ? row.coverage_score
          : typeof findings.coverageScore === 'number'
            ? findings.coverageScore
            : 0,
      report:
        typeof findings.report === 'string'
          ? findings.report
          : (row.error_text ?? `session ${row.status}`),
      gaps: Array.isArray(findings.gaps) ? findings.gaps.map(String) : [],
      rounds: typeof findings.rounds === 'number' ? findings.rounds : 0,
      findingsCount: typeof findings.findingsCount === 'number' ? findings.findingsCount : 0,
    });
    return parsed.success ? parsed.data : null;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}

/**
 * Deterministic origin-aware merge. Same sourceId across branches counts once
 * for independence; duplicate finding ids / identical (sourceId,quote) collapse.
 */
export function mergeSubResults(opts: {
  query: string;
  mode: ResearchLedger['mode'];
  maxRounds: number;
  wallBudgetMs: number;
  tokenBudget: number;
  toolcallBudget: number;
  startedAtMs: number;
  results: SubResult[];
}): { ledger: ResearchLedger; stats: z.infer<typeof BreadthMergeStatsSchema> } {
  const branchIds = [...new Set(opts.results.map((r) => r.branchId))];
  const seenFindingKeys = new Set<string>();
  const findings: ResearchLedger['findings'] = [];
  const queriesRun: string[] = [];
  const seenUrls: string[] = [];
  const gaps: string[] = [];
  let spend = emptySpend();
  let degraded = false;
  let canceled = false;

  for (const result of opts.results) {
    for (const q of result.queriesRun) {
      if (!queriesRun.includes(q)) queriesRun.push(q);
    }
    for (const url of result.seenUrls) {
      if (!seenUrls.includes(url)) seenUrls.push(url);
    }
    for (const gap of result.gaps) {
      if (!gaps.includes(gap)) gaps.push(gap);
    }
    spend = {
      wallMs: spend.wallMs + result.spend.wallMs,
      tokens: spend.tokens + result.spend.tokens,
      toolCalls: spend.toolCalls + result.spend.toolCalls,
      costUsd: spend.costUsd + result.spend.costUsd,
    };
    if (result.degraded) degraded = true;
    if (result.stopReason === 'canceled') canceled = true;

    for (const finding of result.findings) {
      const key = `${finding.sourceId}::${finding.quote}`;
      if (seenFindingKeys.has(key) || seenFindingKeys.has(finding.id)) continue;
      seenFindingKeys.add(key);
      seenFindingKeys.add(finding.id);
      findings.push(finding);
    }
  }

  const independentSourceCount = new Set(findings.map((f) => f.sourceId)).size;
  const components = [
    ...new Set(opts.results.map((r) => slugifyComponent(r.component)).filter(Boolean)),
  ];
  const subQuestions = opts.results.map((r) => ({
    id: r.jobId,
    text: r.text,
    component: slugifyComponent(r.component),
    status: (r.findings.length > 0 ? 'closed' : 'open') as 'open' | 'closed' | 'blocked',
  }));

  const ledger = emptyLedger({
    query: opts.query,
    mode: opts.mode,
    maxRounds: opts.maxRounds,
    wallBudgetMs: opts.wallBudgetMs,
    tokenBudget: opts.tokenBudget,
    toolcallBudget: opts.toolcallBudget,
    startedAtMs: opts.startedAtMs,
  });

  const next: ResearchLedger = {
    ...ledger,
    findings,
    subQuestions,
    queriesRun,
    seenUrls,
    gaps,
    spend,
    degraded,
    stopReason: canceled ? 'canceled' : null,
    components: components.length > 0 ? components : ['breadth'],
  };

  return {
    ledger: next,
    stats: {
      branchCount: branchIds.length,
      findingCount: findings.length,
      independentSourceCount,
      dedupedFindingCount: findings.length,
      branchIds,
    },
  };
}

function deterministicJobs(input: PreflightOut): SubQuestionJob[] {
  // Enumerative fallback: split on "and"/";" or dual noun phrases; always ≥2 for breadth.
  const parts = input.query
    .split(/\band\b|;|\bv[sS]\.?\b|\|/g)
    .map((p) => p.replace(/[?.!,]/g, '').trim())
    .filter((p) => p.length >= 8)
    .slice(0, MAX_SUB_JOBS);

  const texts =
    parts.length >= 2
      ? parts.slice(0, Math.min(4, parts.length))
      : [
          `Definition and core idea: ${input.query}`,
          `Mechanism or contrasting facet: ${input.query}`,
        ];

  const internalRounds = Math.min(MAX_INTERNAL_ROUNDS, Math.max(1, input.maxRounds));
  return texts.slice(0, Math.min(MAX_SUB_JOBS, texts.length)).map((text, i) => ({
    sessionId: input.sessionId,
    jobId: randomUUID(),
    branchId: `breadth-${String.fromCharCode(97 + i)}`,
    text,
    component: i === 0 ? 'definition' : i === 1 ? 'mechanism' : `facet-${i + 1}`,
    query: input.query,
    mode: 'breadth' as const,
    maxInternalRounds: internalRounds,
    wallBudgetMs: Math.max(30_000, Math.floor(input.wallBudgetMs / Math.max(2, texts.length))),
    tokenBudget: Math.max(4_000, Math.floor(input.tokenBudget / Math.max(2, texts.length))),
    toolcallBudget: Math.max(4, Math.floor(input.toolcallBudget / Math.max(2, texts.length))),
    iterationBase: (i + 1) * 100,
  }));
}

const preflightStep = createStep({
  id: 'research-breadth-preflight',
  inputSchema: ResearchInputSchema,
  outputSchema: PreflightOutSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, bail }) => {
    const mode = inputData.mode ?? 'breadth';
    const defaults = MODE_DEFAULTS[mode];
    const stored = await loadStoredResult(inputData.sessionId);
    if (stored) {
      return bail(stored);
    }

    await updateResearchSessionStatus(inputData.sessionId, 'running');

    const out: PreflightOut = {
      sessionId: inputData.sessionId,
      query: inputData.query,
      mode: mode === 'quick' || mode === 'depth' ? mode : 'breadth',
      maxRounds: inputData.maxRounds ?? defaults.maxRounds,
      wallBudgetMs: inputData.wallBudgetMs ?? defaults.wallBudgetMs,
      tokenBudget: inputData.tokenBudget ?? defaults.tokenBudget,
      toolcallBudget: inputData.toolcallBudget ?? defaults.toolcallBudget,
      replay: false,
      storedResult: null,
    };
    return out;
  },
});

const decomposeStep = createStep({
  id: 'research-breadth-decompose',
  inputSchema: PreflightOutSchema,
  outputSchema: z.array(SubQuestionJobSchema),
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData }) => {
    // Cooperative cancel before fan-out.
    const sql = createSql(
      resolveHolocronNonprodDatabaseUrl({ context: 'research-breadth decompose' }),
      { max: 1 }
    );
    try {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM research_sessions WHERE id = ${inputData.sessionId}::uuid LIMIT 1
      `;
      if (rows[0]?.status === 'cancelled') {
        return [] as SubQuestionJob[];
      }
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }

    let jobs = deterministicJobs(inputData);
    try {
      const planned = await withTimeout(
        extractStructured(
          DecomposeSchema,
          [
            'Decompose this research question into independent sub-questions for parallel web research.',
            `Query: ${inputData.query}`,
            'Return 2-4 short slug components and matching concrete sub-questions.',
            'Each sub-question must be independently searchable.',
          ].join('\n'),
          'divergent'
        ),
        45_000,
        'decompose'
      );
      const internalRounds = Math.min(MAX_INTERNAL_ROUNDS, Math.max(1, inputData.maxRounds));
      const capped = planned.subQuestions.slice(0, MAX_SUB_JOBS);
      if (capped.length >= 2) {
        jobs = capped.map((sq, i) => ({
          sessionId: inputData.sessionId,
          jobId: randomUUID(),
          branchId: `breadth-${String.fromCharCode(97 + i)}`,
          text: sq.text,
          component: slugifyComponent(sq.component || planned.components[i] || `facet-${i + 1}`),
          query: inputData.query,
          mode: 'breadth' as const,
          maxInternalRounds: internalRounds,
          wallBudgetMs: Math.max(
            30_000,
            Math.floor(inputData.wallBudgetMs / Math.max(2, capped.length))
          ),
          tokenBudget: Math.max(
            4_000,
            Math.floor(inputData.tokenBudget / Math.max(2, capped.length))
          ),
          toolcallBudget: Math.max(
            4,
            Math.floor(inputData.toolcallBudget / Math.max(2, capped.length))
          ),
          iterationBase: (i + 1) * 100,
        }));
      }
    } catch {
      // keep deterministicJobs
    }

    // Breadth always fans at least 2 when not cancelled.
    if (jobs.length === 1) {
      jobs = deterministicJobs(inputData);
    }
    return jobs.slice(0, MAX_SUB_JOBS);
  },
});

const subResearchStep = createStep({
  id: 'research-breadth-sub',
  inputSchema: SubQuestionJobSchema,
  outputSchema: SubResultSchema,
  // Intentionally no stateSchema / setState — merge owns the ledger.
  execute: async ({ inputData, abortSignal }) => {
    const startedAtMs = Date.now();
    let ledger = emptyLedger({
      query: inputData.query,
      mode: 'breadth',
      maxRounds: inputData.maxInternalRounds,
      wallBudgetMs: inputData.wallBudgetMs,
      tokenBudget: inputData.tokenBudget,
      toolcallBudget: inputData.toolcallBudget,
      startedAtMs,
    });
    ledger = {
      ...ledger,
      components: [inputData.component],
      subQuestions: [
        {
          id: inputData.jobId,
          text: inputData.text,
          component: inputData.component,
          status: 'open',
        },
      ],
    };

    let stopReason: StopReason | null = null;
    let rounds = 0;

    for (let i = 0; i < inputData.maxInternalRounds; i++) {
      if (abortSignal?.aborted) {
        stopReason = 'canceled';
        break;
      }
      rounds = i + 1;
      // Unique iteration_number across concurrent branches.
      const iterationNumber = inputData.iterationBase + rounds;
      const result = await executeResearchRound({
        sessionId: inputData.sessionId,
        mode: 'breadth',
        round: iterationNumber,
        ledger,
        deps: {
          branchId: inputData.branchId,
          abortSignal,
        },
      });
      ledger = result.ledger;
      // Local branch ledger only — never setState here.
      stopReason = result.handle.stopReason;
      if (stopReason) break;
    }

    return {
      jobId: inputData.jobId,
      branchId: inputData.branchId,
      component: inputData.component,
      text: inputData.text,
      findings: ledger.findings,
      queriesRun: ledger.queriesRun,
      seenUrls: ledger.seenUrls,
      gaps: ledger.gaps,
      spend: ledger.spend,
      stopReason,
      rounds,
      degraded: ledger.degraded,
    } satisfies SubResult;
  },
});

const mergeStep = createStep({
  id: 'research-breadth-merge',
  inputSchema: z.array(SubResultSchema),
  outputSchema: MergeHandleSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, setState, getInitData }) => {
    const init = getInitData<z.infer<typeof ResearchInputSchema>>();
    if (!init?.sessionId) {
      throw new Error('research-breadth-merge: missing sessionId from init data');
    }
    const defaults = MODE_DEFAULTS.breadth;
    const realSessionId = init.sessionId;
    const maxRounds = init.maxRounds ?? defaults.maxRounds;
    const wallBudgetMs = init.wallBudgetMs ?? defaults.wallBudgetMs;
    const tokenBudget = init.tokenBudget ?? defaults.tokenBudget;
    const toolcallBudget = init.toolcallBudget ?? defaults.toolcallBudget;
    const query = init.query;

    if (inputData.length === 0) {
      const canceledLedger = emptyLedger({
        query,
        mode: 'breadth',
        maxRounds,
        wallBudgetMs,
        tokenBudget,
        toolcallBudget,
        startedAtMs: Date.now(),
      });
      const ledger: ResearchLedger = { ...canceledLedger, stopReason: 'canceled' };
      await setState(ledger);
      return {
        sessionId: realSessionId,
        mode: 'breadth' as const,
        round: 0,
        stopReason: 'canceled' as const,
        needsGapRound: false,
        mergeStats: {
          branchCount: 0,
          findingCount: 0,
          independentSourceCount: 0,
          dedupedFindingCount: 0,
          branchIds: [],
        },
      };
    }

    const { ledger, stats } = mergeSubResults({
      query,
      mode: 'breadth',
      maxRounds,
      wallBudgetMs,
      tokenBudget,
      toolcallBudget,
      startedAtMs: Date.now(),
      results: inputData,
    });

    const open = ledger.subQuestions.filter((q) => q.status === 'open');
    const needsGapRound =
      ledger.stopReason !== 'canceled' &&
      (open.length > 0 || ledger.findings.length === 0 || ledger.gaps.length > 0);

    // Sole setState in the fan-out path.
    await setState(ledger);

    return {
      sessionId: realSessionId,
      mode: 'breadth' as const,
      round: Math.max(0, ...inputData.map((r) => r.rounds)),
      stopReason: ledger.stopReason,
      needsGapRound,
      mergeStats: stats,
    };
  },
});

const gapRoundStep = createStep({
  id: 'research-breadth-gap',
  inputSchema: MergeHandleSchema,
  outputSchema: GapHandleSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, state, setState }) => {
    if (!inputData.needsGapRound || inputData.stopReason === 'canceled') {
      return { ...inputData, needsGapRound: false };
    }

    const parsed = ResearchLedgerSchema.safeParse(state);
    if (!parsed.success) {
      return { ...inputData, needsGapRound: false };
    }

    let ledger = parsed.data;
    const open = ledger.subQuestions.find((q) => q.status === 'open');
    if (!open && ledger.findings.length > 0) {
      await setState({ ...ledger, gaps: ledger.gaps.filter((g) => !g.startsWith('gap_round')) });
      return { ...inputData, needsGapRound: false, round: inputData.round + 1 };
    }

    // One shared gap-fill round on the merged ledger (iteration 900 band).
    const result = await executeResearchRound({
      sessionId: inputData.sessionId,
      mode: 'breadth',
      round: 900 + Math.max(1, inputData.round),
      ledger: {
        ...ledger,
        maxRounds: Math.max(ledger.maxRounds, inputData.round + 1),
        subQuestions:
          ledger.subQuestions.length > 0
            ? ledger.subQuestions
            : [
                {
                  id: randomUUID(),
                  text: ledger.query,
                  component: ledger.components[0] ?? 'breadth',
                  status: 'open',
                },
              ],
      },
      deps: { branchId: 'breadth-gap' },
    });

    ledger = result.ledger;
    const stopReason =
      result.handle.stopReason ??
      decideStop({
        ledger,
        roundJustFinished: inputData.round + 1,
        nowMs: Date.now(),
      });
    ledger = { ...ledger, stopReason };
    await setState(ledger);

    const independentSourceCount = new Set(ledger.findings.map((f) => f.sourceId)).size;
    return {
      sessionId: inputData.sessionId,
      mode: inputData.mode,
      round: inputData.round + 1,
      stopReason,
      needsGapRound: false,
      mergeStats: {
        ...inputData.mergeStats,
        findingCount: ledger.findings.length,
        independentSourceCount,
        dedupedFindingCount: ledger.findings.length,
      },
    };
  },
});

const synthesizeStep = createStep({
  id: 'research-breadth-synthesize',
  inputSchema: GapHandleSchema,
  outputSchema: GapHandleSchema.extend({
    report: z.string(),
  }),
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, state, setState }) => {
    const parsed = ResearchLedgerSchema.safeParse(state);
    if (!parsed.success) {
      return { ...inputData, report: 'No ledger available for breadth synthesis.' };
    }
    const ledger = parsed.data;

    if (inputData.stopReason === 'canceled' || ledger.stopReason === 'canceled') {
      const report =
        ledger.findings.length > 0
          ? `Cancelled. Partial breadth findings (${ledger.findings.length}): ${ledger.findings
              .map((f) => f.claimText)
              .slice(0, 8)
              .join('; ')}`
          : 'Cancelled before admissible breadth evidence was collected.';
      await setState({ ...ledger, report });
      return { ...inputData, stopReason: 'canceled' as const, report };
    }

    if (ledger.findings.length === 0) {
      const gaps = [
        ...new Set([
          ...ledger.gaps,
          inputData.stopReason ?? ledger.stopReason ?? 'no_evidence',
          'under_evidenced_no_findings',
        ]),
      ];
      const report = `Honest refusal: no admissible breadth findings for "${ledger.query}". Gaps: ${gaps.join('; ')}`;
      await setState({ ...ledger, report, gaps });
      return { ...inputData, report };
    }

    const evidenceBlock = ledger.findings
      .map(
        (f, i) =>
          `[${i + 1}] (${f.component}) ${f.claimText}\n  quote: "${f.quote}"\n  source: ${f.sourceUrl} origin=${f.sourceId}`
      )
      .join('\n');

    let report = '';
    let gaps = [...ledger.gaps];
    try {
      const out = await withTimeout(
        extractStructured(
          SynthesisSchema,
          [
            'Synthesize a concise breadth research report from the verified findings across branches.',
            'Only use the provided findings; do not invent sources.',
            `Query: ${ledger.query}`,
            `Branches: ${inputData.mergeStats.branchIds.join(', ') || 'none'}`,
            `Independent sources (origin-deduped): ${inputData.mergeStats.independentSourceCount}`,
            'FINDINGS:',
            evidenceBlock,
            'List remaining gaps explicitly.',
          ].join('\n'),
          'convergent'
        ),
        45_000,
        'breadth_synthesize'
      );
      report = out.report;
      gaps = [...new Set([...gaps, ...out.gaps])];
    } catch {
      report = `Partial breadth synthesis (model unavailable). Findings: ${ledger.findings
        .map((f) => f.claimText)
        .join('; ')}`;
      gaps = [...gaps, 'synthesis_fallback_convergent_failed'];
    }

    await setState({ ...ledger, report, gaps });
    return { ...inputData, report };
  },
});

const commitStep = createStep({
  id: 'research-breadth-commit',
  inputSchema: GapHandleSchema.extend({
    report: z.string(),
  }),
  outputSchema: ResearchOutputSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, state, setState }) => {
    const parsed = ResearchLedgerSchema.safeParse(state);
    const ledger = parsed.success
      ? parsed.data
      : emptyLedger({
          query: 'unknown',
          mode: 'breadth',
          maxRounds: 1,
          wallBudgetMs: 60_000,
          tokenBudget: 1,
          toolcallBudget: 1,
          startedAtMs: Date.now(),
        });

    const stopReason =
      inputData.stopReason ??
      ledger.stopReason ??
      decideStop({
        ledger,
        roundJustFinished: Math.max(1, inputData.round),
        nowMs: Date.now(),
      });

    const status = mapWorkflowStatusToDb('success', stopReason);
    const independentSourceCount = new Set(ledger.findings.map((f) => f.sourceId)).size;
    const finalized = await finalizeResearchCommit({
      sessionId: inputData.sessionId,
      ledger,
      report: inputData.report,
      stopReason,
      round: inputData.round,
      status,
      system: 'deep',
      iterationNumber: 1000,
      branchId: 'breadth-commit',
      extraFindings: {
        mergeStats: {
          ...inputData.mergeStats,
          independentSourceCount,
        },
        branchIds: inputData.mergeStats.branchIds,
      },
    });

    const output: ResearchOutput = {
      sessionId: inputData.sessionId,
      status,
      stopReason,
      admitted: finalized.admitted,
      coverageScore: finalized.coverageScore,
      report: finalized.report,
      gaps: finalized.gaps,
      rounds: inputData.round,
      findingsCount: ledger.findings.length,
    };

    await setState({
      ...ledger,
      gaps: finalized.gaps,
      admitted: finalized.admitted,
      coverageScore: finalized.coverageScore,
      report: finalized.report,
      stopReason,
    });

    return output;
  },
});

export const researchBreadthWorkflow = createWorkflow({
  id: 'research-breadth',
  inputSchema: ResearchInputSchema,
  outputSchema: ResearchOutputSchema,
  stateSchema: ResearchLedgerSchema.partial(),
})
  .then(preflightStep)
  .then(decomposeStep)
  .foreach(subResearchStep, { concurrency: FOREACH_CONCURRENCY })
  .then(mergeStep)
  .dountil(gapRoundStep, async ({ inputData, iterationCount }) => {
    // Cap 1: iterationCount is 1-based; stop after the first gap attempt.
    if (iterationCount >= 1) return true;
    return !inputData.needsGapRound;
  })
  .then(synthesizeStep)
  .then(commitStep)
  .commit();

export { computeCoverageScore, FOREACH_CONCURRENCY, MAX_SUB_JOBS };
