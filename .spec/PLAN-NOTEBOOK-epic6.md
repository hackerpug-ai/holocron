# Planning Notebook: Holocron Epic 6 - Deep Research + Convex Backend Migration

> PRD: .spec/prd/README.md
> PRD Version: 5.0.0
> Appetite: 6-8 weeks (backend migration)
> Started: 2026-03-05
> Last Updated: 2026-03-05
> Phase: 0
> Status: IN_PROGRESS

## Session Metadata

| Key | Value |
|-----|-------|
| PRD Path | .spec/prd/README.md |
| PRD Version | 5.0.0 |
| Appetite | 6-8 weeks (backend migration) |
| Output Mode | .spec/tasks/epic-6-deep-research-convex-migration/ |
| Flags | --epic-6 |
| Docs Output Path | .spec/tasks/epic-6-deep-research-convex-migration/ |

---

## Phase 0: Prerequisites

**Status**: IN_PROGRESS
**Started**: 2026-03-05
**Completed**: pending

### Checklist
- [x] Agent teams enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)
- [x] Output mode determined (file-based: .spec/tasks/)
- [ ] Epic 6 scope validated (Deep Research + Convex Migration)
- [ ] Beads CLI detected (existing tasks directory found)

---

## Phase 1: PRD Analysis

**Status**: PENDING
**Started**: pending
**Completed**: pending

### PRD Version & Appetite

| Field | Value |
|-------|-------|
| Version | 5.0.0 |
| Appetite | 6-8 weeks (backend migration) |
| Scope Level | core (Deep Research + Convex Migration) |

### PRD Sections Indexed

Epic 6 covers the following PRD sections:

**Deep Research (§08):**
- UC-DR-01: Initiate Deep Research
- UC-DR-02: Monitor Iterations in Chat
- UC-DR-03: Resume Session
- UC-DR-04: View Iteration Cards

**Backend Migration (§12):**
- UC-BM-01: Convex Project Setup (POC Validation)
- UC-BM-02: Data Layer Migration
- UC-BM-03: API Migration (Edge Functions → Convex Functions)
- UC-BM-04: Client Hook Migration (React Native)
- UC-BM-05: CLI Skill Migration
- UC-BM-06: Cleanup and Supabase Removal

### PRD Summary

Epic 6 combines two major workstreams:

1. **Deep Research Features**: Multi-iteration research using Ralph Loop pattern with GPT-5-mini parallel subagents for cost optimization
2. **Convex Backend Migration**: Complete migration from Supabase to Convex for improved developer experience, simplified real-time patterns, and unified client interfaces

**Architecture**: Convex Agent + Workflow with orchestrator-worker pattern
- Lead Agent: GPT-5 (planning, synthesis, review)
- Parallel Subagents: GPT-5-mini (cost-effective research execution)
- Expected cost savings: ~67% vs GPT-5-only approach

**Success Criteria**:
- 570+ lines of hook code removed (useLongRunningTask, use-chat-realtime, taskRealtimeRegistry)
- Zero Supabase dependencies
- Vector search quality ≥90% match with Supabase
- Real-time latency <500ms p95

---

## Phase 1.5: PRD Version Check

**Status**: PENDING
**Timestamp**: pending

### Version Comparison

| Field | Value |
|-------|-------|
| Current PRD Version | 5.0.0 |
| Planned PRD Version | N/A (new planning) |
| Version Match | N/A |

### Re-Plan Decision

New planning session for Epic 6. Proceeding with full epic planning.

---

## Phase 2.5: Deliberation

**Status**: PENDING
**Started**: pending
**Completed**: pending

### PRD Appetite

6-8 weeks for backend migration with deep research features.

### Deliberation Decisions

| UC ID | Decision | Rationale | Deferred Items |
|-------|----------|-----------|----------------|
| UC-DR-01 to UC-DR-04 | Include full deep research features | Core feature for epic | None |
| UC-BM-01 to UC-BM-06 | Include full migration phases | Complete backend transition | None |

### Deferred Items

No deferred items - Epic 6 includes all planned features.

### Constraints (from CONSTITUTION)

- MUST validate Convex search quality before full migration (POC phase)
- MUST maintain data integrity during migration (100% row count match)
- MUST preserve vector embeddings (1536 dimensions)
- MUST achieve ≥90% search quality match
- MUST delete useLongRunningTask pattern (Convex doesn't need it)

---

## Phase 2: Team Outputs

**Status**: PENDING
**Started**: pending
**Completed**: pending

### Product Manager Output

**Received**: PENDING

### Engineering Manager Output

**Received**: PENDING

### UI Designer Output

**Received**: PENDING

---

## Phase 3: Validation

**Status**: PENDING
**Started**: pending
**Completed**: pending

### Epic Validation

(pending)

### Task Quality Scores

(pending)

### Agent Roster Validation

(pending)

---

## Phase 4: User Approval

**Status**: PENDING
**Timestamp**: pending

### Presented Plan Summary

(pending)

### User Decision

(pending)

---

## Phase 5: Output Generation

**Status**: PENDING
**Started**: pending
**Completed**: pending

### Output Mode

File-based output to: `.spec/tasks/epic-6-deep-research-convex-migration/`

### Created Artifacts

(pending)

---

## Final Epic Inventory (Canonical)

(pending - JSON will be written here after Phase 2)

---

## Error Log

| Timestamp | Phase | Error | Recovery |
|-----------|-------|-------|----------|
