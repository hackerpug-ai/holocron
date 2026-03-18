/**
 * Research Mutations for Deep Research Workflow (US-055)
 *
 * Creates and updates deep research sessions and iterations
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

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
  },
  handler: async (ctx, { conversationId, topic, maxIterations = 5, researchType = "deep" }) => {
    console.log(`[createDeepResearchSession] Entry - conversationId: ${conversationId}, topic: "${topic}", maxIterations: ${maxIterations}, researchType: ${researchType}`);
    const now = Date.now();

    const sessionId = await ctx.db.insert("deepResearchSessions", {
      conversationId,
      topic,
      researchType,
      maxIterations,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    console.log(`[createDeepResearchSession] Session created - ID: ${sessionId}, type: ${researchType}`);
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
    status: v.string(),
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
    console.log(`[createDeepResearchIteration] Entry - sessionId: ${sessionId}, iteration: ${iterationNumber}, coverageScore: ${coverageScore}, status: ${status}`);
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

    console.log(`[createDeepResearchIteration] Iteration created - ID: ${iterationId}`);

    // Update session status
    console.log(`[createDeepResearchIteration] Updating session status to: ${status}`);
    await ctx.db.patch(sessionId, {
      status,
      updatedAt: now,
    });

    console.log(`[createDeepResearchIteration] Exit - Success`);
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
    status: v.string(),
    currentIteration: v.optional(v.number()),
    refinedTopic: v.optional(v.string()),
    currentCoverageScore: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, status, currentIteration, refinedTopic, currentCoverageScore }) => {
    console.log(`[updateDeepResearchSession] Entry - sessionId: ${sessionId}, status: ${status}, iteration: ${currentIteration}, score: ${currentCoverageScore}`);
    const now = Date.now();

    const updates: any = {
      status,
      updatedAt: now,
    };

    if (currentIteration !== undefined) {
      updates.currentIteration = currentIteration;
      console.log(`[updateDeepResearchSession] Setting currentIteration to ${currentIteration}`);
    }

    if (refinedTopic !== undefined) {
      updates.refinedTopic = refinedTopic;
      console.log(`[updateDeepResearchSession] Setting refinedTopic to "${refinedTopic.substring(0, 50)}..."`);
    }

    if (currentCoverageScore !== undefined) {
      updates.currentCoverageScore = currentCoverageScore;
      console.log(`[updateDeepResearchSession] Setting currentCoverageScore to ${currentCoverageScore}`);
    }

    console.log(`[updateDeepResearchSession] Applying updates:`, updates);
    await ctx.db.patch(sessionId, updates);

    // Verify the update by reading back
    const updatedSession = await ctx.db.get(sessionId);
    console.log(`[updateDeepResearchSession] Session after update - currentIteration: ${updatedSession?.currentIteration}, currentCoverageScore: ${updatedSession?.currentCoverageScore}`);

    console.log(`[updateDeepResearchSession] Session updated successfully`);
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
    status: v.string(),
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
    console.log(`[completeDeepResearchSession] Entry - sessionId: ${sessionId}, status: ${status}${errorReason ? `, errorReason: ${errorReason}` : ""}`);
    const now = Date.now();

    const updates: any = {
      status,
      completedAt: now,
      updatedAt: now,
    };

    if (finalConfidenceSummary) {
      updates.finalConfidenceSummary = finalConfidenceSummary;
      console.log(`[completeDeepResearchSession] Setting finalConfidenceSummary - high: ${finalConfidenceSummary.highConfidenceCount}, medium: ${finalConfidenceSummary.mediumConfidenceCount}, low: ${finalConfidenceSummary.lowConfidenceCount}`);
    }

    if (errorReason) {
      updates.errorReason = errorReason;
      console.log(`[completeDeepResearchSession] Setting errorReason: ${errorReason}`);
    }

    await ctx.db.patch(sessionId, updates);

    console.log(`[completeDeepResearchSession] Session completed at ${new Date(now).toISOString()}`);

    // Trigger document creation for successfully completed sessions
    // Skip if document already exists (e.g., simple research creates document inline)
    if (status === "completed" && !errorReason) {
      const session = await ctx.db.get(sessionId);
      if (!session?.documentId) {
        console.log(`[completeDeepResearchSession] Scheduling document creation for session ${sessionId}`);
        await ctx.scheduler.runAfter(0, internal.research.documents.createResearchDocument, {
          sessionId,
        });
      } else {
        console.log(`[completeDeepResearchSession] Document already exists: ${session.documentId}, skipping creation`);
      }
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
    console.log(`[createResearchFinding] Entry - sessionId: ${args.sessionId}, confidenceLevel: ${args.confidenceLevel}, score: ${args.confidenceScore}`);
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

    console.log(`[createResearchFinding] Finding created - ID: ${findingId}, citations: ${args.citationIds.length}`);
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
    console.log(`[createCitationWithCredibility] Entry - sessionId: ${args.deepResearchSessionId}, sourceType: ${args.sourceType}, credibility: ${args.credibilityScore}`);
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

    console.log(`[createCitationWithCredibility] Citation created - ID: ${citationId}, domain: ${domain}`);
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
    console.log(`[updateIterationConfidenceStats] Entry - iterationId: ${iterationId}`);
    console.log(`[updateIterationConfidenceStats] Stats - high: ${confidenceStats.highConfidenceCount}, medium: ${confidenceStats.mediumConfidenceCount}, low: ${confidenceStats.lowConfidenceCount}, avg: ${confidenceStats.averageConfidenceScore}`);

    await ctx.db.patch(iterationId, {
      confidenceStats,
    });

    console.log(`[updateIterationConfidenceStats] Iteration stats updated`);
  },
});

/**
 * Link document to deep research session (internal)
 *
 * Called by createResearchDocument action after document is created
 */
export const updateDeepResearchSessionDocumentId = internalMutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, { sessionId, documentId }) => {
    console.log(`[updateDeepResearchSessionDocumentId] Linking document ${documentId} to session ${sessionId}`);
    await ctx.db.patch(sessionId, { documentId });
    console.log(`[updateDeepResearchSessionDocumentId] Document linked successfully`);
  },
});
