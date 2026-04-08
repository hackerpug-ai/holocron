/**
 * Migration: Backfill missing embeddings for research tables
 *
 * Run with: npx convex run migrations/backfill_research_embeddings:backfill
 *
 * This script backfills embeddings for:
 * - researchFindings table
 * - deepResearchIterations table
 */

import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

"use node";

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

interface BackfillResult {
  success: boolean;
  findingsProcessed: number;
  findingsFailed: number;
  iterationsProcessed: number;
  iterationsFailed: number;
  totalFindings: number;
  totalIterations: number;
  message?: string;
  errors?: string[];
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
        findings: i.findings,
        createdAt: i.createdAt,
      }));
  },
});

/**
 * Generate embedding for research finding claim text
 */
async function generateFindingEmbedding(claimText: string): Promise<number[]> {
  const { embedding } = await embed({
    model: cohereEmbedding,
    value: claimText,
  });
  return embedding;
}

/**
 * Generate embedding for deep research iteration findings
 */
async function generateIterationEmbedding(findings: string): Promise<number[]> {
  const { embedding } = await embed({
    model: cohereEmbedding,
    value: findings,
  });
  return embedding;
}

/**
 * Backfill embeddings for research findings and iterations that don't have them.
 */
export const backfill = action({
  args: {},
  handler: async (ctx): Promise<BackfillResult> => {
    // Find records without embeddings
    const orphanFindings = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.findResearchFindingsWithoutEmbeddings, {});
    const orphanIterations = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.findDeepResearchIterationsWithoutEmbeddings, {});

    if (orphanFindings.length === 0 && orphanIterations.length === 0) {
      return {
        success: true,
        findingsProcessed: 0,
        findingsFailed: 0,
        iterationsProcessed: 0,
        iterationsFailed: 0,
        totalFindings: 0,
        totalIterations: 0,
        message: "No research records need embedding backfill"
      };
    }

    let findingsProcessed = 0;
    let findingsFailed = 0;
    let iterationsProcessed = 0;
    let iterationsFailed = 0;
    const errors: string[] = [];

    // Process research findings in batches of 10
    for (let i = 0; i < orphanFindings.length; i += 10) {
      const batch = orphanFindings.slice(i, i + 10);

      const results = await Promise.allSettled(
        batch.map(async (finding) => {
          // Generate embedding
          const embedding = await generateFindingEmbedding(finding.claimText);

          // Update the finding with embedding using internal mutation
          await ctx.runMutation(internal.research.mutations.updateResearchFinding, {
            id: finding._id,
            embedding,
          });

          return finding._id;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          findingsProcessed++;
        } else {
          findingsFailed++;
          const reason = result.reason;
          errors.push(`Finding: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
    }

    // Process deep research iterations in batches of 10
    for (let i = 0; i < orphanIterations.length; i += 10) {
      const batch = orphanIterations.slice(i, i + 10);

      const results = await Promise.allSettled(
        batch.map(async (iteration) => {
          // Generate embedding
          const embedding = await generateIterationEmbedding(iteration.findings);

          // Update the iteration with embedding using internal mutation
          await ctx.runMutation(internal.research.mutations.updateDeepResearchIteration, {
            id: iteration._id,
            embedding,
          });

          return iteration._id;
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          iterationsProcessed++;
        } else {
          iterationsFailed++;
          const reason = result.reason;
          errors.push(`Iteration: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
    }

    return {
      success: true,
      findingsProcessed,
      findingsFailed,
      iterationsProcessed,
      iterationsFailed,
      totalFindings: orphanFindings.length,
      totalIterations: orphanIterations.length,
      errors: errors.slice(0, 10), // Return first 10 errors
    };
  },
});

/**
 * Get the count of research records without embeddings (for monitoring)
 */
export const status = action({
  args: {},
  handler: async (ctx): Promise<{
    findingsWithoutEmbeddings: number;
    iterationsWithoutEmbeddings: number;
    totalFindings: number;
    totalIterations: number;
    findingsPercentComplete: number;
    iterationsPercentComplete: number;
  }> => {
    const orphanFindings = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.findResearchFindingsWithoutEmbeddings, {});
    const orphanIterations = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.findDeepResearchIterationsWithoutEmbeddings, {});

    // Get totals via direct queries (simplified for monitoring)
    const totalFindingsResult = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.countTotalFindings, {});
    const totalIterationsResult = await ctx.runQuery(internal.migrations.backfillResearchEmbeddings.countTotalIterations, {});

    return {
      findingsWithoutEmbeddings: orphanFindings.length,
      iterationsWithoutEmbeddings: orphanIterations.length,
      totalFindings: totalFindingsResult,
      totalIterations: totalIterationsResult,
      findingsPercentComplete: totalFindingsResult > 0 ? ((totalFindingsResult - orphanFindings.length) / totalFindingsResult) * 100 : 100,
      iterationsPercentComplete: totalIterationsResult > 0 ? ((totalIterationsResult - orphanIterations.length) / totalIterationsResult) * 100 : 100,
    };
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
