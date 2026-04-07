/**
 * Migration: Backfill missing documents for completed deep research sessions
 *
 * Finds all completed sessions without documents and creates them
 * using the new format with proper result cards.
 *
 * Run with: npx convex run migrations/backfill_research_documents:backfill
 * Run with dry run: npx convex run migrations/backfill_research_documents:backfill --args '{\"dryRun\": true}'
 * Check status: npx convex run migrations/backfill_research_documents:status
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

interface SessionNeedingDocument {
  _id: Id<"deepResearchSessions">;
  topic: string;
  status: string;
  conversationId: Id<"conversations">;
  researchType?: string;
  currentIteration?: number;
}

interface BackfillResult {
  status: "complete" | "partial";
  processed: number;
  created: number;
  skipped: number;
  errors: number;
  remaining: number;
  message?: string;
  sessionIds?: string[];
}

/**
 * Backfill documents for completed deep research sessions
 *
 * Processes sessions in batches to avoid timeout. Safe to re-run idempotently.
 */
export const backfill = action({
  args: {
    batchSize: v.optional(v.number()), // Process in batches to avoid timeouts (default: 10)
    dryRun: v.optional(v.boolean()),   // Log what would be done without executing
  },
  handler: async (ctx, { batchSize = 10, dryRun = false }): Promise<BackfillResult> => {

    // Step 1: Find all completed sessions without documents
    const allSessions = await ctx.runQuery(
      internal.research.documentQueries.getSessionsNeedingDocuments,
      {}
    ) as SessionNeedingDocument[];

    const totalSessions = allSessions.length;

    if (totalSessions === 0) {
      return {
        status: "complete",
        processed: 0,
        created: 0,
        skipped: 0,
        errors: 0,
        remaining: 0,
        message: "All sessions already have documents"
      };
    }

    // Step 2: Process in batches
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const processedSessionIds: string[] = [];

    for (let i = 0; i < Math.min(batchSize, allSessions.length); i++) {
      const session = allSessions[i];

      try {
        if (dryRun) {
          
          created++;
          processedSessionIds.push(session._id);
        } else {
          // Trigger document creation via scheduler
          // This ensures idempotency - createResearchDocument checks if document already exists
          await ctx.scheduler.runAfter(
            0,
            internal.research.documents.createResearchDocument,
            { sessionId: session._id }
          );
          created++;
          processedSessionIds.push(session._id);
        }
      } catch (error) {
        console.error(`[backfillResearchDocuments] Error processing session ${session._id}:`, error);
        errors++;
      }
    }

    const remaining = totalSessions - Math.min(batchSize, totalSessions);

    const message = dryRun
      ? `DRY RUN: Would create ${created} documents. Run again with dryRun: false to execute.`
      : `Created ${created} documents. ${remaining} sessions remaining.`;

    return {
      status: remaining > 0 ? "partial" : "complete",
      processed: Math.min(batchSize, totalSessions),
      created,
      skipped,
      errors,
      remaining,
      message,
      sessionIds: processedSessionIds,
    };
  },
});

/**
 * Check the status of sessions needing documents
 *
 * Returns count of sessions without documents for monitoring
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<{
    sessionsNeedingDocuments: number;
    totalSessions: number;
    sessionsWithDocuments: number;
    topicsNeedingDocuments: string[];
  }> => {
    const sessionsNeeding = await ctx.runQuery(
      internal.research.documentQueries.getSessionsNeedingDocuments,
      {}
    ) as SessionNeedingDocument[];

    // Get total completed sessions count (approximate by using same query logic)
    // In production, you might want a dedicated query for this
    const topics = sessionsNeeding.map((s) => s.topic);

    return {
      sessionsNeedingDocuments: sessionsNeeding.length,
      totalSessions: sessionsNeeding.length, // This is approximate, only counting those needing docs
      sessionsWithDocuments: 0, // Would need separate query to count total sessions
      topicsNeedingDocuments: topics.slice(0, 10), // Return first 10 topics
    };
  },
});
