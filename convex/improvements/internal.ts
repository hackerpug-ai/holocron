import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Update the status of an improvement request.
 * Called by the AI agent action to move requests through the workflow.
 */
export const updateStatus = internalMutation({
  args: {
    requestId: v.id("improvementRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("processing"),
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("done"),
      v.literal("merged")
    ),
  },
  handler: async (ctx, { requestId, status }) => {
    await ctx.db.patch(requestId, {
      status,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Apply the agent's analysis result to an improvement request.
 * Sets title, summary, agentDecision, embedding, and advances status to pending_review.
 */
export const updateFromAgent = internalMutation({
  args: {
    requestId: v.id("improvementRequests"),
    title: v.string(),
    summary: v.string(),
    agentDecision: v.object({
      action: v.union(v.literal("create_new"), v.literal("merge")),
      mergeTargetId: v.optional(v.id("improvementRequests")),
      confidence: v.number(),
      reasoning: v.string(),
      similarRequests: v.array(
        v.object({
          id: v.id("improvementRequests"),
          title: v.string(),
          similarity: v.number(),
        })
      ),
    }),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { requestId, title, summary, agentDecision, embedding }) => {
    const now = Date.now();
    await ctx.db.patch(requestId, {
      title,
      summary,
      agentDecision,
      embedding,
      status: "pending_review",
      processedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Execute a merge of one improvement request into another.
 *
 * - Marks source as merged (mergedIntoId = targetId, status = "merged")
 * - Appends sourceId to target's mergedFromIds array
 * - Re-links all improvementImages from source to target
 *
 * Throws if the target is itself already merged.
 */
export const executeMerge = internalMutation({
  args: {
    sourceId: v.id("improvementRequests"),
    targetId: v.id("improvementRequests"),
    reason: v.string(),
  },
  handler: async (ctx, { sourceId, targetId, reason: _reason }) => {
    const [source, target] = await Promise.all([
      ctx.db.get(sourceId),
      ctx.db.get(targetId),
    ]);

    if (!source) {
      throw new Error(`Source improvement request ${sourceId} not found`);
    }
    if (!target) {
      throw new Error(`Target improvement request ${targetId} not found`);
    }
    if (target.mergedIntoId !== undefined) {
      throw new Error(
        `Target improvement request ${targetId} is itself already merged — cannot merge into it`
      );
    }

    const now = Date.now();

    // Mark source as merged
    await ctx.db.patch(sourceId, {
      mergedIntoId: targetId,
      status: "merged",
      updatedAt: now,
    });

    // Append sourceId to target's mergedFromIds
    const mergedFromIds = [...(target.mergedFromIds ?? []), sourceId];
    await ctx.db.patch(targetId, {
      mergedFromIds,
      updatedAt: now,
    });

    // Re-link all images from source to target
    const images = await ctx.db
      .query("improvementImages")
      .withIndex("by_request", (q) => q.eq("requestId", sourceId))
      .collect();

    await Promise.all(
      images.map((image) => ctx.db.patch(image._id, { requestId: targetId }))
    );
  },
});

/**
 * Submit an improvement request from a specialist agent.
 * Used by academic, technical, product, and service research specialists to log improvements.
 */
export const submitFromSpecialist = internalMutation({
  args: {
    description: v.string(),
    source: v.union(
      v.literal("academic_specialist"),
      v.literal("technical_specialist"),
      v.literal("generalist_specialist"),
      v.literal("product_finder"),
      v.literal("service_finder")
    ),
  },
  handler: async (ctx, { description, source }) => {
    const now = Date.now();

    const requestId = await ctx.db.insert("improvementRequests", {
      description,
      title: description.slice(0, 80),
      status: "submitted",
      sourceScreen: `specialist_${source}`,
      sourceComponent: source,
      createdAt: now,
      updatedAt: now,
    });

    console.log(
      `[submitFromSpecialist] Created improvement request ${requestId} from ${source}`
    );

    return requestId;
  },
});
