# S-UPLOAD-03: Maestro upload journey + blob verification helper
> Status: ✅ Completed
> Commit: 895293f64f377f437e724dedf6a113208a6d3f02
> Reviewer: product-manager+react-native-ui-reviewer
> Completed: 2026-07-26T23:17:16Z

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`  ·  **Effort:** `M`  ·  **Estimate:** `150 minutes`
- **Agent:** `red-test-generator`  ·  **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`  ·  **RED/GREEN Required:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021`  ·  **Touches:** CAP-SYNC-01

## Outcome
A Maestro upload.yaml journey drives the real image-upload lifecycle end-to-end (emitting artifacts) and a real Postgres-backed holo verify:blob helper asserts exactly one file_objects row matching the fixture SHA-256 and zero orphans - both fail-closed.

## Background
S-UPLOAD-01/02 build the RN upload clients; this task adds the deterministic verification harness T-DATA-021 needs: (1) a Maestro journey (.maestro/upload.yaml) that drives the improvements-sheet attach -> submit -> success flow on a real simulator, following the existing .maestro/chat/send-streams.yml pattern (appId, extendedWaitUntil, tapOn, assertVisible, takeScreenshot); (2) a platform CLI helper holo verify:blob with --last (exactly one file_objects row, SHA-256 vs the seeded fixture) and --orphans (zero abandoned rows) modes, mirroring the existing orphan-counting pattern in services/platform/src/cli/holo.ts:1014. The helper reads real Postgres - never a mock.

## Specification
- **Objective:** Author the Maestro upload journey and the real Postgres-backed holo verify:blob helper that make T-DATA-021 deterministically machine-checkable.
- **Success state:** maestro test .maestro/upload.yaml exits 0 with screenshot/JUnit/log/video artifacts; holo verify:blob --last prints exactly one file_objects row whose SHA-256 matches the fixture; holo verify:blob --orphans reports zero; both fail-closed (non-zero) on violation.

## Critical Constraints
### MUST
- MUST drive the REAL improvements-sheet upload flow in the Maestro journey (no mocked endpoints)
- MUST implement holo verify:blob --last and --orphans reading REAL Postgres via the platform service
- MUST follow the existing .maestro/chat/send-streams.yml pattern (appId, extendedWaitUntil, tapOn, assertVisible, takeScreenshot) and testID conventions
- MUST fail-closed: verify:blob exits non-zero on count/hash/orphan violation
- MUST emit screenshot + JUnit + log + video artifacts from the Maestro journey
### NEVER
- NEVER mock the upload endpoints or the file_objects query
- NEVER hardcode the SHA-256 or the row count in the helper
- NEVER skip the --orphans mode (critical for T-DATA-021)
- NEVER query the DB directly from a raw SQL string bypassing the platform service
### STRICTLY
- STRICTLY the PRIMARY AC (Maestro journey passes with artifacts) is test_tier: e2e, bound to T-DATA-021
- STRICTLY verify:blob --last asserts count == 1 AND content_hash == fixture SHA-256; verify:blob --orphans asserts count == 0
- STRICTLY both helper modes read real Postgres (createSql) - a stubbed/hardcoded query must fail the real-count assertion

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** upload-e2e-journey, verify-blob-helper
- **Consumes:** image-upload-lifecycle-client, voice-upload-lifecycle-client, content-addressed-upload-backend
- **Boundary contracts:**
  - holo verify:blob --last asserts exactly ONE file_objects row (created_at DESC LIMIT 1), prints its SHA-256, and fails-closed (non-zero) if count != 1 or hash mismatches the seeded fixture
  - holo verify:blob --orphans counts staged-but-unfinalized/abandoned upload rows and asserts ZERO; fails-closed (non-zero) if any orphan exists
  - Both modes read REAL Postgres via the platform service (no mocks); exit 0 = assertion holds, non-zero = fail-closed
  - The Maestro upload.yaml journey drives the real improvements-sheet upload flow end-to-end on a named iOS Simulator and emits screenshot/JUnit/log/video artifacts

## Acceptance Criteria
### AC-1: Maestro upload journey passes with full evidence artifacts [PRIMARY]
- **GIVEN:** the RN app is running on a named iOS Simulator with the upload clients wired (S-UPLOAD-01/02)
- **WHEN:** the developer runs maestro test .maestro/upload.yaml after holo seed:e2e --reset
- **THEN:** the journey completes the improvements-sheet upload flow, exits 0, and emits screenshot/JUnit/log/video artifacts; T-DATA-021 steps 1-5 pass
- **Test tier:** `e2e`  ·  **Verification service:** `maestro`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `maestro test .maestro/upload.yaml`
- **Scenario:** tier `visible`  ·  test_tier `e2e`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - finalize skipped (no hash/length verify); mock - upload endpoints mocked; disconnect - Hono/blob store down; empty - file_objects table empty (nothing promoted)
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `cli_user`; steps: run holo seed:e2e --reset; launch the app on a named iOS Simulator; run maestro test .maestro/upload.yaml -> MUST observe maestro exit code 0; >=1 screenshot artifact emitted (.png); JUnit report tests='1' failures='0'; file_objects rows: 1 per T-DATA-021; MUST NOT observe maestro non-zero exit; 0 screenshot artifacts (empty); upload failure or orphan rows; idempotency violation (rows > 1)

### AC-2: verify:blob --last reports exactly one row with the matching SHA-256
- **GIVEN:** one file_objects row exists from the image upload
- **WHEN:** the operator runs holo verify:blob --last
- **THEN:** the helper reports exactly one file_objects row, prints its SHA-256 matching the fixture, byte count, MIME, and storage path, exits 0
- **Test tier:** `integration`  ·  **Verification service:** `holo-cli+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --last`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - reviewer rubber-stamps without running gates; empty - hardcoded #RRGGBB color present (count > 0); mock - lint/grep skipped
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `cli_user`; steps: complete an image upload via the improvements sheet; run holo verify:blob --last -> MUST observe verify:blob --last exits 0; file_objects rows: 1; printed SHA-256 matches the fixture (64 hex chars); printed byte_size (e.g. 102400 bytes) + mime_type + storage_path (non-empty); MUST NOT observe file_objects rows: 0 (nothing uploaded); file_objects rows > 1 (orphan/duplicate); SHA-256 mismatch; missing storage_path

### AC-3: verify:blob --orphans detects zero orphan rows after a cancel
- **GIVEN:** a voice recording was started then cancelled
- **WHEN:** the operator runs holo verify:blob --orphans
- **THEN:** the helper reports zero orphan rows and exits 0; T-DATA-021 step 6 passes
- **Test tier:** `integration`  ·  **Verification service:** `holo-cli+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --orphans`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - cancel still calls upload-init; empty - cancelled recording leaks a file_objects row; mock - verify:blob --orphans hardcoded to 0
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `user`; steps: start a voice recording; wait 2-3s; tap cancel; run holo verify:blob --orphans -> MUST observe verify:blob --orphans exits 0; orphan rows: 0; file_objects rows: 0 for the cancelled session; MUST NOT observe orphan rows > 0 (a leaked row); file_objects rows > 0 (orphan promoted); exit non-zero on a clean state

### AC-4: The journey follows the existing Maestro pattern
- **GIVEN:** existing Maestro chat flows exist (.maestro/chat/send-streams.yml)
- **WHEN:** the developer creates .maestro/upload.yaml
- **THEN:** the journey uses the same appId/extendedWaitUntil/tapOn/assertVisible/takeScreenshot shape and testID conventions
- **Test tier:** `unit`  ·  **Verification service:** `yaml-structure`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Static YAML structural check against the existing .maestro/chat/send-streams.yml pattern - no runtime I/O.`
- **Verify:** `grep -nE 'appId:|extendedWaitUntil|tapOn|assertVisible|takeScreenshot' .maestro/upload.yaml`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** static - missing required Maestro keys; empty - 0 tapOn/assertVisible steps
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `cli_user`; steps: read .maestro/upload.yaml; compare structure to .maestro/chat/send-streams.yml -> MUST observe appId header present (>=1); tapOn with testID 'attach-button' (>=1); assertVisible on 'upload-success' (>=1); takeScreenshot step present (>=1); MUST NOT observe 0 appId header (empty); 0 takeScreenshot steps (no evidence); a different testID convention

