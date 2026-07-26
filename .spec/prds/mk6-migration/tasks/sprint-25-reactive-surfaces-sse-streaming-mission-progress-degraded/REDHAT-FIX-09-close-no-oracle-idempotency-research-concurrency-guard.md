# REDHAT-FIX-09 — Close NO_ORACLE_IDEMPOTENCY (CRITICAL) — research-progress writer concurrency guard zero coverage
> Status: ✅ Completed
> Cycle: 1
> Reviewer: product-manager+technical
> Completed: 2026-07-26T05:32:56Z
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 30 min
> Type: FEATURE
> Priority: P0
> Effort: S
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#NO_ORACLE_IDEMPOTENCY`
> Reviewer: mastra-reviewer

## Outcome

Concurrent dual advance: one ok:true currentIteration=previous+1, one RESEARCH_SESSION_UPDATE_FAILED; final DB current_iteration=previous+1; Mutant D fails the suite; sequential FIX-02 suite still green; TDD evidence chain present under .tmp/sprint-25/.

## Background

- **Finding:** NO_ORACLE_IDEMPOTENCY (CRITICAL)
- **Why it matters:** The WHERE COALESCE(current_iteration,0)=${previousIteration} clause is the ONLY concurrency safety preventing two simultaneous mission cycles from silently double-incrementing research_sessions.current_iteration. Cycle-5 Mutant D removed that clause; redhat-fix-02 suite stayed 7/7 green. Maestro sequential 1/5→2/5→3/5 also cannot catch the race. Future refactor that drops the guard → silent production double-increment, UI jumps, zero tests fail.
- **Source finding:** `.spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#NO_ORACLE_IDEMPOTENCY`
- **PRD refs:** UC-SYNC-02, T-SYNC-005
- **Capability:** CAP-SYNC-01
- **Agent rationale:** PRIMARY surface is services/platform/src/research/progress.ts + live holocron_nonprod Postgres concurrency (Promise.all dual advanceResearchSessionIteration). This is backend integration, not RN UI. Stub SPRINT row agent react-native-ui-implementer is incorrect for this finding; reassigned to mastra-implementer (same agent family as REDHAT-FIX-02 writer). Reviewer: mastra-reviewer; standing test-quality-reviewer may re-probe Mutant D.
- SPRINT.md stub lists react-native-ui-implementer — CORRECTED here to mastra-implementer with agent_rationale.
- preferred_test_file: services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts (extend)
- Error code spelling is RESEARCH_SESSION_UPDATE_FAILED (exact enum on AdvanceResearchSessionIterationFailure).
- Boundary ownership: mastra-planner primary; react-native-ui-planner concurred agent=mastra-implementer.

## Critical Constraints

### MUST
- MUST add a live-Postgres (PLATFORM_IT=1) integration test that fires two concurrent advanceResearchSessionIteration calls against the same seeded session via Promise.all
- MUST assert exactly one result has ok:true with currentIteration === previousIteration + 1 and maxIterations preserved
- MUST assert the other result has ok:false and errorCode === 'RESEARCH_SESSION_UPDATE_FAILED'
- MUST assert final SELECT current_iteration from research_sessions equals previousIteration + 1 (not +2)
- MUST prove Mutant D is KILLED: temporarily remove the COALESCE concurrency WHERE at progress.ts:127 and observe the new concurrency test exit non-zero with >=1 failure
- MUST capture RED evidence first at .tmp/sprint-25/redhat-fix-09-red.log showing concurrency test absent OR concurrency mutant survives pre-fix suite
- MUST write mutation probe evidence to .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log with distinct lines for correct (exit 0) vs mutant-D-guard-removed (exit non-zero)
- MUST write .tmp/sprint-25/redhat-fix-09-path.json {"path":"A","agent":"mastra-implementer"}
- MUST keep existing redhat-fix-02 sequential AC-1..AC-4 green (non-regression)
- MUST use real production advanceResearchSessionIteration from services/platform/src/research/progress.ts — no reimplemented harness UPDATE

