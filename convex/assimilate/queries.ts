/**
 * Assimilation Queries for Borg-themed Repository Analysis
 *
 * Queries for retrieving assimilation metadata and documents
 */

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Check if a repository has already been assimilated
 *
 * Returns the metadata and associated document if found, null otherwise
 */
export const checkExistingAssimilation = query({
  args: {
    repositoryUrl: v.string(),
  },
  handler: async (ctx, { repositoryUrl }) => {
    console.log(`[checkExistingAssimilation] Entry - repositoryUrl: "${repositoryUrl}"`);

    // Search for existing assimilation by repository URL
    const metadata = await ctx.db
      .query("assimilationMetadata")
      .withIndex("by_repository", (q) => q.eq("repositoryName", repositoryUrl.split("/").pop() ?? ""))
      .first();

    if (!metadata) {
      console.log(`[checkExistingAssimilation] No existing assimilation found`);
      return null;
    }

    // Fetch the associated document
    const document = await ctx.db.get(metadata.documentId);

    console.log(`[checkExistingAssimilation] Found existing assimilation - metadataId: ${metadata._id}, documentId: ${metadata.documentId}`);

    return {
      metadata,
      document,
    };
  },
});

/**
 * List all assimilations with optional filters
 *
 * Returns assimilations sorted by sophistication rating descending
 */
export const listAssimilations = query({
  args: {
    language: v.optional(v.string()),
    minRating: v.optional(v.number()),
  },
  handler: async (ctx, { language, minRating }) => {
    console.log(`[listAssimilations] Entry - language: ${language ?? "none"}, minRating: ${minRating ?? "none"}`);

    let results: any[];

    // Apply language filter if provided
    if (language) {
      results = await ctx.db
        .query("assimilationMetadata")
        .withIndex("by_language", (q) => q.eq("primaryLanguage", language))
        .collect();
    } else {
      results = await ctx.db.query("assimilationMetadata").collect();
    }

    // Apply minRating filter if provided
    if (minRating !== undefined) {
      results = results.filter((r) => r.sophisticationRating >= minRating);
    }

    // Sort by sophistication rating descending
    results.sort((a, b) => b.sophisticationRating - a.sophisticationRating);

    console.log(`[listAssimilations] Found ${results.length} assimilations`);

    // Fetch associated documents for each result
    const resultsWithDocuments = await Promise.all(
      results.map(async (metadata) => {
        const document = await ctx.db.get(metadata.documentId);
        return {
          metadata,
          document,
        };
      })
    );

    return resultsWithDocuments;
  },
});

/**
 * Get assimilation by document ID
 *
 * Returns the metadata and document for a specific document ID
 */
export const getAssimilationByDocumentId = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, { documentId }) => {
    console.log(`[getAssimilationByDocumentId] Entry - documentId: ${documentId}`);

    const metadata = await ctx.db
      .query("assimilationMetadata")
      .withIndex("by_document", (q) => q.eq("documentId", documentId))
      .first();

    if (!metadata) {
      console.log(`[getAssimilationByDocumentId] No metadata found for document`);
      return null;
    }

    const document = await ctx.db.get(metadata.documentId);

    console.log(`[getAssimilationByDocumentId] Found assimilation - metadataId: ${metadata._id}`);

    return {
      metadata,
      document,
    };
  },
});
