/**
 * What's New tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface GetWhatsNewInput {
  forceRefresh?: boolean;
}

export async function getWhatsNewReport(
  client: PlatformMcpClient,
  input: GetWhatsNewInput = {}
): Promise<unknown> {
  return client.callTool("get_whats_new_report", {
    ...(input.forceRefresh !== undefined && { forceRefresh: input.forceRefresh }),
  });
}

export async function listWhatsNewReports(
  client: PlatformMcpClient,
  limit?: number
): Promise<unknown> {
  return client.callTool("list_whats_new_reports", {
    ...(limit !== undefined && { limit }),
  });
}
