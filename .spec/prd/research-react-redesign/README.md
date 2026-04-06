# Research Agents React Redesign PRD

**Status**: Spike / Design Document
**Author**: US-OI-005
**Date**: 2026-04-06

---

## 1. Problem Statement

The current research system has grown organically into a tightly-coupled architecture where multiple entry points (`dispatcher.ts`, `parallel.ts`, `actions.ts`) each implement their own orchestration logic, state tracking, and side-effect management. This creates several pain points:

1. **Duplicated orchestration patterns** - `dispatcher.ts` (718 lines) and `parallel.ts` (604 lines) both implement their own plan-decompose-search-synthesize-persist pipelines with inline state management, loading card updates, and session mutations. Adding a new research strategy requires copying ~200 lines of boilerplate.

2. **Specialist agents are coupled to search infrastructure** - All 4 specialists (`academic.ts`, `technical.ts`, `product_finder.ts`, `service_finder.ts`) directly call `executeParallelSearchWithRetry` and `generateText`, making them impossible to test in isolation or compose with alternative search backends.

3. **No formal lifecycle states** - Research sessions transition through states (`pending`, `searching`, `analyzing`, `synthesizing`, `completed`, `failed`) via ad-hoc mutation calls scattered across orchestrator code. There is no state machine enforcing valid transitions, making it easy to leave sessions in inconsistent states on error.

4. **Side effects are interleaved with core logic** - Loading card updates, iteration record creation, session completion mutations, and improvement logging are interspersed throughout the research flow rather than being handled by a composable effect layer.

5. **Intent classification is disconnected from specialist selection** - `intent.ts` classifies queries into modes (OVERVIEW, ACTIONABLE, COMPARATIVE, EXPLORATORY), while `dispatcher.ts` has a separate `detectSpecialist()` function using keyword matching. These two classification systems operate independently.

6. **No reuse across strategies** - The parallel fan-out strategy and the plan-based dispatcher share almost identical patterns for search execution, synthesis, and persistence but share no code.

---

## 2. Current Architecture

### 2.1 System Overview

```
                      User Query
                          |
                    [Chat Tool Layer]
                     /           \
                    v             v
          actions.ts           dispatcher.ts
        (startDeepResearch)   (runPlanBasedResearch)
              |                    |
              v                    v
          parallel.ts         dispatcher.ts
       (executeParallelFanOut)  (executePlanBasedResearch)
              |                    |
    +---------+--------+     +-----+------+
    |         |        |     |     |      |
    v         v        v     v     v      v
  intent   search   synth  track track  track
  classify  (Exa+   (GPT)  worker worker worker
  (GPT)    Jina)              |     |      |
                              v     v      v
                           search search search
                           (Exa+  (Exa+  (Exa+
                           Jina)  Jina)  Jina)

  Side effects (loading cards, session mutations, iteration records)
  are scattered inline throughout all orchestrators.
```

### 2.2 File Inventory

| File | Lines | Role | Coupling Issues |
|------|-------|------|-----------------|
| `actions.ts` | ~600+ | Deep research entry point, iterative loop | Directly manages session state, loading cards, embeddings, termination |
| `parallel.ts` | 604 | Parallel fan-out strategy | Inlines decomposition, search, synthesis, follow-up, loading cards, session mutations |
| `dispatcher.ts` | 718 | Plan-based track dispatcher | Inlines track assignment, worker execution, result aggregation, loading cards, session mutations |
| `search.ts` | 649 | Search execution (Exa + Jina) | Low coupling -- good utility layer |
| `intent.ts` | 155 | Intent classification (LLM + heuristic) | Standalone -- good |
| `mode_prompts.ts` | 435 | Mode-specific prompt fragments | Standalone -- good |
| `specialists/academic.ts` | 259 | Academic specialist | Directly calls search + LLM, logs improvements inline |
| `specialists/technical.ts` | 259 | Technical specialist | Same pattern as academic |
| `specialists/product_finder.ts` | 309 | Product finder | Same pattern + product-specific metadata |
| `specialists/service_finder.ts` | 312 | Service finder | Same pattern + service-specific metadata |

