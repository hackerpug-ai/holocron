/**
 * Shared Tool + Zod schema registry (service-2).
 *
 * ONE registration per tool. Agents, workflows, and the MCP gateway all
 * consume the same Zod instances via getToolSchema / getSchemaFor{Agent,Workflow,Mcp}.
 *
 * Execute bodies dispatch to the shared Postgres MCP executor (S31-05).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTool, type ToolExecutionContext } from '@mastra/core/tools';
import type { z } from 'zod';
import { executePostgresMcpTool } from '../mcp/executor.ts';
import * as S from './schemas/index.ts';

// ── types ────────────────────────────────────────────────────────────

export type ZodSchema = z.ZodType;

export interface ToolSchemas {
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
}

export interface ToolListRow {
  id: string;
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  /** Schema shape property counts for CLI/probe consumers. */
  inputPropertyCount: number;
  outputPropertyCount: number;
}

export interface RegisteredTool {
  id: string;
  description: string;
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  /** Mastra createTool instance (execute → Postgres executor). */
  tool: ReturnType<typeof createTool>;
}

export interface NoDupValidationReport {
  ok: boolean;
  duplicates: number;
  sites: string[];
  scanned: string[];
}

// ── human-gate aliases (AC probe wording) ────────────────────────────
// Canonical MCP ids remain snake_case; aliases map human-gate names.

const TOOL_ID_ALIASES: Record<string, string> = {
  search: 'hybrid_search',
  searchTool: 'search_tools',
  searchtool: 'search_tools',
  // Chat specialist grants (S31-04) — convex-facing ids → Postgres registry ids
  search_knowledge_base: 'hybrid_search',
  browse_category: 'list_documents',
  knowledge_base_stats: 'list_documents',
  shop_search: 'shop_products',
  quick_research: 'search_research',
  deep_research: 'get_research_session',
  answer_question: 'search_research',
  find_recommendations: 'findRecommendations',
  subscribe: 'add_subscription',
  unsubscribe: 'remove_subscription',
  whats_new: 'get_whats_new_report',
  save_document: 'store_document',
  assimilate: 'start_assimilation',
  create_plan: 'list_tools',
};

export function resolveToolId(toolId: string): string {
  return TOOL_ID_ALIASES[toolId] ?? TOOL_ID_ALIASES[toolId.toLowerCase()] ?? toolId;
}

// ── execute → shared Postgres MCP executor ───────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createPostgresExecute(toolId: string) {
  return async (inputData: unknown, context?: ToolExecutionContext): Promise<unknown> => {
    if (!isRecord(inputData)) {
      throw new Error(`INVALID_ARGUMENT: tool '${toolId}' input must be an object`);
    }
    return executePostgresMcpTool(toolId, inputData, {
      signal: context?.abortSignal,
    });
  };
}

function countProps(schema: ZodSchema): number {
  const s = schema as {
    shape?: Record<string, unknown>;
    def?: { shape?: Record<string, unknown> };
    _def?: { shape?: Record<string, unknown> };
  };
  const shape = s.shape ?? s.def?.shape ?? s._def?.shape;
  if (shape && typeof shape === 'object') return Object.keys(shape).length;
  return 0;
}

function register(
  id: string,
  description: string,
  inputSchema: ZodSchema,
  outputSchema: ZodSchema
): RegisteredTool {
  const tool = createTool({
    id,
    description,
    inputSchema,
    outputSchema,
    execute: createPostgresExecute(id),
  });
  return { id, description, inputSchema, outputSchema, tool };
}

// ── the ONE registry (MCP-compat tools) ───────────────────────────

