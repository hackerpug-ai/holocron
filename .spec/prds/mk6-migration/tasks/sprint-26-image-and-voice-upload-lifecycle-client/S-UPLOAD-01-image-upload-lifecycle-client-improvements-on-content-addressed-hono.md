# S-UPLOAD-01: Image upload lifecycle client (improvements) on content-addressed Hono
> Status: ✅ Completed
> Commit: 895293f64f377f437e724dedf6a113208a6d3f02
> Reviewer: product-manager+react-native-ui-reviewer
> Completed: 2026-07-26T23:17:16Z

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`  ·  **Effort:** `M`  ·  **Estimate:** `180 minutes`
- **Agent:** `react-native-ui-implementer`  ·  **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`  ·  **RED/GREEN Required:** `yes`
- **Flow ref (PRIMARY):** `T-DATA-021`  ·  **Touches:** CAP-SYNC-01

## Outcome
Attaching the seeded test-fixture.jpg in the improvements sheet drives the real Hono content-addressed upload lifecycle (init -> PUT -> finalize) and produces exactly one file_objects row whose SHA-256 matches the fixture, Zero-synced to the client, idempotent on re-attach, with no orphan on failure.

## Background
Sprint 14 built the backend content-addressed upload store (file_objects replaces Convex _storage): POST /api/uploads / PUT /api/uploads/:id / POST /api/uploads/:id/finalize (services/platform/src/http/hono-app.ts:258-290 -> finalizeUploadIntent in services/platform/src/uploads/service.ts:439), the shared CAS upsert (services/platform/src/blob/file-objects.ts) keyed by content_hash (uniqueIndex file_objects_content_hash_uidx in services/platform/src/db/schema/media.ts), and file_objects is a zero_pub member (services/platform/src/db/schema/zero-pub.ts:189). Sprint 24 rewrote the app off Convex onto Zero/Hono and left the improvements attach surface (components/improvements/ImprovementSubmitSheet.tsx) to be wired to that lifecycle. This task implements ONLY the client: ONE state machine on the existing improvements sheet (idle/preview/uploading/success/error) that drives the authoritative Hono commands. It creates no new screens and does not touch the backend routes.

## Specification
- **Objective:** Implement the image upload lifecycle client in the improvements sheet using the authoritative Hono upload protocol with content-addressed (SHA-256) verification.
- **Success state:** User attaches the seeded test-fixture.jpg; preview shows the fixture dimensions; submit drives upload-init -> PUT -> finalize; the backend verifies SHA-256; exactly one file_objects row is created with content_hash matching the fixture and is Zero-synced to the client; re-attaching the same image is idempotent (no new row).

## Critical Constraints
### MUST
- MUST reuse the existing improvements sheet components/improvements/ImprovementSubmitSheet.tsx; NO new screen files
- MUST implement ONE state machine (idle/preview/uploading/success/error) on that sheet - transitions are state mutations, never navigation pushes
- MUST honor the real upload protocol: POST /api/uploads (idempotency key + declared sha256) -> PUT stream -> POST finalize with SHA-256+length verification
- MUST seed via the real entrypoint holo seed:e2e --reset and observe concrete file_objects row counts - never view-injection or direct DB writes
- MUST preserve react-native-paper components and semantic theme tokens; include testID on the attach affordance
### NEVER
- NEVER create a new screen file (e.g. ImageUploadScreen.tsx)
- NEVER add a convex/react import (useQuery/useMutation/useAction)
- NEVER hardcode theme colors/spacing/typography
- NEVER mock the Hono upload endpoints or the file_objects table
- NEVER bypass SHA-256 content addressing (no optimistic 'success' before finalize completes)
### STRICTLY
- STRICTLY every behavioral AC is proven via real seeded Postgres + Hono + blob store (PLATFORM_IT=1) or Maestro e2e - never a mocked store
- STRICTLY the PRIMARY AC (upload attaches idempotently, hash-verified) is test_tier: integration, tier: visible, bound to T-DATA-021
- STRICTLY content addressing makes re-upload idempotent - same SHA-256 = same file_objects row (content_hash unique index)
- STRICTLY the success state MUST reflect a completed finalize, not a pre-emptive optimistic 'done' (anti-stub)

