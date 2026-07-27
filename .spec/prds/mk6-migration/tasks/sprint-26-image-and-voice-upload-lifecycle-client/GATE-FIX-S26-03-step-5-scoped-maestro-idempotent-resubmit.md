# GATE-FIX-S26-03: Scoped Maestro idempotent re-submit flow (human gate step 5)
> Status: Backlog

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `CONFIG`
- **Status:** `Backlog`
- **Priority:** `P0` · **Effort:** `S` · **Estimate:** `90 minutes`
- **Agent:** `red-test-generator` · **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped` · **RED/GREEN Required:** `no` · **Seeded evidence:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021` · **Touches:** CAP-SYNC-01
- **Gate evidence source:** `gate-results.blocked-20260727T012043Z.json` step 5 (`wiring_gap`) + `GATE-RESULTS.md`

## Outcome

A **distinct** scoped Maestro flow `.maestro/gate/step-5-idempotent.yaml` machine-certifies human-gate step 5: re-submit the identical fixture image after a successful upload so CAS content_hash idempotency keeps **exactly one** `file_objects` row — without reusing `.maestro/upload.yaml` as step-5 evidence.

## Background

QA step 5 is `wiring_gap`: the machine postcondition (rows still == 1) is provable by `verify:blob --last`, but the **re-submit native action** has no distinct driver. Step 7's all-in-one journey uploads once; it cannot certify a second native re-submit step. Product CAS idempotency already exists (`file_objects_content_hash_uidx`); this task only harnesses the human step.

Upstream authorizes `tdd_mode=skipped` for this gate-driver task. Runtime seeded E2E + real Postgres verify is **not** waived.

## Specification

- **Objective:** Author scoped re-submit Maestro flow + wire gate-plan step 5 so the native re-submit is machine-driven, then prove still one row via `holo verify:blob --last`.
- **Success state:** `maestro test .maestro/gate/step-5-idempotent.yaml` exits 0; subsequent (or chained) `holo verify:blob --last` reports `file_objects rows: 1`; gate step 5 no longer `wiring_gap` for missing driver.

## Critical Constraints

### MUST
- MUST create `.maestro/gate/step-5-idempotent.yaml` with distinct path from step-2, step-3, and upload.yaml
- MUST re-attach and re-submit the **identical** fixture (same content hash path as first upload)
- MUST prove postcondition with real Postgres: `bun services/platform/src/cli/holo.ts verify:blob --last` → `file_objects rows: 1`
- MUST wire gate-plan step 5 `literal_cmd` to the scoped maestro flow (and document/chain verify:blob if compound)
- MUST retain `requires_seeded_evidence=true`

### NEVER
- NEVER reuse `.maestro/upload.yaml` as step-5 sole evidence
- NEVER claim idempotency from a second `verify:blob` without a second native re-submit
- NEVER hand-write gate-results / forge step5.log
- NEVER modify Hono upload backend routes or drop the content_hash unique index
- NEVER invent unit RED provenance for this gate-driver CONFIG task

### STRICTLY
- STRICTLY PRIMARY AC is e2e on named simulator + real Hono + real Postgres
- STRICTLY step-5 flow identity ≠ step-2 ≠ step-3 ≠ step-7
- STRICTLY `tdd_mode=skipped` does not waive seeded E2E oracles

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** gate-step-5-scoped-idempotent-resubmit-driver
- **Consumes:** image-upload-lifecycle-client, content-addressed-upload-backend (content_hash uidx)
- **Boundary contracts:** distinct native driver for idempotent re-submit; rows remain 1 after second finalize

## Acceptance Criteria

### AC-1: Scoped idempotent re-submit Maestro flow passes [PRIMARY]
- **GIVEN:** app + Metro + platform live; seed reset; a prior successful fixture upload has created one `file_objects` row (or the flow is self-contained: upload once, then re-submit)
- **WHEN:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-5-idempotent.yaml`
- **THEN:** flow exits 0; second attach+submit of identical fixture completes (upload-success or equivalent success path); screenshot emitted
- **Test tier:** `e2e` · **Flow ref:** `T-DATA-021`
- **Verify:** `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-5-idempotent.yaml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — no second submit; mock — fake success without second finalize; disconnect — Hono down; empty — zero rows after re-submit
  - **Evidence:** screenshot, required_capture=true
  - **Case 1** — start_ref `one_row_after_first_upload`: re-submit identical fixture → MUST observe maestro exit 0 + second submit path completed; MUST NOT observe rows: 2; reuse of upload.yaml as sole step-5 evidence

