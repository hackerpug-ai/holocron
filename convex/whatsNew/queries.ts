/**
 * What's New Queries
 *
 * Public queries for retrieving cached What's New reports.
 */

import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";

/**
 * Get the latest What's New report
 *
 * Returns today's cached report if available, otherwise falls back
 * to the most recent report.
 */
export const getLatestReport = query({
  args: {},
  handler: async (ctx) => {
    // Get the most recent report
    const report = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .first();

    if (!report) {
      return null;
    }

    // Fetch the linked document if available
    let documentContent: string | null = null;
    if (report.documentId) {
      const document = await ctx.db.get(report.documentId);
      documentContent = document?.content ?? null;
    }

    // Check if this is today's report
    const today = new Date().toISOString().split("T")[0];
    const reportDate = new Date(report.periodEnd).toISOString().split("T")[0];
    const isFromToday = reportDate === today;

    return {
      report: {
        _id: report._id,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        days: report.days,
        focus: report.focus,
        findingsCount: report.findingsCount,
        discoveryCount: report.discoveryCount,
        releaseCount: report.releaseCount,
        trendCount: report.trendCount,
        summaryJson: report.summaryJson,
        documentId: report.documentId,
        createdAt: report.createdAt,
      },
      content: documentContent,
      generatedAt: report.createdAt,
      isFromToday,
    };
  },
});

/**
 * Get a report by specific date
 *
 * Finds the report that covers the specified date.
 */
export const getReportByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    // Parse the target date
    const targetDate = new Date(date);
    const targetTimestamp = targetDate.getTime();

    // Find report where periodStart <= targetDate <= periodEnd
    const reports = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_period")
      .filter((q) =>
        q.and(
          q.lte(q.field("periodStart"), targetTimestamp),
          q.gte(q.field("periodEnd"), targetTimestamp)
        )
      )
      .first();

    if (!reports) {
      return null;
    }

    // Fetch linked document
    let documentContent: string | null = null;
    if (reports.documentId) {
      const document = await ctx.db.get(reports.documentId);
      documentContent = document?.content ?? null;
    }

    return {
      report: {
        _id: reports._id,
        periodStart: reports.periodStart,
        periodEnd: reports.periodEnd,
        days: reports.days,
        focus: reports.focus,
        findingsCount: reports.findingsCount,
        discoveryCount: reports.discoveryCount,
        releaseCount: reports.releaseCount,
        trendCount: reports.trendCount,
        summaryJson: reports.summaryJson,
        documentId: reports.documentId,
        createdAt: reports.createdAt,
      },
      content: documentContent,
      generatedAt: reports.createdAt,
    };
  },
});

/**
 * List recent reports with pagination
 */
export const listReports = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit = 10 }) => {
    const reports = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    return reports.map((report) => ({
      _id: report._id,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      days: report.days,
      focus: report.focus,
      findingsCount: report.findingsCount,
      discoveryCount: report.discoveryCount,
      releaseCount: report.releaseCount,
      trendCount: report.trendCount,
      hasDocument: !!report.documentId,
      createdAt: report.createdAt,
    }));
  },
});
