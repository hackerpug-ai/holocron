import { v } from "convex/values";
import { query, mutation, action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { embed } from "ai";
import { cohereEmbedding } from "./lib/ai/embeddings_provider";

// ============================================================================
// Queries
// ============================================================================

/**
 * Get recent whats-new reports to check if we should run a new scan
 * Returns reports from the last N days
 */
export const getRecentReports = query({
  args: {
    daysAgo: v.optional(v.number()), // Default: 3 days
  },
  handler: async (ctx, args) => {
    const daysAgo = args.daysAgo ?? 3;
    const cutoff = Date.now() - (daysAgo * 24 * 60 * 60 * 1000);

    const reports = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created", (q) => q.gt("createdAt", cutoff))
      .order("desc")
      .take(5);

    return reports;
  },
});

/**
 * Get recent subscription content for "known ecosystem" context
 * Returns content from the past N days, grouped by source type
 */
export const getRecentSubscriptionContent = query({
  args: {
    daysAgo: v.number(), // 1-90 days
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.daysAgo * 24 * 60 * 60 * 1000);

    // Get all content from the period (order by discoveredAt desc)
    const allContent = await ctx.db
      .query("subscriptionContent")
      .order("desc")
      .collect();

    // Filter by date and passed filter
    const _filteredContent = allContent.filter(c => c.discoveredAt > cutoff && c.passedFilter);

    // Fetch sources to get type info
    const contentWithSource = await Promise.all(
      allContent.map(async (content) => {
        const source = await ctx.db.get(content.sourceId);
        return {
          ...content,
          sourceType: source?.sourceType ?? "unknown",
          sourceIdentifier: source?.identifier ?? "",
          sourceName: source?.name ?? "",
        };
      })
    );

    // Group by source type
    const grouped = {
      youtube: contentWithSource.filter(c => c.sourceType === "youtube"),
      newsletter: contentWithSource.filter(c => c.sourceType === "newsletter"),
      changelog: contentWithSource.filter(c => c.sourceType === "changelog"),
      reddit: contentWithSource.filter(c => c.sourceType === "reddit"),
      ebay: contentWithSource.filter(c => c.sourceType === "ebay"),
      "whats-new": contentWithSource.filter(c => c.sourceType === "whats-new"),
    };

    return {
      total: allContent.length,
      grouped,
      all: contentWithSource,
    };
  },
});

/**
 * Get recent whats-new reports with full details
 */
