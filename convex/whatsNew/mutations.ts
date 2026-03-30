/**
 * What's New Mutations
 *
 * Mutations for creating and updating What's New reports.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

/**
 * Create a new What's New report (internal)
 *
 * Used by the generateDailyReport action after synthesizing findings.
 */
export const createReport = internalMutation({
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
    documentId: v.optional(v.id("documents")),
    toolSuggestionsJson: v.optional(v.string()),
    findingsJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reportId = await ctx.db.insert("whatsNewReports", {
      ...args,
      createdAt: Date.now(),
    });

    return reportId;
  },
});

/**
 * Update report with document link (internal)
 *
 * Used to link a report to its generated document after embedding.
 */
export const linkDocument = internalMutation({
  args: {
    reportId: v.id("whatsNewReports"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, { reportId, documentId }) => {
    await ctx.db.patch(reportId, { documentId });
    return { success: true };
  },
});