### AC-2: Postgres postcondition still one row
- **GIVEN:** step-5 native re-submit has run against the real stack
- **WHEN:** `bun services/platform/src/cli/holo.ts verify:blob --last`
- **THEN:** exit 0; log contains `file_objects rows: 1` (not rows: 2+)
- **Test tier:** `e2e` · **Verification service:** `postgres+holo-cli`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --last`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** stub — CLI always prints 1; mock — fixture injected without second upload; empty — rows: 0
  - **Evidence:** stdout, required_capture=true
  - **Case 1** — start_ref `one_row_after_first_upload`: after re-submit MUST observe `file_objects rows: 1`; MUST NOT observe `file_objects rows: 2`

### AC-3: Gate-plan step 5 wired
- **GIVEN:** step-5 flow exists
- **WHEN:** gate-plan step n=5 updated
- **THEN:** non-null literal_cmd references step-5-idempotent; wiring_gap_reason cleared; assertion `exit_and_log_regex`
- **Test tier:** `integration`
- **Verify:** `jq -e '.steps[] | select(.n==5) | select(.literal_cmd != null) | select(.literal_cmd | test("step-5-idempotent"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json`

### AC-4: Distinct flow identity
- **GIVEN:** step-5 YAML and upload.yaml exist
- **WHEN:** paths compared
- **THEN:** step-5 path is `.maestro/gate/step-5-idempotent.yaml` and realpath ≠ upload.yaml, ≠ step-2-attach, ≠ step-3-submit
- **Test tier:** `unit` · **unit_test_justified:** Path uniqueness is static.
- **Verify:** `test -f .maestro/gate/step-5-idempotent.yaml && test "$(realpath .maestro/gate/step-5-idempotent.yaml)" != "$(realpath .maestro/upload.yaml)"`

## Test Criteria

| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | Idempotent re-submit flow exits 0 | `AC-1` | maestro test step-5-idempotent |
| `TC-2` | verify:blob --last reports rows: 1 after re-submit | `AC-2` | holo verify:blob --last |
| `TC-3` | Gate-plan step 5 points at step-5-idempotent | `AC-3` | jq |
| `TC-4` | Path distinct from upload.yaml | `AC-4` | realpath |

## Scope

**writeAllowed:**
- `.maestro/gate/step-5-idempotent.yaml` (NEW)
- gate-plan.json step 5 only (MODIFY)
- Optional shared `.maestro/gate/` boot fragment (NEW) if factored with step-2/3

**writeProhibited:**
- Reusing upload.yaml as step-5 sole evidence
- Product backend upload routes / schema
- Forged gate-results
- S-UPLOAD-* task file rewrites

## Reading List

1. `GATE-RESULTS.md` step 5
2. `gate-results.blocked-20260727T012043Z.json` step 5 failure
3. `.maestro/upload.yaml` — attach+submit pattern to adapt for second pass
4. `services/platform` blob verify CLI (`holo verify:blob --last`)
5. S-UPLOAD-01 notes — content_hash unique index idempotency

## Design

- **Pattern:** Self-contained double attach+submit of the same fixture, OR single re-submit assuming prior step-3/7 row exists (prefer self-contained for isolated gate re-runs)
- **Pattern source:** `.maestro/upload.yaml` + CAP-SYNC-01 content_hash idempotency
- **Anti-pattern:** Only re-running verify:blob without native re-submit; pointing step 5 at upload.yaml; unit RED for harness CONFIG

## Verification Gates

| Gate | Command | Expected |
|------|---------|----------|
| maestro-step-5 | `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-5-idempotent.yaml` | Exit 0 |
| verify-blob-last | `bun services/platform/src/cli/holo.ts verify:blob --last` | Exit 0; `file_objects rows: 1` |
| gate-plan-step-5 | `jq` step 5 literal_cmd | Exit 0 |

