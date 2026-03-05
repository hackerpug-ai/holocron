# Epic 6: Deep Research + Convex Backend Migration

> > Sequence: 6 | Tasks: 24 | Blocks: Epic 7 | Depends on: Epic 5
> > Duration: 6-8 weeks | Phases: 6 (POC → Data → API → Client → CLI → Cleanup)

> > PRD: .spec/prd/README.md
> > PRD Version: 5.0.0
> > Appetite: 6-8 weeks (backend migration)
> > PRD Sections: §08 (Deep Research), §12 (Backend Migration), §11 (Technical Requirements)

> ## Overview

> Migrate backend to **Convex Agent + Workflow** architecture with **GPT-5-mini** for cost-effective parallel research subagents. Enable multi-iteration deep research via `/deep-research` with the new multi-agent orchestrator-worker pattern. After this epic:
> - Backend runs on Convex (no Supabase)
> - Deep research uses GPT-5 leads + GPT-5-mini parallel subagents (~67% cost savings)
> - Real-time updates via Convex `useQuery` (no manual subscriptions)
> - `useLongRunningTask` hook deleted (570 lines removed)

> ## Architecture

> ```
> Lead Agent (GPT-5) ──► Plan Research
>          │
>     ┌────┴────┬────────┬────────┐
>     ▼         ▼        ▼        ▼
>  Subagent  Subagent  Subagent  Subagent   (GPT-5-mini, parallel)
>     │         │        │        │
>     └─────────┴────────┴────────┘
>                 │
>          Lead Agent ──► Synthesize
>                 │
>          Reviewer (GPT-5) ──► Score & Iterate
> ```

> ## Human Test Steps

> **Phase 0: POC Validation**
> 1. Initialize Convex project and verify `npx convex dev` runs
> 2. Migrate `documents` table with embeddings to Convex
> 3. Run A/B benchmark: compare Convex vs Supabase hybrid search quality (≥90% match)
> 4. Prototype deep research Action and verify it executes end-to-end
> 5. **GO/NO-GO**: Verify vector search quality, real-time performance <500ms p95

> **Phase 1-2: Data & API Migration**
> 6. Define Convex schema for all 9 tables and verify types generate
> 7. Run migration scripts and validate 100% row count match
> 8. Verify foreign key relationships preserved in Convex
> 9. Port conversation CRUD to Convex Mutations/Queries
> 10. Port chat operations to Convex with streaming
> 11. Port search operations (hybrid, FTS, vector) to Convex Queries

> **Phase 3: Client Migration**
> 12. Replace `useConversations` with Convex `useQuery`/`useMutation`
> 13. **DELETE `useLongRunningTask`** - watch entities directly (362 lines removed)
> 14. **DELETE `use-chat-realtime.ts`** - Convex auto-updates (81 lines removed)
> 15. **DELETE `taskRealtimeRegistry.ts`** (127 lines removed)
> 16. Verify real-time research progress works via direct entity watching

> **Phase 4-5: CLI & Cleanup**
> 17. Migrate holocron CLI skill to `ConvexHttpClient`
> 18. Verify all skill commands work with Convex backend
> 19. Remove `@supabase/supabase-js` from package.json
> 20. Delete Supabase client files and verify zero Supabase imports

> **Deep Research Features**
> 21. Type `/deep-research <topic>` and verify confirmation card with GPT-5-mini cost estimate
> 22. Verify iteration cards show coverage score, findings, and parallel subagent execution
> 23. Type `/resume` and verify session list, resume from checkpoint
> 24. Verify final report includes iteration timeline with score progression

> ## Success Criteria

> | Metric | Target |
> |--------|--------|
> | Hooks code removed | 570+ lines (useLongRunningTask, use-chat-realtime, taskRealtimeRegistry) |
> | Supabase dependencies | 0 imports |
> | Vector search quality | ≥90% match with Supabase |
> | Real-time latency | <500ms p95 |
> | Deep research cost | ~67% reduction (GPT-5-mini subagents) |
> | Data integrity | 100% row count match |

> ## Dependencies

> | Package | Version | Purpose |
> |---------|---------|---------|
> | `convex` | ^1.16.0 | Backend platform |
> | `@convex-dev/react` | ^1.16.0 | React hooks |
> | `@convex-dev/agent` | ^0.2.x | Agent component |
> | `@convex-dev/workflow` | ^0.2.x | Workflow orchestration |
> | `@ai-sdk/openai` | ^1.x | GPT-5/GPT-5-mini provider |

> ## Removed After Migration

> | Package | Lines Removed |
> |---------|---------------|
> | `@supabase/supabase-js` | - |
> | `useLongRunningTask.ts` | 362 lines |
> | `use-chat-realtime.ts` | 81 lines |
> | `taskRealtimeRegistry.ts` | 127 lines |
> | **Total** | **570+ lines** |

> ## Task List

> | Task ID | Title | Type | Priority | Stability |
> |---------|-------|------|----------|-----------|
> | US-044 | Initialize Convex project with Agent + Workflow components | INFRA | P0 | stable |
> | US-045 | Migrate `documents` table with vector embeddings to Convex | INFRA | P0 | stable |
> | US-046 | Implement hybrid search in Convex and benchmark vs Supabase | INFRA | P0 | stable |
> | US-047 | Prototype deep research Workflow with GPT-5/GPT-5-mini agents | FEATURE | P0 | evolving |
> | US-048 | Define Convex schema for all 9 tables | INFRA | P0 | stable |
> | US-049 | Build Supabase → Convex migration scripts | INFRA | P0 | stable |
> | US-050 | Validate data integrity (row counts, FK relationships, embedding dimensions) | INFRA | P0 | stable |
> | US-051 | Port conversation CRUD to Convex Mutations/Queries | FEATURE | P0 | evolving |
> | US-052 | Port chat operations with streaming to Convex | FEATURE | P0 | evolving |
> | US-053 | Port all search operations to Convex Queries | FEATURE | P0 | evolving |
> | US-054 | Port task management to Convex (replace long_running_tasks table pattern) | FEATURE | P0 | evolving |
> | US-055 | Implement deep research Workflow (Lead GPT-5 + Subagents GPT-5-mini) | FEATURE | P0 | evolving |
> | US-056 | Migrate `useConversations` to Convex `useQuery`/`useMutation` | FEATURE | P0 | evolving |
> | US-057 | DELETE `useLongRunningTask` - watch entities directly | TASK | P0 | stable |
> | US-058 | DELETE `use-chat-realtime.ts` and `taskRealtimeRegistry.ts` | TASK | P0 | stable |
> | US-059 | Migrate `useDocuments` and `useChatSend` to Convex | FEATURE | P0 | evolving |
> | US-060 | Wire research progress tracking via direct session entity watching | FEATURE | P0 | evolving |
> | US-061 | Install Convex in CLI skill and configure `ConvexHttpClient` | TASK | P1 | stable |
> | US-062 | Migrate all skill commands to Convex queries | TASK | P1 | evolving |
> | US-063 | Remove `@supabase/supabase-js` and delete Supabase client files | TASK | P1 | stable |
> | US-064 | Verify zero Supabase imports (`grep -r "supabase" src/`) | TASK | P1 | stable |
> | US-065 | Update documentation with Convex setup | TASK | P1 | stable |
> | US-066 | Design IterationSummaryCard with GPT-5-mini parallel worker indicators | DESIGN | P0 | evolving |
> | US-067 | Design IterationTimeline with score progression and cost comparison | DESIGN | P0 | evolving |
