# GATE-FIX-S26-01: Scoped Maestro attach+preview flow (human gate step 2)
> Status: Backlog

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `CONFIG`
- **Status:** `Backlog`
- **Priority:** `P0` · **Effort:** `S` · **Estimate:** `90 minutes`
- **Agent:** `red-test-generator` · **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped` · **RED/GREEN Required:** `no` · **Seeded evidence:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021` · **Touches:** CAP-SYNC-01
- **Gate evidence source:** `gate-results.blocked-20260727T012043Z.json` step 2 (`wiring_gap`) + `GATE-RESULTS.md`

## Outcome

A **distinct** scoped Maestro flow `.maestro/gate/step-2-attach.yaml` machine-certifies human-gate step 2 alone: open improvements sheet → attach seeded `test-fixture.jpg` → `attach-preview` visible — without reusing `.maestro/upload.yaml` (owned by step 7).

## Background

Fresh QA (2026-07-27T01:20:43Z) returned **verdict: blocked** with **0 product failures**. Step 2 is a harness wiring gap: attach+preview is functionally proven inside step 7's all-in-one journey, but the skill forbids reusing that flow as evidence for a separate gate step. No `.maestro/gate/step-2-attach.yaml` exists today.

Upstream authorizes `tdd_mode=skipped` for this gate-driver task (no unit RED provenance invention). Runtime seeded E2E proof is **not** waived: PRIMARY AC still requires a real `maestro test` on the named simulator against live Metro/app.

## Specification

- **Objective:** Author a scoped Maestro flow that drives ONLY the attach+preview sub-action and wire gate step 2 to run it as its own `maestro test` literal_cmd under `exit_and_log_regex`.
- **Success state:** `maestro test .maestro/gate/step-2-attach.yaml` exits 0 with `attach-preview` assert COMPLETED in the log; gate-plan step 2 has non-null `literal_cmd` pointing at that flow; re-running the human gate no longer classifies step 2 as `wiring_gap` for missing driver.

## Critical Constraints

### MUST
- MUST create `.maestro/gate/step-2-attach.yaml` as a **distinct** flow (new path, own action identity)
- MUST assert `attach-preview` visible after tapping `attach-button` (real fixture attach in `__DEV__`/e2e)
- MUST wire gate-plan step 2 `literal_cmd` to `maestro test … .maestro/gate/step-2-attach.yaml` with `exit_and_log_regex` and `expect_log_regex` matching attach-preview COMPLETED
- MUST follow existing Maestro patterns (`appId`, `extendedWaitUntil`, `tapOn`, `assertVisible`, `takeScreenshot`)
- MUST retain `requires_seeded_evidence=true` runtime proof (real simulator + Metro)

### NEVER
- NEVER reuse `.maestro/upload.yaml` as the evidence source for step 2 (step 7 owns it)
- NEVER complete submit / claim `upload-success` in this flow (that is step 3)
- NEVER hand-write pass `gate-results.json` / fake Maestro logs
- NEVER modify product upload backend or mark product broken (product is healthy)
- NEVER invent unit RED provenance for this gate-driver CONFIG task

### STRICTLY
- STRICTLY PRIMARY AC is test_tier `e2e` on named iOS Simulator with real Expo Dev Client + Metro
- STRICTLY flow identity for step 2 ≠ step 3 ≠ step 5 ≠ step 7
- STRICTLY `tdd_mode=skipped` does **not** waive seeded E2E oracles

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** gate-step-2-scoped-attach-preview-driver
- **Consumes:** image-upload-lifecycle-client (S-UPLOAD-01), seeded fixture
- **Boundary contracts:** distinct native driver for attach+preview only; gate step 2 machine-certifiable without all-in-one reuse

## Acceptance Criteria

### AC-1: Scoped attach+preview Maestro flow passes [PRIMARY]
- **GIVEN:** RN app on named iOS Simulator with Metro + platform live; `holo seed:e2e --reset` has run
- **WHEN:** operator runs `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml`
- **THEN:** flow exits 0; log shows `attach-button` tapped and `attach-preview` visible COMPLETED; screenshot emitted
- **Test tier:** `e2e` · **Verification service:** `maestro` · **Flow ref:** `T-DATA-021`
- **Verify:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — no attach-preview testID; mock — attach faked without fixture; empty — sheet never opens; disconnect — Metro/app down
  - **Evidence:** artifact `screenshot`, required_capture=true
  - **Case 1** — start_ref `cleared_file_objects`: open improvements → attach fixture → MUST observe attach-preview visible + maestro exit 0; MUST NOT observe upload-success claim; maestro non-zero; reuse of upload.yaml as sole step-2 evidence

