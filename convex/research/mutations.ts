/**
 * Research Mutations for Deep Research Workflow (US-055)
 *
 * Creates and updates deep research sessions and iterations
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

const deepResearchSessionStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("running"),
  v.literal("in_progress"),
  v.literal("in-progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("error"),
  v.literal("failed"),
  v.literal("timeout")
);

const deepResearchIterationStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("running"),
  v.literal("in_progress"),
  v.literal("in-progress"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("error")
);

/**
 * Create a new deep research session
 *
 * AC-1: Deep research started → Create session record
 */
export const createDeepResearchSession = mutation({
  args: {
    conversationId: v.id("conversations"),
    topic: v.string(),
    maxIterations: v.optional(v.number()),
    researchType: v.optional(v.string()),
    researchMode: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, topic, maxIterations = 5, researchType = "deep", researchMode }) => {
    const now = Date.now();

    const sessionId = await ctx.db.insert("deepResearchSessions", {
      conversationId,
      topic,
      researchType,
      researchMode,
      maxIterations,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    
    return sessionId;
  },
});

/**
 * Create a deep research iteration record
 *
 * AC-4: Synthesis complete → Store iteration with coverage score
 */
export const createDeepResearchIteration = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    iterationNumber: v.number(),
    coverageScore: v.optional(v.number()),
    feedback: v.optional(v.string()),
    findings: v.optional(v.string()),
    refinedQueries: v.optional(v.any()),
    status: deepResearchIterationStatus,
    summary: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (
    ctx,
    {
      sessionId,
      iterationNumber,
      coverageScore,
      feedback,
      findings,
      refinedQueries,
      status,
      summary,
      embedding,
    }
  ) => {
    const now = Date.now();

    const iterationId = await ctx.db.insert("deepResearchIterations", {
      sessionId,
      iterationNumber,
      coverageScore,
      feedback,
      findings,
      refinedQueries,
      status,
      summary,
      embedding,
      createdAt: now,
    });


    // Update session status
    await ctx.db.patch(sessionId, {
      status,
      updatedAt: now,
    });

    return iterationId;
  },
});

/**
 * Update deep research session status
 *
 * Used during iteration to update session status without completing
 */
export const updateDeepResearchSession = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    status: deepResearchSessionStatus,
    currentIteration: v.optional(v.number()),
    refinedTopic: v.optional(v.string()),
    currentCoverageScore: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, status, currentIteration, refinedTopic, currentCoverageScore }) => {
    const now = Date.now();

    const updates: any = {
      status,
      updatedAt: now,
    };

    if (currentIteration !== undefined) {
      updates.currentIteration = currentIteration;
    }

    if (refinedTopic !== undefined) {
      updates.refinedTopic = refinedTopic;
    }

    if (currentCoverageScore !== undefined) {
      updates.currentCoverageScore = currentCoverageScore;
      
    }

    
    await ctx.db.patch(sessionId, updates);

    // Verify the update by reading back
    const updatedSession = await ctx.db.get(sessionId);

    
  },
});

/**
 * Mark deep research session as completed
 *
 * AC-5: Score >= 4 or max iterations reached → Complete session
 */
export const completeDeepResearchSession = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    status: deepResearchSessionStatus,
    finalConfidenceSummary: v.optional(v.object({
      highConfidenceCount: v.number(),
      mediumConfidenceCount: v.number(),
      lowConfidenceCount: v.number(),
      averageConfidenceScore: v.number(),
      claimsWithMultipleSources: v.number(),
      totalClaims: v.number(),
    })),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, status, finalConfidenceSummary, errorReason }) => {
    const now = Date.now();

    const updates: any = {
      status,
      completedAt: now,
      updatedAt: now,
    };

    if (finalConfidenceSummary) {
      updates.finalConfidenceSummary = finalConfidenceSummary;
      
    }

    if (errorReason) {
      updates.errorReason = errorReason;
    }

    await ctx.db.patch(sessionId, updates);


    // Create notification for completion or error
    if (status === "completed" && !errorReason) {
      const session = await ctx.db.get(sessionId);
      await ctx.db.insert("notifications", {
        type: "research_complete",
        title: "Research Complete",
        body: session?.topic ? `Deep research on "${session.topic}" has finished.` : "Your deep research session has finished.",
        route: session?.documentId ? `/document/${session.documentId}` : `/research/${sessionId}`,
        referenceId: sessionId,
        read: false,
        createdAt: now,
      });

      // Trigger document creation for successfully completed sessions
      // Skip if document already exists (e.g., simple research creates document inline)
      if (!session?.documentId) {
        await ctx.scheduler.runAfter(0, internal.research.documents.createResearchDocument, {
          sessionId,
        });
      } else {
        
      }
    } else if (errorReason) {
      await ctx.db.insert("notifications", {
        type: "research_failed",
        title: "Research Failed",
        body: errorReason,
        route: `/research/${sessionId}`,
        referenceId: sessionId,
        read: false,
        createdAt: now,
      });
    }
  },
});