### NEVER
- NEVER claim the concurrency guard covered by sequential 1→2→3 advances alone
- NEVER soft-succeed on 0-row UPDATE (production already returns RESEARCH_SESSION_UPDATE_FAILED; test must assert that code)
- NEVER mock createSql / postgres client so UPDATE row counts are unobservable
- NEVER re-open H1 Streaming seed, H3 SSE hook, or F-E2 site-A reconnect under this task
- NEVER rewrite the concurrency guard into a different locking mechanism without preserving fail-closed RESEARCH_SESSION_UPDATE_FAILED semantics and the new test still killing Mutant D
- NEVER assign or implement this as a react-native-ui task

### STRICTLY
- STRICTLY test_tier integration on PRIMARY AC; topology single-node; verification_service live Postgres holocron_nonprod
- STRICTLY tdd_mode red_first with red log proving zero concurrency coverage on HEAD
- STRICTLY DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod (or resolveHolocronNonprodDatabaseUrl) with PLATFORM_IT=1
- STRICTLY seed session 00000000-0000-4000-8000-e00000000033 at known current_iteration (e.g. 1) max_iterations=5 before concurrent calls
- STRICTLY both concurrent callers MUST share the production module import path used by mission/cycle, mission-research, and CLI

## Specification

**Objective:** Close cycle-5 NO_ORACLE_IDEMPOTENCY by adding a live-Postgres concurrent dual-call oracle that kills Mutant D (removal of the optimistic-concurrency WHERE on research_sessions.current_iteration).

**Success state:** Concurrent dual advance: one ok:true currentIteration=previous+1, one RESEARCH_SESSION_UPDATE_FAILED; final DB current_iteration=previous+1; Mutant D fails the suite; sequential FIX-02 suite still green; TDD evidence chain present under .tmp/sprint-25/.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** research-progress-writer-concurrency-oracle, mutant-d-optimistic-lock-kill-evidence
- **Consumes:** honest-research-progress-engine-or-rescope, live-research-progress-via-zero-sync, research-sessions-zero-pub-member
- **Boundary contracts:**
  - research_sessions.current_iteration / max_iterations are Zero-published; UI binds via useResearchProgress → researchSessionById (do not break Zero binding)
  - Production writer: advanceResearchSessionIteration at services/platform/src/research/progress.ts:55-153
  - Optimistic concurrency guard: UPDATE ... WHERE id=$session AND COALESCE(current_iteration,0)=${previousIteration} at progress.ts:127 — sole race safety
  - 0-row UPDATE → ok:false errorCode RESEARCH_SESSION_UPDATE_FAILED (progress.ts:132-138) — fail-closed, never soft-success
  - Fail-closed also: RESEARCH_SESSION_NOT_FOUND, ITERATION_BOUNDS (current>=max or max unset)
  - Seeded fixture: E2E_ACTIVE_SESSION_ID = 00000000-0000-4000-8000-e00000000033 (e2eUuid e,51) or SQL/public API seed
  - Production call sites (PATH-A already closed by FIX-02): mission/cycle.ts, observability/mission-research.ts, cli/holo.ts research:advance-iteration — do not remove
  - Never shell to .maestro/reactive/advance-server.py as the concurrency oracle
  - mission_runs remains excluded from zero_pub

## Acceptance Criteria