## Capability Chain
- **Touches:** CAP-SYNC-01
- **Provides:** image-upload-lifecycle-client
- **Consumes:** content-addressed-upload-backend, zero-synced-file-objects
- **Boundary contracts:**
  - POST /api/uploads (idempotency key + declared sha256/byteLength/mime) -> PUT /api/uploads/:id (stream) -> POST /api/uploads/:id/finalize (verify hash+length, promote, attach)
  - Identical SHA-256 -> exactly one file_objects row via the content_hash unique index (file_objects_content_hash_uidx); finalize replay is a no-op returning the same object id
  - file_objects is zero_pub: the finalized attachment reconciles reactively to the client without an extra round-trip
  - An abandoned/unfinalized upload must NOT promote a file_objects row (orphan-safe)

## Acceptance Criteria
### AC-1: Image upload attaches idempotently with SHA-256 verification [PRIMARY]
- **GIVEN:** file_objects has zero rows after holo seed:e2e --reset
- **WHEN:** the user attaches the seeded test-fixture.jpg and submits the improvements report
- **THEN:** upload-init returns an uploadId, PUT streams bytes, finalize verifies SHA-256+length and creates exactly one file_objects row whose content_hash matches the fixture, Zero-synced to the client
- **Test tier:** `integration`  ·  **Verification service:** `hono+blob+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/lifecycle.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - finalize skipped (no hash/length verify); mock - upload endpoints mocked; disconnect - Hono/blob store down; empty - file_objects table empty (nothing promoted)
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `user`; steps: open the improvements sheet; attach the seeded test-fixture.jpg; submit the report; wait for upload-init -> PUT -> finalize -> MUST observe file_objects rows: 1; content_hash == test-fixture.jpg SHA-256 (64 hex chars); 1 Zero-synced file_objects row visible in the client useQuery; upload state transitions to 'success'; MUST NOT observe file_objects rows: 0 (nothing promoted); file_objects rows > 1 (duplicate); content_hash mismatch; state stuck at 'uploading'

### AC-2: Re-attaching the identical image is idempotent (no new row)
- **GIVEN:** one file_objects row with content_hash H exists for test-fixture.jpg
- **WHEN:** the user re-attaches the same test-fixture.jpg and submits again
- **THEN:** finalize dedupes via the content_hash unique index; exactly one file_objects row remains with content_hash H
- **Test tier:** `integration`  ·  **Verification service:** `hono+blob+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/idempotency.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - dedup skipped (always inserts new row); empty - test passing from file_objects rows: 0 (dedup unproven against empty table); mock - content_hash index not enforced
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `user`; steps: open the improvements sheet; re-attach the identical test-fixture.jpg (same bytes); submit the report; wait for finalize -> MUST observe file_objects rows: 1; content_hash still matches the fixture hash (64 hex chars); finalize returns the existing fileObjectId (same id; file_objects rows: 1); MUST NOT observe file_objects rows: 0 (start signature, dedup unproven against empty table); file_objects rows: 2 (duplicate); a new file_objects row created

