/**
 * Assimilation Queries for Borg-themed Repository Analysis
 *
 * Queries for retrieving assimilation metadata and documents
 */

import { internalQuery, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Check if a repository has already been assimilated
 *
 * Returns the metadata and associated document if found, null otherwise
 */
export const checkExistingAssimilation = query({
  args: {
    repositoryUrl: v.string(),
  },
  handler: async (ctx, { repositoryUrl }) => {
    console.log(`[checkExistingAssimilation] Entry - repositoryUrl: "${repositoryUrl}"`);

    // Search for existing assimilation by repository URL
    const metadata = await ctx.db
      .query("assimilationMetadata")
      .withIndex("by_repository", (q) => q.eq("repositoryName", repositoryUrl.split("/").pop() ?? ""))
      .first();

    if (!metadata) {
      console.log(`[checkExistingAssimilation] No existing assimilation found`);
      return null;
    }

    // Fetch the associated document
    const document = await ctx.db.get(metadata.documentId);

    console.log(`[checkExistingAssimilation] Found existing assimilation - metadataId: ${metadata._id}, documentId: ${metadata.documentId}`);

    return {
      metadata,
      document,
    };
  },
});

/**
 * List all assimilations with optional filters
 *
 * Returns assimilations sorted by sophistication rating descending
 */
export const listAssimilations = query({
  args: {
    language: v.optional(v.string()),
    minRating: v.optional(v.number()),
  },
  handler: async (ctx, { language, minRating }) => {
    console.log(`[listAssimilations] Entry - language: ${language ?? "none"}, minRating: ${minRating ?? "none"}`);

    let results: any[];

    // Apply language filter if provided
    if (language) {
      results = await ctx.db
        .query("assimilationMetadata")
        .withIndex("by_language", (q) => q.eq("primaryLanguage", language))
        .collect();
    } else {
      results = await ctx.db.query("assimilationMetadata").collect();
    }

    // Apply minRating filter if provided
    if (minRating !== undefined) {
      results = results.filter((r) => r.sophisticationRating >= minRating);
    }

    // Sort by sophistication rating descending
    results.sort((a, b) => b.sophisticationRating - a.sophisticationRating);

    console.log(`[listAssimilations] Found ${results.length} assimilations`);

    // Fetch associated documents for each result
    const resultsWithDocuments = await Promise.all(
      results.map(async (metadata) => {
        const document = await ctx.db.get(metadata.documentId);
        return {
          metadata,
          document,
        };
      })
    );

    return resultsWithDocuments;
  },
});

/**
 * Get assimilation by document ID
 *
 * Returns the metadata and document for a specific document ID
 */
export const getAssimilationByDocumentId = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, { documentId }) => {
    console.log(`[getAssimilationByDocumentId] Entry - documentId: ${documentId}`);

    const metadata = await ctx.db
      .query("assimilationMetadata")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .first();

    if (!metadata) {
      console.log(`[getAssimilationByDocumentId] No metadata found for document`);
      return null;
    }

    const document = await ctx.db.get(metadata.documentId);

    console.log(`[getAssimilationByDocumentId] Found assimilation - metadataId: ${metadata._id}`);

    return {
      metadata,
      document,
    };
  },
});

// ── Session queries (public) ─────────────────────────────────────────────────

/**
 * Get full assimilation session with iterations
 * Used by clients to view plan content and progress
 */
export const getAssimilationSession = query({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    const iterations = await ctx.db
      .query("assimilationIterations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return {
      ...session,
      iterations: iterations.sort((a, b) => a.iterationNumber - b.iterationNumber),
    };
  },
});

/**
 * Lightweight session status for progress polling
 * Returns only tracking fields, not full findings
 */
export const getAssimilationSessionStatus = query({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;

    return {
      _id: session._id,
      status: session.status,
      profile: session.profile,
      repositoryName: session.repositoryName,
      repositoryUrl: session.repositoryUrl,
      currentIteration: session.currentIteration,
      maxIterations: session.maxIterations,
      dimensionScores: session.dimensionScores,
      estimatedCostUsd: session.estimatedCostUsd,
      planSummary: session.planSummary,
      planContent: session.status === 'pending_approval' ? session.planContent : undefined,
      documentId: session.documentId,
      metadataId: session.metadataId,
      errorReason: session.errorReason,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    };
  },
});

// ── Internal queries ─────────────────────────────────────────────────────────

/**
 * Internal: Get active session for a repository URL
 * Used for duplicate prevention guard
 */
export const getActiveSessionForRepo = internalQuery({
  args: {
    repositoryUrl: v.string(),
  },
  handler: async (ctx, { repositoryUrl }) => {
    const activeStatuses = ['pending_approval', 'planning', 'approved', 'in_progress', 'synthesizing'];

    // Query by repository URL, then filter for active status
    const sessions = await ctx.db
      .query("assimilationSessions")
      .withIndex("by_repositoryUrl", (q) => q.eq("repositoryUrl", repositoryUrl))
      .collect();

    return sessions.find((s) => activeStatuses.includes(s.status)) ?? null;
  },
});

/**
 * Internal: Get session for scheduled actions
 */
export const getSessionInternal = internalQuery({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db.get(sessionId);
  },
});

/**
 * Internal: List all sessions with a given status (for timeout housekeeping)
 */
export const getActiveSessionsByStatus = internalQuery({
  args: {
    status: v.string(),
  },
  handler: async (ctx, { status }) => {
    return await ctx.db
      .query("assimilationSessions")
      .withIndex("by_status", (q) => q.eq("status", status))
      .collect();
  },
});

/**
 * Internal: List iterations for a session
 */
export const listIterations = internalQuery({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const iterations = await ctx.db
      .query("assimilationIterations")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    return iterations.sort((a, b) => a.iterationNumber - b.iterationNumber);
  },
});
