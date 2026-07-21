# REDHAT-FIX-4 — Make standing subscriptions run without manual claims injection and diagnose the flaky gate path (H-2)
> Status: ✅ Completed
> Cycle: 1
> Reviewer: mastra-reviewer
> Completed: 2026-07-21T21:46:16Z
> Sprint: [Sprint 22 — All Agentic Pipelines as Templates/Agents](./SPRINT.md)
> Agent: mastra-implementer
> Estimate: 150 min
> Type: FEATURE
> Priority: P0
> Proposed by: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` **H-2** (HIGH; mastra-reviewer + code-reviewer)

## Outcome

Standing subscriptions runs unattended: `holo mission run subscriptions` does **not** require operator `--claims` / `researchEvidence` injection, still invokes `subworkflow:evidence-research` and publishes a real document row, and Human Test Deliverable step 5 is deterministic (no undiagnosed fail→pass flip on retry).

**Success state:** `bun run services/platform/src/cli/holo.ts mission run subscriptions --topic 'AI agents' --json` **without** `--claims` exits 0 with `ok: true`, non-empty UUID `output.documentId`, `output.subworkflowCalls` containing `evidence-research`, and a matching `documents` row for that run. Two consecutive bare runs with the same operator params both succeed (or both fail for the same structured reason — no silent flake). Gate step 5 evidence CMD has no `--claims` flag. Root cause of the prior fail→pass cycle is recorded in `.tmp/sprint-22/redhat-fix-4-flake-diagnosis.json`.

## Background

- **Finding (H-2):** Subscriptions happy path requires manual `--claims` injection; gate step 5 was flaky (fail→pass on retry).
- **Evidence (source at reviewed SHA `72b8eee`):**
  - `services/platform/src/mission/runtime.ts:1207-1287` — `subworkflow:evidence-research` throws `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED` when `args.researchEvidence` is absent
  - Gate step 5 only passed with `--claims services/platform/tests/fixtures/research/claims-4.json` (see `.gate-evidence/step5.log` CMD line)
  - `gate-results.prev.json` step 5 `result:"fail"` (17:47 cycle) then pass at 17:58 with no code change; `step5-retry.log` exists; fail log overwritten by retry
  - SPRINT.md Human Test Deliverable step 5: *Run a standing subscriptions mission — it invokes the shared research template as a sub-workflow and publishes a document* — **does not** document `--claims`
  - Existing pipes-3 negative control currently **expects** bare subscriptions without `--claims` to fail closed — that contract is superseded by this finding for the **standing** path (fail-closed moves to broken evidence plane / greenwash, not missing operator fixture)
- **Remediation (from red-hat):** Diagnose step-5 fail→pass flake; make standing subscriptions run unattended without manual claims injection. Optional `--claims` remains a valid override for fixture tests.
- **Out of scope:** C-1 full CAP-EMB-01 wire/rescope (REDHAT-FIX-1), C-2 idempotency defaults (REDHAT-FIX-2), H-1 `infer:trace` (REDHAT-FIX-3), H-3 GREEN suite breadth / fleet-down (REDHAT-FIX-5). Do not touch `task/obs-4` or other sprint task files beyond what this fix requires in subscriptions runtime/CLI/tests.
- **PRD refs:** UC-SVC-02; standing-mission publish path (fulcrum seam later Sprint 23); SPRINT.md step 5.

## Critical Constraints

### MUST
- MUST allow bare standing CLI: `mission run subscriptions --topic <T> [--goal <G>] --json` with **no** `--claims` / no `researchEvidence` seed to complete successfully when Postgres+fleet are healthy
- MUST still invoke evidence-research as a **sub-workflow** (`subworkflow:evidence-research` / `subworkflowCalls` includes `evidence-research`) — never replace with a direct research executor chain on the parent run
- MUST publish a real `documents` row with UUID `documentId` and `source_run_id` tied to the parent mission run
- MUST diagnose and permanently fix the gate step 5 fail→pass flake; record root cause in `.tmp/sprint-22/redhat-fix-4-flake-diagnosis.json`
- MUST re-execute gate step 5 **without** `--claims` and rewrite `.gate-evidence/step5.log` CMD accordingly
- MUST update/remove pipes-3 negative control that requires `CLAIMS_REQUIRED` on bare subscriptions so it no longer contradicts this task

### NEVER
- NEVER leave `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED` as the default outcome for a healthy bare standing run
- NEVER invent always-admissible grade/entailment evidence bundles solely to greenwash empty retrieve (no silent canned success that bypasses the evidence plane)
- NEVER implement C-1 / C-2 / H-1 / H-3 product work in this task’s commit set beyond the minimum subscriptions path change needed for unattended standing runs
- NEVER touch `task/obs-4` or other non-WRITE-ALLOWED product surfaces

### STRICTLY
- STRICTLY bare standing success: exit 0, `ok: true`, `documentId` UUID, `subworkflowCalls` contains `evidence-research`, `SELECT count(*) FROM documents WHERE source_run_id = <runId>` ≥ 1
- STRICTLY two consecutive bare runs (unique idempotency keys or post-FIX-2 defaults) both exit 0 with the success shape above — deterministic, not flake-on-retry
- STRICTLY optional `--claims <path>` still works as an override when provided (fixture path for tests)
- STRICTLY step5 evidence CMD must **not** contain `--claims` after this fix
- STRICTLY integration proof uses real Postgres (`PLATFORM_IT=1`); no mock of `runMissionTemplate` / document publish SQL

## Specification

**Objective:** Close red-hat H-2 by making standing subscriptions unattended (no manual `--claims`) and making gate step 5 deterministic.

**Success state:** Operators can schedule/run `holo mission run subscriptions --topic …` without fixture injection; sub-workflow + document publish hold; gate step 5 passes as documented without undiagnosed retry flips.

## Capability Chain

- **Touches:** N/A (Sprint 22 Capability Coverage is N/A; standing publish is a fulcrum seam owned in Sprint 23)
- **Provides:** standing-subscriptions-unattended-contract
- **Consumes:** evidence-research sub-workflow + mission document publish path
- **Boundary contracts:**
  - CLI bare subscriptions → subworkflow:evidence-research without operator claims
  - Human gate step 5 → executed argv matches documented standing path (no `--claims`)

## Acceptance Criteria

### AC-1: Bare standing subscriptions without `--claims` publishes document [PRIMARY]
**GIVEN:** Real Postgres nonprod with the `subscriptions` and `evidence-research` mission templates registered AND fleet healthy for the plan/probe stages AND no requirement that the operator pass `--claims`
**WHEN:** Operator runs  
`bun run services/platform/src/cli/holo.ts mission run subscriptions --topic 'AI agents' --json`  
**without** `--claims` and **without** injecting `researchEvidence` via any other flag
**THEN:** Exit code is 0; JSON has `ok: true`; `output.documentId` matches UUID regex; `output.subworkflowCalls` is an array containing a string that includes `evidence-research`; `output.researchRunId` is a non-empty UUID (or equivalent child run id); `SELECT count(*)::int FROM documents WHERE source_run_id = <parent runId>` is ≥ 1; error code is **not** `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli+fleet
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli+fleet",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "CLAIMS_REQUIRED throw",
      "disconnect",
      "canned always-admissible greenwash"
    ]
  },
  "evidence": {
    "artifact_type": "api_response",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "subscriptions_templates_registered_healthy",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Ensure subscriptions + evidence-research templates registered in Postgres",
          "Run holo mission run subscriptions --topic 'AI agents' --json WITHOUT --claims",
          "Parse JSON; assert documentId, subworkflowCalls, documents row"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code equals 0",
          "ok equals \"true\"",
          "documentId matches UUID regex (length >= 36)",
          "subworkflowCalls array includes literal \"evidence-research\"",
          "documents count for source_run_id equals parent runId is >= 1"
        ],
        "must_not_observe": [
          "empty/start signature: MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED",
          "exit code non-zero solely because --claims omitted",
          "documentId empty or missing",
          "subworkflowCalls empty or missing evidence-research"
        ]
      }
    }
  ]
}
```

### AC-2: Gate step 5 path is deterministic (no fail→pass flake)
**GIVEN:** AC-1 green (bare subscriptions works) AND real Postgres+fleet healthy
**WHEN:** Operator runs the **same** bare standing command twice in succession (100–2000ms apart), each with a unique idempotency key **or** post-FIX-2 default identity that does not collide mid-test:
1. `… mission run subscriptions --topic 'AI agents' --idempotency-key h2-det-a --json`
2. `… mission run subscriptions --topic 'AI agents' --idempotency-key h2-det-b --json`
**THEN:** Both exits are 0; both payloads have `ok: true` and non-empty `documentId`; neither run returns `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED`; outcomes do **not** differ solely by retry (no first-fail/second-pass without code/env change). Artifact `.tmp/sprint-22/redhat-fix-4-determinism.json` records `{"runA":{"exit":0,"ok":true,"documentId":"…"},"runB":{"exit":0,"ok":true,"documentId":"…"},"flake":false}`
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli+fleet
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli+fleet",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "undiagnosed flake",
      "CLAIMS_REQUIRED"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "subscriptions_templates_registered_healthy",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Run bare subscriptions with --idempotency-key h2-det-a --json",
          "Run bare subscriptions with --idempotency-key h2-det-b --json",
          "Write redhat-fix-4-determinism.json with both outcomes"
        ]
      },
      "end_state": {
        "must_observe": [
          "runA.exit equals 0",
          "runB.exit equals 0",
          "runA.ok equals \"true\"",
          "runB.ok equals \"true\"",
          "redhat-fix-4-determinism.json flake equals false"
        ],
        "must_not_observe": [
          "empty/start signature: runA fail and runB pass with no code change",
          "MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED on either run",
          "flake equals true"
        ]
      }
    }
  ]
}
```