### AC-1: Concurrent dual advance: exactly one winner + UPDATE_FAILED loser [PRIMARY]
- **Description:** GIVEN seeded research_sessions row id=e00000000033 at current_iteration=N (N<max) max_iterations=5 WHEN two advanceResearchSessionIteration({sessionId}) run concurrently via Promise.all THEN exactly one result is ok:true with previousIteration=N and currentIteration=N+1 AND the other is ok:false with errorCode='RESEARCH_SESSION_UPDATE_FAILED' AND final SELECT current_iteration equals N+1 (not N+2)
- **Test tier:** `integration` · **Verification service:** `live Postgres holocron_nonprod + production progress.ts` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09|concurrent'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** stub — harness reimplements UPDATE without COALESCE guard, empty — no concurrent race, only sequential advances, static — asserts only function export exists, mock — postgres client mocked so both always succeed, disconnect — test skipped without PLATFORM_IT=1 treated as pass
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session-at-known-iteration`: actor `cli_user`
    - **Steps:**
      - PLATFORM_IT=1 with holocron_nonprod DATABASE_URL
      - ensureSeededSessionAt(N, 5) for N in {1} (or reset current_iteration=N)
      - const mod = await import('../../src/research/progress.ts')
      - const [a,b] = await Promise.all([mod.advanceResearchSessionIteration({sessionId, databaseUrl}), mod.advanceResearchSessionIteration({sessionId, databaseUrl})])
      - Classify winners/losers; SELECT current_iteration FROM research_sessions WHERE id=e00000000033
      - Write evidence JSON under .tmp/sprint-25/
    - **MUST observe:**
      - `exactly one of [a,b] has ok===true`
      - `winner.currentIteration === winner.previousIteration + 1`
      - `winner.previousIteration === N (seeded start)`
      - `exactly one of [a,b] has ok===false && errorCode==='RESEARCH_SESSION_UPDATE_FAILED'`
      - `final DB current_iteration === N + 1`
      - `final DB max_iterations === 5`
    - **MUST NOT observe:**
      - `empty/start signature: both ok:true`
      - `both ok:false with no rows advanced`
      - `final current_iteration === N + 2 (double-increment)`
      - `final current_iteration still === N after both calls`
      - `errorCode soft-success or undefined on 0-row update`

### AC-2: Mutant D (remove COALESCE concurrency WHERE) is KILLED [PRIMARY]
- **Description:** GIVEN production progress.ts WHEN the COALESCE concurrency WHERE clause is removed (Mutant D) and the REDHAT-FIX-09 concurrency suite runs THEN assertion failure count >= 1 and process exit code != 0; WHEN unmutated production code runs THEN exit code == 0; mutation.log records both outcomes
- **Test tier:** `integration` · **Verification service:** `production-code mutation probe + live Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'mutant-d-guard-removed' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -E 'mutant-d-guard-removed.*(exit=[1-9]|exit_nonzero|failures=[1-9])' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'correct.*exit=0' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** static — suite remains green under Mutant D (cycle-5 SURVIVES), stub — only documents mutant without applying production edit, empty — no mutation.log / no exit code delta, mock — self-generated harness simulation without editing progress.ts
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `mutant-d-concurrency-guard-removed`: actor `cli_user`
    - **Steps:**
      - Run concurrency suite against unmutated HEAD → expect exit 0; log correct line
      - Apply Mutant D: delete AND COALESCE(current_iteration, 0) = ${previousIteration} from progress.ts UPDATE WHERE
      - Re-run SAME concurrency suite → expect exit != 0 failures >= 1
      - Restore production source; re-run exit 0
      - Write redhat-fix-09-concurrency-mutation.log with correct vs mutant-d-guard-removed
    - **MUST observe:**
      - `correct path exit code == 0`
      - `mutant-d-guard-removed path exit code != 0`
      - `mutant-d-guard-removed assertion failure count >= 1`
      - `mutation.log line count >= 2 and contains literal 'mutant-d-guard-removed' and literal 'correct'`
      - `mutant edit path equals 'services/platform/src/research/progress.ts' OR match count >= 1 for path 'services/platform/src/research/progress.ts'`
    - **MUST NOT observe:**
      - `empty/start signature: mutant-d suite still exit 0 (cycle-5 SURVIVES)`
      - `only sequential AC-1 used as kill proof`
      - `baseline anomaly: correct and mutant both failures==1 with no meaningful delta`

