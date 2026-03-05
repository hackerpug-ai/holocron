# Migration Plan Summary: Supabase to Convex

**Status**: PLANNING COMPLETE
**Next Phase**: Phase 0 - Proof of Concept
**Timeline**: 6-8 weeks total

---

## Key Findings

### Current State Analysis

**React Native Mobile App**:
- 6 custom hooks using Supabase + React Query
- Manual real-time subscription management
- 362 lines for `useLongRunningTask` hook alone
- Direct Supabase Edge Function calls for chat

**CLI Skill**:
- Direct Supabase client usage
- No React/React Query (Node.js environment)
- RPC calls for search functionality

### Migration Benefits

**Code Reduction**:
- 78% reduction in `useLongRunningTask` (362 → 80 lines)
- Complete elimination of `use-chat-realtime.ts` (81 lines)
- Complete elimination of `taskRealtimeRegistry.ts` (127 lines)
- **Total: >30% code reduction** expected

**Developer Experience**:
- No manual subscription management
- Automatic reactivity via Convex queries
- No cleanup logic for WebSocket connections
- Type-safe API from Convex code generation

**Unified Client Interface**:
- Single API for both mobile and CLI
- Shared types across platforms
- Consistent error handling

---

## Migration Strategy

### 6-Phase Gradual Migration

**Phase 1**: Dual-Client Setup (Week 1)
- Install Convex dependencies
- Initialize Convex project
- Set up ConvexProvider alongside existing Supabase client
- **Risk**: LOW (no functionality changes)

**Phase 2**: Non-Critical Hooks (Week 2)
- Migrate `useDocuments`
- Migrate `useConversations`
- **Risk**: LOW (read-only, CRUD operations)

**Phase 3**: Complex Hooks (Week 3)
- Migrate `useLongRunningTask`
- Delete `use-chat-realtime.ts` (no longer needed)
- Delete `taskRealtimeRegistry.ts` (no longer needed)
- **Risk**: MEDIUM (critical research workflows)

**Phase 4**: Chat Interface (Week 4)
- Migrate `useChatSend`
- Migrate `useChatHistory`
- **Risk**: MEDIUM (core chat functionality)

**Phase 5**: CLI Skill (Week 5)
- Migrate CLI skill to Convex HTTP client
- Test all skill commands
- **Risk**: LOW (isolated CLI tool)

**Phase 6**: Cleanup (Week 6)
- Remove `@supabase/supabase-js` dependency
- Delete all Supabase client code
- Update documentation
- **Risk**: LOW (cleanup only)

---

## Critical Deliverables

### 1. Shared Client Package

**File**: `.spec/CLIENT-MIGRATION-PLAN.md` (Section: Shared Client Package Design)

**Structure**:
```
packages/holocron-convex-client/
├── src/
│   ├── index.ts    # Main exports
│   ├── react.ts    # React Native hooks
│   ├── node.ts     # CLI skill functions
│   └── types.ts    # Shared types
```

**Benefits**:
- Single import for both platforms
- Consistent API surface
- Shared type definitions

### 2. Hook Migration Guide

**File**: `.spec/CLIENT-MIGRATION-PLAN.md` (Section: Hook Migration Guide)

**Coverage**:
- `useConversations`: CRUD → Convex mutations
- `useLongRunningTask`: 362 → 80 lines (78% reduction)
- `useChatRealtime`: DELETE (no longer needed)
- `useDocuments`: Manual state → useQuery
- `useChatSend`: Edge Function → Convex mutation

### 3. Real-time Subscription Patterns

**File**: `.spec/CLIENT-MIGRATION-PLAN.md` (Section: Real-time Subscription Migration)

**Key Changes**:
- **Supabase**: Manual channel creation, subscription, cleanup
- **Convex**: Automatic reactivity via `useQuery`

**Example**:
```typescript
// BEFORE (Supabase)
const channel = supabase.channel('task-updates')
  .on('postgres_changes', {...}, callback)
  .subscribe()
return () => supabase.removeChannel(channel)

// AFTER (Convex)
const task = useQuery(api.tasks.get, { id })
// Auto-subscribes, no cleanup needed
```

