/**
 * Assimilation tools for Holocron MCP
 * Implements start, approve, reject, status, cancel, and steer for assimilation sessions
 */

import type { HolocronConvexClient } from "../convex/client.ts";

// ============================================================================
// Types
// ============================================================================

export interface StartAssimilationInput {
  repositoryUrl: string;
  profile?: "fast" | "standard" | "thorough";
  autoApprove?: boolean;
}

export interface StartAssimilationOutput {
  sessionId: string;
  status: string;
  existing?: boolean;
}

export interface AssimilationSessionIdInput {
  sessionId: string;
}

export interface RejectAssimilationPlanInput {
  sessionId: string;
  feedback?: string;
}

export interface SteerAssimilationInput {
  sessionId: string;
  note: string;
}

export interface AssimilationStatusOutput {
  _id: string;
  status: string;
  profile?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  currentIteration?: number;
  maxIterations?: number;
  dimensionScores?: Record<string, number>;
  estimatedCostUsd?: number;
  planSummary?: string;
  planContent?: string;
  documentId?: string;
  metadataId?: string;
  errorReason?: string;
  createdAt?: number;
  completedAt?: number;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Start a new assimilation session for a GitHub repository
 */
export async function startAssimilation(
  client: HolocronConvexClient,
  input: StartAssimilationInput
): Promise<StartAssimilationOutput> {
  const result = await client.mutation<{
    sessionId: string;
    status: string;
    existing?: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  }>("assimilate/mutations:startAssimilation" as any, {
    repositoryUrl: input.repositoryUrl,
    ...(input.profile !== undefined && { profile: input.profile }),
    ...(input.autoApprove !== undefined && { autoApprove: input.autoApprove }),
  });

  return {
    sessionId: result.sessionId,
    status: result.status,
    existing: result.existing,
  };
}

/**
 * Approve the assimilation plan to start the analysis loop
 */
export async function approveAssimilationPlan(
  client: HolocronConvexClient,
  input: AssimilationSessionIdInput
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  await client.mutation<void>("assimilate/mutations:approveAssimilationPlan" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    sessionId: input.sessionId as any,
  });
}

/**
 * Reject the assimilation plan (with optional feedback to trigger re-planning)
 */
export async function rejectAssimilationPlan(
  client: HolocronConvexClient,
  input: RejectAssimilationPlanInput
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  await client.mutation<void>("assimilate/mutations:rejectAssimilationPlan" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    sessionId: input.sessionId as any,
    ...(input.feedback !== undefined && { feedback: input.feedback }),
  });
}

/**
 * Get lightweight status of an assimilation session for polling
 */
export async function getAssimilationStatus(
  client: HolocronConvexClient,
  input: AssimilationSessionIdInput
): Promise<AssimilationStatusOutput | null> {
  const result = await client.query<AssimilationStatusOutput | null>(
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    "assimilate/queries:getAssimilationSessionStatus" as any,
    {
      // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
      sessionId: input.sessionId as any,
    }
  );

  return result;
}

/**
 * Cancel an active assimilation session
 */
export async function cancelAssimilation(
  client: HolocronConvexClient,
  input: AssimilationSessionIdInput
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  await client.mutation<void>("assimilate/mutations:cancelAssimilation" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    sessionId: input.sessionId as any,
  });
}

/**
 * Inject a human steering note for the next iteration
 */
export async function steerAssimilation(
  client: HolocronConvexClient,
  input: SteerAssimilationInput
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  await client.mutation<void>("assimilate/mutations:steerAssimilation" as any, {
    // biome-ignore lint/suspicious/noExplicitAny: Convex ID type
    sessionId: input.sessionId as any,
    note: input.note,
  });
}
