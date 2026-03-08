# Holocron MCP Server Migration to Bun + Mastra with Convex Streaming

**Date:** 2026-03-08
**Author:** Claude Sonnet 4.5
**Status:** Approved

## Executive Summary

Migrate the Holocron MCP server from Node.js + standard MCP SDK to Bun + Mastra MCP framework with Convex realtime streaming. This migration consolidates two separate MCP servers (`holocron-mcp` and `holocron-general-mcp`) into a single unified server with 11 tools total, while maintaining 100% backward compatibility with existing tool signatures.

**Key Benefits:**
- Real-time progress streaming via Convex subscriptions (replaces HTTP polling)
- Progressive stdout updates visible in Claude Code terminal
- Simplified architecture with Mastra's MCP abstractions
- Faster performance with Bun runtime
- Single consolidated server (easier maintenance)

**Migration Strategy:** Clean slate rewrite with fresh optimal architecture

## Requirements

### User Requirements
1. **Progressive stdout streaming** - Stream intermediate research findings to stdout as each iteration completes
2. **Consolidate both servers** - Merge `holocron-mcp` and `holocron-general-mcp` into one
3. **Backward compatibility** - Keep all tool signatures unchanged
4. **Replace holocron-mcp directory** - Convert in place, archive old general server

### Technical Requirements
- **Runtime:** Bun (replaces Node.js >= 18)
- **Framework:** Mastra MCP (`@mastra/core`)
- **Convex Client:** ConvexClient with subscriptions (replaces ConvexHttpClient polling)
- **Build:** TypeScript + tsup for dual ESM/CJS output
- **Transport:** Stdio (unchanged from current)

## Architecture

### Technology Stack

**Core Dependencies:**
```json
{
  "dependencies": {
    "@mastra/core": "^latest",
    "convex": "^1.18.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "bun-types": "^latest",
    "tsup": "^latest",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

**Runtime Environment:**
- Bun >= 1.0.0
- TypeScript 5.7+
- ESM module system

### Directory Structure

```
holocron-mcp/
├── src/
│   ├── mastra/
│   │   └── stdio.ts              # Mastra MCPServer entry point (#!/usr/bin/env bun)
│   │
│   ├── tools/
│   │   ├── research.ts            # research_topic, simple_research
│   │   ├── session.ts             # get_research_session
│   │   ├── search.ts              # search_research
│   │   ├── storage.ts             # store_document, update_document
│   │   ├── retrieval.ts           # get_document, list_documents
│   │   └── hybrid-search.ts       # hybrid_search, search_fts, search_vector
│   │
│   ├── convex/
│   │   ├── client.ts              # ConvexClient wrapper with subscriptions
│   │   └── types.ts               # Convex TypeScript types
│   │
│   ├── streaming/
│   │   ├── formatter.ts           # stdout progress formatter (JSONL)
│   │   └── subscription-manager.ts # Convex subscription lifecycle management
│   │
│   ├── config/
│   │   ├── env.ts                 # Environment variable loading
│   │   └── validation.ts          # Zod validation schemas
│   │
│   └── types/
│       └── tools.ts               # Tool input/output type definitions
│
├── package.json                    # Bun + Mastra dependencies
├── tsconfig.json                   # TypeScript configuration
├── tsup.config.ts                  # Dual ESM/CJS build config
├── vitest.config.ts                # Test configuration
└── README.md                       # Updated documentation
```

### Consolidated Tool Set (11 tools total)

**Research Tools** (from `holocron-mcp`):
1. `research_topic` - Deep research with streaming progress
2. `simple_research` - Fast single-pass research
3. `get_research_session` - Retrieve session by ID
4. `search_research` - Hybrid search across findings

**Document Storage Tools** (from `holocron-general-mcp`):
5. `store_document` - Create new document
6. `update_document` - Update existing document

**Document Retrieval Tools** (from `holocron-general-mcp`):
7. `get_document` - Fetch document by ID
8. `list_documents` - List all documents with filtering

**Document Search Tools** (from `holocron-general-mcp`):
9. `hybrid_search` - Combined vector + full-text search
10. `search_fts` - Full-text keyword search
11. `search_vector` - Semantic similarity search

All tool signatures remain identical to current implementations.

## Streaming Data Flow

### Research Topic Tool Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. MCP Tool Call: research_topic({ topic, maxIterations }) │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Start Convex Action: research/index:startDeepResearch   │
│    Returns: { sessionId, conversationId, status }           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Subscribe to Session Updates                             │
│    ConvexClient.onUpdate(getDeepResearchSession, ...)       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Stream Progress to stderr (JSONL format)                 │
│    For each iteration completion:                           │
│    {                                                         │
│      "type": "iteration_progress",                          │
│      "sessionId": "...",                                     │
│      "iteration": 2,                                         │
│      "status": "completed",                                  │
│      "findingsCount": 15,                                    │
│      "confidenceStats": {...}                                │
│    }                                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Detect Completion: session.status === "completed"        │
│    - Unsubscribe from Convex                                │
│    - Fetch final findings                                   │
│    - Apply confidence filter                                │
│    - Return MCP response (same format as current)           │
└─────────────────────────────────────────────────────────────┘
```

