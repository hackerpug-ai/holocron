/**
 * Agent Tools for Chat Assistant
 *
 * 13 tool definitions using Vercel AI SDK `tool()` with zod schemas.
 * These tools give the chat agent capabilities across all holocron features.
 * No `execute` functions — tool calls are returned in result.toolCalls
 * and handled by agent.ts via the human-in-the-loop pattern.
 */

import { tool } from "ai";
import { z } from "zod";

/**
 * search_knowledge_base - Search documents in the knowledge base by query text
 */
const search_knowledge_base = tool({
  description:
    "Search the personal knowledge base for documents matching a query. " +
    "Use this when the user asks about something that might be in their saved documents, " +
    "notes, or research. Returns ranked results with titles, summaries, and categories.",
  inputSchema: z.object({
    query: z.string().describe("The search query to find relevant documents"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return (default 5)"),
  }),
});

/**
 * browse_category - Browse documents by category
 */
const browse_category = tool({
  description:
    "Browse all documents within a specific category in the knowledge base. " +
    "Use this when the user wants to explore a topic area or see everything saved " +
    "under a particular category like 'research', 'articles', or 'notes'.",
  inputSchema: z.object({
    category: z
      .string()
      .describe(
        "The category name to browse (e.g. 'research', 'articles', 'notes')",
      ),
  }),
});

/**
 * knowledge_base_stats - Get overall knowledge base statistics
 */
const knowledge_base_stats = tool({
  description:
    "Get statistics and counts for the entire knowledge base, broken down by category. " +
    "Use this when the user wants an overview of what's in their knowledge base, " +
    "how many documents exist, or what categories are available.",
  inputSchema: z.object({}),
});

/**
 * quick_research - Perform a quick web research on a topic
 */
const quick_research = tool({
  description:
    "Do a quick web research on a topic and return a concise summary with sources. " +
    "Use this when the user wants fast, current information about something. " +
    "Best for straightforward questions that need up-to-date web data.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The research topic or question to investigate"),
  }),
});

/**
 * deep_research - Launch comprehensive multi-iteration research
 */
const deep_research = tool({
  description:
    "Launch a comprehensive deep research session on a topic using smart strategy routing. " +
    "Automatically selects the optimal research strategy (fast parallel fan-out or deep iterative) " +
    "based on query complexity. Use this when the user needs thorough, in-depth research with " +
    "synthesis and a detailed report. Best for complex topics requiring broad coverage and multiple perspectives.",
  inputSchema: z.object({
    topic: z
      .string()
      .describe("The research topic or question to investigate deeply"),
    maxIterations: z
      .number()
      .optional()
      .default(3)
      .describe("Maximum number of research iterations (default 3)"),
  }),
});

/**
 * answer_question - Research and answer in one step
 */
const answer_question = tool({
  description:
    "Research a topic on the web and provide a direct answer to the user's question. " +
    "Use this when the user asks a question that requires up-to-date information from the web, " +
    "but doesn't need a comprehensive stored report. Best for: factual questions, current events, " +
    "'what is X', 'how does Y work', comparisons, explanations.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The specific question or topic to research and answer"),
    sources: z
      .number()
      .optional()
      .default(5)
      .describe("Number of sources to consult (default 5, max 10)"),
  }),
});

/**
 * shop_search - Search for products across retailers
 */
const shop_search = tool({
  description:
    "Search for products across retailers including eBay and other sources. " +
    "Use this when the user wants to find items to buy, compare prices, " +
    "or check availability of products. Supports filtering by condition and max price.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The product search query (e.g. 'mechanical keyboard', 'vintage camera')"),
    condition: z
      .enum(["new", "used", "any"])
      .optional()
      .describe("Filter by item condition: 'new', 'used', or 'any' (default)"),
    priceMax: z
      .number()
      .optional()
      .describe("Maximum price filter in USD"),
  }),
});

/**
 * subscribe - Subscribe to a content source
 */
const subscribe = tool({
  description:
    "Subscribe to a content source to receive updates. Supported sources include " +
    "YouTube channels, newsletters, changelogs, Reddit communities, eBay saved searches, " +
    "what's-new feeds, and individual creators. " +
    "Use this when the user wants to follow and receive updates from a source.",
  inputSchema: z.object({
    sourceType: z
      .enum([
        "youtube",
        "newsletter",
        "changelog",
        "reddit",
        "ebay",
        "whats-new",
        "creator",
      ])
      .describe("The type of content source to subscribe to"),
    identifier: z
      .string()
      .describe(
        "The unique identifier for the source (URL, channel ID, subreddit name, etc.)",
      ),
    name: z
      .string()
      .describe("A friendly display name for this subscription"),
  }),
});

/**
 * unsubscribe - Remove a subscription
 */
