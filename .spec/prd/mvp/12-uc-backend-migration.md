# Backend Migration: Supabase to Convex

[ADDED 2026-03-05]: Backend infrastructure migration from Supabase to Convex for improved developer experience, simplified real-time patterns, and unified client interfaces.

---

## Functional Group: Backend Migration (BM)

| Group | Prefix | Description |
|-------|--------|-------------|
| Backend Migration | BM | Migrate data layer, API, and client hooks from Supabase to Convex |

---

## Migration Overview

### Problem Statement

Current Supabase infrastructure has several pain points:
- **Hard to log and debug** - Edge Function logs are difficult to access in real-time
- **Inconsistent client interfaces** - Different APIs for mobile (Supabase JS) vs CLI skill (direct PostgreSQL)
- **Complex state management** - Manual Realtime subscription management (362 lines for `useLongRunningTask` alone)
- **Vendor lock-in** - Tied to Supabase-specific features (pgvector, RPC functions)
- **Deployment friction** - Edge Functions require separate deployment workflow

### Solution

Migrate to Convex for:
- **Automatic reactivity** - No manual subscription management
- **Unified client interface** - Single API for mobile and CLI
- **Better observability** - Convex dashboard with real-time logs
- **Simplified codebase** - 30%+ code reduction expected
- **Type-safe API** - Generated TypeScript from Convex schema
- **Convex Agent + Workflow** - Multi-agent orchestration for deep research
- **GPT-5-mini parallel subagents** - ~67% cost reduction vs GPT-5-only

### Agent + Workflow Architecture

The deep research feature uses Convex's Agent and Workflow components to orchestrate multi-agent research:

```
Lead Agent (GPT-5) ──► Plan Research
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
 Subagent  Subagent  Subagent  Subagent   (GPT-5-mini, parallel)
    │         │        │        │
    └─────────┴────────┴────────┘
                │
         Lead Agent ──► Synthesize
                │
         Reviewer (GPT-5) ──► Score & Iterate
```

**Cost Optimization**:
- **Lead agents**: GPT-5 (planning, synthesis, review)
- **Parallel subagents**: GPT-5-mini (research execution)
- **Result**: ~67% cost reduction while maintaining quality

**Convex Components**:
- `@convex-dev/agent` - Agent entity with tool definitions
- `@convex-dev/workflow` - Orchestrates multi-step workflows with retries
- `@ai-sdk/openai` - GPT-5 and GPT-5-mini provider

### Migration Benefits

| Metric | Current (Supabase) | Target (Convex) | Improvement |
|--------|-------------------|-----------------|-------------|
| `useLongRunningTask` | 362 lines | DELETE (watch entity directly) | 100% removal |
| `use-chat-realtime.ts` | 81 lines | DELETE | 100% removal |
| `taskRealtimeRegistry.ts` | 127 lines | DELETE | 100% removal |
| Subscription cleanup code | Manual | Automatic (not needed) | N/A |
| Real-time update latency | ~500ms | ~500ms | Maintained |
| **Total hook code removed** | **570 lines** | **0 lines** | **100%** |

