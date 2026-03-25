import { internalMutation } from "../_generated/server";

/**
 * Tool-specific timeout thresholds.
 *
 * All tools now use fire-and-forget scheduling (ctx.scheduler.runAfter)
 * so they complete almost instantly in executeTool. The default 5-min
 * timeout is a safety net for any edge case where a tool hangs.
 *
 * The cron runs every 2 minutes (cheap to check), but only times out a tool
 * once the threshold for that specific tool has been exceeded.
 */
const TOOL_TIMEOUT_MS: Record<string, number> = {
  // No tool-specific overrides needed — all tools fire-and-forget now
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min for all other tools

/**
 * Timeout Stuck Tool Calls
 *
 * Finds toolCalls stuck in "approved" status beyond their tool-specific
 * timeout threshold and marks them as "timed_out". Also resets agentBusy
 * on the conversation so the user isn't permanently blocked.
 *
 * This handles the case where the Convex runtime kills an action mid-flight
 * (e.g., 10-minute action timeout) and the catch/finally blocks never execute,
 * leaving the toolCall in "approved" and agentBusy=true forever.
 *
 * Intended to be called on a cron schedule (every 2 minutes).
 */
export const timeoutStuckToolCalls = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all toolCalls in "approved" status (meaning execution started but never finished)
    const approvedCalls = await ctx.db
      .query("toolCalls")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    let timedOutCount = 0;

    for (const toolCall of approvedCalls) {
      const timeoutMs = TOOL_TIMEOUT_MS[toolCall.toolName] ?? DEFAULT_TIMEOUT_MS;
      const elapsed = now - (toolCall.resolvedAt ?? toolCall.createdAt);

      if (elapsed > timeoutMs) {
        // Mark toolCall as timed out
        await ctx.db.patch(toolCall._id, {
          status: "timed_out",
          error: `Tool execution timed out after ${Math.round(elapsed / 60000)} minutes`,
          resolvedAt: now,
        });

        // Post an error message to the conversation so the user sees what happened
        await ctx.db.insert("chatMessages", {
          conversationId: toolCall.conversationId,
          role: "agent",
          content: `The "${toolCall.toolDisplayName}" tool timed out. You can try again by sending your request once more.`,
          messageType: "error",
          createdAt: now,
        });

        // Reset agentBusy so the conversation isn't permanently blocked
        await ctx.db.patch(toolCall.conversationId, {
          agentBusy: false,
          agentBusySince: undefined,
        });

        timedOutCount++;
      }
    }

    if (timedOutCount > 0) {
      console.log(
        `[timeoutStuckToolCalls] Timed out ${timedOutCount} stuck tool call(s)`
      );
    }
  },
});
