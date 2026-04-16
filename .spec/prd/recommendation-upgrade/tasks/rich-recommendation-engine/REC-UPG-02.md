================================================================================
TASK: REC-UPG-02 - Add a domain-agnostic multi-platform discovery fan-out helper
================================================================================

TASK_TYPE: INFRA
STATUS: Completed
TDD_PHASE: GREEN
CURRENT_AC: AC-5
PRIORITY: P0
EFFORT: M
TYPE: DEV
ITERATION: 1
AGENT: convex-planner
COMPLETED_AT: 2026-04-16
ORCHESTRATOR_COMMIT: c6a11d2f34f97cfeee63ed4720f68f5f45e0a1b7
REVIEWER: convex-reviewer

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Create a reusable helper that turns one recommendation request into 3-5 bounded, platform-targeted searches and returns normalized discovery sources with provenance.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [convex/research/platformSearch.ts] (NEW): Pure search-plan generation, parallel execution, normalization, and dedupe.
- [convex/research/platformSearch.test.ts] (NEW): Coverage for fan-out size, graceful failure, dedupe, and timeout budgeting.
- [convex/research/actions.ts] (MODIFY): Replace single-search discovery with helper integration.
- [convex/research/actions.test.ts] (MODIFY): Preserve and extend recommendation pipeline expectations.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [x] Discovery emits 3-5 targeted searches without domain-category branching.
- [x] Per-platform failure is non-fatal.
- [x] Duplicates collapse deterministically while preserving provenance.
- [x] Discovery leaves headroom for reading, synthesis, and enrichment within the `45s` cap.
- [x] `pnpm exec vitest run convex/research/platformSearch.test.ts` passes.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Prompt/schema changes
- Selective enrichment logic
- UI/tool-handoff rendering

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST create `convex/research/platformSearch.ts` as the owner of platform discovery planning and execution.
- MUST use platform patterns and search operators, not domain categories.
- MUST execute platform searches in parallel with non-fatal failure handling.
- MUST preserve `sourcePlatform` provenance in normalized discovery results.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: introduce a pure helper for bounded multi-platform discovery.

