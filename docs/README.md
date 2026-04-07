# Holocron Documentation

Welcome to the Holocron documentation. This directory contains guides and technical documentation for developers.

## Getting Started

- [Convex Setup Guide](CONVEX-SETUP.md) - Complete guide to setting up Convex backend
- [Main README](../README.md) - Project overview and quick start

## Architecture Documentation

Located in `.spec/` directory:

- [Migration Summary](../.spec/MIGRATION-SUMMARY.md) - Executive summary of Supabase → Convex migration
- [Migration Analysis](../.spec/MIGRATION-ANALYSIS.md) - Detailed architecture analysis
- [Backend Migration PRD](../.spec/prd/12-uc-backend-migration.md) - Complete migration use cases

## Development Guides

### Backend (Convex)

- **Schema**: [convex/schema.ts](../convex/schema.ts) - Database schema with 9 tables
- **Functions**: Organized by domain in `convex/` directory
  - `conversations/` - Conversation CRUD operations
  - `chatMessages/` - Chat message management
  - `documents/` - Document storage + search (full-text, vector, hybrid)
  - `tasks/` - Background task tracking
  - `research/` - Research workflow orchestration
  - `chat/` - AI chat integration

### Frontend (React Native)

- **Rules**: [CLAUDE.md](../CLAUDE.md) - React and React Native development standards
- **Hooks**: [hooks/](../hooks/) - Custom React hooks using Convex
- **Components**: [components/](../components/) - Reusable UI components
- **Screens**: [app/](../app/) - Expo Router screens

### CLI Tool

- **Setup**: [cli/README.md](../cli/README.md) - Python CLI installation and usage
- **Client**: [python/convex_client/](../python/convex_client/) - Convex HTTP client library

## Key Concepts

### Convex Reactivity

Convex provides automatic real-time updates without manual subscription management:

```typescript
// Component automatically re-renders when data changes
const conversations = useQuery(api.conversations.queries.list)
```

**Before (Supabase)**: 362 lines of subscription code
**After (Convex)**: Direct entity watching with `useQuery`

### Schema Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `conversations` | Chat threads | Title, timestamps |
| `chatMessages` | Chat messages | Role, content, type |
| `documents` | Knowledge base | Vector embeddings (1024d) |
| `tasks` | Background jobs | Status, progress, results |
| `researchSessions` | Research workflows | Query, status, findings |
| `researchIterations` | Research results | Iteration data, sources |
| `deepResearchSessions` | Multi-agent research | Deep research orchestration |
| `deepResearchIterations` | Deep research results | Iteration results |
| `citations` | Source citations | URL, title, claim text |

### Search Capabilities

Holocron supports three search modes:

1. **Full-Text Search (FTS)**: Keyword matching with BM25 ranking
2. **Vector Search**: Semantic similarity using OpenAI embeddings (1024d)
3. **Hybrid Search**: Combines FTS + vector with score blending

See [documents/search.ts](../convex/documents/search.ts) for implementation.

## Migration Notes

### What Changed

The migration from Supabase to Convex (March 2026) brought significant improvements:

**Removed** (~570 lines):
- `useLongRunningTask` hook (362 lines)
- `use-chat-realtime.ts` (81 lines)
- `taskRealtimeRegistry.ts` (127 lines)
- Manual subscription management
- Supabase client and dependencies

**Added**:
- Convex client with automatic reactivity
- Simplified background job tracking
- Type-safe generated API
- Better observability (Convex dashboard)

**Results**:
- 30%+ code reduction
- Zero data loss (100% validation pass)
- Maintained real-time update latency (~500ms)
- Improved developer experience

### Data Integrity

All data was successfully migrated:
- ✅ 9 tables migrated
- ✅ Vector embeddings preserved (1024 dimensions)
- ✅ Foreign key relationships maintained
- ✅ Row counts validated (100% match)

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Type checking
pnpm typecheck
```

### Test Organization

- `tests/convex/` - Convex function tests
- `tests/components/` - React component tests
- `tests/integration/` - Integration tests

## Development Workflow

### 1. Start Convex Dev Server

```bash
npx convex dev
```

Keep this running while developing. It watches for changes and auto-deploys.

### 2. Start Expo Dev Server

```bash
pnpm start
```

### 3. Make Changes

- Edit Convex functions in `convex/`
- Edit React components in `components/` or `app/`
- Changes hot-reload automatically

### 4. View Logs

- **Convex logs**: Terminal running `npx convex dev`
- **React logs**: Expo dev tools or Metro bundler
- **Convex dashboard**: [dashboard.convex.dev](https://dashboard.convex.dev)

## Common Tasks

### Add a New Table

1. Edit `convex/schema.ts`:
```typescript
myTable: defineTable({
  field1: v.string(),
  field2: v.number(),
})
```

2. Convex auto-deploys the schema
3. Generated types update automatically

### Add a New Function

1. Create file: `convex/myFeature/queries.ts`
2. Define function:
```typescript
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('myTable').collect()
  }
})
```

3. Use in React:
```typescript
const items = useQuery(api.myFeature.queries.list)
```

### Search Documents

```typescript
// Full-text search
const results = useQuery(api.documents.search.fullTextSearch, {
  query: 'machine learning'
})

// Vector search (semantic)
const results = useQuery(api.documents.search.vectorSearch, {
  query: 'machine learning'
})

// Hybrid search (best results)
const results = useQuery(api.documents.search.hybridSearch, {
  query: 'machine learning',
  alpha: 0.5  // 0.0 = FTS only, 1.0 = vector only
})
```

## Troubleshooting

See [CONVEX-SETUP.md](CONVEX-SETUP.md#troubleshooting) for common issues and solutions.

## Additional Resources

### External Documentation

- [Convex Documentation](https://docs.convex.dev)
- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev)
- [NativeWind Documentation](https://www.nativewind.dev)

### Convex Guides

- [React Hooks Guide](https://docs.convex.dev/client/react)
- [Schema Design](https://docs.convex.dev/database/schemas)
- [Vector Search](https://docs.convex.dev/database/vector-search)
- [Background Jobs](https://stack.convex.dev/background-job-management)

## Contributing

See [RULES.md](../RULES.md) for development standards and coding guidelines.
