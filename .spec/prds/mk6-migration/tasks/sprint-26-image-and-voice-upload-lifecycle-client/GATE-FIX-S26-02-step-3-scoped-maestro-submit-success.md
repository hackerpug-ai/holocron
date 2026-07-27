# GATE-FIX-S26-02: Scoped Maestro submit→success flow (human gate step 3)
> Status: ✅ Completed
> Cycle: 2
> Commit: 536ddcf5b421710163e058ef5abc371000f30095
> Reviewer: product-manager+react-native-ui-reviewer
> Completed: 2026-07-27T03:26:41Z

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `CONFIG`
- **Status:** `Backlog`
- **Priority:** `P0` · **Effort:** `S` · **Estimate:** `90 minutes`
- **Agent:** `red-test-generator` · **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped` · **RED/GREEN Required:** `no` · **Seeded evidence:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021` · **Touches:** CAP-SYNC-01
- **Gate evidence source:** `gate-results.blocked-20260727T012043Z.json` step 3 (`wiring_gap`) + `GATE-RESULTS.md`

## Outcome

A **distinct** scoped Maestro flow `.maestro/gate/step-3-submit.yaml` machine-certifies human-gate step 3: improvements attach → submit → real CAS finalize surfaces `upload-success` — without reusing `.maestro/upload.yaml` as step-3 evidence.

## Background

QA step 3 is `wiring_gap`: submit/success is exercised inside step 7's all-in-one journey only. Skill rule: one all-in-one flow must not certify multiple decomposed gate steps. Product upload lifecycle is healthy (step 7 already proves finalize).

Upstream authorizes `tdd_mode=skipped` for this gate-driver task. Runtime seeded E2E proof is **not** waived.

## Specification

- **Objective:** Author scoped submit→success Maestro flow + wire gate-plan step 3 `literal_cmd` under `exit_and_log_regex`.
- **Success state:** `maestro test .maestro/gate/step-3-submit.yaml` exits 0 with `upload-success` visible COMPLETED; gate step 3 no longer `wiring_gap` for missing driver.

## Critical Constraints

### MUST
- MUST create `.maestro/gate/step-3-submit.yaml` with distinct path/action identity from step-2 and upload.yaml
- MUST drive real init→PUT→finalize via sheet submit and assert `upload-success` (64-hex CAS path — never text-only ack)
- MUST wire gate-plan step 3 `literal_cmd` to this flow under certifiable assertion kind `exit_and_log_regex`
- MUST retain `requires_seeded_evidence=true` (real Hono + blob + simulator)

### NEVER
- NEVER point step 3 at `.maestro/upload.yaml` as its sole evidence
- NEVER assert success without `upload-success` testID (anti-stub)
- NEVER hand-write gate-results pass artifacts
- NEVER modify Hono upload backend routes
- NEVER invent unit RED provenance for this gate-driver CONFIG task

### STRICTLY
- STRICTLY PRIMARY AC is e2e against real Hono + blob + simulator
- STRICTLY `upload-success` requires completed finalize (product already enforces 64-hex hash)
- STRICTLY `tdd_mode=skipped` does not waive seeded E2E

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** gate-step-3-scoped-submit-success-driver
- **Consumes:** image-upload-lifecycle-client, content-addressed-upload-backend
- **Boundary contracts:** distinct native driver for submit→success; machine-certifiable step 3

## Acceptance Criteria

### AC-1: Scoped submit→success Maestro flow passes [PRIMARY]
- **GIVEN:** app + Metro + platform live after seed
- **WHEN:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-3-submit.yaml`
- **THEN:** exit 0; log shows submit and `upload-success` visible COMPLETED
- **Test tier:** `e2e` · **Flow ref:** `T-DATA-021`
- **Verify:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-3-submit.yaml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — finalize skipped; mock — endpoints mocked; disconnect — Hono/blob down; empty — no file_objects promote
  - **Evidence:** screenshot, required_capture=true
  - **Case 1** — start_ref `cleared_file_objects`: attach+submit fixture → MUST observe upload-success COMPLETED + exit 0; MUST NOT observe text-only success without CAS; reuse of upload.yaml as step-3 sole evidence

### AC-2: Flow asserts upload-success (real finalize oracle)
- **GIVEN:** step-3 YAML exists
- **WHEN:** static inspect
- **THEN:** contains assertVisible/extendedWaitUntil on `upload-success` and a submit control tap
- **Test tier:** `unit` · **unit_test_justified:** Static oracle presence check.
- **Verify:** `rg -nE 'upload-success|submit' .maestro/gate/step-3-submit.yaml`

### AC-3: Gate-plan step 3 wired
- **GIVEN:** step-3 flow exists
- **WHEN:** gate-plan step n=3 updated
- **THEN:** non-null literal_cmd references step-3-submit; wiring_gap_reason cleared
- **Test tier:** `integration`
- **Verify:** `jq -e '.steps[] | select(.n==3) | select(.literal_cmd != null) | select(.literal_cmd | test("step-3-submit"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json`

### AC-4: Distinct flow identity from step-2 and upload.yaml
- **GIVEN:** three flow files
- **WHEN:** paths compared
- **THEN:** step-3 path unique vs step-2-attach and upload.yaml
- **Test tier:** `unit` · **unit_test_justified:** Path uniqueness is static.
- **Verify:** `test -f .maestro/gate/step-3-submit.yaml && test "$(realpath .maestro/gate/step-3-submit.yaml)" != "$(realpath .maestro/upload.yaml)"`