const unsubscribe = tool({
  description:
    "Remove an existing subscription so you no longer receive updates from that source. " +
    "Use this when the user wants to stop following a channel, feed, or content source. " +
    "Requires the subscription ID from list_subscriptions.",
  inputSchema: z.object({
    sourceId: z
      .string()
      .describe("The subscription ID to remove (from list_subscriptions)"),
  }),
});

/**
 * list_subscriptions - List all active subscriptions
 */
const list_subscriptions = tool({
  description:
    "List all active subscriptions the user is currently following. " +
    "Use this when the user wants to see what they're subscribed to, " +
    "manage their subscriptions, or find a subscription ID to unsubscribe.",
  inputSchema: z.object({}),
});

/**
 * check_subscriptions - Check subscriptions for new content
 */
const check_subscriptions = tool({
  description:
    "Check one or all subscriptions for new content and updates. " +
    "Use this when the user wants to see what's new from their subscribed sources. " +
    "Optionally target a specific subscription or check everything at once.",
  inputSchema: z.object({
    sourceId: z
      .string()
      .optional()
      .describe(
        "Optional subscription ID to check. If omitted, checks all subscriptions.",
      ),
  }),
});

/**
 * whats_new - Generate a what's-new report on AI and developer tools
 */
const whats_new = tool({
  description:
    "Generate a curated what's-new report covering the latest AI models, developer tools, " +
    "software releases, and technology trends. " +
    "Use this when the user wants to catch up on recent developments in AI and tech. " +
    "Can be focused on all news, specific tools, releases, or emerging trends.",
  inputSchema: z.object({
    days: z
      .number()
      .optional()
      .default(1)
      .describe("Number of days to look back for news (default 1)"),
    focus: z
      .enum(["all", "tools", "releases", "trends"])
      .optional()
      .describe(
        "What to focus on: 'all' (default), 'tools', 'releases', or 'trends'",
      ),
  }),
});

/**
 * toolbelt_search - Search the developer toolbelt
 */
const toolbelt_search = tool({
  description:
    "Search the curated developer toolbelt for tools, libraries, and utilities. " +
    "Use this when the user is looking for a specific developer tool, " +
    "wants to find the right library for a task, or is exploring their saved tools collection.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query for finding tools (e.g. 'state management', 'CSS framework', 'CLI tool')",
      ),
  }),
});

/**
 * assimilate - Deep analysis of a GitHub repository across 5 dimensions
 */
const assimilate = tool({
  description:
    "Analyze a GitHub repository deeply across 5 dimensions: architecture, patterns, " +
    "documentation, dependencies, and testing. Creates a coverage plan for approval " +
    "before starting analysis. Use this when the user wants to deeply understand a " +
    "GitHub repository's structure, patterns, and quality.",
  inputSchema: z.object({
    repositoryUrl: z
      .string()
      .describe("GitHub repository URL (e.g., https://github.com/vercel/ai)"),
    profile: z
      .enum(["fast", "standard", "thorough"])
      .optional()
      .default("standard")
      .describe(
        "Analysis depth: fast (~4 iterations), standard (~7), thorough (~12)",
      ),
  }),
});

/**
 * save_document - Save content to the knowledge base
 */
const save_document = tool({
  description:
    "Save a document or piece of content to the personal knowledge base. " +
    "Use this when the user wants to save research findings, notes, articles, " +
    "or any content for future reference. Requires a title, content body, and category.",
  inputSchema: z.object({
    title: z.string().describe("The title for the document"),
    content: z
      .string()
      .describe("The full text content to save"),
    category: z
      .string()
      .describe(
        "The category to file the document under (e.g. 'research', 'notes', 'articles')",
      ),
  }),
});

/**
 * update_document - Update an existing document in the knowledge base
 */
const update_document = tool({
  description:
    "Update an existing document in the knowledge base. " +
    "Use this when the user wants to modify the content of a previously saved document. " +
    "Requires the document ID which can be found by searching the knowledge base first. " +
    "You can update the title, content, and/or category. Any fields not provided will remain unchanged.",
  inputSchema: z.object({
    documentId: z
      .string()
      .describe(
        "The ID of the document to update. Find this by using search_knowledge_base first, " +
        "which returns document IDs in the results.",
      ),
    title: z
      .string()
      .optional()
      .describe("New title for the document (optional, keeps existing if not provided)"),
    content: z
      .string()
      .optional()
      .describe("New content for the document (optional, keeps existing if not provided)"),
    category: z
      .string()
      .optional()
      .describe("New category for the document (optional, keeps existing if not provided)"),
  }),
});

/**
 * get_document - Get full document content by ID
 */
const get_document = tool({
  description:
    "Get the full content of a document by ID. " +
    "Use this when you need to read the complete text of a document that was found in search results. " +
    "Returns the title, content, category, and metadata.",
  inputSchema: z.object({
    documentId: z
      .string()
      .describe("The document ID to retrieve (from search_knowledge_base results)"),
  }),
});

/**
 * add_improvement - Submit one or more improvement requests
 */
