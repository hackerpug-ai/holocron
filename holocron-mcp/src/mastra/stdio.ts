/**
 * Holocron MCP Server — stdio transport.
 * Tools execute via the platform Streamable HTTP /mcp gateway (S31-05).
 * Never write application logs to stdout — it is the JSON-RPC framing channel.
 */

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createTool } from "@mastra/core/tools";
import { MCPServer } from "@mastra/mcp";
import { z } from "zod";
import { env } from "../config/env.ts";
import { getPlatformClient } from "../platform/mcp-client.ts";
import { formatError } from "../streaming/formatter.ts";
import { subscriptionManager } from "../streaming/subscription-manager.ts";
import {
  approveAssimilationPlan,
  cancelAssimilation,
  getAssimilationStatus,
  rejectAssimilationPlan,
  startAssimilation,
  steerAssimilation,
} from "../tools/assimilation.ts";
import {
  assimilateCreator,
  getCreatorTranscripts,
  regenerateTranscript,
  transcribeVideoUrl,
} from "../tools/creators.ts";
import { hybridSearch } from "../tools/hybrid-search.ts";
import {
  addImprovement,
  closeImprovement,
  getImprovement,
  listImprovements,
  searchImprovements,
  setImprovementStatus,
} from "../tools/improvements.ts";
import { getDocument, listDocuments } from "../tools/retrieval.ts";
import { searchFts, searchVector } from "../tools/search.ts";
import { getResearchSession, searchResearch } from "../tools/session.ts";
import { getShopListings, getShopSession, shopProducts } from "../tools/shop.ts";
import {
  shareDocument,
  storeDocument,
  unshareDocument,
  updateDocument,
} from "../tools/storage.ts";
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
  getTool,
  listTools,
  removeTool,
  searchTools,
  storeTool,
  updateTool,
} from "../tools/toolbelt.ts";
import { getWhatsNewReport, listWhatsNewReports } from "../tools/whats-new.ts";

const LOG_FILE = resolve("/tmp/holocron-mcp.log");
const SHOULD_LOG_TO_STDERR =
  process.env.HOLOCRON_MCP_DEBUG === "1" || process.env.LOG_LEVEL === "debug";

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, logLine);
  } catch (e) {
    console.error("Failed to write to log file:", e);
  }
  if (SHOULD_LOG_TO_STDERR) {
    console.error(message);
  }
}

/** Loose object schema — platform gateway owns canonical Zod validation. */
const AnyObject = z.object({}).passthrough();

const platformClient = getPlatformClient();

log("=== Holocron MCP Server Starting (platform HTTP delegate) ===");
log(`Platform URL: ${env.PLATFORM_URL}`);
log(`HOLO_KEY_MCP: ${process.env.HOLO_KEY_MCP || process.env.MCP_API_KEY ? "SET" : "NOT SET"}`);

function wrapExecute<TIn extends Record<string, unknown>>(
  name: string,
  fn: (input: TIn) => Promise<unknown>
) {
  return async (input: TIn) => {
    try {
      return await fn(input);
    } catch (error) {
      console.error(formatError(error));
      throw error;
    }
  };
}

const getResearchSessionTool = createTool({
  id: "get_research_session",
  description: "Retrieve a research session by ID with full findings and confidence stats",
  inputSchema: AnyObject,
  execute: wrapExecute("get_research_session", (input) =>
    getResearchSession(platformClient, input as { sessionId: string })
  ),
});

const searchResearchTool = createTool({
  id: "search_research",
  description: "Search across all research sessions and findings",
  inputSchema: AnyObject,
  execute: wrapExecute("search_research", (input) =>
    searchResearch(platformClient, input as { query: string; limit?: number })
  ),
});

const deepResearchTool = createTool({
  id: "deep_research",
  description:
    "Start asynchronous deep research (depth/breadth/auto). Returns sessionId immediately; poll deep_research_result.",
  inputSchema: AnyObject,
  execute: wrapExecute("deep_research", (input) =>
    platformClient.callTool("deep_research", input as Record<string, unknown>)
  ),
});

const quickResearchTool = createTool({
  id: "quick_research",
  description:
    "Start asynchronous quick research. Returns sessionId immediately; poll deep_research_result.",
  inputSchema: AnyObject,
  execute: wrapExecute("quick_research", (input) =>
    platformClient.callTool("quick_research", input as Record<string, unknown>)
  ),
});

