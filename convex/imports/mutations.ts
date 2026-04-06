import { mutation, query } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";

const MAX_IMPORTS_PER_HOUR = 10;
const HOUR_IN_MS = 60 * 60 * 1000;

/**
 * Check rate limit for imports
 * Returns true if rate limit would be exceeded
 */
async function wouldExceedRateLimit(ctx: MutationCtx): Promise<boolean> {
  const now = Date.now();
  const oneHourAgo = now - HOUR_IN_MS;

  // Count imports in the last hour
  const recentImports = await ctx.db
    .query("imports")
    .withIndex("by_importedAt", (q) => q.gte("importedAt", oneHourAgo))
    .collect();

  return recentImports.length >= MAX_IMPORTS_PER_HOUR;
}

/**
 * Create a new import entry and append text to document
 * Rate limited to MAX_IMPORTS_PER_HOUR per hour
 */
export const createImport = mutation({
  args: {
    documentId: v.id("documents"),
    source: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    // Check rate limit
    const exceedsLimit = await wouldExceedRateLimit(ctx);
    if (exceedsLimit) {
      throw new Error(
        `Rate limit exceeded: maximum ${MAX_IMPORTS_PER_HOUR} imports per hour`
      );
    }

    // Get the document
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error(`Document ${args.documentId} not found`);
    }

    // Append text to document
    const updatedContent = doc.content + "\n\n" + args.text;
    await ctx.db.patch(args.documentId, {
      content: updatedContent,
    });

    // Create import record for tracking
    const importId = await ctx.db.insert("imports", {
      documentId: args.documentId,
      source: args.source,
      text: args.text,
      importedAt: Date.now(),
    });

    return { importId, documentId: args.documentId };
  },
});

/**
 * Get imports for a specific document
 */
export const getByDocument = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const imports = await ctx.db
      .query("imports")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();

    return imports;
  },
});

/**
 * Get import count in the last hour (for rate limit display)
 */
export const getRecentCount = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const oneHourAgo = now - HOUR_IN_MS;

    const allImports = await ctx.db
      .query("imports")
      .withIndex("by_importedAt")
      .collect();

    // Filter manually to find imports in the last hour
    const recentImports = allImports.filter((imp) => imp.importedAt >= oneHourAgo);

    return {
      count: recentImports.length,
      limit: MAX_IMPORTS_PER_HOUR,
      resetsAt: oneHourAgo + HOUR_IN_MS,
    };
  },
});

/**
 * Delete an import record (does not remove appended text from document)
 */
export const deleteImport = mutation({
  args: {
    importId: v.id("imports"),
  },
  handler: async (ctx, args) => {
    const importRecord = await ctx.db.get(args.importId);
    if (!importRecord) {
      throw new Error(`Import ${args.importId} not found`);
    }

    await ctx.db.delete(args.importId);
    return { deleted: args.importId };
  },
});