const ENTRIES: RegisteredTool[] = [
  // Research
  register(
    'get_research_session',
    'Retrieve a research session by ID with full findings and confidence stats',
    S.getResearchSessionInputSchema,
    S.getResearchSessionOutputSchema
  ),
  register(
    'search_research',
    'Search research sessions by topic/query',
    S.searchResearchInputSchema,
    S.searchResearchOutputSchema
  ),
  // Search
  register(
    'search_fts',
    'Full-text search (FTS5) across documents',
    S.searchFtsInputSchema,
    S.searchFtsOutputSchema
  ),
  register(
    'search_vector',
    'Vector semantic search using a pre-computed embedding',
    S.searchVectorInputSchema,
    S.searchVectorOutputSchema
  ),
  register(
    'hybrid_search',
    'Intelligent hybrid search combining keyword and semantic search',
    S.hybridSearchInputSchema,
    S.hybridSearchOutputSchema
  ),
  // Documents
  register(
    'store_document',
    'Store a document with optional metadata and embedding generation',
    S.storeDocumentInputSchema,
    S.storeDocumentOutputSchema
  ),
  register(
    'update_document',
    'Update an existing document',
    S.updateDocumentInputSchema,
    S.updateDocumentOutputSchema
  ),
  register(
    'share_document',
    'Share a document at https://docs.holocrnlib.com/d/<token>. Returns shareUrl. Revoke with unshare_document.',
    S.shareDocumentInputSchema,
    S.shareDocumentOutputSchema
  ),
  register(
    'unshare_document',
    'Revoke a public document share link. The public reader 404s after the ~60s edge cache.',
    S.unshareDocumentInputSchema,
    S.unshareDocumentOutputSchema
  ),
  register(
    'get_document',
    'Retrieve a document by ID',
    S.getDocumentInputSchema,
    S.getDocumentOutputSchema
  ),
  register(
    'list_documents',
    'List documents with pagination',
    S.listDocumentsInputSchema,
    S.listDocumentsOutputSchema
  ),
  // Subscriptions
  register(
    'add_subscription',
    'Add a new subscription source',
    S.addSubscriptionInputSchema,
    S.addSubscriptionOutputSchema
  ),
  register(
    'remove_subscription',
    'Remove a subscription by ID',
    S.removeSubscriptionInputSchema,
    S.removeSubscriptionOutputSchema
  ),
  register(
    'list_subscriptions',
    'List subscriptions with optional filters',
    S.listSubscriptionsInputSchema,
    S.listSubscriptionsOutputSchema
  ),
  register(
    'check_subscriptions',
    'Check subscriptions for new content',
    S.checkSubscriptionsInputSchema,
    S.checkSubscriptionsOutputSchema
  ),
  register(
    'get_subscription_content',
    'Get content items for a subscription',
    S.getSubscriptionContentInputSchema,
    S.getSubscriptionContentOutputSchema
  ),
  register(
    'set_subscription_filter',
    'Set a filter rule on a subscription source',
    S.setSubscriptionFilterInputSchema,
    S.setSubscriptionFilterOutputSchema
  ),
  register(
    'get_subscription_filters',
    'Get filter rules for a subscription',
    S.getSubscriptionFiltersInputSchema,
    S.getSubscriptionFiltersOutputSchema
  ),
  // Toolbelt
  register(
    'store_tool',
    'Store a tool/library entry in the toolbelt',
    S.storeToolInputSchema,
    S.storeToolOutputSchema
  ),
  register(
    'search_tools',
    'Search toolbelt entries',
    S.searchToolsInputSchema,
    S.searchToolsOutputSchema
  ),
  register('get_tool', 'Get a toolbelt entry by ID', S.getToolInputSchema, S.getToolOutputSchema),
  register(
    'list_tools',
    'List toolbelt entries with optional filters',
    S.listToolsInputSchema,
    S.listToolsOutputSchema
  ),
  register(
    'update_tool',
    'Update a toolbelt entry',
    S.updateToolInputSchema,
    S.updateToolOutputSchema
  ),
  register(
    'remove_tool',
    'Remove a toolbelt entry',
    S.removeToolInputSchema,
    S.removeToolOutputSchema
  ),
  // Shop
  register(
    'shop_products',
    'Search shop products across retailers',
    S.shopProductsInputSchema,
    S.shopProductsOutputSchema
  ),
  register(
    'get_shop_session',
    'Get a shop search session by ID',
    S.getShopSessionInputSchema,
    S.getShopSessionOutputSchema
  ),
  register(
    'get_shop_listings',
    'Get listings for a shop session',
    S.getShopListingsInputSchema,
    S.getShopListingsOutputSchema
  ),
  // What's New
  register(
    'get_whats_new_report',
    "Get today's What's New report",
    S.getWhatsNewReportInputSchema,
    S.getWhatsNewReportOutputSchema
  ),
  register(
    'list_whats_new_reports',
    "List historical What's New reports",
    S.listWhatsNewReportsInputSchema,
    S.listWhatsNewReportsOutputSchema
  ),
  // Assimilation
  register(
    'start_assimilation',
    'Start a repository assimilation session',
    S.startAssimilationInputSchema,
    S.startAssimilationOutputSchema
  ),
  register(
    'approve_assimilation_plan',
    'Approve an assimilation plan',
    S.assimilationSessionIdInputSchema,
    S.approveAssimilationPlanOutputSchema
  ),
  register(
    'reject_assimilation_plan',
    'Reject an assimilation plan with optional feedback',
    S.rejectAssimilationPlanInputSchema,
    S.rejectAssimilationPlanOutputSchema
  ),
  register(
    'get_assimilation_status',
    'Get assimilation session status',
    S.assimilationSessionIdInputSchema,
    S.getAssimilationStatusOutputSchema
  ),
  register(
    'cancel_assimilation',
    'Cancel an assimilation session',
    S.assimilationSessionIdInputSchema,
    S.cancelAssimilationOutputSchema
  ),
  register(
    'steer_assimilation',
    'Inject a steering note into an assimilation session',
    S.steerAssimilationInputSchema,
    S.steerAssimilationOutputSchema
  ),
  // Creators
  register(
    'assimilate_creator',
    'Assimilate a creator profile (transcripts + document)',
    S.assimilateCreatorInputSchema,
    S.assimilateCreatorOutputSchema
  ),
  register(
    'get_creator_transcripts',
    'Get transcripts for a creator profile',
    S.getCreatorTranscriptsInputSchema,
    S.getCreatorTranscriptsOutputSchema
  ),
  register(
    'regenerate_transcript',
    'Regenerate a single video transcript',
    S.regenerateTranscriptInputSchema,
    S.regenerateTranscriptOutputSchema
  ),
  // Improvements
  register(
    'search_improvements',
    'Search improvement requests',
    S.searchImprovementsInputSchema,
    S.searchImprovementsOutputSchema
  ),
  register(
    'get_improvement',
    'Get an improvement request by ID',
    S.getImprovementInputSchema,
    S.getImprovementOutputSchema
  ),
  register(
    'list_improvements',
    'List improvement requests',
    S.listImprovementsInputSchema,
    S.listImprovementsOutputSchema
  ),
  register(
    'add_improvement',
    'Add one or more improvement requests',
    S.addImprovementInputSchema,
    S.addImprovementOutputSchema
  ),
  register(
    'close_improvement',
    'Close an improvement request',
    S.closeImprovementInputSchema,
    S.closeImprovementOutputSchema
  ),
  register(
    'set_improvement_status',
    'Set improvement request status (open/closed)',
    S.setImprovementStatusInputSchema,
    S.setImprovementStatusOutputSchema
  ),
  // Recommendations
  register(
    'findRecommendations',
    'Find recommendations for a query',
    S.findRecommendationsInputSchema,
    S.findRecommendationsOutputSchema
  ),
];

