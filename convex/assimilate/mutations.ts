/**
 * Assimilation Mutations for Borg-themed Repository Analysis
 *
 * Creates and stores assimilation metadata for analyzed repositories
 */

import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { api } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import {
  fencedInternalMutation as internalMutation,
  fencedMutation as mutation,
} from '../lib/migrationFence';

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
    const now = Date.now();

    // Step 1: Insert document entry
    const documentId = await ctx.db.insert('documents', {
      title,
      content,
      category: 'assimilation',
      filePath,
      researchType,
      createdAt: now,
    });

    // Update document counters (BP-005)
    await updateDocumentCountersInline(ctx, 'assimilation', false, 1);

    // Schedule embedding generation for the new document
    await ctx.scheduler.runAfter(
      0,
      makeFunctionReference<'action', { id: Id<'documents'>; content: string }, any>(
        'documents/storage:updateWithEmbedding'
      ),
      {
        id: documentId,
        content,
      }
    );

    // Step 2: Insert metadata entry
    const metadataId = await ctx.db.insert('assimilationMetadata', {
      documentId,
      repositoryUrl,
      repositoryName,
      primaryLanguage,
      stars,
      sophisticationRating,
      trackRatings,
      createdAt: now,
    });

    return {
      documentId,
      metadataId,
    };
  },
});

// ── Public mutations ─────────────────────────────────────────────────────────

/**
 * Start assimilation with universal planning system
 *
 * Task #304: Creates an assimilation plan using the universal planning system.
 *
 * This is the NEW entry point for assimilation that includes planning:
 * 1. Generates an assimilation plan using the plan generation service
 * 2. Posts a plan confirmation card to chat
 * 3. Returns the plan ID for user approval
 * 4. After approval, use executeApprovedAssimilationPlan to start analysis
 *
 * AC-1: Repository URL -> Generate plan -> Return plan for approval
 */
export const startAssimilationWithPlan = mutation({
  args: {
    repositoryUrl: v.string(),
    profile: v.optional(v.string()),
    conversationId: v.optional(v.id('conversations')),
    maxIterations: v.optional(v.number()),
    autoApprove: v.optional(v.boolean()),
  },
  handler: async (): Promise<{
    planId: Id<'executionPlans'>;
    status: string;
  }> => {
    // MIGRATED_TO_MISSION_ENGINE — agentic start path disabled (pipes-3).
    throw new Error(
      "MIGRATED_TO_MISSION_ENGINE: assimilate agentic pipeline disabled. Use: holo mission run assimilate --target '<owner/repo>'"
    );
  },
});

/**
 * Execute approved assimilation plan
 *
 * Task #304: Starts assimilation execution after plan approval.
 *
 * This action:
 * 1. Validates plan is approved
 * 2. Creates assimilation session
 * 3. Updates plan status during execution
 * 4. Links plan to session for tracking
 *
 * AC-2: Approved plan -> Execute -> Assimilation runs with plan, status updated
 */
export const executeApprovedAssimilationPlan = mutation({
  args: {
    planId: v.id('executionPlans'),
  },
  handler: async (): Promise<{
    sessionId: Id<'assimilationSessions'>;
    planId: Id<'executionPlans'>;
    status: string;
  }> => {
    // MIGRATED_TO_MISSION_ENGINE — agentic execute path disabled (pipes-3).
    throw new Error(
      "MIGRATED_TO_MISSION_ENGINE: assimilate agentic pipeline disabled. Use: holo mission run assimilate --target '<owner/repo>'"
    );
  },
});

/**
 * Start a new assimilation session (LEGACY - for backward compatibility)
 *
 * @deprecated Use startAssimilationWithPlan instead for new code.
 * This function is kept for backward compatibility.
 */
export const startAssimilation = mutation({
  args: {
    repositoryUrl: v.string(),
    profile: v.optional(v.string()),
    conversationId: v.optional(v.id('conversations')),
    autoApprove: v.optional(v.boolean()),
  },
  handler: async () => {
    // MIGRATED_TO_MISSION_ENGINE — legacy agentic start path disabled (pipes-3).
    throw new Error(
      "MIGRATED_TO_MISSION_ENGINE: assimilate agentic pipeline disabled. Use: holo mission run assimilate --target '<owner/repo>'"
    );
  },
});

/**
 * Approve the assimilation plan — starts the analysis loop
 */
export const approveAssimilationPlan = mutation({
  args: {
    sessionId: v.id('assimilationSessions'),
  },
  handler: async () => {
    // MIGRATED_TO_MISSION_ENGINE — agentic approve→iterate path disabled (pipes-3).
    throw new Error(
      "MIGRATED_TO_MISSION_ENGINE: assimilate agentic pipeline disabled. Use: holo mission run assimilate --target '<owner/repo>'"
    );
  },
});

/**
 * Reject or request revision of the plan
 * If feedback provided: re-plans with feedback
 * If no feedback: marks as rejected (terminal)
 */
