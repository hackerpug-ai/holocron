# S-UPLOAD-04: Reviewer pass: upload idempotency, orphan-safety, no-convex-final
> Status: completed

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `REVIEW`
- **Status:** `completed`
- **Priority:** `P0`  ·  **Effort:** `S`  ·  **Estimate:** `90 minutes`
- **Agent:** `react-native-ui-reviewer`  ·  **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `skipped`  ·  **RED/GREEN Required:** `no`
- **Flow ref (PRIMARY):** `T-DATA-021`  ·  **Touches:** CAP-SYNC-01, CAP-CUT-01

## Outcome
An adversarial reviewer pass confirms the upload lifecycle is idempotent and orphan-safe, the last convex/react client dependency is gone, and the T-DATA-021 human test deliverable passes all 7 steps with real evidence.

## Background
This is the sprint-26 closure/review gate. S-UPLOAD-01/02/03 deliver the clients and harness; this task is the react-native-ui-reviewer adversarial pass that runs the T-DATA-021 human test (7 steps), the verify:no-convex-client gate (CAP-CUT-01), the content_hash unique-constraint proof (idempotency), the orphan-safety proof (cancel = 0 orphans), and a theme-token/testID/SafeAreaView audit against RULES.md. It writes no production code - it is review-only and blocks sprint close on any failure.

## Specification
- **Objective:** Adversarially verify the complete upload lifecycle for idempotency, orphan-safety, and the final convex/react removal.
- **Success state:** T-DATA-021 passes all 7 steps; verify:no-convex-client exits 0 with an EMPTY grep; verify:blob --last shows one row matching the fixture SHA-256; verify:blob --orphans shows zero; the Maestro journey passes with artifacts; the content_hash unique constraint is enforced; the code audit passes.

## Critical Constraints
### MUST
- MUST run all 7 steps of the T-DATA-021 human test deliverable
- MUST verify upload idempotency (same SHA-256 = same file_objects row)
- MUST verify orphan safety (cancelled voice = zero orphan rows)
- MUST verify zero convex/react imports via verify:no-convex-client + grep
- MUST verify the content_hash unique constraint is enforced
- MUST run the Maestro upload.yaml journey and capture artifacts
### NEVER
- NEVER approve with orphan rows present
- NEVER approve with any convex/react import remaining
- NEVER approve without running the T-DATA-021 human test
- NEVER approve mocked/stubbed upload tests
- NEVER write production code (review-only)
### STRICTLY
- STRICTLY the PRIMARY AC (T-DATA-021 human test, 7 steps) is test_tier: e2e, bound to T-DATA-021
- STRICTLY verify:no-convex-client MUST exit 0 and grep -rn 'convex/react' over app/ components/ hooks/ lib/ MUST return EMPTY
- STRICTLY verify:blob --orphans MUST report zero; orphan detection is CRITICAL for approval

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
- **Provides:** upload-lifecycle-verified, convex-free-voice-verified
- **Consumes:** image-upload-lifecycle-client, voice-upload-lifecycle-client, upload-e2e-journey
- **Boundary contracts:**
  - T-DATA-021 human test deliverable (all 7 steps) is the PRIMARY oracle
  - verify:no-convex-client gate exits 0 with an EMPTY convex/react grep (CAP-CUT-01)
  - verify:blob --last (one row, matching SHA-256) and --orphans (zero) both pass
  - The Maestro upload.yaml journey passes with artifacts