const add_improvement = tool({
  description:
    "Submit one or more improvement requests for the Holocron app. " +
    "Each item becomes a tracked improvement ticket that goes through AI dedup processing. " +
    "Search for existing improvements first to avoid duplicates.",
  inputSchema: z.object({
    items: z
      .array(
        z.object({
          description: z
            .string()
            .describe("Description of the improvement or feature request"),
          sourceScreen: z
            .string()
            .optional()
            .describe("Screen or area of the app this improvement relates to"),
        }),
      )
      .min(1)
      .describe("One or more improvements to submit"),
  }),
});

/**
 * search_improvements - Search existing improvement requests
 */
const search_improvements = tool({
  description:
    "Search existing improvement requests using hybrid vector + full-text similarity search. " +
    "Use this before creating new improvements to check for duplicates, " +
    "or when the user wants to find previously submitted improvements.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("The search query to find similar improvements"),
    limit: z
      .number()
      .optional()
      .default(5)
      .describe("Maximum number of results to return (default 5)"),
  }),
});

/**
 * get_improvement - Get full details of an improvement request
 */
const get_improvement = tool({
  description:
    "Get the full details of an improvement request by ID, " +
    "including images, agent decision, and merge history. " +
    "Use this when you have a specific improvement ID from search results.",
  inputSchema: z.object({
    id: z
      .string()
      .describe("The improvement request ID to retrieve"),
  }),
});

/**
 * list_improvements - List improvement requests with optional filter
 */
const list_improvements = tool({
  description:
    "List improvement requests with optional status filter. " +
    "Excludes merged items by default. Use this when the user wants to see " +
    "all improvements, check status, or review pending items.",
  inputSchema: z.object({
    status: z
      .enum(["open", "closed"])
      .optional()
      .describe("Filter by status (open or closed). Omit to list all non-merged items."),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Maximum number of results to return (default 20)"),
  }),
});

/**
 * create_plan - Create a multi-step execution plan
 */
const create_plan = tool({
  description:
    "Create a multi-step execution plan when a task requires 2 or more sequential tool calls. " +
    "Each step specifies a tool to call and its arguments. Steps execute sequentially — " +
    "read-only steps auto-execute, while data-modifying steps pause for user approval. " +
    "Use this instead of individual tool calls when the user's request naturally involves multiple steps.",
  inputSchema: z.object({
    title: z.string().describe("Brief title describing the plan (e.g., 'Research and save findings')"),
    steps: z.array(
      z.object({
        toolName: z.string().describe("Name of the tool to call (must match an existing tool name)"),
        toolArgs: z.record(z.any()).describe("Arguments to pass to the tool"),
        description: z.string().describe("Brief human-readable description of what this step does"),
        requiresApproval: z.boolean().describe(
          "Whether this step needs user approval. " +
          "TRUE for: deep_research, save_document, subscribe, unsubscribe, assimilate, shop_search, whats_new. " +
          "FALSE for: search_knowledge_base, browse_category, knowledge_base_stats, quick_research, answer_question, " +
          "list_subscriptions, check_subscriptions, toolbelt_search."
        ),
      })
    ).min(2).describe("The ordered list of steps to execute"),
  }),
});

/**
 * agentTools - All 21 chat agent tools
 */
export const agentTools = {
  search_knowledge_base,
  browse_category,
  knowledge_base_stats,
  quick_research,
  deep_research,
  shop_search,
  subscribe,
  unsubscribe,
  list_subscriptions,
  check_subscriptions,
  whats_new,
  toolbelt_search,
  save_document,
  update_document,
  get_document,
  assimilate,
  add_improvement,
  search_improvements,
  get_improvement,
  list_improvements,
  create_plan,
};

/**
 * Domain-grouped tool subsets for specialist agents.
 * Each specialist gets only the tools relevant to its domain,
 * improving tool selection accuracy (research shows degradation after ~10 tools).
 */

/** Knowledge retrieval: search, browse, stats, read documents, find tools */
export const knowledgeTools = {
  search_knowledge_base,
  browse_category,
  knowledge_base_stats,
  get_document,
  toolbelt_search,
};

/** Web research: quick single-pass and deep multi-iteration */
export const researchTools = {
  quick_research,
  deep_research,
  answer_question,
};

/** Product shopping and price comparison */
export const commerceTools = {
  shop_search,
};

/** Subscription management: add, remove, list, check for updates */
export const subscriptionTools = {
  subscribe,
  unsubscribe,
  list_subscriptions,
  check_subscriptions,
};

/** News and trend discovery */
export const discoveryTools = {
  whats_new,
};

/** Document management: save, update, read */
export const documentTools = {
  save_document,
  update_document,
  get_document,
};

/** Repository analysis */
export const analysisTools = {
  assimilate,
};

/** Improvement request management */
export const improvementTools = {
  add_improvement,
  search_improvements,
  get_improvement,
  list_improvements,
};

/** Multi-step plan creation */
export const plannerTools = {
  create_plan,
};
