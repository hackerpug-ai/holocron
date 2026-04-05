/**
 * Migration: collapse improvement statuses from 6-state → open/closed.
 *
 * Mapping:
 *   submitted | processing | pending_review | approved → open
 *   done | merged                                      → closed
 *
 * Idempotent — safe to run multiple times. Records already in open/closed
 * are left untouched (except to backfill closedAt for any existing closed
 * rows that lack it).
 *
 * Run with:
 *   npx convex run migrations/collapse_improvement_statuses:run
 */

import { internalMutation } from "../_generated/server";

type OldStatus =
  | "submitted"
  | "processing"
  | "pending_review"
  | "approved"
  | "done"
  | "merged"
  | "open"
  | "closed";

function mapStatus(old: OldStatus): "open" | "closed" {
  switch (old) {
    case "done":
    case "merged":
    case "closed":
      return "closed";
    case "submitted":
    case "processing":
    case "pending_review":
    case "approved":
    case "open":
    default:
      return "open";
  }
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("improvementRequests").collect();

    let migrated = 0;
    let skipped = 0;
    const breakdown: Record<string, number> = {};

    for (const row of all) {
      const oldStatus = row.status as OldStatus;
      breakdown[oldStatus] = (breakdown[oldStatus] ?? 0) + 1;
      const newStatus = mapStatus(oldStatus);

      const needsStatusUpdate = row.status !== newStatus;
      const needsClosedAtBackfill =
        newStatus === "closed" && row.closedAt === undefined;

      if (!needsStatusUpdate && !needsClosedAtBackfill) {
        skipped++;
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (needsStatusUpdate) patch.status = newStatus;
      if (needsClosedAtBackfill) patch.closedAt = row.updatedAt ?? Date.now();

      await ctx.db.patch(row._id, patch);
      migrated++;
    }

    console.log(
      `[collapse_improvement_statuses] migrated=${migrated} skipped=${skipped} breakdown=${JSON.stringify(breakdown)}`
    );

    return { migrated, skipped, breakdown, total: all.length };
  },
});
