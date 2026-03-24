/**
 * Assimilation Mutations for Borg-themed Repository Analysis
 *
 * Creates and stores assimilation metadata for analyzed repositories
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { resolveProfile, isValidGitHubUrl, extractRepoName, INITIAL_DIMENSION_SCORES } from "./validators";

/**
 * Save assimilation results
 *
 * Creates both a document entry and metadata entry for repository analysis
 * Returns both documentId and metadataId for reference
 */
export const saveAssimilation = mutation({
  args: {
    // Document fields
    title: v.string(),
    content: v.string(),
    filePath: v.optional(v.string()),
    researchType: v.optional(v.string()),
    // Assimilation metadata fields
    repositoryUrl: v.string(),
    repositoryName: v.string(),
    primaryLanguage: v.optional(v.string()),
    stars: v.optional(v.number()),
    sophisticationRating: v.number(), // 1-5 scale
    trackRatings: v.object({
      architecture: v.number(), // 1-5 scale
      patterns: v.number(), // 1-5 scale
      documentation: v.number(), // 1-5 scale
      dependencies: v.number(), // 1-5 scale
      testing: v.number(), // 1-5 scale
    }),
  },
  handler: async (
    ctx,
    {
      title,
      content,
      filePath,
      researchType,
      repositoryUrl,
      repositoryName,
      primaryLanguage,
      stars,
      sophisticationRating,
      trackRatings,
    }
  ) => {
    console.log(`[saveAssimilation] Entry - repository: "${repositoryName}", rating: ${sophisticationRating}`);
    const now = Date.now();

    // Step 1: Insert document entry
    console.log(`[saveAssimilation] Creating document entry`);
    const documentId = await ctx.db.insert("documents", {
      title,
      content,
      category: "assimilation",
      filePath,
      researchType,
      createdAt: now,
    });
    console.log(`[saveAssimilation] Document created - ID: ${documentId}`);

    // Schedule embedding generation for the new document
    await ctx.scheduler.runAfter(0, api.documents.storage.updateWithEmbedding as any, {
      id: documentId,
      content,
    });

    // Step 2: Insert metadata entry
    console.log(`[saveAssimilation] Creating metadata entry`);
    const metadataId = await ctx.db.insert("assimilationMetadata", {
      documentId,
      repositoryUrl,
      repositoryName,
      primaryLanguage,
      stars,
      sophisticationRating,
      trackRatings,
      createdAt: now,
    });
    console.log(`[saveAssimilation] Metadata created - ID: ${metadataId}`);

    console.log(`[saveAssimilation] Exit - Success`);
    return {
      documentId,
      metadataId,
    };
  },
});

// ── Public mutations ─────────────────────────────────────────────────────────

/**
 * Start a new assimilation session
 * Creates session, schedules planning iteration (iteration 0)
 */
export const startAssimilation = mutation({
  args: {
    repositoryUrl: v.string(),
    profile: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    autoApprove: v.optional(v.boolean()),
  },
  handler: async (ctx, { repositoryUrl, profile = "standard", conversationId, autoApprove = false }) => {
    // Validate URL
    if (!isValidGitHubUrl(repositoryUrl)) {
      throw new Error(`Invalid GitHub URL: ${repositoryUrl}. Must be https://github.com/{owner}/{repo}`);
    }

    // Check for existing active session
    const activeStatuses = ['pending_approval', 'planning', 'approved', 'in_progress', 'synthesizing'];
    const existingSessions = await ctx.db
      .query("assimilationSessions")
      .withIndex("by_repositoryUrl", (q) => q.eq("repositoryUrl", repositoryUrl))
      .collect();

    const activeSession = existingSessions.find((s) => activeStatuses.includes(s.status));
    if (activeSession) {
      return { sessionId: activeSession._id, status: activeSession.status, existing: true };
    }

    const now = Date.now();
    const criteria = resolveProfile(profile);
    const repoName = extractRepoName(repositoryUrl);

    const sessionId = await ctx.db.insert("assimilationSessions", {
      conversationId,
      repositoryUrl,
      repositoryName: repoName,
      profile,
      status: "planning",
      currentIteration: 0,
      maxIterations: criteria.maxIterations,
      autoApprove,
      dimensionScores: INITIAL_DIMENSION_SCORES,
      terminationCriteria: criteria,
      estimatedCostUsd: 0,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    });

    // Schedule iteration 0 (planning phase)
    await ctx.scheduler.runAfter(0, internal.assimilate.scheduled.processIteration, {
      sessionId,
    });

    return { sessionId, status: "planning", existing: false };
  },
});