### AC-5: Type check and lint pass
- **GIVEN:** the code changes are complete
- **WHEN:** the developer runs typecheck and lint
- **THEN:** tsgo --noEmit exits 0 and biome check exits 0
- **Test tier:** `unit`  ·  **Verification service:** `typescript+biome`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Static build-tool gate (tsgo/biome) - no runtime I/O; verified by tool exit code.`
- **Verify:** `tsgo --noEmit && biome check .`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** static - type/lint errors present
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `cli_user`; steps: run tsgo --noEmit; run biome check . -> MUST observe tsgo exit code 0; biome exit code 0; MUST NOT observe 0 errors expected; >=1 TypeScript error on failure (non-zero exit); 0 violations expected; >=1 biome violation on failure (non-zero exit)

## Test Criteria
| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | the Maestro upload journey passes and emits full evidence artifacts | `AC-1` | `maestro test .maestro/upload.yaml` |
| `TC-2` | verify:blob --last reports exactly one file_objects row with the matching SHA-256 | `AC-2` | `bun services/platform/src/cli/holo.ts verify:blob --last` |
| `TC-3` | verify:blob --orphans reports zero orphan rows after a cancel | `AC-3` | `bun services/platform/src/cli/holo.ts verify:blob --orphans` |
| `TC-4` | the journey follows the existing Maestro pattern | `AC-4` | `grep -nE 'appId:\|extendedWaitUntil\|tapOn\|assertVisible\|takeScreenshot' .maestro/upload.yaml` |
| `TC-5` | tsgo --noEmit and biome check both exit 0 | `AC-5` | `tsgo --noEmit && biome check .` |

## Scope (file-level write permissions)
**writeAllowed:**
- `.maestro/upload.yaml (NEW)`
- `services/platform/src/cli/holo.ts (MODIFY, add verify:blob --last/--orphans)`
- `services/platform/src/cli/commands/verify-blob.ts (NEW, if extracted)`
**writeProhibited:**
- `modifying the Sprint 14 upload backend (hono-app.ts upload routes, uploads/service.ts)`
- `mocking upload endpoints or file_objects queries`
- `hardcoding the SHA-256 or row count in the helper`
- `skipping the --orphans implementation`

## Reading List
1. `.maestro/chat/send-streams.yml` (PRIMARY PATTERN) — lines 1-47 — existing Maestro flow pattern (appId, extendedWaitUntil, tapOn, assertVisible, takeScreenshot) - PRIMARY PATTERN
2. `services/platform/src/cli/holo.ts` — lines 1010-1020 — existing orphan-counting pattern to mirror for verify:blob
3. `services/platform/src/db/schema/media.ts` — lines 18-36 — file_objects + content_hash unique index for the helper queries
4. `components/improvements/ImprovementSubmitSheet.tsx` — lines 1-60 — the attach/submit affordances + testIDs the journey drives
5. `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — lines 103 — T-DATA-021 authoritative upload lifecycle

