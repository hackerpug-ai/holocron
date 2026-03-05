# Migration Architecture Analysis: Supabase to Convex

**Date**: 2026-03-05
**Author**: Product Manager (Architecture Review)
**Status**: DRAFT - For Review

---

## Executive Summary

This document outlines a comprehensive migration strategy from Supabase (PostgreSQL + Edge Functions + Realtime) to Convex for the Holocron Mobile Research Interface and Claude Code holocron skill.

### Key Findings

| Dimension | Current (Supabase) | Target (Convex) | Impact |
|-----------|-------------------|-----------------|--------|
| **Data Query** | PostgreSQL + RPC functions | Unified TypeScript API | HIGH - Standardized client interfaces |
| **Real-time Updates** | Supabase Realtime (subscriptions) | Built-in reactive queries | HIGH - Simplified state management |
| **Background Jobs** | Edge Functions + Cron | Convex Actions + Cron | MEDIUM - Simplified infrastructure |
| **Vector Search** | pgvector extension | Convex Vector Search | MEDIUM - Different query patterns |
| **Client APIs** | Supabase JS Client | Convex React Client | HIGH - Requires complete rewrite |
| **Logging/Debugging** | Edge Function logs (hard to access) | Convex Dashboard logs | HIGH - Improved observability |

### Migration Recommendation

**CONDITIONAL GO** - Proceed with migration in phases, provided:

1. ✅ Convex Vector Search meets quality benchmarks for hybrid search
2. ✅ Real-time query performance matches or exceeds Supabase Realtime
3. ⚠️ Edge Function logic can be ported to Convex Actions without significant rewrites
4. ✅ Migration cost is justified by long-term maintenance benefits

**Estimated Migration Timeline**: 6-8 weeks
**Risk Level**: MEDIUM-HIGH (database migration, API incompatibility, learning curve)

---

## Table of Contents

