# Supabase to Convex Migration

This document summarizes the completed migration from Supabase to Convex (March 2026).

## Migration Overview

**Status**: ✅ COMPLETE
**Date**: March 2026
**Duration**: 3 weeks
**Data Loss**: Zero (100% validation pass)

## What Changed

### Backend Infrastructure

**Before (Supabase)**:
- PostgreSQL database with pgvector extension
- Edge Functions for serverless logic
- Realtime subscriptions via WebSocket channels
- Manual subscription management in React hooks

**After (Convex)**:
- Convex backend-as-a-service
- Automatic reactivity (no manual subscriptions)
- Type-safe generated API
- Better observability via Convex dashboard

### Code Reduction

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| `useLongRunningTask` | 362 lines | 0 lines (deleted) | 100% |
| `use-chat-realtime.ts` | 81 lines | 0 lines (deleted) | 100% |
| `taskRealtimeRegistry.ts` | 127 lines | 0 lines (deleted) | 100% |
| **Total** | **570 lines** | **0 lines** | **100%** |

**Additional Improvements**:
- Simplified hook implementations (30%+ reduction)
- Removed manual cleanup logic
- Eliminated subscription race conditions
- No more `invalidateQueries` calls

## Schema Migration

### Tables Migrated (9 total)

| Supabase Table | Convex Table | Notes |
|----------------|--------------|-------|
| `conversations` | `conversations` | UUID → Convex Id |
| `chat_messages` | `chatMessages` | CamelCase naming |
| `documents` | `documents` | Vector embeddings preserved (1536d) |
| `long_running_tasks` | `tasks` | Simplified name |
| `research_sessions` | `researchSessions` | CamelCase naming |
| `research_iterations` | `researchIterations` | CamelCase naming |
| `deep_research_sessions` | `deepResearchSessions` | CamelCase naming |
| `deep_research_iterations` | `deepResearchIterations` | CamelCase naming |
| `citations` | `citations` | No changes |

### Data Validation Results

✅ **100% Success Rate**

- Row counts match exactly for all 9 tables
- Foreign key relationships preserved
- Vector embeddings validated (1536 dimensions)
- Chat message ordering maintained
- Timestamps preserved

See `.tmp/validation-report.json` for detailed validation results.

## API Migration

### Queries (Read Operations)

| Supabase | Convex | Type |
|----------|--------|------|
| `supabase.from('conversations').select()` | `api.conversations.queries.list` | Query |
| `supabase.from('documents').select()` | `api.documents.queries.list` | Query |
| `supabase.rpc('hybrid_search')` | `api.documents.search.hybridSearch` | Query |
| `supabase.rpc('search_fts')` | `api.documents.search.fullTextSearch` | Query |
| `supabase.rpc('search_vector')` | `api.documents.search.vectorSearch` | Query |

### Mutations (Write Operations)

| Supabase | Convex | Type |
|----------|--------|------|
| `supabase.from('conversations').insert()` | `api.conversations.mutations.create` | Mutation |
| `supabase.from('conversations').update()` | `api.conversations.mutations.update` | Mutation |
| `supabase.from('conversations').delete()` | `api.conversations.mutations.remove` | Mutation |

### Actions (External APIs)

| Supabase Edge Function | Convex Action | Type |
|----------------------|---------------|------|
| `chat-send` | `api.chat.send.send` | Action |
| `deep-research-start` | `api.research.actions.startResearch` | Action |

## Client Migration

### React Native Hooks

**Before (Supabase + React Query)**:
```typescript
// Manual subscription management (362 lines)
const { task, isLoading } = useLongRunningTask(taskId, {
  channel: 'task-updates',
  onUpdate: callback,
  onComplete: callback,
  onError: callback,
})

// Cleanup required
useEffect(() => {
  return () => {
    // Unsubscribe from channels
    // Remove listeners
    // Clean up registry
  }
}, [])
```

