/**
 * Research-depth workflow schemas — real z.object only (no z.any / z.custom).
 */
import { z } from 'zod';

export const StopReasonSchema = z.enum([
  'all_closed',
  'dry_rounds',
  'round_cap',
  'wall_budget',
  'token_budget',
  'toolcall_budget',
  'canceled',
  'steered_stop',
  'degraded_sense_only',
  'no_evidence',
]);

export type StopReason = z.infer<typeof StopReasonSchema>;

export const ResearchModeSchema = z.enum(['quick', 'depth', 'breadth']);
export type ResearchMode = z.infer<typeof ResearchModeSchema>;

export const RoundHandleSchema = z.object({
  sessionId: z.string().uuid(),
  mode: ResearchModeSchema,
  round: z.number().int().nonnegative(),
  stopReason: StopReasonSchema.nullable(),
});

export type RoundHandle = z.infer<typeof RoundHandleSchema>;

export const SubQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  component: z.string().min(1),
  status: z.enum(['open', 'closed', 'blocked']),
});

export type SubQuestion = z.infer<typeof SubQuestionSchema>;

export const LedgerFindingSchema = z.object({
  id: z.string().min(1),
  claimText: z.string().min(1),
  component: z.string().min(1),
  quote: z.string().min(1),
  /** Full captured source body — quote must be a slice of this, never equal by construction. */
  sourceText: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceId: z.string().min(1),
  grade: z.number().int().min(1).max(5),
  entailment: z.number().min(0).max(1),
  /** Set by code from a persisted disconfirm probe — never hardcoded true. */
  disconfirmationResolved: z.boolean(),
  direction: z.enum(['supporting', 'refuting']),
  citationId: z.string().optional(),
});

export type LedgerFinding = z.infer<typeof LedgerFindingSchema>;

export const SpendLedgerSchema = z.object({
  wallMs: z.number().nonnegative(),
  tokens: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
});

export type SpendLedger = z.infer<typeof SpendLedgerSchema>;

export const ResearchLedgerSchema = z.object({
  findings: z.array(LedgerFindingSchema),
  subQuestions: z.array(SubQuestionSchema),
  queriesRun: z.array(z.string()),
  seenUrls: z.array(z.string()),
  dryRounds: z.number().int().nonnegative(),
  spend: SpendLedgerSchema,
  gaps: z.array(z.string()),
  degraded: z.boolean(),
  stopReason: StopReasonSchema.nullable(),
  components: z.array(z.string()),
  componentsHash: z.string().optional(),
  query: z.string(),
  mode: ResearchModeSchema,
  maxRounds: z.number().int().positive(),
  startedAtMs: z.number().int().nonnegative(),
  wallBudgetMs: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
  toolcallBudget: z.number().int().positive(),
  steeredStop: z.boolean(),
  report: z.string().optional(),
  admitted: z.boolean().optional(),
  coverageScore: z.number().min(0).max(1).optional(),
  /** Last acquire gate payload (including rejected evidence) for honest persistence. */
  lastGate: z.unknown().optional(),
  lastGateInput: z.unknown().optional(),
});

export type ResearchLedger = z.infer<typeof ResearchLedgerSchema>;

export const ResearchInputSchema = z.object({
  sessionId: z.string().uuid(),
  query: z.string().min(1),
  mode: ResearchModeSchema.default('quick'),
  maxRounds: z.number().int().positive().optional(),
  wallBudgetMs: z.number().int().positive().optional(),
  tokenBudget: z.number().int().positive().optional(),
  toolcallBudget: z.number().int().positive().optional(),
});

export type ResearchInput = z.input<typeof ResearchInputSchema>;

export const ResearchOutputSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(['completed', 'failed', 'cancelled', 'paused']),
  stopReason: StopReasonSchema.nullable(),
  admitted: z.boolean(),
  coverageScore: z.number().min(0).max(1),
  report: z.string(),
  gaps: z.array(z.string()),
  rounds: z.number().int().nonnegative(),
  findingsCount: z.number().int().nonnegative(),
});

export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const MODE_DEFAULTS = {
  quick: {
    maxRounds: 1,
    // Real acquire (extract + entailment + disconfirm) needs more than a seed worker.
    wallBudgetMs: 240_000,
    tokenBudget: 24_000,
    toolcallBudget: 24,
  },
  depth: {
    maxRounds: 6,
    wallBudgetMs: 600_000,
    tokenBudget: 120_000,
    toolcallBudget: 120,
  },
  breadth: {
    maxRounds: 4,
    wallBudgetMs: 360_000,
    tokenBudget: 80_000,
    toolcallBudget: 80,
  },
} as const;

export function emptySpend(): SpendLedger {
  return { wallMs: 0, tokens: 0, toolCalls: 0, costUsd: 0 };
}

export function emptyLedger(seed: {
  query: string;
  mode: ResearchMode;
  maxRounds: number;
  wallBudgetMs: number;
  tokenBudget: number;
  toolcallBudget: number;
  startedAtMs: number;
}): ResearchLedger {
  return {
    findings: [],
    subQuestions: [],
    queriesRun: [],
    seenUrls: [],
    dryRounds: 0,
    spend: emptySpend(),
    gaps: [],
    degraded: false,
    stopReason: null,
    components: [],
    query: seed.query,
    mode: seed.mode,
    maxRounds: seed.maxRounds,
    startedAtMs: seed.startedAtMs,
    wallBudgetMs: seed.wallBudgetMs,
    tokenBudget: seed.tokenBudget,
    toolcallBudget: seed.toolcallBudget,
    steeredStop: false,
  };
}

/** Breadth foreach job — one sub-question researched on an attributed branch. */
export const SubQuestionJobSchema = z.object({
  sessionId: z.string().uuid(),
  jobId: z.string().min(1),
  branchId: z.string().min(1),
  text: z.string().min(1),
  component: z.string().min(1),
  query: z.string().min(1),
  mode: ResearchModeSchema,
  maxInternalRounds: z.number().int().positive().max(2),
  wallBudgetMs: z.number().int().positive(),
  tokenBudget: z.number().int().positive(),
  toolcallBudget: z.number().int().positive(),
  /** Shared iteration offset so branch rows don't collide on (session, iteration_number). */
  iterationBase: z.number().int().nonnegative(),
});

export type SubQuestionJob = z.infer<typeof SubQuestionJobSchema>;

export const SubResultSchema = z.object({
  jobId: z.string().min(1),
  branchId: z.string().min(1),
  component: z.string().min(1),
  text: z.string().min(1),
  findings: z.array(LedgerFindingSchema),
  queriesRun: z.array(z.string()),
  seenUrls: z.array(z.string()),
  gaps: z.array(z.string()),
  spend: SpendLedgerSchema,
  stopReason: StopReasonSchema.nullable(),
  rounds: z.number().int().nonnegative(),
  degraded: z.boolean(),
});

export type SubResult = z.infer<typeof SubResultSchema>;

export const BreadthMergeStatsSchema = z.object({
  branchCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  independentSourceCount: z.number().int().nonnegative(),
  dedupedFindingCount: z.number().int().nonnegative(),
  branchIds: z.array(z.string()),
});

export type BreadthMergeStats = z.infer<typeof BreadthMergeStatsSchema>;
