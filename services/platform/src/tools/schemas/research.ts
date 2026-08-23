import { z } from 'zod';
import { EvidenceGateInputSchema } from '../../research/evidence-gate.ts';

/**
 * Shared evidence-research mission output (pipes-1).
 * Registered in the mission registry as mission.research.output@1 — this
 * export keeps the tool/schema surface aligned with the template contract.
 */
export const evidenceResearchMissionOutputSchema = z
  .object({
    goal: z.string().min(1),
    assayInstanceId: z.string().min(1),
    challengeInstanceId: z.string().min(1),
    admitted: z.boolean(),
    direction: z.enum(['supporting', 'refuting', 'mixed', 'none']),
    coveredComponents: z.array(z.string()),
    missingComponents: z.array(z.string()),
    reason: z.string(),
    componentsCovered: z.number().int().nonnegative(),
    independentSourceCount: z.number().int().nonnegative(),
    admittedEvidenceIds: z.array(z.string()),
    rejectedEvidenceIds: z.array(z.string()),
    executorRef: z.literal('evidence-gate'),
    topic: z.string().optional(),
    instantiation: z
      .enum(['research', 'deepResearch', 'subscriptions-research', 'fulcrum'])
      .optional(),
  })
  .passthrough();

/**
 * Retrieve stage output (REDHAT-FIX-1 / CAP-EMB-01).
 * `retrievalMethod: "rrf"` marks hybrid-search provenance; `"seed"` marks
 * explicit CLI `--claims` / researchEvidence injection.
 */
export const missionResearchRetrieveOutputSchema = z
  .object({
    goal: z.string().min(1),
    evidence: EvidenceGateInputSchema,
    /** CAP-EMB-01 hybrid search marker (`rrf`) or explicit seed path (`seed`). */
    retrievalMethod: z.enum(['rrf', 'seed']).optional(),
    /** Alias of retrievalMethod when searchMethod is preferred by callers. */
    searchMethod: z.enum(['rrf']).optional(),
  })
  .strict();

export const getResearchSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

/** Bare ZodObject — gateway drops top-level .nullable(); missing session → empty object. */
export const getResearchSessionOutputSchema = z.object({
  _id: z.string().optional(),
  sessionId: z.string().optional(),
  topic: z.string().optional(),
  status: z.string().optional(),
  iterations: z.array(z.unknown()).optional(),
});

export const searchResearchInputSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
});

export const searchResearchOutputSchema = z.object({
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      topic: z.string(),
      relevanceScore: z.number(),
      status: z.string(),
      createdAt: z.number(),
    })
  ),
  totalResults: z.number().int(),
});

const researchKickoffModeSchema = z.enum(['auto', 'depth', 'breadth']);
const researchResultModeSchema = z.enum(['quick', 'depth', 'breadth']);

/** Shared kickoff response shape (deep + quick). Top-level MUST be bare ZodObject. */
export const researchKickoffOutputSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.string().min(1),
  mode: researchResultModeSchema,
  existing: z.boolean().optional(),
  pollAfterMs: z.number().int().nonnegative(),
  estimatedMs: z.number().int().nonnegative(),
});

export const deepResearchInputSchema = z.object({
  topic: z.string().min(1),
  mode: researchKickoffModeSchema.optional(),
  maxRounds: z.number().int().positive().optional(),
  focus: z.array(z.string().min(1)).optional(),
  onBudgetExhausted: z.enum(['partial', 'ask']).optional(),
  conversationId: z.string().uuid().optional(),
});

export const deepResearchOutputSchema = researchKickoffOutputSchema;

export const quickResearchInputSchema = z.object({
  topic: z.string().min(1),
  focus: z.array(z.string().min(1)).optional(),
  conversationId: z.string().uuid().optional(),
});

export const quickResearchOutputSchema = researchKickoffOutputSchema;

const researchProgressSchema = z.object({
  round: z.number().int().nonnegative(),
  maxRounds: z.number().int().nonnegative(),
  subQuestionsTotal: z.number().int().nonnegative(),
  subQuestionsClosed: z.number().int().nonnegative(),
  findingsVerified: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
});

const researchLastIterationSchema = z.object({
  n: z.number().int().nonnegative(),
  summary: z.string(),
  feedback: z.string(),
  refinedQueries: z.array(z.string()),
  sources: z.array(z.record(z.string(), z.unknown())),
});

const researchGateSchema = z.object({
  admitted: z.boolean(),
  missingComponents: z.array(z.string()),
  independentSourceCount: z.number().int().nonnegative(),
  reasonCode: z.string(),
});

export const deepResearchResultInputSchema = z.object({
  sessionId: z.string().uuid(),
  waitMs: z.number().int().min(0).max(60_000).optional(),
  includeFindings: z.boolean().optional(),
});

export const deepResearchResultOutputSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.string().min(1),
  phase: z.string().optional(),
  terminal: z.boolean(),
  mode: researchResultModeSchema,
  progress: researchProgressSchema,
  summary: z.string().optional(),
  findings: z.unknown().optional(),
  gaps: z.unknown().optional(),
  documentId: z.string().uuid().optional(),
  coverageScore: z.number().optional(),
  partial: z.boolean().optional(),
  stopReason: z.string().optional(),
  elapsedMs: z.number().int().nonnegative(),
  nextPollAfterMs: z.number().int().nonnegative(),
  lastIteration: researchLastIterationSchema.optional(),
  gate: researchGateSchema.optional(),
});

export const deepResearchControlInputSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(['cancel', 'steer']),
  note: z.string().optional(),
  addSubQuestions: z.array(z.string().min(1)).optional(),
  dropSubQuestions: z.array(z.string().min(1)).optional(),
  stop: z.boolean().optional(),
  extendBudget: z.boolean().optional(),
  controlRequestKey: z.string().min(1).optional(),
});

export const deepResearchControlOutputSchema = z.object({
  sessionId: z.string().uuid(),
  action: z.enum(['cancel', 'steer']),
  accepted: z.boolean(),
  status: z.string().min(1),
  controlRequestKey: z.string().min(1),
  replay: z.boolean(),
  appliesAtRound: z.number().int().nonnegative().optional(),
});