const deepResearchResultTool = createTool({
  id: "deep_research_result",
  description: "Read-only research session snapshot (status, progress, latest iteration, gate).",
  inputSchema: AnyObject,
  execute: wrapExecute("deep_research_result", (input) =>
    platformClient.callTool("deep_research_result", input as Record<string, unknown>)
  ),
});

const deepResearchControlTool = createTool({
  id: "deep_research_control",
  description: "Cancel or steer an in-flight research session (server-authoritative cancel latch).",
  inputSchema: AnyObject,
  execute: wrapExecute("deep_research_control", (input) =>
    platformClient.callTool("deep_research_control", input as Record<string, unknown>)
  ),
});

const searchFtsTool = createTool({
  id: "search_fts",
  description: "Full-text keyword search",
  inputSchema: AnyObject,
  execute: wrapExecute("search_fts", (input) =>
    searchFts(platformClient, input as { query: string; limit?: number })
  ),
});

const searchVectorTool = createTool({
  id: "search_vector",
  description: "Semantic vector search using embeddings",
  inputSchema: AnyObject,
  execute: wrapExecute("search_vector", (input) =>
    searchVector(platformClient, input as { embedding?: number[]; query?: string; limit?: number })
  ),
});

const storeDocumentTool = createTool({
  id: "store_document",
  description: "Store a new document with automatic embedding generation",
  inputSchema: AnyObject,
  execute: wrapExecute("store_document", (input) =>
    storeDocument(
      platformClient,
      input as { title: string; content: string; metadata?: Record<string, unknown> }
    )
  ),
});

const updateDocumentTool = createTool({
  id: "update_document",
  description: "Update an existing document with re-embedding",
  inputSchema: AnyObject,
  execute: wrapExecute("update_document", (input) =>
    updateDocument(
      platformClient,
      input as {
        documentId: string;
        title?: string;
        content?: string;
        metadata?: Record<string, unknown>;
      }
    )
  ),
});

const shareDocumentTool = createTool({
  id: "share_document",
  description:
    "Share a document at https://docs.holocrnlib.com/d/<token>. Returns shareUrl. Revoke with unshare_document.",
  inputSchema: AnyObject,
  execute: wrapExecute("share_document", (input) =>
    shareDocument(platformClient, input as { documentId: string; isPublic?: boolean })
  ),
});

const unshareDocumentTool = createTool({
  id: "unshare_document",
  description:
    "Revoke a public document share link. The public reader 404s after the ~60s edge cache.",
  inputSchema: AnyObject,
  execute: wrapExecute("unshare_document", (input) =>
    unshareDocument(platformClient, input as { documentId: string })
  ),
});

const getDocumentTool = createTool({
  id: "get_document",
  description: "Retrieve a specific document by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("get_document", (input) =>
    getDocument(platformClient, input as { documentId: string })
  ),
});

const listDocumentsTool = createTool({
  id: "list_documents",
  description: "List documents with pagination",
  inputSchema: AnyObject,
  execute: wrapExecute("list_documents", (input) =>
    listDocuments(platformClient, input as { limit?: number; cursor?: string })
  ),
});

const hybridSearchTool = createTool({
  id: "hybrid_search",
  description: "Intelligent hybrid search combining keyword and semantic search",
  inputSchema: AnyObject,
  execute: wrapExecute("hybrid_search", (input) =>
    hybridSearch(platformClient, input as { query: string; limit?: number; category?: string })
  ),
});

const addSubscriptionTool = createTool({
  id: "add_subscription",
  description: "Add a new subscription source",
  inputSchema: AnyObject,
  execute: wrapExecute("add_subscription", (input) =>
    addSubscription(
      platformClient,
      input as {
        sourceType: string;
        identifier: string;
        name?: string;
        url?: string;
        feedUrl?: string;
        configJson?: Record<string, unknown>;
      }
    )
  ),
});

const removeSubscriptionTool = createTool({
  id: "remove_subscription",
  description: "Remove a subscription source by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("remove_subscription", (input) =>
    removeSubscription(platformClient, input as { subscriptionId: string })
  ),
});

const listSubscriptionsTool = createTool({
  id: "list_subscriptions",
  description: "List subscription sources with optional filtering",
  inputSchema: AnyObject,
  execute: wrapExecute("list_subscriptions", (input) =>
    listSubscriptions(
      platformClient,
      input as { sourceType?: string; autoResearchOnly?: boolean }
    )
  ),
});