### 2.3 Data Flow (Parallel Fan-Out Path)

1. `runParallelFanOut` (action) calls `executeParallelFanOut` (helper)
2. Creates conversation (if needed) and session via mutations
3. Posts loading card via `chatMessages.mutations.create`
4. Decomposes topic into sub-questions via `decomposeIntoSubQuestions` (LLM)
5. Updates loading card (analyze step complete)
6. Executes all sub-questions via `executeParallelSearchWithRetry` in parallel
7. Updates loading card (search step complete)
8. Synthesizes findings via `generateText` (LLM)
9. Updates loading card (synthesis step complete)
10. Optionally runs follow-up for gaps
11. Updates loading card (follow-up step)
12. Creates iteration record via `research.mutations.createDeepResearchIteration`
13. Completes session via `research.mutations.completeDeepResearchSession`
14. Returns result

**Key observation**: Steps 2-3, 5, 7, 9, 11-13 are all side effects that repeat identically across strategies.

### 2.4 Data Flow (Plan-Based Dispatcher Path)

1. `runPlanBasedResearch` fetches approved plan, creates session, posts loading card
2. `executePlanBasedResearch` parses plan into track configs
3. Updates loading card (dispatch step)
4. Executes all track workers in parallel via `executeTrackWorkerWithRetry`
5. Aggregates results via `aggregateTrackResults`
6. Updates loading card (research step complete)
7. Creates iteration record
8. Completes session
9. Returns result

**Same side-effect pattern**: session creation, loading cards, iteration records, session completion.

---

## 3. Proposed Architecture

### 3.1 Design Principles

1. **Composable pipeline stages** - Each stage (decompose, search, synthesize, persist) is an independent function with typed input/output contracts.
2. **State machine for lifecycle** - Research sessions transition through a finite set of states with explicit guards.
3. **Effect layer separation** - Side effects (loading cards, mutations) are handled by a middleware-like effect system, not inline.
4. **Strategy pattern for orchestration** - Different research strategies compose the same stages differently.
5. **Specialist agents are pure transforms** - Specialists receive search results and produce reports; they do not execute searches or manage state.

### 3.2 System Overview (Proposed)

```
                      User Query
                          |
                    [Chat Tool Layer]
                          |
                          v
                   ResearchOrchestrator
                   (strategy selection)
                          |
              +-----------+-----------+
              |           |           |
              v           v           v
          FanOutStrategy  PlanStrategy  DeepIterativeStrategy
              |           |           |
              v           v           v
          Pipeline<Stage[]>
              |
    +---------+---------+---------+
    |         |         |         |
    v         v         v         v
  Decompose  Search   Synthesize  Persist
  Stage      Stage    Stage       Stage
    |         |         |           |
    v         v         v           v
  intent.ts  search.ts  synth.ts   effects.ts
  mode.ts   specialists/            |
                                    v
                              EffectRunner
                              (loading cards,
                               session mutations,
                               iteration records,
                               improvement logging)
```

### 3.3 State Machine

```
                        +-----------+
                        |           |
                  +---->|  CREATED  |
                  |     |           |
                  |     +-----+-----+
                  |           |
                  |     start()
                  |           |
                  |     +-----v-----+
                  |     |           |
               reset()  | DECOMPOSING|
                  |     |           |
                  |     +-----+-----+
                  |           |
                  |    decomposed()
                  |           |
                  |     +-----v-----+
                  |     |           |
                  +-----|  SEARCHING |<----+
                        |           |     |
                        +-----+-----+     |
                              |           |
                       searched()    iterate()
                              |           |
                        +-----v-----+     |
                        |           |     |
                        | SYNTHESIZING|    |
                        |           |     |
                        +-----+-----+     |
                              |           |
                      synthesized()       |
                              |           |
                        +-----v-----+     |
                        |           |     |
                        | REVIEWING |-----+
                        |           |  (gaps found,
                        +-----+-----+   under max
                              |         iterations)
                        complete() |
                              |
                        +-----v-----+
                        |           |
                        | COMPLETED |
                        |           |
                        +-----------+

           Any state --error()--> FAILED
           Any state --cancel()--> CANCELLED
```

