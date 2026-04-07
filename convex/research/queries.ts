/**
 * Research Queries for Deep Research Workflow
 *
 * Query functions for retrieving research session and iteration data
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Get deep research session by ID with its iterations, findings, and citations
 *
 * Transforms database documents to app-level types with:
 * - _id → id
 * - topic → query (UI expects "query" field)
 * - Fetches report from iteration findings
 * - Fetches citations from researchFindings
 */
export const getDeepResearchSession = query({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) {
      return null;
    }

    // Fetch all iterations for this session
    const iterationsRaw = await ctx.db
      .query("deepResearchIterations")
      .withIndex("by_session", q => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();

    // Transform iterations to app-level type
    // Convert Convex IDs to strings, keep timestamps as numbers (Convex doesn't support Date objects)
    const iterations = iterationsRaw.map((iter) => ({
      id: iter._id.toString(),
      sessionId: iter.sessionId.toString(),
      iterationNumber: iter.iterationNumber,
      coverageScore: iter.coverageScore ?? null,
      feedback: iter.feedback ?? null,
      refinedQueries: iter.refinedQueries ?? null,
      findings: iter.findings ?? null,
      status: iter.status as 'pending' | 'running' | 'completed',
      createdAt: iter.createdAt,
      updatedAt: iter.createdAt, // Use createdAt as fallback since updatedAt doesn't exist in schema
    }));

    // Fetch all research findings for this session to build citations
    const findings = await ctx.db
      .query("researchFindings")
      .withIndex("by_session", q => q.eq("sessionId", sessionId))
      .collect();

    // Extract unique citations from all findings
    const citationMap = new Map<string, any>();
    for (const finding of findings) {
      for (const citationId of finding.citationIds) {
        const citation = await ctx.db.get(citationId);
        if (citation && !citationMap.has(citation._id.toString())) {
          citationMap.set(citation._id.toString(), {
            id: citationMap.size + 1, // Sequential citation numbers
            title: citation.sourceTitle ?? citation.sourceUrl,
            url: citation.sourceUrl,
          });
        }
      }
    }

    const citations = Array.from(citationMap.values());

    // Get synthesized report from the linked document (if available)
    // The document contains the LLM-synthesized report, not just raw iteration findings
    // IMPORTANT: Never fall back to raw iteration concatenation - synthesis must always happen
    let report: string | null = null;
    if (session.documentId) {
      const document = await ctx.db.get(session.documentId);
      if (document?.content) {
        report = document.content;
      }
    }

    // If no synthesized document exists yet, indicate synthesis is pending
    // Do NOT fall back to raw iteration findings - synthesis is mandatory
    if (!report) {
      if (session.status === "completed") {
        // Session complete but document not ready yet - synthesis is in progress
        report = "Synthesizing research report...";
      } else if (iterationsRaw.length > 0) {
        // Research still in progress
        report = "Research in progress...";
      } else {
        report = "Starting research...";
      }
    }

    // Transform session to app-level type with iterations, report, and citations
    // Convert Convex IDs to strings, keep timestamps as numbers (Convex doesn't support Date objects)
    return {
      id: session._id.toString(),
      conversationId: session.conversationId?.toString() ?? null,
      query: session.topic, // UI expects "query" field, not "topic"
      topic: session.topic, // Keep for backward compatibility
      maxIterations: session.maxIterations ?? 5,
      status: session.status as 'pending' | 'running' | 'paused' | 'completed' | 'cancelled',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt ?? null,
      documentId: session.documentId?.toString() ?? null,
      iterations,
      report, // Synthesized markdown report from findings
      citations, // Unique citations from all findings
      savedToHolocron: false, // TODO: Implement Holocron save tracking
    };
  },
});

/**
 * List all iterations for a research session
 */
export const listDeepResearchIterations = query({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("deepResearchIterations")
      .withIndex("by_session", q => q.eq("sessionId", sessionId))
      .order("asc")
      .collect();
  },
});

/**
 * Get research findings filtered by confidence level
 *
 * @param sessionId - Deep research session ID
 * @param confidenceFilter - Filter mode: HIGH_ONLY | HIGH_MEDIUM | ALL
 */
