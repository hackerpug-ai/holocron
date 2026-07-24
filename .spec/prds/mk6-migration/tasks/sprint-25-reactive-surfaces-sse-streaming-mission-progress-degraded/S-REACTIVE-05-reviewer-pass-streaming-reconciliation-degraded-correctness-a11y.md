# S-REACTIVE-05: Reviewer pass — streaming/reconciliation/degraded correctness + a11y
> Status: Backlog

- **Sprint:** [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`
- **Effort:** `M`
- **Estimate:** `120 minutes`
- **Agent:** `react-native-ui-reviewer`
- **Reviewer:** `(capstone — no separate reviewer)`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`
- **RED/GREEN Required:** `no`

## Outcome
An adversarial reviewer pass over S-REACTIVE-01/02/03/04 that re-runs every reactive Maestro flow on a named iOS Simulator, audits theme/a11y/testID/ScreenLayout compliance, and produces a review artifact whose per-AC verdicts block sprint closure until every FAIL is resolved.

## Background
This is Sprint 25's capstone review task (UC-SYNC-02; T-SYNC-005/006/007, T-INFER-015). It does NOT implement code and does NOT run a RED→GREEN ceremony (`tdd_mode: skipped`) — it validates the four reactive surfaces' real e2e behavior and compliance, then writes the review artifact that gates closure. The two hardest correctness properties — zero duplicate tokens after reconnect (S-REACTIVE-01) and no spinner hang when the fleet is down (S-REACTIVE-04) — are re-verified by actually running the flows, not by code inspection. Theme-token, accessibility, `testID`, and `ScreenLayout` compliance are audited across the rewired surfaces.

## Specification
- **Objective:** Re-run every reactive Maestro flow, audit theme/a11y/testID compliance, and produce a review artifact citing all four tasks with per-AC PASS/FAIL/WARN verdicts backed by Maestro exit codes + file paths — blocking closure on any FAIL.
- **Success state:** The review artifact exists at `.spec/reviews/sprint-25-review-artifact.md`, cites `S-REACTIVE-01..04` with per-AC verdicts, includes `>=1` file path + Maestro exit code per verdict, and the reconnect flow shows `0` duplicate tokens.

## Critical Constraints
### MUST
- MUST run every flow under `.maestro/reactive/` on a named iOS Simulator after `holo seed:e2e --reset`
- MUST write the review artifact to `.spec/reviews/sprint-25-review-artifact.md` citing all four tasks with per-AC verdicts
- MUST back each verdict with a Maestro exit code + `>=1` file path (evidence-based, not code-inspection-only)
- MUST flag every FAIL as a closure blocker
### NEVER
- NEVER produce verdicts from code inspection alone (real e2e required)
- NEVER omit any of the four tasks from the artifact
- NEVER mark a FAIL as PASS; NEVER close the sprint with an unresolved FAIL
### STRICTLY
- STRICTLY the review re-runs the real flows — the reconnect flow MUST show `0` duplicate tokens
- STRICTLY the artifact cites `S-REACTIVE-01, S-REACTIVE-02, S-REACTIVE-03, S-REACTIVE-04`
- STRICTLY `tdd_mode: skipped` (review task) — it reviews others' real e2e; no RED ceremony

## Capability Chain
- **Touches:** CAP-SYNC-01 (validation only)
- **Provides:** `sprint-25-review-artifact` (closure gate)
- **Consumes:** the implemented S-REACTIVE-01/02/03/04 surfaces + their `.maestro/reactive/*.yml` flows
- **Boundary contracts:** the artifact's FAIL verdicts block sprint closure; WARN findings are documented but non-blocking

## Acceptance Criteria
### AC-1: Review artifact cites all four tasks with evidence-backed per-AC verdicts [PRIMARY]
- **GIVEN:** S-REACTIVE-01/02/03/04 are implemented and their `.maestro/reactive/*.yml` flows exist
- **WHEN:** the reviewer runs every flow on a named iOS Simulator after `holo seed:e2e --reset` and audits theme/a11y/testID compliance
- **THEN:** the review artifact exists, cites all four tasks, and backs each verdict with a Maestro exit code + file path
- **Test tier:** `integration` · **Verification service:** `review artifact inspection + Maestro flow runs` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/*.yml && test -s .spec/reviews/sprint-25-review-artifact.md`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — the artifact is missing/incomplete; stub — verdicts omitted (only PASS, no FAIL/WARN possible); empty — the flows were not run (verdicts not evidence-based); mock — the artifact cites wrong task IDs/ACs; static — the artifact produced without running real e2e
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `reactive-surfaces-implementation`: actor `reviewer`; steps: run all `.maestro/reactive/*.yml` flows, inspect code for theme/a11y/testID compliance, write the artifact citing all four tasks with per-AC verdicts → MUST observe the artifact exists at `.spec/reviews/sprint-25-review-artifact.md`, cites the 4 task IDs `S-REACTIVE-01,02,03,04` (count `4`), each task has per-AC verdicts (`PASS`/`FAIL`/`WARN`), each verdict row includes `>=1` file path + the Maestro exit code; MUST NOT observe the artifact missing/empty (`0` bytes), verdicts missing (`0` PASS/FAIL rows), wrong sprint/task IDs, or a task omitted (count `<4`)

### AC-2: Streaming reconnect re-verified — zero duplicate tokens [PRIMARY]
- **GIVEN:** S-REACTIVE-01 is implemented
- **WHEN:** the reviewer runs the reconnect flow
- **THEN:** the flow passes with `0` duplicate tokens and the artifact cites `T-SYNC-006` PASS
- **Test tier:** `integration` · **Verification service:** `Maestro + review artifact` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `maestro test .maestro/reactive/reconnect-exactly-once.yml && grep -E 'T-SYNC-006.*PASS' .spec/reviews/sprint-25-review-artifact.md`
- **Scenario:** tier `visible` · test_tier `integration` · topology `single-node`
  - **Negative control — would fail if:** disconnect — the flow fails/exits non-zero; stub — duplicated tokens in the logs; empty — the flow not run (code-inspection verdict); static — a `T-SYNC-006` PASS with no real e2e proof
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `reactive-surfaces-implementation`: actor `reviewer`; steps: run the reconnect flow, check exit `0`, grep logs for the duplicate-token count, confirm the artifact cites `T-SYNC-006` PASS → MUST observe Maestro exit `0`, the logs show `0` duplicated tokens, screenshot evidence under `.tmp/` (`>=1` PNG), the artifact cites `T-SYNC-006` verdict `PASS`; MUST NOT observe a non-zero exit, a duplicate count `>0`, the artifact citing `T-SYNC-006` `FAIL`/`WARN`, or a code-inspection-only verdict (`0` real e2e runs)

## Test Criteria
| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | The review artifact exists and cites all four tasks | AC-1 | `grep -c 'S-REACTIVE-0' .spec/reviews/sprint-25-review-artifact.md` → `4` |
| TC-2 | The reconnect flow passes with `0` duplicate tokens | AC-2 | `maestro test .maestro/reactive/reconnect-exactly-once.yml` |
| TC-3 | Type check clean + lint pass | AC-1 | `pnpm tsc --noEmit && pnpm lint` |
| TC-4 | Scenario fakeability | AC-1 | `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-05.json` |

## Reading List
- `.spec/prds/mk6-migration/08-uc-sync.md` — UC-SYNC-02; `11-e2e-testing-criteria.md` — T-SYNC-005/006/007, T-INFER-015
- `S-REACTIVE-01..04` task definitions — the surfaces under review
- `.maestro/reactive/*` — the flows to run
- `RULES.md` — RN conventions (theme tokens, `SafeAreaView`, 44×44 touch targets, `testID`, `ScreenLayout`)
- `app/zero/schema.ts`, `app/zero/queries.ts` — Zero integration patterns

## Guardrails
**Write allowed:**
- `.spec/reviews/sprint-25-review-artifact.md (NEW)` — the review artifact
- `.spec/reviews/sprint-25-review-findings.json (NEW)` — optional structured findings
- `.validate-payloads/S-REACTIVE-05.json (NEW)` — this task's scenario contract
**Write prohibited:**
- `app/*`, `components/*`, `hooks/*` — the review does not modify implementation code (it cites violations; fixes are follow-up tasks)
- `.maestro/*` — flows already exist; do not modify
- Closing the sprint with an unresolved FAIL verdict

## Design
**References:** `./SPRINT.md`; `.spec/prds/mk6-migration/08-uc-sync.md`; `S-REACTIVE-01..04`
**Interaction notes (review checklist):**
- **Behavioral correctness:** streaming — no duplicate tokens after reconnect; reconciliation — exactly one final message matching the Zero row; degraded — no spinner hang, exact `SURFACE_UNAVAILABLE_MESSAGE`; research progress — advances live to `3/5`; cross-surface — MCP doc update reflects within `5s`.
- **Compliance:** theme tokens (no hardcoded colors), accessibility (`SafeAreaView`, 44×44 targets, labels), `testID` coverage, `ScreenLayout` consistency.
- **Artifact:** per-AC PASS/FAIL/WARN per task, each with a Maestro exit code + file path; a FAIL blocks closure, a WARN is documented but non-blocking.
**Pattern:** run real Maestro flows → capture exit codes + screenshots → grep logs for duplicate-token/spinner signals → write evidence-backed verdicts.
**Pattern source:** `.maestro/reactive/*.yml`; the per-task verify commands.
**Anti-pattern:** code-inspection-only verdicts; omitting a task; marking FAIL as PASS; closing with an unresolved FAIL.

## Verification Gates
- **All reactive Maestro flows pass** — `holo seed:e2e --reset && maestro test .maestro/reactive/*.yml` → Exit 0
- **Review artifact cites all 4 tasks** — `grep -c 'S-REACTIVE-0' .spec/reviews/sprint-25-review-artifact.md` → `4`
- **Streaming reconnect — 0 duplicate tokens** — `maestro test .maestro/reactive/reconnect-exactly-once.yml` → Exit 0
- **Type check clean + lint pass** — `pnpm tsc --noEmit && pnpm lint` → Exit 0
- **Scenario fakeability** — `python3 ~/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-REACTIVE-05.json` → Exit 0

## Agent Assignment
- **Agent:** `react-native-ui-reviewer` — adversarial theme/a11y/contract + behavioral re-verification of the reactive surfaces
- **Reviewer:** capstone task — no separate reviewer (the artifact itself is the closure gate)

## Evidence Gates
- RED-against-start (tdd_mode `skipped`): `False` (review task — no RED ceremony)
- Real-services re-verification required: `True` (re-runs the real Maestro flows)
- Fakeability: `validate_scenario.py` exit 0 on every behavioral AC

## Review Criteria
- Every verdict is evidence-backed (Maestro exit code + file path), not code-inspection-only
- The reconnect flow shows `0` duplicate tokens; the degraded flow shows no spinner hang
- Theme tokens / `SafeAreaView` / `testID` / `ScreenLayout` audited across all rewired surfaces
- Closure is blocked while any FAIL verdict is unresolved

## Dependencies
- **Depends on:** S-REACTIVE-01, S-REACTIVE-02, S-REACTIVE-03, S-REACTIVE-04
- **Blocks:** none (it is the closure gate)

## Coding Standards
- `RULES.md` — RN conventions (theme tokens, accessibility, `testID`, `ScreenLayout`)
- `brain/docs/kanban/TASK-TEMPLATE.md`

## Notes
- Generated by /kb-sprint-tasks-plan on 2026-07-24. Proposed by `react-native-ui-planner`; consolidated by the orchestrator (canonical schema; `tdd_mode: skipped` review task; normalized requirements[] TC shape; scenario hardening; stable AC-N/TC-N IDs). `validate_scenario.py` exit 0 on this task's contract.
- PRD refs: UC-SYNC-02; T-SYNC-005, T-SYNC-006, T-SYNC-007, T-INFER-015.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-REACTIVE-05",
  "tdd_mode": "skipped",
  "verification_policy": { "requires_tests": false, "requires_red_evidence": false, "requires_seeded_evidence": false },
  "fixtures": {
    "reactive-surfaces-implementation": {
      "description": "The implemented S-REACTIVE-01/02/03/04 surfaces (resumable SSE client, research progress, cross-surface p95, degraded state) plus their Maestro e2e flows, reviewed by react-native-ui-reviewer",
      "seed_method": "ui_flow",
      "records": [
        "S-REACTIVE-01/02/03/04 are implemented and their .maestro/reactive/*.yml flows exist",
        "holo seed:e2e --reset seeds the Streaming conversation, a research session, and a document",
        "the reviewer runs every .maestro/reactive/*.yml flow on a named iOS Simulator"
      ]
    }
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN S-REACTIVE-01/02/03/04 are implemented and their .maestro/reactive/*.yml flows exist WHEN the reviewer runs every flow on a named iOS Simulator after holo seed:e2e --reset and audits theme/a11y/testID compliance THEN the review artifact exists, cites all four tasks, and backs each verdict with a Maestro exit code + file path","verify":"holo seed:e2e --reset && maestro test .maestro/reactive/*.yml && test -s .spec/reviews/sprint-25-review-artifact.md","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"integration","verification_service":"review artifact inspection + Maestro flow runs","topology":"single-node","negative_control":{"would_fail_if":["disconnect — the review artifact is missing or incomplete","stub — verdicts omitted (only PASS, no FAIL/WARN possible)","empty — the Maestro flows were not run (verdicts not evidence-based)","mock — the artifact cites wrong task IDs or ACs","static — the artifact produced without running real e2e"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reactive-surfaces-implementation","action":{"actor":"reviewer","steps":["run all Maestro flows under .maestro/reactive/","inspect code for theme/a11y/testID compliance","write the review artifact to .spec/reviews/sprint-25-review-artifact.md","cite all 4 tasks and their ACs with verdicts"]},"end_state":{"must_observe":["the review artifact exists at `.spec/reviews/sprint-25-review-artifact.md`","the artifact cites the 4 task IDs `S-REACTIVE-01,02,03,04` (count `4`)","each task has per-AC verdicts (`PASS`/`FAIL`/`WARN`)","each verdict row includes `>=1` file path and the Maestro exit code"],"must_not_observe":["the review artifact missing or empty (`0` bytes)","verdicts missing (a task list with `0` PASS/FAIL rows)","the artifact cites the wrong sprint/task IDs","the artifact omits one or more of the 4 tasks (count `<4`)"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":true,"description":"GIVEN S-REACTIVE-01 is implemented WHEN the reviewer runs the reconnect flow THEN the flow passes with 0 duplicate tokens and the artifact cites T-SYNC-006 PASS","verify":"maestro test .maestro/reactive/reconnect-exactly-once.yml && grep -E 'T-SYNC-006.*PASS' .spec/reviews/sprint-25-review-artifact.md","maps_to_ac":null,"scenario":{"tier":"visible","test_tier":"integration","verification_service":"Maestro + review artifact","topology":"single-node","negative_control":{"would_fail_if":["disconnect — the Maestro streaming flow fails or exits non-zero","stub — duplicated tokens detected in the logs","empty — the flow not run (verdict based on code inspection only)","static — a T-SYNC-006 verdict PASS with no real e2e proof"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reactive-surfaces-implementation","action":{"actor":"reviewer","steps":["run maestro test .maestro/reactive/reconnect-exactly-once.yml","check the exit code is 0","grep the logs for the duplicate-token count","verify the review artifact cites T-SYNC-006 PASS"]},"end_state":{"must_observe":["Maestro exit code `0` (the streaming flow passes)","the logs show `0` duplicated tokens after reconnect","screenshot evidence under `.tmp/` with `>=1` PNG","the review artifact cites `T-SYNC-006` verdict `PASS`"],"must_not_observe":["Maestro exit non-zero (streaming failed)","a duplicate token count `>0` (reconciliation bug)","the review artifact cites `T-SYNC-006` `FAIL` or `WARN`","a verdict based on code inspection only (`0` real e2e runs)"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The review artifact exists and cites all four tasks","verify":"grep -c 'S-REACTIVE-0' .spec/reviews/sprint-25-review-artifact.md","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"The reconnect flow passes with 0 duplicate tokens","verify":"maestro test .maestro/reactive/reconnect-exactly-once.yml","maps_to_ac":"AC-2"}
  ]
}
-->