const checkSubscriptionsTool = createTool({
  id: "check_subscriptions",
  description: "Check subscriptions for new content",
  inputSchema: AnyObject,
  execute: wrapExecute("check_subscriptions", (input) =>
    checkSubscriptions(platformClient, input as { subscriptionId?: string })
  ),
});

const getSubscriptionContentTool = createTool({
  id: "get_subscription_content",
  description: "Get content items for a subscription source",
  inputSchema: AnyObject,
  execute: wrapExecute("get_subscription_content", (input) =>
    getSubscriptionContent(
      platformClient,
      input as { subscriptionId: string; limit?: number; status?: string }
    )
  ),
});

const setSubscriptionFilterTool = createTool({
  id: "set_subscription_filter",
  description: "Set a filter rule for a subscription",
  inputSchema: AnyObject,
  execute: wrapExecute("set_subscription_filter", (input) =>
    setSubscriptionFilter(
      platformClient,
      input as { subscriptionId: string; filterType: string; value: unknown }
    )
  ),
});

const getSubscriptionFiltersTool = createTool({
  id: "get_subscription_filters",
  description: "Get filter rules for subscriptions",
  inputSchema: AnyObject,
  execute: wrapExecute("get_subscription_filters", (input) =>
    getSubscriptionFilters(
      platformClient,
      input as { subscriptionId?: string; sourceType?: string }
    )
  ),
});

const storeToolTool = createTool({
  id: "store_tool",
  description: "Store a new tool with auto-embedding",
  inputSchema: AnyObject,
  execute: wrapExecute("store_tool", (input) =>
    storeTool(platformClient, input as { title: string })
  ),
});

const searchToolsTool = createTool({
  id: "search_tools",
  description: "Search tools using hybrid search",
  inputSchema: AnyObject,
  execute: wrapExecute("search_tools", (input) =>
    searchTools(platformClient, input as { query: string; limit?: number; category?: string })
  ),
});

const getToolTool = createTool({
  id: "get_tool",
  description: "Get a tool by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("get_tool", (input) =>
    getTool(platformClient, input as { toolId: string })
  ),
});

const listToolsTool = createTool({
  id: "list_tools",
  description: "List tools with optional filters",
  inputSchema: AnyObject,
  execute: wrapExecute("list_tools", (input) =>
    listTools(platformClient, input as { limit?: number; category?: string; status?: string })
  ),
});

const updateToolTool = createTool({
  id: "update_tool",
  description: "Update a tool with auto-embedding regeneration",
  inputSchema: AnyObject,
  execute: wrapExecute("update_tool", (input) =>
    updateTool(platformClient, input as { toolId: string })
  ),
});

const removeToolTool = createTool({
  id: "remove_tool",
  description: "Remove a tool by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("remove_tool", (input) =>
    removeTool(platformClient, input as { toolId: string })
  ),
});

const shopProductsTool = createTool({
  id: "shop_products",
  description: "Search for products across multiple retailers",
  inputSchema: AnyObject,
  execute: wrapExecute("shop_products", (input) =>
    shopProducts(platformClient, input as { query: string; retailers?: string[] })
  ),
});

const getShopSessionTool = createTool({
  id: "get_shop_session",
  description: "Retrieve a shop session by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("get_shop_session", (input) =>
    getShopSession(platformClient, input as { sessionId: string })
  ),
});

const getShopListingsTool = createTool({
  id: "get_shop_listings",
  description: "Get product listings for a shop session",
  inputSchema: AnyObject,
  execute: wrapExecute("get_shop_listings", (input) =>
    getShopListings(platformClient, input as { sessionId: string; limit?: number })
  ),
});

const getWhatsNewReportTool = createTool({
  id: "get_whats_new_report",
  description: "Get the latest AI software engineering news briefing",
  inputSchema: AnyObject,
  execute: wrapExecute("get_whats_new_report", (input) =>
    getWhatsNewReport(platformClient, input as { forceRefresh?: boolean })
  ),
});

const listWhatsNewReportsTool = createTool({
  id: "list_whats_new_reports",
  description: "List recent What's New reports with metadata",
  inputSchema: AnyObject,
  execute: wrapExecute("list_whats_new_reports", async (input) => {
    const limit =
      input && typeof input === "object" && "limit" in input
        ? Number((input as { limit?: number }).limit)
        : undefined;
    return listWhatsNewReports(platformClient, Number.isFinite(limit) ? limit : undefined);
  }),
});

