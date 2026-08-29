/**
 * Research session tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface GetResearchSessionInput {
  sessionId: string;
}

export interface SearchResearchInput {
  query: string;
  limit?: number;
}

export async function getResearchSession(
  client: PlatformMcpClient,
  input: GetResearchSessionInput
): Promise<unknown> {
  return client.callTool("get_research_session", { sessionId: input.sessionId });
}

export async function searchResearch(
  client: PlatformMcpClient,
  input: SearchResearchInput
): Promise<unknown> {
  return client.callTool("search_research", {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}
