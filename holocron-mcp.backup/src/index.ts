#!/usr/bin/env tsx

/**
 * Holocron MCP Research Server
 *
 * Exposes Holocron deep research functionality as MCP tools for Claude Code skills
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
import { researchTopic, simpleResearch } from './tools/research.js';
import { getResearchSession } from './tools/session.js';
import { searchResearch } from './tools/search.js';

// Load and validate configuration
const config = loadConfig();
validateConfig(config);

// Initialize Convex client
const convexClient = createConvexClient(config);

// Create MCP server
const server = new Server(
  {
    name: 'holocron-research',
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
  {
    name: 'research_topic',
    description: `Start deep research on a topic and wait for completion.

This tool performs iterative research using the Ralph Loop:
1. Starts a research session (5 iterations by default)
2. Polls every 2 seconds until completion
3. Returns findings with confidence scores and citations

The tool waits synchronously (2-5 minutes typical).

Confidence levels:
- HIGH: 3+ sources, credible evidence, strong corroboration
- MEDIUM: 2+ sources, moderate evidence quality
- LOW: Single source or weak evidence

Use confidenceFilter to limit results:
- HIGH_ONLY: Only high-confidence findings
- HIGH_MEDIUM: High and medium confidence
- ALL: All findings (default)`,
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Research topic or question',
        },
        maxIterations: {
          type: 'number',
          description: 'Maximum iterations (default: 5)',
        },
        confidenceFilter: {
          type: 'string',
          enum: ['HIGH_ONLY', 'HIGH_MEDIUM', 'ALL'],
          description: 'Filter findings by confidence level (default: ALL)',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_research_session',
    description: `Retrieve an existing research session by ID.

Returns the complete session with:
- All iterations and findings
- Confidence statistics
- Citations and evidence quality

Use this to:
- Review past research
- Get session details without re-running
- Check research status`,
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Deep research session ID',
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_research',
    description: `Search across all past research findings using hybrid search.

Combines:
- Vector similarity (embeddings) - 50% weight
- Keyword matching (full-text) - 50% weight

Returns relevant iteration findings sorted by relevance score.

Use this to:
- Find related past research
- Discover existing knowledge
- Avoid duplicate research`,
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
        confidenceFilter: {
          type: 'string',
          enum: ['HIGH_ONLY', 'HIGH_MEDIUM', 'ALL'],
          description: 'Filter by confidence level (not yet implemented)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'simple_research',
    description: `Perform fast single-pass research (15-30s).

Decomposes query into 4 domain-specific queries, executes in parallel,
single synthesis pass. Returns findings immediately.

Use for:
- Quick fact-checking
- Straightforward questions
- When speed > depth

For complex topics requiring iteration, use research_topic instead.`,
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Research topic or question',
        },
      },
      required: ['topic'],
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
      case 'research_topic': {
        const result = await researchTopic(convexClient, config, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_research_session': {
        const result = await getResearchSession(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'search_research': {
        const result = await searchResearch(convexClient, args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'simple_research': {
        const result = await simpleResearch(convexClient, args as any);
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
    console.error('[holocron-mcp] Starting server...');
    console.error(`[holocron-mcp] Convex URL: ${config.convexUrl}`);
    console.error(`[holocron-mcp] Poll interval: ${config.pollIntervalMs}ms`);
    console.error(`[holocron-mcp] Timeout: ${config.timeoutMs}ms`);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[holocron-mcp] Server started successfully');
    console.error('[holocron-mcp] Available tools:');
    console.error('  - research_topic: Start deep research');
    console.error('  - get_research_session: Retrieve session by ID');
    console.error('  - search_research: Hybrid search across findings');
  } catch (error) {
    console.error('[holocron-mcp] Failed to start server:', error);
    process.exit(1);
  }
}

main();