1. [Current Architecture Analysis](#current-architecture-analysis)
2. [Migration Scope & Priorities](#migration-scope--priorities)
3. [Data Migration Strategy](#data-migration-strategy)
4. [API Compatibility Plan](#api-compatibility-plan)
5. [Risk Assessment & Mitigation](#risk-assessment--mitigation)
6. [Success Criteria](#success-criteria)
7. [Recommended Migration Phases](#recommended-migration-phases)
8. [Open Questions & Research Needed](#open-questions--research-needed)

---

## Current Architecture Analysis

### Current Stack: Supabase

#### Database Schema (PostgreSQL)

```sql
-- Core entities
conversations           -- Chat sessions
chat_messages           -- Message history with role/type
documents               -- Knowledge base articles with embeddings
research_sessions       -- Research workflow tracking
research_iterations     -- Deep research iteration data
citations               -- Source citations for research
long_running_tasks      -- Background job tracking
deep_research_sessions  -- Deep research specific state
deep_research_iterations -- Deep research iteration tracking
```

#### Edge Functions (Deno TypeScript)

```typescript
chat-router/                    // Central router for chat operations
├── handlers/
│   ├── chat-send.ts           // Message routing & slash command parsing
│   ├── conversations.ts       // CRUD for conversations
│   ├── deep-research.ts       // Deep research orchestration
│   └── commands/              // Slash command handlers
_shared/
├── long-running-task/         // Task execution framework
│   ├── types.ts               // Task type definitions
│   ├── task-manager.ts        // Concurrency control
│   └── agent-client.ts        // LLM API wrapper
└── logging/                   // Server-side logging

task-timeout-worker/           // Cron job for stuck task detection
embeddings-etl/                // Document embedding generation
```

#### Real-time Data Flow

```
Mobile App (React Native)
    ↓ HTTPS
Supabase Edge Functions
    ↓ RPC/PostgreSQL
Database + Realtime Subscriptions
    ↓ WebSocket
Mobile App (live updates)
```

### Pain Points with Supabase

1. **"Hard to log and debug"** - Edge Function logs are difficult to access in real-time
2. **Inconsistent client interfaces** - Different APIs for mobile (Supabase JS) vs CLI skill (direct PostgreSQL)
3. **Complex state management** - Manual Realtime subscription management
4. **Vendor lock-in** - Tied to Supabase-specific features (pgvector, RPC functions)
5. **Deployment friction** - Edge Functions require separate deployment workflow

---

## Migration Scope & Priorities

### In Scope

#### 1. Data Layer Migration
- ✅ Migrate all tables to Convex schema
- ✅ Migrate vector embeddings (1536-dimensional, OpenAI text-embedding-3-small)
- ✅ Migrate all existing documents, conversations, chat history
- ✅ Preserve all relationships and foreign keys

#### 2. API Migration
- ✅ Port Edge Functions to Convex Actions/Mutations
- ✅ Replace Supabase RPC functions with Convex Queries
- ✅ Migrate real-time subscriptions to Convex reactive queries
- ✅ Standardize client interfaces (mobile + CLI skill)

#### 3. Client Migration
- ✅ Replace `@supabase/supabase-js` with `convex/react`
- ✅ Rewrite `useLongRunningTask` hook for Convex
- ✅ Update chat-router calls to Convex functions
- ✅ Migrate real-time update logic

### Out of Scope (Post-Migration)

- ❌ User authentication (personal tool, service-key only)
- ❌ Multi-tenant data isolation (personal instance)
- ❌ Push notification infrastructure
- ❌ External API integrations (Exa, Jina, OpenAI - remain unchanged)

### Priority Matrix

| Priority | Component | Complexity | Impact | Reason |
|----------|-----------|------------|--------|--------|
| **P0** | conversations, chat_messages | HIGH | CRITICAL | Core chat functionality |
| **P0** | documents + vector search | HIGH | CRITICAL | Knowledge base queries |
| **P1** | long_running_tasks framework | MEDIUM | HIGH | Research workflows |
| **P1** | real-time updates | MEDIUM | HIGH | Chat progress streaming |
| **P2** | research_sessions, iterations | LOW | MEDIUM | Historical data |
| **P3** | citations | LOW | LOW | Nice-to-have metadata |

---

## Data Migration Strategy

### Schema Mapping: Supabase → Convex

| Supabase Table | Convex Schema | Migration Notes |
|----------------|---------------|-----------------|
| `conversations` | `conversations` | Direct mapping, UUID → Id |
| `chat_messages` | `chatMessages` | CamelCase convention |
| `documents` | `documents` | Preserve `embedding: v.array(v.float64())` |
| `long_running_tasks` | `tasks` | Simplified name |
| `research_sessions` | `researchSessions` | Foreign key mapping |
| `research_iterations` | `researchIterations` | Foreign key mapping |
| `deep_research_sessions` | `deepResearchSessions` | Merge into `researchSessions`? |
| `deep_research_iterations` | Merge into `researchIterations` | Consider consolidation |

### Vector Embedding Migration

#### Current State (Supabase)
```sql
embedding VECTOR(1536)  -- pgvector extension
```

#### Target State (Convex)
```typescript
// Convex schema definition
embedding: v.array(v.float64())  // 1536-dimensional array
```

#### Migration Strategy

**Option A: Direct Export/Import**
1. Export documents table with embeddings as JSON
2. Import via Convex migration script
3. Validate embedding dimensions match

**Option B: Regeneration (Fallback)**
1. Migrate document content only
2. Regenerate embeddings via OpenAI API
3. Cost: ~$0.0001 per document × N documents

**Recommendation**: Option A (direct export) with Option B as fallback if corruption detected.

### Data Validation Checklist

- [ ] Row count matches for all tables
- [ ] Embedding dimensions validated (1536)
- [ ] Foreign key relationships preserved
- [ ] Vector search quality benchmark (compare Supabase vs Convex results)
- [ ] Chat history ordering preserved
- [ ] Task status transitions validated

---

## API Compatibility Plan

### Edge Function → Convex Function Mapping

| Supabase Edge Function | Convex Equivalent | Type | Complexity |
|------------------------|-------------------|------|------------|
| `chat-router` (chat:send) | `chat:send` | Mutation | HIGH |
| `conversations:create` | `conversations:create` | Mutation | LOW |
| `conversations:list` | `conversations:list` | Query | LOW |
| `conversations:update` | `conversations:update` | Mutation | LOW |
| `conversations:delete` | `conversations:delete` | Mutation | LOW |
| `task:deep-research-start` | `tasks:startDeepResearch` | Action | HIGH |
| `task:deep-research-iterate` | `tasks:iterateDeepResearch` | Action | HIGH |
| `task:status` | `tasks:getStatus` | Query | LOW |
| `task:cancel` | `tasks:cancel` | Mutation | MEDIUM |
| `rpc/hybrid_search` | `documents:hybridSearch` | Query | HIGH |
| `rpc/search_fts` | `documents:fullTextSearch` | Query | MEDIUM |
| `rpc/search_vector` | `documents:vectorSearch` | Query | HIGH |

### Client Interface Changes

#### Before (Supabase)
```typescript
import { supabase } from '@/lib/supabase'

const { data, error } = await supabase
  .from('conversations')
  .select('*')
  .order('updated_at', { ascending: false })
```

#### After (Convex)
```typescript
import { useQuery } from '@/convex/_generated/react'

const conversations = useQuery(api.conversations.list)
```

### Real-time Updates Migration

#### Before (Supabase Realtime)
```typescript
const channel = supabase
  .channel('task-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'long_running_tasks',
    filter: `conversation_id=eq.${conversationId}`
  }, callback)
  .subscribe()
```

#### After (Convex Reactive Queries)
```typescript
// Automatic reactivity - no subscription management needed
const task = useQuery(api.tasks.getByConversation, { conversationId })
// Component re-renders automatically when task changes
```

---

## Risk Assessment & Mitigation

### Risk Matrix

| Risk | Probability | Impact | Severity | Mitigation Strategy |
|------|-------------|--------|----------|---------------------|
| **Vector search quality degradation** | MEDIUM | HIGH | **HIGH** | Run A/B test benchmarks before migration |
| **Data corruption during migration** | LOW | CRITICAL | **HIGH** | Full backup + validation pipeline |
| **Real-time latency increase** | MEDIUM | MEDIUM | **MEDIUM** | Load testing before prod cut-over |
| **Edge Function logic not portable** | LOW | HIGH | **MEDIUM** | Prototype critical functions first |
| **Client API breaking changes** | HIGH | MEDIUM | **MEDIUM** | Maintain compatibility layer |
| **Convex learning curve delays** | MEDIUM | LOW | **LOW** | Team training + documentation |
| **Convex service limits/costs** | LOW | MEDIUM | **LOW** | Review pricing model |

### Critical Risks Deep Dive

#### Risk 1: Vector Search Quality Degradation

**Scenario**: Convex vector search produces different/worse results than pgvector

**Mitigation**:
1. **Pre-migration benchmark**: Run 100 sample queries against both systems
2. **Quality metrics**: Compare result relevance, ranking order, recall@k
3. **Rollback plan**: Keep Supabase running in parallel for 2 weeks post-migration
4. **Tuning**: Adjust Convex vector search parameters (distance metric, index settings)

**Acceptance Criteria**:
- Convex results match Supabase ≥ 90% for top-5 results
- No significant relevance degradation in manual testing

#### Risk 2: Data Corruption During Migration

**Scenario**: Foreign key relationships broken, embeddings truncated

**Mitigation**:
1. **Full backup**: Dump PostgreSQL database before migration
2. **Dry run**: Test migration on staging copy first
3. **Validation script**: Automated checks for row counts, relationships, embeddings
4. **Transaction safety**: Use Convex transaction support for atomic migrations

**Acceptance Criteria**:
- Zero data loss (row counts match)
- All foreign key relationships intact
- Embedding dimensions validated

#### Risk 3: Real-time Latency Increase

**Scenario**: Convex queries slower than Supabase Realtime subscriptions

**Mitigation**:
1. **Load testing**: Simulate 100 concurrent users with real-time updates
2. **Query optimization**: Review Convex query indexes and execution plans
3. **Caching strategy**: Implement client-side caching for frequently accessed data

**Acceptance Criteria**:
- Real-time update latency < 500ms (p95)
- No UI freezing or jank during updates

---

## Success Criteria

### Functional Requirements

| ID | Criterion | Measurement | Target |
|----|-----------|-------------|--------|
| **FR-1** | All existing features work post-migration | Feature checklist | 100% |
| **FR-2** | Vector search quality maintained | A/B test relevance score | ≥ 90% match |
| **FR-3** | Real-time updates functional | Update latency | < 500ms p95 |
| **FR-4** | No data loss | Row count comparison | 100% |
| **FR-5** | Mobile app works with Convex backend | Integration test | All pass |

### Non-Functional Requirements

| ID | Criterion | Measurement | Target |
|----|-----------|-------------|--------|
| **NFR-1** | Improved logging/debugging | Log access time | < 5s |
| **NFR-2** | Standardized client APIs | API surface area | Single client |
| **NFR-3** | Deployed to production | Deployment time | < 1 day |
| **NFR-4** | Team trained on Convex | Training completion | 100% |

### Business Outcomes

| ID | Outcome | Measurement | Target |
|----|----------|-------------|--------|
| **BO-1** | Reduced debugging time | Time to diagnose issues | < 50% of current |
| **BO-2** | Faster feature development | New feature cycle time | < 2 weeks |
| **BO-3** | Improved developer experience | Developer satisfaction | +2 Likert points |

---

## Recommended Migration Phases

### Phase 0: Proof of Concept (Week 1)

**Goal**: Validate Convex can handle critical workloads

**Tasks**:
1. Set up Convex project
2. Migrate `documents` table with embeddings
3. Implement hybrid search (vector + FTS) in Convex
4. Run A/B test: Supabase vs Convex search quality
5. Prototype one critical Edge Function (deep-research-start)

**Exit Criteria**:
- ✅ Vector search quality benchmark passes
- ✅ Deep research Action prototype works
- ✅ Real-time query performance acceptable

### Phase 1: Data Layer Migration (Week 2-3)

**Goal**: Migrate all data to Convex with zero loss

**Tasks**:
1. Define Convex schema for all tables
2. Build migration scripts (Supabase → Convex)
3. Run full migration on staging environment
4. Validate data integrity (row counts, relationships, embeddings)
5. Performance testing (query latency, vector search)

**Exit Criteria**:
- ✅ All tables migrated
- ✅ Data validation 100% pass
- ✅ Performance benchmarks met

### Phase 2: API Migration (Week 3-5)

**Goal**: Port Edge Functions to Convex Actions/Mutations/Queries

**Tasks**:
1. Port `conversations` CRUD operations
2. Port `chat:send` message routing
3. Port `deep-research-start` and `deep-research-iterate`
4. Port hybrid search, FTS, vector search
5. Implement task management (start, cancel, status)

**Exit Criteria**:
- ✅ All APIs functional
- ✅ Unit tests pass
- ✅ Integration tests pass

### Phase 3: Client Migration (Week 5-6)

**Goal**: Update mobile app and CLI skill to use Convex client

**Tasks**:
1. Replace Supabase client with Convex client in mobile app
2. Rewrite `useLongRunningTask` hook for Convex
3. Update chat-router calls throughout codebase
4. Migrate real-time subscriptions to reactive queries
5. Update CLI skill to use Convex HTTP client

**Exit Criteria**:
- ✅ Mobile app works with Convex backend
- ✅ CLI skill queries Convex directly
- ✅ Real-time updates functional

### Phase 4: Testing & Validation (Week 6-7)

**Goal**: Ensure production readiness

**Tasks**:
1. End-to-end testing (all user flows)
2. Load testing (100 concurrent users)
3. Real-time performance testing
4. Security audit (auth, API keys)
5. Rollback drill (test cut-over back to Supabase)

**Exit Criteria**:
- ✅ All E2E tests pass
- ✅ Load tests pass
- ✅ Security review pass
- ✅ Rollback procedure validated

### Phase 5: Production Cut-Over (Week 7-8)

**Goal**: Deploy to production with zero downtime

**Tasks**:
1. Final backup of Supabase database
2. Deploy Convex backend to production
3. Update mobile app (release new version)
4. Update CLI skill (publish new version)
5. Monitor logs, metrics, errors for 48 hours
6. Keep Supabase running in parallel for 2 weeks

**Exit Criteria**:
- ✅ Production deployment successful
- ✅ Zero data loss
- ✅ No critical bugs
- ✅ Performance metrics met

---

## Open Questions & Research Needed

### Technical Questions

1. **Q: Can Convex handle 1536-dimensional vector embeddings efficiently?**
   - **Research needed**: Performance benchmarks for vector search at scale
   - **Decision point**: End of Phase 0 (POC)

2. **Q: How does Convex vector search quality compare to pgvector?**
   - **Research needed**: A/B testing with sample queries
   - **Decision point**: End of Phase 0 (POC)

3. **Q: Can long-running Edge Functions be ported to Convex Actions?**
   - **Research needed**: Prototype deep-research-start Action
   - **Decision point**: End of Phase 0 (POC)

4. **Q: What's the migration strategy for existing embeddings?**
   - **Research needed**: Test export/import pipeline
   - **Decision point**: Phase 1 planning

5. **Q: How do we handle the Supabase Realtime → Convex reactivity migration?**
   - **Research needed**: Document subscription patterns
   - **Decision point**: Phase 3 planning

### Business Questions

1. **Q: What are the cost implications of Convex vs Supabase?**
   - **Research needed**: Compare pricing models
   - **Decision point**: Before Phase 5

2. **Q: What's the long-term maintenance burden of Convex vs Supabase?**
   - **Research needed**: Review Convex upgrade path, deprecation policy
   - **Decision point**: Before Phase 5

### Operational Questions

1. **Q: How do we handle deployment to Convex?**
   - **Research needed**: Review Convex CLI, CI/CD integration
   - **Decision point**: Phase 2

2. **Q: What monitoring/observability tools does Convex provide?**
   - **Research needed**: Review Convex dashboard, logging, metrics
   - **Decision point**: Phase 4

---

## Appendix A: Current Schema Reference

### Supabase Tables

```sql
-- conversations (chat sessions)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'New Chat',
  last_message_preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- chat_messages (message history)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  message_type message_type NOT NULL,
  card_data JSONB,
  session_id UUID REFERENCES research_sessions(id),
  document_id INTEGER REFERENCES documents(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- documents (knowledge base with embeddings)
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category document_category NOT NULL,
  file_path TEXT,
  file_type TEXT DEFAULT 'md',
  status TEXT DEFAULT 'complete',
  date TEXT,
  time TEXT,
  research_type TEXT,
  iterations INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  embedding VECTOR(1536)
);

-- long_running_tasks (background jobs)
CREATE TABLE long_running_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  task_type task_type NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  config JSONB,
  current_step INTEGER,
  total_steps INTEGER,
  progress_message TEXT,
  result JSONB,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

---

## Appendix B: Edge Function Inventory

### Active Edge Functions

| Function | Endpoint | Handler | Lines of Code | Complexity |
|----------|----------|---------|---------------|------------|
| chat-router | `/functions/v1/chat-router` | `handleChatSend` | ~500 | HIGH |
| deep-research-start | `/functions/v1/chat-router` | `handleDeepResearchStart` | ~300 | HIGH |
| deep-research-iterate | `/functions/v1/chat-router` | `handleDeepResearchIterate` | ~250 | HIGH |
| conversations:create | `/functions/v1/chat-router` | `handleConversationsCreate` | ~50 | LOW |
| conversations:list | `/functions/v1/chat-router` | `handleConversationsList` | ~50 | LOW |
| task-timeout-worker | Cron job | `detectStuckTasks` | ~100 | MEDIUM |
| embeddings-etl | Manual trigger | `generateEmbeddings` | ~150 | MEDIUM |

### RPC Functions (PostgreSQL)

| Function | Purpose | Complexity |
|----------|---------|------------|
| `can_start_task` | Concurrency control | LOW |
| `create_long_running_task` | Task creation | LOW |
| `update_task_progress` | Progress updates | LOW |
| `complete_task` | Task completion | LOW |
| `fail_task` | Task failure | LOW |
| `cancel_task` | Task cancellation | LOW |
| `start_task` | Task start | LOW |
| `hybrid_search` | Vector + FTS search | HIGH |
| `search_fts` | Full-text search | MEDIUM |
| `search_vector` | Vector similarity | HIGH |

---

## Conclusion

This migration represents a significant architectural change with the potential to substantially improve developer experience, observability, and long-term maintainability. However, the risks are non-trivial, particularly around vector search quality and data migration integrity.

**Recommendation**: Proceed with Phase 0 (Proof of Concept) to validate critical assumptions before committing to the full migration. Use the POC results to make a GO/NO-GO decision for the full migration.

**Next Steps**:
1. Review this document with engineering-manager and react-native-ui-planner
2. Schedule Phase 0 kickoff meeting
3. Set up Convex POC environment
4. Define detailed success criteria for POC
5. Execute POC and make GO/NO-GO decision

---

**Document Version**: 1.0
**Last Updated**: 2026-03-05
**Next Review**: After Phase 0 POC completion
