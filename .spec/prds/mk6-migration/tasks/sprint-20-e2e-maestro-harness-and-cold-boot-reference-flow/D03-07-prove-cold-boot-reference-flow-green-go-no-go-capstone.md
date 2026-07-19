# D03-07 — Prove the cold-boot reference flow green on the harness (go/no-go capstone)
> Status: ✅ Completed
> Completed: 2026-07-19T09:03:02Z
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Run the full cold-boot reference flow — cold boot, chat message round-trips through the fleet to Postgres, syncs back via Zero — against real infra both locally and via CI, and record a single go/no-go verdict that Sprints 22-26 and 29 gate on.

**Success state:** `scripts/e2e/capstone-verdict.sh` reports `coldboot_gate: green` derived from a real junit.xml with zero failures, a captured reference-chat-reply screenshot, and a non-zero-byte video, reproduced by both a local run and the CI-dispatched ci-e2e.yml run.

## Background

- **Specialist rationale:** Owns the single go/no-go proof that every D03/S-COLDBOOT substrate task composes into a real green cold-boot run, gating Sprints 22-26 and 29.
- **Planning rationale:** This is the sprint's capstone: the "proven-reference-flow gate" per the E2E Harness Constitution. Multiple local `.tmp/maestro-reference-flow-official*` runs already show real SUCCESS artifacts, but the roadmap's own progress note still calls the flow "not yet green" pending a real Expo dev build + CI-dispatched proof — this task reconciles that by deriving the verdict from actual evidence files (never a hardcoded pass) and reproducing it via the real ci-e2e.yml workflow.
- **How to verify (human):** Run the full local sequence (`run-maestro-reference-flow.sh --run` then `capstone-verdict.sh`) and separately dispatch `ci-e2e.yml`; confirm both report `coldboot_gate: green` derived from real artifact files.
- **Scope:** A new verdict-derivation script + regression test. Does not re-implement or modify D03-02/03/04/05/06 substrate — this task only proves and records the composed result.
- **PRD refs:** UC-SYNC-02, 10-e2e-testing

## Critical Constraints

### MUST
- MUST run the full cold-boot flow against real Postgres, real fleet, and a real Zero sync round-trip — never a partial or mocked substitute
- MUST derive the go/no-go verdict from the actual junit.xml/screenshot/video artifacts of a real run, never from a hardcoded pass
- MUST prove the same green result both from a local operator invocation and from the CI-dispatched ci-e2e.yml run

### NEVER
- NEVER record a 'green' verdict when EXPO_DEV_BUILD_PATH, the named simulator, or any real backend dependency was missing during the run
- NEVER re-implement or modify D03-02/03/04/05/06 substrate — this task only proves and records the composed result

### STRICTLY
- STRICTLY the verdict artifact names the real evidence files (junit.xml path, screenshot path, video path) it derived the verdict from, not just a boolean

## Specification

**Objective:** Run the full cold-boot reference flow — cold boot, chat message round-trips through the fleet to Postgres, syncs back via Zero — against real infra both locally and via CI, and record a single go/no-go verdict that Sprints 22-26 and 29 gate on.

**Success state:** scripts/e2e/capstone-verdict.sh reports coldboot_gate: green derived from a real junit.xml with zero failures, a captured reference-chat-reply screenshot, and a non-zero-byte video, reproduced by both a local run and the CI-dispatched ci-e2e.yml run.

## Acceptance Criteria

