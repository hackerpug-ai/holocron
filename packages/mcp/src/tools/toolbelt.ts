/**
 * Toolbelt tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface StoreToolInput {
  title: string;
  description?: string;
  content?: string;
  sourceUrl?: string;
  sourceType?: string;
  category?: string;
  status?: string;
  tags?: string[];
  useCases?: string[];
  keywords?: string[];
  language?: string;
  date?: string;
  time?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchToolsInput {
  query: string;
  limit?: number;
  category?: string;
}

export interface GetToolInput {
  toolId: string;
}

export interface ListToolsInput {
  limit?: number;
  category?: string;
  status?: string;
}

export interface UpdateToolInput {
  toolId: string;
  title?: string;
  description?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface RemoveToolInput {
  toolId: string;
}

export async function storeTool(
  client: PlatformMcpClient,
  input: StoreToolInput
): Promise<unknown> {
  return client.callTool("store_tool", { ...input });
}

export async function searchTools(
  client: PlatformMcpClient,
  input: SearchToolsInput
): Promise<unknown> {
  return client.callTool("search_tools", {
    query: input.query,
    ...(input.limit !== undefined && { limit: input.limit }),
    ...(input.category !== undefined && { category: input.category }),
  });
}

export async function getTool(client: PlatformMcpClient, input: GetToolInput): Promise<unknown> {
  return client.callTool("get_tool", { toolId: input.toolId });
}

export async function listTools(
  client: PlatformMcpClient,
  input: ListToolsInput
): Promise<unknown> {
  return client.callTool("list_tools", {
    ...(input.limit !== undefined && { limit: input.limit }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.status !== undefined && { status: input.status }),
  });
}

export async function updateTool(
  client: PlatformMcpClient,
  input: UpdateToolInput
): Promise<unknown> {
  return client.callTool("update_tool", { ...input });
}

export async function removeTool(
  client: PlatformMcpClient,
  input: RemoveToolInput
): Promise<unknown> {
  return client.callTool("remove_tool", { toolId: input.toolId });
}