## Design
- **References:** SPRINT.md, .spec/prds/mk6-migration/11-e2e-testing-criteria.md
- **Pattern:** Maestro journey + platform CLI helper following existing chat-flow + orphan-count patterns
- **Pattern source:** `.maestro/chat/send-streams.yml + services/platform/src/cli/holo.ts:1014`
- **Anti-pattern:** Do NOT mock upload endpoints; do NOT hardcode the SHA-256/count; do NOT query the DB bypassing the platform service; do NOT skip orphan detection
- **Interaction notes:**
  - upload.yaml follows .maestro/chat/send-streams.yml exactly (appId, extendedWaitUntil, tapOn, assertVisible, takeScreenshot)
  - verify:blob --last: SELECT id, content_hash, created_at FROM file_objects ORDER BY created_at DESC LIMIT 1; assert count == 1; print SHA-256 vs seeded fixture
  - verify:blob --orphans: count staged-but-unfinalized/abandoned upload rows; assert == 0
  - Both modes: real Postgres via createSql, fail-closed non-zero on violation, optional --json for CI

## Verification Gates
| Gate | Command | Expected |
|------|---------|----------|
| `maestro-journey` | `maestro test .maestro/upload.yaml` | Exit 0 with artifacts |
| `verify-blob-last` | `bun services/platform/src/cli/holo.ts verify:blob --last` | Exit 0, one row, matching SHA-256 |
| `verify-blob-orphans` | `bun services/platform/src/cli/holo.ts verify:blob --orphans` | Exit 0, zero orphans |
| `typecheck` | `tsgo --noEmit` | Exit 0 |
| `scenario-validation` | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-UPLOAD-03.json` | Exit 0 (0 CRITICAL/HIGH) |

## Dependencies
- **Depends on:** `S-UPLOAD-01`, `S-UPLOAD-02`
- **Blocks:** `S-UPLOAD-04`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-UPLOAD-03",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded_fixture_jpg": {
      "description": "the seeded test-fixture.jpg with a known SHA-256 content hash (800x600)",
      "seed_method": "migration_fixture",
      "records": [
        "test-fixture.jpg sha256=<64-hex>",
        "dimensions 800x600"
      ]
    },
    "cleared_file_objects": {
      "description": "file_objects cleared via holo seed:e2e --reset (nonprod namespace)",
      "seed_method": "cli",
      "records": [
        "file_objects rows: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the RN app is running on a named iOS Simulator with the upload clients wired (S-UPLOAD-01/02) WHEN the developer runs maestro test .maestro/upload.yaml after holo seed:e2e --reset THEN the journey completes the improvements-sheet upload flow, exits 0, and emits screenshot/JUnit/log/video artifacts; T-DATA-021 steps 1-5 pass",
      "verify": "maestro test .maestro/upload.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - finalize skipped (no hash/length verify)",
            "mock - upload endpoints mocked",
            "disconnect - Hono/blob store down",
            "empty - file_objects table empty (nothing promoted)"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run holo seed:e2e --reset",
                "launch the app on a named iOS Simulator",
                "run maestro test .maestro/upload.yaml"
              ]
            },
            "end_state": {
              "must_observe": [
                "maestro exit code 0",
                ">=1 screenshot artifact emitted (.png)",
                "JUnit report tests='1' failures='0'",
                "file_objects rows: 1 per T-DATA-021"
              ],
              "must_not_observe": [
                "maestro non-zero exit",
                "0 screenshot artifacts (empty)",
                "upload failure or orphan rows",
                "idempotency violation (rows > 1)"
              ]
            }
          }
        ],
        "id": "AC-1"
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN one file_objects row exists from the image upload WHEN the operator runs holo verify:blob --last THEN the helper reports exactly one file_objects row, prints its SHA-256 matching the fixture, byte count, MIME, and storage path, exits 0",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli+postgres",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - reviewer rubber-stamps without running gates",
            "empty - hardcoded #RRGGBB color present (count > 0)",
            "mock - lint/grep skipped"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": {
              "actor": "cli_user",
              "steps": [
                "complete an image upload via the improvements sheet",
                "run holo verify:blob --last"
              ]
            },
            "end_state": {
              "must_observe": [
                "verify:blob --last exits 0",
                "file_objects rows: 1",
                "printed SHA-256 matches the fixture (64 hex chars)",
                "printed byte_size (e.g. 102400 bytes) + mime_type + storage_path (non-empty)"
              ],
              "must_not_observe": [
                "file_objects rows: 0 (nothing uploaded)",
                "file_objects rows > 1 (orphan/duplicate)",
                "SHA-256 mismatch",
                "missing storage_path"
              ]
            }
          }
        ],
        "id": "AC-2"
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a voice recording was started then cancelled WHEN the operator runs holo verify:blob --orphans THEN the helper reports zero orphan rows and exits 0; T-DATA-021 step 6 passes",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli+postgres",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - cancel still calls upload-init",
            "empty - cancelled recording leaks a file_objects row",
            "mock - verify:blob --orphans hardcoded to 0"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "user",
              "steps": [
                "start a voice recording",
                "wait 2-3s",
                "tap cancel",
                "run holo verify:blob --orphans"
              ]
            },
            "end_state": {
              "must_observe": [
                "verify:blob --orphans exits 0",
                "orphan rows: 0",
                "file_objects rows: 0 for the cancelled session"
              ],
              "must_not_observe": [
                "orphan rows > 0 (a leaked row)",
                "file_objects rows > 0 (orphan promoted)",
                "exit non-zero on a clean state"
              ]
            }
          }
        ],
        "id": "AC-3"
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN existing Maestro chat flows exist (.maestro/chat/send-streams.yml) WHEN the developer creates .maestro/upload.yaml THEN the journey uses the same appId/extendedWaitUntil/tapOn/assertVisible/takeScreenshot shape and testID conventions",
      "verify": "grep -nE 'appId:|extendedWaitUntil|tapOn|assertVisible|takeScreenshot' .maestro/upload.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "yaml-structure",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "static - missing required Maestro keys",
            "empty - 0 tapOn/assertVisible steps"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": {
              "actor": "cli_user",
              "steps": [
                "read .maestro/upload.yaml",
                "compare structure to .maestro/chat/send-streams.yml"
              ]
            },
            "end_state": {
              "must_observe": [
                "appId header present (>=1)",
                "tapOn with testID 'attach-button' (>=1)",
                "assertVisible on 'upload-success' (>=1)",
                "takeScreenshot step present (>=1)"
              ],
              "must_not_observe": [
                "0 appId header (empty)",
                "0 takeScreenshot steps (no evidence)",
                "a different testID convention"
              ]
            }
          }
        ],
        "id": "AC-4"
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the code changes are complete WHEN the developer runs typecheck and lint THEN tsgo --noEmit exits 0 and biome check exits 0",
      "verify": "tsgo --noEmit && biome check .",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "typescript+biome",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "static - type/lint errors present"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run tsgo --noEmit",
                "run biome check ."
              ]
            },
            "end_state": {
              "must_observe": [
                "tsgo exit code 0",
                "biome exit code 0"
              ],
              "must_not_observe": [
                "0 errors expected; >=1 TypeScript error on failure (non-zero exit)",
                "0 violations expected; >=1 biome violation on failure (non-zero exit)"
              ]
            }
          }
        ],
        "id": "AC-5"
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "the Maestro upload journey passes and emits full evidence artifacts",
      "verify": "maestro test .maestro/upload.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "verify:blob --last reports exactly one file_objects row with the matching SHA-256",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "verify:blob --orphans reports zero orphan rows after a cancel",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "the journey follows the existing Maestro pattern",
      "verify": "grep -nE 'appId:|extendedWaitUntil|tapOn|assertVisible|takeScreenshot' .maestro/upload.yaml",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "tsgo --noEmit and biome check both exit 0",
      "verify": "tsgo --noEmit && biome check .",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
