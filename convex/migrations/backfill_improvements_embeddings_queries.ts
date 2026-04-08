/**
 * Migration queries for improvement request embedding backfill
 *
 * These are internal queries used by the backfill action.
 */

import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

interface OrphanImprovementRequest {
  _id: Id<"improvementRequests">;
  description: string;
  title: string;
  createdAt?: number;
}

/**
 * Find improvement requests without embeddings
 */
export const findImprovementRequestsWithoutEmbeddings = internalQuery({
  args: {},
  handler: async (ctx): Promise<OrphanImprovementRequest[]> => {
    const requests = await ctx.db.query("improvementRequests").collect();
    return requests
      .filter((r) => !r.embedding)
      .slice(0, 1000)
      .map((r) => ({
        _id: r._id,
        description: r.description,
        title: r.title ?? "", // Handle undefined case
        createdAt: r.createdAt,
      }));
  },
});

/**
 * Count total improvement requests
 */
export const countTotalRequests = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    const requests = await ctx.db.query("improvementRequests").collect();
    return requests.length;
  },
});
