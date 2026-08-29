/**
 * Hybrid search — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface HybridSearchInput {
  query: string;
  limit?: number;
  category?: string;
}

export async function hybridSearch(
  client: PlatformMcpClient,
  input: HybridSearchInput
): Promise<unknown> {
  return client.callTool("hybrid_search", {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
    ...(input.category !== undefined && { category: input.category }),
  });
}