### AC-1: Full cold-boot reference flow proven green end-to-end [PRIMARY]
**GIVEN:** the full D03/S-COLDBOOT substrate is online (D03-02, D03-03, D03-04, D03-05, S-COLDBOOT-01, S-COLDBOOT-02 all complete)
**WHEN:** the operator runs `scripts/e2e/run-maestro-reference-flow.sh --run` and then `scripts/e2e/capstone-verdict.sh`
**THEN:** junit.xml reports zero failures, a reference-chat-reply screenshot and reference-flow.mov video exist, and the assistant reply is durably present in Postgres and returned by a live zero-cache query; the verdict script records coldboot_gate: green
**VERIFY:** `scripts/e2e/run-maestro-reference-flow.sh --run && scripts/e2e/capstone-verdict.sh && rg -q '"coldboot_gate":"green"' .tmp/maestro-reference-flow/capstone-verdict.json`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-build", "missing-simulator"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_ready",
      "action": { "actor": "operator", "steps": ["Run the Maestro reference flow.", "Run the capstone verdict script.", "Inspect capstone-verdict.json."] },
      "end_state": {
        "must_observe": ["junit.xml failures: 0", "coldboot_gate: green", "`select count(*) from chat_messages where conversation_id=... and role='agent'` returns count >= 1", "zero-cache query for the same conversation returns an agent row with content length > 0"],
        "must_not_observe": ["empty/start signature: `coldboot_gate: red` OR count: 0", "junit.xml failures: >0", "empty/start signature: `assistant reply missing` OR count: 0"]
      }
    }
  ]
}
```

### AC-2: Missing Expo dev build fails closed instead of a false pass
**GIVEN:** EXPO_DEV_BUILD_PATH is unset
**WHEN:** the operator runs the full go/no-go sequence
**THEN:** the harness exits non-zero before invoking maestro, no junit.xml pass artifact is produced, and capstone-verdict.sh refuses to record green
**VERIFY:** `unset EXPO_DEV_BUILD_PATH; scripts/e2e/run-maestro-reference-flow.sh --run; test $? -ne 0; scripts/e2e/capstone-verdict.sh; rg -q '"coldboot_gate":"red"' .tmp/maestro-reference-flow/capstone-verdict.json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** scripts/e2e/run-maestro-reference-flow.sh + capstone-verdict.sh
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + capstone-verdict.sh",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_build_missing",
      "action": { "actor": "operator", "steps": ["Unset EXPO_DEV_BUILD_PATH.", "Run the harness.", "Run the verdict script."] },
      "end_state": { "must_observe": ["harness exitCode: 1", "coldboot_gate: red"], "must_not_observe": ["harness exitCode: 0", "empty/start signature: `coldboot_gate: green` OR count: 0"] }
    }
  ]
}
```

### AC-3: CI-dispatched run reproduces the same green verdict
**GIVEN:** the full substrate is ready and the ci-e2e.yml workflow is available on the self-hosted macOS runner
**WHEN:** an operator dispatches ci-e2e.yml via workflow_dispatch
**THEN:** the run concludes success, uploads the maestro-reference-flow artifact bundle, and capstone-verdict.sh run against the downloaded artifacts records the same coldboot_gate: green
**VERIFY:** `gh workflow run ci-e2e.yml && gh run watch --exit-status && scripts/e2e/capstone-verdict.sh --from-ci-artifact`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** GitHub Actions self-hosted macOS runner (ci-e2e.yml)
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "GitHub Actions self-hosted macOS runner (ci-e2e.yml)",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "file_artifact", "required_capture": true },
  "cases": [
    {
      "start_ref": "coldboot_substrate_ready",
      "action": { "actor": "operator", "steps": ["Dispatch ci-e2e.yml.", "Wait for run conclusion.", "Download artifacts and run the verdict script."] },
      "end_state": { "must_observe": ["workflow conclusion: success", "coldboot_gate: green", "downloaded artifact directory contains junit.xml, reference-chat-reply.png, and reference-flow.mov (3 files, each size > 0)"], "must_not_observe": ["workflow conclusion: failure", "empty/start signature: `artifact bundle missing` OR count: 0"] }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | A full local cold-boot run produces junit.xml with zero failures and coldboot_gate: green | AC-1 | `scripts/e2e/run-maestro-reference-flow.sh --run && scripts/e2e/capstone-verdict.sh && rg -q '"coldboot_gate":"green"' .tmp/maestro-reference-flow/capstone-verdict.json` | happy_path |
| TC-2 | A missing Expo dev build produces coldboot_gate: red, never green | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'TC-2'` | error |
| TC-3 | The CI-dispatched ci-e2e.yml run reproduces the same green verdict from its uploaded artifacts | AC-3 | `gh workflow run ci-e2e.yml && gh run watch --exit-status && scripts/e2e/capstone-verdict.sh --from-ci-artifact` | happy_path |

