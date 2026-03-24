/**
 * Document storage actions with automatic embedding generation
 * These actions handle document creation and updates with vector embeddings
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

/**
 * "use node" directive - runs in Node.js environment (not V8 isolate)
 * Required for calling external APIs (Cohere embeddings)
 */
"use node";

/**
 * Generate an embedding for document content
 */
async function generateDocumentEmbedding(content: string): Promise<number[]> {
  const MAX_LENGTH = 8000;
  const truncated = content.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });

  return embedding;
}

/**
 * Create a new document with automatic embedding generation
 */
export const createWithEmbedding = action({
  args: {
    title: v.string(),
    content: v.string(),
    category: v.string(),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Generate embedding for the document content
    const embedding = await generateDocumentEmbedding(args.content);

    // Create the document with the embedding
    const documentId = await ctx.runMutation(api.documents.mutations.create, {
      ...args,
      embedding,
    });

    return {
      documentId,
      embeddingDimensions: embedding.length,
      embeddingStatus: "completed" as const,
    };
  },
});

/**
 * Update an existing document with automatic embedding regeneration
 */
export const updateWithEmbedding = action({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.string()),
    filePath: v.optional(v.string()),
    fileType: v.optional(v.string()),
    status: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    researchType: v.optional(v.string()),
    iterations: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Get the existing document to check if content changed
    const existing = await ctx.runQuery(api.documents.queries.get, { id });
    if (!existing) {
      throw new Error(`Document ${id} not found`);
    }

    // Regenerate embedding if content changed or embedding is missing
    let embedding = existing.embedding;
    const contentChanged = updates.content && updates.content !== existing.content;
    const embeddingMissing = !existing.embedding;
    if (contentChanged || embeddingMissing) {
      const contentToEmbed = updates.content || existing.content;
      embedding = await generateDocumentEmbedding(contentToEmbed);
    }

    // Update the document
    const updated = await ctx.runMutation(api.documents.mutations.update, {
      id,
      ...updates,
      embedding,
    });

    return {
      documentId: id,
      updated: true,
      embeddingRegenerated: contentChanged || embeddingMissing,
      embeddingDimensions: embedding?.length,
      embeddingStatus: "completed" as const,
    };
  },
});