### AC-3: Optional `--claims` override still works
**GIVEN:** Real Postgres; fixture file `services/platform/tests/fixtures/research/claims-4.json` exists
**WHEN:** Operator runs  
`… mission run subscriptions --topic 'AI agents' --claims services/platform/tests/fixtures/research/claims-4.json --json`
**THEN:** Exit 0; `ok: true`; non-empty UUID `documentId`; `subworkflowCalls` includes `evidence-research` (override path does not break standing publish)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** postgres+cli
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "postgres+cli",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "override ignored"
    ]
  },
  "evidence": {
    "artifact_type": "api_response",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "claims_4_fixture_present",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Run subscriptions with --claims claims-4.json and --topic 'AI agents' --json",
          "Assert success shape same as bare path"
        ]
      },
      "end_state": {
        "must_observe": [
          "exit code equals 0",
          "ok equals \"true\"",
          "documentId matches UUID regex (length >= 36)",
          "subworkflowCalls array includes literal \"evidence-research\""
        ],
        "must_not_observe": [
          "empty/start signature: exit non-zero with claims fixture present",
          "documentId missing",
          "subworkflowCalls missing evidence-research"
        ]
      }
    }
  ]
}
```

### AC-4: Flake diagnosis + gate step 5 evidence without `--claims`
**GIVEN:** AC-1 green AND working tree after the fix
**WHEN:** Implementer (1) writes `.tmp/sprint-22/redhat-fix-4-flake-diagnosis.json` with fields `{"rootCause":"<string>","priorFailExit":1,"priorPassWithClaims":true,"fix":"<string>","verifiedDeterministic":true}` documenting why step 5 failed then passed on retry with claims, and (2) re-runs Human Test Deliverable step 5 **without** `--claims`:  
`bun run services/platform/src/cli/holo.ts mission run subscriptions --topic 'AI agents' --json`  
writing CMD + stdout to  
`.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/step5.log`
**THEN:** Diagnosis file has non-empty `rootCause` and `fix` and `verifiedDeterministic: true`; step5.log `CMD:` line contains `mission run subscriptions` and does **not** contain `--claims`; log body shows `ok: true` and a `documentId` UUID
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-4'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** cli+gate-evidence
**FLOW_REF:** UC-SVC-02
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** null

#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "cli+gate-evidence",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "stub",
      "empty",
      "static",
      "mock",
      "undiagnosed flake",
      "claims still required in gate CMD"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "gate_step5_standing_subscriptions",
      "action": {
        "actor": "cli_user",
        "steps": [
          "Write redhat-fix-4-flake-diagnosis.json with rootCause + fix + verifiedDeterministic",
          "Run bare mission run subscriptions --topic 'AI agents' --json as step 5",
          "Write CMD + stdout to .gate-evidence/step5.log"
        ]
      },
      "end_state": {
        "must_observe": [
          "redhat-fix-4-flake-diagnosis.json rootCause length >= 8",
          "redhat-fix-4-flake-diagnosis.json verifiedDeterministic equals true",
          "step5.log CMD contains mission run subscriptions",
          "step5.log body contains documentId UUID",
          "step5.log body contains ok true"
        ],
        "must_not_observe": [
          "empty/start signature: step5.log CMD contains --claims",
          "rootCause empty",
          "verifiedDeterministic equals false",
          "MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED in step5.log"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Bare subscriptions without `--claims` exits 0 with `ok: true` | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'` | happy_path |