export const getFindingsByConfidence = query({
  args: {
    sessionId: v.id("deepResearchSessions"),
    confidenceFilter: v.optional(v.string()), // HIGH_ONLY | HIGH_MEDIUM | ALL
  },
  handler: async (ctx, { sessionId, confidenceFilter = "ALL" }) => {
    // Fetch all findings for this session
    const findings = await ctx.db
      .query("researchFindings")
      .withIndex("by_session", q => q.eq("sessionId", sessionId))
      .collect();

    // Apply confidence filter
    let filteredFindings = findings;
    switch (confidenceFilter) {
      case "HIGH_ONLY":
        filteredFindings = findings.filter(f => f.confidenceLevel === "HIGH");
        break;
      case "HIGH_MEDIUM":
        filteredFindings = findings.filter(f =>
          f.confidenceLevel === "HIGH" || f.confidenceLevel === "MEDIUM"
        );
        break;
      case "ALL":
      default:
        // No filter - return all
        break;
    }

    // Sort by confidence score descending
    filteredFindings.sort((a, b) => b.confidenceScore - a.confidenceScore);

    // Transform findings to include citation details
    const findingsWithCitations = await Promise.all(
      filteredFindings.map(async (finding) => {
        const citations = await Promise.all(
          finding.citationIds.map(async (citationId) => {
            return await ctx.db.get(citationId);
          })
        );

        return {
          id: finding._id.toString(),
          claimText: finding.claimText,
          claimCategory: finding.claimCategory,
          confidenceScore: finding.confidenceScore,
          confidenceLevel: finding.confidenceLevel as 'HIGH' | 'MEDIUM' | 'LOW',
          factors: {
            sourceCredibility: finding.sourceCredibilityScore,
            evidenceQuality: finding.evidenceQualityScore,
            corroboration: finding.corroborationScore,
            recency: finding.recencyScore,
            expertConsensus: finding.expertConsensusScore,
          },
          caveats: finding.caveats ?? [],
          warnings: finding.warnings ?? [],
          citations: citations.filter(Boolean).map((c: any) => ({
            url: c.sourceUrl,
            title: c.sourceTitle,
            domain: c.sourceDomain,
            sourceType: c.sourceType,
            credibilityScore: c.credibilityScore,
          })),
          sourceCount: finding.citationIds.length,
          createdAt: finding.createdAt,
        };
      })
    );

    return findingsWithCitations;
  },
});

/**
 * Get session confidence summary
 *
 * Returns aggregated confidence statistics for a session
 */
export const getSessionConfidenceSummary = query({
  args: {
    sessionId: v.id("deepResearchSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) {
      return null;
    }

    // Fetch all findings for this session
    const findings = await ctx.db
      .query("researchFindings")
      .withIndex("by_session", q => q.eq("sessionId", sessionId))
      .collect();

    // Calculate stats if not already stored
    const stats = {
      highConfidenceCount: findings.filter(f => f.confidenceLevel === "HIGH").length,
      mediumConfidenceCount: findings.filter(f => f.confidenceLevel === "MEDIUM").length,
      lowConfidenceCount: findings.filter(f => f.confidenceLevel === "LOW").length,
      averageConfidenceScore: findings.length > 0
        ? Math.round(findings.reduce((sum, f) => sum + f.confidenceScore, 0) / findings.length)
        : 0,
      claimsWithMultipleSources: findings.filter(f => f.citationIds.length >= 3).length,
      totalClaims: findings.length,
    };

    // Calculate confidence distribution percentage
    const distribution = {
      highPercent: findings.length > 0 ? Math.round((stats.highConfidenceCount / findings.length) * 100) : 0,
      mediumPercent: findings.length > 0 ? Math.round((stats.mediumConfidenceCount / findings.length) * 100) : 0,
      lowPercent: findings.length > 0 ? Math.round((stats.lowConfidenceCount / findings.length) * 100) : 0,
    };

    // Determine overall confidence level
    let overallLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (distribution.highPercent >= 60 && stats.averageConfidenceScore >= 75) {
      overallLevel = 'HIGH';
    } else if (distribution.highPercent + distribution.mediumPercent >= 70 && stats.averageConfidenceScore >= 50) {
      overallLevel = 'MEDIUM';
    }

    return {
      sessionId: sessionId.toString(),
      topic: session.topic,
      status: session.status,
      stats,
      distribution,
      overallLevel,
      meetsMultiSourceRequirement: stats.claimsWithMultipleSources >= Math.ceil(stats.totalClaims * 0.5),
      // Use stored summary if available (more accurate for completed sessions)
      finalSummary: session.finalConfidenceSummary ?? null,
    };
  },
});