**States**:

| State | Description | Valid Transitions |
|-------|-------------|-------------------|
| `CREATED` | Session initialized, no work started | `start()` -> DECOMPOSING |
| `DECOMPOSING` | Breaking topic into sub-questions | `decomposed()` -> SEARCHING, `error()` -> FAILED |
| `SEARCHING` | Executing searches in parallel | `searched()` -> SYNTHESIZING, `error()` -> FAILED |
| `SYNTHESIZING` | LLM synthesizing findings | `synthesized()` -> REVIEWING, `error()` -> FAILED |
| `REVIEWING` | Evaluating coverage, deciding next step | `complete()` -> COMPLETED, `iterate()` -> SEARCHING |
| `COMPLETED` | Research finished successfully | Terminal |
| `FAILED` | Research failed with error | Terminal |
| `CANCELLED` | User cancelled research | Terminal |

---

## 4. Component Contracts

### 4.1 DecomposeStage

Transforms a research topic into a set of sub-questions for parallel search.

```typescript
interface DecomposeInput {
  topic: string;
  mode: ResearchMode;
  budget: SearchBudget;
  previousFindings?: string[];  // For iterative refinement
  previousGaps?: string[];
}

interface DecomposeOutput {
  subQuestions: SubQuestion[];
  decompositionMethod: "llm" | "heuristic";
}

type DecomposeStage = (input: DecomposeInput) => Promise<DecomposeOutput>;
```

**Existing code reused**: `decomposeIntoSubQuestions()` from `parallel.ts`, `getDecompositionInstructions()` from `mode_prompts.ts`.

### 4.2 SearchStage

Executes search queries in parallel across configured providers.

```typescript
interface SearchInput {
  queries: SubQuestion[];
  options: {
    maxRetries: number;
    timeoutMs: number;
    deduplicateResults: boolean;
    providers?: ("exa" | "jina")[];
  };
}

interface SearchOutput {
  results: StructuredSearchResult[];
  domainResults: Array<{
    domain: string;
    query: string;
    findings: string;
    sourceCount: number;
    durationMs: number;
  }>;
  totalSources: number;
  totalDurationMs: number;
}

type SearchStage = (input: SearchInput) => Promise<SearchOutput>;
```

**Existing code reused**: `executeParallelSearchWithRetry()`, `executeExaSearch()`, `executeJinaSearch()` from `search.ts`.

### 4.3 SpecialistStage (optional enrichment)

Enriches raw search results with domain-specific analysis. Specialists become pure transforms -- they receive results and produce structured reports without executing searches.

```typescript
interface SpecialistInput {
  specialistType: SpecialistType;
  query: string;
  searchResults: StructuredSearchResult[];
}

interface SpecialistOutput {
  report: AcademicReport | TechnicalReport | ProductReport | ServiceReport;
  improvements: string[];  // Extracted improvement suggestions
}

type SpecialistStage = (input: SpecialistInput) => Promise<SpecialistOutput>;
```

**Breaking change**: Current specialists call `executeParallelSearchWithRetry` internally. In the new design, search results are passed in. Improvement logging is extracted as a return value rather than a side effect.

### 4.4 SynthesizeStage

Synthesizes search results into a structured research report.