Success looks like: recommendation discovery fans out to 3-5 searches, merges surviving results deterministically, and degrades gracefully on platform-specific failures.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | a recommendation query like `plumbers` in `Salt Lake City` | the discovery plan is built | it emits 3-5 targeted searches across general web, review, maps/community, and generic ratings patterns without service-category branching | `pnpm exec vitest run convex/research/platformSearch.test.ts` |
| AC-2 | multiple platform searches execute in parallel | one or more platforms fail or rate-limit | successful platform results still return and the helper does not throw fatally | `pnpm exec vitest run convex/research/platformSearch.test.ts` |
| AC-3 | overlapping results come back from multiple platforms | sources are merged | duplicates collapse deterministically while keeping title, snippet, URL, and provenance | `pnpm exec vitest run convex/research/platformSearch.test.ts` |
| AC-4 | a query omits location or includes constraints | the discovery plan is built | valid targeted searches still emit without location-specific assumptions | `pnpm exec vitest run convex/research/platformSearch.test.ts` |
| AC-5 | the pipeline now has a `45s` total budget | discovery runs | bounded result counts and timeouts leave enough time for later stages | `pnpm exec vitest run convex/research/platformSearch.test.ts` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | `buildPlatformSearchPlan(args)` returns between 3 and 5 searches | AC-1 | `pnpm exec vitest run convex/research/platformSearch.test.ts` | [x] TRUE [ ] FALSE |
| TC-2 | one rejected platform search promise does not reject `executePlatformSearches(...)` | AC-2 | `pnpm exec vitest run convex/research/platformSearch.test.ts` | [x] TRUE [ ] FALSE |
| TC-3 | merged discovery sources have unique canonical URLs while retaining `sourcePlatform` provenance | AC-3 | `pnpm exec vitest run convex/research/platformSearch.test.ts` | [x] TRUE [ ] FALSE |
| TC-4 | helper config uses bounded counts and explicit timeouts compatible with the end-to-end cap | AC-5 | `pnpm exec vitest run convex/research/platformSearch.test.ts` | [x] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/recommendation-upgrade/README.md`
   - Lines: 43-84, 123-160
   - Focus: multi-platform search, domain-agnostic behavior, and latency/failure constraints

2. `convex/research/actions.ts`
   - Lines: 1655-1717, 1836-1868
   - Focus: current enhanced query builder and single-pass flow

3. `convex/lib/jina.ts`
   - Lines: 64-205
   - Focus: reusable search options, site targeting, and timeout behavior

4. `convex/research/actions.test.ts`
   - Lines: 114-166, 330-387
   - Focus: existing graceful-empty, timeout, and logging expectations

5. `/Users/justinrich/Projects/brain/docs/TDD-METHODOLOGY.md`
   - Sections: The TDD Cycle
   - Focus: RED-first helper/test workflow

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `convex/research/platformSearch.ts`
- `convex/research/platformSearch.test.ts`
- `convex/research/actions.ts`
- `convex/research/actions.test.ts`

WRITE-PROHIBITED:
- `convex/chat/specialistPrompts.ts`
- `convex/chat/toolExecutor.ts`
- `components/**`

MUST:
- [ ] Keep search planning pure and isolated from UI/tool-mapping logic
- [ ] Reuse existing `jinaSearch` infrastructure
- [ ] Preserve deterministic platform order
- [ ] Carry platform provenance into normalized source objects

MUST NOT:
- [ ] Hardcode service/product categories
- [ ] Serialize platform requests one-by-one
- [ ] Drop successful sources because another platform failed

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `convex/research/actions.ts`
- `convex/lib/jina.ts`
- `CLAUDE.md`

Pattern: pure helper with explicit search-plan generation, parallel execution, normalization, and dedupe before synthesis.

Anti-pattern: inline domain-branching inside `findRecommendationsCore()` or all-or-nothing discovery failure behavior.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm exec eslint convex/research/platformSearch.ts convex/research/platformSearch.test.ts convex/research/actions.ts convex/research/actions.test.ts`
- `pnpm exec vitest run convex/research/platformSearch.test.ts`
- `pnpm typecheck`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- `REC-UPG-01`

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `convex-planner`
- Rationale: this is backend orchestration and helper-boundary work inside the Convex recommendation pipeline

--------------------------------------------------------------------------------
REVIEW STATE (2026-04-16)
--------------------------------------------------------------------------------

- Reviewer: Codex adversarial review
- Commit reviewed: `c6a11d2f34f97cfeee63ed4720f68f5f45e0a1b7`
- Verdict: APPROVED

Acceptance Criteria Status:
- AC-1: PASS (`convex/research/platformSearch.ts`, `convex/research/platformSearch.test.ts`)
- AC-2: PASS (`convex/research/platformSearch.ts`, `convex/research/platformSearch.test.ts`)
- AC-3: PASS (`convex/research/platformSearch.ts`, `convex/research/platformSearch.test.ts`)
- AC-4: PASS (`convex/research/platformSearch.ts`, `convex/research/platformSearch.test.ts`)
- AC-5: PASS (`convex/research/platformSearch.ts`, `convex/research/platformSearch.test.ts`, `convex/research/actions.ts`)

Test Criteria Status:
- TC-1: TRUE (`pnpm exec vitest run convex/research/platformSearch.test.ts`)
- TC-2: TRUE (`pnpm exec vitest run convex/research/platformSearch.test.ts`)
- TC-3: TRUE (`pnpm exec vitest run convex/research/platformSearch.test.ts`)
- TC-4: TRUE (`pnpm exec vitest run convex/research/platformSearch.test.ts`)

Verification Commands (reviewer re-run):
- `pnpm exec vitest run convex/research/platformSearch.test.ts` (pass, 1 file / 6 tests)
- `pnpm typecheck` (pass)
- `pnpm exec eslint convex/research/platformSearch.ts convex/research/platformSearch.test.ts convex/research/actions.ts convex/research/actions.test.ts` (pass)
