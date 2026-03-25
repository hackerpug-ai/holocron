/**
 * Semantic Deduplication for Subscription Content
 *
 * Uses vector embeddings to detect duplicate or highly similar content
 * across subscription sources before creating documents.
 *
 * Note: All functions here are actions (Node.js runtime) because they need
 * either embedding generation (Cohere API) or vectorSearch (action-level API).
 * The updateContentEmbedding mutation lives in deduplication_helpers.ts.
 */

"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

/**
 * Generate embedding for subscription content title
 *
 * @param title - Content title to embed
 * @returns embedding vector (1024 dimensions)
 */
export async function generateContentEmbedding(
  title: string
): Promise<number[]> {
  const MAX_LENGTH = 2000;
  const truncated = title.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });

  return embedding;
}

/**
 * Internal action: Find similar documents using vector search
 *
 * Returns documents with similarity score above threshold
 */
export const findSimilarDocuments = internalAction({
  args: {
    embedding: v.array(v.float64()),
    threshold: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { embedding, threshold = 0.85, limit = 5 }): Promise<Array<{
    _id: string;
    title: string;
    category: string;
    similarity: number;
  }>> => {
    const results = await ctx.vectorSearch("documents", "by_embedding", {
      vector: embedding,
      limit,
    });

    const similarDocs: Array<{
      _id: string;
      title: string;
      category: string;
      similarity: number;
    }> = [];

    for (const result of results) {
      if (result._score >= threshold) {
        const doc = await ctx.runQuery(internal.subscriptions.deduplication_helpers.getDocument, {
          id: result._id,
        });
        if (doc) {
          similarDocs.push({
            _id: doc._id,
            title: doc.title,
            category: doc.category,
            similarity: result._score,
          });
        }
      }
    }

    return similarDocs;
  },
});

/**
 * Internal action: Find similar subscription content
 *
 * Returns queued content with similarity above threshold
 */
export const findSimilarContent = internalAction({
  args: {
    embedding: v.array(v.float64()),
    threshold: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { embedding, threshold = 0.85, limit = 5 }): Promise<Array<{
    _id: string;
    title: string;
    sourceId: string;
    similarity: number;
  }>> => {
    const results = await ctx.vectorSearch("subscriptionContent", "by_embedding", {
      vector: embedding,
      limit,
    });

    const similarContent: Array<{
      _id: string;
      title: string;
      sourceId: string;
      similarity: number;
    }> = [];

    for (const result of results) {
      if (result._score >= threshold) {
        const content = await ctx.runQuery(internal.subscriptions.deduplication_helpers.getQueuedContent, {
          id: result._id,
        });
        if (content) {
          similarContent.push({
            _id: content._id,
            title: content.title,
            sourceId: content.sourceId,
            similarity: result._score,
          });
        }
      }
    }

    return similarContent;
  },
});

/**
 * Internal action: Check if content is duplicate
 *
 * Generates embedding and searches for similar existing documents
 * Returns true if duplicate found above threshold
 */
export const checkForDuplicates = internalAction({
  args: {
    title: v.string(),
    threshold: v.optional(v.number()),
  },
  handler: async (ctx, { title, threshold = 0.85 }): Promise<{
    isDuplicate: boolean;
    similarDocuments: Array<{ _id: string; title: string; category: string; similarity: number }>;
    similarContent: Array<{ _id: string; title: string; sourceId: string; similarity: number }>;
    embedding: number[];
  }> => {
    const embedding = await generateContentEmbedding(title);

    const similarDocs: Array<{ _id: string; title: string; category: string; similarity: number }> = await ctx.runAction(
      internal.subscriptions.deduplication.findSimilarDocuments,
      { embedding, threshold, limit: 3 }
    );

    const similarContent: Array<{ _id: string; title: string; sourceId: string; similarity: number }> = await ctx.runAction(
      internal.subscriptions.deduplication.findSimilarContent,
      { embedding, threshold, limit: 3 }
    );

    return {
      isDuplicate: similarDocs.length > 0 || similarContent.length > 0,
      similarDocuments: similarDocs,
      similarContent: similarContent,
      embedding,
    };
  },
});