```typescript
interface SynthesizeInput {
  topic: string;
  mode: ResearchMode;
  domainResults: Array<{ domain: string; findings: string }>;
  previousSynthesis?: string;  // For iterative refinement
}

interface SynthesizeOutput {
  summary: string;
  keyFindings: string[];
  gaps: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  structuredReport?: string;  // Mode-specific formatted report
}

type SynthesizeStage = (input: SynthesizeInput) => Promise<SynthesizeOutput>;
```

**Existing code reused**: `buildFanOutSynthesisPrompt()` from `parallel.ts`, `getSynthesisInstructions()` and `getReportStructure()` from `mode_prompts.ts`.

### 4.5 ReviewStage

Evaluates coverage and decides whether to iterate or complete.

```typescript
interface ReviewInput {
  synthesis: SynthesizeOutput;
  iterationCount: number;
  maxIterations: number;
  terminationCriteria: TerminationCriteria;
}

interface ReviewOutput {
  decision: "complete" | "iterate";
  coverageScore: number;
  feedback: string;
  refinedQueries?: string[];  // Queries for next iteration
}

type ReviewStage = (input: ReviewInput) => Promise<ReviewOutput>;
```

**Existing code reused**: `shouldContinueResearch()` from `termination.ts`, review prompt from `actions.ts`.

### 4.6 EffectRunner

Handles all side effects in a composable, strategy-agnostic way.

```typescript
interface ResearchEffects {
  /** Create or update loading card */
  updateProgress(
    sessionId: Id<"deepResearchSessions">,
    steps: ProgressStep[]
  ): Promise<void>;

  /** Persist iteration findings */
  saveIteration(
    sessionId: Id<"deepResearchSessions">,
    iteration: IterationData
  ): Promise<void>;

  /** Complete the session */
  completeSession(
    sessionId: Id<"deepResearchSessions">,
    status: "completed" | "failed"
  ): Promise<void>;

  /** Log improvement suggestions */
  logImprovements(
    suggestions: string[],
    source: string,
    query: string
  ): Promise<void>;

  /** Generate and store embeddings */
  storeEmbeddings(
    sessionId: Id<"deepResearchSessions">,
    findings: string
  ): Promise<void>;
}

interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  detail?: string;
}

interface IterationData {
  iterationNumber: number;
  coverageScore: number;
  feedback: string;
  findings: string;
  refinedQueries: string[];
  summary: string;
}
```

**Existing code extracted from**: `updateFanOutLoadingCard()` in `parallel.ts`, inline mutation calls in `dispatcher.ts` and `actions.ts`, `logImprovementsFrom*` in all specialists.

### 4.7 ResearchOrchestrator (Strategy Coordinator)

```typescript
interface ResearchStrategy {
  name: string;
  /** Compose stages into an execution plan */
  execute(
    ctx: ActionCtx,
    config: ResearchConfig,
    effects: ResearchEffects
  ): Promise<ResearchResult>;
}

interface ResearchConfig {
  topic: string;
  mode: ResearchMode;
  conversationId: Id<"conversations">;
  sessionId: Id<"deepResearchSessions">;
  maxIterations: number;
  enableFollowUp: boolean;
}

interface ResearchResult {
  sessionId: Id<"deepResearchSessions">;
  conversationId: Id<"conversations">;
  status: "completed" | "partial" | "failed";
  summary: string;
  confidence: string;
  durationMs: number;
}
```

**Strategies**:
- `FanOutStrategy` - Current `parallel.ts` flow: decompose -> parallel search -> synthesize -> optional follow-up
- `PlanBasedStrategy` - Current `dispatcher.ts` flow: parse plan -> parallel track workers -> aggregate
- `DeepIterativeStrategy` - Current `actions.ts` flow: iterative search-synthesize-review loop

---

## 5. State Machine Implementation

The state machine should be implemented as a pure function that validates transitions, separate from Convex mutations.

