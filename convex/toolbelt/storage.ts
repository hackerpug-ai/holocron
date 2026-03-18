/**
 * Toolbelt storage actions with automatic embedding generation
 * These actions handle tool creation and updates with vector embeddings
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
 * Generate an embedding for tool content
 */
async function generateToolEmbedding(
  title: string,
  description?: string,
  content?: string,
  tags?: string[],
  useCases?: string[]
): Promise<number[]> {
  // Combine all relevant text for embedding
  const textParts = [
    title,
    description,
    content,
    tags?.join(" "),
    useCases?.join(" "),
  ].filter(Boolean);

  const combinedText = textParts.join(" ").slice(0, 8000);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: combinedText,
  });

  return embedding;
}

/**
 * Create a new tool with automatic embedding generation
 */
export const createWithEmbedding = action({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.union(
      v.literal("libraries"),
      v.literal("cli"),
      v.literal("framework"),
      v.literal("service"),
      v.literal("database"),
      v.literal("tool")
    ),
    status: v.optional(v.union(
      v.literal("complete"),
      v.literal("draft"),
      v.literal("archived")
    )),
    sourceUrl: v.optional(v.string()),
    sourceType: v.union(
      v.literal("github"),
      v.literal("npm"),
      v.literal("pypi"),
      v.literal("website"),
      v.literal("cargo"),
      v.literal("go"),
      v.literal("other")
    ),
    tags: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    language: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate embedding for the tool content
    const embedding = await generateToolEmbedding(
      args.title,
      args.description,
      args.content,
      args.tags,
      args.useCases
    );

    // Create the tool with the embedding
    const toolId = await ctx.runMutation(api.toolbelt.mutations.create, {
      ...args,
      embedding,
    });

    return {
      toolId,
      embeddingDimensions: embedding.length,
      embeddingStatus: "completed" as const,
    };
  },
});

/**
 * Update an existing tool with automatic embedding regeneration
 */
export const updateWithEmbedding = action({
  args: {
    id: v.id("toolbeltTools"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("libraries"),
      v.literal("cli"),
      v.literal("framework"),
      v.literal("service"),
      v.literal("database"),
      v.literal("tool")
    )),
    status: v.optional(v.union(
      v.literal("complete"),
      v.literal("draft"),
      v.literal("archived")
    )),
    sourceUrl: v.optional(v.string()),
    sourceType: v.optional(v.union(
      v.literal("github"),
      v.literal("npm"),
      v.literal("pypi"),
      v.literal("website"),
      v.literal("cargo"),
      v.literal("go"),
      v.literal("other")
    )),
    tags: v.optional(v.array(v.string())),
    useCases: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    language: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    // Get the existing tool to check if content changed
    const existing = await ctx.runQuery(api.toolbelt.queries.get, { id });
    if (!existing) {
      throw new Error(`Tool ${id} not found`);
    }

    // Determine if we need to regenerate the embedding
    const titleChanged = updates.title !== undefined && updates.title !== existing.title;
    const descChanged = updates.description !== undefined && updates.description !== existing.description;
    const contentChanged = updates.content !== undefined && updates.content !== existing.content;
    const tagsChanged = updates.tags !== undefined && JSON.stringify(updates.tags) !== JSON.stringify(existing.tags);
    const useCasesChanged = updates.useCases !== undefined && JSON.stringify(updates.useCases) !== JSON.stringify(existing.useCases);

    const needsReembedding = titleChanged || descChanged || contentChanged || tagsChanged || useCasesChanged;

    // Only regenerate embedding if relevant content changed
    let embedding = existing.embedding;
    if (needsReembedding) {
      embedding = await generateToolEmbedding(
        updates.title ?? existing.title,
        updates.description ?? existing.description,
        updates.content ?? existing.content,
        updates.tags ?? existing.tags,
        updates.useCases ?? existing.useCases
      );
    }

    // Update the tool
    const updated = await ctx.runMutation(api.toolbelt.mutations.update, {
      id,
      ...updates,
      embedding,
    });

    return {
      toolId: id,
      updated: true,
      embeddingRegenerated: needsReembedding,
      embeddingDimensions: embedding?.length,
      embeddingStatus: "completed" as const,
    };
  },
});
