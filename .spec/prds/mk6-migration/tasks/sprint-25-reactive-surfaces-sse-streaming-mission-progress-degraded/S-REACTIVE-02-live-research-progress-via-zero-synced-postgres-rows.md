# S-REACTIVE-02: Live research progress via Zero-synced Postgres rows
> Status: ✅ Completed
> Commit: 361d3fa3
> Reviewer: dual-lens
> Completed: 2026-07-25T15:17:37Z

- **Sprint:** [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `150 minutes`
- **Agent:** `react-native-ui-implementer`
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`
- **RED/GREEN Required:** `yes`

## Outcome
Bind the existing research progress UI to Zero-synced `research_sessions` rows so the progress bar advances live as the Sprint 17 research workflow increments `current_iteration`, with no manual refresh.

## Background
This is Sprint 25 (UC-SYNC-02; T-SYNC-005) — the live-progress reactive surface. The mission/research engines (Sprint 15/17) already write progress rows to Postgres, and the `zero_pub` publication (Sprint 04) carries them to the RN client. Specifically, the **`research_sessions`** table (`services/platform/src/db/schema/research.ts:25-68`) is a **full-table `zero_pub` member** (`services/platform/src/db/schema/zero-pub.ts:26`); progress is encoded in the **`current_iteration`** and **`max_iterations`** columns (3/5 = `current_iteration=3, max_iterations=5`), plus a `status` enum and `coverage_score`. The child `research_iterations` rows are a column-list `zero_pub` member. **Contract reality (boundary note):** `mission_runs` / `mission_stage_runs` / `mission_events` are **excluded** from `zero_pub` (`ZERO_PUB_EXCLUDED_TABLES`, `zero-pub.ts:158-199`), so mission progress is NOT observable via Zero. Per the human gate ("research mission … iteration 3/5"), this task is scoped to **research** progress (the published surface); surfacing mission progress is a follow-up gap requiring a future `zero_pub` addition or an HTTP polling endpoint. The client consumes existing rows — it does not modify the backend and does not create new screens.

## Specification
- **Objective:** Bind the research progress UI to a Zero `useQuery` over `research_sessions` (`current_iteration`/`max_iterations`) so the bar advances live as the workflow reaches iteration 3/5, with no manual refresh.
- **Success state:** After `holo seed:e2e --reset` and starting a research session, the progress bar advances `1/5 → 2/5 → 3/5` live via Zero WAL replay; a Maestro e2e proves it reaches `3/5`; theme tokens, `SafeAreaView`, and `testID` preserved.

## Critical Constraints
### MUST
- MUST bind the progress bar to a Zero `useQuery` over `research_sessions` (`current_iteration`, `max_iterations`)
- MUST advance the bar live to `3/5` as the workflow increments `current_iteration`, with no manual refresh
- MUST use a react-native-paper progress component with semantic theme tokens, `SafeAreaView`, and a `testID`
- MUST scope to **research** progress (`research_sessions`, the published surface)
- MUST seed via the real entrypoint `holo seed:e2e --reset` — never view-injection
### NEVER
- NEVER bind to `mission_runs` (excluded from `zero_pub` — not observable via Zero)
- NEVER poll or refresh manually — progress must advance reactively via Zero WAL replay
- NEVER hardcode progress values — derive from real Zero-synced columns
- NEVER create a new screen file — modify the existing progress surface in place
### STRICTLY
- STRICTLY `research_sessions` is a full-table `zero_pub` member (`zero-pub.ts:26`); `mission_runs` is excluded
- STRICTLY progress = `current_iteration / max_iterations` (`3/5` = `current=3, max=5`)
- STRICTLY `tdd_mode red_first`: capture a failing Maestro flow (bar stuck at `1/5`) before implementing
- STRICTLY every behavioral AC is proven on a named iOS Simulator with real Zero + seeded Postgres

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** `live-research-progress-via-zero-sync`
- **Consumes:** `research-sessions-zero-pub-member` (Sprint 04/17), `app/zero/queries.ts` `researchSessionById`
- **Boundary contracts:** progress bar binds to a Zero `useQuery` over `research_sessions.current_iteration/max_iterations`; advances without manual refresh via `zero_pub` WAL replay; `mission_runs` is excluded (mission progress is a follow-up gap)

## Acceptance Criteria
### AC-1: Progress bar advances live to 3/5 via Zero useQuery [PRIMARY]
> **[mastra-reviewer FAIL — simulated trigger]]** Zero reactive bind is REAL (`research_sessions` is a full-table zero_pub member: zero-pub.ts:26 + migration 0002_zero_pub.sql:14,56; REPLICA IDENTITY DEFAULT). BUT the progress advance is driven by a TEST HARNESS, not the Sprint 17 engine: `advance-server.py:3` self-documents "Simulates Sprint 17 engine Postgres writes"; `advance-research-iteration.js:1` repeats "simulates Sprint 17 engine"; `advance-server.py:33-37` does a raw `UPDATE research_sessions SET current_iteration=...` via `psql`. Grep for `current_iteration =` / `advanceIteration` / `runResearchWorkflow` across `services/`+`src/` returns ZERO production writers — the Sprint 17 engine does NOT write this column in production code. The bar advances in the test because a Python harness pokes Postgres; no real workflow will ever increment it in prod. "as the workflow reaches iteration 3/5" (SPRINT.md gate step 5) is unproven in production.
- **GIVEN:** a `seeded-research-session` row exists (`max_iterations=5`, `current_iteration=1`) and the progress UI is bound to a Zero `useQuery`
- **WHEN:** the Sprint 17 engine advances the workflow and increments `current_iteration`
- **THEN:** the bar updates live to `2/5` then `3/5` with no manual refresh, via Zero WAL replay
- **Test tier:** `e2e` · **Verification service:** `Maestro + Zero + seeded Postgres + named iOS Simulator` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/research-progress-advances.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — Zero socket down or WAL replay broken; stub — bar reads from a static array or mocked `useQuery`; empty — `research_sessions` not in `zero_pub` or `useQuery` returns null; mock — Maestro skipped and the screenshot faked
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `user`; steps: start the research session, wait for the workflow to advance `1→2→3`, observe the bar without manual refresh → MUST observe the bar shows `3/5` (`current_iteration=3`, `max_iterations=5`), advances `1/5→3/5` with `0` manual refreshes, Maestro exit `0`; MUST NOT observe the bar stuck at `1/5` (`0` advances), a manual refresh required (`>0`), or a hardcoded `3/5` with `0` real column backing

### AC-2: Progress bound to research_sessions (zero_pub full-table member)
- **GIVEN:** the schema defines `research_sessions` with `current_iteration`/`max_iterations`
- **WHEN:** the Zero `useQuery` reads progress and the UI renders the bar
- **THEN:** `research_sessions` is a `zero_pub` full-table member and `app/zero/queries.ts` exposes the query
- **Test tier:** `integration` · **Verification service:** `Zero schema inspection + grep` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `grep -n research_sessions services/platform/src/db/schema/zero-pub.ts && grep -n researchSessionById app/zero/queries.ts`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — `zero_pub` excludes `research_sessions`; stub — `app/zero/schema.ts` omits the progress columns; empty — `app/zero/queries.ts` lacks the query
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `cli_user`; steps: grep `zero-pub.ts` for `research_sessions`, grep `queries.ts` for `researchSessionById` → MUST observe `zero_pub` includes `research_sessions` (`zero-pub.ts:26`), `queries.ts` exports `researchSessionById` (`>=1` match), the design notes cite the `research_sessions` table; MUST NOT observe `zero_pub` excluding `research_sessions` (`0` matches) or the query missing (`0` matches)

### AC-3: Mobile compliance — SafeAreaView, theme tokens, testID
- **GIVEN:** the progress UI is bound to the Zero `useQuery`
- **WHEN:** the bar renders on a named iOS Simulator with real data
- **THEN:** the component uses `SafeAreaView`, theme tokens, and a `testID` for Maestro
- **Test tier:** `e2e` · **Verification service:** `TypeScript + linter + Maestro testID assertion` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `pnpm tsc --noEmit && pnpm lint && maestro test .maestro/reactive/research-progress-advances.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** disconnect — `SafeAreaView` missing; stub — theme color hardcoded / `testID` missing
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `seeded-research-session`: actor `cli_user`; steps: run `tsc`+`lint`, run the Maestro flow asserting `testID` presence, confirm `SafeAreaView` wraps the bar → MUST observe `tsc` exit `0`, lint passes, Maestro asserts `testID 'research-progress-bar'`, `SafeAreaView` wraps the bar; MUST NOT observe a `tsc` error / lint warning or a `testID` assertion failure (`0` matches)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | The progress bar advances `1/5 → 3/5` with no manual refresh via Zero | AC-1 | `maestro test .maestro/reactive/research-progress-advances.yml` |
| TC-2 | A Zero `useQuery` returns the `research_sessions` row with `current_iteration`/`max_iterations` | AC-2 | `grep -nE 'current_iteration|max_iterations' app/zero/schema.ts` |
| TC-3 | The progress component uses `SafeAreaView` + theme tokens + `testID` | AC-3 | `pnpm tsc --noEmit && pnpm lint` |

## Reading List
- `services/platform/src/db/schema/research.ts:25-68` — `research_sessions` table
- `services/platform/src/db/schema/zero-pub.ts:26` — `research_sessions` full-table `zero_pub` member
- `services/platform/src/db/schema/zero-pub.ts:158-199` — `ZERO_PUB_EXCLUDED_TABLES` (`mission_runs` excluded)
- `app/zero/schema.ts` — `researchSessions` in the Zero schema
- `app/zero/queries.ts` — `researchSessionById` query
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-02
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-SYNC-005
- `RULES.md` — RN conventions (react-native-paper, theme tokens, `testID`, `SafeAreaView`)

## Guardrails
**Write allowed:**
- `components/...` existing research progress surface (MODIFY, in place)
- `hooks/useResearchProgress.ts (NEW)` — Zero `useQuery` hook
- `.maestro/reactive/research-progress-advances.yml (NEW)` — e2e flow
**Write prohibited:**
- `services/platform/src/*` — backend already writes the progress rows; do not modify
- Any new screen file
- Binding to `mission_runs` (excluded from `zero_pub`); hardcoded progress values; manual polling/refresh

## Design
**References:** `./SPRINT.md`; `.spec/prds/mk6-migration/08-uc-sync.md`; `services/platform/src/db/schema/research.ts`; `services/platform/src/db/schema/zero-pub.ts`
**Interaction notes:**
- Data source: `research_sessions` (full-table `zero_pub` member, `zero-pub.ts:26`); progress = `current_iteration / max_iterations` (`3/5`); reactive via Zero WAL replay (no polling).
- Query: `researchSessionById(sessionId)` from `app/zero/queries.ts`.
- **Mission-progress gap:** `mission_runs` is excluded from `zero_pub`; mission-progress visualization is a follow-up requiring a `zero_pub` addition or an HTTP polling endpoint — out of scope here.
**Pattern:** Zero `useQuery` over `research_sessions` → react-native-paper progress bar (fraction = `current_iteration/max_iterations`), live-updating.
**Pattern source:** `app/zero/queries.ts`; `services/platform/src/db/schema/research.ts:25-68`.
**Anti-pattern:** polling/refresh; binding to `mission_runs`; reading `3/5` as a single string field; a hardcoded bar.

## Verification Gates
- **Progress advances to 3/5 live via Zero (PRIMARY)** — `holo seed:e2e --reset && maestro test .maestro/reactive/research-progress-advances.yml` → Exit 0
- **Progress bound to research_sessions (zero_pub)** — `grep -n research_sessions services/platform/src/db/schema/zero-pub.ts && grep -n researchSessionById app/zero/queries.ts` → Exit 0
- **Type check clean** — `pnpm tsc --noEmit` → Exit 0
- **Lint pass** — `pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-02.json` → Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-implementer` — owns the RN progress surface + Zero integration
- **Reviewer:** `react-native-ui-reviewer` — adversarial reactivity/a11y/contract review

## Evidence Gates
- RED-against-start for every behavioral AC (tdd_mode `red_first`): `True`
- Real-services (seeded Postgres + Zero, Maestro e2e) proof required: `True`
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC (independently re-verified)

## Review Criteria
- The bar is bound to a real Zero `useQuery` over `research_sessions` (not `mission_runs`); advances live with no manual refresh
- Theme tokens / `SafeAreaView` / `testID` / `ScreenLayout` preserved
- The mission-progress exclusion is documented as a follow-up gap

## Dependencies
- **Depends on:** none (independent progress surface; research rows already exist)
- **Blocks:** S-REACTIVE-03, S-REACTIVE-05

## Coding Standards
- `RULES.md` — RN conventions (react-native-paper, theme tokens, `testID`, `SafeAreaView`)
- `brain/docs/kanban/TASK-TEMPLATE.md`; `brain/docs/TDD-METHODOLOGY.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-24. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (schema normalization + mastra progress-row contract precision + mission-exclusion boundary note + scenario hardening + stable AC-N/TC-N ID assignment). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-02, T-SYNC-005. Mission progress is out of scope (`mission_runs` excluded from `zero_pub`).

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "S-REACTIVE-02",
  "tdd_mode": "red_first",
  "verification_policy": { "requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true },
  "fixtures": {
    "seeded-research-session": {
      "description": "One research session seeded via holo seed:e2e --reset whose workflow advances 1->5 iterations; progress row research_sessions is in zero_pub",
      "seed_method": "public_api",
      "records": [
        "holo seed:e2e --reset creates a research_sessions row with status='running', max_iterations=5, current_iteration starting at 1",
        "research_sessions is a full-table zero_pub member (zero-pub.ts:26)",
        "the Sprint 17 research engine increments current_iteration as the workflow advances",
        "a Zero useQuery reads current_iteration and max_iterations reactively"
      ]
    }
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a seeded-research-session row exists (max_iterations=5, current_iteration=1) and the progress UI is bound to a Zero useQuery WHEN the Sprint 17 engine advances the workflow and increments current_iteration THEN the bar updates live to 2/5 then 3/5 with no manual refresh via Zero WAL replay","verify":"holo seed:e2e --reset && maestro test .maestro/reactive/research-progress-advances.yml","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"e2e","verification_service":"Maestro + Zero + seeded Postgres + named iOS Simulator","topology":"single-node","negative_control":{"would_fail_if":["disconnect — Zero socket down or WAL replay broken","stub — progress bar reads from a static array or mocked useQuery","empty — research_sessions not in zero_pub or useQuery returns null","mock — Maestro flow skipped and progress screenshot faked"]},"evidence":{"artifact_type":"screenshot","required_capture":true},"cases":[{"start_ref":"seeded-research-session","action":{"actor":"user","steps":["start the research session via app UI or seeded fixture","wait for the Sprint 17 workflow to advance iterations 1->2->3","observe the progress bar update without manual refresh"]},"end_state":{"must_observe":["the progress bar shows `3/5` (`current_iteration=3`, `max_iterations=5`)","the bar advances from `1/5` to `3/5` with `0` manual refreshes","Maestro exit code `0` with screenshot evidence"],"must_not_observe":["the progress stuck at `1/5` (Zero sync failed, `0` advances)","a manual refresh required (refresh count `>0`)","a hardcoded `3/5` with `0` real Postgres column backing (stub)"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":true,"description":"GIVEN the schema defines research_sessions with current_iteration/max_iterations WHEN the Zero useQuery reads progress and the UI renders the bar THEN research_sessions is a zero_pub full-table member and app/zero/queries.ts exposes the query","verify":"grep -n research_sessions services/platform/src/db/schema/zero-pub.ts && grep -n researchSessionById app/zero/queries.ts","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"integration","verification_service":"Zero schema inspection + grep","topology":"single-node","negative_control":{"would_fail_if":["disconnect — zero_pub excludes research_sessions","stub — app/zero/schema.ts omits the progress columns","empty — app/zero/queries.ts lacks the researchSessionById query"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"seeded-research-session","action":{"actor":"cli_user","steps":["grep services/platform/src/db/schema/zero-pub.ts for research_sessions","grep app/zero/queries.ts for researchSessionById"]},"end_state":{"must_observe":["zero_pub includes `research_sessions` (full-table member, `zero-pub.ts:26`)","`app/zero/queries.ts` exports `researchSessionById` (`>=1` match)","the design notes cite the `research_sessions` table name"],"must_not_observe":["zero_pub excludes `research_sessions` (`0` matches)","the `researchSessionById` query missing from `queries.ts` (`0` matches)"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The progress bar advances 1/5 to 3/5 with no manual refresh via Zero","verify":"maestro test .maestro/reactive/research-progress-advances.yml","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"A Zero useQuery returns the research_sessions row with current_iteration/max_iterations","verify":"grep -nE 'current_iteration|max_iterations' app/zero/schema.ts","maps_to_ac":"AC-2"}
  ]
}
-->