const startAssimilationTool = createTool({
  id: "start_assimilation",
  description: "Start a new assimilation session to analyze a GitHub repository",
  inputSchema: AnyObject,
  execute: wrapExecute("start_assimilation", (input) =>
    startAssimilation(platformClient, input as { repositoryUrl: string })
  ),
});

const approveAssimilationPlanTool = createTool({
  id: "approve_assimilation_plan",
  description: "Approve the generated assimilation plan and start analysis",
  inputSchema: AnyObject,
  execute: wrapExecute("approve_assimilation_plan", async (input) => {
    await approveAssimilationPlan(platformClient, input as { sessionId: string });
    return { approved: true, sessionId: (input as { sessionId: string }).sessionId };
  }),
});

const rejectAssimilationPlanTool = createTool({
  id: "reject_assimilation_plan",
  description: "Reject the assimilation plan",
  inputSchema: AnyObject,
  execute: wrapExecute("reject_assimilation_plan", async (input) => {
    const typed = input as { sessionId: string; feedback?: string };
    await rejectAssimilationPlan(platformClient, typed);
    return { rejected: true, sessionId: typed.sessionId, replanning: !!typed.feedback };
  }),
});

const getAssimilationStatusTool = createTool({
  id: "get_assimilation_status",
  description: "Get the current status and progress of an assimilation session",
  inputSchema: AnyObject,
  execute: wrapExecute("get_assimilation_status", (input) =>
    getAssimilationStatus(platformClient, input as { sessionId: string })
  ),
});

const cancelAssimilationTool = createTool({
  id: "cancel_assimilation",
  description: "Cancel an active assimilation session",
  inputSchema: AnyObject,
  execute: wrapExecute("cancel_assimilation", async (input) => {
    await cancelAssimilation(platformClient, input as { sessionId: string });
    return { cancelled: true, sessionId: (input as { sessionId: string }).sessionId };
  }),
});

const steerAssimilationTool = createTool({
  id: "steer_assimilation",
  description: "Inject a human steering note into an in-progress assimilation session",
  inputSchema: AnyObject,
  execute: wrapExecute("steer_assimilation", async (input) => {
    await steerAssimilation(platformClient, input as { sessionId: string; note: string });
    return { steered: true, sessionId: (input as { sessionId: string }).sessionId };
  }),
});

const assimilateCreatorTool = createTool({
  id: "assimilate_creator",
  description: "Assimilate a creator by extracting transcripts from their videos",
  inputSchema: AnyObject,
  execute: wrapExecute("assimilate_creator", (input) =>
    assimilateCreator(platformClient, input as { profileId: string })
  ),
});

const getCreatorTranscriptsTool = createTool({
  id: "get_creator_transcripts",
  description: "Retrieve all transcripts for a creator profile",
  inputSchema: AnyObject,
  execute: wrapExecute("get_creator_transcripts", (input) =>
    getCreatorTranscripts(platformClient, input as { profileId: string; limit?: number })
  ),
});

const regenerateTranscriptTool = createTool({
  id: "regenerate_transcript",
  description: "Force re-transcription of a video",
  inputSchema: AnyObject,
  execute: wrapExecute("regenerate_transcript", (input) =>
    regenerateTranscript(platformClient, input as { videoId: string; profileId?: string })
  ),
});

const transcribeVideoUrlTool = createTool({
  id: "transcribe_video_url",
  description:
    "Fetch plain-text captions for a YouTube video URL (no API key, no Deepgram). Returns NO_CAPTIONS for caption-less videos.",
  inputSchema: AnyObject,
  execute: wrapExecute("transcribe_video_url", (input) =>
    transcribeVideoUrl(platformClient, input as { url: string })
  ),
});

const searchImprovementsTool = createTool({
  id: "search_improvements",
  description: "Search existing improvement requests using hybrid similarity search",
  inputSchema: AnyObject,
  execute: wrapExecute("search_improvements", (input) =>
    searchImprovements(platformClient, input as { query: string; limit?: number })
  ),
});

const getImprovementTool = createTool({
  id: "get_improvement",
  description: "Retrieve a specific improvement request by ID",
  inputSchema: AnyObject,
  execute: wrapExecute("get_improvement", (input) =>
    getImprovement(platformClient, input as { id: string })
  ),
});

const listImprovementsTool = createTool({
  id: "list_improvements",
  description: "List improvement requests with optional status filter",
  inputSchema: AnyObject,
  execute: wrapExecute("list_improvements", (input) =>
    listImprovements(platformClient, input as { status?: string; limit?: number })
  ),
});

