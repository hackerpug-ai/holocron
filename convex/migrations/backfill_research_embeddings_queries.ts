/**
 * Migration queries for research embedding backfill
 *
 * These are internal queries used by the backfill action.
 */

import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

interface OrphanResearchFinding {
  _id: Id<"researchFindings">;
  claimText: string;
  claimCategory?: string;
  createdAt?: number;
}

interface OrphanDeepResearchIteration {
  _id: Id<"deepResearchIterations">;
  findings: string;
  createdAt?: number;
}

/**
 * Find research findings without embeddings
 */
export const findResearchFindingsWithoutEmbeddings = internalQuery({
  args: {},
  handler: async (ctx): Promise<OrphanResearchFinding[]> => {
    const findings = await ctx.db.query("researchFindings").collect();
    return findings
      .filter((f) => !f.embedding)
      .slice(0, 1000)
      .map((f) => ({
        _id: f._id,
        claimText: f.claimText,
        claimCategory: f.claimCategory,
        createdAt: f.createdAt,
      }));
  },
});

/**
 * Find deep research iterations without embeddings
 */
export const findDeepResearchIterationsWithoutEmbeddings = internalQuery({
  args: {},
  handler: async (ctx): Promise<OrphanDeepResearchIteration[]> => {
    const iterations = await ctx.db.query("deepResearchIterations").collect();
    return iterations
      .filter((i) => !i.embedding)
      .slice(0, 1000)
      .map((i) => ({
        _id: i._id,
        findings: i.findings ?? "", // Handle undefined case
        createdAt: i.createdAt,
      }));
  },
});

/**
 * Count total research findings
 */
export const countTotalFindings = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    const findings = await ctx.db.query("researchFindings").collect();
    return findings.length;
  },
});

/**
 * Count total deep research iterations
 */
export const countTotalIterations = internalQuery({
  args: {},
  handler: async (ctx): Promise<number> => {
    const iterations = await ctx.db.query("deepResearchIterations").collect();
    return iterations.length;
  },
});