### Key Implementation Components

**Subscription Manager** (`src/streaming/subscription-manager.ts`):
```typescript
class SubscriptionManager {
  private subscriptions = new Map<string, () => void>()

  subscribe(
    sessionId: string,
    onUpdate: (session: ResearchSession) => void,
    onError: (error: Error) => void
  ): () => void {
    const unsubscribe = convexClient.onUpdate(
      api.research.getDeepResearchSession,
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
    this.subscriptions.forEach(unsub => unsub())
    this.subscriptions.clear()
  }
}
```

**Streaming Formatter** (`src/streaming/formatter.ts`):
```typescript
interface IterationProgress {
  type: 'iteration_progress'
  sessionId: string
  iteration: number
  status: 'completed' | 'in_progress'
  findingsCount: number
  confidenceStats: ConfidenceStats
}

function streamProgress(data: IterationProgress): void {
  // Write JSONL to stderr for visibility (stdout is reserved for MCP protocol)
  console.error(JSON.stringify(data))
}
```

### Stdout vs Stderr

- **stdout:** MCP protocol messages only (tool responses)
- **stderr:** Progress streaming, diagnostic logs (visible in Claude Code terminal)

This separation ensures MCP protocol integrity while providing real-time visibility.

## Error Handling & Reliability

### Error Categories

1. **Subscription Failures** - Connection lost, network timeout
2. **Convex Action Errors** - Research failed, rate limits hit
3. **Tool Parameter Validation** - Invalid input parameters
4. **Unexpected Disconnections** - Network issues during streaming

### Error Handling Strategy

**Timeout Handling:**
```typescript
async function researchTopic(input: ResearchTopicInput): Promise<ResearchTopicOutput> {
  const { sessionId } = await client.startResearch({
    topic: input.topic,
    maxIterations: input.maxIterations ?? 5,
  })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error('Research timeout after 5 minutes'))
    }, config.timeoutMs)

    const unsubscribe = subscriptionManager.subscribe(
      sessionId,
      (session) => {
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
            status: session.status,
            findingsCount: session.findings.length,
            confidenceStats: session.confidenceStats,
          })
        }
      },
      (error) => {
        clearTimeout(timeout)
        unsubscribe()
        reject(error)
      }
    )
  })
}
```

**Auto-Cleanup on Process Exit:**
```typescript
process.on('SIGINT', () => {
  subscriptionManager.cleanupAll()
  process.exit(0)
})

process.on('SIGTERM', () => {
  subscriptionManager.cleanupAll()
  process.exit(0)
})
```

**MCP Error Responses:**
- All errors return proper MCP error format via Mastra
- Streaming progress stops gracefully on error
- Partial results available if research partially completed
- Error messages logged to stderr, never stdout

## Migration Plan

### Phase 1: Foundation (Week 1)

**Objectives:**
- Set up new Bun project structure
- Configure build toolchain
- Verify basic MCP server functionality

**Tasks:**
1. Archive current `holocron-mcp/` to `holocron-mcp.backup/`
2. Initialize new Bun project in `holocron-mcp/`
3. Install Mastra, Convex, tsup dependencies
4. Configure tsup for dual ESM/CJS build
5. Create basic Mastra MCPServer with one test tool
6. Verify stdio transport works with Claude Code

**Acceptance Criteria:**
- `bun run build` produces ESM and CJS outputs
- Basic MCP server responds to tool call
- Claude Code can connect via stdio transport

### Phase 2: Core Migration (Week 2)

**Objectives:**
- Migrate Convex client with subscription support
- Port all 11 tool signatures
- Implement subscription manager