```typescript
type ResearchState =
  | "CREATED"
  | "DECOMPOSING"
  | "SEARCHING"
  | "SYNTHESIZING"
  | "REVIEWING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

interface StateTransition {
  from: ResearchState;
  to: ResearchState;
  event: string;
}

const VALID_TRANSITIONS: StateTransition[] = [
  { from: "CREATED",      to: "DECOMPOSING",   event: "start" },
  { from: "DECOMPOSING",  to: "SEARCHING",     event: "decomposed" },
  { from: "SEARCHING",    to: "SYNTHESIZING",  event: "searched" },
  { from: "SYNTHESIZING", to: "REVIEWING",     event: "synthesized" },
  { from: "REVIEWING",    to: "COMPLETED",     event: "complete" },
  { from: "REVIEWING",    to: "SEARCHING",     event: "iterate" },
  // Error transitions from any active state
  { from: "DECOMPOSING",  to: "FAILED",        event: "error" },
  { from: "SEARCHING",    to: "FAILED",        event: "error" },
  { from: "SYNTHESIZING", to: "FAILED",        event: "error" },
  { from: "REVIEWING",    to: "FAILED",        event: "error" },
  // Cancel from any active state
  { from: "CREATED",      to: "CANCELLED",     event: "cancel" },
  { from: "DECOMPOSING",  to: "CANCELLED",     event: "cancel" },
  { from: "SEARCHING",    to: "CANCELLED",     event: "cancel" },
  { from: "SYNTHESIZING", to: "CANCELLED",     event: "cancel" },
  { from: "REVIEWING",    to: "CANCELLED",     event: "cancel" },
];

function transition(
  currentState: ResearchState,
  event: string
): ResearchState {
  const valid = VALID_TRANSITIONS.find(
    t => t.from === currentState && t.event === event
  );
  if (!valid) {
    throw new Error(
      `Invalid transition: ${currentState} --${event}-->`
    );
  }
  return valid.to;
}
```

The Convex mutation layer wraps this pure function:

```typescript
// convex/research/mutations.ts (new or extended)
export const transitionSessionState = mutation({
  args: {
    sessionId: v.id("deepResearchSessions"),
    event: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { sessionId, event, metadata }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) throw new Error("Session not found");

    const newState = transition(session.state as ResearchState, event);
    await ctx.db.patch(sessionId, {
      state: newState,
      ...(metadata ?? {}),
      _updatedAt: Date.now(),
    });

    return newState;
  },
});
```

---

## 6. Migration Path

### Phase 1: Extract Effect Layer (Non-breaking)

**Goal**: Create `effects.ts` and move all side-effect code out of orchestrators.

1. Create `convex/research/effects.ts` implementing `ResearchEffects` interface
2. Extract `updateFanOutLoadingCard` from `parallel.ts` into `effects.updateProgress`
3. Extract inline iteration/session mutations into `effects.saveIteration` and `effects.completeSession`
4. Extract `logImprovementsFrom*` from all specialists into `effects.logImprovements`
5. Update `parallel.ts` and `dispatcher.ts` to use `effects.*` calls instead of inline mutations
6. **No behavior change** -- same mutations called, just from a different location

### Phase 2: Extract Pipeline Stages (Non-breaking)

**Goal**: Create typed stage functions from existing inline code.

1. Create `convex/research/stages/decompose.ts` -- wraps `decomposeIntoSubQuestions`
2. Create `convex/research/stages/search.ts` -- wraps `executeParallelSearchWithRetry` with typed I/O
3. Create `convex/research/stages/synthesize.ts` -- extracts synthesis logic from `parallel.ts`
4. Create `convex/research/stages/review.ts` -- extracts review/termination logic from `actions.ts`
5. Update orchestrators to call stage functions
6. **No behavior change** -- same logic, new locations

### Phase 3: Introduce State Machine (Schema change)

**Goal**: Add formal state tracking to `deepResearchSessions`.