| TC-2 | Bare subscriptions publishes UUID `documentId` and invokes evidence-research sub-workflow | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'` | happy_path |
| TC-3 | Bare subscriptions inserts ≥1 documents row for parent `source_run_id` | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'` | happy_path |
| TC-4 | Two consecutive bare runs both succeed with no fail→pass flake | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-2'` | happy_path |
| TC-5 | Optional `--claims` override still completes with document publish | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-3'` | happy_path |
| TC-6 | Flake diagnosis artifact present and step5.log CMD has no `--claims` | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-4'` | happy_path |

## Reading List

| Path | Lines / focus |
|---|---|
| `.spec/reviews/red-hat-sprint-22-20260721T183000Z.md` | H-2 (L46–47), recommendations (L71) |
| `SPRINT.md` | Human Test Deliverable step 5 (L32); Tasks row REDHAT-FIX-4 |
| `services/platform/src/mission/runtime.ts` | `subworkflow:evidence-research` (~1207–1287) — CLAIMS_REQUIRED throw; child `runMissionTemplate` |
| `services/platform/src/cli/holo.ts` | `mission run subscriptions` (~4066–4107) — `--claims` load path |
| `services/platform/src/mission/templates/subscriptions.ts` | stage graph; subworkflow ref |
| `services/platform/tests/integration/pipeline-templates.test.ts` | AC-4 subscriptions with claims; negative control without claims (~384–417) — **update under this task** |
| `.gate-evidence/step5.log` / `step5-retry.log` | prior pass-with-claims + retry evidence |
| `gate-results.prev.json` | step 5 fail on first cycle |

