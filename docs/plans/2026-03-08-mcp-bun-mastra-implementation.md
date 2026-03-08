# Holocron MCP Bun + Mastra Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate Holocron MCP server from Node.js + standard SDK to Bun + Mastra framework with Convex realtime streaming

**Architecture:** Clean slate rewrite consolidating 11 tools into single Bun-based MCP server with subscription-driven progress streaming to stderr

**Tech Stack:** Bun runtime, Mastra MCP (@mastra/core), ConvexClient with subscriptions, TypeScript 5.7+, tsup for dual ESM/CJS build, Vitest for testing

---

## Phase 1: Foundation (Week 1)

### Task 1: Archive Current Implementation

**Files:**
- Archive: `holocron-mcp/` → `holocron-mcp.backup/`
- Archive: `holocron-general-mcp/` → `holocron-general-mcp.old/`

**Step 1: Create archives**

```bash
cd /Users/justinrich/Projects/holocron
mv holocron-mcp holocron-mcp.backup
mv holocron-general-mcp holocron-general-mcp.old
```

**Step 2: Verify archives exist**

```bash
ls -la | grep -E "(holocron-mcp.backup|holocron-general-mcp.old)"
```

Expected: Both directories listed

**Step 3: Create git tag for rollback**

```bash
git tag pre-bun-migration
git push origin pre-bun-migration
```

**Step 4: Commit archive state**

```bash
git add -A
git commit -m "chore: archive old MCP servers before Bun migration"
```

---

### Task 2: Initialize Bun Project

**Files:**
- Create: `holocron-mcp/package.json`
- Create: `holocron-mcp/tsconfig.json`
- Create: `holocron-mcp/tsup.config.ts`

**Step 1: Create holocron-mcp directory**

```bash
mkdir holocron-mcp
cd holocron-mcp
```

**Step 2: Initialize with Bun**

```bash
bun init -y
```

**Step 3: Install dependencies**

```bash
bun add @mastra/core convex zod
bun add -d bun-types typescript tsup vitest
```

**Step 4: Create package.json**

```json
{
  "name": "@holocron/mcp-unified",
  "version": "1.0.0",
  "description": "Unified Holocron MCP server with Bun + Mastra + Convex streaming",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "holocron-mcp": "./dist/mastra/stdio.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "bun run src/mastra/stdio.ts",
    "start": "bun run dist/mastra/stdio.js",
    "test": "vitest",
    "type-check": "tsc --noEmit"
  },
  "keywords": ["mcp", "research", "holocron", "mastra", "convex"],
  "author": "Justin Rich",
  "license": "MIT",
  "dependencies": {
    "@mastra/core": "^0.1.0",
    "convex": "^1.18.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "bun-types": "latest",
    "tsup": "^8.0.0",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  },
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

**Step 5: Commit package.json**

```bash
git add package.json
git commit -m "feat: initialize Bun project with Mastra dependencies"
```

---

### Task 3: Configure TypeScript & Build

**Files:**
- Create: `holocron-mcp/tsconfig.json`
- Create: `holocron-mcp/tsup.config.ts`

**Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 2: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/mastra/stdio.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env bun',
  },
})
```

**Step 3: Verify TypeScript can compile**

```bash
bun run type-check
```

Expected: No errors (even with empty src/)

**Step 4: Commit TypeScript configuration**

```bash
git add tsconfig.json tsup.config.ts
git commit -m "feat: configure TypeScript and tsup for dual ESM/CJS build"
```

---

### Task 4: Create Environment Configuration

**Files:**
- Create: `holocron-mcp/src/config/env.ts`
- Create: `holocron-mcp/src/config/validation.ts`

**Step 1: Create src/config directory**

```bash
mkdir -p src/config
```

**Step 2: Create env.ts**

```typescript
// src/config/env.ts
export interface HolocronConfig {
  convexUrl: string
  openaiApiKey: string
  pollIntervalMs: number
  timeoutMs: number
}

export function loadConfig(): HolocronConfig {
  const convexUrl = process.env.CONVEX_URL
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!convexUrl) {
    throw new Error('CONVEX_URL environment variable is required')
  }

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required')
  }

  return {
    convexUrl,
    openaiApiKey,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '2000', 10),
    timeoutMs: parseInt(process.env.TIMEOUT_MS || '300000', 10), // 5 minutes
  }
}
```

**Step 3: Create validation.ts**

```typescript
// src/config/validation.ts
import { z } from 'zod'
import type { HolocronConfig } from './env.js'

const configSchema = z.object({
  convexUrl: z.string().url(),
  openaiApiKey: z.string().min(1),
  pollIntervalMs: z.number().positive(),
  timeoutMs: z.number().positive(),
})

export function validateConfig(config: HolocronConfig): void {
  const result = configSchema.safeParse(config)

  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`)
  }
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit configuration files**

```bash
git add src/config/
git commit -m "feat: add environment configuration and validation"
```

---

### Task 5: Create Convex Client Wrapper

**Files:**
- Create: `holocron-mcp/src/convex/client.ts`
- Create: `holocron-mcp/src/convex/types.ts`

