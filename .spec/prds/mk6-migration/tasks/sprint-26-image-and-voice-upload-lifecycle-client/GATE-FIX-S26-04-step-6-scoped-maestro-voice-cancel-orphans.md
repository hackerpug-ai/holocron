# GATE-FIX-S26-04: Scoped Maestro voice start+cancel + orphan verify (human gate step 6)
> Status: Backlog

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `CONFIG`
- **Status:** `Backlog`
- **Priority:** `P0` · **Effort:** `S` · **Estimate:** `90 minutes`
- **Agent:** `red-test-generator` · **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped` · **RED/GREEN Required:** `no` · **Seeded evidence:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021` · **Touches:** CAP-SYNC-01
- **Gate evidence source:** `gate-results.blocked-20260727T012043Z.json` step 6 (`wiring_gap`) + `GATE-RESULTS.md`

## Outcome

A **distinct** scoped Maestro flow `.maestro/gate/step-6-voice-cancel.yaml` machine-certifies human-gate step 6: start a voice recording via `voice-mic-button`, wait briefly, cancel/stop, then `holo verify:blob --orphans` reports **zero** orphan rows — proving cancel is orphan-safe (not baseline-only corroboration).

## Background

QA step 6 is `wiring_gap`: **no voice-cancel Maestro flow exists** anywhere under `.maestro/`. `verify:blob --orphans` was run as corroboration only (`orphan rows: 0`) against baseline state — not proof that cancel is orphan-safe, because the cancel action was never machine-driven. Product S-UPLOAD-02 wired voice upload lifecycle so cancelled recording never promotes orphans; this task only adds the missing native gate driver + postcondition chain.

Upstream authorizes `tdd_mode=skipped` for this gate-driver task. Runtime seeded E2E + real Postgres orphan verify is **not** waived.

## Specification

- **Objective:** Author scoped voice start→cancel Maestro flow + wire gate-plan step 6; chain real `holo verify:blob --orphans`.
- **Success state:** `maestro test .maestro/gate/step-6-voice-cancel.yaml` exits 0 (start + cancel/stop driven); `holo verify:blob --orphans` exits 0 with `orphan rows: 0`; gate step 6 no longer `wiring_gap` for missing driver.

## Critical Constraints

### MUST
- MUST create `.maestro/gate/step-6-voice-cancel.yaml` (canonical path for this plan)
- MUST drive start via `testID="voice-mic-button"` then cancel/stop (same control becomes stop when active — accessibilityLabel "Stop voice session"; or overlay dismiss if product uses it for cancel)
- MUST wait 2–3s while recording before cancel so the action is non-degenerate
- MUST chain or follow with `bun services/platform/src/cli/holo.ts verify:blob --orphans` asserting 0 orphans
- MUST wire gate-plan step 6 non-null `literal_cmd` under `exit_and_log_regex`
- MUST retain `requires_seeded_evidence=true`

### NEVER
- NEVER treat baseline `orphan rows: 0` without a machine-driven cancel as step-6 pass
- NEVER call upload-init / finalize as part of the cancel path (cancel must discard buffered audio)
- NEVER hand-write gate-results / forge step6.log
- NEVER reuse `.maestro/upload.yaml` as step-6 evidence
- NEVER invent unit RED provenance for this gate-driver CONFIG task

### STRICTLY
- STRICTLY PRIMARY AC is e2e on named simulator + real platform + real Postgres
- STRICTLY cancel must not promote staged-but-unfinalized rows
- STRICTLY `tdd_mode=skipped` does not waive seeded E2E oracles

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** gate-step-6-scoped-voice-cancel-orphan-driver
- **Consumes:** voice-session-client (S-UPLOAD-02), blob orphan verifier
- **Boundary contracts:** distinct native driver for voice cancel; zero orphans after cancel

## Acceptance Criteria

