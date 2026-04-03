/**
 * AI ROI Analysis — Convex Validators
 *
 * Reusable v.object() validators matching the schema definitions
 * for aiRoiSessions, aiRoiOpportunities, and aiRoiEvidence.
 */

import { v } from "convex/values";

// ============================================================================
// Session Validators
// ============================================================================

/**
 * Validator for creating a new AI ROI session.
 * Only requires the fields needed at creation time.
 */
export const createSessionArgs = v.object({
  company: v.string(),
  documentId: v.optional(v.id("documents")),
});

/**
 * Validator for updating an AI ROI session's mutable fields.
 */
export const updateSessionArgs = v.object({
  sessionId: v.id("aiRoiSessions"),
  status: v.optional(v.string()),
  executiveSummary: v.optional(v.string()),
  sourceCount: v.optional(v.number()),
  topOpportunityName: v.optional(v.string()),
  topOpportunitySavings: v.optional(v.string()),
  topOpportunityConfidence: v.optional(v.string()),
  documentId: v.optional(v.id("documents")),
  errorReason: v.optional(v.string()),
});

/**
 * Validator for completing a session with summary data.
 */
export const completeSessionArgs = v.object({
  sessionId: v.id("aiRoiSessions"),
  executiveSummary: v.optional(v.string()),
  sourceCount: v.optional(v.number()),
  topOpportunityName: v.optional(v.string()),
  topOpportunitySavings: v.optional(v.string()),
  topOpportunityConfidence: v.optional(v.string()),
  documentId: v.optional(v.id("documents")),
});

/**
 * Validator for failing a session with an error reason.
 */
export const failSessionArgs = v.object({
  sessionId: v.id("aiRoiSessions"),
  errorReason: v.string(),
});

// ============================================================================
// Opportunity Validators
// ============================================================================

/**
 * Validator for adding a ranked opportunity to a session.
 */
export const addOpportunityArgs = v.object({
  sessionId: v.id("aiRoiSessions"),
  rank: v.number(),
  name: v.string(),
  confidence: v.string(), // "HIGH" | "MEDIUM" | "LOW"
  currentProcess: v.optional(v.string()),
  proposedAutomation: v.optional(v.string()),
  currentTimePerWeek: v.optional(v.string()),
  automatedTimePerWeek: v.optional(v.string()),
  currentCostPerYear: v.optional(v.string()),
  automatedCostPerYear: v.optional(v.string()),
  savingsPerYear: v.optional(v.string()),
  errorRateBefore: v.optional(v.string()),
  errorRateAfter: v.optional(v.string()),
  phase: v.optional(v.string()), // "quick-win" | "medium-term" | "strategic"
});

// ============================================================================
// Evidence Validators
// ============================================================================

/**
 * Validator for adding an evidence row to a session.
 */
export const addEvidenceArgs = v.object({
  sessionId: v.id("aiRoiSessions"),
  opportunityId: v.optional(v.id("aiRoiOpportunities")),
  claim: v.string(),
  tier: v.number(), // 1-5
  source: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  challengeStatus: v.optional(v.string()), // "validated" | "contested"
});
