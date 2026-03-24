/**
 * Assimilation Mutations for Borg-themed Repository Analysis
 *
 * Creates and stores assimilation metadata for analyzed repositories
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";

/**
 * Save assimilation results
 *
 * Creates both a document entry and metadata entry for repository analysis
 * Returns both documentId and metadataId for reference
 */
export const saveAssimilation = mutation({
  args: {
    // Document fields
    title: v.string(),
    content: v.string(),
    filePath: v.optional(v.string()),
    researchType: v.optional(v.string()),
    // Assimilation metadata fields
    repositoryUrl: v.string(),
    repositoryName: v.string(),
    primaryLanguage: v.optional(v.string()),
    stars: v.optional(v.number()),
    sophisticationRating: v.number(), // 1-5 scale
    trackRatings: v.object({
      architecture: v.number(), // 1-5 scale
      patterns: v.number(), // 1-5 scale
      documentation: v.number(), // 1-5 scale
      dependencies: v.number(), // 1-5 scale
      testing: v.number(), // 1-5 scale
    }),
  },
  handler: async (
    ctx,
    {
      title,
      content,
      filePath,
      researchType,
      repositoryUrl,
      repositoryName,
      primaryLanguage,
      stars,
      sophisticationRating,
      trackRatings,
    }
  ) => {
    console.log(`[saveAssimilation] Entry - repository: "${repositoryName}", rating: ${sophisticationRating}`);
    const now = Date.now();

    // Step 1: Insert document entry
    console.log(`[saveAssimilation] Creating document entry`);
    const documentId = await ctx.db.insert("documents", {
      title,
      content,
      category: "assimilation",
      filePath,
      researchType,
      createdAt: now,
    });
    console.log(`[saveAssimilation] Document created - ID: ${documentId}`);

    // Schedule embedding generation for the new document
    await ctx.scheduler.runAfter(0, api.documents.storage.updateWithEmbedding, {
      id: documentId,
      content,
    });

    // Step 2: Insert metadata entry
    console.log(`[saveAssimilation] Creating metadata entry`);
    const metadataId = await ctx.db.insert("assimilationMetadata", {
      documentId,
      repositoryUrl,
      repositoryName,
      primaryLanguage,
      stars,
      sophisticationRating,
      trackRatings,
      createdAt: now,
    });
    console.log(`[saveAssimilation] Metadata created - ID: ${metadataId}`);

    console.log(`[saveAssimilation] Exit - Success`);
    return {
      documentId,
      metadataId,
    };
  },
});