### 4. Testing Strategy

**File**: `.spec/CLIENT-MIGRATION-PLAN.md` (Section: Testing Strategy)

**Coverage**:
- Unit tests for all hooks (React Native Testing Library)
- Integration tests for chat flow
- Real-time update tests (task progress monitoring)
- Migration validation tests (data consistency)

---

## Risk Mitigation

### Highest Risk: Vector Search Quality

**Mitigation**: Phase 0 POC (Week 1)
- Set up Convex project
- Migrate `documents` table with embeddings
- Run A/B test: Supabase vs Convex search quality
- **GO/NO-GO Decision** after POC validation

### Rollback Strategy

**At Any Phase**:
- Feature flag to switch between clients
- Keep Supabase running in parallel
- Revert import changes if issues detected

**After Phase 6**:
- Keep Supabase backup for 2 weeks
- Daily data consistency checks
- Immediate rollback if corruption detected

---

## Success Criteria

### Functional Requirements

| ID | Criterion | Target |
|----|-----------|--------|
| FR-1 | All hooks migrated to Convex | 100% |
| FR-2 | Real-time updates functional | < 500ms p95 |
| FR-3 | CLI skill migrated | 100% commands working |
| FR-4 | Code reduction | > 30% lines deleted |
| FR-5 | Zero Supabase dependencies | 0 imports |

### Non-Functional Requirements

| ID | Criterion | Target |
|----|-----------|--------|
| NFR-1 | Improved DX | < 100 lines/hook |
| NFR-2 | No data loss | 100% row count match |
| NFR-3 | Tests pass | > 80% coverage |
| NFR-4 | Documentation updated | 100% |

---

## Next Steps

### Immediate Actions (This Week)

1. **Review Migration Plan**
   - Engineering-manager approval
   - React-native-ui-implementer review
   - Backend team alignment

2. **Schedule Phase 0 Kickoff**
   - Set up Convex POC environment
   - Define vector search benchmarks
   - Allocate 1 week for POC validation

3. **Prepare Dependencies**
   - `pnpm add convex @convex-dev/react`
   - Create Convex project
   - Set up environment variables

### Phase 0 Exit Criteria

- [ ] Convex project initialized
- [ ] Vector search A/B test complete
- [ ] Search quality ≥ 90% match with Supabase
- [ ] Deep research Action prototype works
- [ ] Real-time query performance acceptable
- [ ] GO/NO-GO decision made

---

## Questions & blockers

### Open Questions

1. **Q**: Can Convex handle 1536-dimensional embeddings efficiently?
   - **A**: Phase 0 POC will validate
   - **Decision**: End of Week 1

2. **Q**: Performance impact of dual-client setup?
   - **A**: Minimal (both use WebSocket)
   - **Mitigation**: Monitor bundle size

3. **Q**: Edge Function migration complexity?
   - **A**: Port to Convex Actions in Phase 2-3
   - **Strategy**: One function at a time

### Potential Blockers

- **Vector search quality degradation**: POC will catch this early
- **Real-time latency increase**: Load testing in Phase 0
- **Data corruption during migration**: Full backup + validation pipeline
- **Convex learning curve**: Team training + documentation

---

## Files Delivered

1. **`.spec/MIGRATION-ANALYSIS.md`** - Product Manager's architecture analysis
2. **`.spec/CLIENT-MIGRATION-PLAN.md`** - React Native UI Planner's migration strategy (this document)
3. **`.spec/MIGRATION-SUMMARY.md`** - This executive summary

---

## Conclusion

This migration represents a **significant architectural improvement** with:

- **30%+ code reduction** through simplified real-time patterns
- **Unified client interface** for mobile and CLI
- **Better developer experience** via automatic reactivity
- **Improved observability** with Convex dashboard

**Recommendation**: Proceed with Phase 0 (Proof of Concept) to validate critical assumptions before full commitment.

**Timeline**: 6-8 weeks total, with GO/NO-GO decision after Week 1.

---

**Document Version**: 1.0
**Last Updated**: 2026-03-05
**Next Review**: After Phase 0 POC completion