### AC-3: Upload error surfaces a visible rejection with NO orphan row
- **GIVEN:** an upload is in progress
- **WHEN:** the network drops mid-PUT or finalize fails with a hash mismatch
- **THEN:** the sheet shows an error state with a retry affordance and file_objects has zero orphan rows
- **Test tier:** `integration`  ·  **Verification service:** `hono+blob+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/error-handling.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - error swallowed (sheet stays 'uploading'); empty - orphan file_objects row promoted on failure; mock - network failure not simulated
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `api_client`; steps: init an upload for test-fixture.jpg; start the PUT stream; simulate a mid-stream network failure; observe the sheet -> MUST observe sheet shows an 'upload error' state with a retry affordance (1 retry control); file_objects rows: 0 (no orphan); MUST NOT observe file_objects rows > 0 (orphan promoted); sheet stuck at 'uploading'; error swallowed silently

### AC-4: Preview thumbnail shows the fixture dimensions, not the empty attach prompt
- **GIVEN:** the user attaches test-fixture.jpg in the improvements sheet
- **WHEN:** the image attachment completes
- **THEN:** the preview thumbnail renders the fixture's real dimensions
- **Test tier:** `unit`  ·  **Verification service:** `react-native-rendering`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Pure component render of the preview from a picked file URI - no runtime I/O; dimensions asserted on the mounted Image node.`
- **Verify:** `pnpm vitest run tests/components/improvements/preview-thumbnail.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - preview hardcoded to a placeholder; empty - empty attach prompt shown after attach; static - Image not mounted
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `user`; steps: attach test-fixture.jpg; observe the preview thumbnail -> MUST observe preview renders test-fixture.jpg at 800x600 (fixture dimensions); preview file URI is non-empty (length > 0); Image node testID 'attach-preview' mounted (1 node); MUST NOT observe empty attach prompt placeholder shown; preview URI empty (length 0); 0 Image nodes mounted

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
| `TC-1` | upload-init -> PUT -> finalize creates exactly one file_objects row with a content_hash matching the fixture SHA-256 | `AC-1` | `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/lifecycle.test.ts` |
| `TC-2` | re-uploading the identical image is idempotent via the content_hash unique constraint | `AC-2` | `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/idempotency.test.ts` |
| `TC-3` | an upload error surfaces a visible rejection with zero orphan file_objects rows | `AC-3` | `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/error-handling.test.ts` |
| `TC-4` | the preview thumbnail renders the fixture image at its real dimensions | `AC-4` | `pnpm vitest run tests/components/improvements/preview-thumbnail.test.ts` |
| `TC-5` | tsgo --noEmit and biome check both exit 0 | `AC-5` | `tsgo --noEmit && biome check .` |

## Scope (file-level write permissions)
**writeAllowed:**
- `components/improvements/ImprovementSubmitSheet.tsx (MODIFY)`
- `hooks/use-image-upload.ts (NEW)`
- `components/improvements/ImprovementPreviewThumbnail.tsx (NEW, if needed)`
- `app/zero/queries.ts (MODIFY, file_objects query only)`
**writeProhibited:**
- `any new screen file (e.g. ImageUploadScreen.tsx)`
- `any convex/react import`
- `services/platform/src/http/hono-app.ts upload routes (Sprint 14 backend - do not modify)`
- `services/platform/src/uploads/service.ts (backend)`
- `direct DB writes / view-injected seed`

## Reading List
1. `components/improvements/ImprovementSubmitSheet.tsx` (PRIMARY PATTERN) — lines 1-60 — existing improvements sheet + attach entry (PRIMARY PATTERN for the state machine)
2. `services/platform/src/http/hono-app.ts` — lines 258-290 — POST /api/uploads, PUT /api/uploads/:id, POST /api/uploads/:id/finalize routes
3. `services/platform/src/blob/file-objects.ts` — lines 1-101 — shared CAS upsert keyed by content_hash (idempotency)
4. `app/zero/platform.ts` — lines 113-157 — existing upload helper functions to call
5. `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — lines 103 — T-DATA-021 authoritative upload lifecycle

## Design
- **References:** SPRINT.md, .spec/prds/mk6-migration/08-uc-sync.md
- **Pattern:** initUpload -> putUpload (binary) -> finalizeUpload with SHA-256 verification via app/zero/platform.ts
- **Pattern source:** `app/zero/platform.ts:113-157`
- **Anti-pattern:** Do NOT bypass SHA-256 content addressing; do NOT create orphan rows on failure; do NOT mock the upload protocol; do NOT write file_objects directly from the client
- **Interaction notes:**
  - ONE state machine on the improvements sheet: idle -> preview -> uploading -> (success|error); transitions are state mutations, never nav pushes
  - Preview thumbnail renders the real fixture dimensions when attached (Image.getSize); success MUST reflect a completed finalize, never a pre-emptive optimistic 'done' (anti-stub)
  - Idempotency: identical SHA-256 -> one file_objects row via the content_hash unique index; finalize replay returns the same object id
  - Zero reconciliation: file_objects is zero_pub, so the finalized attachment appears reactively on the client