### AC-3: Sequential FIX-02 non-regression + Zero binding non-regression
- **Description:** GIVEN REDHAT-FIX-09 concurrency coverage lands WHEN full redhat-fix-02 suite and s-reactive-02 Zero binding suite run THEN both exit 0 (sequential 1→3, fail-closed, production call sites, Zero binding intact)
- **Test tier:** `integration` · **Verification service:** `vitest platform + Zero binding` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts && pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — concurrent test corrupts seeded session for sequential suite, stub — Zero binding suite deleted, empty — production call sites removed while adding concurrency test
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session-at-known-iteration`: actor `cli_user`
    - **Steps:**
      - Run full redhat-fix-02 suite with PLATFORM_IT=1
      - Run s-reactive-02-research-progress-zero.test.ts
      - Restore session fixture if needed
    - **MUST observe:**
      - `redhat-fix-02 suite exit code == 0`
      - `s-reactive-02 suite exit code == 0`
      - `research_sessions still in zero_pub (match count >= 1)`
    - **MUST NOT observe:**
      - `empty/start signature: sequential AC-1 current_iteration still 1 after advances`
      - `production advanceResearchSessionIteration call site count == 0`

### AC-4: TDD evidence chain + path.json A
- **Description:** GIVEN red_first discipline WHEN implementer completes THEN .tmp/sprint-25/redhat-fix-09-red.log exists (pre-fix: concurrency coverage absent or Mutant D survives), green evidence + concurrency-mutation.log prove kill, path.json path=='A' agent=='mastra-implementer'
- **Test tier:** `integration` · **Verification service:** `tdd evidence files under .tmp/sprint-25/` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .tmp/sprint-25/redhat-fix-09-red.log && test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && test -f .tmp/sprint-25/redhat-fix-09-path.json && jq -e '.path=="A" and .agent=="mastra-implementer"' .tmp/sprint-25/redhat-fix-09-path.json`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — no red log, stub — green claimed without red phase, static — path B re-scope of concurrency without test, mock — fabricated path.json without mutation evidence
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `mutant-d-concurrency-guard-removed`: actor `cli_user`
    - **Steps:**
      - Capture redhat-fix-09-red.log (pre-fix Mutant D survives sequential suite or concurrency it missing)
      - Implement concurrency test PATH-A
      - Capture green + concurrency-mutation.log
      - Write redhat-fix-09-path.json
    - **MUST observe:**
      - `redhat-fix-09-red.log exists and file size > 0`
      - `redhat-fix-09-concurrency-mutation.log exists and file size > 0`
      - `path.json path field equals 'A'`
      - `path.json agent equals 'mastra-implementer'`
    - **MUST NOT observe:**
      - `empty/start signature: only green logs without red evidence`
      - `path.json path equals 'B' without amending S-REACTIVE-02 concurrency claim (disallowed for CRITICAL guard)`