1. Add `state` field to `deepResearchSessions` schema (default: `"CREATED"`)
2. Create `convex/research/stateMachine.ts` with `transition()` function
3. Create `transitionSessionState` mutation
4. Update orchestrators to call `transitionSessionState` at each stage boundary
5. **Additive schema change** -- existing sessions get default state, no migration needed
6. Backfill existing `status` field mapping: `pending` -> `CREATED`, `running` -> `SEARCHING`, `completed` -> `COMPLETED`, `failed` -> `FAILED`

### Phase 4: Refactor Specialists (Breaking for specialists)

**Goal**: Make specialists pure transforms.

1. Remove `executeParallelSearchWithRetry` calls from all 4 specialists
2. Change specialist function signatures to accept `StructuredSearchResult[]` instead of `query: string`
3. Return `improvements: string[]` instead of calling mutations inline
4. Update any code that calls specialists directly to pass search results
5. **Breaking**: Specialist function signatures change

### Phase 5: Strategy Pattern (Breaking for entry points)

**Goal**: Replace three separate orchestrators with composable strategies.

1. Create `convex/research/strategies/` directory
2. Implement `FanOutStrategy`, `PlanBasedStrategy`, `DeepIterativeStrategy`
3. Create `ResearchOrchestrator` that selects and executes strategies
4. Replace `runParallelFanOut`, `runPlanBasedResearch`, `startDeepResearch` with orchestrator calls
5. **Breaking**: Action signatures may change; update chat tool layer

### Phase 6: Update Client Hook (Non-breaking)

**Goal**: Expose state machine states to the UI.

1. Update `useResearchSession` / `useDeepResearchSession` to return `state` field
2. Update `getSessionStatusLabel` to map new states
3. Update `calculateSessionProgress` to use state machine states
4. **Non-breaking**: New field, existing fields preserved

---

## 7. Breaking Changes

### 7.1 Specialist Function Signatures (Phase 4)

**Before**:
```typescript
executeAcademicResearch(ctx: ActionCtx, query: string): Promise<AcademicReport>
```

**After**:
```typescript
executeAcademicResearch(
  query: string,
  searchResults: StructuredSearchResult[]
): Promise<{ report: AcademicReport; improvements: string[] }>
```

- `ctx` parameter removed (no more direct mutation calls)
- `searchResults` parameter added (search is external)
- Return type changes to include extracted improvements
- All 4 specialists affected: `academic.ts`, `technical.ts`, `product_finder.ts`, `service_finder.ts`

### 7.2 Schema Addition (Phase 3)

- `deepResearchSessions` table gains a `state` field of type `string`
- Existing sessions will have `state: undefined` until backfilled
- No existing field removed or renamed

### 7.3 Action Entry Points (Phase 5)

- `runParallelFanOut` action args remain the same, but internal routing changes
- `runPlanBasedResearch` action args remain the same
- `startDeepResearch` action args remain the same
- **Client-facing API is preserved** -- only internal orchestration changes

### 7.4 Hook Return Types (Phase 6)

- `useDeepResearchSession` gains a `state` field in its return value
- `getSessionStatusLabel` gains new state mappings
- `calculateSessionProgress` uses state machine for progress calculation
- **Additive only** -- no existing return fields removed

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| State machine introduces overhead for simple single-pass flows | Medium | Low | Keep state machine lightweight (pure function, no async). FanOut strategy can batch transitions. |
| Specialist refactor breaks callers outside research module | Low | Medium | Search codebase for all specialist call sites before Phase 4. The specialists are only called from `dispatcher.ts` today. |
| Schema migration for `state` field causes issues with in-flight sessions | Low | Medium | Default value handles missing field. Deploy Phase 3 during low-traffic window. |
| Effect layer abstraction hides important context from debugging | Medium | Medium | Keep all `console.log` calls in the effect layer. Add structured logging with session IDs. |
| Strategy pattern over-engineering for 3 strategies | Medium | Low | Keep strategies as plain objects with an `execute` method -- no abstract class hierarchy, no plugin system. |
| Parallel search reliability changes during refactor | Low | High | `search.ts` and `search` utilities are NOT being refactored -- they are the stable foundation layer. |
| Loading card UX regression during effect layer extraction | Medium | Medium | Write integration tests for loading card update sequences before extracting. |