## Guardrails

### WRITE-ALLOWED
- `services/platform/src/mission/runtime.ts` (MODIFY — remove/replace default `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED` for healthy standing path; still fail-closed on broken evidence plane)
- `services/platform/src/cli/holo.ts` (MODIFY — help text / comments that claim bare subscriptions always needs `--claims`; do **not** change default idempotency formulas here unless required for AC-2 isolation keys)
- `services/platform/src/mission/templates/subscriptions.ts` (MODIFY only if template description / stage notes must reflect unattended standing path)
- Optional: `services/platform/src/mission/templates/pipeline-components.ts` or a small NEW helper under `services/platform/src/mission/` if standing path needs an honest default evidence provider **without** inventing always-admissible greenwash
- `services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts` (NEW)
- `services/platform/tests/integration/pipeline-templates.test.ts` (MODIFY — flip/remove “without --claims fails closed” negative control; keep fail-closed against canned greenwash if still relevant)
- `.spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/.gate-evidence/step5.log` (MODIFY — rewrite bare CMD)
- `.tmp/sprint-22/redhat-fix-4-flake-diagnosis.json` (NEW)
- `.tmp/sprint-22/redhat-fix-4-determinism.json` (NEW)

### WRITE-PROHIBITED
- CAP-EMB-01 full wire/rescope docs beyond subscriptions standing path — C-1 (REDHAT-FIX-1)
- Default CLI idempotency `Date.now()` formulas for all six surfaces — C-2 (REDHAT-FIX-2)
- `infer:trace` implementation — H-1 (REDHAT-FIX-3)
- Fleet-down / broad GREEN suite — H-3 (REDHAT-FIX-5)
- Other REDHAT-FIX-* / pipes-* task markdown files (except SPRINT.md footnote list update by planner)
- `task/obs-4` and any obs-* task surfaces
- Mocking document publish or sub-workflow to fake success without Postgres