**Step 1: Create src/convex directory**

```bash
mkdir -p src/convex
```

**Step 2: Create types.ts**

```typescript
// src/convex/types.ts
export interface ResearchSession {
  _id: string
  sessionId: string
  topic: string
  status: 'running' | 'completed' | 'error'
  iterations: number
  currentIteration: number
  coverageScore: number
  findings: ResearchFinding[]
  confidenceStats: ConfidenceStats
  errorMessage?: string
  createdAt: number
  updatedAt: number
}

export interface ResearchFinding {
  claimText: string
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  confidenceScore: number
  citations: Citation[]
  caveats: string[]
  warnings: string[]
}

export interface Citation {
  url: string
  title: string
}

export interface ConfidenceStats {
  highConfidenceCount: number
  mediumConfidenceCount: number
  lowConfidenceCount: number
  averageConfidenceScore: number
  claimsWithMultipleSources: number
  totalClaims: number
}

export interface IterationSearchResult {
  sessionId: string
  iteration: number
  summary: string
  relevanceScore: number
}
```

**Step 3: Create client.ts**

```typescript
// src/convex/client.ts
import { ConvexClient } from 'convex/browser'
import type { HolocronConfig } from '../config/env.js'
import type { ResearchSession, ResearchFinding, IterationSearchResult } from './types.js'

export class HolocronConvexClient {
  private client: ConvexClient
  private config: HolocronConfig

  constructor(config: HolocronConfig) {
    this.config = config
    this.client = new ConvexClient(config.convexUrl)
  }

  async startResearch(params: {
    topic: string
    maxIterations?: number
    conversationId?: string
  }): Promise<{ sessionId: string; conversationId: string; status: string }> {
    const result = await this.client.action('research/index:startDeepResearch' as any, {
      topic: params.topic,
      maxIterations: params.maxIterations ?? 5,
      conversationId: params.conversationId,
    })

    return result as { sessionId: string; conversationId: string; status: string }
  }

  async getSession(sessionId: string): Promise<ResearchSession | null> {
    const result = await this.client.query('research/index:getDeepResearchSession' as any, {
      sessionId,
    })

    return result as ResearchSession | null
  }

  onUpdate<T>(
    functionName: string,
    args: Record<string, any>,
    onUpdate: (result: T | null) => void
  ): () => void {
    return this.client.onUpdate(functionName as any, args, onUpdate as any)
  }

  close(): void {
    this.client.close()
  }
}

export function createConvexClient(config: HolocronConfig): HolocronConvexClient {
  return new HolocronConvexClient(config)
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit Convex client**

```bash
git add src/convex/
git commit -m "feat: add Convex client wrapper with subscription support"
```

---

### Task 6: Create Streaming Infrastructure

**Files:**
- Create: `holocron-mcp/src/streaming/formatter.ts`
- Create: `holocron-mcp/src/streaming/subscription-manager.ts`

**Step 1: Create src/streaming directory**

```bash
mkdir -p src/streaming
```

**Step 2: Create formatter.ts**

```typescript
// src/streaming/formatter.ts
import type { ConfidenceStats } from '../convex/types.js'

export interface IterationProgress {
  type: 'iteration_progress'
  sessionId: string
  iteration: number
  status: 'completed' | 'in_progress'
  findingsCount: number
  confidenceStats: ConfidenceStats
}

export function streamProgress(data: IterationProgress): void {
  // Write JSONL to stderr for visibility (stdout reserved for MCP protocol)
  console.error(JSON.stringify(data))
}
```

**Step 3: Create subscription-manager.ts**

```typescript
// src/streaming/subscription-manager.ts
import type { HolocronConvexClient } from '../convex/client.js'
import type { ResearchSession } from '../convex/types.js'

export class SubscriptionManager {
  private subscriptions = new Map<string, () => void>()
  private client: HolocronConvexClient

  constructor(client: HolocronConvexClient) {
    this.client = client
  }

  subscribe(
    sessionId: string,
    onUpdate: (session: ResearchSession) => void,
    onError: (error: Error) => void
  ): () => void {
    const unsubscribe = this.client.onUpdate<ResearchSession>(
      'research/index:getDeepResearchSession',
      { sessionId },
      (session) => {
        if (!session) {
          onError(new Error('Session not found'))
          return
        }
        onUpdate(session)
      }
    )

    this.subscriptions.set(sessionId, unsubscribe)

    return () => {
      unsubscribe()
      this.subscriptions.delete(sessionId)
    }
  }