## Reading List

- `scripts/e2e/run-maestro-reference-flow.sh` (1-161) — the harness whose real output the verdict script consumes
- `.github/workflows/ci-e2e.yml` (1-93) — the CI dispatch + artifact-upload contract this capstone must reproduce
- `.e2e/maestro/reference-flow.yaml` (1-18) — the exact assertions the verdict derives from
- `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/SPRINT.md` (28-50) — the Human Testing Gate this capstone proves
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (32-34) — the proven-reference-flow gate constitution this task closes

## Guardrails

### WRITE-ALLOWED
- scripts/e2e/capstone-verdict.sh (NEW — derives coldboot_gate from real junit.xml/screenshot/video/DB evidence)
- tests/integration/sprint20-capstone-verdict.test.ts (NEW)
- docs/ci/D03-07-capstone-verdict.md (NEW — the recorded go/no-go)

### WRITE-PROHIBITED
- .github/workflows/** — D03-05/D03-06 own; this task only dispatches/observes
- app/**, services/platform/src/db/**, services/platform/src/ci/** — no re-implementation of substrate this task only proves

### Boundaries
- **always:** Derive the verdict from real artifact files, Name every evidence file path in the verdict artifact
- **ask_first:** Any change to D03-02/03/04/05/06 substrate discovered necessary
- **never:** Recording green because CI status was 'success' without independently checking the evidence, Re-implementing substrate owned by other tasks

## Design

- **references:** .github/workflows/ci-e2e.yml, scripts/e2e/run-maestro-reference-flow.sh
- **pattern:** capstone-verdict.sh parses the real junit.xml (failure count), checks the reference-chat-reply screenshot and video file sizes, queries Postgres+zero-cache for the durable assistant reply, and writes capstone-verdict.json naming every evidence file path plus a green/red field — never a bare boolean with no provenance.
- **pattern_source:** scripts/e2e/run-maestro-reference-flow.sh:140-161
- **anti_pattern:** Recording green because the CI job's status was 'success' without independently checking the junit.xml/screenshot/video/DB evidence it produced.

## Agent Assignment

- **implementer:** devops-engineer — owns the composed go/no-go verdict
- **reviewer:** mastra-reviewer — verifies the verdict is evidence-derived, not a hardcoded pass

## Verification Gates

- **AC-1 full green run:** `scripts/e2e/run-maestro-reference-flow.sh --run && scripts/e2e/capstone-verdict.sh && rg -q '"coldboot_gate":"green"' .tmp/maestro-reference-flow/capstone-verdict.json` → Exit 0; verdict green
- **AC-2 fail closed:** `unset EXPO_DEV_BUILD_PATH; scripts/e2e/run-maestro-reference-flow.sh --run; test $? -ne 0` → Non-zero; verdict red
- **AC-3 CI reproduces green:** `gh workflow run ci-e2e.yml && gh run watch --exit-status && scripts/e2e/capstone-verdict.sh --from-ci-artifact` → Workflow success; verdict green
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-02, D03-03, D03-04, D03-05, D03-06, S-COLDBOOT-01, S-COLDBOOT-02
- **blocks:** —

## Notes

This is the sprint's capstone gate — Sprints 24, 25, 26, and 29 all depend on this task's go/no-go verdict per the ROADMAP.md Dependencies section. Existing `.tmp/maestro-reference-flow-official*` local runs already show real SUCCESS artifacts (e.g. official11's junit.xml: iPhone 17, iOS 26.5, 28s, status="SUCCESS"), but this task requires reproducing that result through the actual CI-dispatched workflow, not just ad hoc local runs, before recording the sprint-closing verdict.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-07",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "coldboot_substrate_ready": {
      "description": "All of D03-02, D03-03, D03-04, D03-05, S-COLDBOOT-01, and S-COLDBOOT-02 are complete: online e2e runner+simulator+build, hardened harness, zero-synced reset, e2e workflow, provider swap, and thin chat vertical.",
      "seed_method": "cli",
      "records": [
        "holo ci runner:status --json --lane e2e reports online:true",
        "holo namespace reset --json exits 0",
        "app boots with Zero provider and no EXPO_PUBLIC_CONVEX_URL"
      ]
    },
    "coldboot_build_missing": {
      "description": "EXPO_DEV_BUILD_PATH is deliberately unset to prove the go/no-go path fails closed instead of false-passing.",
      "seed_method": "cli",
      "records": [
        "EXPO_DEV_BUILD_PATH unset"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN full substrate ready WHEN the reference flow and verdict script run THEN junit.xml has zero failures and coldboot_gate is green with real Postgres+Zero evidence.",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && scripts/e2e/capstone-verdict.sh && rg -q '\"coldboot_gate\":\"green\"' .tmp/maestro-reference-flow/capstone-verdict.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "macos-runner+ios-simulator+real-postgres+real-fleet+real-zero-cache",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static",
            "missing-build",
            "missing-simulator"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_substrate_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Run the Maestro reference flow.",
                "Run the capstone verdict script.",
                "Inspect capstone-verdict.json."
              ]
            },
            "end_state": {
              "must_observe": [
                "junit.xml failures: 0",
                "coldboot_gate: green",
                "`select count(*) from chat_messages where conversation_id=... and role='agent'` returns count >= 1",
                "zero-cache query for the same conversation returns an agent row with content length > 0"
              ],
              "must_not_observe": [
                "empty/start signature: `coldboot_gate: red` OR count: 0",
                "junit.xml failures: >0",
                "empty/start signature: `assistant reply missing` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN EXPO_DEV_BUILD_PATH missing WHEN go/no-go sequence runs THEN harness fails closed and verdict is red.",
      "verify": "unset EXPO_DEV_BUILD_PATH; scripts/e2e/run-maestro-reference-flow.sh --run; test $? -ne 0; scripts/e2e/capstone-verdict.sh; rg -q '\"coldboot_gate\":\"red\"' .tmp/maestro-reference-flow/capstone-verdict.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "scripts/e2e/run-maestro-reference-flow.sh + capstone-verdict.sh",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_build_missing",
            "action": {
              "actor": "operator",
              "steps": [
                "Unset EXPO_DEV_BUILD_PATH.",
                "Run the harness.",
                "Run the verdict script."
              ]
            },
            "end_state": {
              "must_observe": [
                "harness exitCode: 1",
                "coldboot_gate: red"
              ],
              "must_not_observe": [
                "harness exitCode: 0",
                "empty/start signature: `coldboot_gate: green` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN ci-e2e.yml is dispatched WHEN the run completes THEN it concludes success and reproduces coldboot_gate: green from its artifacts.",
      "verify": "gh workflow run ci-e2e.yml && gh run watch --exit-status && scripts/e2e/capstone-verdict.sh --from-ci-artifact",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "GitHub Actions self-hosted macOS runner (ci-e2e.yml)",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "coldboot_substrate_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Dispatch ci-e2e.yml.",
                "Wait for run conclusion.",
                "Download artifacts and run the verdict script."
              ]
            },
            "end_state": {
              "must_observe": [
                "workflow conclusion: success",
                "coldboot_gate: green",
                "downloaded artifact directory contains junit.xml, reference-chat-reply.png, and reference-flow.mov (3 files, each size > 0)"
              ],
              "must_not_observe": [
                "workflow conclusion: failure",
                "empty/start signature: `artifact bundle missing` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Full local run produces zero-failure junit.xml and green verdict",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && scripts/e2e/capstone-verdict.sh && rg -q '\"coldboot_gate\":\"green\"' .tmp/maestro-reference-flow/capstone-verdict.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Missing dev build yields red verdict, never green",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-capstone-verdict.test.ts -t 'TC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "CI-dispatched run reproduces the same green verdict",
      "verify": "gh workflow run ci-e2e.yml && gh run watch --exit-status && scripts/e2e/capstone-verdict.sh --from-ci-artifact",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
