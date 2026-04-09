/**
 * Migration: Backfill missing embeddings for research tables
 *
 * Run with: npx convex run migrations/backfill_research_embeddings:backfill
 *
 * This script backfills embeddings for:
 * - researchFindings table
 * - deepResearchIterations table
 */

import { action, internalMutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { embed } from "ai";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";

"use node";

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

// ============================================================================
// Internal Mutations (for db access from actions)
// ============================================================================

/**
 * Internal mutation: Update a research finding with embedding
 */
export const updateFindingEmbedding = internalMutation({
  args: {
    findingId: v.id("researchFindings"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.findingId, {
      embedding: args.embedding,
    });
  },
});

/**
 * Internal mutation: Update a deep research iteration with embedding
 */
export const updateIterationEmbedding = internalMutation({
  args: {
    iterationId: v.id("deepResearchIterations"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.iterationId, {
      embedding: args.embedding,
    });
  },
});

// ============================================================================
// Backfill Action
// ============================================================================

/**
 * Backfill embeddings for research findings and iterations that don't have them.
 */
export const backfill = action({
  args: {},
  handler: async (ctx): Promise<BackfillResult> => {
    // Get all research sessions first
    const sessions = await ctx.runQuery(internal.research._queries.listAllSessions, {});

    // Collect all iterations and findings from all sessions
    const allIterations: any[] = [];
    const allFindings: any[] = [];

    for (const session of sessions) {
      const iterations = await ctx.runQuery(api.research.queries.listDeepResearchIterations, {
        sessionId: session._id
      });
      allIterations.push(...iterations);

      const findings = await ctx.runQuery(api.research.queries.getFindingsByConfidence, {
        sessionId: session._id
      });
      allFindings.push(...findings);
    }

    // Filter to find records without embeddings
    const orphanFindings = allFindings.filter((f: any) => !f.embedding).slice(0, 1000);
    const orphanIterations = allIterations.filter((i: any) => !i.embedding).slice(0, 1000);

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
        batch.map(async (finding: any) => {
          // Generate embedding
          const embedding = await generateFindingEmbedding(finding.claimText);

          // Update the finding with embedding using internal mutation
          await ctx.runMutation(internal.migrations.backfill_research_embeddings.updateFindingEmbedding, {
            findingId: finding._id,
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
        batch.map(async (iteration: any) => {
          // Generate embedding
          const embedding = await generateIterationEmbedding(iteration.findings ?? "");

          // Update the iteration with embedding using internal mutation
          await ctx.runMutation(internal.migrations.backfill_research_embeddings.updateIterationEmbedding, {
            iterationId: iteration._id,
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
    // Get all research sessions first
    const sessions = await ctx.runQuery(internal.research._queries.listAllSessions, {});

    // Collect all iterations and findings from all sessions
    const allIterations: any[] = [];
    const allFindings: any[] = [];

    for (const session of sessions) {
      const iterations = await ctx.runQuery(api.research.queries.listDeepResearchIterations, {
        sessionId: session._id
      });
      allIterations.push(...iterations);

      const findings = await ctx.runQuery(api.research.queries.getFindingsByConfidence, {
        sessionId: session._id
      });
      allFindings.push(...findings);
    }

    const orphanFindings = allFindings.filter((f: any) => !f.embedding);
    const orphanIterations = allIterations.filter((i: any) => !i.embedding);

    return {
      findingsWithoutEmbeddings: orphanFindings.length,
      iterationsWithoutEmbeddings: orphanIterations.length,
      totalFindings: allFindings.length,
      totalIterations: allIterations.length,
      findingsPercentComplete: allFindings.length > 0 ? ((allFindings.length - orphanFindings.length) / allFindings.length) * 100 : 100,
      iterationsPercentComplete: allIterations.length > 0 ? ((allIterations.length - orphanIterations.length) / allIterations.length) * 100 : 100,
    };
  },
});