### AC-5: Shared-sql optional stress honesty + restore fixture
- **Description:** GIVEN optional second concurrent case using a single shared sql connection or two independent connections WHEN race runs THEN semantics still enforce single winner; AFTER tests session restored to current_iteration=1 max=5 for other suites
- **Test tier:** `integration` · **Verification service:** `live Postgres` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09'`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** empty — leaves session at current_iteration=9 poisoning FIX-02 AC-4, stub — skips restore
  - **Evidence:** artifact `api_response`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session-at-known-iteration`: actor `cli_user`
    - **Steps:**
      - Run concurrent race
      - ensureSeededSessionAt(1, 5) restore in afterEach/afterAll
    - **MUST observe:**
      - `post-suite session current_iteration == 1 OR suite restores before exit`
      - `final current_iteration <= max_iterations count == 1 OR current_iteration == 1 after restore`
    - **MUST NOT observe:**
      - `empty/start signature: fixture left at current_iteration==9 from AC-4 over-max pollution without restore`

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Promise.all dual advance: exactly one ok:true N→N+1; one RESEARCH_SESSION_UPDATE_FAILED; DB final N+1 | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09|concurrent'` |
| TC-2 | Mutant D (remove COALESCE WHERE) killed; correct exit 0; mutation.log exists | AC-2 | `test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -E 'mutant-d-guard-removed.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'correct.*exit=0' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log` |
| TC-3 | Full FIX-02 + s-reactive-02 non-regression green | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts && pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts` |
| TC-4 | TDD evidence: red log + mutation log + path.json A mastra-implementer | AC-4 | `test -f .tmp/sprint-25/redhat-fix-09-red.log && test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && test -f .tmp/sprint-25/redhat-fix-09-path.json && jq -e '.path=="A" and .agent=="mastra-implementer"' .tmp/sprint-25/redhat-fix-09-path.json` |
| TC-5 | Lint/type on touched platform files | AC-1 | `pnpm biome check services/platform/src/research/progress.ts services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` |
| TC-6 | Required concurrent test shape present in suite source (Promise.all + RESEARCH_SESSION_UPDATE_FAILED) | AC-1 | `rg -n 'Promise\.all|RESEARCH_SESSION_UPDATE_FAILED|advanceResearchSessionIteration' services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` |

## Fixtures

### `seeded-research-session-at-known-iteration`
- **seed_method:** `public_api`
- **description:** research_sessions row for concurrent race. Prefer seed via ensureSeededSessionAt or holo seed:e2e; id fixed.
  - id = 00000000-0000-4000-8000-e00000000033
  - max_iterations == 5
  - current_iteration start == 1 (or other N < max) for race
  - status in ('pending','running') so UPDATE status CASE remains valid
  - DATABASE_URL holocron_nonprod only

### `mutant-d-concurrency-guard-removed`
- **seed_method:** `cli`
- **description:** Documented temporary production edit removing AND COALESCE(current_iteration, 0) = ${previousIteration} from the UPDATE WHERE in services/platform/src/research/progress.ts (~line 127). Applied against the same tree the suite imports; restored after probe.
  - mutant site: progress.ts UPDATE research_sessions WHERE clause concurrency predicate
  - without guard both concurrent advances can succeed → current_iteration jumps by 2 OR both ok:true
  - suite MUST fail under mutant

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md:64-86 — NO_ORACLE_IDEMPOTENCY
- services/platform/src/research/progress.ts:55-153 — advanceResearchSessionIteration
- services/platform/src/research/progress.ts:118-138 — UPDATE + COALESCE guard + UPDATE_FAILED
- services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts — existing PLATFORM_IT suite
- services/platform/src/mission/cycle.ts — production caller
- services/platform/src/observability/mission-research.ts — production caller
- services/platform/src/cli/holo.ts — research:advance-iteration
- S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md
- REDHAT-FIX-02-research-sessions-current-iteration-writer-or-rescope.md

## Guardrails

### WRITE-ALLOWED
- services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts (MODIFY — add concurrency describe/it + optional mutation it)
- services/platform/tests/integration/redhat-fix-09-research-iteration-concurrency.test.ts (NEW only if suite split preferred)
- services/platform/src/research/progress.ts (MODIFY only if bug found that blocks correct concurrent semantics — prefer test-only close)
- .tmp/sprint-25/redhat-fix-09-red.log
- .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log
- .tmp/sprint-25/redhat-fix-09-path.json
- .tmp/sprint-25/redhat-fix-09-ac1-concurrent.json
- S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md (footnote concurrency oracle only)
- vitest.config.ts only if new test path needs PLATFORM_IT include (prefer existing include)

### WRITE-PROHIBITED
- hooks/use-resumable-sse-stream.ts — F-E2 / FIX-10
- services/platform/src/http/chat-runs.ts — SSE backend frozen
- services/platform/src/db/seed-e2e.ts — H1 closed
- .maestro/reactive/advance-server.py as production writer
- Adding mission_runs to zero_pub
- Other REDHAT-FIX-1{0,1} product scopes
- Mocking @mastra/core or postgres to greenwash race

## Design / Pattern

- **References:** ./SPRINT.md, .spec/reviews/red-hat-sprint25-reactive-20260726T001244Z.md#NO_ORACLE_IDEMPOTENCY, services/platform/src/research/progress.ts:55-153, services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts, S-REACTIVE-02-live-research-progress-via-zero-synced-postgres-rows.md
- **Pattern:** Optimistic concurrency test: seed known iteration N; fire two concurrent production advances; assert single winner via UPDATE_FAILED on 0-row update. Kill Mutant D by removing WHERE COALESCE predicate and proving suite fails. Prefer extending redhat-fix-02 suite with describe('REDHAT-FIX-09 / AC-concurrency') rather than a parallel reimplementation.
- **Pattern source:** cycle-5 test-quality-reviewer Mutant D probe + FIX-02 production writer PATH-A
- **Anti-pattern:** Sequential-only advances claiming concurrency; mocking SQL; treating Maestro 1→2→3 as race coverage; reimplementing UPDATE in the test without importing progress.ts
- **Note:** Prefer shared suite file redhat-fix-02 so PLATFORM_IT scaffolding, ensureSeededSessionAt, and DATABASE_URL resolution stay DRY
- **Note:** Mutation probe may be an it() that spawns child vitest under temporary progress.ts edit (mirror redhat-fix-04 AC-2 pattern) OR a documented script writing the mutation log — either is fine if evidence paths match
- **Note:** If Promise.all flakily double-succeeds under very rare MVCC timing without the guard removed, increase iterations or use two independent sql clients; under WITH guard one MUST lose
- **Note:** Do not change Zero schema or useResearchProgress

## Verification Gates

- **RED baseline:** `test -f .tmp/sprint-25/redhat-fix-09-red.log && test -s .tmp/sprint-25/redhat-fix-09-red.log` → expected: RED log non-empty (Mutant D survives sequential suite or concurrency it absent)
- **Concurrency AC suite:** `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` → expected: Exit 0 including new concurrent cases
- **Mutant D kill evidence:** `test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -E 'mutant-d-guard-removed.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log` → expected: File exists; mutant-d non-zero
- **Zero binding non-regression:** `pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts` → expected: Exit 0
- **TDD path.json:** `test -f .tmp/sprint-25/redhat-fix-09-path.json && jq -e '.path=="A" and .agent=="mastra-implementer"' .tmp/sprint-25/redhat-fix-09-path.json` → expected: path A + agent mastra-implementer
- **Lint:** `pnpm biome check services/platform/src/research/progress.ts services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts` → expected: Exit 0

