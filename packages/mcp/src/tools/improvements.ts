/**
 * Improvement request tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export async function searchImprovements(
  client: PlatformMcpClient,
  input: { query: string; limit?: number }
): Promise<unknown> {
  return client.callTool("search_improvements", {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}

export async function getImprovement(
  client: PlatformMcpClient,
  input: { id: string }
): Promise<unknown> {
  return client.callTool("get_improvement", { id: input.id });
}

export async function listImprovements(
  client: PlatformMcpClient,
  input: { status?: string; limit?: number }
): Promise<unknown> {
  return client.callTool("list_improvements", {
    ...(input.status !== undefined && { status: input.status }),
    ...(input.limit !== undefined && { limit: input.limit }),
  });
}

export async function addImprovement(
  client: PlatformMcpClient,
  input: { items: Array<{ description: string; sourceScreen?: string }> }
): Promise<unknown> {
  return client.callTool("add_improvement", { items: input.items });
}

export async function closeImprovement(
  client: PlatformMcpClient,
  input: { id: string; reason?: string; evidence?: string[] }
): Promise<unknown> {
  return client.callTool("close_improvement", {
    id: input.id,
    ...(input.reason !== undefined && { reason: input.reason }),
    ...(input.evidence !== undefined && { evidence: input.evidence }),
  });
}

export async function setImprovementStatus(
  client: PlatformMcpClient,
  input: { id: string; status: string }
): Promise<unknown> {
  return client.callTool("set_improvement_status", {
    id: input.id,
    status: input.status,
  });
}