const BY_ID = new Map<string, RegisteredTool>(ENTRIES.map((e) => [e.id, e]));

// ── public API ───────────────────────────────────────────────────────

/** Return the schema pair for a tool (canonical id or human-gate alias). */
export function getToolSchema(toolId: string): ToolSchemas {
  const id = resolveToolId(toolId);
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(`unknown tool: ${toolId} (resolved: ${id})`);
  }
  return { inputSchema: entry.inputSchema, outputSchema: entry.outputSchema };
}

/** Full registered tool (including Mastra createTool instance). */
export function getTool(toolId: string): RegisteredTool {
  const id = resolveToolId(toolId);
  const entry = BY_ID.get(id);
  if (!entry) {
    throw new Error(`unknown tool: ${toolId} (resolved: ${id})`);
  }
  return entry;
}

/** List all registered tools with schema refs (same instances as getToolSchema). */
export function listTools(): ToolListRow[] {
  return ENTRIES.map((e) => ({
    id: e.id,
    description: e.description,
    inputSchema: e.inputSchema,
    outputSchema: e.outputSchema,
    inputPropertyCount: countProps(e.inputSchema),
    outputPropertyCount: countProps(e.outputSchema),
  }));
}

/**
 * Consumer path helpers — MUST return the same Zod instance as getToolSchema.
 * These are the agent / workflow / MCP import seams (AC-2 === identity).
 */
export function getSchemaForAgent(toolId: string): ToolSchemas {
  return getToolSchema(toolId);
}

export function getSchemaForWorkflow(toolId: string): ToolSchemas {
  return getToolSchema(toolId);
}

export function getSchemaForMcp(toolId: string): ToolSchemas {
  return getToolSchema(toolId);
}