**Key Insight**: With Convex's reactive `useQuery`, you don't need dedicated hooks for watching background jobs. Just watch the entity (research session, task, etc.) directly - Convex handles all the reactivity. See [Convex Background Job Management](https://stack.convex.dev/background-job-management).

---

## Use Cases

### UC-BM-01: Convex Project Setup (POC Validation)

**Priority**: P0 (Critical Path)
**Phase**: 0 - Proof of Concept

**Description**: Initialize Convex project and validate critical assumptions before full migration commitment.

**Preconditions**:
- Supabase instance running with existing data
- Development environment configured

**Trigger**: Migration initiative approved

**Main Flow**:
1. Install Convex dependencies (`convex`, `@convex-dev/react`, `@convex-dev/agent`, `@convex-dev/workflow`)
2. Initialize Convex project (`npx convex dev`)
3. Create Convex client configuration files
4. Set up ConvexProvider in app root layout (alongside existing Supabase)
5. Migrate `documents` table with vector embeddings to Convex
6. Implement hybrid search (vector + FTS) in Convex
7. Run A/B benchmark: compare Supabase vs Convex search quality
8. Prototype deep-research Workflow in Convex:
   - Define Lead Agent (GPT-5) for planning/synthesis
   - Define parallel Subagent template (GPT-5-mini)
   - Create research tools (search, read, extract)
   - Implement Workflow with iteration logic
9. Run cost benchmark: GPT-5-only vs GPT-5 + GPT-5-mini subagents

**Postconditions**:
- Convex project initialized and deployed
- Documents table migrated with embeddings preserved
- Search quality benchmark: ≥90% match with Supabase results
- Deep research Workflow prototype executes end-to-end
- Cost reduction validated (~67% with GPT-5-mini subagents)
- GO/NO-GO decision documented

**Acceptance Criteria**:
- [ ] `pnpm add convex @convex-dev/react @convex-dev/agent @convex-dev/workflow @ai-sdk/openai` succeeds
- [ ] `npx convex dev` initializes without errors
- [ ] ConvexProvider wraps app without breaking existing functionality
- [ ] Vector search returns comparable results to Supabase pgvector
- [ ] Embedding dimensions (1536) preserved in migration
- [ ] Deep research Workflow prototype executes successfully
- [ ] Lead Agent (GPT-5) generates research plan
- [ ] Parallel subagents (GPT-5-mini) execute research tasks
- [ ] Cost reduction ≥60% vs GPT-5-only approach

**Exit Criteria (GO/NO-GO)**:
- [ ] Vector search quality ≥90% match
- [ ] Real-time query performance acceptable (<500ms p95)
- [ ] Deep research Workflow works end-to-end
- [ ] Lead Agent (GPT-5) generates valid research plans
- [ ] Parallel subagents (GPT-5-mini) execute successfully
- [ ] Cost reduction ≥60% validated (GPT-5 + GPT-5-mini vs GPT-5-only)
- [ ] No showstopper issues identified

---

### UC-BM-02: Data Layer Migration

**Priority**: P0 (Critical Path)
**Phase**: 1 - Data Layer

**Description**: Migrate all Supabase tables to Convex schema with zero data loss.

**Preconditions**:
- UC-BM-01 completed (POC validated)
- Full Supabase database backup created

**Trigger**: GO decision from POC phase

**Main Flow**:
1. Define Convex schema for all tables:
   - `conversations` → `conversations`
   - `chat_messages` → `chatMessages`
   - `documents` → `documents` (with embeddings)
   - `long_running_tasks` → `tasks`
   - `research_sessions` → `researchSessions`
   - `research_iterations` → `researchIterations`
   - `deep_research_sessions` → `deepResearchSessions`
   - `deep_research_iterations` → `deepResearchIterations`
   - `citations` → `citations`
2. Build migration scripts (Supabase → Convex export/import)
3. Run full migration on staging environment
4. Validate data integrity:
   - Row counts match for all tables
   - Foreign key relationships preserved
   - Embedding dimensions validated (1536)
   - Chat history ordering preserved
5. Run performance benchmarks (query latency, vector search)

**Postconditions**:
- All tables migrated to Convex
- Data validation 100% pass
- Performance benchmarks met

**Acceptance Criteria**:
- [ ] All 9 tables have Convex schema definitions
- [ ] Migration script exports all data from Supabase
- [ ] Migration script imports all data to Convex
- [ ] Row count validation passes (100% match)
- [ ] Foreign key relationships intact
- [ ] Vector embeddings preserved (1536 dimensions)
- [ ] Query latency within acceptable range

**Schema Mapping**:

| Supabase Table | Convex Table | Migration Notes |
|----------------|--------------|-----------------|
| `conversations` | `conversations` | UUID → Convex Id |
| `chat_messages` | `chatMessages` | CamelCase, FK mapping |
| `documents` | `documents` | Preserve embeddings as `v.array(v.float64())` |
| `long_running_tasks` | `tasks` | Simplified name |
| `research_sessions` | `researchSessions` | FK mapping |
| `research_iterations` | `researchIterations` | FK mapping |
| `deep_research_sessions` | `deepResearchSessions` | FK mapping |
| `deep_research_iterations` | `deepResearchIterations` | FK mapping |
| `citations` | `citations` | FK mapping |

---

### UC-BM-03: API Migration (Edge Functions → Convex Functions)

**Priority**: P0 (Critical Path)
**Phase**: 2 - API Migration

**Description**: Port all Supabase Edge Functions and RPC functions to Convex Queries, Mutations, and Actions.

**Preconditions**:
- UC-BM-02 completed (data migrated)
- Convex schema deployed

**Trigger**: Data layer migration validated

**Main Flow**:
1. Port conversation CRUD operations:
   - `conversations:create` → `conversations.create` (Mutation)
   - `conversations:list` → `conversations.list` (Query)
   - `conversations:update` → `conversations.update` (Mutation)
   - `conversations:delete` → `conversations.remove` (Mutation)
2. Port chat operations:
   - `chat-send` → `chat.send` (Mutation + Action for AI)
   - `chat-history` → `chatMessages.listByConversation` (Query)
3. Port search operations:
   - `rpc/hybrid_search` → `documents.hybridSearch` (Query)
   - `rpc/search_fts` → `documents.fullTextSearch` (Query)
   - `rpc/search_vector` → `documents.vectorSearch` (Query)
4. Port task management:
   - `task:start` → `tasks.start` (Mutation)
   - `task:status` → `tasks.getByConversation` (Query)
   - `task:cancel` → `tasks.cancel` (Mutation)
5. Port research workflows:
   - `deep-research-start` → `deepResearch.start` (Action)
   - `deep-research-iterate` → `deepResearch.iterate` (Action)
   - `research-start` → `research.start` (Action)
6. Implement deep research Workflow with Convex Agent:
   - Define Lead Agent (GPT-5) with tools: search, read, extract, plan, synthesize
   - Define Subagent template (GPT-5-mini) with research tools
   - Create Workflow orchestration: plan → parallel subagents → synthesize → review
   - Implement iteration logic with coverage scoring
   - Store session state in `deepResearchSessions` and `deepResearchIterations`

**Postconditions**:
- All Edge Functions ported to Convex
- All RPC functions ported to Convex Queries
- Unit tests pass for all functions
- Integration tests pass

**Acceptance Criteria**:
- [ ] All 4 conversation CRUD operations functional
- [ ] Chat send/receive works end-to-end
- [ ] All 3 search types return correct results
- [ ] Task lifecycle management functional
- [ ] Deep research workflow executes successfully
- [ ] Basic research workflow executes successfully
- [ ] Lead Agent (GPT-5) generates research plans
- [ ] Parallel subagents (GPT-5-mini) execute research
- [ ] Workflow stores iterations in `deepResearchIterations`
- [ ] Coverage scoring calculates correctly

**API Mapping**:

| Supabase | Convex | Type |
|----------|--------|------|
| `POST /conversations` | `api.conversations.create` | Mutation |
| `GET /conversations` | `api.conversations.list` | Query |
| `PATCH /conversations` | `api.conversations.update` | Mutation |
| `DELETE /conversations` | `api.conversations.remove` | Mutation |
| `POST /chat-send` | `api.chat.send` | Mutation |
| `GET /chat-history` | `api.chatMessages.listByConversation` | Query |
| `POST /rpc/hybrid_search` | `api.documents.hybridSearch` | Query |
| `POST /rpc/search_fts` | `api.documents.fullTextSearch` | Query |
| `POST /rpc/search_vector` | `api.documents.vectorSearch` | Query |
| `POST /task:start` | `api.tasks.start` | Mutation |
| `GET /task:status` | `api.tasks.getByConversation` | Query |
| `POST /task:cancel` | `api.tasks.cancel` | Mutation |
| `POST /deep-research-start` | `api.deepResearch.start` | Action (Workflow) |
| `POST /deep-research-iterate` | `api.deepResearch.iterate` | Action (Workflow) |
| `POST /research-start` | `api.research.start` | Action |

---

### UC-BM-04: Client Hook Migration (React Native)

**Priority**: P0 (Critical Path)
**Phase**: 3 - Client Migration

**Description**: Replace Supabase client hooks with Convex equivalents in the React Native mobile app. Key insight: **No dedicated `useLongRunningTask` hook needed** - just watch the entity directly with `useQuery` per Convex's [background job management pattern](https://stack.convex.dev/background-job-management).

**Preconditions**:
- UC-BM-03 completed (APIs migrated)
- Convex functions deployed and tested

**Trigger**: API migration validated

**Main Flow**:
1. Migrate `useConversations` hook:
   - Replace React Query + Supabase with Convex `useQuery`
   - Remove manual `invalidateQueries` calls
   - Remove optimistic update logic (Convex handles automatically)
2. **DELETE `useLongRunningTask` hook entirely** (362 lines → 0):
   - No dedicated hook needed - watch research session entity directly
   - Convex `useQuery` auto-updates when entity changes
   - Delete `taskRealtimeRegistry.ts` (no longer needed)
3. Delete `use-chat-realtime.ts` (no longer needed):
   - Convex `useQuery` provides automatic reactivity
   - No manual subscription management required
4. Migrate `useDocuments` hook:
   - Replace manual state + useEffect with Convex `useQuery`
   - Server-side filtering for better performance
5. Migrate `useChatSend` hook:
   - Replace Edge Function fetch with Convex `useMutation`
   - Remove Authorization header management

**Postconditions**:
- All hooks use Convex client
- Real-time updates functional via direct entity watching
- Massive code reduction achieved (>50%)

**Acceptance Criteria**:
- [ ] `useConversations` uses Convex `useQuery`/`useMutation`
- [ ] `useLongRunningTask` hook DELETED (not migrated - pattern not needed)
- [ ] `use-chat-realtime.ts` deleted
- [ ] `taskRealtimeRegistry.ts` deleted
- [ ] `useDocuments` uses Convex `useQuery`
- [ ] `useChatSend` uses Convex `useMutation`
- [ ] Research progress tracked by watching session entity directly
- [ ] No Supabase imports remain in hook files

**Background Job Pattern (Convex Native)**:

```typescript
// BEFORE (Supabase - 362 lines of subscription management)
export function useLongRunningTask(options) {
  // Manual channel creation, subscription, cleanup...
  const channel = supabase.channel(`task-${id}`)
  // ... 350+ more lines
}

// AFTER (Convex - just watch the entity directly in component)
function ResearchProgress({ sessionId }) {
  // Single query - Convex auto-updates when entity changes
  const session = useQuery(api.researchSessions.get, { id: sessionId })

  // Component re-renders automatically as status/progress/result changes
  if (session?.status === 'running') {
    return <ProgressBar message={session.progressMessage} />
  }
  if (session?.status === 'completed') {
    return <ResearchResults data={session.result} />
  }
}
```

**Key Insight**: Convex's reactive queries eliminate the need for dedicated task-watching hooks. The mutation creates the job, schedules the work, and returns the ID. The client watches the entity directly - no subscription management needed.

---

### UC-BM-05: CLI Skill Migration

**Priority**: P1 (High)
**Phase**: 4 - CLI Migration

**Description**: Migrate the Claude Code holocron skill from Supabase to Convex HTTP client.

**Preconditions**:
- UC-BM-03 completed (APIs migrated)
- Convex functions deployed

**Trigger**: API migration validated

**Main Flow**:
1. Install Convex in CLI skill environment
2. Create `ConvexHttpClient` setup for Node.js
3. Replace Supabase queries with Convex queries:
   - `supabase.from('documents').select()` → `convex.query(api.documents.list)`
   - `supabase.rpc('hybrid_search')` → `convex.query(api.documents.hybridSearch)`
4. Test all skill commands:
   - `/holocron search <query>` - Hybrid search
   - `/holocron list` - List documents
   - `/holocron get <id>` - Get document by ID
5. Validate search results match previous Supabase results

**Postconditions**:
- CLI skill uses Convex HTTP client
- All skill commands functional
- Search results consistent with mobile app

**Acceptance Criteria**:
- [ ] `ConvexHttpClient` configured for Node.js
- [ ] All skill commands execute without errors
- [ ] Search results match Supabase baseline
- [ ] No Supabase imports remain in skill code

---

### UC-BM-06: Cleanup and Supabase Removal

**Priority**: P1 (High)
**Phase**: 5 - Cleanup

**Description**: Remove all Supabase dependencies and clean up the codebase.

**Preconditions**:
- UC-BM-04 completed (client hooks migrated)
- UC-BM-05 completed (CLI skill migrated)
- All tests passing
- 2-week parallel running period completed

**Trigger**: Migration fully validated, no rollback needed

**Main Flow**:
1. Remove Supabase dependencies:
   - `pnpm remove @supabase/supabase-js`
2. Delete Supabase client files:
   - `lib/supabase.ts`
   - `lib/supabase-admin.ts`
3. Delete old Supabase hooks (if any remaining)
4. Remove Supabase environment variables:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_URL` (CLI)
   - `SUPABASE_SERVICE_ROLE_KEY` (CLI)
5. Update documentation:
   - README.md
   - Environment setup guides
   - API documentation
6. Archive Supabase Edge Functions (for reference)

**Postconditions**:
- Zero Supabase dependencies in package.json
- Zero Supabase imports in codebase
- Documentation updated
- Clean codebase

**Acceptance Criteria**:
- [ ] `@supabase/supabase-js` removed from package.json
- [ ] `lib/supabase.ts` deleted
- [ ] No Supabase imports in any file (`grep -r "supabase" src/`)
- [ ] Supabase environment variables removed
- [ ] Documentation updated with Convex setup
- [ ] Build succeeds with zero Supabase references

---

## Risk Mitigation

### Rollback Strategy

**Phase 1-2 Rollback** (Low Risk):
- Revert import changes
- Keep Supabase running in parallel

**Phase 3-4 Rollback** (Medium Risk):
- Feature flag to switch between clients
```typescript
const USE_CONVEX = process.env.EXPO_PUBLIC_USE_CONVEX === 'true'
```
- Keep Supabase as fallback

**Phase 5-6 Rollback** (Higher Risk):
- Reinstall `@supabase/supabase-js`
- Restore `lib/supabase.ts` from git history
- Revert all import changes

### Data Integrity

- Full Supabase backup before migration
- Daily data consistency checks during parallel running
- Row count validation after each phase
- Embedding dimension validation (1536)

---

## Success Criteria

### Functional Requirements

| ID | Criterion | Target |
|----|-----------|--------|
| FR-BM-01 | All hooks migrated to Convex | 100% |
| FR-BM-02 | Real-time updates functional | < 500ms p95 |
| FR-BM-03 | CLI skill migrated | 100% commands working |
| FR-BM-04 | Code reduction achieved | > 30% lines deleted (570+ lines) |
| FR-BM-05 | Zero Supabase dependencies | 0 imports |
| FR-BM-06 | Vector search quality maintained | ≥ 90% match |
| FR-BM-07 | Deep research Workflow functional | 100% |
| FR-BM-08 | Cost reduction with GPT-5-mini | ~67% vs GPT-5-only |

### Non-Functional Requirements

| ID | Criterion | Target |
|----|-----------|--------|
| NFR-BM-01 | Hook complexity reduced | < 100 lines/hook |
| NFR-BM-02 | No data loss | 100% row count match |
| NFR-BM-03 | Tests pass | > 80% coverage |
| NFR-BM-04 | Documentation updated | 100% |

---

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 0 | Week 1 | POC Validation (UC-BM-01) |
| Phase 1 | Week 2-3 | Data Layer Migration (UC-BM-02) |
| Phase 2 | Week 3-5 | API Migration (UC-BM-03) |
| Phase 3 | Week 5-6 | Client Hook Migration (UC-BM-04) |
| Phase 4 | Week 5-6 | CLI Skill Migration (UC-BM-05) |
| Phase 5 | Week 7-8 | Cleanup (UC-BM-06) + Parallel Running |

**Total Duration**: 6-8 weeks

---

## Dependencies

### Technical Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `convex` | ^1.16.0 | Core Convex client |
| `@convex-dev/react` | ^1.16.0 | React hooks for Convex |
| `@convex-dev/agent` | ^0.2.x | Agent component for AI agents |
| `@convex-dev/workflow` | ^0.2.x | Workflow orchestration |
| `@ai-sdk/openai` | ^1.x | GPT-5/GPT-5-mini provider |

### To Remove (Post-Migration)

| Dependency | Version | Removal Phase |
|------------|---------|---------------|
| `@supabase/supabase-js` | ^2.98.0 | Phase 5 |

---

## Related Documents

- [MIGRATION-ANALYSIS.md](../../.spec/MIGRATION-ANALYSIS.md) - Architecture analysis
- [CLIENT-MIGRATION-PLAN.md](../../.spec/CLIENT-MIGRATION-PLAN.md) - Detailed hook migration guide
- [MIGRATION-SUMMARY.md](../../.spec/MIGRATION-SUMMARY.md) - Executive summary