### Boundaries
- **always:** Prefer reusing evidence-research sub-workflow; optional `--claims` remains override; diagnose flake in writing
- **ask_first:** Depending on REDHAT-FIX-1 PATH-A retrieve as the sole bare-path mechanism (coordinate if both land in parallel); changing SPRINT.md step 5 wording
- **never:** Require operator fixture for standing happy path; leave undiagnosed flake; greenwash empty retrieve with always-admissible canned grades

## Design

- **references:** red-hat H-2; SPRINT step 5; runtime `subworkflow:evidence-research`; pipes-3 AC-4
- **pattern:**  
  ```ts
  // subworkflow:evidence-research — standing path
  const evidence = args.researchEvidence;
  if (evidence) {
    // explicit override (fixture / operator)
  } else {
    // standing unattended: obtain evidence via the same retrieve path
    // as evidence-research (PATH-A hybrid search if available) OR an
    // honest standing-digest provider — NEVER throw CLAIMS_REQUIRED by default
  }
  const child = await runMissionTemplate({ templateKey: EVIDENCE_RESEARCH_TEMPLATE_KEY, …, researchEvidence: resolved });
  ```
- **pattern_source:** `runtime.ts` subworkflow block; pipes-3 publish path; FIX-1 PATH-A retrieve if already landed
- **anti_pattern:** Leaving CLAIMS_REQUIRED as default; gate step 5 “pass” only with `--claims`; undiagnosed fail→pass retry; inventing always-admissible evidence to hide empty retrieve

## Agent Assignment

- **implementer:** `mastra-implementer` — owns mission runtime subscriptions sub-workflow + CLI standing path
- **reviewer:** `mastra-reviewer` — adversarial check that bare standing works, flake is fixed, and greenwash is not the “fix”
- **proposed_by:** `mastra-planner` — expands SPRINT Tasks table row REDHAT-FIX-4 from H-2 only (user-authorized `/kb-sprint-tasks-plan --only REDHAT-FIX-4` with direct write / no nested specialist fan-out; product code not implemented in this planning pass)

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| AC-1 bare standing | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'` | Exit 0 |
| AC-2 determinism | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-2'` | Exit 0 |
| AC-3 claims override | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-3'` | Exit 0 |
| AC-4 gate + diagnosis | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-4'` | Exit 0 |
| Full FIX-4 suite | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts` | Exit 0 |
| Source: no default CLAIMS_REQUIRED | `rg -n "MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED" services/platform/src/mission/runtime.ts` | Not on unguarded bare standing path (may remain for other fail-closed cases only if documented) |
| Typecheck | `pnpm typecheck` | Exit 0 |
| Scenario contract | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py` on this task’s REQUIREMENT-CONTRACT JSON | Exit 0; zero CRITICAL |
| Scope | `git diff --name-only` | Only WRITE-ALLOWED paths |

## Coding Standards