## Acceptance Criteria
### AC-1: T-DATA-021 human test deliverable passes all 7 steps [PRIMARY]
- **GIVEN:** the RN app is running with Hono + Zero + blob store healthy
- **WHEN:** the reviewer runs all 7 steps of the T-DATA-021 human test deliverable
- **THEN:** steps 1-7 pass: seed clears file_objects, attach preview shows, submit upload succeeds, verify:blob --last shows one row matching SHA-256, re-attach is idempotent, voice cancel leaves zero orphans, Maestro journey passes
- **Test tier:** `e2e`  ·  **Verification service:** `rn+hono+blob+maestro`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --last && bun services/platform/src/cli/holo.ts verify:blob --orphans && bun services/platform/src/cli/holo.ts verify:no-convex-client && maestro test .maestro/upload.yaml`
- **Scenario:** tier `visible`  ·  test_tier `e2e`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - reviewer rubber-stamps without running gates; empty - hardcoded #RRGGBB color present (count > 0); mock - lint/grep skipped
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `cli_user`; steps: holo seed:e2e --reset; attach test-fixture.jpg, verify preview; submit, wait for init->PUT->finalize; verify:blob --last; re-attach identical image (idempotency); start+cancel a voice recording, verify:blob --orphans; maestro test .maestro/upload.yaml -> MUST observe 7 of 7 steps pass (count 7); file_objects rows: 1 after first upload; content_hash matches the fixture SHA-256 (64 hex chars); re-attach still file_objects rows: 1 (idempotent); verify:blob --orphans reports orphan rows: 0; Maestro .maestro/upload.yaml exits 0 + >=1 artifact; preview thumbnail renders 800x600 (fixture dims); MUST NOT observe any step fails; file_objects rows: 0 after upload (nothing promoted); file_objects rows > 1 after re-attach (dedup broken); orphan rows > 0 after voice cancel; 0 Maestro artifacts (empty)

### AC-2: verify:no-convex-client gate exits 0 with an EMPTY grep
- **GIVEN:** the voice code was rewired off Convex in S-UPLOAD-02
- **WHEN:** the reviewer runs verify:no-convex-client and the convex/react grep
- **THEN:** the gate exits 0 and grep -rn 'convex/react' over app/ components/ hooks/ lib/ returns EMPTY
- **Test tier:** `integration`  ·  **Verification service:** `holo-cli+grep`  ·  **Flow ref:** `UC-SYNC-01`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - dispatcher still calls Convex; empty - a convex/react import remains (grep non-empty); mock - verify:no-convex-client bypassed
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `voice_session_disabled`: actor `cli_user`; steps: run verify:no-convex-client; run grep -rn 'convex/react' app components hooks lib; inspect use-voice-session.ts + use-voice-result-bridge.ts -> MUST observe verify:no-convex-client exits 0; grep returns 0 results (EMPTY); 0 useAction/useMutation/useConvex imports; 0 Convex action calls; MUST NOT observe verify:no-convex-client non-zero exit; grep non-empty (>=1 convex/react hit); CONVEX_UNAVAILABLE still thrown; a Convex createSession call present

### AC-3: Content addressing unique constraint enforced (SHA-256 idempotency)
- **GIVEN:** file_objects has a uniqueIndex on content_hash
- **WHEN:** the reviewer attempts a duplicate content_hash insert / re-attaches the same image
- **THEN:** the unique constraint prevents a duplicate row; finalize returns the existing object; file_objects count stays 1
- **Test tier:** `integration`  ·  **Verification service:** `hono+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - dedup skipped (always inserts new row); empty - test passing from file_objects rows: 0 (dedup unproven against empty table); mock - content_hash index not enforced
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `api_client`; steps: insert a file_objects row with content_hash H; attempt a second insert with the same content_hash H; verify finalize idempotency -> MUST observe unique index file_objects_content_hash_uidx rejects the duplicate (1 row remains); finalize returns the existing fileObjectId (same id; file_objects rows: 1); file_objects rows: 1; MUST NOT observe duplicate content_hash rows (rows: 2); file_objects rows: 0 (start signature, dedup unproven); constraint not enforced

### AC-4: Orphan safety verified (cancelled voice leaves zero orphan rows)
- **GIVEN:** a voice recording can be cancelled mid-session
- **WHEN:** the reviewer starts a recording, cancels, and runs verify:blob --orphans
- **THEN:** no file_objects row is created for the cancelled session and verify:blob --orphans reports zero
- **Test tier:** `integration`  ·  **Verification service:** `hono+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --orphans`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - cancel still calls upload-init; empty - cancelled recording leaks a file_objects row; mock - verify:blob --orphans hardcoded to 0
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `user`; steps: start a voice recording; speak 2-3s; tap cancel; run verify:blob --orphans -> MUST observe verify:blob --orphans exits 0; orphan rows: 0; file_objects rows: 0 for the cancelled session; 0 storage blobs for the cancelled sessionId; MUST NOT observe verify:blob --orphans non-zero exit; orphan rows > 0; a file_objects row created for the cancelled session

