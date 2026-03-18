/**
 * Internal queries for research document creation
 *
 * These queries are called by the createResearchDocument action
 */

import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/** Finding with citations for document creation */
export type FindingWithCitations = Doc<"researchFindings"> & {
  citations: Array<Doc<"citations"> | null>;
};

/** Iteration with confidence stats for document creation */
export type IterationWithStats = Doc<"deepResearchIterations">;

/**
 * Internal query: Get all findings with citations for document creation
 */
export const getFindingsForDocument = internalQuery({
  args: { sessionId: v.id("deepResearchSessions") },
  handler: async (ctx, { sessionId }): Promise<FindingWithCitations[]> => {
    const findings = await ctx.db
      .query("researchFindings")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    const findingsWithCitations = await Promise.all(
      findings.map(async (finding) => {
        const citations = await Promise.all(
          finding.citationIds.map((id) => ctx.db.get(id))
        );
        return { ...finding, citations: citations.filter(Boolean) } as FindingWithCitations;
      })
    );
    return findingsWithCitations;
  },
});

/**
 * Get iterations with findings for parallel research strategies
 *
 * Parallel strategies don't create researchFindings records, only iterations with summaries.
 * This formats iteration data into findings for document generation.
 */
export const getIterationsForDocument = internalQuery({
  args: { sessionId: v.id("deepResearchSessions") },
  handler: async (ctx, { sessionId }): Promise<IterationWithStats[]> => {
    const iterations = await ctx.db
      .query("deepResearchIterations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();

    return iterations;
  },
});

/**
 * Internal query: Get session for document creation
 */
export const getSessionForDocument = internalQuery({
  args: { sessionId: v.id("deepResearchSessions") },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db.get(sessionId);
  },
});

/**
 * Get completed sessions that don't have associated documents
 *
 * Used by migration to find sessions needing document backfill
 */
export const getSessionsNeedingDocuments = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("deepResearchSessions")
      .withIndex("by_conversation") // Use available index, will filter in memory
      .collect();

    const sessionsNeedingDocuments = sessions.filter(
      (session) => session.status === "completed" && !session.documentId
    );

    return sessionsNeedingDocuments;
  },
});
