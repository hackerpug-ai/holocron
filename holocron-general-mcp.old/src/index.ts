#!/usr/bin/env tsx

/**
 * Holocron General MCP Server
 *
 * Exposes general Holocron document operations (search, storage, retrieval) as MCP tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config/env.js';
import { validateConfig } from './config/validation.js';
import { createConvexClient } from './convex/client.js';
import { hybridSearch, searchFts, searchVector } from './tools/search.js';
import { getDocument, listDocuments } from './tools/retrieval.js';
import { storeDocument, updateDocument } from './tools/storage.js';

// Load and validate configuration
const config = loadConfig();
validateConfig(config);

// Initialize Convex client
const convexClient = createConvexClient(config);

// Create MCP server
const server = new Server(
  {
    name: 'holocron-general',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  // Search tools
  {
    name: 'hybrid_search',
    description: `Search documents using hybrid search (vector + full-text combined).

Combines semantic similarity (50%) with keyword matching (50%) for optimal results.

Returns documents sorted by relevance score.

Use this for:
- General document search
- Finding related content
- Discovery across holocron

Requires OpenAI API key for embeddings.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (optional)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_fts',
    description: `Full-text search across document titles and content.

Keyword-based search using case-insensitive matching.

Returns documents sorted by relevance.

Use this for:
- Exact keyword search
- Fast search without embeddings
- Category-filtered search

No OpenAI API key needed.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (optional)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_vector',
    description: `Semantic vector search using embeddings.

Finds documents with similar meaning using cosine similarity.

Returns documents sorted by similarity score.

Use this for:
- Conceptual similarity
- Semantic discovery
- Finding related content

Requires OpenAI API key for embeddings.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (optional)',
        },
      },
      required: ['query'],
    },
  },

  // Retrieval tools
  {
    name: 'get_document',
    description: `Get a single document by ID.

Returns full document with all fields.

Returns null if document not found.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Document ID (Convex ID)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_documents',
    description: `List documents with optional filtering.

Returns documents with all fields (except embeddings for performance).

Use this for:
- Browsing documents
- Category-based listing
- Getting document counts`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 100, max: 1000)',
        },
      },
    },
  },

  // Storage tools
  {
    name: 'store_document',
    description: `Store a new document in holocron.

Creates a new document with the provided fields.

Returns the new document ID.

Required fields: title, content, category
Optional fields: filePath, fileType, status, date, time, researchType, iterations, embedding`,
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Document title',
        },
        content: {
          type: 'string',
          description: 'Document content (markdown supported)',
        },
        category: {
          type: 'string',
          description: 'Document category (e.g., "research", "assimilation", "note")',
        },
        filePath: {
          type: 'string',
          description: 'Optional file path reference',
        },
        fileType: {
          type: 'string',
          description: 'Optional file type (e.g., "markdown", "pdf")',
        },
        status: {
          type: 'string',
          description: 'Optional status (e.g., "published", "draft")',
        },
        date: {
          type: 'string',
          description: 'Optional ISO date string',
        },
        time: {
          type: 'string',
          description: 'Optional time string',
        },
        researchType: {
          type: 'string',
          description: 'Optional research type classification',
        },
        iterations: {
          type: 'number',
          description: 'Optional iteration count',
        },
        embedding: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional embedding vector (1536 dimensions)',
        },
      },
      required: ['title', 'content', 'category'],
    },
  },
  {
    name: 'update_document',
    description: `Update an existing document.

Updates only the provided fields, leaving others unchanged.

Returns the updated document or null if not found.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Document ID to update',
        },
        title: {
          type: 'string',
          description: 'New title (optional)',
        },
        content: {
          type: 'string',
          description: 'New content (optional)',
        },
        category: {
          type: 'string',
          description: 'New category (optional)',
        },
        filePath: {
          type: 'string',
          description: 'New file path (optional)',
        },
        fileType: {
          type: 'string',
          description: 'New file type (optional)',
        },
        status: {
          type: 'string',
          description: 'New status (optional)',
        },
        date: {
          type: 'string',
          description: 'New date (optional)',
        },
        time: {
          type: 'string',
          description: 'New time (optional)',
        },
        researchType: {
          type: 'string',
          description: 'New research type (optional)',
        },
        iterations: {
          type: 'number',
          description: 'New iteration count (optional)',
        },
        embedding: {
          type: 'array',
          items: { type: 'number' },
          description: 'New embedding vector (optional)',
        },
      },
      required: ['id'],
    },
  },
];

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      // Search tools
      case 'hybrid_search': {
        const result = await hybridSearch(convexClient, config, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'search_fts': {
        const result = await searchFts(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'search_vector': {
        const result = await searchVector(convexClient, config, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // Retrieval tools
      case 'get_document': {
        const result = await getDocument(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_documents': {
        const result = await listDocuments(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // Storage tools
      case 'store_document': {
        const result = await storeDocument(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'update_document': {
        const result = await updateDocument(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, message);
  }
});

// Start server
async function main() {
  try {
    console.error('[holocron-general-mcp] Starting server...');
    console.error(`[holocron-general-mcp] Convex URL: ${config.convexUrl}`);
    console.error(
      `[holocron-general-mcp] OpenAI API key: ${config.openaiApiKey.substring(0, 8)}...`
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[holocron-general-mcp] Server started successfully');
    console.error('[holocron-general-mcp] Available tools:');
    console.error('  Search:');
    console.error('    - hybrid_search: Vector + FTS combined search');
    console.error('    - search_fts: Full-text keyword search');
    console.error('    - search_vector: Semantic similarity search');
    console.error('  Retrieval:');
    console.error('    - get_document: Get document by ID');
    console.error('    - list_documents: List documents with filters');
    console.error('  Storage:');
    console.error('    - store_document: Create new document');
    console.error('    - update_document: Update existing document');
  } catch (error) {
    console.error('[holocron-general-mcp] Failed to start server:', error);
    process.exit(1);
  }
}

main();