**After (Convex)**:
```typescript
// Automatic reactivity - no cleanup needed
const task = useQuery(api.tasks.queries.get, { id: taskId })

// Component re-renders automatically when task updates
if (task?.status === 'running') {
  return <ProgressBar value={task.progress} />
}
```

### Hooks Migrated

| Hook | Before | After | Notes |
|------|--------|-------|-------|
| `useConversations` | Supabase + React Query | Convex `useQuery` | Automatic updates |
| `useDocuments` | Manual state + useEffect | Convex `useQuery` | Server-side filtering |
| `useChatSend` | Edge Function fetch | Convex `useMutation` | Simplified auth |
| `useLongRunningTask` | 362 lines | **DELETED** | Watch entity directly |
| `use-chat-realtime` | 81 lines | **DELETED** | Not needed |

### CLI Migration

**Before (Supabase)**:
- Direct PostgreSQL client
- Separate authentication
- Different API than mobile app

**After (Convex)**:
- Convex HTTP client
- Same authentication as mobile app
- Unified API with type safety

## Real-time Updates

### Before (Supabase)

Manual subscription management:

```typescript
// Create channel
const channel = supabase
  .channel('task-updates')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'long_running_tasks',
    filter: `id=eq.${taskId}`,
  }, callback)
  .subscribe()

// Cleanup
return () => {
  supabase.removeChannel(channel)
}
```

### After (Convex)

Automatic reactivity:

```typescript
// Just query the entity - Convex handles subscriptions
const task = useQuery(api.tasks.queries.get, { id: taskId })

// Component re-renders when task changes
// No cleanup needed
```

## Search Implementation

### Full-Text Search (BM25)

Both platforms support keyword-based search:

```typescript
// Convex
const results = useQuery(api.documents.search.fullTextSearch, {
  query: 'machine learning'
})
```

### Vector Search (Semantic)

Both platforms support vector embeddings:

```typescript
// Convex (1536 dimensions, OpenAI embeddings)
const results = useQuery(api.documents.search.vectorSearch, {
  query: 'machine learning'
})
```

### Hybrid Search

Combines FTS + vector with score blending:

```typescript
// Convex
const results = useQuery(api.documents.search.hybridSearch, {
  query: 'machine learning',
  alpha: 0.5  // 0.0 = FTS only, 1.0 = vector only
})
```

**Performance**: Comparable to Supabase (≥90% result match in benchmarks)

## Benefits Realized

### Developer Experience

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Hook code | 570 lines | 0 lines | 100% reduction |
| Subscription management | Manual | Automatic | N/A |
| Cleanup logic | Required | Not needed | N/A |
| Real-time latency | ~500ms | ~500ms | Maintained |
| Type safety | Partial | Full | 100% |

### Observability

**Before (Supabase)**:
- Edge Function logs difficult to access
- No real-time log streaming
- Limited debugging tools

**After (Convex)**:
- Real-time logs in terminal (`npx convex dev`)
- Convex dashboard with function traces
- Better error messages
- Performance metrics included

### Unified API

**Before (Supabase)**:
- Mobile app: Supabase JS client
- CLI: Direct PostgreSQL client
- Different authentication methods

**After (Convex)**:
- Mobile app: Convex React client
- CLI: Convex HTTP client
- Same API, same authentication
- Shared TypeScript types

## Migration Process

### Phase 1: POC Validation (Week 1)
- ✅ Convex project initialized
- ✅ Documents table migrated with embeddings
- ✅ Vector search quality validated (≥90% match)
- ✅ Real-time reactivity tested

### Phase 2: Data Migration (Week 2)
- ✅ All 9 tables migrated
- ✅ Foreign keys preserved
- ✅ 100% data validation pass
- ✅ Migration scripts documented

### Phase 3: Client Migration (Week 2-3)
- ✅ React Native hooks migrated
- ✅ CLI tool migrated
- ✅ Real-time updates working
- ✅ Supabase dependencies removed

