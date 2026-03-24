/**
 * Holocron MCP Server - Mastra/Bun implementation
 * Unified MCP server with Convex realtime streaming
 */

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTool } from "@mastra/core/tools";
import { MCPServer } from "@mastra/mcp";
import { holocronClient } from "../convex/client.ts";
import { formatError } from "../streaming/formatter.ts";
import { subscriptionManager } from "../streaming/subscription-manager.ts";

// Setup file logging
const LOG_FILE = resolve("/tmp/holocron-mcp.log");
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
  console.error(message);
}

log("=== Holocron MCP Server Starting ===");
log(`Node version: ${process.version}`);
log(`Process argv: ${JSON.stringify(process.argv)}`);
log(`Working directory: ${process.cwd()}`);
log(`Environment variables:`);
log(`  HOLOCRON_URL: ${process.env.HOLOCRON_URL || "NOT SET"}`);
log(
  `  HOLOCRON_DEPLOY_KEY: ${process.env.HOLOCRON_DEPLOY_KEY ? `SET (length: ${process.env.HOLOCRON_DEPLOY_KEY.length})` : "NOT SET"}`
);
log(
  `  HOLOCRON_OPENAI_API_KEY: ${process.env.HOLOCRON_OPENAI_API_KEY ? `SET (length: ${process.env.HOLOCRON_OPENAI_API_KEY.length})` : "NOT SET"}`
);

import { z } from "zod";
// Validation schemas
import {
  AddSubscriptionSchema,
  CheckSubscriptionsSchema,
  DocumentIdSchema,
  GetSubscriptionContentSchema,
  GetSubscriptionFiltersSchema,
  GetToolSchema,
  GetShopSessionSchema,
  GetShopListingsSchema,
  GetWhatsNewSchema,
  ListSubscriptionsSchema,
  ListToolsSchema,
  ListWhatsNewReportsSchema,
  RemoveSubscriptionSchema,
  RemoveToolSchema,
  ResearchTopicSchema,
  SearchSchema,
  SearchToolsSchema,
  SearchVectorSchema,
  SessionIdSchema,
  SetSubscriptionFilterSchema,
  ShopProductsSchema,
  SimpleResearchSchema,
  ShareDocumentSchema,
  StoreDocumentSchema,
  StoreToolSchema,
  UpdateDocumentSchema,
  UpdateToolSchema,
} from "../config/validation.ts";
import { hybridSearch } from "../tools/hybrid-search.ts";
// Tool implementations
import { researchTopic, simpleResearch } from "../tools/research.ts";
import { getDocument, listDocuments } from "../tools/retrieval.ts";
import { searchFts, searchVector } from "../tools/search.ts";
import { getResearchSession, searchResearch } from "../tools/session.ts";
import { shareDocument, storeDocument, updateDocument } from "../tools/storage.ts";
import {
  addSubscription,
  checkSubscriptions,
  getSubscriptionContent,
  getSubscriptionFilters,
  listSubscriptions,
  removeSubscription,
  setSubscriptionFilter,
} from "../tools/subscriptions.ts";
import {
  storeTool,
  searchTools,
  getTool,
  listTools,
  updateTool,
  removeTool,
} from "../tools/toolbelt.ts";
import {
  shopProducts,
  getShopSession,
  getShopListings,
} from "../tools/shop.ts";
import {
  getWhatsNewReport,
  listWhatsNewReports,
} from "../tools/whats-new.ts";

/**
 * Create Mastra MCP tools from existing implementations
 */

