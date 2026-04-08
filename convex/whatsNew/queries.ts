/**
 * What's New Queries
 *
 * Public queries for retrieving cached What's New reports.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

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
 * Get a report by its ID
 *
 * Returns the full report with document content.
 */
export const getReportById = query({
  args: { reportId: v.id("whatsNewReports") },
  handler: async (ctx, { reportId }) => {
    const report = await ctx.db.get(reportId);

    if (!report) {
      return null;
    }

    // Fetch the linked document if available
    let documentContent: string | null = null;
    if (report.documentId) {
      const document = await ctx.db.get(report.documentId);
      documentContent = document?.content ?? null;
    }

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
    };
  },
});

/**
 * Get the latest findings from the most recent What's New report.
 *
 * Parses the findingsJson field and optionally filters by category.
 * Returns an empty findings array and null report when no report exists.
 */
export const getLatestFindings = query({
  args: {
    category: v.optional(
      v.union(
        v.literal("discovery"),
        v.literal("release"),
        v.literal("trend"),
        v.literal("discussion")
      )
    ),
  },
  handler: async (ctx, { category }) => {
    const report = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .first();

    if (!report) {
      return { findings: [], report: null };
    }

    type Finding = {
      title: string;
      url: string;
      source: string;
      category: "discovery" | "release" | "trend" | "discussion";
      score?: number;
      summary?: string;
      publishedAt?: string;
      engagementVelocity?: number;
      crossSourceCorroboration?: number;
      author?: string;
      tags?: string[];
    };

    let findings: Finding[] = [];
    if (report.findingsJson) {
      try {
        findings = JSON.parse(report.findingsJson) as Finding[];
      } catch {
        findings = [];
      }
    }

    if (category) {
      findings = findings.filter((f) => f.category === category);
    }

    return {
      findings,
      report: {
        _id: report._id,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        days: report.days,
        findingsCount: report.findingsCount,
        discoveryCount: report.discoveryCount,
        releaseCount: report.releaseCount,
        trendCount: report.trendCount,
        summaryJson: report.summaryJson,
        createdAt: report.createdAt,
      },
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
    const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

    const reports = await ctx.db
      .query("whatsNewReports")
      .withIndex("by_created")
      .order("desc")
      .take(5);

    // Filter to reports created after the cutoff
    return reports.filter((r) => r.createdAt > cutoff);
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
    const cutoff = Date.now() - args.daysAgo * 24 * 60 * 60 * 1000;

    // Get all content from the period (order by discoveredAt desc)
    const allContent = await ctx.db
      .query("subscriptionContent")
      .order("desc")
      .collect();

    // Filter by date and passed filter
    const filteredContent = allContent.filter(
      (c) => c.discoveredAt > cutoff && c.passedFilter
    );

    // Fetch sources to get type info
    const contentWithSource = await Promise.all(
      filteredContent.map(async (content) => {
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
      youtube: contentWithSource.filter((c) => c.sourceType === "youtube"),
      newsletter: contentWithSource.filter((c) => c.sourceType === "newsletter"),
      changelog: contentWithSource.filter((c) => c.sourceType === "changelog"),
      reddit: contentWithSource.filter((c) => c.sourceType === "reddit"),
      ebay: contentWithSource.filter((c) => c.sourceType === "ebay"),
      "whats-new": contentWithSource.filter((c) => c.sourceType === "whats-new"),
    };

    return {
      total: filteredContent.length,
      grouped,
      all: contentWithSource,
    };
  },
});