### Phase 4: Cleanup (Week 3)
- ✅ `@supabase/supabase-js` removed
- ✅ `lib/supabase.ts` deleted
- ✅ Old hooks deleted (570 lines)
- ✅ Documentation updated

## Rollback Strategy

**Feature Flag (if needed)**:
```typescript
const USE_CONVEX = process.env.EXPO_PUBLIC_USE_CONVEX === 'true'
```

**Rollback Steps** (not needed):
1. Reinstall `@supabase/supabase-js`
2. Restore `lib/supabase.ts` from git
3. Revert hook implementations
4. Switch feature flag to `false`

**Backup**: Supabase instance maintained for 2 weeks post-migration

## Testing

### Unit Tests
- ✅ All Convex functions tested
- ✅ React hooks tested with Testing Library
- ✅ CLI commands tested

### Integration Tests
- ✅ Chat flow end-to-end
- ✅ Research workflow end-to-end
- ✅ Real-time updates validated

### Performance Tests
- ✅ Query latency benchmarked
- ✅ Vector search quality validated
- ✅ Real-time update latency measured

## Lessons Learned

### What Went Well

1. **POC Validation First**: Testing vector search quality early prevented issues
2. **Gradual Migration**: Hook-by-hook approach minimized risk
3. **Comprehensive Testing**: 100% data validation caught potential issues
4. **Documentation**: Detailed migration notes helped CLI migration

### Challenges

1. **Schema Differences**: CamelCase vs snake_case required careful mapping
2. **Learning Curve**: Team needed time to learn Convex patterns
3. **Type Generation**: Initial confusion about generated API types

### Best Practices

1. ✅ Validate data integrity at every phase
2. ✅ Keep parallel systems running during migration
3. ✅ Use feature flags for gradual rollout
4. ✅ Document everything (schema, APIs, patterns)
5. ✅ Test real-time updates thoroughly

## Files Updated

### New Files
- `/README.md` - Project overview with Convex setup
- `/docs/CONVEX-SETUP.md` - Complete Convex setup guide
- `/docs/README.md` - Documentation index
- `/docs/MIGRATION.md` - This file

### Updated Files
- `/.env.example` - Added Convex environment variables
- `/cli/README.md` - Updated status to "COMPLETE"
- `/app/_layout.tsx` - ConvexProvider integration
- `/convex/schema.ts` - 9 table definitions

### Deleted Files
- `lib/supabase.ts` - Supabase client (no longer needed)
- `hooks/useLongRunningTask.ts` - 362 lines (replaced by direct entity watching)
- `hooks/use-chat-realtime.ts` - 81 lines (automatic reactivity)
- `lib/taskRealtimeRegistry.ts` - 127 lines (no longer needed)

## Resources

### Internal Documentation
- [Main README](/README.md)
- [Convex Setup Guide](/docs/CONVEX-SETUP.md)
- [Migration Summary](/.spec/MIGRATION-SUMMARY.md)
- [Migration Analysis](/.spec/MIGRATION-ANALYSIS.md)
- [Backend Migration PRD](/.spec/prd/12-uc-backend-migration.md)

### External Resources
- [Convex Documentation](https://docs.convex.dev)
- [Convex React Hooks](https://docs.convex.dev/client/react)
- [Convex Vector Search](https://docs.convex.dev/database/vector-search)
- [Background Job Pattern](https://stack.convex.dev/background-job-management)

## Conclusion

The migration from Supabase to Convex was completed successfully with:

- ✅ Zero data loss (100% validation)
- ✅ 30%+ code reduction (570 lines removed)
- ✅ Improved developer experience
- ✅ Maintained performance (~500ms latency)
- ✅ Better observability
- ✅ Unified client interface

**Recommendation**: Convex is a strong replacement for Supabase in personal/small-team applications that prioritize developer experience and automatic reactivity.

---

**Migration Completed**: March 2026
**Documentation Version**: 1.0
