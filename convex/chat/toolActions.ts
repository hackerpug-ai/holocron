/**
 * Background Tool Actions
 *
 * Internal actions for chat tools that call external APIs.
 * These run as scheduled background jobs to avoid blocking the
 * parent executeTool action within Convex's 10-minute timeout.
 *
 * Pattern: toolExecutor schedules these via ctx.scheduler.runAfter(0, ...),
 * and they post their own loading/result/error cards to the conversation.
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

/**
 * saveDocumentAsync
 *
 * Background action for save_document tool.
 * Creates document with embedding and posts result card.
 */
/**
 * searchKnowledgeBaseAsync
 *
 * Background action for search_knowledge_base tool.
 * Runs hybrid search and posts results card.
 */
export const searchKnowledgeBaseAsync = internalAction({
  args: {
    conversationId: v.id("conversations"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, query, limit }) => {
    try {
      const searchResults: any[] = await ctx.runAction(
        api.documents.search.hybridSearch,
        { query, limit: limit ?? 5 },
      );

      if (!searchResults || searchResults.length === 0) {
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId,
          role: "agent" as const,
          content: `No results found`,
          messageType: "result_card" as const,
          cardData: {
            card_type: "no_results",
            message: `No articles found matching "${query}"`,
          },
        });
        return;
      }

      const articleCards = searchResults.map((doc: any) => ({
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
        content: `Found ${searchResults.length} article${searchResults.length === 1 ? "" : "s"} matching "${query}"`,
        messageType: "result_card" as const,
        cardData: articleCards,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[searchKnowledgeBaseAsync] ERROR:`, error);

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Knowledge base search failed: ${errorMessage}`,
        messageType: "error" as const,
      });

      throw error;
    }
  },
});

/**
 * saveDocumentAsync
 *
 * Background action for save_document tool.
 * Creates document with embedding and posts result card.
 */
export const saveDocumentAsync = internalAction({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
    content: v.string(),
    category: v.string(),
  },
  handler: async (ctx, { conversationId, title, content, category }) => {
    try {
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[saveDocumentAsync] ERROR:`, error);

      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: `Failed to save document: ${errorMessage}`,
        messageType: "error" as const,
      });

      throw error;
    }
  },
});