export const getLatestReport = query({
  args: {},
  handler: async (ctx) => {
    const report = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .first();

    return report;
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Internal mutation: Save a whats-new report with embeddings
 * Creates a subscription source and individual findings as content items
 *
 * This is called by saveReportWithEmbeddings action.
 * Use saveReportWithEmbeddings for external calls to ensure embeddings are generated.
 */
export const saveReportInternal = mutation({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    days: v.number(),
    focus: v.string(),
    discoveryOnly: v.boolean(),
    findingsCount: v.number(),
    discoveryCount: v.number(),
    releaseCount: v.number(),
    trendCount: v.number(),
    reportPath: v.string(),
    summaryJson: v.optional(v.any()),
    findings: v.optional(v.array(v.object({
      title: v.string(),
      url: v.optional(v.string()),
      source: v.string(),
      score: v.optional(v.number()),
      timestamp: v.optional(v.number()),
      summary: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      embedding: v.optional(v.array(v.float64())),
    }))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const identifier = `whats-new-${new Date(args.periodStart).toISOString().split('T')[0]}`;

    // Create subscription source for this whats-new run
    const sourceId = await ctx.db.insert("subscriptionSources", {
      sourceType: "whats-new",
      identifier,
      name: `What's New: ${new Date(args.periodStart).toLocaleDateString()} - ${new Date(args.periodEnd).toLocaleDateString()}`,
      url: args.reportPath,
      fetchMethod: "api",
      configJson: {
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        days: args.days,
        focus: args.focus,
        discoveryOnly: args.discoveryOnly,
        summary: args.summaryJson,
      },
      autoResearch: false,
      createdAt: now,
      updatedAt: now,
    });

    // Insert individual findings as content items with embeddings
    if (args.findings && args.findings.length > 0) {
      for (const finding of args.findings) {
        await ctx.db.insert("subscriptionContent", {
          sourceId,
          contentId: `${identifier}-${finding.title.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '-')}`,
          title: finding.title,
          url: finding.url,
          embedding: finding.embedding, // Include embedding for semantic search
          metadataJson: {
            score: finding.score,
            source: finding.source,
            timestamp: finding.timestamp,
            summary: finding.summary,
            tags: finding.tags,
          },
          passedFilter: true,
          researchStatus: "researched" as const,
          discoveredAt: finding.timestamp || now,
          researchedAt: now,
          inFeed: false,
        });
      }
    }

    // Keep whatsNewReports table for lightweight summary/stats only
    const reportId = await ctx.db.insert("whatsNewReports", {
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      days: args.days,
      focus: args.focus,
      discoveryOnly: args.discoveryOnly,
      findingsCount: args.findingsCount,
      discoveryCount: args.discoveryCount,
      releaseCount: args.releaseCount,
      trendCount: args.trendCount,
      reportPath: args.reportPath,
      summaryJson: args.summaryJson,
      createdAt: now,
    });

    return { reportId, sourceId, identifier };
  },
});

/**
 * Internal action: Generate embedding for a single finding title
 *
 * @param title - Finding title to embed
 * @returns embedding vector (1024 dimensions)
 */
async function generateFindingEmbedding(title: string): Promise<number[]> {
  const MAX_LENGTH = 2000;
  const truncated = title.slice(0, MAX_LENGTH);

  const { embedding } = await embed({
    model: cohereEmbedding,
    value: truncated,
  });

  return embedding;
}

/**
 * Save a whats-new report with embeddings (action version)
 *
 * This action version generates embeddings for each finding before saving,
 * enabling semantic search and deduplication.
 */
export const saveReportWithEmbeddings = internalAction({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    days: v.number(),
    focus: v.string(),
    discoveryOnly: v.boolean(),
    findingsCount: v.number(),
    discoveryCount: v.number(),
    releaseCount: v.number(),
    trendCount: v.number(),
    reportPath: v.string(),
    summaryJson: v.optional(v.any()),
    findings: v.optional(v.array(v.object({
      title: v.string(),
      url: v.optional(v.string()),
      source: v.string(),
      score: v.optional(v.number()),
      timestamp: v.optional(v.number()),
      summary: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      embedding: v.optional(v.array(v.float64())),
    }))),
  },
  handler: async (ctx, args) => {
    // Generate embeddings for all findings in parallel
    const embeddings: number[][] = [];
    if (args.findings && args.findings.length > 0) {
      const embeddingPromises = args.findings.map(finding =>
        generateFindingEmbedding(finding.title)
      );
      const generatedEmbeddings = await Promise.all(embeddingPromises);
      embeddings.push(...generatedEmbeddings);
    }

    // Call the mutation with embeddings included
    const result = await ctx.runMutation(internal.whatsNew.saveReportInternal, {
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      days: args.days,
      focus: args.focus,
      discoveryOnly: args.discoveryOnly,
      findingsCount: args.findingsCount,
      discoveryCount: args.discoveryCount,
      releaseCount: args.releaseCount,
      trendCount: args.trendCount,
      reportPath: args.reportPath,
      summaryJson: args.summaryJson,
      findings: args.findings?.map((finding, index) => ({
        ...finding,
        embedding: embeddings[index],
      })),
    });

    return result;
  },
});

/**
 * Public action: Save a whats-new report with embeddings
 *
 * This is the main entry point for saving whats-new reports with semantic search support.
 * Can be called from the whats-new skill or MCP tools.
 */
export const saveReportWithEmbeddingsPublic = action({
  args: {
    periodStart: v.number(),
    periodEnd: v.number(),
    days: v.number(),
    focus: v.string(),
    discoveryOnly: v.boolean(),
    findingsCount: v.number(),
    discoveryCount: v.number(),
    releaseCount: v.number(),
    trendCount: v.number(),
    reportPath: v.string(),
    summaryJson: v.optional(v.any()),
    findings: v.optional(v.array(v.object({
      title: v.string(),
      url: v.optional(v.string()),
      source: v.string(),
      score: v.optional(v.number()),
      timestamp: v.optional(v.number()),
      summary: v.optional(v.string()),
      tags: v.optional(v.array(v.string())),
      embedding: v.optional(v.array(v.float64())),
    }))),
  },
  handler: async (ctx, args) => {
    // Delegate to the internal action
    return await ctx.runAction(internal.whatsNew.saveReportWithEmbeddings, args);
  },
});
