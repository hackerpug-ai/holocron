/**
 * Holocron MCP Server - Mastra/Bun implementation
 * Unified MCP server with Convex realtime streaming
 */

import { MCPServer } from '@mastra/mcp'
import { createTool } from '@mastra/core/tools'
import { holocronClient } from '../convex/client.ts'
import { subscriptionManager } from '../streaming/subscription-manager.ts'
import { formatError } from '../streaming/formatter.ts'
import { appendFileSync } from 'fs'
import { resolve } from 'path'

// Setup file logging
const LOG_FILE = resolve('/tmp/holocron-mcp.log')
function log(message: string) {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message}\n`
  try {
    appendFileSync(LOG_FILE, logLine)
  } catch (e) {
    console.error('Failed to write to log file:', e)
  }
  console.error(message)
}

log('=== Holocron MCP Server Starting ===')
log(`Node version: ${process.version}`)
log(`Process argv: ${JSON.stringify(process.argv)}`)
log(`Working directory: ${process.cwd()}`)
log(`Environment variables:`)
log(`  HOLOCRON_URL: ${process.env.HOLOCRON_URL || 'NOT SET'}`)
log(`  HOLOCRON_DEPLOY_KEY: ${process.env.HOLOCRON_DEPLOY_KEY ? 'SET (length: ' + process.env.HOLOCRON_DEPLOY_KEY.length + ')' : 'NOT SET'}`)
log(`  HOLOCRON_OPENAI_API_KEY: ${process.env.HOLOCRON_OPENAI_API_KEY ? 'SET (length: ' + process.env.HOLOCRON_OPENAI_API_KEY.length + ')' : 'NOT SET'}`)

// Tool implementations
import { researchTopic, simpleResearch } from '../tools/research.ts'
import { getResearchSession, searchResearch } from '../tools/session.ts'
import { searchFts, searchVector } from '../tools/search.ts'
import { storeDocument, updateDocument } from '../tools/storage.ts'
import { getDocument, listDocuments } from '../tools/retrieval.ts'
import { hybridSearch } from '../tools/hybrid-search.ts'

// Validation schemas
import {
  ResearchTopicSchema,
  SimpleResearchSchema,
  SessionIdSchema,
  SearchSchema,
  SearchVectorSchema,
  StoreDocumentSchema,
  UpdateDocumentSchema,
  DocumentIdSchema,
} from '../config/validation.ts'
import { z } from 'zod'

/**
 * Create Mastra MCP tools from existing implementations
 */

const researchTopicTool = createTool({
  id: 'research_topic',
  description: 'Start deep research on a topic with iterative refinement and streaming progress updates',
  inputSchema: ResearchTopicSchema,
  execute: async (input) => {
    try {
      return await researchTopic(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const simpleResearchTool = createTool({
  id: 'simple_research',
  description: 'Quick single-iteration research without streaming',
  inputSchema: SimpleResearchSchema,
  execute: async (input) => {
    try {
      return await simpleResearch(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const getResearchSessionTool = createTool({
  id: 'get_research_session',
  description: 'Retrieve a research session by ID with full findings and confidence stats',
  inputSchema: SessionIdSchema,
  execute: async (input) => {
    try {
      return await getResearchSession(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const searchResearchTool = createTool({
  id: 'search_research',
  description: 'Search across all research sessions and findings',
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await searchResearch(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const searchFtsTool = createTool({
  id: 'search_fts',
  description: 'Full-text keyword search using SQLite FTS5',
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await searchFts(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const searchVectorTool = createTool({
  id: 'search_vector',
  description: 'Semantic vector search using embeddings',
  inputSchema: SearchVectorSchema,
  execute: async (input) => {
    try {
      return await searchVector(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const storeDocumentTool = createTool({
  id: 'store_document',
  description: 'Store a new document with automatic embedding generation',
  inputSchema: StoreDocumentSchema,
  execute: async (input) => {
    try {
      return await storeDocument(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const updateDocumentTool = createTool({
  id: 'update_document',
  description: 'Update an existing document with re-embedding',
  inputSchema: UpdateDocumentSchema,
  execute: async (input) => {
    try {
      return await updateDocument(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const getDocumentTool = createTool({
  id: 'get_document',
  description: 'Retrieve a specific document by ID',
  inputSchema: DocumentIdSchema,
  execute: async (input) => {
    try {
      return await getDocument(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const listDocumentsTool = createTool({
  id: 'list_documents',
  description: 'List documents with pagination',
  inputSchema: z.object({
    limit: z.number().int().positive().optional(),
    cursor: z.string().optional(),
  }),
  execute: async (input) => {
    try {
      return await listDocuments(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

const hybridSearchTool = createTool({
  id: 'hybrid_search',
  description: 'Intelligent hybrid search combining keyword and semantic search',
  inputSchema: SearchSchema,
  execute: async (input) => {
    try {
      return await hybridSearch(holocronClient, input)
    } catch (error) {
      console.error(formatError(error))
      throw error
    }
  },
})

/**
 * Initialize Mastra MCP server
 */
const server = new MCPServer({
  name: 'holocron',
  version: '1.0.0',
  description: 'Unified Holocron MCP server with Bun + Mastra + Convex streaming',
  tools: {
    researchTopicTool,
    simpleResearchTool,
    getResearchSessionTool,
    searchResearchTool,
    searchFtsTool,
    searchVectorTool,
    storeDocumentTool,
    updateDocumentTool,
    getDocumentTool,
    listDocumentsTool,
    hybridSearchTool,
  },
})

/**
 * Graceful shutdown handler
 */
process.on('SIGINT', () => {
  log('[Shutdown] SIGINT received - cleaning up subscriptions...')
  subscriptionManager.cleanup()
  holocronClient.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('[Shutdown] SIGTERM received - cleaning up subscriptions...')
  subscriptionManager.cleanup()
  holocronClient.close()
  process.exit(0)
})

process.on('uncaughtException', (error) => {
  log(`[FATAL] Uncaught exception: ${error}`)
  log(`Stack: ${error.stack}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log(`[FATAL] Unhandled rejection at: ${promise}`)
  log(`Reason: ${reason}`)
  process.exit(1)
})

/**
 * Start MCP server on stdio
 */
log('[Holocron MCP] Starting server...')
log(`[Holocron MCP] Tools registered: 11`)
log(`[Holocron MCP] Convex URL: ${process.env.CONVEX_URL || process.env.HOLOCRON_URL}`)

try {
  log('Attempting to start stdio transport...')
  await server.startStdio()
  log('Server started successfully!')
} catch (error) {
  log(`FATAL ERROR starting server: ${error}`)
  log(`Error stack: ${error instanceof Error ? error.stack : 'no stack'}`)
  process.exit(1)
}
