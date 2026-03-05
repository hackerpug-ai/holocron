# Scope

[UPDATED 2026-03-05]: Added Backend Migration (Supabase → Convex) as Epic 6

## In Scope

- **Drawer navigation** (pushover menu) with conversation list and articles link
- **Multi-conversation support** with create, rename, and delete conversations
- Chat-centric main view with message thread (user messages + agent responses)
- **Articles main view** for browsing the knowledge base (accessible from drawer)
- Slash command system for invoking server-side actions (`/search`, `/research`, `/deep-research`, `/browse`, `/stats`)
- Result cards rendered inline in the chat stream for search results, articles, and research findings
- Card drill-down: tapping a result card opens full article/research content
- Natural language queries interpreted by server-side AI agent
- Query holocron knowledge base via hybrid/FTS/vector search (through chat)
- Initiate basic research requests via `/research` command
- Initiate deep research sessions via `/deep-research` command
- Real-time progress updates streamed as chat messages during research
- Resume interrupted deep-research sessions via `/resume` command
- Save research results to holocron (auto-save with confirmation in chat)
- Chat history persistence across sessions (per conversation)
- Slash command typeahead panel (appears above input on `/` keystroke or "/" button tap) with real-time filtering
- Slash command help via `/help`
- Service key authentication (dev mode, local use only)
- App opens to most recent conversation (chat-first experience)

### Server-Side Agent Architecture (Long-Running Tasks)

**All slash commands must be engineered as server-side agents running in long-running tasks.**

- **Long-Running Task Framework**: Unified task management system with concurrency control, progress tracking, and lifecycle management
- **Task Types**: `research`, `deep-research`, `assimilate`, `shop`, `research-loop`, `deep-research-teamwork`
- **Task Lifecycle**: pending → queued → loading → running → completed/error/cancelled
- **Concurrency Control**: One active task per type per conversation (enforced via database RPC)
- **Progress Streaming**: Real-time updates via Supabase Realtime subscriptions
- **Timeout Handling**: Cron-based task timeout worker for stuck task detection and recovery

### Multi-Agent Collaboration Patterns

- **Orchestrator-Worker Pattern**: Lead agent coordinates specialist workers for complex research tasks
- **Parallel Execution**: Independent subtasks dispatched to multiple workers simultaneously
- **Iterative Refinement (Ralph Loop)**: iterate → review → refine → repeat until coverage threshold met
- **Agent Communication**: Workers report findings to orchestrator via shared task state (database records)
- **Agent Types**:
  - `research-worker`: Cheap, focused single-pass searches
  - `research-analyst`: Evaluates source credibility, identifies patterns, detects contradictions
  - `research-synthesizer`: Produces publication-quality reports from vetted findings
  - `research-director`: Orchestrates full research team with planning, delegation, and synthesis

### Backend Migration: Supabase to Convex (Epic 6)

**Migrate entire backend infrastructure from Supabase to Convex for improved DX and simplified real-time patterns.**

- **Convex Project Setup**: Initialize Convex, run POC validation, A/B benchmark search quality
- **Data Layer Migration**: Migrate all 9 tables with schema mapping, vector embeddings preserved
- **API Migration**: Port Edge Functions to Convex Actions/Mutations/Queries
- **Client Hook Migration**: Replace Supabase hooks with Convex `useQuery`/`useMutation`
  - DELETE `useLongRunningTask` entirely (362 lines → 0) - just watch entity directly
  - Delete `use-chat-realtime.ts` (automatic reactivity replaces manual subscriptions)
  - Delete `taskRealtimeRegistry.ts` (no longer needed)
  - **570 lines of hook code eliminated** via Convex's reactive query pattern
- **CLI Skill Migration**: Migrate holocron skill to Convex HTTP client
- **Cleanup**: Remove `@supabase/supabase-js`, delete Supabase files, update docs

**Success Criteria**:
- 30%+ code reduction
- Zero Supabase dependencies
- Real-time updates < 500ms p95
- Vector search quality ≥90% match

**Timeline**: 6-8 weeks (can run in parallel with other phases or after)

## Out of Scope

- User authentication/multi-user support (personal tool, service key only)
- Offline mode / local-first sync
- Push notifications for research completion
- `/assimilate` skill (repository analysis requires file system access)
- `/shop` skill (product comparison workflow)
- `/librarian` skill (runs as post-processing hook, not user-facing)
- Voice input for research queries
- Image/PDF upload for analysis
- Publishing to app stores (dev mode only)
- Rich text editing in chat input (plain text + slash commands only)
- Conversation folders or tagging (flat list for MVP)
- Conversation search (find by title only via drawer scroll)
