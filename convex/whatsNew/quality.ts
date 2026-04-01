/**
 * Summary Quality Monitoring
 *
 * Tracks summary generation success/failure rates, length distribution,
 * and provides stats for quality analysis.
 */

import { query, internalMutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================================================
// Internal Mutations (for logging)
// ============================================================================

/**
 * Log summary generation result
 *
 * Called by generateFindingSummary to track success/failure and summary length.
 * Uses console.log for simple logging - can be upgraded to database storage later.
 */
export const logSummaryGeneration = internalMutation({
  args: {
    findingId: v.string(),
    success: v.boolean(),
    summaryLength: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Structured logging for quality monitoring
    console.log(
      "[Summary Quality]",
      JSON.stringify({
        timestamp: Date.now(),
        findingId: args.findingId,
        success: args.success,
        summaryLength: args.summaryLength,
        error: args.error,
      })
    );

    // TODO: Store in quality_metrics table if needed for analytics
    // For now, console.log provides visibility without blocking generation
  },
});

/**
 * Flag a summary for manual review
 *
 * Called when admin identifies a poor-quality summary that needs review.
 */
export const flagSummary = internalMutation({
  args: {
    findingId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Log flagged summary for manual review
    console.log(
      "[Summary Flagged]",
      JSON.stringify({
        timestamp: Date.now(),
        findingId: args.findingId,
        reason: args.reason,
      })
    );

    // TODO: Store in flagged_summaries table if needed
  },
});

// ============================================================================
// Queries (for stats and reporting)
// ============================================================================

/**
 * Get summary quality statistics
 *
 * Calculates success rate, coverage rate, and average length from
 * recent whatsNew reports.
 */
export const getSummaryStats = query({
  args: {
    limit: v.optional(v.number()), // Default: 10 most recent reports
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    // Query recent reports
    const reports = await ctx.db
      .query("whatsNewReports")
      .order("desc")
      .take(limit);

    let totalFindings = 0;
    let withSummary = 0;
    let lengthSum = 0;
    const lengthDistribution: Record<string, number> = {
      "80-120": 0,
      "121-150": 0,
      "151+": 0,
    };

    for (const report of reports) {
      if (!report.findingsJson) continue;

      const findings = JSON.parse(report.findingsJson) as Array<{
        summary?: string;
      }>;

      totalFindings += findings.length;

      for (const finding of findings) {
        if (finding.summary) {
          withSummary++;
          const len = finding.summary.length;
          lengthSum += len;

          // Track length distribution
          if (len >= 80 && len <= 120) {
            lengthDistribution["80-120"]++;
          } else if (len >= 121 && len <= 150) {
            lengthDistribution["121-150"]++;
          } else if (len > 150) {
            lengthDistribution["151+"]++;
          }
        }
      }
    }

    return {
      totalReports: reports.length,
      totalFindings,
      withSummary,
      coverageRate:
        totalFindings > 0 ? (withSummary / totalFindings) * 100 : 0,
      avgLength: withSummary > 0 ? Math.round(lengthSum / withSummary) : 0,
      lengthDistribution,
    };
  },
});