## Verification Gates
| Gate | Command | Expected |
|------|---------|----------|
| `typecheck` | `tsgo --noEmit` | Exit 0 |
| `lint` | `biome check .` | Exit 0 |
| `unit-tests` | `vitest run` | Exit 0 |
| `integration-tests` | `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/` | Exit 0 |
| `scenario-validation` | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-UPLOAD-01.json` | Exit 0 (0 CRITICAL/HIGH) |

## Dependencies
- **Depends on:** —
- **Blocks:** `S-UPLOAD-03`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-UPLOAD-01",
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
      "description": "GIVEN file_objects has zero rows after holo seed:e2e --reset WHEN the user attaches the seeded test-fixture.jpg and submits the improvements report THEN upload-init returns an uploadId, PUT streams bytes, finalize verifies SHA-256+length and creates exactly one file_objects row whose content_hash matches the fixture, Zero-synced to the client",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/lifecycle.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+blob+postgres",
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
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "user",
              "steps": [
                "open the improvements sheet",
                "attach the seeded test-fixture.jpg",
                "submit the report",
                "wait for upload-init -> PUT -> finalize"
              ]
            },
            "end_state": {
              "must_observe": [
                "file_objects rows: 1",
                "content_hash == test-fixture.jpg SHA-256 (64 hex chars)",
                "1 Zero-synced file_objects row visible in the client useQuery",
                "upload state transitions to 'success'"
              ],
              "must_not_observe": [
                "file_objects rows: 0 (nothing promoted)",
                "file_objects rows > 1 (duplicate)",
                "content_hash mismatch",
                "state stuck at 'uploading'"
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
      "description": "GIVEN one file_objects row with content_hash H exists for test-fixture.jpg WHEN the user re-attaches the same test-fixture.jpg and submits again THEN finalize dedupes via the content_hash unique index; exactly one file_objects row remains with content_hash H",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/idempotency.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+blob+postgres",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - dedup skipped (always inserts new row)",
            "empty - test passing from file_objects rows: 0 (dedup unproven against empty table)",
            "mock - content_hash index not enforced"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": {
              "actor": "user",
              "steps": [
                "open the improvements sheet",
                "re-attach the identical test-fixture.jpg (same bytes)",
                "submit the report",
                "wait for finalize"
              ]
            },
            "end_state": {
              "must_observe": [
                "file_objects rows: 1",
                "content_hash still matches the fixture hash (64 hex chars)",
                "finalize returns the existing fileObjectId (same id; file_objects rows: 1)"
              ],
              "must_not_observe": [
                "file_objects rows: 0 (start signature, dedup unproven against empty table)",
                "file_objects rows: 2 (duplicate)",
                "a new file_objects row created"
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
      "description": "GIVEN an upload is in progress WHEN the network drops mid-PUT or finalize fails with a hash mismatch THEN the sheet shows an error state with a retry affordance and file_objects has zero orphan rows",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/error-handling.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+blob+postgres",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - error swallowed (sheet stays 'uploading')",
            "empty - orphan file_objects row promoted on failure",
            "mock - network failure not simulated"
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
              "actor": "api_client",
              "steps": [
                "init an upload for test-fixture.jpg",
                "start the PUT stream",
                "simulate a mid-stream network failure",
                "observe the sheet"
              ]
            },
            "end_state": {
              "must_observe": [
                "sheet shows an 'upload error' state with a retry affordance (1 retry control)",
                "file_objects rows: 0 (no orphan)"
              ],
              "must_not_observe": [
                "file_objects rows > 0 (orphan promoted)",
                "sheet stuck at 'uploading'",
                "error swallowed silently"
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
      "description": "GIVEN the user attaches test-fixture.jpg in the improvements sheet WHEN the image attachment completes THEN the preview thumbnail renders the fixture's real dimensions",
      "verify": "pnpm vitest run tests/components/improvements/preview-thumbnail.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "react-native-rendering",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - preview hardcoded to a placeholder",
            "empty - empty attach prompt shown after attach",
            "static - Image not mounted"
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
              "actor": "user",
              "steps": [
                "attach test-fixture.jpg",
                "observe the preview thumbnail"
              ]
            },
            "end_state": {
              "must_observe": [
                "preview renders test-fixture.jpg at 800x600 (fixture dimensions)",
                "preview file URI is non-empty (length > 0)",
                "Image node testID 'attach-preview' mounted (1 node)"
              ],
              "must_not_observe": [
                "empty attach prompt placeholder shown",
                "preview URI empty (length 0)",
                "0 Image nodes mounted"
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
      "description": "upload-init -> PUT -> finalize creates exactly one file_objects row with a content_hash matching the fixture SHA-256",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/lifecycle.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "re-uploading the identical image is idempotent via the content_hash unique constraint",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/idempotency.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "an upload error surfaces a visible rejection with zero orphan file_objects rows",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/error-handling.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "the preview thumbnail renders the fixture image at its real dimensions",
      "verify": "pnpm vitest run tests/components/improvements/preview-thumbnail.test.ts",
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
