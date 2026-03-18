/**
 * Toolbelt tools for Holocron MCP
 * Implements storeTool, searchTools, getTool, listTools, updateTool, removeTool
 */

import type { HolocronConvexClient } from "../convex/client.ts";
import type { SearchResult } from "../convex/types.ts";

// ============================================================================
// Types
// ============================================================================

export interface StoreToolInput {
  title: string;
  description?: string;
  content?: string;
  sourceUrl?: string;
  sourceType: "github" | "npm" | "pypi" | "website" | "cargo" | "go" | "other";
  category: "libraries" | "cli" | "framework" | "service" | "database" | "tool";
  status?: "complete" | "draft" | "archived";
  tags?: string[];
  useCases?: string[];
  keywords?: string[];
  language?: string;
  date?: string;
  time?: string;
  metadata?: Record<string, unknown>;
}

export interface StoreToolOutput {
  toolId: string;
  title: string;
  embeddingStatus: "completed" | "pending" | "failed";
  embeddingDimensions?: number;
}

export interface SearchToolsInput {
  query: string;
  limit?: number;
  category?: string;
}

export interface ToolResult {
  _id: string;
  title: string;
  description?: string;
  content?: string;
  sourceUrl?: string;
  sourceType: string;
  category: string;
  status: string;
  tags?: string[];
  useCases?: string[];
  keywords?: string[];
  language?: string;
  date?: string;
  time?: string;
  score?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SearchToolsOutput {
  results: ToolResult[];
  totalResults: number;
  searchMethod: "hybrid" | "fts_only" | "vector_only";
}

export interface GetToolInput {
  toolId: string;
}

export interface ListToolsInput {
  limit?: number;
  category?: string;
  status?: string;
  sourceType?: string;
}

export interface ListToolsOutput {
  tools: ToolResult[];
  total: number;
}

export interface UpdateToolInput {
  toolId: string;
  title?: string;
  description?: string;
  content?: string;
  sourceUrl?: string;
  sourceType?: "github" | "npm" | "pypi" | "website" | "cargo" | "go" | "other";
  category?: "libraries" | "cli" | "framework" | "service" | "database" | "tool";
  status?: "complete" | "draft" | "archived";
  tags?: string[];
  useCases?: string[];
  keywords?: string[];
  language?: string;
  date?: string;
  time?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateToolOutput {
  toolId: string;
  updated: boolean;
  embeddingStatus: "completed" | "pending" | "failed";
  embeddingRegenerated?: boolean;
  embeddingDimensions?: number;
}

export interface RemoveToolInput {
  toolId: string;
}

export interface RemoveToolOutput {
  deleted: boolean;
  toolId: string;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Store a new tool with auto-embedding
 */
export async function storeTool(
  client: HolocronConvexClient,
  input: StoreToolInput
): Promise<StoreToolOutput> {
  const result = await client.action("toolbelt/storage:createWithEmbedding", {
    title: input.title,
    description: input.description,
    content: input.content,
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    category: input.category,
    status: input.status ?? "draft",
    tags: input.tags,
    useCases: input.useCases,
    keywords: input.keywords,
    language: input.language,
    date: input.date,
    time: input.time,
  });

  return {
    toolId: result.toolId,
    title: input.title,
    embeddingStatus: result.embeddingStatus,
    embeddingDimensions: result.embeddingDimensions,
  };
}

/**
 * Search tools using hybrid search (vector + FTS)
 */
export async function searchTools(
  client: HolocronConvexClient,
  input: SearchToolsInput
): Promise<SearchToolsOutput> {
  const results = await client.action("toolbelt/search:hybridSearch", {
    query: input.query,
    limit: input.limit ?? 10,
    category: input.category,
  });

  const toolResults: ToolResult[] = results.map((tool: any) => ({
    _id: tool._id,
    title: tool.title,
    description: tool.description,
    content: tool.content,
    sourceUrl: tool.sourceUrl,
    sourceType: tool.sourceType,
    category: tool.category,
    status: tool.status,
    tags: tool.tags,
    useCases: tool.useCases,
    keywords: tool.keywords,
    language: tool.language,
    date: tool.date,
    time: tool.time,
    score: tool.score,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  }));

  return {
    results: toolResults,
    totalResults: toolResults.length,
    searchMethod: "hybrid",
  };
}

/**
 * Get a tool by ID
 */
export async function getTool(
  client: HolocronConvexClient,
  input: GetToolInput
): Promise<ToolResult | null> {
  const tool = await client.query("toolbelt/queries:get", {
    id: input.toolId,
  });

  if (!tool) {
    return null;
  }

  return {
    _id: tool._id,
    title: tool.title,
    description: tool.description,
    content: tool.content,
    sourceUrl: tool.sourceUrl,
    sourceType: tool.sourceType,
    category: tool.category,
    status: tool.status,
    tags: tool.tags,
    useCases: tool.useCases,
    keywords: tool.keywords,
    language: tool.language,
    date: tool.date,
    time: tool.time,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  };
}

/**
 * List tools with optional filters
 */
export async function listTools(
  client: HolocronConvexClient,
  input: ListToolsInput = {}
): Promise<ListToolsOutput> {
  const tools = await client.query("toolbelt/queries:list", {
    limit: input.limit ?? 50,
    category: input.category,
    status: input.status,
    sourceType: input.sourceType,
  });

  const toolResults: ToolResult[] = tools.map((tool: any) => ({
    _id: tool._id,
    title: tool.title,
    description: tool.description,
    content: tool.content,
    sourceUrl: tool.sourceUrl,
    sourceType: tool.sourceType,
    category: tool.category,
    status: tool.status,
    tags: tool.tags,
    useCases: tool.useCases,
    keywords: tool.keywords,
    language: tool.language,
    date: tool.date,
    time: tool.time,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
  }));

  return {
    tools: toolResults,
    total: toolResults.length,
  };
}

/**
 * Update a tool with auto-embedding regeneration
 */
export async function updateTool(
  client: HolocronConvexClient,
  input: UpdateToolInput
): Promise<UpdateToolOutput> {
  const { toolId, ...updates } = input;

  const result = await client.action("toolbelt/storage:updateWithEmbedding", {
    id: toolId,
    ...updates,
  });

  return {
    toolId: result.toolId,
    updated: result.updated,
    embeddingStatus: result.embeddingStatus,
    embeddingRegenerated: result.embeddingRegenerated,
    embeddingDimensions: result.embeddingDimensions,
  };
}

/**
 * Remove a tool
 */
export async function removeTool(
  client: HolocronConvexClient,
  input: RemoveToolInput
): Promise<RemoveToolOutput> {
  const result = await client.mutation("toolbelt/mutations:remove", {
    id: input.toolId,
  });

  return {
    deleted: result.deleted,
    toolId: result.id,
  };
}