const addImprovementTool = createTool({
  id: "add_improvement",
  description: "Submit one or more improvement requests",
  inputSchema: AnyObject,
  execute: wrapExecute("add_improvement", (input) =>
    addImprovement(
      platformClient,
      input as { items: Array<{ description: string; sourceScreen?: string }> }
    )
  ),
});

const closeImprovementTool = createTool({
  id: "close_improvement",
  description: "Close an improvement request",
  inputSchema: AnyObject,
  execute: wrapExecute("close_improvement", (input) =>
    closeImprovement(
      platformClient,
      input as { id: string; reason?: string; evidence?: string[] }
    )
  ),
});

const setImprovementStatusTool = createTool({
  id: "set_improvement_status",
  description: "Set an improvement request's status to open or closed",
  inputSchema: AnyObject,
  execute: wrapExecute("set_improvement_status", (input) =>
    setImprovementStatus(platformClient, input as { id: string; status: string })
  ),
});

const findRecommendationsTool = createTool({
  id: "findRecommendations",
  description: "Find specific recommendations with contact details",
  inputSchema: AnyObject,
  execute: wrapExecute("findRecommendations", (input) =>
    platformClient.callTool("findRecommendations", input as Record<string, unknown>)
  ),
});

// Keys MUST be the MCP tool ids — Mastra MCPServer uses object keys as tools/list names
// and as tools/call lookup keys (overwriting createTool id with the key).
const server = new MCPServer({
  name: "holocron",
  version: "1.0.0",
  description: "Unified Holocron MCP server (platform Postgres via Streamable HTTP)",
  tools: {
    get_research_session: getResearchSessionTool,
    search_research: searchResearchTool,
    deep_research: deepResearchTool,
    quick_research: quickResearchTool,
    deep_research_result: deepResearchResultTool,
    deep_research_control: deepResearchControlTool,
    search_fts: searchFtsTool,
    search_vector: searchVectorTool,
    store_document: storeDocumentTool,
    update_document: updateDocumentTool,
    share_document: shareDocumentTool,
    unshare_document: unshareDocumentTool,
    get_document: getDocumentTool,
    list_documents: listDocumentsTool,
    hybrid_search: hybridSearchTool,
    add_subscription: addSubscriptionTool,
    remove_subscription: removeSubscriptionTool,
    list_subscriptions: listSubscriptionsTool,
    check_subscriptions: checkSubscriptionsTool,
    get_subscription_content: getSubscriptionContentTool,
    set_subscription_filter: setSubscriptionFilterTool,
    get_subscription_filters: getSubscriptionFiltersTool,
    store_tool: storeToolTool,
    search_tools: searchToolsTool,
    get_tool: getToolTool,
    list_tools: listToolsTool,
    update_tool: updateToolTool,
    remove_tool: removeToolTool,
    shop_products: shopProductsTool,
    get_shop_session: getShopSessionTool,
    get_shop_listings: getShopListingsTool,
    get_whats_new_report: getWhatsNewReportTool,
    list_whats_new_reports: listWhatsNewReportsTool,
    start_assimilation: startAssimilationTool,
    approve_assimilation_plan: approveAssimilationPlanTool,
    reject_assimilation_plan: rejectAssimilationPlanTool,
    get_assimilation_status: getAssimilationStatusTool,
    cancel_assimilation: cancelAssimilationTool,
    steer_assimilation: steerAssimilationTool,
    assimilate_creator: assimilateCreatorTool,
    get_creator_transcripts: getCreatorTranscriptsTool,
    regenerate_transcript: regenerateTranscriptTool,
    transcribe_video_url: transcribeVideoUrlTool,
    search_improvements: searchImprovementsTool,
    get_improvement: getImprovementTool,
    list_improvements: listImprovementsTool,
    add_improvement: addImprovementTool,
    close_improvement: closeImprovementTool,
    set_improvement_status: setImprovementStatusTool,
    findRecommendations: findRecommendationsTool,
  },
});

process.on("SIGINT", () => {
  log("[Shutdown] SIGINT received");
  subscriptionManager.cleanup();
  platformClient.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("[Shutdown] SIGTERM received");
  subscriptionManager.cleanup();
  platformClient.close();
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

log("[Holocron MCP] Starting stdio server (platform delegate)...");

try {
  await server.startStdio();
  log("Server started successfully!");
} catch (error) {
  log(`FATAL ERROR starting server: ${error}`);
  log(`Error stack: ${error instanceof Error ? error.stack : "no stack"}`);
  process.exit(1);
}
