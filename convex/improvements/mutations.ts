import { mutation } from "../_generated/server";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

// The actions file does not exist yet; reference it explicitly so the scheduler
// call can be wired at runtime without a generated-API type error.
const processNewRequest = makeFunctionReference<
  "action",
  { requestId: string },
  null
>("improvements/actions:processNewRequest");

/**
 * Generate a short-lived upload URL for attaching images to improvement requests.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Submit a new improvement request.
 * Optionally attaches an image via storageId.
 * Fires the AI processing agent immediately after creation.
 */
export const submit = mutation({
  args: {
    description: v.string(),
    storageId: v.optional(v.id("_storage")),
    sourceScreen: v.string(),
    sourceComponent: v.optional(v.string()),
  },
  handler: async (ctx, { description, storageId, sourceScreen, sourceComponent }) => {
    const now = Date.now();

    const requestId = await ctx.db.insert("improvementRequests", {
      description,
      title: description.slice(0, 80),
      status: "submitted",
      sourceScreen,
      sourceComponent,
      createdAt: now,
      updatedAt: now,
    });

    if (storageId !== undefined) {
      await ctx.db.insert("improvementImages", {
        requestId,
        storageId,
        createdAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      processNewRequest,
      { requestId }
    );

    return requestId;
  },
});

/**
 * Approve a pending_review improvement request.
 * If the agent recommended a merge, executes the merge inline.
 * Otherwise sets status to "approved".
 */
export const approve = mutation({
  args: {
    id: v.id("improvementRequests"),
  },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (!request) {
      throw new Error(`Improvement request ${id} not found`);
    }
    if (request.status !== "pending_review") {
      throw new Error(
        `Cannot approve request ${id}: status is "${request.status}", expected "pending_review"`
      );
    }

    const now = Date.now();
    const { agentDecision } = request;

    if (
      agentDecision?.action === "merge" &&
      agentDecision.mergeTargetId !== undefined
    ) {
      const targetId = agentDecision.mergeTargetId;
      const target = await ctx.db.get(targetId);

      if (!target) {
        throw new Error(`Merge target ${targetId} not found`);
      }
      if (target.mergedIntoId !== undefined) {
        throw new Error(
          `Merge target ${targetId} is itself already merged — cannot merge into it`
        );
      }

      // Mark source as merged
      await ctx.db.patch(id, {
        status: "merged",
        mergedIntoId: targetId,
        updatedAt: now,
      });

      // Append source to target's mergedFromIds
      const mergedFromIds = [...(target.mergedFromIds ?? []), id];
      await ctx.db.patch(targetId, {
        mergedFromIds,
        updatedAt: now,
      });

      // Re-link images from source to target
      const images = await ctx.db
        .query("improvementImages")
        .withIndex("by_request", (q) => q.eq("requestId", id))
        .collect();

      await Promise.all(
        images.map((image) => ctx.db.patch(image._id, { requestId: targetId }))
      );
    } else {
      await ctx.db.patch(id, {
        status: "approved",
        updatedAt: now,
      });
    }

    return id;
  },
});

/**
 * Reject an agent's analysis decision and re-queue the request for reprocessing.
 * Optionally records user feedback to guide the next agent pass.
 */
export const reject = mutation({
  args: {
    id: v.id("improvementRequests"),
    userFeedback: v.optional(v.string()),
  },
  handler: async (ctx, { id, userFeedback }) => {
    const now = Date.now();

    await ctx.db.patch(id, {
      status: "submitted",
      userFeedback,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      processNewRequest,
      { requestId: id }
    );

    return id;
  },
});

/**
 * Override the agent's merge recommendation and approve the request as a standalone item.
 * Clears the merge intent and sets status to "approved".
 */
export const requestSeparate = mutation({
  args: {
    id: v.id("improvementRequests"),
  },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (!request) {
      throw new Error(`Improvement request ${id} not found`);
    }

    const now = Date.now();

    // Preserve agentDecision metadata but override action to create_new so the
    // intent is clear in the record, then mark approved.
    const updatedDecision =
      request.agentDecision !== undefined
        ? {
            ...request.agentDecision,
            action: "create_new" as const,
            mergeTargetId: undefined,
          }
        : undefined;

    await ctx.db.patch(id, {
      agentDecision: updatedDecision,
      status: "approved",
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update the title and/or description of an improvement request.
 * Only patches fields that are explicitly provided.
 */
export const update = mutation({
  args: {
    id: v.id("improvementRequests"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { id, title, description }) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;

    await ctx.db.patch(id, patch);

    return id;
  },
});

/**
 * Add an image to an existing improvement request.
 */
export const addImage = mutation({
  args: {
    requestId: v.id("improvementRequests"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, storageId, caption }) => {
    const imageId = await ctx.db.insert("improvementImages", {
      requestId,
      storageId,
      caption,
      createdAt: Date.now(),
    });

    return imageId;
  },
});

/**
 * Remove an improvement request.
 * Deletes the request, cleans up associated images from storage,
 * and handles merge relationships (un-merges any requests that were merged into this one).
 */
export const remove = mutation({
  args: {
    id: v.id("improvementRequests"),
  },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (!request) {
      throw new Error(`Improvement request ${id} not found`);
    }

    // Delete associated images from storage
    const images = await ctx.db
      .query("improvementImages")
      .withIndex("by_request", (q) => q.eq("requestId", id))
      .collect();

    await Promise.all([
      // Delete image records
      ...images.map((img) => ctx.db.delete(img._id)),
      // Delete image files from storage
      ...images.map((img) => ctx.storage.delete(img.storageId)),
    ]);

    // Un-merge any requests that were merged into this one
    if (request.mergedFromIds) {
      await Promise.all(
        request.mergedFromIds.map((mergedId) =>
          ctx.db.patch(mergedId, {
            status: "approved",
            mergedIntoId: undefined,
            updatedAt: Date.now(),
          })
        )
      );
    }

    // If this request was merged into another, remove it from that target's list
    if (request.mergedIntoId) {
      const target = await ctx.db.get(request.mergedIntoId);
      if (target?.mergedFromIds) {
        await ctx.db.patch(request.mergedIntoId, {
          mergedFromIds: target.mergedFromIds.filter((mid) => mid !== id),
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(id);
    return id;
  },
});

/**
 * Mark an improvement request as done.
 * Used when the improvement has been implemented.
 */
export const markAsDone = mutation({
  args: {
    id: v.id("improvementRequests"),
  },
  handler: async (ctx, { id }) => {
    const request = await ctx.db.get(id);
    if (!request) {
      throw new Error(`Improvement request ${id} not found`);
    }

    await ctx.db.patch(id, {
      status: "done",
      updatedAt: Date.now(),
    });

    return id;
  },
});
