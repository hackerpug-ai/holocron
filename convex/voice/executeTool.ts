"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { executeAgentTool } from "../chat/toolExecutor";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExecuteToolArgs = {
  toolName: string;
  toolArgs: Record<string, any>;
  conversationId: Id<"conversations">;
};

type VoiceToolResult = {
  success: boolean;
  content: string;
  skipContinuation: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Truncate content for voice consumption.
 * Cuts at sentence boundaries when possible.
 */
export function truncateForVoice(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;

  // Try to cut at a sentence boundary
  const truncated = content.slice(0, maxChars);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf(".\n"),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
  );

  if (lastSentenceEnd > maxChars * 0.5) {
    return truncated.slice(0, lastSentenceEnd + 1);
  }

  return truncated + "...";
}

// ---------------------------------------------------------------------------
// Handler (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Pure handler extracted for testability.
 * Wraps executeAgentTool and shapes result for voice consumption.
 */
export async function executeToolHandler(
  ctx: ActionCtx,
  args: ExecuteToolArgs,
): Promise<VoiceToolResult> {
  const result = await executeAgentTool(
    ctx,
    args.toolName,
    args.toolArgs,
    args.conversationId,
  );

  return {
    success: result.messageType !== "error",
    content: truncateForVoice(result.content, 1500),
    skipContinuation: result.skipContinuation ?? false,
  };
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Server-side voice tool executor.
 * Routes voice function calls through the same executeAgentTool
 * used by the text chat agent, ensuring full tool parity.
 *
 * Strips cardData (voice can't render cards) and truncates
 * long content for voice readability.
 */
export const executeTool = action({
  args: {
    toolName: v.string(),
    toolArgs: v.any(),
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    success: v.boolean(),
    content: v.string(),
    skipContinuation: v.boolean(),
  }),
  handler: executeToolHandler,
});
