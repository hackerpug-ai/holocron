/**
 * Tool definitions for OpenAI Realtime API session.update.
 *
 * 21 tools for the Holocron voice assistant — full parity with the text chat agent
 * (minus create_plan which requires multi-step approval UX), plus navigate_app (voice-only).
 * Format follows the OpenAI Realtime API function calling spec.
 */

export type ToolParameterSchema = {
  type: string
  description: string
  enum?: string[]
  items?: ToolParameterSchema
  properties?: Record<string, ToolParameterSchema>
  required?: string[]
  minItems?: number
}

export type ToolParameters = {
  type: 'object'
  properties: Record<string, ToolParameterSchema>
  required?: string[]
}

export type ToolDefinition = {
  type: 'function'
  name: string
  description: string
  parameters: ToolParameters
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── Knowledge Base ──────────────────────────────────────────────
  {
    type: 'function',
    name: 'search_knowledge_base',
    description:
      'Search the knowledge base for documents matching a query. Returns ranked results with titles, summaries, and categories.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to find relevant documents' },
        limit: { type: 'number', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'browse_category',
    description: 'Browse all documents in a specific knowledge base category.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: "Category name to browse (e.g. 'research', 'articles', 'notes')",
        },
      },
      required: ['category'],
    },
  },
  {
    type: 'function',
    name: 'knowledge_base_stats',
    description: 'Get statistics and category counts for the entire knowledge base.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ── Documents ───────────────────────────────────────────────────
  {
    type: 'function',
    name: 'save_document',
    description: 'Save a new document to the knowledge base with a title, content, and category.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title for the document' },
        content: { type: 'string', description: 'Full text content to save' },
        category: {
          type: 'string',
          description: "Category to file under (e.g. 'research', 'notes', 'articles')",
        },
      },
      required: ['title', 'content', 'category'],
    },
  },
  {
    type: 'function',
    name: 'update_document',
    description:
      'Update an existing document. Provide only the fields you want to change; others stay the same.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The document ID to update (from search results)',
        },
        title: { type: 'string', description: 'New title (optional)' },
        content: { type: 'string', description: 'New content (optional)' },
        category: { type: 'string', description: 'New category (optional)' },
      },
      required: ['documentId'],
    },
  },
  {
    type: 'function',
    name: 'get_document',
    description: 'Get the full content of a document by its ID.',
    parameters: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'The document ID to retrieve (from search results)',
        },
      },
      required: ['documentId'],
    },
  },

  // ── Research ────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'quick_research',
    description:
      'Do a quick web research on a topic and return a concise summary with sources.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The research topic or question' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'deep_research',
    description:
      'Launch comprehensive deep research on a topic. Automatically selects the best strategy. Takes longer but produces a detailed report.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The topic to research deeply' },
        maxIterations: {
          type: 'number',
          description: 'Max research iterations (default 3)',
        },
      },
      required: ['topic'],
    },
  },

  // ── Shopping ────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'shop_search',
    description:
      'Search for products across retailers. Supports filtering by condition and max price.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product search query' },
        condition: {
          type: 'string',
          description: 'Item condition filter',
          enum: ['new', 'used', 'any'],
        },
        priceMax: { type: 'number', description: 'Maximum price in USD' },
      },
      required: ['query'],
    },
  },

  // ── Subscriptions ───────────────────────────────────────────────
  {
    type: 'function',
    name: 'subscribe',
    description:
      'Subscribe to a content source to receive updates (YouTube, newsletters, changelogs, Reddit, eBay, etc.).',
    parameters: {
      type: 'object',
      properties: {
        sourceType: {
          type: 'string',
          description: 'Type of content source',
          enum: ['youtube', 'newsletter', 'changelog', 'reddit', 'ebay', 'whats-new', 'creator'],
        },
        identifier: {
          type: 'string',
          description: 'Unique identifier for the source (URL, channel ID, subreddit name, etc.)',
        },
        name: { type: 'string', description: 'Friendly display name for this subscription' },
      },
      required: ['sourceType', 'identifier', 'name'],
    },
  },
  {
    type: 'function',
    name: 'unsubscribe',
    description: 'Remove an existing subscription by its ID.',
    parameters: {
      type: 'object',
      properties: {
        sourceId: {
          type: 'string',
          description: 'Subscription ID to remove (from list_subscriptions)',
        },
      },
      required: ['sourceId'],
    },
  },
  {
    type: 'function',
    name: 'list_subscriptions',
    description: 'List all active subscriptions.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'function',
    name: 'check_subscriptions',
    description:
      'Check one or all subscriptions for new content. Omit sourceId to check everything.',
    parameters: {
      type: 'object',
      properties: {
        sourceId: {
          type: 'string',
          description: 'Optional subscription ID to check. If omitted, checks all.',
        },
      },
    },
  },

  // ── Discovery ───────────────────────────────────────────────────
  {
    type: 'function',
    name: 'whats_new',
    description:
      'Generate a curated report on the latest AI models, developer tools, and tech trends.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Days to look back (default 1)' },
        focus: {
          type: 'string',
          description: 'Focus area for the report',
          enum: ['all', 'tools', 'releases', 'trends'],
        },
      },
    },
  },
  {
    type: 'function',
    name: 'toolbelt_search',
    description:
      'Search the curated developer toolbelt for tools, libraries, and utilities.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Search query (e.g. 'state management', 'CSS framework')",
        },
      },
      required: ['query'],
    },
  },

  // ── Repository Analysis ─────────────────────────────────────────
  {
    type: 'function',
    name: 'assimilate',
    description:
      'Analyze a GitHub repository across architecture, patterns, docs, dependencies, and testing.',
    parameters: {
      type: 'object',
      properties: {
        repositoryUrl: {
          type: 'string',
          description: 'GitHub repository URL (e.g. https://github.com/vercel/ai)',
        },
        profile: {
          type: 'string',
          description: 'Analysis depth: fast (~4 iterations), standard (~7), thorough (~12)',
          enum: ['fast', 'standard', 'thorough'],
        },
      },
      required: ['repositoryUrl'],
    },
  },

  // ── Improvements ────────────────────────────────────────────────
  {
    type: 'function',
    name: 'add_improvement',
    description:
      'Submit one or more improvement requests for the app. Search first to avoid duplicates.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'One or more improvements to submit',
          items: {
            type: 'object',
            description: 'An improvement item',
            properties: {
              description: {
                type: 'string',
                description: 'Description of the improvement or feature request',
              },
              sourceScreen: {
                type: 'string',
                description: 'Screen or area of the app this relates to',
              },
            },
            required: ['description'],
          },
          minItems: 1,
        },
      },
      required: ['items'],
    },
  },
  {
    type: 'function',
    name: 'search_improvements',
    description: 'Search existing improvement requests by similarity.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to find similar improvements' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_improvement',
    description: 'Get full details of an improvement request by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The improvement request ID' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'list_improvements',
    description:
      'List improvement requests with optional status filter. Excludes merged by default.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status',
          enum: ['submitted', 'processing', 'pending_review', 'approved', 'done', 'merged'],
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },

  // ── Voice-Only ──────────────────────────────────────────────────
  {
    type: 'function',
    name: 'navigate_app',
    description: 'Navigate to a screen in the app.',
    parameters: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          description: 'The screen to navigate to',
          enum: ['home', 'documents', 'conversations', 'research', 'improvements', 'settings'],
        },
      },
      required: ['screen'],
    },
  },
]

export const TOOL_NAMES = TOOL_DEFINITIONS.map((t) => t.name) as string[]

/**
 * Returns all tool definitions for OpenAI Realtime session.update.
 */
export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS
}

/**
 * Looks up a tool definition by name.
 * Returns undefined if the name is not found.
 */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name)
}
