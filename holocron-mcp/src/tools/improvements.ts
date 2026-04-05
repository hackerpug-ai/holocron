/**
 * Improvement request tools for Holocron MCP
 * Implements tools for searching, getting, listing, and adding improvement requests
 */

import type { HolocronConvexClient } from "../convex/client.ts";

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Search improvement requests using hybrid similarity search
 */
export async function searchImprovements(
  client: HolocronConvexClient,
  input: { query: string; limit?: number }
) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  return client.action("improvements/search:findSimilar" as any, {
    description: input.query,
    limit: input.limit ?? 5,
  });
}

/**
 * Get a single improvement request by ID
 */
export async function getImprovement(client: HolocronConvexClient, input: { id: string }) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and ID type
  return client.query("improvements/queries:get" as any, { id: input.id as any });
}

/**
 * List improvement requests with optional status filter
 */
export async function listImprovements(
  client: HolocronConvexClient,
  input: { status?: string; limit?: number }
) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
  return client.query("improvements/queries:list" as any, {
    ...(input.status && { status: input.status }),
    limit: input.limit ?? 20,
  });
}

/**
 * Add one or more improvement requests
 */
export async function addImprovement(
  client: HolocronConvexClient,
  input: { items: Array<{ description: string; sourceScreen?: string }> }
) {
  const results: string[] = [];

  for (const item of input.items) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference
    const id = await client.mutation("improvements/mutations:submit" as any, {
      description: item.description,
      sourceScreen: item.sourceScreen ?? "mcp",
    });
    results.push(id as string);
  }

  return { created: results.length, ids: results };
}

/**
 * Close an improvement request with optional reason + evidence.
 * Convenience wrapper over setStatus for the common "this is done" case.
 */
export async function closeImprovement(
  client: HolocronConvexClient,
  input: { id: string; reason?: string; evidence?: string[] }
) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and ID type
  await client.mutation("improvements/mutations:setStatus" as any, {
    id: input.id as any,
    status: "closed",
    reason: input.reason,
    evidence: input.evidence,
  });
  return { id: input.id, status: "closed" as const };
}

/**
 * Set the status of an improvement request to open or closed.
 * When reopening, closure metadata is cleared.
 */
export async function setImprovementStatus(
  client: HolocronConvexClient,
  input: { id: string; status: "open" | "closed"; reason?: string; evidence?: string[] }
) {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic Convex function reference and ID type
  await client.mutation("improvements/mutations:setStatus" as any, {
    id: input.id as any,
    status: input.status,
    reason: input.reason,
    evidence: input.evidence,
  });
  return { id: input.id, status: input.status };
}