/** Convenience: all three paths for identity proofs. */
export function getSchemasForAllConsumers(toolId: string): {
  agent: ToolSchemas;
  workflow: ToolSchemas;
  mcp: ToolSchemas;
  identity: boolean;
} {
  const agent = getSchemaForAgent(toolId);
  const workflow = getSchemaForWorkflow(toolId);
  const mcp = getSchemaForMcp(toolId);
  const identity =
    agent.inputSchema === workflow.inputSchema &&
    workflow.inputSchema === mcp.inputSchema &&
    agent.outputSchema === workflow.outputSchema &&
    workflow.outputSchema === mcp.outputSchema;
  return { agent, workflow, mcp, identity };
}

/**
 * Probe schema shapes as JSON-friendly descriptors (for holo registry:probe).
 * Does not clone Zod instances — only describes them.
 */
export function probeToolSchema(toolId: string): {
  id: string;
  resolvedId: string;
  description: string;
  inputSchema: {
    type: string;
    propertyCount: number;
    properties: string[];
    schemaRef: 'shared';
  };
  outputSchema: {
    type: string;
    propertyCount: number;
    properties: string[];
    schemaRef: 'shared';
  };
} {
  const resolvedId = resolveToolId(toolId);
  const entry = getTool(toolId);
  return {
    id: toolId,
    resolvedId,
    description: entry.description,
    inputSchema: describeSchema(entry.inputSchema),
    outputSchema: describeSchema(entry.outputSchema),
  };
}

function describeSchema(schema: ZodSchema): {
  type: string;
  propertyCount: number;
  properties: string[];
  schemaRef: 'shared';
} {
  const s = schema as {
    shape?: Record<string, unknown>;
    def?: { type?: string; shape?: Record<string, unknown> };
    _def?: { typeName?: string; shape?: Record<string, unknown> };
    constructor?: { name?: string };
  };
  const shape = s.shape ?? s.def?.shape ?? s._def?.shape;
  const properties = shape && typeof shape === 'object' ? Object.keys(shape) : [];
  const type = s.def?.type ?? s._def?.typeName ?? s.constructor?.name ?? 'unknown';
  return {
    type: String(type),
    propertyCount: properties.length,
    properties,
    schemaRef: 'shared',
  };
}

/**
 * Audit: zero Zod .parse / .safeParse outside the registry under platform src.
 * Scans mcp/ (required) and tools/ excluding registry.ts itself.
 */
export function auditNoDupValidation(opts?: { roots?: string[] }): NoDupValidationReport {
  const here = dirname(fileURLToPath(import.meta.url));
  const platformSrc = resolve(here, '..');
  const roots = opts?.roots ?? [join(platformSrc, 'mcp'), join(platformSrc, 'tools')];
  const sites: string[] = [];
  const scanned: string[] = [];

  for (const root of roots) {
    for (const file of walkTs(root)) {
      // Registry is the allowed single parse site (if any helpers land here).
      if (file.endsWith(`${join('tools', 'registry.ts')}`) || file.endsWith('/tools/registry.ts')) {
        scanned.push(file);
        continue;
      }
      if (file.includes('__tests__') || file.includes('.test.')) continue;
      scanned.push(file);
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        if (/\bJSON\s*\.\s*parse\s*\(/.test(line)) continue;
        if (/\bparseYaml\b/.test(line) || /parse\s+as\s+parseYaml/.test(line)) continue;
        // Zod-style: .parse( / .safeParse( not preceded by JSON
        if (
          /(?<![A-Za-z0-9_])\.(safeParse|parse)\s*\(/.test(line) &&
          !/\bJSON\s*\.\s*parse/.test(line)
        ) {
          // Heuristic: YAML `parse as parseYaml` already skipped; skip bare `parse(` imports
          if (/from\s+['"]yaml['"]/.test(line)) continue;
          sites.push(`${file}:${i + 1}:${trimmed}`);
        }
      }
    }
  }

  return {
    ok: sites.length === 0,
    duplicates: sites.length,
    sites,
    scanned,
  };
}

function walkTs(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walkTs(p));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

/** Map of id → createTool for Mastra agent/workflow wiring. */
export function toolsAsRecord(): Record<string, RegisteredTool['tool']> {
  const out: Record<string, RegisteredTool['tool']> = {};
  for (const e of ENTRIES) {
    out[e.id] = e.tool;
  }
  return out;
}

/** Total registered tools (should be ≥44). */
export function toolCount(): number {
  return ENTRIES.length;
}