export const rejectAssimilationPlan = mutation({
  args: {
    sessionId: v.id('assimilationSessions'),
    feedback: v.optional(v.string()),
  },
  handler: async (ctx, { sessionId, feedback }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'pending_approval') {
      throw new Error(`Cannot reject session in status: ${session.status}`);
    }

    // MIGRATED_TO_MISSION_ENGINE: no agentic re-plan schedule; terminal reject only.
    void feedback;
    await ctx.db.patch(sessionId, {
      status: 'rejected',
      updatedAt: Date.now(),
      completedAt: Date.now(),
      ...(feedback ? { planFeedback: feedback } : {}),
    });
  },
});

/**
 * Cancel an active assimilation
 */
export const cancelAssimilation = mutation({
  args: {
    sessionId: v.id('assimilationSessions'),
  },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('Session not found');

    const terminalStatuses = ['completed', 'failed', 'cancelled', 'rejected'];
    if (terminalStatuses.includes(session.status)) {
      throw new Error(`Cannot cancel session in status: ${session.status}`);
    }

    await ctx.db.patch(sessionId, {
      status: 'cancelled',
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
    sessionId: v.id('assimilationSessions'),
    note: v.string(),
  },
  handler: async (ctx, { sessionId, note }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'in_progress') {
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
    sessionId: v.id('assimilationSessions'),
    iterationNumber: v.number(),
    dimension: v.string(),
    iterationType: v.string(),
    findings: v.optional(v.string()),
    notesContribution: v.optional(v.string()),
    summary: v.optional(v.string()),
    dimensionCoverageScore: v.optional(v.number()),
    gapsIdentified: v.optional(v.array(v.string())),
    noveltyScore: v.optional(v.number()),
    nextAction: v.optional(
      v.object({
        shouldContinue: v.boolean(),
        nextDimension: v.optional(v.string()),
        reason: v.string(),
        trigger: v.optional(v.string()),
      })
    ),
    status: v.string(),
    durationMs: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('assimilationIterations', {
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
    sessionId: v.id('assimilationSessions'),
    status: v.optional(v.string()),
    currentIteration: v.optional(v.number()),
    accumulatedNotes: v.optional(v.string()),
    coveragePlan: v.optional(v.any()),
    nextDimension: v.optional(v.string()),
    dimensionScores: v.optional(
      v.object({
        architecture: v.number(),
        patterns: v.number(),
        documentation: v.number(),
        dependencies: v.number(),
        testing: v.number(),
      })
    ),
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
 *
 * Task #304: Updates plan status when assimilation completes.
 */
export const completeSession = internalMutation({
  args: {
    sessionId: v.id('assimilationSessions'),
    status: v.string(),
    documentId: v.optional(v.id('documents')),
    metadataId: v.optional(v.id('assimilationMetadata')),
    errorReason: v.optional(v.string()),
    planId: v.optional(v.id('executionPlans')),
  },
  handler: async (ctx, { sessionId, status, documentId, metadataId, errorReason, planId }) => {
    const patch: Record<string, unknown> = {
      status,
      updatedAt: Date.now(),
      completedAt: Date.now(),
    };
    if (documentId) patch.documentId = documentId;
    if (metadataId) patch.metadataId = metadataId;
    if (errorReason) patch.errorReason = errorReason;

    await ctx.db.patch(sessionId, patch);

    // Task #304: Update linked plan status if present
    if (planId) {
      try {
        const plan = await ctx.db.get(planId);
        if (plan && plan.status === 'executing') {
          if (status === 'completed') {
            await ctx.runMutation(api.plans.confirmation.completeExecution, { planId });
          } else if (status === 'failed' || status === 'cancelled') {
            await ctx.runMutation(api.plans.confirmation.failExecution, { planId });
          }
        }
      } catch (error) {
        console.error(`[completeSession] Failed to update plan status: ${error}`);
      }
    }
  },
});

/**
 * Helper: Update document counters inline
 * BP-005: Maintains denormalized counters for efficient counting
 */
async function updateDocumentCountersInline(
  ctx: any,
  category: string | undefined,
  hasEmbedding: boolean,
  increment: number
) {
  // Update total counter
  const totalCounter = await ctx.db
    .query('documentCounters')
    .withIndex('by_name', (q: any) => q.eq('name', 'total'))
    .first();

  if (totalCounter) {
    await ctx.db.patch(totalCounter._id, { count: totalCounter.count + increment });
  } else {
    await ctx.db.insert('documentCounters', { name: 'total', count: increment });
  }

  // Update category counter
  if (category) {
    const categoryCounter = await ctx.db
      .query('documentCounters')
      .withIndex('by_name', (q: any) => q.eq('name', category))
      .first();

    if (categoryCounter) {
      await ctx.db.patch(categoryCounter._id, { count: categoryCounter.count + increment });
    } else {
      await ctx.db.insert('documentCounters', { name: category, count: increment });
    }
  }

  // Update withoutEmbeddings counter
  if (!hasEmbedding) {
    const withoutEmbeddingsCounter = await ctx.db
      .query('documentCounters')
      .withIndex('by_name', (q: any) => q.eq('name', 'withoutEmbeddings'))
      .first();

    if (withoutEmbeddingsCounter) {
      await ctx.db.patch(withoutEmbeddingsCounter._id, {
        count: withoutEmbeddingsCounter.count + increment,
      });
    } else {
      await ctx.db.insert('documentCounters', {
        name: 'withoutEmbeddings',
        count: increment,
      });
    }
  }
}