## Test Criteria

| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | Submit flow exits 0 with upload-success COMPLETED | `AC-1` | maestro test step-3-submit |
| `TC-2` | YAML contains upload-success + submit | `AC-2` | rg |
| `TC-3` | Gate-plan step 3 points at step-3-submit | `AC-3` | jq |
| `TC-4` | Path distinct from upload.yaml | `AC-4` | realpath |

## Scope

**writeAllowed:**
- `.maestro/gate/step-3-submit.yaml` (NEW)
- gate-plan.json step 3 only (MODIFY)
- Optional shared `.maestro/gate/` boot fragment (NEW) if factored with step-2

**writeProhibited:**
- Reusing upload.yaml as step-3 evidence
- Product backend upload routes
- Forged gate-results
- S-UPLOAD-* task file rewrites

## Reading List

1. `GATE-RESULTS.md` step 3
2. `gate-results.blocked-20260727T012043Z.json` step 3 failure
3. `.maestro/upload.yaml` L110–145 submit + upload-success
4. `components/improvements/ImageUploadStatus.tsx` — upload-success anti-stub

## Design

- **Pattern:** Attach precondition + description input + footer submit + wait upload-success
- **Pattern source:** `.maestro/upload.yaml` L94–145
- **Anti-pattern:** Optional-only success asserts; text-only submit ack as success; unit RED ceremony for harness CONFIG

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| maestro-step-3 | `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-3-submit.yaml` | Exit 0 |
| gate-plan-step-3 | `jq` step 3 literal_cmd | Exit 0 |

## Agent Instructions

1. Author `.maestro/gate/step-3-submit.yaml` driving attach+submit→upload-success.
2. Wire gate-plan step 3 literal_cmd + expect_log_regex for upload-success COMPLETED; clear wiring_gap_reason.
3. Run real maestro; capture evidence. No forged gate-results. No unit RED ceremony.

## Dependencies

- **Depends on:** S-UPLOAD-01, S-UPLOAD-03; GATE-FIX-S26-01 optional for shared boot fragment
- **Blocks:** GATE-FIX-S26-03 (idempotent builds on submit patterns)

## Notes

- Product finalize already green via step 7. This task only adds a **distinct** step-3 driver.
- `tdd_mode=skipped` justified: gate-driver/configuration. Seeded E2E retained via AC-1.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S26-02",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "cleared_file_objects": {
      "description": "file_objects cleared via holo seed:e2e --reset",
      "seed_method": "cli",
      "records": ["file_objects rows: 0"]
    },
    "seeded_fixture_jpg": {
      "description": "test-fixture.jpg for attach+submit",
      "seed_method": "migration_fixture",
      "records": ["test-fixture.jpg"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN app live WHEN maestro test step-3-submit THEN exit 0 and upload-success COMPLETED",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-3-submit.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - finalize skipped", "mock - endpoints mocked", "disconnect - Hono down", "empty - nothing promoted"]
        },
        "evidence": { "artifact_type": "screenshot", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "qa_operator",
              "steps": ["seed e2e", "maestro test .maestro/gate/step-3-submit.yaml"]
            },
            "end_state": {
              "must_observe": ["maestro exit 0", "upload-success visible COMPLETED"],
              "must_not_observe": ["text-only success without CAS", "literal_cmd still null for step 3", "step-3 evidence is only upload.yaml"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "YAML asserts upload-success and submit",
      "verify": "rg -nE 'upload-success|submit' .maestro/gate/step-3-submit.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "yaml-structure",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["static - missing upload-success"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": { "actor": "cli_user", "steps": ["rg step-3 yaml"] },
            "end_state": {
              "must_observe": ["upload-success present", "submit control present"],
              "must_not_observe": ["empty flow file"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Gate-plan step 3 literal_cmd points at step-3-submit",
      "verify": "jq -e '.steps[] | select(.n==3) | select(.literal_cmd != null) | select(.literal_cmd | test(\"step-3-submit\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub - literal_cmd null"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": { "actor": "cli_user", "steps": ["jq gate-plan step 3"] },
            "end_state": {
              "must_observe": ["literal_cmd contains step-3-submit"],
              "must_not_observe": ["literal_cmd null"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Step-3 path distinct from upload.yaml",
      "verify": "test -f .maestro/gate/step-3-submit.yaml && test \"$(realpath .maestro/gate/step-3-submit.yaml)\" != \"$(realpath .maestro/upload.yaml)\"",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["static - same path"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": { "actor": "cli_user", "steps": ["compare realpaths"] },
            "end_state": {
              "must_observe": ["distinct paths"],
              "must_not_observe": ["identical realpath"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Submit flow exits 0 with upload-success COMPLETED",
      "maps_to_ac": "AC-1",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-3-submit.yaml"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "YAML contains upload-success + submit",
      "maps_to_ac": "AC-2",
      "verify": "rg -nE 'upload-success|submit' .maestro/gate/step-3-submit.yaml"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate-plan step 3 points at step-3-submit",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.steps[] | select(.n==3) | select(.literal_cmd | test(\"step-3-submit\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Path distinct from upload.yaml",
      "maps_to_ac": "AC-4",
      "verify": "test \"$(realpath .maestro/gate/step-3-submit.yaml)\" != \"$(realpath .maestro/upload.yaml)\""
    }
  ]
}
-->