## Agent Instructions

1. Author `.maestro/gate/step-5-idempotent.yaml` that re-submits the identical fixture (self-contained double-submit preferred).
2. Wire gate-plan step 5 literal_cmd; clear wiring_gap_reason.
3. Run maestro then `holo verify:blob --last`; prove rows: 1.
4. No forged gate-results. No unit RED ceremony.

## Dependencies

- **Depends on:** S-UPLOAD-01, S-UPLOAD-03; GATE-FIX-S26-02 (submit pattern optional reuse)
- **Blocks:** full 7/7 gate re-certification of step 5

## Notes

- Product idempotency is healthy; harness lacks a distinct re-submit driver.
- `tdd_mode=skipped` justified: gate-driver/configuration. Seeded E2E retained via AC-1 + AC-2.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S26-03",
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
    "one_row_after_first_upload": {
      "description": "After first fixture upload: exactly one file_objects row with fixture SHA-256",
      "seed_method": "public_api",
      "records": ["file_objects rows: 1", "fixture_sha256 match"]
    },
    "seeded_fixture_jpg": {
      "description": "test-fixture.jpg identical content for second submit",
      "seed_method": "migration_fixture",
      "records": ["test-fixture.jpg"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN prior or in-flow first upload WHEN maestro test step-5-idempotent THEN exit 0 and second submit of identical fixture completes",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-5-idempotent.yaml",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - no second submit", "mock - fake success", "disconnect - Hono down", "empty - zero rows"]
        },
        "evidence": { "artifact_type": "screenshot", "required_capture": true },
        "cases": [
          {
            "start_ref": "one_row_after_first_upload",
            "action": {
              "actor": "qa_operator",
              "steps": ["seed e2e if needed", "maestro test .maestro/gate/step-5-idempotent.yaml"]
            },
            "end_state": {
              "must_observe": ["maestro exit 0", "second submit path completed"],
              "must_not_observe": ["file_objects rows: 2 as success", "literal_cmd still null for step 5", "step-5 evidence is only upload.yaml"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "After re-submit, verify:blob --last shows file_objects rows: 1",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["stub - CLI always prints 1", "mock - row injected", "empty - rows: 0"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "one_row_after_first_upload",
            "action": {
              "actor": "qa_operator",
              "steps": ["run step-5 maestro", "holo verify:blob --last"]
            },
            "end_state": {
              "must_observe": ["file_objects rows: 1", "verify exit 0"],
              "must_not_observe": ["file_objects rows: 2", "file_objects rows: 0"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Gate-plan step 5 literal_cmd points at step-5-idempotent",
      "verify": "jq -e '.steps[] | select(.n==5) | select(.literal_cmd != null) | select(.literal_cmd | test(\"step-5-idempotent\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json",
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
            "action": { "actor": "cli_user", "steps": ["jq gate-plan step 5"] },
            "end_state": {
              "must_observe": ["literal_cmd contains step-5-idempotent"],
              "must_not_observe": ["literal_cmd null"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Step-5 path distinct from upload.yaml",
      "verify": "test -f .maestro/gate/step-5-idempotent.yaml && test \"$(realpath .maestro/gate/step-5-idempotent.yaml)\" != \"$(realpath .maestro/upload.yaml)\"",
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
      "description": "Idempotent re-submit flow exits 0",
      "maps_to_ac": "AC-1",
      "verify": "MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-5-idempotent.yaml"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "verify:blob --last reports rows: 1 after re-submit",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Gate-plan step 5 points at step-5-idempotent",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.steps[] | select(.n==5) | select(.literal_cmd | test(\"step-5-idempotent\"))' .spec/prds/mk6-migration/tasks/sprint-26-image-and-voice-upload-lifecycle-client/gate-plan.json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Path distinct from upload.yaml",
      "maps_to_ac": "AC-4",
      "verify": "test \"$(realpath .maestro/gate/step-5-idempotent.yaml)\" != \"$(realpath .maestro/upload.yaml)\""
    }
  ]
}
-->
