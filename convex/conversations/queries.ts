import { query } from "../_generated/server";
import { v } from "convex/values";

const AGENT_BUSY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function isAgentActuallyBusy(conversation: {
  agentBusy?: boolean;
  agentBusySince?: number;
}): boolean {
  if (!conversation.agentBusy) return false;
  if (!conversation.agentBusySince) return false;
  return Date.now() - conversation.agentBusySince < AGENT_BUSY_TIMEOUT_MS;
}

/**
 * Get conversation count (for validation)
 */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    return conversations.length;
  },
});

/**
 * List all conversations sorted by updatedAt (newest first)
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 50 }) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_updated")
      .order("desc")
      .take(limit);
    return conversations.map((c) => ({
      ...c,
      agentBusy: isAgentActuallyBusy(c),
    }));
  },
});

/**
 * Get a single conversation by id
 */
export const get = query({
  args: {
    id: v.id("conversations"),
  },
  handler: async (ctx, { id }) => {
    const conversation = await ctx.db.get(id);
    if (!conversation) return null;
    return { ...conversation, agentBusy: isAgentActuallyBusy(conversation) };
  },
});