### AC-5: Code review verifies RN client patterns and theme tokens
- **GIVEN:** S-UPLOAD-01/02 are complete
- **WHEN:** the reviewer audits the changed files against RULES.md
- **THEN:** no hardcoded colors/spacing/typography, semantic theme tokens used, testID on interactive elements, react-native-paper components, SafeAreaView on screen roots
- **Test tier:** `unit`  ·  **Verification service:** `biome+grep-audit`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Static theme-token/testID audit via biome + a hardcoded-color grep - no runtime I/O.`
- **Verify:** `biome check components/improvements components/voice hooks/use-voice-session.ts && ! grep -rEn '#[0-9A-Fa-f]{6}' components/improvements components/voice`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - reviewer rubber-stamps without running gates; empty - hardcoded #RRGGBB color present (count > 0); mock - lint/grep skipped
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `seeded_fixture_jpg`: actor `cli_user`; steps: audit components/improvements/ImprovementSubmitSheet.tsx; audit hooks/use-voice-session.ts; run biome + the hardcoded-color grep -> MUST observe 0 hardcoded #RRGGBB colors in components/improvements + components/voice; testID on the attach + voice-mic interactive elements (>=2); biome check exit 0; react-native-paper components used (>=1 per surface); MUST NOT observe a hardcoded #RRGGBB color (count > 0); 0 testIDs on interactive elements; biome non-zero exit

## Test Criteria
| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | the T-DATA-021 human test deliverable passes all 7 steps | `AC-1` | `bun services/platform/src/cli/holo.ts verify:blob --last && bun services/platform/src/cli/holo.ts verify:blob --orphans && bun services/platform/src/cli/holo.ts verify:no-convex-client && maestro test .maestro/upload.yaml` |
| `TC-2` | verify:no-convex-client exits 0 with an EMPTY convex/react grep | `AC-2` | `bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib` |
| `TC-3` | the content_hash unique constraint enforces SHA-256 idempotency | `AC-3` | `PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts` |
| `TC-4` | a cancelled voice recording leaves zero orphan rows | `AC-4` | `bun services/platform/src/cli/holo.ts verify:blob --orphans` |
| `TC-5` | the code audit finds no hardcoded colors and testID/SafeAreaView compliance | `AC-5` | `biome check components/improvements components/voice hooks/use-voice-session.ts && ! grep -rEn '#[0-9A-Fa-f]{6}' components/improvements components/voice` |

## Scope (file-level write permissions)
**writeAllowed:**
- `review-only - no production code writes`
- `review-artifact.md (NEW, review notes only)`
**writeProhibited:**
- `any production code modification`
- `approving without running all 7 human-test steps`
- `approving with orphan rows present`
- `approving with any convex/react import remaining`
- `approving mocked/stubbed upload tests`

## Reading List
1. `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — lines 103 — T-DATA-021 human test deliverable (7 steps) - PRIMARY oracle
2. `.spec/prds/mk6-migration/08-uc-sync.md` — lines 20-30 — UC-SYNC-01 zero-convex/react requirement (CAP-CUT-01)
3. `hooks/use-voice-session.ts` — lines 37-140 — verify the rewire removed convex/react
4. `components/improvements/ImprovementSubmitSheet.tsx` — lines 1-60 — verify theme tokens + testID on the attach affordance
5. `RULES.md` — lines 1-100 — RN client patterns + code-review checklist

## Design
- **References:** SPRINT.md, .spec/prds/mk6-migration/11-e2e-testing-criteria.md, CAP-CUT-01
- **Pattern:** Manual human test + CLI gate verification + adversarial code review
- **Pattern source:** `.spec/prds/mk6-migration/11-e2e-testing-criteria.md T-DATA-021`
- **Anti-pattern:** Do NOT approve without running all 7 steps; do NOT approve with orphans; do NOT approve with convex/react imports; do NOT rubber-stamp
- **Interaction notes:**
  - Review task - validates S-UPLOAD-01/02/03; the T-DATA-021 human test is the PRIMARY oracle
  - verify:no-convex-client + grep must be EMPTY (CAP-CUT-01, the final convex/react removal)
  - Orphan safety (--orphans == 0) and idempotency (content_hash unique) are CRITICAL for approval
  - Code audit checks RULES.md patterns (theme tokens, testID, SafeAreaView, react-native-paper)

