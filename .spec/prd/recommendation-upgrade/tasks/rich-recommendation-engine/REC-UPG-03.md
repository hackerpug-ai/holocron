================================================================================
TASK: REC-UPG-03 - Implement second-pass enrichment and refactor `findRecommendationsCore()` into a two-pass pipeline
================================================================================

TASK_TYPE: FEATURE
STATUS: Completed
TDD_PHASE: GREEN
CURRENT_AC: AC-5
PRIORITY: P0
EFFORT: L
TYPE: DEV
ITERATION: 1
AGENT: convex-planner
COMPLETED_AT: 2026-04-16
ORCHESTRATOR_COMMIT: f0a563e18895bc1fcb7a4d0ee9fcfd33ee9a1fca
REVIEWER: Codex adversarial review

--------------------------------------------------------------------------------
GOAL
--------------------------------------------------------------------------------

Turn the one-pass recommendation engine into a staged discovery-plus-enrichment pipeline that returns richer results while preserving top-level backward compatibility.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- [convex/research/enrichment.ts] (NEW): Selective enrichment planning, targeted searches, and merge helpers.
- [convex/research/enrichment.test.ts] (NEW): Coverage for selective enrichment, skip behavior, and failure isolation.
- [convex/research/actions.ts] (MODIFY): Refactor to staged two-pass execution with a `45_000` cap.
- [convex/research/actions.test.ts] (MODIFY): Preserve old behavior while extending for enrichment and timeout changes.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [x] Incomplete synthesized items are selectively enriched.
- [x] Already-rich items are skipped.
- [x] One entity or platform failure does not collapse the response.
- [x] Timeout cap is raised to `45_000` with the same top-level result shape.
- [x] Legacy assertions continue to pass.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Initial prompt/schema contract expansion
- Discovery helper creation
- UI rendering work

--------------------------------------------------------------------------------
CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- MUST create `convex/research/enrichment.ts` and stage the pipeline as discovery -> reading -> synthesis -> selective enrichment -> merge -> validate return.
- MUST only enrich materially incomplete items.
- MUST raise the global timeout cap from `30_000` to `45_000`.
- MUST preserve partial success and fallback behavior under per-entity and per-platform failures.

--------------------------------------------------------------------------------
SPECIFICATION
--------------------------------------------------------------------------------

Objective: refactor `findRecommendationsCore()` into a two-pass, failure-tolerant, additive recommendation pipeline.

Success looks like: pass-one synthesis produces entities, pass-two enrichment selectively fills trust metadata gaps, and the function still returns `{ items, sources, query, durationMs }` within the new timeout budget.

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

