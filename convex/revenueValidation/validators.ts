/**
 * Revenue Validation Validators
 *
 * Convex v validators for revenueValidationSessions,
 * revenueValidationEvidence, and revenueValidationCompetitors tables.
 */

import { v } from "convex/values";

// ── Status ────────────────────────────────────────────────────────────────────

export const sessionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("analyzing"),
  v.literal("completed"),
  v.literal("failed"),
);

// ── Verdict ───────────────────────────────────────────────────────────────────

export const verdictValidator = v.union(
  v.literal("GO"),
  v.literal("CAUTION"),
  v.literal("NO-GO"),
);

// ── Confidence level ──────────────────────────────────────────────────────────

export const confidenceLevelValidator = v.union(
  v.literal("HIGH"),
  v.literal("MEDIUM"),
  v.literal("LOW"),
);

// ── DVF dimension ─────────────────────────────────────────────────────────────

export const dimensionValidator = v.union(
  v.literal("desirability"),
  v.literal("viability"),
  v.literal("feasibility"),
);

// ── Challenge status ──────────────────────────────────────────────────────────

export const challengeStatusValidator = v.union(
  v.literal("validated"),
  v.literal("contested"),
  v.literal("refuted"),
);

// ── Unit economics scenario ───────────────────────────────────────────────────

export const unitEconomicsScenarioValidator = v.object({
  ltv: v.optional(v.string()),
  cac: v.optional(v.string()),
  ltvCacRatio: v.optional(v.string()),
  paybackMonths: v.optional(v.number()),
});

export const unitEconomicsValidator = v.object({
  base: v.optional(unitEconomicsScenarioValidator),
  bull: v.optional(unitEconomicsScenarioValidator),
  bear: v.optional(unitEconomicsScenarioValidator),
});

// ── Session create args ───────────────────────────────────────────────────────

export const createSessionArgsValidator = v.object({
  productName: v.string(),
  codebaseUrl: v.optional(v.string()),
});

// ── Session update args ───────────────────────────────────────────────────────

export const updateSessionArgsValidator = v.object({
  sessionId: v.id("revenueValidationSessions"),
  status: v.optional(sessionStatusValidator),
  desirabilityScore: v.optional(v.number()),
  viabilityScore: v.optional(v.number()),
  feasibilityScore: v.optional(v.number()),
  totalScore: v.optional(v.number()),
  verdict: v.optional(verdictValidator),
  confidenceLevel: v.optional(confidenceLevelValidator),
  tam: v.optional(v.string()),
  sam: v.optional(v.string()),
  som: v.optional(v.string()),
  unitEconomics: v.optional(v.any()),
  executiveSummary: v.optional(v.string()),
  agentCount: v.optional(v.number()),
  documentId: v.optional(v.id("documents")),
  errorReason: v.optional(v.string()),
});

// ── Evidence args ─────────────────────────────────────────────────────────────

export const addEvidenceArgsValidator = v.object({
  sessionId: v.id("revenueValidationSessions"),
  claim: v.string(),
  tier: v.number(),
  sourceTitle: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  dimension: dimensionValidator,
  challengeStatus: v.optional(challengeStatusValidator),
});

// ── Competitor args ───────────────────────────────────────────────────────────

export const addCompetitorArgsValidator = v.object({
  sessionId: v.id("revenueValidationSessions"),
  name: v.string(),
  pricing: v.optional(v.string()),
  differentiator: v.optional(v.string()),
  url: v.optional(v.string()),
});
