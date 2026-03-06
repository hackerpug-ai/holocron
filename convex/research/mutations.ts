/**
 * Research Mutations for Deep Research Workflow (US-055)
 *
 * Creates and updates deep research sessions and iterations
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

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
  },
  handler: async (ctx, { conversationId, topic, maxIterations = 5 }) => {
    const now = Date.now();

    const sessionId = await ctx.db.insert("deepResearchSessions", {
      conversationId,
      topic,
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
    status: v.string(),
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
    status: v.string(),
  },
  handler: async (ctx, { sessionId, status }) => {
    const now = Date.now();

    await ctx.db.patch(sessionId, {
      status,
      updatedAt: now,
    });
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
  },
  handler: async (ctx, { sessionId, status }) => {
    const now = Date.now();

    await ctx.db.patch(sessionId, {
      status,
      completedAt: now,
      updatedAt: now,
    });
  },
});
