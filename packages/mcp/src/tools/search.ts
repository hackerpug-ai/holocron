/**
 * Search tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface SearchFtsInput {
  query: string;
  limit?: number;
}

export interface SearchVectorInput {
  embedding?: number[];
  query?: string;
  limit?: number;
}

export async function searchFts(
  client: PlatformMcpClient,
  input: SearchFtsInput
): Promise<unknown> {
  return client.callTool("search_fts", {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}

export async function searchVector(
  client: PlatformMcpClient,
  input: SearchVectorInput
): Promise<unknown> {
  return client.callTool("search_vector", {
    ...(input.embedding !== undefined && { embedding: input.embedding }),
    ...(input.query !== undefined && { query: input.query }),
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}