### AC-1: Scoped voice start+cancel Maestro flow passes [PRIMARY]
- **GIVEN:** RN app on named iOS Simulator with Metro + platform live; seed reset; chat surface with VoiceMicButton available
- **WHEN:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-6-voice-cancel.yaml`
- **THEN:** exit 0; log shows voice-mic-button start + stop/cancel path COMPLETED; screenshot emitted
- **Test tier:** `e2e` · **Flow ref:** `T-DATA-021`
- **Verify:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-6-voice-cancel.yaml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — no mic button; mock — cancel faked without stop; empty — voice never starts; disconnect — Metro/app down
  - **Evidence:** screenshot, required_capture=true
  - **Case 1** — start_ref `cleared_file_objects`: start mic → wait → stop/cancel → MUST observe maestro exit 0 + cancel path; MUST NOT observe upload-success as step-6 terminal; no voice flow at all

### AC-2: Orphan verify after cancel is zero
- **GIVEN:** step-6 native cancel has just run
- **WHEN:** `bun services/platform/src/cli/holo.ts verify:blob --orphans`
- **THEN:** exit 0; log contains `orphan rows: 0` (status OK)
- **Test tier:** `e2e` · **Verification service:** `postgres+holo-cli`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --orphans`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — CLI always 0 without cancel; mock — orphan table ignored; empty — wrong env
  - **Evidence:** stdout, required_capture=true
  - **Case 1** — start_ref `cleared_file_objects`: after machine cancel MUST observe orphan rows: 0; MUST NOT observe orphan rows: 1+; MUST NOT treat pre-cancel baseline alone as proof

### AC-3: Gate-plan step 6 wired
- **GIVEN:** step-6 flow exists
- **WHEN:** gate-plan step n=6 updated
- **THEN:** non-null literal_cmd references step-6-voice-cancel (or documented compound maestro+verify); wiring_gap_reason cleared
- **Test tier:** `integration`
- **Verify:** `jq -e '.steps[] | select(.n==6) | select(.literal_cmd != null) | select(.literal_cmd | test("step-6-voice-cancel|voice-cancel"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json`

### AC-4: Flow asserts voice mic start/stop oracles
- **GIVEN:** step-6 YAML exists
- **WHEN:** static inspect
- **THEN:** contains `voice-mic-button` (start and/or stop path) and does not claim image upload-success as success
- **Test tier:** `unit` · **unit_test_justified:** Static YAML oracle presence.
- **Verify:** `test -f .maestro/gate/step-6-voice-cancel.yaml && rg -n 'voice-mic-button' .maestro/gate/step-6-voice-cancel.yaml && ! rg -n 'upload-success' .maestro/gate/step-6-voice-cancel.yaml`

## Test Criteria

| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | Voice cancel flow exits 0 with start+stop driven | `AC-1` | maestro test step-6-voice-cancel |
| `TC-2` | verify:blob --orphans reports orphan rows: 0 after cancel | `AC-2` | holo verify:blob --orphans |
| `TC-3` | Gate-plan step 6 points at voice-cancel flow | `AC-3` | jq |
| `TC-4` | YAML contains voice-mic-button and not upload-success | `AC-4` | rg |

## Scope

**writeAllowed:**
- `.maestro/gate/step-6-voice-cancel.yaml` (NEW)
- gate-plan.json step 6 only (MODIFY)
- Minimal testID wiring in voice components **only if** a missing stable cancel oracle blocks the flow (prefer existing `voice-mic-button` stop path first)

**writeProhibited:**
- Reusing upload.yaml as step-6 evidence
- Product Hono upload finalize routes (except if required for orphan-safe cancel already shipped)
- Forged gate-results / baseline-only orphan pass without cancel evidence
- S-UPLOAD-* task file rewrites

## Reading List

1. `GATE-RESULTS.md` step 6
2. `gate-results.blocked-20260727T012043Z.json` step 6 failure + corroboration note
3. `components/voice/VoiceMicButton.tsx` — `testID="voice-mic-button"`, start/stop toggle
4. `hooks/use-voice-session.ts` — cancel discards buffered audio, no upload-init
5. `.maestro/chat/cancel-works.yml` — cancel flow pattern reference
6. `components/voice/VoiceSessionOverlay.tsx` — overlay testIDs if needed

## Design

- **Pattern:** Launch chat → tap voice-mic-button (start) → wait 2–3s → tap voice-mic-button again (stop/cancel while active) → screenshot → then CLI orphan verify
- **Pattern source:** VoiceMicButton state map + cancel-works.yml structure
- **Anti-pattern:** Passing step 6 on baseline orphans without native cancel; claiming upload.yaml covers voice; unit RED for harness CONFIG

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| maestro-step-6 | `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-6-voice-cancel.yaml` | Exit 0 |
| verify-orphans | `bun services/platform/src/cli/holo.ts verify:blob --orphans` | Exit 0; `orphan rows: 0` |
| gate-plan-step-6 | `jq` step 6 literal_cmd | Exit 0 |