### AC-2: Flow is scoped (no submit/success oracle)
- **GIVEN:** the new step-2 YAML exists
- **WHEN:** static inspection of the flow file
- **THEN:** file contains `attach-button` + `attach-preview` oracles and does **not** assert `upload-success` as the terminal success (submit is step 3)
- **Test tier:** `unit` · **unit_test_justified:** Static YAML scope check — no runtime I/O required to prove flow identity.
- **Verify:** `test -f .maestro/gate/step-2-attach.yaml && rg -n 'attach-button|attach-preview' .maestro/gate/step-2-attach.yaml && ! rg -n 'upload-success' .maestro/gate/step-2-attach.yaml`

### AC-3: Gate-plan step 2 wired to the scoped flow
- **GIVEN:** `.maestro/gate/step-2-attach.yaml` exists
- **WHEN:** gate-plan.json step n=2 is updated
- **THEN:** `literal_cmd` is non-null and runs the new flow; `wiring_gap_reason` removed; assertion kind is certifiable (`exit_and_log_regex` with expect_log_regex matching attach-preview COMPLETED)
- **Test tier:** `integration` · **Verification service:** `gate-plan+jq`
- **Verify:** `jq -e '.steps[] | select(.n==2) | select(.literal_cmd != null) | select(.literal_cmd | test("step-2-attach"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json`

### AC-4: Distinct from all-in-one journey path
- **GIVEN:** step-2 flow and upload.yaml both exist
- **WHEN:** paths and action identities are compared
- **THEN:** step-2 path is `.maestro/gate/step-2-attach.yaml` (not `.maestro/upload.yaml`); step 7 still owns upload.yaml
- **Test tier:** `unit` · **unit_test_justified:** Path identity check is static filesystem proof.
- **Verify:** `test -f .maestro/gate/step-2-attach.yaml && test -f .maestro/upload.yaml && test "$(realpath .maestro/gate/step-2-attach.yaml)" != "$(realpath .maestro/upload.yaml)"`

## Test Criteria

| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | Scoped attach flow exits 0 with attach-preview COMPLETED | `AC-1` | maestro test step-2-attach |
| `TC-2` | Flow YAML asserts attach-preview and not upload-success | `AC-2` | rg scope checks |
| `TC-3` | Gate-plan step 2 literal_cmd points at step-2-attach | `AC-3` | jq gate-plan |
| `TC-4` | Step-2 path is distinct from upload.yaml | `AC-4` | realpath inequality |

## Scope

**writeAllowed:**
- `.maestro/gate/step-2-attach.yaml` (NEW)
- `.spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json` (MODIFY step 2 only)
- Minimal shared boot helper under `.maestro/gate/` only if required by step-2 (NEW)

**writeProhibited:**
- `.maestro/upload.yaml` (step 7 evidence — do not repoint step 2 at it)
- Product upload backend / Hono finalize routes
- Hand-written pass gate-results / forged step2.log
- Existing completed S-UPLOAD-* task bodies
- Unrelated `.gate-evidence/` mutation for fake pass

## Reading List

1. `GATE-RESULTS.md` — step 2 wiring_gap + remedy
2. `gate-results.blocked-20260727T012043Z.json` — step 2 failure block
3. `.maestro/upload.yaml` — attach-button / attach-preview pattern to **subset** (not copy wholesale for multi-step evidence)
4. `components/improvements/ImprovementSubmitSheet.tsx` — attach-button
5. `components/improvements/ImprovementPreviewThumbnail.tsx` — attach-preview

## Design

- **Pattern:** Subset of upload.yaml through attach-preview only; openLink `holocron://improvements` + header add + attach-button
- **Pattern source:** `.maestro/upload.yaml` L51–108
- **Anti-pattern:** Pointing step 2 at upload.yaml; asserting upload-success in step-2 flow; inventing unit RED for harness CONFIG

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| maestro-step-2 | `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml` | Exit 0 |
| gate-plan-step-2 | `jq -e '.steps[]\|select(.n==2)\|select(.literal_cmd\|test("step-2-attach"))' …/gate-plan.json` | Exit 0 |
| path-distinct | realpath step-2 ≠ upload.yaml | true |

## Agent Instructions

