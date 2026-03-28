/**
 * Assimilation Mutations for Borg-themed Repository Analysis
 *
 * Creates and stores assimilation metadata for analyzed repositories
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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
    conversationId: v.optional(v.id("conversations")),
    maxIterations: v.optional(v.number()),
    autoApprove: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { repositoryUrl, profile = "standard", conversationId, maxIterations, autoApprove = false },
  ): Promise<{
    planId: Id<"executionPlans">;
    status: string;
  }> => {
    console.log(
      `[startAssimilationWithPlan] Entry - repositoryUrl: "${repositoryUrl}", profile: ${profile}`,
    );

    // Validate URL
    if (!isValidGitHubUrl(repositoryUrl)) {
      throw new Error(`Invalid GitHub URL: ${repositoryUrl}. Must be https://github.com/{owner}/{repo}`);
    }

    // Step 1: Generate assimilation plan
    console.log(`[startAssimilationWithPlan] Step 1: Generating assimilation plan`);
    const planId = await ctx.runMutation(api.plans.generator.generateAssimilationPlan, {
      repositoryUrl,
      profile,
      maxIterations,
      autoApprove,
      conversationId,
    });
    console.log(
      `[startAssimilationWithPlan] Step 1: Plan generated - ID: ${planId}`,
    );

    // Step 2: Post plan confirmation card
    console.log(
      `[startAssimilationWithPlan] Step 2: Posting plan confirmation card`,
    );
    const plan = await ctx.runQuery(api.plans.queries.get, { id: planId });

    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId: conversationId ?? (await ctx.runMutation(api.conversations.mutations.create, {
        title: `Assimilate: ${plan?.content?.repositoryName || repositoryUrl}`,
      })),
      role: "agent" as const,
      content: `Assimilation plan generated for: ${repositoryUrl}`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "plan_confirmation",
        plan_id: planId,
        plan_title: plan?.content?.title || `Assimilate: ${repositoryUrl}`,
        plan_description: plan?.content?.description || "",
        plan_type: "assimilation",
        repository_url: repositoryUrl,
        repository_name: plan?.content?.repositoryName || "",
        dimensions: plan?.content?.dimensions || [],
        estimated_steps: plan?.content?.estimatedSteps || 0,
        estimated_duration: plan?.content?.estimatedDurationMs || 0,
        profile: plan?.content?.profile || "standard",
        status: "pending",
      },
    });
    console.log(
      `[startAssimilationWithPlan] Step 2: Plan confirmation card posted`,
    );

    // Step 3: Return plan ID for approval
    console.log(
      `[startAssimilationWithPlan] Exit - Awaiting approval`,
    );
    return {
      planId,
      status: "pending_approval",
    };
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
    planId: v.id("executionPlans"),
  },
  handler: async (ctx, { planId }): Promise<{
    sessionId: Id<"assimilationSessions">;
    planId: Id<"executionPlans">;
    status: string;
  }> => {
    console.log(
      `[executeApprovedAssimilationPlan] Entry - planId: ${planId}`,
    );

    // Step 1: Fetch and validate plan
    console.log(
      `[executeApprovedAssimilationPlan] Step 1: Fetching plan`,
    );
    const plan = await ctx.runQuery(api.plans.queries.get, { id: planId });

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.status !== "approved") {
      throw new Error(
        `Plan ${planId} is not approved (current status: ${plan.status})`,
      );
    }

    const repositoryUrl = plan.metadata?.repositoryUrl as string;
    const profile = plan.content?.profile as string || "standard";
    const autoApprove = plan.content?.autoApprove as boolean || false;
    const _maxIterations = plan.content?.maxIterations as number || 10;
    const conversationId = plan.metadata?.conversationId as Id<"conversations"> | undefined;

    console.log(
      `[executeApprovedAssimilationPlan] Step 1: Plan validated - repository: "${repositoryUrl}"`,
    );

    // Step 2: Update plan status to executing
    console.log(
      `[executeApprovedAssimilationPlan] Step 2: Updating plan status to executing`,
    );
    await ctx.runMutation(api.plans.confirmation.startExecution, { planId });

    // Step 3: Create assimilation session
    console.log(
      `[executeApprovedAssimilationPlan] Step 3: Creating assimilation session`,
    );

    const now = Date.now();
    const criteria = resolveProfile(profile);
    const repoName = extractRepoName(repositoryUrl);

    const sessionId = await ctx.db.insert("assimilationSessions", {
      conversationId,
      repositoryUrl,
      repositoryName: repoName,
      profile,
      status: autoApprove ? "in_progress" : "pending_approval",
      currentIteration: 0,
      maxIterations: criteria.maxIterations,
      autoApprove,
      dimensionScores: {
        architecture: 1,
        patterns: 1,
        documentation: 1,
        dependencies: 1,
        testing: 1,
      },
      terminationCriteria: criteria,
      estimatedCostUsd: 0,
      // Link plan to session
      planContent: JSON.stringify(plan.content, null, 2),
      planSummary: plan.content?.description || "",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    });
    console.log(
      `[executeApprovedAssimilationPlan] Step 3: Session created - ID: ${sessionId}`,
    );

    // Step 4: Schedule first iteration
    console.log(
      `[executeApprovedAssimilationPlan] Step 4: Scheduling first iteration`,
    );

    if (autoApprove) {
      // Skip approval, start immediately
      await ctx.scheduler.runAfter(0, internal.assimilate.scheduled.processIteration, {
        sessionId,
      });
    } else {
      // Wait for user approval (session is in pending_approval status)
      console.log(
        `[executeApprovedAssimilationPlan] Step 4: Session awaiting user approval`,
      );
    }

    console.log(
      `[executeApprovedAssimilationPlan] Exit - Session ${sessionId} ${autoApprove ? 'started' : 'awaiting approval'}`,
    );

    return {
      sessionId,
      planId,
      status: autoApprove ? "in_progress" : "pending_approval",
    };
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
 *
 * Task #304: Updates plan status when assimilation completes.
 */
export const completeSession = internalMutation({
  args: {
    sessionId: v.id("assimilationSessions"),
    status: v.string(),
    documentId: v.optional(v.id("documents")),
    metadataId: v.optional(v.id("assimilationMetadata")),
    errorReason: v.optional(v.string()),
    planId: v.optional(v.id("executionPlans")),
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
        if (plan && plan.status === "executing") {
          if (status === "completed") {
            await ctx.runMutation(api.plans.confirmation.completeExecution, { planId });
            console.log(
              `[completeSession] Updated plan ${planId} status to completed`,
            );
          } else if (status === "failed" || status === "cancelled") {
            await ctx.runMutation(api.plans.confirmation.failExecution, { planId });
            console.log(
              `[completeSession] Updated plan ${planId} status to failed`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[completeSession] Failed to update plan status: ${error}`,
        );
      }
    }
  },
});