const researchTopicTool = createTool({
  id: "research_topic",
  description:
    "Start deep research on a topic with iterative refinement and streaming progress updates",
  inputSchema: ResearchTopicSchema,
  execute: async (input) => {
    try {
      return await researchTopic(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const simpleResearchTool = createTool({
  id: "simple_research",
  description: "Quick single-iteration research without streaming",
  inputSchema: SimpleResearchSchema,
  execute: async (input) => {
    try {
      return await simpleResearch(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getResearchSessionTool = createTool({
  id: "get_research_session",
  description: "Retrieve a research session by ID with full findings and confidence stats",
  inputSchema: SessionIdSchema,
  execute: async (input) => {
    try {
      return await getResearchSession(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const searchResearchTool = createTool({
  id: "search_research",
  description: "Search across all research sessions and findings",
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await searchResearch(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const searchFtsTool = createTool({
  id: "search_fts",
  description: "Full-text keyword search using SQLite FTS5",
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await searchFts(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const searchVectorTool = createTool({
  id: "search_vector",
  description: "Semantic vector search using embeddings",
  inputSchema: SearchVectorSchema,
  execute: async (input) => {
    try {
      return await searchVector(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const storeDocumentTool = createTool({
  id: "store_document",
  description: "Store a new document with automatic embedding generation",
  inputSchema: StoreDocumentSchema,
  execute: async (input) => {
    try {
      return await storeDocument(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const updateDocumentTool = createTool({
  id: "update_document",
  description: "Update an existing document with re-embedding",
  inputSchema: UpdateDocumentSchema,
  execute: async (input) => {
    try {
      return await updateDocument(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const shareDocumentTool = createTool({
  id: "share_document",
  description: "Publish or unpublish a document for public sharing via URL. Set isPublic=true to publish and get a shareable link, isPublic=false to retract.",
  inputSchema: ShareDocumentSchema,
  execute: async (input) => {
    try {
      return await shareDocument(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getDocumentTool = createTool({
  id: "get_document",
  description: "Retrieve a specific document by ID",
  inputSchema: DocumentIdSchema,
  execute: async (input) => {
    try {
      return await getDocument(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const listDocumentsTool = createTool({
  id: "list_documents",
  description: "List documents with pagination",
  inputSchema: z.object({
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      return await listDocuments(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const hybridSearchTool = createTool({
  id: "hybrid_search",
  description: "Intelligent hybrid search combining keyword and semantic search",
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await hybridSearch(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const addSubscriptionTool = createTool({
  id: "add_subscription",
  description:
    "Add a new subscription source (youtube, newsletter, changelog, reddit, ebay, whats-new)",
  inputSchema: AddSubscriptionSchema,
  execute: async (input) => {
    try {
      return await addSubscription(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const removeSubscriptionTool = createTool({
  id: "remove_subscription",
  description: "Remove a subscription source by ID",
  inputSchema: RemoveSubscriptionSchema,
  execute: async (input) => {
    try {
      return await removeSubscription(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const listSubscriptionsTool = createTool({
  id: "list_subscriptions",
  description: "List subscription sources with optional filtering by type and auto-research status",
  inputSchema: ListSubscriptionsSchema,
  execute: async (input) => {
    try {
      return await listSubscriptions(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const checkSubscriptionsTool = createTool({
  id: "check_subscriptions",
  description:
    "Check subscriptions for new content (fetches from sources and queues content for research)",
  inputSchema: CheckSubscriptionsSchema,
  execute: async (input) => {
    try {
      return await checkSubscriptions(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getSubscriptionContentTool = createTool({
  id: "get_subscription_content",
  description:
    "Get content items for a subscription source with optional research status filtering",
  inputSchema: GetSubscriptionContentSchema,
  execute: async (input) => {
    try {
      return await getSubscriptionContent(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const setSubscriptionFilterTool = createTool({
  id: "set_subscription_filter",
  description:
    "Set a filter rule for a subscription (keyword whitelist/blacklist, min score, max age, etc.)",
  inputSchema: SetSubscriptionFilterSchema,
  execute: async (input) => {
    try {
      return await setSubscriptionFilter(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getSubscriptionFiltersTool = createTool({
  id: "get_subscription_filters",
  description: "Get filter rules for subscriptions (by subscription ID or source type)",
  inputSchema: GetSubscriptionFiltersSchema,
  execute: async (input) => {
    try {
      return await getSubscriptionFilters(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

// Toolbelt tools
const storeToolTool = createTool({
  id: "store_tool",
  description: "Store a new tool with auto-embedding",
  inputSchema: StoreToolSchema,
  execute: async (input) => {
    try {
      return await storeTool(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const searchToolsTool = createTool({
  id: "search_tools",
  description: "Search tools using hybrid search (vector + full-text)",
  inputSchema: SearchToolsSchema,
  execute: async (input) => {
    try {
      return await searchTools(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getToolTool = createTool({
  id: "get_tool",
  description: "Get a tool by ID",
  inputSchema: GetToolSchema,
  execute: async (input) => {
    try {
      return await getTool(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const listToolsTool = createTool({
  id: "list_tools",
  description: "List tools with optional filters",
  inputSchema: ListToolsSchema,
  execute: async (input) => {
    try {
      return await listTools(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const updateToolTool = createTool({
  id: "update_tool",
  description: "Update a tool with auto-embedding regeneration",
  inputSchema: UpdateToolSchema,
  execute: async (input) => {
    try {
      return await updateTool(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const removeToolTool = createTool({
  id: "remove_tool",
  description: "Remove a tool by ID",
  inputSchema: RemoveToolSchema,
  execute: async (input) => {
    try {
      return await removeTool(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

// Shop tools
const shopProductsTool = createTool({
  id: "shop_products",
  description:
    "Search for products across multiple retailers (Amazon, eBay, Newegg, Best Buy). Returns listings with prices, deal scores, and links.",
  inputSchema: ShopProductsSchema,
  execute: async (input) => {
    try {
      return await shopProducts(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getShopSessionTool = createTool({
  id: "get_shop_session",
  description: "Retrieve a shop session by ID",
  inputSchema: GetShopSessionSchema,
  execute: async (input) => {
    try {
      return await getShopSession(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const getShopListingsTool = createTool({
  id: "get_shop_listings",
  description: "Get product listings for a shop session with sorting and filtering options",
  inputSchema: GetShopListingsSchema,
  execute: async (input) => {
    try {
      return await getShopListings(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

// What's New tools
const getWhatsNewReportTool = createTool({
  id: "get_whats_new_report",
  description:
    "Get the latest AI software engineering news briefing. Returns cached daily report with findings from Reddit, Hacker News, GitHub, Dev.to, and Lobsters.",
  inputSchema: GetWhatsNewSchema,
  execute: async (input) => {
    try {
      return await getWhatsNewReport(holocronClient, input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

const listWhatsNewReportsTool = createTool({
  id: "list_whats_new_reports",
  description: "List recent What's New reports with metadata",
  inputSchema: ListWhatsNewReportsSchema,
  execute: async (input) => {
    try {
      return await listWhatsNewReports(holocronClient, input.limit);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  },
});

/**
 * Initialize Mastra MCP server
 */
const server = new MCPServer({
  name: "holocron",
  version: "1.0.0",
  description: "Unified Holocron MCP server with Bun + Mastra + Convex streaming",
  tools: {
    researchTopicTool,
    simpleResearchTool,
    getResearchSessionTool,
    searchResearchTool,
    searchFtsTool,
    searchVectorTool,
    storeDocumentTool,
    updateDocumentTool,
    shareDocumentTool,
    getDocumentTool,
    listDocumentsTool,
    hybridSearchTool,
    addSubscriptionTool,
    removeSubscriptionTool,
    listSubscriptionsTool,
    checkSubscriptionsTool,
    getSubscriptionContentTool,
    setSubscriptionFilterTool,
    getSubscriptionFiltersTool,
    storeToolTool,
    searchToolsTool,
    getToolTool,
    listToolsTool,
    updateToolTool,
    removeToolTool,
    shopProductsTool,
    getShopSessionTool,
    getShopListingsTool,
    getWhatsNewReportTool,
    listWhatsNewReportsTool,
  },
});

/**
 * Graceful shutdown handler
 */
process.on("SIGINT", () => {
  log("[Shutdown] SIGINT received - cleaning up subscriptions...");
  subscriptionManager.cleanup();
  holocronClient.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("[Shutdown] SIGTERM received - cleaning up subscriptions...");
  subscriptionManager.cleanup();
  holocronClient.close();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  log(`[FATAL] Uncaught exception: ${error}`);
  log(`Stack: ${error.stack}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  log(`[FATAL] Unhandled rejection at: ${promise}`);
  log(`Reason: ${reason}`);
  process.exit(1);
});

/**
 * Start MCP server on stdio
 */
log("[Holocron MCP] Starting server...");
log(`[Holocron MCP] Tools registered: 29`);
log(`[Holocron MCP] Convex URL: ${process.env.CONVEX_URL || process.env.HOLOCRON_URL}`);

try {
  log("Attempting to start stdio transport...");
  await server.startStdio();
  log("Server started successfully!");
} catch (error) {
  log(`FATAL ERROR starting server: ${error}`);
  log(`Error stack: ${error instanceof Error ? error.stack : "no stack"}`);
  process.exit(1);
}
