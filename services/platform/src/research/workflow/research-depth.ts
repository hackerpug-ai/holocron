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
import { evaluateEvidenceGate } from '../evidence-gate.ts';
import { insertResearchIteration } from '../iteration-writer.ts';
import { updateResearchSessionStatus } from '../session-writer.ts';
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

function computeCoverageScore(ledger: ResearchLedger): number {
  if (ledger.components.length === 0) return 0;
  const covered = new Set(
    ledger.findings.map((f) => f.component).filter((c) => ledger.components.includes(c))
  );
  return covered.size / ledger.components.length;
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
      // Prefer synthesis-capable convergent role (manifest has no 'synthesis' role).
      // Hard timeout — fleet hangs must not stall commit.
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
          'convergent'
        ),
        45_000,
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

    // coverage_score computed HERE only
    const coverageScore = computeCoverageScore(ledger);

    const claims = ledger.findings.map((f) => ({
      id: f.id,
      text: f.claimText,
      component: f.component,
    }));
    const evidence = ledger.findings.map((f) => ({
      id: `e-${f.id}`,
      claimId: f.id,
      component: f.component,
      sourceId: f.sourceId,
      independenceGroup: f.sourceId,
      quote: f.quote,
      sourceText: f.quote,
      grade: f.grade,
      entailment: f.entailment,
      disconfirmationResolved: true,
      direction: f.direction,
    }));

    let admitted = false;
    let gaps = [...ledger.gaps];
    if (ledger.components.length > 0 && claims.length > 0) {
      try {
        const gate = evaluateEvidenceGate({
          claims,
          evidence,
          requiredComponents: ledger.components,
          gradeFloor: 3,
          entailmentFloor: 0.8,
          independentSourceFloor: Math.min(2, Math.max(1, ledger.components.length)),
        });
        admitted = gate.admitted;
        if (!admitted) {
          gaps = [...new Set([...gaps, gate.reason])];
        }
      } catch {
        admitted = false;
        gaps = [...new Set([...gaps, 'final_gate_eval_failed'])];
      }
    }

    const stopReason =
      inputData.stopReason ??
      ledger.stopReason ??
      decideStop({
        ledger,
        roundJustFinished: inputData.round,
        nowMs: Date.now(),
      });

    const status = mapWorkflowStatusToDb('success', stopReason);
    const report =
      inputData.report ||
      ledger.report ||
      (admitted
        ? 'Research completed with admitted evidence.'
        : `Honest refusal: under-evidenced (${stopReason ?? 'no_evidence'}). Gaps: ${
            gaps.join('; ') || 'none recorded'
          }`);

    const output: ResearchOutput = {
      sessionId: inputData.sessionId,
      status,
      stopReason,
      admitted,
      coverageScore,
      report,
      gaps,
      rounds: inputData.round,
      findingsCount: ledger.findings.length,
    };

    const sql = createSql(resolveHolocronNonprodDatabaseUrl({ context: 'research-depth commit' }), {
      max: 1,
    });
    try {
      await sql`
        UPDATE research_sessions
        SET coverage_score = ${coverageScore},
            current_coverage_score = ${coverageScore},
            findings = ${sql.json({
              stopReason,
              admitted,
              coverageScore,
              report,
              gaps,
              rounds: inputData.round,
              findingsCount: ledger.findings.length,
              findings: ledger.findings,
            })},
            error_text = ${admitted ? null : report.slice(0, 2000)},
            updated_at = now()
        WHERE id = ${inputData.sessionId}::uuid
      `;

      // Persist a final iteration row with coverage (ON CONFLICT DO NOTHING keeps round rows).
      await insertResearchIteration({
        sessionId: inputData.sessionId,
        iterationNumber: Math.max(1, inputData.round || 1),
        summary: report.slice(0, 2000),
        feedback: admitted
          ? 'commit: admitted'
          : `commit: honest refusal (${stopReason ?? 'under-evidenced'})`,
        refinedQueries: ledger.queriesRun.slice(-5),
        sources: ledger.findings.map((f) => ({
          title: f.claimText.slice(0, 120),
          url: f.sourceUrl,
          citationId: f.citationId,
        })),
        status: status === 'cancelled' ? 'cancelled' : 'completed',
        system: inputData.mode === 'quick' ? 'simple' : 'deep',
        coverageScore,
        reviewGaps: gaps,
        findings: ledger.findings,
        sql,
      });
    } finally {
      await sql.end({ timeout: 5 }).catch(() => undefined);
    }

    await updateResearchSessionStatus(inputData.sessionId, status);

    const nextLedger: ResearchLedger = {
      ...ledger,
      gaps,
      admitted,
      coverageScore,
      report,
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