---

## 9. Future Extensions

This architecture enables several capabilities that are currently difficult or impossible:

### 9.1 DAG-based Execution

The `SubQuestion.dependsOn` field already exists but is unused. With the pipeline stage architecture, a DAG scheduler can replace `Promise.all` in the SearchStage, executing independent queries in parallel while respecting dependencies.

### 9.2 Streaming Progress

The EffectRunner can be extended to emit real-time progress events (e.g., via Convex subscriptions) instead of polling loading cards. Each stage completion triggers an event.

### 9.3 Pluggable Search Providers

The SearchStage contract (`SearchInput -> SearchOutput`) makes it trivial to add new providers (Google Scholar, Semantic Scholar, arXiv API) without touching orchestration code.

### 9.4 Research Templates

Strategies can be parameterized with templates (e.g., "competitive analysis template" that pre-configures decomposition angles, specialist types, and report structure) without new code.

### 9.5 Caching Layer

The typed stage contracts enable memoization at stage boundaries. A `DecomposeOutput` for a given topic+mode can be cached, and `SearchOutput` for a given query set can be reused across sessions.

### 9.6 Multi-Agent Coordination

The state machine and effect layer provide the hooks needed for multi-agent research where different agents handle different stages or iterations, coordinated through session state.

### 9.7 Composable Specialist Chains

Pure specialist transforms can be chained (e.g., academic search -> technical specialist for code extraction -> product specialist for tool recommendations) since they no longer manage their own search or state.

---

## Appendix A: File Structure (Proposed)

```
convex/research/
  stateMachine.ts          # Pure state transition function + types
  effects.ts               # ResearchEffects implementation (all side effects)
  orchestrator.ts           # Strategy selection and execution coordinator
  stages/
    decompose.ts            # DecomposeStage implementation
    search.ts               # SearchStage implementation
    synthesize.ts           # SynthesizeStage implementation
    review.ts               # ReviewStage implementation
    index.ts                # Re-exports
  strategies/
    fanOut.ts               # FanOutStrategy (replaces parallel.ts core logic)
    planBased.ts            # PlanBasedStrategy (replaces dispatcher.ts core logic)
    deepIterative.ts        # DeepIterativeStrategy (replaces actions.ts core logic)
    index.ts                # Re-exports
  specialists/
    academic.ts             # Pure transform (no search, no mutations)
    technical.ts            # Pure transform
    product_finder.ts       # Pure transform
    service_finder.ts       # Pure transform
    index.ts                # Registry + type exports
  # Preserved as-is (stable utility layers):
  search.ts                 # Search execution (Exa + Jina)
  intent.ts                 # Intent classification
  mode_prompts.ts           # Mode-specific prompt fragments
  confidence.ts             # Confidence scoring
  termination.ts            # Termination criteria
  embeddings.ts             # Embedding generation
  rateLimiter.ts            # Rate limiting
  prompts.ts                # Prompt builders
```

## Appendix B: Estimated Effort

| Phase | Effort | Risk | Dependencies |
|-------|--------|------|--------------|
| Phase 1: Extract Effect Layer | 1-2 days | Low | None |
| Phase 2: Extract Pipeline Stages | 1-2 days | Low | Phase 1 |
| Phase 3: State Machine | 1 day | Medium | Phase 2 |
| Phase 4: Refactor Specialists | 1 day | Medium | Phase 2 |
| Phase 5: Strategy Pattern | 2-3 days | Medium | Phases 1-4 |
| Phase 6: Update Client Hook | 0.5 day | Low | Phase 3 |
| **Total** | **6.5-9.5 days** | | |

Phases 3 and 4 can run in parallel. Phase 5 is the largest and highest-risk phase.
