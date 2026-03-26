import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new toolbelt tool
 */
export const create = mutation({
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
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("toolbeltTools", {
      ...args,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a toolbelt tool
 */
export const update = mutation({
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
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Tool ${id} not found`);
    }

    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });

    return await ctx.db.get(id);
  },
});

/**
 * Remove a toolbelt tool
 */
export const remove = mutation({
  args: {
    id: v.id("toolbeltTools"),
  },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Tool ${id} not found`);
    }

    await ctx.db.delete(id);
    return { deleted: true, id };
  },
});

/**
 * Clear all tools (for testing only - use with caution)
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db.query("toolbeltTools").collect();
    for (const tool of tools) {
      await ctx.db.delete(tool._id);
    }
    return { deleted: tools.length };
  },
});

/**
 * Add a tool from URL parameters (one-click add from What's New)
 */
export const addFromUrl = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: v.union(
      v.literal("libraries"),
      v.literal("cli"),
      v.literal("framework"),
      v.literal("service"),
      v.literal("database"),
      v.literal("tool")
    ),
    sourceUrl: v.string(),
    sourceType: v.union(
      v.literal("github"),
      v.literal("npm"),
      v.literal("pypi"),
      v.literal("website"),
      v.literal("cargo"),
      v.literal("go"),
      v.literal("other")
    ),
    language: v.optional(v.string()),
    tags: v.optional(v.string()), // Comma-separated
    useCases: v.optional(v.string()), // Comma-separated
  },
  handler: async (ctx, args) => {
    // Check for duplicate by sourceUrl
    const existing = await ctx.db
      .query("toolbeltTools")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", args.sourceUrl))
      .first();

    if (existing) {
      return { success: true, toolId: existing._id, isNew: false };
    }

    // Parse comma-separated arrays
    const tags = args.tags ? args.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const useCases = args.useCases ? args.useCases.split(",").map((u) => u.trim()).filter(Boolean) : [];

    // Create tool with draft status
    const now = Date.now();
    const toolId = await ctx.db.insert("toolbeltTools", {
      title: args.title,
      description: args.description,
      category: args.category,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType,
      language: args.language,
      tags,
      useCases,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, toolId, isNew: true };
  },
});