## Agent Instructions

1. Author `.maestro/gate/step-6-voice-cancel.yaml`: start mic → wait → stop/cancel.
2. Wire gate-plan step 6 literal_cmd (maestro; orphan verify may be sequential second cmd or compound shell); clear wiring_gap_reason.
3. Run maestro then verify:blob --orphans; capture both logs. Baseline-only orphan 0 without cancel is **not** pass.
4. No forged gate-results. No unit RED ceremony.

## Dependencies

- **Depends on:** S-UPLOAD-02, S-UPLOAD-03
- **Blocks:** full 7/7 gate re-certification of step 6

## Notes

- Product cancel is designed orphan-safe; harness never drove it.
- Canonical flow path for this plan: `.maestro/gate/step-6-voice-cancel.yaml` (not root `.maestro/voice-cancel.yml` — keeps gate/ namespace consistent with steps 2/3/5).
- `tdd_mode=skipped` justified: gate-driver/configuration. Seeded E2E retained via AC-1 + AC-2.
- No separate maestro_native skill-install task: step 7 proves `exit_and_log_regex` + `maestro test` is sufficient for certification.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S26-04",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "cleared_file_objects": {
      "description": "file_objects cleared via holo seed:e2e --reset before voice cancel proof",
      "seed_method": "cli",
      "records": ["file_objects rows: 0", "orphan rows: 0 baseline not sufficient alone"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN chat with voice mic WHEN maestro test step-6-voice-cancel THEN exit 0 with start+cancel driven",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-6-voice-cancel.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - no mic button", "mock - cancel faked", "empty - voice never starts", "disconnect - Metro down"]
        },
        "evidence": { "artifact_type": "screenshot", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "qa_operator",
              "steps": ["seed e2e", "maestro test .maestro/gate/step-6-voice-cancel.yaml"]
            },
            "end_state": {
              "must_observe": ["maestro exit 0", "voice-mic-button start path", "voice-mic-button stop or cancel path"],
              "must_not_observe": ["upload-success as step-6 terminal", "literal_cmd still null for step 6", "no voice flow file"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "After machine cancel, verify:blob --orphans shows orphan rows: 0",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - CLI always 0 without cancel", "mock - orphans ignored", "empty - wrong env"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "qa_operator",
              "steps": ["run step-6 maestro cancel", "holo verify:blob --orphans"]
            },
            "end_state": {
              "must_observe": ["orphan rows: 0", "verify exit 0"],
              "must_not_observe": ["orphan rows: 1", "pass based only on pre-cancel baseline"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Gate-plan step 6 literal_cmd points at voice-cancel flow",
      "verify": "jq -e '.steps[] | select(.n==6) | select(.literal_cmd != null) | select(.literal_cmd | test(\"step-6-voice-cancel|voice-cancel\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json",
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
            "action": { "actor": "cli_user", "steps": ["jq gate-plan step 6"] },
            "end_state": {
              "must_observe": ["literal_cmd references voice-cancel flow"],
              "must_not_observe": ["literal_cmd null"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "YAML contains voice-mic-button and not upload-success",
      "verify": "test -f .maestro/gate/step-6-voice-cancel.yaml && rg -n 'voice-mic-button' .maestro/gate/step-6-voice-cancel.yaml && ! rg -n 'upload-success' .maestro/gate/step-6-voice-cancel.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "yaml-structure",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["static - missing mic oracle"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": { "actor": "cli_user", "steps": ["rg step-6 yaml"] },
            "end_state": {
              "must_observe": ["voice-mic-button present"],
              "must_not_observe": ["upload-success terminal"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Voice cancel flow exits 0 with start+stop driven",
      "maps_to_ac": "AC-1",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-6-voice-cancel.yaml"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "verify:blob --orphans reports orphan rows: 0 after cancel",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate-plan step 6 points at voice-cancel flow",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.steps[] | select(.n==6) | select(.literal_cmd | test(\"step-6-voice-cancel|voice-cancel\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "YAML contains voice-mic-button and not upload-success",
      "maps_to_ac": "AC-4",
      "verify": "rg -n 'voice-mic-button' .maestro/gate/step-6-voice-cancel.yaml && ! rg -n 'upload-success' .maestro/gate/step-6-voice-cancel.yaml"
    }
  ]
}
-->
