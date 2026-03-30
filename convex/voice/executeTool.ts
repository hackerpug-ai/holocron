"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { executeAgentTool } from "../chat/toolExecutor";
import { api } from "../_generated/api";
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
// Fast-path tool set
// ---------------------------------------------------------------------------

const FAST_VOICE_TOOLS = new Set([
  "search_knowledge_base",
  "save_document",
  "update_document",
]);

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
// Fast tool executor (synchronous, awaits real results)
// ---------------------------------------------------------------------------

async function executeVoiceFastTool(
  ctx: ActionCtx,
  toolName: string,
  args: Record<string, any>,
  conversationId: Id<"conversations">,
): Promise<VoiceToolResult> {
  try {
    switch (toolName) {
      case "search_knowledge_base": {
        const query = (args.query as string) ?? "";
        const limit = typeof args.limit === "number" ? args.limit : 5;

        if (!query) {
          return {
            success: true,
            content: "Please provide a search query.",
            skipContinuation: false,
          };
        }

        const searchResults: any[] = await ctx.runAction(
          api.documents.search.hybridSearch,
          { query, limit },
        );

        // Post result card for chat UI (same format as toolActions.ts)
        const articleCards = (searchResults || []).map((doc: any) => ({
          card_type: "article",
          title: doc.title,
          category: doc.category,
          snippet: doc.content
            ? doc.content.substring(0, 150) +
              (doc.content.length > 150 ? "..." : "")
            : "",
          document_id: doc._id,
          metadata: { relevance_score: doc.score },
        }));

        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId,
          role: "agent" as const,
          content: `Found ${searchResults?.length || 0} article${(searchResults?.length || 0) === 1 ? "" : "s"} matching "${query}"`,
          messageType: "result_card" as const,
          cardData: searchResults?.length
            ? articleCards
            : { card_type: "no_results", message: `No articles found matching "${query}"` },
        });

        if (!searchResults?.length) {
          return {
            success: true,
            content: `No articles found matching "${query}".`,
            skipContinuation: false,
          };
        }

        // Voice-friendly summary (top 3 results)
        const voiceSummary = searchResults
          .slice(0, 3)
          .map(
            (r: any, i: number) =>
              `${i + 1}. "${r.title}"${r.content ? `: ${r.content.substring(0, 100)}` : ""}`,
          )
          .join(". ");

        return {
          success: true,
          content: `Found ${searchResults.length} articles. ${voiceSummary}`,
          skipContinuation: false,
        };
      }

      case "save_document": {
        const title = args.title as string;
        const content = args.content as string;
        const category = (args.category as string) || "notes";

        if (!title || !content) {
          return {
            success: false,
            content: "Title and content are required.",
            skipContinuation: false,
          };
        }

        const result: any = await ctx.runAction(
          api.documents.storage.createWithEmbedding,
          { title, content, category, status: "complete" },
        );

        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId,
          role: "agent" as const,
          content: `Saved "${title}" to knowledge base`,
          messageType: "result_card" as const,
          cardData: {
            card_type: "document_saved",
            document_id: result.documentId,
            title,
            category,
          },
        });

        return {
          success: true,
          content: `Saved "${title}" to your knowledge base in the ${category} category.`,
          skipContinuation: false,
        };
      }

      case "update_document": {
        const documentId = args.documentId as string;
        const title = args.title as string | undefined;
        const content = args.content as string | undefined;
        const category = args.category as string | undefined;

        if (!documentId) {
          return {
            success: false,
            content: "Document ID is required.",
            skipContinuation: false,
          };
        }

        const currentDoc: any = await ctx.runQuery(api.documents.queries.get, {
          id: documentId as any,
        });

        if (!currentDoc) {
          return {
            success: false,
            content: "Document not found.",
            skipContinuation: false,
          };
        }

        const updates: any = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        if (category !== undefined) updates.category = category;

        if (content !== undefined || title !== undefined) {
          await ctx.runAction(api.documents.storage.updateWithEmbedding, {
            id: documentId as any,
            ...updates,
          });
        } else {
          await ctx.runMutation(api.documents.mutations.update, {
            id: documentId as any,
            ...updates,
          });
        }

        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId,
          role: "agent" as const,
          content: `Updated "${currentDoc.title}" in knowledge base`,
          messageType: "result_card" as const,
          cardData: {
            card_type: "document_saved",
            document_id: documentId,
            title: title ?? currentDoc.title,
            category: category ?? currentDoc.category,
          },
        });

        return {
          success: true,
          content: `Updated "${title ?? currentDoc.title}" in your knowledge base.`,
          skipContinuation: false,
        };
      }

      default:
        // Should never reach here given the FAST_VOICE_TOOLS guard
        return {
          success: false,
          content: `Unknown fast tool: ${toolName}`,
          skipContinuation: false,
        };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[executeVoiceFastTool] ${toolName} ERROR:`, error);
    return {
      success: false,
      content: `Sorry, I ran into an error with that request: ${errorMessage}`,
      skipContinuation: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Handler (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Pure handler extracted for testability.
 * Fast-path: executes search/save/update synchronously for voice.
 * All other tools delegate to executeAgentTool.
 */
export async function executeToolHandler(
  ctx: ActionCtx,
  args: ExecuteToolArgs,
): Promise<VoiceToolResult> {
  // Fast path: execute synchronously for voice
  if (FAST_VOICE_TOOLS.has(args.toolName)) {
    return executeVoiceFastTool(
      ctx,
      args.toolName,
      args.toolArgs,
      args.conversationId,
    );
  }

  // Existing path for all other tools
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
 * Fast-path tools (search_knowledge_base, save_document, update_document)
 * are executed synchronously so the voice model receives real results
 * instead of "Searching..." placeholders.
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
