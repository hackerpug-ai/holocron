"use node";

/**
 * Improvement Request AI Agent Pipeline
 *
 * Processes new improvement requests through a deduplication pipeline:
 * 1. Generate embedding for the request description
 * 2. Find semantically similar existing requests
 * 3. Call LLM to classify: create_new or merge
 * 4. Persist the agent decision (title, summary, agentDecision, embedding)
 * 5. If merge: execute the merge mutation (sets source to closed, mergedIntoId=target)
 *
 * Status stays "open" throughout — no review gate. Merge decisions are auto-applied.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { generateText, embed } from "ai";
import { claudeFlash } from "../lib/ai/anthropic_provider";
import { cohereEmbedding } from "../lib/ai/embeddings_provider";
import { DEDUP_SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { Id } from "../_generated/dataModel";

// Use makeFunctionReference to avoid dependency on the generated API not yet
// including improvements/actions (which would create a circular import at
// type-generation time).
const improvementsSearchFindSimilar = makeFunctionReference<
  "action",
  {
    description: string;
    embedding?: number[];
    limit?: number;
  },
  Array<{
    _id: Id<"improvementRequests">;
    description: string;
    title?: string;
    status: string;
    mergedIntoId?: Id<"improvementRequests">;
    score: number;
    [key: string]: unknown;
  }>
>("improvements/search:findSimilar");

const improvementsQueriesGet = makeFunctionReference<
  "query",
  { id: Id<"improvementRequests"> },
  | {
      _id: Id<"improvementRequests">;
      description: string;
      title?: string;
      summary?: string;
      status: string;
      userFeedback?: string;
      mergedIntoId?: Id<"improvementRequests">;
      [key: string]: unknown;
    }
  | null
>("improvements/queries:get");

/**
 * processNewRequest
 *
 * Internal action invoked after a new improvement request is submitted.
 * Runs the full deduplication pipeline and writes the agent decision back.
 */
export const processNewRequest = internalAction({
  args: {
    requestId: v.id("improvementRequests"),
  },
  handler: async (ctx, { requestId }): Promise<void> => {
    try {
      // Step 2: Fetch the request
      const request = await ctx.runQuery(improvementsQueriesGet, {
        id: requestId,
      });

      if (!request) {
        throw new Error(`Improvement request ${requestId} not found`);
      }

      // Step 3: Generate embedding from description (truncated to 8000 chars)
      const { embedding } = await embed({
        model: cohereEmbedding,
        value: request.description.slice(0, 8000),
      });

      // Step 4: Find similar existing requests (pass embedding to avoid double-embedding)
      const similarResults = await ctx.runAction(
        improvementsSearchFindSimilar,
        {
          description: request.description,
          embedding,
          limit: 10,
        }
      );

      // Step 5: Filter candidates — exclude self, exclude merged, take top 3
      const candidates = similarResults
        .filter((r) => r._id !== requestId && r.mergedIntoId === undefined)
        .slice(0, 3);

      // Step 6: Call LLM for deduplication decision
      const result = await generateText({
        model: claudeFlash(),
        system: DEDUP_SYSTEM_PROMPT,
        prompt: buildUserPrompt(
          request.description,
          candidates.map((c) => ({
            _id: c._id as string,
            title: c.title,
            description: c.description,
            score: c.score,
          })),
          request.userFeedback as string | undefined,
        ),
      });

      // Step 7: Parse JSON decision — fallback to create_new on parse failure
      type AgentDecisionRaw = {
        action: "create_new" | "merge";
        mergeTargetId?: string;
        confidence: number;
        reasoning: string;
        title: string;
        summary: string;
      };

      let decision: AgentDecisionRaw;
      try {
        decision = JSON.parse(result.text) as AgentDecisionRaw;
      } catch {
        console.warn(
          "[improvements/actions] Failed to parse LLM response as JSON, falling back to create_new. Raw:",
          result.text.slice(0, 500),
        );
        decision = {
          action: "create_new",
          confidence: 0,
          reasoning: "LLM response could not be parsed as JSON",
          title: request.description.slice(0, 60),
          summary: request.description.slice(0, 200),
        };
      }

      // Step 8: Write agent results back to the request
      await ctx.runMutation(internal.improvements.internal.updateFromAgent, {
        requestId,
        title: decision.title,
        summary: decision.summary,
        agentDecision: {
          action: decision.action,
          mergeTargetId:
            decision.action === "merge" && decision.mergeTargetId
              ? (decision.mergeTargetId as Id<"improvementRequests">)
              : undefined,
          confidence: decision.confidence,
          reasoning: decision.reasoning,
          similarRequests: candidates.map((c) => ({
            id: c._id as Id<"improvementRequests">,
            title: c.title ?? "(no title)",
            similarity: c.score,
          })),
        },
        embedding,
      });

      // Step 9: Execute merge if the agent decided to merge
      if (
        decision.action === "merge" &&
        decision.mergeTargetId != null &&
        decision.mergeTargetId.length > 0
      ) {
        await ctx.runMutation(internal.improvements.internal.executeMerge, {
          sourceId: requestId,
          targetId: decision.mergeTargetId as Id<"improvementRequests">,
          reason: decision.reasoning,
        });
      }
    } catch (error) {
      // On any failure, log — the request stays "open" regardless of agent outcome.
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[improvements/actions] processNewRequest failed for ${requestId}: ${message}`,
      );
    }
  },
});