- `brain/docs/TDD-METHODOLOGY.md`
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md`
- `brain/docs/REQUIREMENT-TRACKING.md`
- `brain/docs/ANTI-STUB-REVIEW.md`
- `brain/docs/HUMAN-TESTING-GATE-FIELD-GUIDE.md` (gate-provability: executed-as-documented)

## Dependencies

- **depends_on:** pipes-1, pipes-2, pipes-3, pipes-4, pipes-5 (completed sprint body; subscriptions template + sub-workflow must exist)
- **soft_depends_on:** REDHAT-FIX-1 PATH-A if bare standing evidence is supplied solely by real retrieve (implementer may ship an honest standing-path alternative without waiting on full CAP-EMB rescope)
- **blocks:** Honest re-attestation of Human Testing Gate step 5; closes H-2 before Sprint 23 builds fulcrum on standing subscriptions

## Agent Instructions

1. **RED first:** Write `redhat-fix-4-subscriptions-no-claims.test.ts` AC-1 against current HEAD — expect **fail** (`MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED` or non-zero exit without `--claims`). Capture RED output under `.tmp/sprint-22/` or `.spec/reviews/sprint-22/`.
2. **Diagnose flake:** Read `gate-results.prev.json` step 5 fail, `step5-retry.log`, current `step5.log` (claims-required path). Write `redhat-fix-4-flake-diagnosis.json` with concrete root cause (e.g. bare CLI missing claims vs env flake) **before** claiming GREEN.
3. **GREEN:** Change `subworkflow:evidence-research` so bare standing does not throw CLAIMS_REQUIRED by default; resolve evidence via override-if-present else standing/retrieve path; keep sub-workflow + document publish. Update pipes-3 negative control that currently requires bare fail.
4. **Gate step 5:** Re-run bare subscriptions; rewrite `.gate-evidence/step5.log` CMD without `--claims`; write determinism artifact.
5. **REFACTOR:** Optional extract `resolveStandingResearchEvidence(args)` helper; keep integration tests on real Postgres.
6. Do not implement C-1/C-2/H-1/H-3 in this task. Do not touch `task/obs-4`.

## Review Criteria

- Every AC/TC stable; behavioral ACs carry scenarios that pass `validate_scenario`
- Bare standing subscriptions succeeds without `--claims` with real document publish + sub-workflow
- Two-run determinism proven; flake root cause written
- Gate step 5 evidence CMD has no `--claims`
- Optional `--claims` override still works
- Writes only under WRITE-ALLOWED; no C-1/C-2/H-1/H-3/obs-4 scope creep
- H-2 closed

## Notes

- Repro from red-hat: bare subscriptions → `MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED`; gate only green with `--claims …/claims-4.json`; step 5 fail→pass on retry undiagnosed.
- pipes-3 negative control *“subscriptions without --claims fails closed”* was correct under the old fail-closed product rule and is **intentionally superseded** for standing unattended path; replace with a greenwash/empty-evidence negative control if still needed.
- Full multi-step human-gate re-attestation for other steps may wait on other REDHAT-FIX-*; **this task owns step 5 honesty** (bare standing + deterministic evidence).
- Soft coordination with REDHAT-FIX-1: if PATH-A retrieve is live, bare subscriptions can pass `researchEvidence` through empty and let child retrieve work; if PATH-B, standing path needs an explicit honest provider — do not silently greenwash.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-4",
  "proposed_by": "mastra-planner",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "subscriptions_templates_registered_healthy": {
      "description": "Postgres holocron_nonprod with subscriptions and evidence-research mission templates registered; fleet healthy enough for plan/probe; operator will run bare standing subscriptions without --claims.",
      "seed_method": "cli",
      "records": [
        "mission_template_versions contains template_key=subscriptions",
        "mission_template_versions contains template_key=evidence-research",
        "fleet probe endpoint reachable for standing plan stage"
      ]
    },
    "claims_4_fixture_present": {
      "description": "Fixture file services/platform/tests/fixtures/research/claims-4.json exists for optional --claims override path.",
      "seed_method": "public_api",
      "records": [
        "services/platform/tests/fixtures/research/claims-4.json readable JSON with claims and evidence arrays"
      ]
    },
    "gate_step5_standing_subscriptions": {
      "description": "Post-fix environment ready to re-run gate step 5 as bare standing subscriptions and write diagnosis + step5 evidence artifacts.",
      "seed_method": "cli",
      "records": [
        "bare subscriptions AC-1 path is green",
        "target evidence path .gate-evidence/step5.log",
        "target diagnosis path .tmp/sprint-22/redhat-fix-4-flake-diagnosis.json"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN subscriptions+evidence-research templates registered and fleet healthy WHEN holo mission run subscriptions --topic 'AI agents' --json WITHOUT --claims THEN exit 0, ok true, documentId UUID, subworkflowCalls array includes literal \"evidence-research\", documents row for parent source_run_id >= 1, not MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "CLAIMS_REQUIRED throw",
            "disconnect",
            "canned always-admissible greenwash"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "subscriptions_templates_registered_healthy",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure subscriptions + evidence-research templates registered in Postgres",
                "Run holo mission run subscriptions --topic 'AI agents' --json WITHOUT --claims",
                "Parse JSON; assert documentId, subworkflowCalls, documents row"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code equals 0",
                "ok equals \"true\"",
                "documentId matches UUID regex (length >= 36)",
                "subworkflowCalls array includes literal \"evidence-research\"",
                "documents count for source_run_id equals parent runId is >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED",
                "exit code non-zero solely because --claims omitted",
                "documentId empty or missing",
                "subworkflowCalls empty or missing evidence-research"
              ]
            }
          }
        ],
        "primary": true
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN bare standing works WHEN two consecutive bare subscriptions runs with distinct idempotency keys THEN both exit 0 with ok true and documentId; redhat-fix-4-determinism.json records flake false",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli+fleet",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "undiagnosed flake",
            "CLAIMS_REQUIRED"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "subscriptions_templates_registered_healthy",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run bare subscriptions with --idempotency-key h2-det-a --json",
                "Run bare subscriptions with --idempotency-key h2-det-b --json",
                "Write redhat-fix-4-determinism.json with both outcomes"
              ]
            },
            "end_state": {
              "must_observe": [
                "runA.exit equals 0",
                "runB.exit equals 0",
                "runA.ok equals \"true\"",
                "runB.ok equals \"true\"",
                "redhat-fix-4-determinism.json flake equals false"
              ],
              "must_not_observe": [
                "empty/start signature: runA fail and runB pass with no code change",
                "MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED on either run",
                "flake equals true"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN claims-4.json fixture WHEN subscriptions runs with --claims THEN exit 0, ok true, documentId UUID, subworkflowCalls array includes literal \"evidence-research\"",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres+cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "override ignored"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "claims_4_fixture_present",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run subscriptions with --claims claims-4.json and --topic 'AI agents' --json",
                "Assert success shape same as bare path"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code equals 0",
                "ok equals \"true\"",
                "documentId matches UUID regex (length >= 36)",
                "subworkflowCalls array includes literal \"evidence-research\""
              ],
              "must_not_observe": [
                "empty/start signature: exit non-zero with claims fixture present",
                "documentId missing",
                "subworkflowCalls missing evidence-research"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN AC-1 green WHEN flake diagnosis is written and gate step 5 is re-run bare THEN diagnosis has rootCause+verifiedDeterministic true and step5.log CMD has no --claims and body shows ok true documentId",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli+gate-evidence",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "empty",
            "static",
            "mock",
            "undiagnosed flake",
            "claims still required in gate CMD"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_step5_standing_subscriptions",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Write redhat-fix-4-flake-diagnosis.json with rootCause + fix + verifiedDeterministic",
                "Run bare mission run subscriptions --topic 'AI agents' --json as step 5",
                "Write CMD + stdout to .gate-evidence/step5.log"
              ]
            },
            "end_state": {
              "must_observe": [
                "redhat-fix-4-flake-diagnosis.json rootCause length >= 8",
                "redhat-fix-4-flake-diagnosis.json verifiedDeterministic equals true",
                "step5.log CMD contains mission run subscriptions",
                "step5.log body contains documentId UUID",
                "step5.log body contains ok true"
              ],
              "must_not_observe": [
                "empty/start signature: step5.log CMD contains --claims",
                "rootCause empty",
                "verifiedDeterministic equals false",
                "MISSION_SUBSCRIPTIONS_CLAIMS_REQUIRED in step5.log"
              ]
            }
          }
        ],
        "primary": false
      },
      "unit_test_justified": null
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Bare subscriptions without --claims exits 0 with ok true",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Bare subscriptions publishes UUID documentId and invokes evidence-research sub-workflow",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Bare subscriptions inserts >=1 documents row for parent source_run_id",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Two consecutive bare runs both succeed with no fail-to-pass flake",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Optional --claims override still completes with document publish",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Flake diagnosis artifact present and step5.log CMD has no --claims",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/redhat-fix-4-subscriptions-no-claims.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    }
  ]
}

-->
