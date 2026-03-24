/**
 * Research tools for Holocron MCP
 * Implements research_topic and simple_research MCP tools
 */

import type { HolocronConvexClient } from "../convex/client.ts";
import type { Document, ResearchSession } from "../convex/types.ts";
import { formatFinalResults } from "../streaming/formatter.ts";
import { streamProgress, subscriptionManager } from "../streaming/subscription-manager.ts";

/**
 * Deep research with streaming progress updates
 *
 * @deprecated Delegates to Convex backend and may timeout. Use local research
 * with Jina/Exa tools and `mcp__holocron__storeDocument` for storage instead.
 */
export interface ResearchTopicInput {
  topic: string;
  maxIterations?: number;
  confidenceFilter?: "HIGH_ONLY" | "HIGH_MEDIUM" | "ALL";
}

export interface ResearchTopicOutput {
  sessionId: string;
  topic: string;
  status: "running" | "completed" | "failed";
  iterations: number;
  documentId?: string;
  synthesizedReport?: string;
  confidenceStats: {
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * @deprecated Delegates to Convex backend and may timeout. Use local research
 * with Jina/Exa tools and `mcp__holocron__storeDocument` for storage instead.
 */
export async function researchTopic(
  client: HolocronConvexClient,
  input: ResearchTopicInput
): Promise<ResearchTopicOutput> {
  // Start deep research via Convex action
  const startResult = await client.action<{ sessionId: string }>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "research/index:startDeepResearch" as any,
    {
      topic: input.topic,
      maxIterations: input.maxIterations ?? 5,
    }
  );

  const { sessionId } = startResult;

  // Set up subscription for progress updates
  const unsubscribe = client.subscribe<ResearchSession>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "research/queries:getDeepResearchSession" as any,
    { sessionId },
    (session) => {
      if (session) {
        streamProgress(session);

        // Cleanup on completion
        if (session.status === "completed" || session.status === "failed") {
          console.error(formatFinalResults(session));
          subscriptionManager.remove(sessionId);
        }
      }
    }
  );

  // Track subscription for cleanup
  subscriptionManager.add(sessionId, unsubscribe);

  // Poll for completion
  let session: ResearchSession | null = null;
  const maxWaitMs = 60000; // 60 seconds (safety valve — prefer local research tools)
  const pollIntervalMs = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    session = await client.query<ResearchSession>(
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
      "research/queries:getDeepResearchSession" as any,
      { sessionId }
    );

    if (session && (session.status === "completed" || session.status === "failed")) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!session) {
    throw new Error("Research session not found or timed out");
  }

  // Cleanup subscription
  subscriptionManager.remove(sessionId);

  // If session completed successfully, fetch the synthesized document
  let synthesizedReport: string | undefined;
  let documentId: string | undefined;

  if (session.status === "completed" && session.documentId) {
    documentId = session.documentId;

    // Wait briefly for document to be created (it's scheduled via Convex)
    // The document is created by scheduler.runAfter(0, ...) in completeDeepResearchSession
    let document: Document | null = null;
    const documentPollStart = Date.now();
    const documentPollMaxMs = 30000; // 30 seconds max wait for document
    const documentPollIntervalMs = 1000;

    while (!document && Date.now() - documentPollStart < documentPollMaxMs) {
      try {
        document = await client.query<Document | null>(
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
          "documents/queries:get" as any,
          { id: documentId }
        );

        if (document?.content) {
          synthesizedReport = document.content;
          break;
        }
      } catch {
        // Document might not exist yet, continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, documentPollIntervalMs));
    }

    if (!document) {
      console.error(`[researchTopic] Document ${documentId} not found after polling`);
    }
  }

  return {
    sessionId: session._id,
    topic: session.topic,
    status: session.status,
    iterations: session.currentIteration,
    documentId,
    synthesizedReport,
    confidenceStats: session.confidenceStats,
  };
}

/**
 * Simple research without streaming (single iteration)
 */
export interface SimpleResearchInput {
  topic: string;
}

export interface SimpleResearchOutput {
  sessionId: string;
  topic: string;
  status: "completed" | "error";
  summary: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  durationMs: number;
}

export async function simpleResearch(
  client: HolocronConvexClient,
  input: SimpleResearchInput
): Promise<SimpleResearchOutput> {
  const result = await client.action<SimpleResearchOutput>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "research/index:startSimpleResearch" as any,
    {
      topic: input.topic,
    }
  );

  return result;
}
