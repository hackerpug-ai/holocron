/**
 * What's New MCP Tool
 *
 * Retrieves cached What's New reports from Convex.
 */

import type { HolocronConvexClient } from "../convex/client.ts";

export interface GetWhatsNewInput {
  forceRefresh?: boolean;
}

export interface WhatsNewReport {
  _id: string;
  periodStart: number;
  periodEnd: number;
  days: number;
  focus: string;
  findingsCount: number;
  discoveryCount: number;
  releaseCount: number;
  trendCount: number;
  summaryJson?: Record<string, unknown>;
  documentId?: string;
  createdAt: number;
}

export interface WhatsNewOutput {
  content: string | null;
  generatedAt: number;
  isFromToday: boolean;
  stats: {
    findingsCount: number;
    discoveryCount: number;
    releaseCount: number;
    trendCount: number;
  };
  report: WhatsNewReport;
}

interface ConvexWhatsNewResult {
  report: WhatsNewReport;
  content: string | null;
  generatedAt: number;
  isFromToday: boolean;
}

/**
 * Get the latest What's New report from the cache
 *
 * Returns today's cached report if available, otherwise falls back
 * to the most recent report.
 */
export async function getWhatsNewReport(
  client: HolocronConvexClient,
  input: GetWhatsNewInput
): Promise<WhatsNewOutput | null> {
  // If force refresh is requested, trigger generation first
  if (input.forceRefresh) {
    console.log("[getWhatsNewReport] Force refresh requested, triggering generation...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.action("whatsNew/actions:generate" as any, {
        force: true,
      });
    } catch (error) {
      console.error("[getWhatsNewReport] Failed to force generate:", error);
      // Continue to try fetching existing report
    }
  }

  // Query for the latest report
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await client.query<ConvexWhatsNewResult | null>(
    "whatsNew/queries:getLatestReport" as any,
    {}
  );

  if (!result) {
    return null;
  }

  return {
    content: result.content,
    generatedAt: result.generatedAt,
    isFromToday: result.isFromToday,
    stats: {
      findingsCount: result.report.findingsCount,
      discoveryCount: result.report.discoveryCount,
      releaseCount: result.report.releaseCount,
      trendCount: result.report.trendCount,
    },
    report: result.report,
  };
}

/**
 * List recent What's New reports
 */
export async function listWhatsNewReports(
  client: HolocronConvexClient,
  limit: number = 10
): Promise<
  Array<{
    _id: string;
    periodStart: number;
    periodEnd: number;
    days: number;
    findingsCount: number;
    hasDocument: boolean;
    createdAt: number;
  }>
> {
  const result = await client.query<
    Array<{
      _id: string;
      periodStart: number;
      periodEnd: number;
      days: number;
      focus: string;
      findingsCount: number;
      discoveryCount: number;
      releaseCount: number;
      trendCount: number;
      hasDocument: boolean;
      createdAt: number;
    }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  >("whatsNew/queries:listReports" as any, { limit });

  return result || [];
}