  cleanupAll(): void {
    this.subscriptions.forEach((unsub) => unsub())
    this.subscriptions.clear()
  }
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit streaming infrastructure**

```bash
git add src/streaming/
git commit -m "feat: add streaming formatter and subscription manager"
```

---

## Phase 2: Core Migration (Week 2)

### Task 7: Create Research Tools

**Files:**
- Create: `holocron-mcp/src/tools/research.ts`

**Step 1: Create src/tools directory**

```bash
mkdir -p src/tools
```

**Step 2: Create research.ts with researchTopic**

```typescript
// src/tools/research.ts
import type { HolocronConvexClient } from '../convex/client.js'
import type { HolocronConfig } from '../config/env.js'
import { SubscriptionManager } from '../streaming/subscription-manager.js'
import { streamProgress } from '../streaming/formatter.js'
import type { ResearchSession } from '../convex/types.js'

export interface ResearchTopicInput {
  topic: string
  maxIterations?: number
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL'
}

export interface ResearchTopicOutput {
  sessionId: string
  topic: string
  status: 'completed' | 'error'
  iterations: number
  coverageScore: number
  confidenceStats: {
    highConfidenceCount: number
    mediumConfidenceCount: number
    lowConfidenceCount: number
    averageConfidenceScore: number
    claimsWithMultipleSources: number
    totalClaims: number
  }
  findings: Array<{
    claimText: string
    confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'
    confidenceScore: number
    citations: Array<{ url: string; title: string }>
    caveats: string[]
    warnings: string[]
  }>
}

export async function researchTopic(
  client: HolocronConvexClient,
  config: HolocronConfig,
  input: ResearchTopicInput
): Promise<ResearchTopicOutput> {
  const { sessionId } = await client.startResearch({
    topic: input.topic,
    maxIterations: input.maxIterations ?? 5,
  })

  const subscriptionManager = new SubscriptionManager(client)

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('Research timeout after 5 minutes'))
    }, config.timeoutMs)

    const unsubscribe = subscriptionManager.subscribe(
      sessionId,
      (session: ResearchSession) => {
        if (session.status === 'completed' || session.status === 'error') {
          clearTimeout(timeout)
          unsubscribe()

          if (session.status === 'error') {
            reject(new Error(`Research failed: ${session.errorMessage}`))
          } else {
            resolve(formatResults(session, input.confidenceFilter))
          }
        } else {
          // Stream progress
          streamProgress({
            type: 'iteration_progress',
            sessionId,
            iteration: session.currentIteration,
            status: session.status === 'running' ? 'in_progress' : 'completed',
            findingsCount: session.findings.length,
            confidenceStats: session.confidenceStats,
          })
        }
      },
      (error: Error) => {
        clearTimeout(timeout)
        unsubscribe()
        reject(error)
      }
    )
  })
}

function formatResults(
  session: ResearchSession,
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL'
): ResearchTopicOutput {
  const filter = confidenceFilter ?? 'ALL'

  let filteredFindings = session.findings
  if (filter === 'HIGH_ONLY') {
    filteredFindings = session.findings.filter((f) => f.confidenceLevel === 'HIGH')
  } else if (filter === 'HIGH_MEDIUM') {
    filteredFindings = session.findings.filter(
      (f) => f.confidenceLevel === 'HIGH' || f.confidenceLevel === 'MEDIUM'
    )
  }

  return {
    sessionId: session.sessionId,
    topic: session.topic,
    status: 'completed',
    iterations: session.iterations,
    coverageScore: session.coverageScore,
    confidenceStats: session.confidenceStats,
    findings: filteredFindings,
  }
}

export interface SimpleResearchInput {
  topic: string
}

export interface SimpleResearchOutput {
  sessionId: string
  topic: string
  status: 'completed' | 'error'
  summary: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  durationMs: number
}

export async function simpleResearch(
  client: HolocronConvexClient,
  input: SimpleResearchInput
): Promise<SimpleResearchOutput> {
  const result = await client.startSimpleResearch({
    topic: input.topic,
  })

  return {
    sessionId: result.sessionId,
    topic: input.topic,
    status: result.status,
    summary: result.summary,
    confidence: result.confidence,
    durationMs: result.durationMs,
  }
}
```

**Step 3: Add startSimpleResearch to client**

Edit `src/convex/client.ts` and add:

```typescript
async startSimpleResearch(params: {
  topic: string
  conversationId?: string
}): Promise<{
  sessionId: string
  conversationId: string
  status: 'completed' | 'error'
  summary: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  durationMs: number
}> {
  const result = await this.client.action('research/index:startSimpleResearch' as any, {
    topic: params.topic,
    conversationId: params.conversationId,
  })

  return result as any
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit research tools**

```bash
git add src/tools/research.ts src/convex/client.ts
git commit -m "feat: add research tools with streaming support"
```

---

### Task 8: Create Session Tools

**Files:**
- Create: `holocron-mcp/src/tools/session.ts`

**Step 1: Create session.ts**

```typescript
// src/tools/session.ts
import type { HolocronConvexClient } from '../convex/client.js'
import type { ResearchSession } from '../convex/types.js'

export interface GetResearchSessionInput {
  sessionId: string
}

export async function getResearchSession(
  client: HolocronConvexClient,
  input: GetResearchSessionInput
): Promise<ResearchSession | null> {
  return await client.getSession(input.sessionId)
}
```

**Step 2: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 3: Commit session tools**

```bash
git add src/tools/session.ts
git commit -m "feat: add session retrieval tool"
```

---

### Task 9: Create Search Tools

**Files:**
- Create: `holocron-mcp/src/tools/search.ts`

**Step 1: Create search.ts**

```typescript
// src/tools/search.ts
import type { HolocronConvexClient } from '../convex/client.js'
import type { IterationSearchResult } from '../convex/types.js'

export interface SearchResearchInput {
  query: string
  limit?: number
  confidenceFilter?: 'HIGH_ONLY' | 'HIGH_MEDIUM' | 'ALL'
}

export async function searchResearch(
  client: HolocronConvexClient,
  input: SearchResearchInput
): Promise<IterationSearchResult[]> {
  // Generate embedding for query
  const embedding = await client.generateEmbedding(input.query)

  // Perform vector search
  const vectorResults = await client.vectorSearchIterations({
    embedding,
    limit: input.limit ?? 10,
  })

  // Perform full-text search
  const ftsResults = await client.fullTextSearchIterations({
    query: input.query,
    limit: input.limit ?? 10,
  })

  // Merge and deduplicate results
  const mergedResults = mergeSearchResults(vectorResults, ftsResults)

  return mergedResults.slice(0, input.limit ?? 10)
}

function mergeSearchResults(
  vectorResults: IterationSearchResult[],
  ftsResults: IterationSearchResult[]
): IterationSearchResult[] {
  const resultMap = new Map<string, IterationSearchResult>()

  // Add vector results
  vectorResults.forEach((result) => {
    const key = `${result.sessionId}-${result.iteration}`
    resultMap.set(key, result)
  })

  // Merge FTS results
  ftsResults.forEach((result) => {
    const key = `${result.sessionId}-${result.iteration}`
    const existing = resultMap.get(key)
    if (existing) {
      // Average the relevance scores
      existing.relevanceScore = (existing.relevanceScore + result.relevanceScore) / 2
    } else {
      resultMap.set(key, result)
    }
  })

  // Sort by relevance score
  return Array.from(resultMap.values()).sort(
    (a, b) => b.relevanceScore - a.relevanceScore
  )
}
```

**Step 2: Add search methods to client**

Edit `src/convex/client.ts` and add:

```typescript
async vectorSearchIterations(params: {
  embedding: number[]
  limit?: number
  sessionId?: string
}): Promise<IterationSearchResult[]> {
  const result = await this.client.query('research/index:vectorSearchIterations' as any, {
    embedding: params.embedding,
    limit: params.limit ?? 10,
    sessionId: params.sessionId,
  })

  return result as IterationSearchResult[]
}

async fullTextSearchIterations(params: {
  query: string
  limit?: number
  sessionId?: string
}): Promise<IterationSearchResult[]> {
  const result = await this.client.query('research/index:fullTextSearchIterations' as any, {
    query: params.query,
    limit: params.limit ?? 10,
    sessionId: params.sessionId,
  })

  return result as IterationSearchResult[]
}

async generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI embedding failed: ${response.statusText}`)
  }

  const data = (await response.json()) as any
  return data.data[0].embedding as number[]
}
```

**Step 3: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 4: Commit search tools**

```bash
git add src/tools/search.ts src/convex/client.ts
git commit -m "feat: add hybrid search tool with vector and FTS"
```

---

### Task 10: Create Document Storage Tools

**Files:**
- Create: `holocron-mcp/src/tools/storage.ts`

**Step 1: Create storage.ts**

```typescript
// src/tools/storage.ts
import type { HolocronConvexClient } from '../convex/client.js'

export interface StoreDocumentInput {
  content: string
  metadata?: {
    title?: string
    tags?: string[]
    source?: string
  }
}

export interface StoreDocumentOutput {
  documentId: string
  success: boolean
}

export async function storeDocument(
  client: HolocronConvexClient,
  input: StoreDocumentInput
): Promise<StoreDocumentOutput> {
  const result = await client.storeDocument(input)
  return result
}

export interface UpdateDocumentInput {
  documentId: string
  content?: string
  metadata?: {
    title?: string
    tags?: string[]
    source?: string
  }
}

export interface UpdateDocumentOutput {
  documentId: string
  success: boolean
}

export async function updateDocument(
  client: HolocronConvexClient,
  input: UpdateDocumentInput
): Promise<UpdateDocumentOutput> {
  const result = await client.updateDocument(input)
  return result
}
```

**Step 2: Add storage methods to client**

Edit `src/convex/client.ts` and add:

```typescript
async storeDocument(params: {
  content: string
  metadata?: {
    title?: string
    tags?: string[]
    source?: string
  }
}): Promise<{ documentId: string; success: boolean }> {
  const result = await this.client.mutation('documents/index:store' as any, {
    content: params.content,
    metadata: params.metadata,
  })

  return result as { documentId: string; success: boolean }
}

async updateDocument(params: {
  documentId: string
  content?: string
  metadata?: {
    title?: string
    tags?: string[]
    source?: string
  }
}): Promise<{ documentId: string; success: boolean }> {
  const result = await this.client.mutation('documents/index:update' as any, {
    documentId: params.documentId,
    content: params.content,
    metadata: params.metadata,
  })

  return result as { documentId: string; success: boolean }
}
```

**Step 3: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 4: Commit storage tools**

```bash
git add src/tools/storage.ts src/convex/client.ts
git commit -m "feat: add document storage and update tools"
```

---

### Task 11: Create Document Retrieval Tools

**Files:**
- Create: `holocron-mcp/src/tools/retrieval.ts`

**Step 1: Create retrieval.ts**

```typescript
// src/tools/retrieval.ts
import type { HolocronConvexClient } from '../convex/client.js'

export interface Document {
  _id: string
  documentId: string
  content: string
  metadata: {
    title?: string
    tags?: string[]
    source?: string
  }
  createdAt: number
  updatedAt: number
}

export interface GetDocumentInput {
  documentId: string
}

export async function getDocument(
  client: HolocronConvexClient,
  input: GetDocumentInput
): Promise<Document | null> {
  const result = await client.getDocument(input.documentId)
  return result
}

export interface ListDocumentsInput {
  limit?: number
  tags?: string[]
}

export async function listDocuments(
  client: HolocronConvexClient,
  input: ListDocumentsInput
): Promise<Document[]> {
  const result = await client.listDocuments({
    limit: input.limit ?? 100,
    tags: input.tags,
  })
  return result
}
```

**Step 2: Add retrieval methods to client**

Edit `src/convex/client.ts` and add:

```typescript
async getDocument(documentId: string): Promise<Document | null> {
  const result = await this.client.query('documents/index:get' as any, {
    documentId,
  })

  return result as Document | null
}

async listDocuments(params: {
  limit?: number
  tags?: string[]
}): Promise<Document[]> {
  const result = await this.client.query('documents/index:list' as any, {
    limit: params.limit ?? 100,
    tags: params.tags,
  })

  return result as Document[]
}
```

**Step 3: Add Document type to types.ts**

Edit `src/convex/types.ts` and add:

```typescript
export interface Document {
  _id: string
  documentId: string
  content: string
  metadata: {
    title?: string
    tags?: string[]
    source?: string
  }
  createdAt: number
  updatedAt: number
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit retrieval tools**

```bash
git add src/tools/retrieval.ts src/convex/client.ts src/convex/types.ts
git commit -m "feat: add document retrieval tools"
```

---

### Task 12: Create Hybrid Search Tools

**Files:**
- Create: `holocron-mcp/src/tools/hybrid-search.ts`

**Step 1: Create hybrid-search.ts**

```typescript
// src/tools/hybrid-search.ts
import type { HolocronConvexClient } from '../convex/client.js'
import type { Document } from '../convex/types.js'

export interface HybridSearchInput {
  query: string
  limit?: number
}

export interface SearchResult {
  document: Document
  relevanceScore: number
}

export async function hybridSearch(
  client: HolocronConvexClient,
  input: HybridSearchInput
): Promise<SearchResult[]> {
  const result = await client.hybridSearchDocuments({
    query: input.query,
    limit: input.limit ?? 10,
  })
  return result
}

export interface SearchFTSInput {
  query: string
  limit?: number
}

export async function searchFTS(
  client: HolocronConvexClient,
  input: SearchFTSInput
): Promise<SearchResult[]> {
  const result = await client.fullTextSearchDocuments({
    query: input.query,
    limit: input.limit ?? 10,
  })
  return result
}

export interface SearchVectorInput {
  query: string
  limit?: number
}

export async function searchVector(
  client: HolocronConvexClient,
  input: SearchVectorInput
): Promise<SearchResult[]> {
  const embedding = await client.generateEmbedding(input.query)
  const result = await client.vectorSearchDocuments({
    embedding,
    limit: input.limit ?? 10,
  })
  return result
}
```

**Step 2: Add hybrid search methods to client**

Edit `src/convex/client.ts` and add:

```typescript
async hybridSearchDocuments(params: {
  query: string
  limit?: number
}): Promise<SearchResult[]> {
  const result = await this.client.query('documents/index:hybridSearch' as any, {
    query: params.query,
    limit: params.limit ?? 10,
  })

  return result as SearchResult[]
}

async fullTextSearchDocuments(params: {
  query: string
  limit?: number
}): Promise<SearchResult[]> {
  const result = await this.client.query('documents/index:fullTextSearch' as any, {
    query: params.query,
    limit: params.limit ?? 10,
  })

  return result as SearchResult[]
}

async vectorSearchDocuments(params: {
  embedding: number[]
  limit?: number
}): Promise<SearchResult[]> {
  const result = await this.client.query('documents/index:vectorSearch' as any, {
    embedding: params.embedding,
    limit: params.limit ?? 10,
  })

  return result as SearchResult[]
}
```

**Step 3: Add SearchResult type to types.ts**

Edit `src/convex/types.ts` and add:

```typescript
export interface SearchResult {
  document: Document
  relevanceScore: number
}
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Commit hybrid search tools**

```bash
git add src/tools/hybrid-search.ts src/convex/client.ts src/convex/types.ts
git commit -m "feat: add hybrid search tools for documents"
```

---

## Phase 3: Streaming Integration (Week 3)

### Task 13: Create Mastra MCP Server

**Files:**
- Create: `holocron-mcp/src/mastra/stdio.ts`

**Step 1: Create src/mastra directory**

```bash
mkdir -p src/mastra
```

**Step 2: Create stdio.ts with Mastra server**

```typescript
#!/usr/bin/env bun
// src/mastra/stdio.ts
import { MCPServer } from '@mastra/core'
import { loadConfig } from '../config/env.js'
import { validateConfig } from '../config/validation.js'
import { createConvexClient } from '../convex/client.js'
import { researchTopic, simpleResearch } from '../tools/research.js'
import { getResearchSession } from '../tools/session.js'
import { searchResearch } from '../tools/search.js'
import { storeDocument, updateDocument } from '../tools/storage.js'
import { getDocument, listDocuments } from '../tools/retrieval.js'
import { hybridSearch, searchFTS, searchVector } from '../tools/hybrid-search.js'

// Load and validate configuration
const config = loadConfig()
validateConfig(config)

// Initialize Convex client
const convexClient = createConvexClient(config)

// Cleanup on process exit
process.on('SIGINT', () => {
  console.error('[holocron-mcp] Shutting down...')
  convexClient.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.error('[holocron-mcp] Shutting down...')
  convexClient.close()
  process.exit(0)
})

// Create Mastra MCP server
const server = new MCPServer({
  name: 'holocron-unified',
  version: '1.0.0',
})

// Register research tools
server.tool({
  name: 'research_topic',
  description: `Start deep research on a topic and wait for completion.

This tool performs iterative research using the Ralph Loop:
1. Starts a research session (5 iterations by default)
2. Streams progress to stderr in real-time
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
  input: {
    topic: { type: 'string', description: 'Research topic or question' },
    maxIterations: { type: 'number', description: 'Maximum iterations (default: 5)', optional: true },
    confidenceFilter: {
      type: 'string',
      enum: ['HIGH_ONLY', 'HIGH_MEDIUM', 'ALL'],
      description: 'Filter findings by confidence level (default: ALL)',
      optional: true,
    },
  },
  handler: async (input) => {
    const result = await researchTopic(convexClient, config, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
  name: 'simple_research',
  description: `Perform fast single-pass research (15-30s).

Decomposes query into 4 domain-specific queries, executes in parallel,
single synthesis pass. Returns findings immediately.

Use for:
- Quick fact-checking
- Straightforward questions
- When speed > depth

For complex topics requiring iteration, use research_topic instead.`,
  input: {
    topic: { type: 'string', description: 'Research topic or question' },
  },
  handler: async (input) => {
    const result = await simpleResearch(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
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
  input: {
    sessionId: { type: 'string', description: 'Deep research session ID' },
  },
  handler: async (input) => {
    const result = await getResearchSession(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
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
  input: {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Maximum results (default: 10)', optional: true },
    confidenceFilter: {
      type: 'string',
      enum: ['HIGH_ONLY', 'HIGH_MEDIUM', 'ALL'],
      description: 'Filter by confidence level',
      optional: true,
    },
  },
  handler: async (input) => {
    const result = await searchResearch(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

// Register document storage tools
server.tool({
  name: 'store_document',
  description: 'Store a new document in the knowledge base',
  input: {
    content: { type: 'string', description: 'Document content' },
    metadata: {
      type: 'object',
      description: 'Document metadata',
      optional: true,
      properties: {
        title: { type: 'string', optional: true },
        tags: { type: 'array', items: { type: 'string' }, optional: true },
        source: { type: 'string', optional: true },
      },
    },
  },
  handler: async (input) => {
    const result = await storeDocument(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
  name: 'update_document',
  description: 'Update an existing document',
  input: {
    documentId: { type: 'string', description: 'Document ID to update' },
    content: { type: 'string', description: 'New content', optional: true },
    metadata: {
      type: 'object',
      description: 'Updated metadata',
      optional: true,
      properties: {
        title: { type: 'string', optional: true },
        tags: { type: 'array', items: { type: 'string' }, optional: true },
        source: { type: 'string', optional: true },
      },
    },
  },
  handler: async (input) => {
    const result = await updateDocument(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

// Register document retrieval tools
server.tool({
  name: 'get_document',
  description: 'Retrieve a document by ID',
  input: {
    documentId: { type: 'string', description: 'Document ID' },
  },
  handler: async (input) => {
    const result = await getDocument(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
  name: 'list_documents',
  description: 'List all documents with optional filtering',
  input: {
    limit: { type: 'number', description: 'Maximum results (default: 100)', optional: true },
    tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags', optional: true },
  },
  handler: async (input) => {
    const result = await listDocuments(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

// Register document search tools
server.tool({
  name: 'hybrid_search',
  description: 'Search documents using hybrid vector + full-text search',
  input: {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Maximum results (default: 10)', optional: true },
  },
  handler: async (input) => {
    const result = await hybridSearch(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
  name: 'search_fts',
  description: 'Full-text keyword search across documents',
  input: {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Maximum results (default: 10)', optional: true },
  },
  handler: async (input) => {
    const result = await searchFTS(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

server.tool({
  name: 'search_vector',
  description: 'Semantic similarity search using embeddings',
  input: {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Maximum results (default: 10)', optional: true },
  },
  handler: async (input) => {
    const result = await searchVector(convexClient, input)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
})

// Start server
console.error('[holocron-mcp] Starting Mastra MCP server...')
console.error(`[holocron-mcp] Convex URL: ${config.convexUrl}`)
console.error('[holocron-mcp] Available tools:')
console.error('  Research: research_topic, simple_research, get_research_session, search_research')
console.error('  Storage: store_document, update_document')
console.error('  Retrieval: get_document, list_documents')
console.error('  Search: hybrid_search, search_fts, search_vector')

server.start()
```

**Step 3: Make executable**

```bash
chmod +x src/mastra/stdio.ts
```

**Step 4: Run type check**

```bash
bun run type-check
```

Expected: No errors

**Step 5: Test server manually**

```bash
bun run src/mastra/stdio.ts
```

Expected: Server starts, logs tools to stderr

**Step 6: Commit Mastra server**

```bash
git add src/mastra/stdio.ts
git commit -m "feat: create Mastra MCP server with all 11 tools"
```

---

### Task 14: Build Production Bundle

**Files:**
- Modify: `holocron-mcp/tsup.config.ts`

**Step 1: Run build**

```bash
bun run build
```

Expected: Creates `dist/mastra/stdio.js` and `dist/mastra/stdio.cjs`

**Step 2: Verify build output**

```bash
ls -la dist/mastra/
```

Expected: stdio.js, stdio.cjs, stdio.d.ts files exist

**Step 3: Test built server**

```bash
bun run dist/mastra/stdio.js
```

Expected: Server starts successfully

**Step 4: Commit build verification**

```bash
git add -A
git commit -m "build: verify production bundle works"
```

---

## Phase 4: Validation & Deployment (Week 4)

### Task 15: Update MCP Configuration

**Files:**
- Modify: `/Users/justinrich/.claude/mcp.json`

**Step 1: Backup current config**

```bash
cp ~/.claude/mcp.json ~/.claude/mcp.json.backup
```

**Step 2: Read current config**

```bash
cat ~/.claude/mcp.json
```

**Step 3: Update config to point to new server**

Edit `~/.claude/mcp.json` and replace holocron-mcp and holocron-general-mcp entries with:

```json
{
  "mcpServers": {
    "holocron": {
      "command": "bun",
      "args": ["run", "/Users/justinrich/Projects/holocron/holocron-mcp/dist/mastra/stdio.js"],
      "env": {
        "CONVEX_URL": "your-convex-url",
        "OPENAI_API_KEY": "your-openai-key"
      }
    }
  }
}
```

**Step 4: Restart Claude Code**

Close and reopen Claude Code to reload MCP servers

**Step 5: Verify server connection**

Check Claude Code logs for successful connection

**Step 6: Commit config update**

```bash
git add ~/.claude/mcp.json
git commit -m "config: update MCP to use new Bun server"
```

---

### Task 16: Integration Testing

**Files:**
- Create: `holocron-mcp/tests/integration.test.ts`

**Step 1: Create tests directory**

```bash
mkdir -p tests
```

**Step 2: Create integration.test.ts**

```typescript
// tests/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createConvexClient } from '../src/convex/client.js'
import { loadConfig } from '../src/config/env.js'
import { researchTopic } from '../src/tools/research.js'
import { getResearchSession } from '../src/tools/session.js'

describe('Integration Tests', () => {
  let client: ReturnType<typeof createConvexClient>
  let config: ReturnType<typeof loadConfig>

  beforeAll(() => {
    config = loadConfig()
    client = createConvexClient(config)
  })

  afterAll(() => {
    client.close()
  })

  it('should start research and stream progress', async () => {
    const result = await researchTopic(client, config, {
      topic: 'What is the capital of France?',
      maxIterations: 1,
      confidenceFilter: 'ALL',
    })

    expect(result.sessionId).toBeDefined()
    expect(result.status).toBe('completed')
    expect(result.findings.length).toBeGreaterThan(0)
  }, 60000) // 60 second timeout

  it('should retrieve session by ID', async () => {
    // First start a research session
    const researchResult = await researchTopic(client, config, {
      topic: 'What is 2+2?',
      maxIterations: 1,
    })

    // Then retrieve it
    const session = await getResearchSession(client, {
      sessionId: researchResult.sessionId,
    })

    expect(session).toBeDefined()
    expect(session?.sessionId).toBe(researchResult.sessionId)
  }, 60000)
})
```

**Step 3: Add vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 60000,
  },
})
```

**Step 4: Run integration tests**

```bash
bun run test
```

Expected: All tests pass

**Step 5: Commit integration tests**

```bash
git add tests/ vitest.config.ts
git commit -m "test: add integration tests for research flow"
```

---

### Task 17: Create Documentation

**Files:**
- Create: `holocron-mcp/README.md`

**Step 1: Create README.md**

```markdown
# Holocron MCP Unified Server

Unified MCP server exposing Holocron research and document management via Bun + Mastra framework with Convex realtime streaming.

## Features

- **Deep Research**: Iterative research with confidence scoring and real-time progress streaming
- **Document Management**: Store, update, retrieve, and search documents
- **Hybrid Search**: Combined vector + full-text search for optimal relevance
- **Real-time Streaming**: Progress updates via Convex subscriptions (stderr)
- **11 Consolidated Tools**: Research, session, storage, retrieval, and search operations

## Requirements

- Bun >= 1.0.0
- Convex account with deployed backend
- OpenAI API key (for embeddings)

## Installation

```bash
bun install
bun run build
```

## Configuration

Set environment variables:

```bash
export CONVEX_URL="https://your-deployment.convex.cloud"
export OPENAI_API_KEY="sk-..."
export POLL_INTERVAL_MS=2000  # Optional, default: 2000
export TIMEOUT_MS=300000       # Optional, default: 300000 (5 minutes)
```

## Usage

### As MCP Server (Claude Code)

Add to `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "holocron": {
      "command": "bun",
      "args": ["run", "/path/to/holocron-mcp/dist/mastra/stdio.js"],
      "env": {
        "CONVEX_URL": "https://your-deployment.convex.cloud",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Development

```bash
bun run dev
```

## Tools

### Research Tools

1. **research_topic** - Deep iterative research with streaming progress
2. **simple_research** - Fast single-pass research (15-30s)
3. **get_research_session** - Retrieve session by ID
4. **search_research** - Hybrid search across past findings

### Document Storage

5. **store_document** - Create new document
6. **update_document** - Update existing document

### Document Retrieval

7. **get_document** - Get document by ID
8. **list_documents** - List with optional filtering

### Document Search

9. **hybrid_search** - Vector + full-text search
10. **search_fts** - Full-text keyword search
11. **search_vector** - Semantic similarity search

## Architecture

- **Runtime**: Bun
- **Framework**: Mastra MCP
- **Backend**: Convex (with subscriptions)
- **Embeddings**: OpenAI text-embedding-3-small
- **Build**: tsup (dual ESM/CJS)

## Testing

```bash
bun run test
```

## License

MIT
```

**Step 2: Commit documentation**

```bash
git add README.md
git commit -m "docs: add comprehensive README for unified server"
```

---

### Task 18: Create Git Release Tag

**Files:**
- None (git operations only)

**Step 1: Verify all tests pass**

```bash
bun run test
bun run type-check
bun run build
```

Expected: All commands succeed with exit code 0

**Step 2: Create release tag**

```bash
git tag -a v1.0.0-bun-mastra -m "Release: Bun + Mastra migration complete"
```

**Step 3: Push tag to remote**

```bash
git push origin v1.0.0-bun-mastra
```

**Step 4: Verify tag exists**

```bash
git tag -l | grep v1.0.0
```

Expected: v1.0.0-bun-mastra listed

---

### Task 19: Final Verification Checklist

**Files:**
- None (verification only)

**Step 1: Verify server starts**

```bash
cd /Users/justinrich/Projects/holocron/holocron-mcp
bun run dist/mastra/stdio.js
```

Expected: Server logs appear in stderr, no errors

**Step 2: Verify all 11 tools listed**

Check stderr output contains all tool names:
- research_topic
- simple_research
- get_research_session
- search_research
- store_document
- update_document
- get_document
- list_documents
- hybrid_search
- search_fts
- search_vector

**Step 3: Test via Claude Code**

Open Claude Code, invoke `/research "test query"` skill

Expected: Tool executes successfully

**Step 4: Verify streaming works**

Run research_topic tool, watch stderr for progress updates

Expected: JSONL progress messages appear in stderr

**Step 5: Performance comparison**

Compare latency vs old polling implementation:
- Old: ~2s per poll iteration
- New: Instant updates via subscription

Expected: Faster or equal performance

---

## Success Criteria

### Functional Requirements
- ✅ All 11 tools work with identical signatures
- ✅ Research progress streams to stderr in real-time
- ✅ Final MCP responses match current format
- ✅ Subscriptions clean up properly on completion/error

### Performance Requirements
- ✅ Latency ≤ current implementation
- ✅ Memory usage ≤ current implementation
- ✅ No polling overhead (instant updates via subscriptions)

### Quality Requirements
- ✅ Type checking passes
- ✅ Integration tests pass
- ✅ Zero breaking changes for existing skills
- ✅ Documentation complete

## Rollback Plan

If issues arise:

```bash
# Stop using new server
# Edit ~/.claude/mcp.json to remove holocron entry

# Restore old servers
cd /Users/justinrich/Projects/holocron
rm -rf holocron-mcp
rm -rf holocron-general-mcp
mv holocron-mcp.backup holocron-mcp
mv holocron-general-mcp.old holocron-general-mcp

# Restore old MCP config
cp ~/.claude/mcp.json.backup ~/.claude/mcp.json

# Rollback git
git checkout pre-bun-migration
```

---

## Execution Options

Plan saved to `docs/plans/2026-03-08-mcp-bun-mastra-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