/**
 * Approve the assimilation plan — starts the analysis loop
 */
export const approveAssimilationPlan = mutation({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "pending_approval") {
      throw new Error(`Cannot approve session in status: ${session.status}`);
    }

    await ctx.db.patch(sessionId, {
      status: "in_progress",
      currentIteration: 1,
      updatedAt: Date.now(),
    });

    // Schedule first analysis iteration
    await ctx.scheduler.runAfter(1000, internal.assimilate.scheduled.processIteration, {
      sessionId,
    });
  },
});

/**
 * Reject or request revision of the plan
 * If feedback provided: re-plans with feedback
 * If no feedback: marks as rejected (terminal)
 */
export const rejectAssimilationPlan = mutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, feedback }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "pending_approval") {
      throw new Error(`Cannot reject session in status: ${session.status}`);
    }

    if (feedback) {
      // Re-plan with feedback
      await ctx.db.patch(sessionId, {
        status: "planning",
        planFeedback: feedback,
        currentIteration: 0,
        updatedAt: Date.now(),
      });

      // Schedule re-planning
      await ctx.scheduler.runAfter(0, internal.assimilate.scheduled.processIteration, {
        sessionId,
      });
    } else {
      // Terminal rejection
      await ctx.db.patch(sessionId, {
        status: "rejected",
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });
    }
  },
});

/**
 * Cancel an active assimilation
 */
export const cancelAssimilation = mutation({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const terminalStatuses = ['completed', 'failed', 'cancelled', 'rejected'];
    if (terminalStatuses.includes(session.status)) {
      throw new Error(`Cannot cancel session in status: ${session.status}`);
    }

    await ctx.db.patch(sessionId, {
      status: "cancelled",
      updatedAt: Date.now(),
      completedAt: Date.now(),
    });
  },
});

/**
 * Inject human steering note for the next iteration
 */
export const steerAssimilation = mutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    note: v.string(),
  },
  handler: async (ctx, { sessionId, note }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "in_progress") {
      throw new Error(`Cannot steer session in status: ${session.status}`);
    }

    await ctx.db.patch(sessionId, {
      steeringNote: note,
      updatedAt: Date.now(),
    });
  },
});

// ── Internal mutations ───────────────────────────────────────────────────────

/**
 * Create an iteration record
 */
export const createIteration = internalMutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    iterationNumber: v.number(),
    dimension: v.string(),
    iterationType: v.string(),
    findings: v.optional(v.string()),
    notesContribution: v.optional(v.string()),
    summary: v.optional(v.string()),
    dimensionCoverageScore: v.optional(v.number()),
    gapsIdentified: v.optional(v.array(v.string())),
    noveltyScore: v.optional(v.number()),
    nextAction: v.optional(v.object({
      shouldContinue: v.boolean(),
      nextDimension: v.optional(v.string()),
      reason: v.string(),
      trigger: v.optional(v.string()),
    })),
    status: v.string(),
    durationMs: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("assimilationIterations", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Update session progress (working memory fields)
 */
export const updateSessionProgress = internalMutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    status: v.optional(v.string()),
    currentIteration: v.optional(v.number()),
    accumulatedNotes: v.optional(v.string()),
    coveragePlan: v.optional(v.any()),
    nextDimension: v.optional(v.string()),
    dimensionScores: v.optional(v.object({
      architecture: v.number(),
      patterns: v.number(),
      documentation: v.number(),
      dependencies: v.number(),
      testing: v.number(),
    })),
    failureConstraints: v.optional(v.array(v.string())),
    estimatedCostUsd: v.optional(v.number()),
    planContent: v.optional(v.string()),
    planSummary: v.optional(v.string()),
    steeringNote: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, ...updates }) => {
    // Filter out undefined values
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        patch[key] = value;
      }
    }
    await ctx.db.patch(sessionId, patch);
  },
});

/**
 * Mark session as completed with output links
 */
export const completeSession = internalMutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    status: v.string(),
    documentId: v.optional(v.id("documents")),
    metadataId: v.optional(v.id("assimilationMetadata")),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, status, documentId, metadataId, errorReason }) => {
    const patch: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    };
    if (documentId) patch.documentId = documentId;
    if (metadataId) patch.metadataId = metadataId;
    if (errorReason) patch.errorReason = errorReason;

    await ctx.db.patch(sessionId, patch);
  },
});