## Verification Gates
| Gate | Command | Expected |
|------|---------|----------|
| `human-test-t-data-021` | `T-DATA-021 steps 1-7 (seed/attach/submit/verify:last/re-attach/voice-cancel+orphans/maestro)` | 7/7 pass with evidence |
| `verify-no-convex-client` | `bun services/platform/src/cli/holo.ts verify:no-convex-client` | Exit 0, EMPTY grep |
| `verify-blob-orphans` | `bun services/platform/src/cli/holo.ts verify:blob --orphans` | Exit 0, zero orphans |
| `maestro-journey` | `maestro test .maestro/upload.yaml` | Exit 0 with artifacts |
| `scenario-validation` | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-UPLOAD-04.json` | Exit 0 (0 CRITICAL/HIGH) |

## Dependencies
- **Depends on:** `S-UPLOAD-01`, `S-UPLOAD-02`, `S-UPLOAD-03`
- **Blocks:** —



## Review Closure (react-native-ui-reviewer)

- **Verdict:** APPROVED
- **Date:** 2026-07-26
- **Evidence:** `.tmp/S-UPLOAD-04/review-artifact.md`, `verification-summary.json` (10/10)
- **AC-1:** PASS — T-DATA-021 7/7 (Maestro + CAS + orphans + no-convex)
- **AC-2:** PASS — verify:no-convex-client OK; `convex/react` grep EMPTY
- **AC-3:** PASS — `file_objects_content_hash_uidx` 23505; finalize idempotent rows:1
- **AC-4:** PASS — cancel-orphan-safe IT + orphan rows: 0
- **AC-5:** PASS — biome OK; 0 hardcoded #RRGGBB; attach-button + voice-mic-button testIDs

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-UPLOAD-04",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
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
    "voice_session_disabled": {
      "description": "pre-rewire voice hook: use-voice-session.ts throws CONVEX_UNAVAILABLE behind a convex/react guard comment",
      "seed_method": "migration_fixture",
      "records": [
        "hooks/use-voice-session.ts guard: CONVEX_UNAVAILABLE",
        ">=1 convex/react import remaining (the CAP-CUT-01 target)"
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
      "description": "GIVEN the RN app is running with Hono + Zero + blob store healthy WHEN the reviewer runs all 7 steps of the T-DATA-021 human test deliverable THEN steps 1-7 pass: seed clears file_objects, attach preview shows, submit upload succeeds, verify:blob --last shows one row matching SHA-256, re-attach is idempotent, voice cancel leaves zero orphans, Maestro journey passes",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last && bun services/platform/src/cli/holo.ts verify:blob --orphans && bun services/platform/src/cli/holo.ts verify:no-convex-client && maestro test .maestro/upload.yaml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "rn+hono+blob+maestro",
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
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "cleared_file_objects",
            "action": {
              "actor": "cli_user",
              "steps": [
                "holo seed:e2e --reset",
                "attach test-fixture.jpg, verify preview",
                "submit, wait for init->PUT->finalize",
                "verify:blob --last",
                "re-attach identical image (idempotency)",
                "start+cancel a voice recording, verify:blob --orphans",
                "maestro test .maestro/upload.yaml"
              ]
            },
            "end_state": {
              "must_observe": [
                "7 of 7 steps pass (count 7)",
                "file_objects rows: 1 after first upload",
                "content_hash matches the fixture SHA-256 (64 hex chars)",
                "re-attach still file_objects rows: 1 (idempotent)",
                "verify:blob --orphans reports orphan rows: 0",
                "Maestro .maestro/upload.yaml exits 0 + >=1 artifact",
                "preview thumbnail renders 800x600 (fixture dims)"
              ],
              "must_not_observe": [
                "any step fails",
                "file_objects rows: 0 after upload (nothing promoted)",
                "file_objects rows > 1 after re-attach (dedup broken)",
                "orphan rows > 0 after voice cancel",
                "0 Maestro artifacts (empty)"
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
      "description": "GIVEN the voice code was rewired off Convex in S-UPLOAD-02 WHEN the reviewer runs verify:no-convex-client and the convex/react grep THEN the gate exits 0 and grep -rn 'convex/react' over app/ components/ hooks/ lib/ returns EMPTY",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli+grep",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - dispatcher still calls Convex",
            "empty - a convex/react import remains (grep non-empty)",
            "mock - verify:no-convex-client bypassed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "voice_session_disabled",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run verify:no-convex-client",
                "run grep -rn 'convex/react' app components hooks lib",
                "inspect use-voice-session.ts + use-voice-result-bridge.ts"
              ]
            },
            "end_state": {
              "must_observe": [
                "verify:no-convex-client exits 0",
                "grep returns 0 results (EMPTY)",
                "0 useAction/useMutation/useConvex imports",
                "0 Convex action calls"
              ],
              "must_not_observe": [
                "verify:no-convex-client non-zero exit",
                "grep non-empty (>=1 convex/react hit)",
                "CONVEX_UNAVAILABLE still thrown",
                "a Convex createSession call present"
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
      "description": "GIVEN file_objects has a uniqueIndex on content_hash WHEN the reviewer attempts a duplicate content_hash insert / re-attaches the same image THEN the unique constraint prevents a duplicate row; finalize returns the existing object; file_objects count stays 1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+postgres",
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
              "actor": "api_client",
              "steps": [
                "insert a file_objects row with content_hash H",
                "attempt a second insert with the same content_hash H",
                "verify finalize idempotency"
              ]
            },
            "end_state": {
              "must_observe": [
                "unique index file_objects_content_hash_uidx rejects the duplicate (1 row remains)",
                "finalize returns the existing fileObjectId (same id; file_objects rows: 1)",
                "file_objects rows: 1"
              ],
              "must_not_observe": [
                "duplicate content_hash rows (rows: 2)",
                "file_objects rows: 0 (start signature, dedup unproven)",
                "constraint not enforced"
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
      "description": "GIVEN a voice recording can be cancelled mid-session WHEN the reviewer starts a recording, cancels, and runs verify:blob --orphans THEN no file_objects row is created for the cancelled session and verify:blob --orphans reports zero",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+postgres",
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
                "speak 2-3s",
                "tap cancel",
                "run verify:blob --orphans"
              ]
            },
            "end_state": {
              "must_observe": [
                "verify:blob --orphans exits 0",
                "orphan rows: 0",
                "file_objects rows: 0 for the cancelled session",
                "0 storage blobs for the cancelled sessionId"
              ],
              "must_not_observe": [
                "verify:blob --orphans non-zero exit",
                "orphan rows > 0",
                "a file_objects row created for the cancelled session"
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
      "description": "GIVEN S-UPLOAD-01/02 are complete WHEN the reviewer audits the changed files against RULES.md THEN no hardcoded colors/spacing/typography, semantic theme tokens used, testID on interactive elements, react-native-paper components, SafeAreaView on screen roots",
      "verify": "biome check components/improvements components/voice hooks/use-voice-session.ts && ! grep -rEn '#[0-9A-Fa-f]{6}' components/improvements components/voice",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "biome+grep-audit",
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
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fixture_jpg",
            "action": {
              "actor": "cli_user",
              "steps": [
                "audit components/improvements/ImprovementSubmitSheet.tsx",
                "audit hooks/use-voice-session.ts",
                "run biome + the hardcoded-color grep"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 hardcoded #RRGGBB colors in components/improvements + components/voice",
                "testID on the attach + voice-mic interactive elements (>=2)",
                "biome check exit 0",
                "react-native-paper components used (>=1 per surface)"
              ],
              "must_not_observe": [
                "a hardcoded #RRGGBB color (count > 0)",
                "0 testIDs on interactive elements",
                "biome non-zero exit"
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
      "description": "the T-DATA-021 human test deliverable passes all 7 steps",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --last && bun services/platform/src/cli/holo.ts verify:blob --orphans && bun services/platform/src/cli/holo.ts verify:no-convex-client && maestro test .maestro/upload.yaml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "verify:no-convex-client exits 0 with an EMPTY convex/react grep",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "the content_hash unique constraint enforces SHA-256 idempotency",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/uploads/unique-constraint.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "a cancelled voice recording leaves zero orphan rows",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the code audit finds no hardcoded colors and testID/SafeAreaView compliance",
      "verify": "biome check components/improvements components/voice hooks/use-voice-session.ts && ! grep -rEn '#[0-9A-Fa-f]{6}' components/improvements components/voice",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
