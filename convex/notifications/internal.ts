import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// ============================================================
// Notifications Internal Mutations
// ============================================================

/**
 * Maps notification types to importance levels.
 * "high" = user-initiated async completions that warrant a toast.
 * "normal" = informational, bell-only notifications.
 */
const IMPORTANCE_MAP: Record<string, "high" | "normal"> = {
  research_complete: "high",
  audio_complete: "high",
  assimilate_complete: "high",
  research_failed: "normal",
  whats_new: "normal",
  subscription_update: "normal",
  feed_digest: "normal",
  system: "normal",
};

/**
 * Create a new notification (internal use only)
 *
 * Inserts a notification with read:false and derived importance level.
 * Called by internal workflows (e.g. research completion, system alerts)
 * to surface events to the user.
 */
export const create = internalMutation({
  args: {
    type: v.union(
      v.literal("research_complete"),
      v.literal("research_failed"),
      v.literal("audio_complete"),
      v.literal("whats_new"),
      v.literal("subscription_update"),
      v.literal("assimilate_complete"),
      v.literal("system")
    ),
    title: v.string(),
    body: v.string(),
    route: v.string(),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, { type, title, body, route, referenceId }) => {
    const now = Date.now();

    const notificationId = await ctx.db.insert("notifications", {
      type,
      title,
      body,
      route,
      referenceId,
      read: false,
      importance: IMPORTANCE_MAP[type] ?? "normal",
      createdAt: now,
    });

    return notificationId;
  },
});