**Tasks:**
1. Create `ConvexClient` wrapper with subscription methods
2. Implement `SubscriptionManager` class
3. Migrate all 11 tool definitions with identical signatures
4. Implement streaming formatter utilities
5. Write unit tests for each tool

**Acceptance Criteria:**
- All tools accept same parameters as current
- Convex subscriptions work in Bun runtime
- Unit tests pass for tool validation

### Phase 3: Streaming Integration (Week 3)

**Objectives:**
- Add streaming to `research_topic` tool
- Test progress updates in terminal
- Verify subscription lifecycle management

**Tasks:**
1. Implement `research_topic` with Convex subscription
2. Add progress streaming to stderr
3. Test with real Convex backend
4. Verify subscription cleanup on completion/error
5. Add timeout handling
6. Test error recovery paths

**Acceptance Criteria:**
- Progress visible in Claude Code stderr
- Final MCP response format unchanged
- Subscriptions cleaned up properly
- Errors handled gracefully

### Phase 4: Validation & Deployment (Week 4)

**Objectives:**
- Archive old servers
- Update MCP configuration
- Validate all tools end-to-end
- Performance testing

**Tasks:**
1. Archive `holocron-general-mcp/` to `holocron-general-mcp.old/`
2. Update `.claude/mcp.json` to point to new server
3. Run integration tests with real Convex
4. Performance comparison vs old polling implementation
5. Update README and documentation
6. Create git tag `v1.0.0-bun-mastra`

**Acceptance Criteria:**
- All 11 tools work via Claude Code
- Streaming visible in terminal
- Performance meets or exceeds current
- Documentation updated

## Testing Strategy

### Unit Tests (Vitest)

**Test Coverage:**
- Tool input validation (Zod schemas)
- Subscription manager lifecycle (subscribe, unsubscribe, cleanup)
- Streaming formatter output format
- Error handling paths (timeout, connection loss)

**Example Test:**
```typescript
describe('SubscriptionManager', () => {
  it('subscribes and unsubscribes cleanly', async () => {
    const manager = new SubscriptionManager(mockClient)
    const onUpdate = vi.fn()
    const unsubscribe = manager.subscribe('session-123', onUpdate, vi.fn())

    expect(manager.subscriptions.size).toBe(1)

    unsubscribe()

    expect(manager.subscriptions.size).toBe(0)
  })
})
```

### Integration Tests

**Test Scenarios:**
1. Full research flow with real Convex backend
2. Streaming progress updates appear in stderr
3. Subscription cleanup on completion
4. Tool signature compatibility with current tools
5. Error recovery (timeout, network failure)

**Test Environment:**
- Real Convex deployment (dev environment)
- Actual Claude Code MCP connection
- Network simulation (throttling, disconnects)

### Manual Verification Checklist

- [ ] Connect via Claude Code MCP settings
- [ ] Run `research_topic` tool, observe stderr progress
- [ ] Verify final MCP response format unchanged
- [ ] Test all 11 tools end-to-end
- [ ] Verify timeout handling (force 5min timeout)
- [ ] Test error scenarios (invalid params, network loss)
- [ ] Compare performance vs old server (latency, memory)

## Rollback Plan

**Backup Strategy:**
```bash
# Before migration
mv holocron-mcp holocron-mcp.backup
mv holocron-general-mcp holocron-general-mcp.old

# If rollback needed
mv holocron-mcp holocron-mcp.new
mv holocron-mcp.backup holocron-mcp
mv holocron-general-mcp.old holocron-general-mcp

# Revert MCP config
# Edit .claude/mcp.json to restore old servers
```

**Git Tags:**
- `pre-bun-migration` - Last commit before migration
- `v1.0.0-bun-mastra` - First working Bun version
- Each phase gets a tag for incremental rollback

**Risk Mitigation:**
- Old servers remain archived for instant restoration
- MCP config change is single-file edit
- Git history preserved for code-level rollback

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
- ✅ Unit test coverage ≥ 80%
- ✅ Integration tests pass
- ✅ Zero breaking changes for existing skills
- ✅ Documentation updated

## References

- [Mastra MCP Documentation](https://mastra.ai/docs/mcp/publishing-mcp-server)
- [Convex Bun Client](https://docs.convex.dev/client/javascript/bun)
- [Current holocron-mcp Implementation](../holocron-mcp/src/index.ts)
- [Current holocron-general-mcp Implementation](../holocron-general-mcp/src/index.ts)

---

**Approved By:** User
**Approval Date:** 2026-03-08