1. Author `.maestro/gate/step-2-attach.yaml` as attach+preview only (no submit).
2. Wire gate-plan step 2 `literal_cmd` + `exit_and_log_regex` expect_log_regex for attach-preview COMPLETED; clear `wiring_gap_reason`.
3. Run real maestro on named simulator; capture log/screenshot evidence.
4. Do not invent RED unit tests; do not forge gate-results.

## Dependencies

- **Depends on:** S-UPLOAD-01, S-UPLOAD-03 (product + all-in-one patterns exist)
- **Blocks:** GATE-FIX-S26-02 (optional pattern reuse), GATE-FIX-S26-03

## Notes

- Product is healthy; this is harness coverage only.
- `tdd_mode=skipped` justified: gate-driver/configuration scope (scoped Maestro + gate-plan wiring). Seeded E2E retained via AC-1.
- RED baseline for harness: step 2 has no scoped flow (`find .maestro -path '*step-2-attach*'` empty) — that absence is the implement baseline, not a unit RED ceremony.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S26-01",
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
      "description": "assets/e2e/test-fixture.jpg used by attach-button in e2e",
      "seed_method": "migration_fixture",
      "records": ["test-fixture.jpg"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN RN app on simulator WHEN maestro test .maestro/gate/step-2-attach.yaml THEN exit 0 and attach-preview visible COMPLETED",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - no attach-preview", "mock - attach faked", "empty - sheet never opens", "disconnect - Metro down"]
        },
        "evidence": { "artifact_type": "screenshot", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "qa_operator",
              "steps": [
                "run holo seed:e2e --reset",
                "launch app on named iOS Simulator",
                "maestro test .maestro/gate/step-2-attach.yaml"
              ]
            },
            "end_state": {
              "must_observe": ["maestro exit 0", "attach-preview visible COMPLETED", "attach-button TAPPED or COMPLETED"],
              "must_not_observe": ["upload-success as step-2 terminal oracle", "wiring_gap for missing step-2 flow", "reuse of .maestro/upload.yaml as step-2 sole evidence"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Flow YAML asserts attach scope only (no upload-success terminal)",
      "verify": "test -f .maestro/gate/step-2-attach.yaml && rg -n 'attach-button|attach-preview' .maestro/gate/step-2-attach.yaml && ! rg -n 'upload-success' .maestro/gate/step-2-attach.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "yaml-structure",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["static - missing attach oracles", "empty - zero assertVisible"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": { "actor": "cli_user", "steps": ["inspect step-2-attach.yaml"] },
            "end_state": {
              "must_observe": ["attach-button present", "attach-preview present"],
              "must_not_observe": ["upload-success terminal assert"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Gate-plan step 2 literal_cmd points at step-2-attach flow",
      "verify": "jq -e '.steps[] | select(.n==2) | select(.literal_cmd != null) | select(.literal_cmd | test(\"step-2-attach\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub - literal_cmd null", "empty - wiring_gap_reason remains sole plan"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": { "actor": "cli_user", "steps": ["jq gate-plan step 2"] },
            "end_state": {
              "must_observe": ["literal_cmd contains step-2-attach"],
              "must_not_observe": ["literal_cmd null", "literal_cmd is only .maestro/upload.yaml"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Step-2 flow path is distinct from upload.yaml",
      "verify": "test -f .maestro/gate/step-2-attach.yaml && test -f .maestro/upload.yaml && test \"$(realpath .maestro/gate/step-2-attach.yaml)\" != \"$(realpath .maestro/upload.yaml)\"",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "filesystem",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["static - same path reused"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": { "actor": "cli_user", "steps": ["compare realpaths"] },
            "end_state": {
              "must_observe": ["two distinct flow files"],
              "must_not_observe": ["identical realpath for step-2 and upload.yaml"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Scoped attach flow exits 0 with attach-preview COMPLETED",
      "maps_to_ac": "AC-1",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Flow YAML asserts attach-preview and not upload-success",
      "maps_to_ac": "AC-2",
      "verify": "rg -n 'attach-preview' .maestro/gate/step-2-attach.yaml && ! rg -n 'upload-success' .maestro/gate/step-2-attach.yaml"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate-plan step 2 literal_cmd points at step-2-attach",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.steps[] | select(.n==2) | select(.literal_cmd | test(\"step-2-attach\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Step-2 path is distinct from upload.yaml",
      "maps_to_ac": "AC-4",
      "verify": "test \"$(realpath .maestro/gate/step-2-attach.yaml)\" != \"$(realpath .maestro/upload.yaml)\""
    }
  ]
}
-->
