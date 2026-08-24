/**
 * research-depth Mastra workflow:
 *   preflight → plan → dountil(researchRound) → synthesize → commit
 *
 * Replay hits bail(storedResult) → engine remaps to status:'success'.
 * Cancel is cooperative via session status latch (never bail on cancel).
 * coverage_score is computed ONLY in commit — never in decideStop.
 */
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { createSql } from '../../db/client.ts';
import { resolveHolocronNonprodDatabaseUrl } from '../../db/connection.ts';
import { extractStructured } from '../../inference/extract-structured.ts';
import { updateResearchSessionStatus } from '../session-writer.ts';
import { computeCoverageScore, finalizeResearchCommit } from './commit.ts';
import { decideStop } from './decide-stop.ts';
import { executeResearchRound, planResearchLedger } from './round.ts';
import {
  emptyLedger,
  MODE_DEFAULTS,
  ResearchInputSchema,
  type ResearchLedger,
  ResearchLedgerSchema,
  type ResearchOutput,
  ResearchOutputSchema,
  RoundHandleSchema,
  type StopReason,
} from './schemas.ts';

const SynthesisSchema = z.object({
  report: z.string().min(1),
  gaps: z.array(z.string()).default([]),
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

const PlanOutSchema = z.object({
  sessionId: z.string().uuid(),
  mode: z.enum(['quick', 'depth', 'breadth']),
  round: z.number().int().nonnegative(),
  stopReason: RoundHandleSchema.shape.stopReason,
});

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

async function loadStoredResult(sessionId: string): Promise<ResearchOutput | null> {
  const sql = createSql(
    resolveHolocronNonprodDatabaseUrl({ context: 'research-depth preflight' }),
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

const preflightStep = createStep({
  id: 'research-depth-preflight',
  inputSchema: ResearchInputSchema,
  outputSchema: PreflightOutSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, bail }) => {
    const mode = inputData.mode ?? 'quick';
    const defaults = MODE_DEFAULTS[mode];
    const stored = await loadStoredResult(inputData.sessionId);
    if (stored) {
      // Replay hit → bail(storedResult). Engine remaps bailed → success.
      return bail(stored);
    }

    await updateResearchSessionStatus(inputData.sessionId, 'running');

    const out: PreflightOut = {
      sessionId: inputData.sessionId,
      query: inputData.query,
      mode,
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

const planStep = createStep({
  id: 'research-depth-plan',
  inputSchema: PreflightOutSchema,
  outputSchema: PlanOutSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, setState }) => {
    const startedAtMs = Date.now();
    let ledger = emptyLedger({
      query: inputData.query,
      mode: inputData.mode,
      maxRounds: inputData.maxRounds,
      wallBudgetMs: inputData.wallBudgetMs,
      tokenBudget: inputData.tokenBudget,
      toolcallBudget: inputData.toolcallBudget,
      startedAtMs,
    });

    // Cooperative cancel before any LLM plan work.
    const sql = createSql(resolveHolocronNonprodDatabaseUrl({ context: 'research-depth plan' }), {
      max: 1,
    });
    try {
      const rows = await sql<{ status: string }[]>`
        SELECT status FROM research_sessions WHERE id = ${inputData.sessionId}::uuid LIMIT 1
      `;
      if (rows[0]?.status === 'cancelled') {
        ledger = { ...ledger, stopReason: 'canceled' };
        await setState(ledger);
        return {
          sessionId: inputData.sessionId,
          mode: inputData.mode,
          round: 0,
          stopReason: 'canceled' as const,
        };
      }
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }

    ledger = await planResearchLedger({ query: inputData.query, ledger });
    await setState(ledger);
    return {
      sessionId: inputData.sessionId,
      mode: inputData.mode,
      round: 0,
      stopReason: null,
    };
  },
});

const researchRoundStep = createStep({
  id: 'research-depth-round',
  inputSchema: PlanOutSchema,
  outputSchema: RoundHandleSchema,
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, state, setState }) => {
    const priorParsed = ResearchLedgerSchema.safeParse(state);
    if (!priorParsed.success) {
      throw new Error('research-depth-round: missing ledger state — plan step must run first');
    }
    const nextRound = inputData.round + 1;
    const result = await executeResearchRound({
      sessionId: inputData.sessionId,
      mode: inputData.mode,
      round: nextRound,
      ledger: priorParsed.data,
    });
    await setState(result.ledger);
    return result.handle;
  },
});

const synthesizeStep = createStep({
  id: 'research-depth-synthesize',
  inputSchema: RoundHandleSchema,
  outputSchema: RoundHandleSchema.extend({
    report: z.string(),
  }),
  stateSchema: ResearchLedgerSchema.partial(),
  execute: async ({ inputData, state, setState }) => {
    const parsed = ResearchLedgerSchema.safeParse(state);
    if (!parsed.success) {
      return { ...inputData, report: 'No ledger available for synthesis.' };
    }
    const ledger = parsed.data;

    // If cancelled, skip model synthesis — keep honest partial.
    if (inputData.stopReason === 'canceled' || ledger.stopReason === 'canceled') {
      const report =
        ledger.findings.length > 0
          ? `Cancelled. Partial findings (${ledger.findings.length}): ${ledger.findings
              .map((f) => f.claimText)
              .slice(0, 8)
              .join('; ')}`
          : 'Cancelled before admissible evidence was collected.';
      const next = { ...ledger, report };
      await setState(next);
      return { ...inputData, stopReason: 'canceled' as const, report };
    }

    // No findings → honest refusal without an LLM call (bounded, fail-closed).
    if (ledger.findings.length === 0) {
      const gaps = [
        ...new Set([
          ...ledger.gaps,
          inputData.stopReason ?? ledger.stopReason ?? 'no_evidence',
          'under_evidenced_no_findings',
        ]),
      ];
      const report = `Honest refusal: no admissible findings for "${ledger.query}". Gaps: ${gaps.join('; ')}`;
      const next = { ...ledger, report, gaps };
      await setState(next);
      return { ...inputData, report };
    }

    const evidenceBlock = ledger.findings
      .map(
        (f, i) =>
          `[${i + 1}] (${f.component}) ${f.claimText}\n  quote: "${f.quote}"\n  source: ${f.sourceUrl}`
      )
      .join('\n');

    let report = '';
    let gaps = [...ledger.gaps];
    try {
      // Use the manifest's synthesis role (research on the fleet; convergent is
      // the stale S33-era alias). The full report routinely exceeds 4096 tokens,
      // so cap output high, and the outer budget MUST exceed the synthesis role's
      // 240s timeoutMs — the previous 45s hard cap aborted every synthesis and
      // forced the raw-paste fallback (synthesis_fallback_convergent_failed).
      const out = await withTimeout(
        extractStructured(
          SynthesisSchema,
          [
            'Synthesize a concise research report from the verified findings.',
            'Only use the provided findings; do not invent sources.',
            `Query: ${ledger.query}`,
            `Stop reason so far: ${inputData.stopReason ?? 'none'}`,
            'FINDINGS:',
            evidenceBlock,
            'List remaining gaps explicitly.',
          ].join('\n'),
          'synthesis',
          undefined,
          { maxOutputTokens: 8192 }
        ),
        250_000,
        'synthesize'
      );
      report = out.report;
      gaps = [...new Set([...gaps, ...out.gaps])];
    } catch {
      report = `Partial synthesis (model unavailable). Findings: ${ledger.findings
        .map((f) => f.claimText)
        .join('; ')}`;
      gaps = [...gaps, 'synthesis_fallback_convergent_failed'];
    }

    const next = { ...ledger, report, gaps };
    await setState(next);
    return { ...inputData, report };
  },
});

const commitStep = createStep({
  id: 'research-depth-commit',
  inputSchema: RoundHandleSchema.extend({
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
          mode: inputData.mode,
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
        roundJustFinished: inputData.round,
        nowMs: Date.now(),
      });

    const status = mapWorkflowStatusToDb('success', stopReason);
    const finalized = await finalizeResearchCommit({
      sessionId: inputData.sessionId,
      ledger,
      report: inputData.report,
      stopReason,
      round: inputData.round,
      status,
      system: inputData.mode === 'quick' ? 'simple' : 'deep',
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

    const nextLedger: ResearchLedger = {
      ...ledger,
      gaps: finalized.gaps,
      admitted: finalized.admitted,
      coverageScore: finalized.coverageScore,
      report: finalized.report,
      stopReason,
    };
    await setState(nextLedger);

    return output;
  },
});

export const researchDepthWorkflow = createWorkflow({
  id: 'research-depth',
  inputSchema: ResearchInputSchema,
  outputSchema: ResearchOutputSchema,
  // Partial until plan seeds the full ledger via setState.
  stateSchema: ResearchLedgerSchema.partial(),
})
  .then(preflightStep)
  .then(planStep)
  .dountil(researchRoundStep, async ({ inputData }) => inputData.stopReason !== null)
  .then(synthesizeStep)
  .then(commitStep)
  .commit();

export { computeCoverageScore, mapWorkflowStatusToDb };
