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

const STATUS_VALUES = v.union(v.literal("open"), v.literal("closed"));

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
 * Submit a new improvement request (created open).
 * Optionally attaches an image via storageId.
 * Fires the AI dedup agent immediately after creation.
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
      status: "open",
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
 * Set the status of an improvement request to open or closed.
 * When closing, records optional reason and evidence (e.g. file paths) that prove
 * the improvement was implemented. Idempotent — closing a closed item updates the
 * reason/evidence; reopening a closed item clears closure fields.
 */
export const setStatus = mutation({
  args: {
    id: v.id("improvementRequests"),
    status: STATUS_VALUES,
    reason: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { id, status, reason, evidence }) => {
    const request = await ctx.db.get(id);
    if (!request) {
      throw new Error(`Improvement request ${id} not found`);
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status,
      updatedAt: now,
    };

    if (status === "closed") {
      patch.closedAt = now;
      if (reason !== undefined) patch.closureReason = reason;
      if (evidence !== undefined) patch.closureEvidence = evidence;
    } else {
      // Reopening: clear closure metadata
      patch.closedAt = undefined;
      patch.closureReason = undefined;
      patch.closureEvidence = undefined;
    }

    await ctx.db.patch(id, patch);

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

    // Un-merge any requests that were merged into this one: reopen them
    if (request.mergedFromIds) {
      await Promise.all(
        request.mergedFromIds.map((mergedId) =>
          ctx.db.patch(mergedId, {
            status: "open" as const,
            mergedIntoId: undefined,
            closedAt: undefined,
            closureReason: undefined,
            closureEvidence: undefined,
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
