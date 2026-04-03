/**
 * Competitive Analysis Validators
 *
 * Convex v. validators for competitive analysis tables.
 */

import { v } from "convex/values";

/**
 * Porter's Five Forces rating values
 */
export const porterRatingValidator = v.union(
  v.literal("HIGH"),
  v.literal("MEDIUM"),
  v.literal("LOW")
);

/**
 * Session status values
 */
export const sessionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("analyzing"),
  v.literal("completed"),
  v.literal("failed")
);

/**
 * Feature support values
 */
export const featureSupportValidator = v.union(
  v.literal("yes"),
  v.literal("partial"),
  v.literal("no")
);

/**
 * Validator for creating a new session
 */
export const createSessionArgsValidator = v.object({
  market: v.string(),
});

/**
 * Validator for updating session fields
 */
export const updateSessionArgsValidator = v.object({
  sessionId: v.id("competitiveAnalysisSessions"),
  status: v.optional(sessionStatusValidator),
  porterRivalry: v.optional(v.string()),
  porterNewEntrants: v.optional(v.string()),
  porterSubstitutes: v.optional(v.string()),
  porterBuyerPower: v.optional(v.string()),
  porterSupplierPower: v.optional(v.string()),
  marketVerdict: v.optional(v.string()),
  sourceCount: v.optional(v.number()),
  documentId: v.optional(v.id("documents")),
  errorReason: v.optional(v.string()),
});

/**
 * Validator for adding a competitor
 */
export const addCompetitorArgsValidator = v.object({
  sessionId: v.id("competitiveAnalysisSessions"),
  name: v.string(),
  focus: v.optional(v.string()),
  founded: v.optional(v.string()),
  funding: v.optional(v.string()),
  strengths: v.optional(v.array(v.string())),
  weaknesses: v.optional(v.array(v.string())),
  url: v.optional(v.string()),
});

/**
 * Validator for adding a feature comparison row
 */
export const addFeatureArgsValidator = v.object({
  sessionId: v.id("competitiveAnalysisSessions"),
  featureName: v.string(),
  ourSupport: featureSupportValidator,
  competitorSupport: v.any(),
});