## Agent Assignment

- **Implementer:** mastra-implementer
- **Rationale:** PRIMARY surface is services/platform/src/research/progress.ts + live holocron_nonprod Postgres concurrency (Promise.all dual advanceResearchSessionIteration). This is backend integration, not RN UI. Stub SPRINT row agent react-native-ui-implementer is incorrect for this finding; reassigned to mastra-implementer (same agent family as REDHAT-FIX-02 writer). Reviewer: mastra-reviewer; standing test-quality-reviewer may re-probe Mutant D.
- **Reviewer:** mastra-reviewer
- **Proposed by:** mastra-planner

## Coding Standards

- Real Postgres only under PLATFORM_IT=1; it.skip when PLATFORM_IT!=1 (never fake pass)
- Import production module dynamically so RED fails cleanly if missing
- No z.any() / no stubbed ok:true without SQL
- Evidence JSON under .tmp/sprint-25/ with path.json + red.log + mutation.log cold-checkout pattern from prior REDHAT-FIX tasks
- Biome clean on touched files; prefer extend existing suite over new harness

## Dependencies

- **depends_on:** REDHAT-FIX-02, S-REACTIVE-02
- **blocks:** S-REACTIVE-05, unqualified-sprint-25-close

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-09",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-research-session-at-known-iteration": {
      "description": "research_sessions row for concurrent race. Prefer seed via ensureSeededSessionAt or holo seed:e2e; id fixed.",
      "seed_method": "public_api",
      "records": [
        "id = 00000000-0000-4000-8000-e00000000033",
        "max_iterations == 5",
        "current_iteration start == 1 (or other N < max) for race",
        "status in ('pending','running') so UPDATE status CASE remains valid",
        "DATABASE_URL holocron_nonprod only"
      ]
    },
    "mutant-d-concurrency-guard-removed": {
      "description": "Documented temporary production edit removing AND COALESCE(current_iteration, 0) = ${previousIteration} from the UPDATE WHERE in services/platform/src/research/progress.ts (~line 127). Applied against the same tree the suite imports; restored after probe.",
      "seed_method": "cli",
      "records": [
        "mutant site: progress.ts UPDATE research_sessions WHERE clause concurrency predicate",
        "without guard both concurrent advances can succeed \u2192 current_iteration jumps by 2 OR both ok:true",
        "suite MUST fail under mutant"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN seeded research_sessions row id=e00000000033 at current_iteration=N (N<max) max_iterations=5 WHEN two advanceResearchSessionIteration({sessionId}) run concurrently via Promise.all THEN exactly one result is ok:true with previousIteration=N and currentIteration=N+1 AND the other is ok:false with errorCode='RESEARCH_SESSION_UPDATE_FAILED' AND final SELECT current_iteration equals N+1 (not N+2)",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09|concurrent'",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub \u2014 harness reimplements UPDATE without COALESCE guard",
            "empty \u2014 no concurrent race, only sequential advances",
            "static \u2014 asserts only function export exists",
            "mock \u2014 postgres client mocked so both always succeed",
            "disconnect \u2014 test skipped without PLATFORM_IT=1 treated as pass"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true,
          "path": ".tmp/sprint-25/redhat-fix-09-ac1-concurrent.json"
        },
        "cases": [
          {
            "start_ref": "seeded-research-session-at-known-iteration",
            "action": {
              "actor": "cli_user",
              "steps": [
                "PLATFORM_IT=1 with holocron_nonprod DATABASE_URL",
                "ensureSeededSessionAt(N, 5) for N in {1} (or reset current_iteration=N)",
                "const mod = await import('../../src/research/progress.ts')",
                "const [a,b] = await Promise.all([mod.advanceResearchSessionIteration({sessionId, databaseUrl}), mod.advanceResearchSessionIteration({sessionId, databaseUrl})])",
                "Classify winners/losers; SELECT current_iteration FROM research_sessions WHERE id=e00000000033",
                "Write evidence JSON under .tmp/sprint-25/"
              ]
            },
            "end_state": {
              "must_observe": [
                "exactly one of [a,b] has ok===true",
                "winner.currentIteration === winner.previousIteration + 1",
                "winner.previousIteration === N (seeded start)",
                "exactly one of [a,b] has ok===false && errorCode==='RESEARCH_SESSION_UPDATE_FAILED'",
                "final DB current_iteration === N + 1",
                "final DB max_iterations === 5"
              ],
              "must_not_observe": [
                "empty/start signature: both ok:true",
                "both ok:false with no rows advanced",
                "final current_iteration === N + 2 (double-increment)",
                "final current_iteration still === N after both calls",
                "errorCode soft-success or undefined on 0-row update"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN production progress.ts WHEN the COALESCE concurrency WHERE clause is removed (Mutant D) and the REDHAT-FIX-09 concurrency suite runs THEN assertion failure count >= 1 and process exit code != 0; WHEN unmutated production code runs THEN exit code == 0; mutation.log records both outcomes",
      "verify": "test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'mutant-d-guard-removed' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -E 'mutant-d-guard-removed.*(exit=[1-9]|exit_nonzero|failures=[1-9])' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'correct.*exit=0' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 suite remains green under Mutant D (cycle-5 SURVIVES)",
            "stub \u2014 only documents mutant without applying production edit",
            "empty \u2014 no mutation.log / no exit code delta",
            "mock \u2014 self-generated harness simulation without editing progress.ts"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true,
          "path": ".tmp/sprint-25/redhat-fix-09-concurrency-mutation.log"
        },
        "cases": [
          {
            "start_ref": "mutant-d-concurrency-guard-removed",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run concurrency suite against unmutated HEAD \u2192 expect exit 0; log correct line",
                "Apply Mutant D: delete AND COALESCE(current_iteration, 0) = ${previousIteration} from progress.ts UPDATE WHERE",
                "Re-run SAME concurrency suite \u2192 expect exit != 0 failures >= 1",
                "Restore production source; re-run exit 0",
                "Write redhat-fix-09-concurrency-mutation.log with correct vs mutant-d-guard-removed"
              ]
            },
            "end_state": {
              "must_observe": [
                "correct path exit code == 0",
                "mutant-d-guard-removed path exit code != 0",
                "mutant-d-guard-removed assertion failure count >= 1",
                "mutation.log line count >= 2 and contains literal 'mutant-d-guard-removed' and literal 'correct'",
                "mutant edit path equals 'services/platform/src/research/progress.ts' OR match count >= 1 for path 'services/platform/src/research/progress.ts'"
              ],
              "must_not_observe": [
                "empty/start signature: mutant-d suite still exit 0 (cycle-5 SURVIVES)",
                "only sequential AC-1 used as kill proof",
                "baseline anomaly: correct and mutant both failures==1 with no meaningful delta"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN REDHAT-FIX-09 concurrency coverage lands WHEN full redhat-fix-02 suite and s-reactive-02 Zero binding suite run THEN both exit 0 (sequential 1\u21923, fail-closed, production call sites, Zero binding intact)",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts && pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect \u2014 concurrent test corrupts seeded session for sequential suite",
            "stub \u2014 Zero binding suite deleted",
            "empty \u2014 production call sites removed while adding concurrency test"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session-at-known-iteration",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run full redhat-fix-02 suite with PLATFORM_IT=1",
                "Run s-reactive-02-research-progress-zero.test.ts",
                "Restore session fixture if needed"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-02 suite exit code == 0",
                "s-reactive-02 suite exit code == 0",
                "research_sessions still in zero_pub (match count >= 1)"
              ],
              "must_not_observe": [
                "empty/start signature: sequential AC-1 current_iteration still 1 after advances",
                "production advanceResearchSessionIteration call site count == 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN red_first discipline WHEN implementer completes THEN .tmp/sprint-25/redhat-fix-09-red.log exists (pre-fix: concurrency coverage absent or Mutant D survives), green evidence + concurrency-mutation.log prove kill, path.json path=='A' agent=='mastra-implementer'",
      "verify": "test -f .tmp/sprint-25/redhat-fix-09-red.log && test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && test -f .tmp/sprint-25/redhat-fix-09-path.json && jq -e '.path==\"A\" and .agent==\"mastra-implementer\"' .tmp/sprint-25/redhat-fix-09-path.json",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 no red log",
            "stub \u2014 green claimed without red phase",
            "static \u2014 path B re-scope of concurrency without test",
            "mock \u2014 fabricated path.json without mutation evidence"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mutant-d-concurrency-guard-removed",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Capture redhat-fix-09-red.log (pre-fix Mutant D survives sequential suite or concurrency it missing)",
                "Implement concurrency test PATH-A",
                "Capture green + concurrency-mutation.log",
                "Write redhat-fix-09-path.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-09-red.log exists and file size > 0",
                "redhat-fix-09-concurrency-mutation.log exists and file size > 0",
                "path.json path field equals 'A'",
                "path.json agent equals 'mastra-implementer'"
              ],
              "must_not_observe": [
                "empty/start signature: only green logs without red evidence",
                "path.json path equals 'B' without amending S-REACTIVE-02 concurrency claim (disallowed for CRITICAL guard)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN optional second concurrent case using a single shared sql connection or two independent connections WHEN race runs THEN semantics still enforce single winner; AFTER tests session restored to current_iteration=1 max=5 for other suites",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09'",
      "maps_to_ac": null,
      "flow_ref": "UC-SYNC-02",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 leaves session at current_iteration=9 poisoning FIX-02 AC-4",
            "stub \u2014 skips restore"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session-at-known-iteration",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run concurrent race",
                "ensureSeededSessionAt(1, 5) restore in afterEach/afterAll"
              ]
            },
            "end_state": {
              "must_observe": [
                "post-suite session current_iteration == 1 OR suite restores before exit",
                "final current_iteration <= max_iterations count == 1 OR current_iteration == 1 after restore"
              ],
              "must_not_observe": [
                "empty/start signature: fixture left at current_iteration==9 from AC-4 over-max pollution without restore"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Promise.all dual advance: exactly one ok:true N\u2192N+1; one RESEARCH_SESSION_UPDATE_FAILED; DB final N+1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts -t 'AC-concurrency|REDHAT-FIX-09|concurrent'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Mutant D (remove COALESCE WHERE) killed; correct exit 0; mutation.log exists",
      "verify": "test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -E 'mutant-d-guard-removed.*(failures=[1-9]|exit=[1-9]|exit_nonzero)' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && rg -q 'correct.*exit=0' .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Full FIX-02 + s-reactive-02 non-regression green",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod pnpm vitest run services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts && pnpm vitest run tests/integration/s-reactive-02-research-progress-zero.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "TDD evidence: red log + mutation log + path.json A mastra-implementer",
      "verify": "test -f .tmp/sprint-25/redhat-fix-09-red.log && test -f .tmp/sprint-25/redhat-fix-09-concurrency-mutation.log && test -f .tmp/sprint-25/redhat-fix-09-path.json && jq -e '.path==\"A\" and .agent==\"mastra-implementer\"' .tmp/sprint-25/redhat-fix-09-path.json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Lint/type on touched platform files",
      "verify": "pnpm biome check services/platform/src/research/progress.ts services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Required concurrent test shape present in suite source (Promise.all + RESEARCH_SESSION_UPDATE_FAILED)",
      "verify": "rg -n 'Promise\\.all|RESEARCH_SESSION_UPDATE_FAILED|advanceResearchSessionIteration' services/platform/tests/integration/redhat-fix-02-research-iteration-writer.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