/**
 * Create a research finding with confidence scoring
 *
 * Stores individual claims with their confidence factors and citation links
 */
export const createResearchFinding = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    iterationId: v.id("deepResearchIterations"),
    claimText: v.string(),
    claimCategory: v.optional(v.string()),
    sourceCredibilityScore: v.number(),
    evidenceQualityScore: v.number(),
    corroborationScore: v.number(),
    recencyScore: v.number(),
    expertConsensusScore: v.number(),
    confidenceScore: v.number(),
    confidenceLevel: v.string(),
    citationIds: v.array(v.id("citations")),
    confidenceFactors: v.optional(v.any()),
    caveats: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const findingId = await ctx.db.insert("researchFindings", {
      sessionId: args.sessionId,
      iterationId: args.iterationId,
      claimText: args.claimText,
      claimCategory: args.claimCategory,
      sourceCredibilityScore: args.sourceCredibilityScore,
      evidenceQualityScore: args.evidenceQualityScore,
      corroborationScore: args.corroborationScore,
      recencyScore: args.recencyScore,
      expertConsensusScore: args.expertConsensusScore,
      confidenceScore: args.confidenceScore,
      confidenceLevel: args.confidenceLevel,
      citationIds: args.citationIds,
      confidenceFactors: args.confidenceFactors,
      caveats: args.caveats,
      warnings: args.warnings,
      embedding: args.embedding,
      createdAt: now,
    });

    
    return findingId;
  },
});

/**
 * Create a citation with credibility metadata
 *
 * Extended citation creation for deep research with source type and credibility scoring
 */
export const createCitationWithCredibility = mutation({
  args: {
    deepResearchSessionId: v.id("deepResearchSessions"),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    claimText: v.string(),
    claimMarker: v.optional(v.string()),
    sourceType: v.optional(v.string()),
    credibilityScore: v.optional(v.number()),
    evidenceType: v.optional(v.string()),
    publishedDate: v.optional(v.string()),
    authorCredentials: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Extract domain from URL if not provided
    let domain = args.sourceDomain;
    if (!domain && args.sourceUrl) {
      try {
        domain = new URL(args.sourceUrl).hostname;
      } catch {
        domain = undefined;
      }
    }

    const citationId = await ctx.db.insert("citations", {
      deepResearchSessionId: args.deepResearchSessionId,
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceTitle,
      sourceDomain: domain,
      claimText: args.claimText,
      claimMarker: args.claimMarker,
      sourceType: args.sourceType,
      credibilityScore: args.credibilityScore,
      evidenceType: args.evidenceType,
      publishedDate: args.publishedDate,
      authorCredentials: args.authorCredentials,
      retrievedAt: now,
    });

    
    return citationId;
  },
});

/**
 * Update iteration with confidence statistics
 *
 * Called after processing all findings for an iteration
 */
export const updateIterationConfidenceStats = mutation({
  args: {
    iterationId: v.id("deepResearchIterations"),
    confidenceStats: v.object({
      highConfidenceCount: v.number(),
      mediumConfidenceCount: v.number(),
      lowConfidenceCount: v.number(),
      averageConfidenceScore: v.number(),
      claimsWithMultipleSources: v.number(),
      totalClaims: v.number(),
    }),
  },
  handler: async (ctx, { iterationId, confidenceStats }) => {
    

    await ctx.db.patch(iterationId, {
      confidenceStats,
    });

  },
});

/**
 * Link document to deep research session (internal)
 *
 * Called by createResearchDocument action after document is created
 */
/**
 * Cancel a running research session.
 * Sets status to "cancelled" so the next scheduled iteration will exit early.
 */
export const cancelResearchSession = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Only cancel if still in progress
    const cancelableStatuses = ["pending", "in_progress", "running"];
    if (!cancelableStatuses.includes(session.status)) {
      return { alreadyDone: true, status: session.status };
    }

    const now = Date.now();
    await ctx.db.patch(sessionId, {
      status: "cancelled",
      completedAt: now,
      updatedAt: now,
      errorReason: "Cancelled by user",
    });

    return { alreadyDone: false, status: "cancelled" };
  },
});

/**
 * Retry a failed or timed-out research session.
 * Resets status to "pending" and re-triggers the research action.
 */
export const retryResearchSession = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const retryableStatuses = ["error", "failed", "timeout"];
    if (!retryableStatuses.includes(session.status)) {
      return { alreadyDone: true, status: session.status };
    }

    const now = Date.now();
    await ctx.db.patch(sessionId, {
      status: "pending",
      updatedAt: now,
      completedAt: undefined,
      errorReason: undefined,
      currentIteration: undefined,
      currentCoverageScore: undefined,
    });

    // Re-trigger research action
    await ctx.scheduler.runAfter(0, api.research.actions.startSmartResearch, {
      conversationId: session.conversationId,
      topic: session.topic,
    });

    return { alreadyDone: false, status: "pending" };
  },
});

export const updateDeepResearchSessionDocumentId = internalMutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, { sessionId, documentId }) => {
    
    await ctx.db.patch(sessionId, { documentId });
    
  },
});