| # | Given | When | Then | Verify |
|---|---|---|---|---|
| AC-1 | synthesis returns items without `platformLinks` | enrichment executes | targeted searches merge discovered platform URLs, ratings, review counts, and `sourcePlatform` when evidence exists | `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts` |
| AC-2 | a synthesized item already has usable `platformLinks` | enrichment planning evaluates it | the item is skipped and existing rich data is preserved | `pnpm exec vitest run convex/research/enrichment.test.ts` |
| AC-3 | one entity or one platform fails during enrichment | merge completes | other successful items still return and the failed item falls back to pre-enrichment data | `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts` |
| AC-4 | execution approaches the upgraded timeout cap | the pipeline aborts | it uses a `45_000` cap and still returns the standard fallback object shape | `pnpm exec vitest run convex/research/actions.test.ts` |
| AC-5 | old tests only assert `name`, `description`, `whyRecommended`, and `rating` | the new pipeline ships | those tests remain green and output is still a strict additive superset | `pnpm exec vitest run convex/research/actions.test.ts` |

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| # | Boolean Statement | Maps To AC | Verify | Status |
|---|---|---|---|---|
| TC-1 | an item missing `platformLinks` gains at least one direct platform URL when enrichment evidence exists | AC-1 | `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-2 | items that already include `platformLinks` are not re-searched | AC-2 | `pnpm exec vitest run convex/research/enrichment.test.ts` | [x] TRUE [ ] FALSE |
| TC-3 | one rejected enrichment search does not reduce the count of other successful items | AC-3 | `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-4 | `findRecommendationsCore` uses a `45_000` timeout cap and returns fallback shape on abort | AC-4 | `pnpm exec vitest run convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |
| TC-5 | legacy recommendation assertions remain true after the refactor | AC-5 | `pnpm exec vitest run convex/research/actions.test.ts` | [x] TRUE [ ] FALSE |

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. `.spec/prd/recommendation-upgrade/README.md`
   - Lines: 54-84, 96-160
   - Focus: enrichment rules, new files, timeout, and graceful degradation requirements

2. `convex/research/actions.ts`
   - Lines: 1777-1912
   - Focus: current one-pass orchestration and fallback behavior

3. `convex/lib/jina.ts`
   - Lines: 64-205, 242-320
   - Focus: search and reader primitives available for enrichment

4. `convex/research/actions.test.ts`
   - Lines: 32-387
   - Focus: current happy-path, timeout, and export expectations

5. `/Users/justinrich/Projects/brain/docs/TDD-METHODOLOGY.md`
   - Sections: The TDD Cycle
   - Focus: staged RED-first backend refactor

--------------------------------------------------------------------------------
GUARDRAILS
--------------------------------------------------------------------------------

WRITE-ALLOWED:
- `convex/research/enrichment.ts`
- `convex/research/enrichment.test.ts`
- `convex/research/actions.ts`
- `convex/research/actions.test.ts`
- `convex/research/platformSearch.ts`

WRITE-PROHIBITED:
- `convex/chat/toolExecutor.ts`
- `components/**`
- `holocron-mcp/**`

MUST:
- [ ] Return the same top-level shape on success, partial success, and timeout fallback
- [ ] Reuse `jinaSearch`, `jinaReaderBatch`, and existing synthesis plumbing
- [ ] Cap targeted enrichment results per entity
- [ ] Use deterministic merge precedence that preserves richer existing fields

MUST NOT:
- [ ] Enrich every item regardless of need
- [ ] Overwrite stronger data with weaker snippets without a rule
- [ ] Let one enrichment failure empty the response

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- `.spec/prd/recommendation-upgrade/README.md`
- `convex/research/actions.ts`
- `convex/lib/jina.ts`
- `CLAUDE.md`

Pattern: staged recommendation pipeline with selective enrichment and deterministic merge behavior.

Anti-pattern: monolithic orchestration that mixes search, enrichment, timeout, and merge precedence inline, or all-or-nothing enrichment.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

- `pnpm exec eslint convex/research/enrichment.ts convex/research/enrichment.test.ts convex/research/actions.ts convex/research/actions.test.ts`
- `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts`
- `pnpm typecheck`

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

- `REC-UPG-01`
- `REC-UPG-02`

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------

- Specialist assignment: `convex-planner`
- Rationale: this is the core backend pipeline refactor and timeout/merge policy work

--------------------------------------------------------------------------------
REVIEW STATE (2026-04-16)
--------------------------------------------------------------------------------

- Commit reviewed: `f0a563e18895bc1fcb7a4d0ee9fcfd33ee9a1fca`
- Verdict: APPROVED
- Stub/placeholder scan: no new stubbed or placeholder behavior in touched implementation files
- Review note: initial implementation failed AC-4 because aborts during second-pass enrichment were swallowed; final approval is for the remediated branch head that propagates abort-like failures and adds focused abort coverage

Acceptance Criteria Status:
- AC-1: PASS (`convex/research/enrichment.ts`, `convex/research/enrichment.test.ts`, `convex/research/actions.test.ts`)
- AC-2: PASS (`convex/research/enrichment.ts`, `convex/research/enrichment.test.ts`)
- AC-3: PASS (`convex/research/enrichment.ts`, `convex/research/enrichment.test.ts`, `convex/research/actions.test.ts`)
- AC-4: PASS (`convex/research/enrichment.ts`, `convex/research/actions.ts`, `convex/research/actions.test.ts`)
- AC-5: PASS (`convex/research/actions.test.ts`)

Verification Commands (reviewer re-run):
- `pnpm exec vitest run convex/research/enrichment.test.ts convex/research/actions.test.ts` (pass, 2 files / 19 tests)
- `pnpm typecheck` (pass)
- `pnpm exec eslint convex/research/enrichment.ts convex/research/enrichment.test.ts convex/research/actions.ts convex/research/actions.test.ts` (pass)