/**
 * Get findings by iteration
 *
 * Returns all findings for a specific iteration with confidence data
 */
export const getFindingsByIteration = query({
  args: {
    iterationId: v.id("deepResearchIterations"),
  },
  handler: async (ctx, { iterationId }) => {
    const findings = await ctx.db
      .query("researchFindings")
      .withIndex("by_iteration", q => q.eq("iterationId", iterationId))
      .collect();

    return findings.map(finding => ({
      id: finding._id.toString(),
      claimText: finding.claimText,
      claimCategory: finding.claimCategory,
      confidenceScore: finding.confidenceScore,
      confidenceLevel: finding.confidenceLevel,
      sourceCount: finding.citationIds.length,
      caveats: finding.caveats ?? [],
      warnings: finding.warnings ?? [],
    }));
  },
});

/**
 * Vector search for research iterations
 *
 * Searches iterations by semantic similarity using embeddings
 */
export const vectorSearchIterations = query({
  args: {
    embedding: v.array(v.float64()),
    limit: v.optional(v.number()),
    sessionId: v.optional(v.id("deepResearchSessions")),
  },
  handler: async (ctx, { embedding, limit = 10, sessionId }) => {
    let results = await (ctx.db
      .query("deepResearchIterations") as any)
      .withIndex("by_embedding", (q: any) =>
        q.similar("embedding", embedding, limit * 2)
      )
      .collect();

    if (sessionId) {
      results = results.filter((r: any) => r.sessionId === sessionId);
    }

    return results
      .map((iteration: any) => ({
        _id: iteration._id,
        sessionId: iteration.sessionId,
        findings: iteration.findings,
        score: iteration.embedding
          ? cosineSimilarity(embedding, iteration.embedding)
          : 0,
      }))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, limit);
  },
});

/**
 * Full-text search for research iterations
 *
 * Searches iterations by keyword matching in findings text
 * Uses index-based filtering for session to improve performance
 */
export const fullTextSearchIterations = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
    sessionId: v.optional(v.id("deepResearchSessions")),
  },
  handler: async (ctx, { query: searchQuery, limit = 10, sessionId }) => {
    // Use index for sessionId filtering when provided
    let iterations;
    if (sessionId) {
      iterations = await ctx.db
        .query("deepResearchIterations")
        .withIndex("by_session", q => q.eq("sessionId", sessionId))
        .collect();
    } else {
      iterations = await ctx.db
        .query("deepResearchIterations")
        .collect();
    }

    const searchLower = searchQuery.toLowerCase();
    const filtered = iterations.filter(it =>
      it.findings?.toLowerCase().includes(searchLower)
    );

    return filtered.slice(0, limit).map((iteration, index) => ({
      _id: iteration._id,
      sessionId: iteration.sessionId,
      findings: iteration.findings,
      score: filtered.length > 0 ? 1 - index / filtered.length : 0,
    }));
  },
});

/**
 * Get all research sessions for a conversation (for context building)
 *
 * Returns completed sessions ordered by creation time (oldest first)
 */
export const getByConversation = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { conversationId }) => {
    const sessions = await ctx.db
      .query("deepResearchSessions")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .filter((q) => q.eq(q.field("status"), "completed"))
      .order("asc")
      .collect();

    return sessions.map((session) => ({
      _id: session._id,
      topic: session.topic,
      createdAt: session.createdAt,
    }));
  },
});
