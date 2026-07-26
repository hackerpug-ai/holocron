# S-UPLOAD-02: Voice audio upload + imperative dispatcher rewire off Convex
> Status: ✅ Completed
> Commit: 895293f64f377f437e724dedf6a113208a6d3f02
> Reviewer: product-manager+react-native-ui-reviewer
> Completed: 2026-07-26T23:17:16Z

- **Sprint:** [Sprint 26: Image and Voice Upload Lifecycle Client](./SPRINT.md)
- **Task Type:** `FEATURE`
- **Status:** `Backlog`
- **Priority:** `P0`  ·  **Effort:** `L`  ·  **Estimate:** `360 minutes`
- **Agent:** `react-native-ui-implementer`  ·  **Reviewer:** `react-native-ui-reviewer`
- **Proposed By:** `react-native-ui-planner`
- **TDD Mode:** `red_first`  ·  **RED/GREEN Required:** `yes`
- **Flow ref (PRIMARY):** `UC-SYNC-01`  ·  **Touches:** CAP-SYNC-01, CAP-CUT-01

## Outcome
The voice session starts via an authoritative Hono command (not Convex), audio uploads through the content-addressed lifecycle (hash-verified, idempotent), a cancelled recording leaves zero orphan file_objects rows, and grep finds zero convex/react imports in voice code.

## Background
Sprint 24 rewired the app off Convex onto Zero/Hono but left the voice session on an imperative Convex dispatcher: hooks/use-voice-session.ts:39 still carries a 'MUST NOT import convex/react' guard and throws CONVEX_UNAVAILABLE, and use-voice-result-bridge.ts is a no-op pending this rewire - this is the LAST convex/react client dependency (CAP-CUT-01). The backend content-addressed upload store (Sprint 14) and the Zero client (Sprint 24) already exist. This task rewires the dispatcher to a Hono command (POST /api/voice-sessions) and routes the audio blob through the same init->PUT->finalize lifecycle as images (kind=voice_artifact), reusing the existing voice UI components (components/voice/*) with ONE state machine (idle/recording/processing/complete/cancelled).

## Specification
- **Objective:** Rewire the voice session dispatcher from Convex to an authoritative Hono command and implement the audio upload lifecycle (content-addressed, orphan-safe), removing the last convex/react client dependency.
- **Success state:** The voice session starts via a Hono command (sessionId returned, no Convex action), audio uploads via init->PUT->finalize producing one file_objects row with content_hash, a cancelled recording leaves zero orphan rows, grep -rn 'convex/react' over voice code is EMPTY, and verify:no-convex-client exits 0.

## Critical Constraints
### MUST
- MUST remove ALL convex/react imports from voice code (use-voice-session.ts, use-voice-result-bridge.ts)
- MUST rewire the voice session dispatcher to an authoritative Hono command (not a Convex action)
- MUST route audio through the content-addressed upload lifecycle (init->PUT->finalize, kind=voice_artifact)
- MUST ensure a cancelled recording leaves zero orphan file_objects rows (never call upload-init on cancel)
- MUST preserve the existing voice UI components (VoiceMicButton, VoiceSessionOverlay, VoiceAgentOrb, VoiceCaptions, VoiceToolActivityPill) - no new components
- MUST seed via holo seed:e2e --reset and observe concrete file_objects/orphan counts
### NEVER
- NEVER import from convex/react (useAction/useMutation/useConvex) anywhere in voice code
- NEVER call Convex imperative actions (createSession/recordTranscript/generateAudioUploadUrl)
- NEVER create an orphan file_objects row on cancel
- NEVER bypass the content-addressed upload protocol for voice audio
- NEVER mock the voice dispatcher or upload endpoints
### STRICTLY
- STRICTLY grep -rn 'convex/react' app/ components/ hooks/ lib/ returns EMPTY after this task
- STRICTLY every behavioral AC is proven via real Hono + Zero + blob store (PLATFORM_IT=1) or Maestro e2e
- STRICTLY the PRIMARY AC (dispatcher rewire removes convex/react) is test_tier: integration, bound to UC-SYNC-01
- STRICTLY this is the FINAL convex/react client removal (CAP-CUT-01)

## Capability Chain
- **Touches:** CAP-SYNC-01, CAP-CUT-01
- **Provides:** voice-upload-lifecycle-client, zero-convex-client-free-voice
- **Consumes:** content-addressed-upload-backend, zero-synced-file-objects
- **Boundary contracts:**
  - The imperative Convex voice-session dispatcher is replaced by an authoritative Hono command (POST /api/voice-sessions -> sessionId); audio attaches via the upload lifecycle (kind=voice_artifact)
  - CAP-CUT-01: after this task grep -rn 'convex/react' over app/ components/ hooks/ lib/ returns EMPTY and verify:no-convex-client exits 0
  - voice_sessions is zero_pub: session state + the attached blob_id reconcile reactively
  - Cancelled recordings never call upload-init (orphan-safe); a started-but-unfinalized voice upload must not promote a file_objects row

## Acceptance Criteria
### AC-1: Voice session dispatcher rewire to a Hono command removes convex/react [PRIMARY]
- **GIVEN:** the voice hook currently throws CONVEX_UNAVAILABLE behind a convex/react guard comment
- **WHEN:** the developer replaces the Convex createSession with the Hono /api/voice-sessions command
- **THEN:** the voice session starts via the Hono command with Zero-synced state and grep -rn 'convex/react' over voice code returns EMPTY
- **Test tier:** `integration`  ·  **Verification service:** `hono+zero+postgres`  ·  **Flow ref:** `UC-SYNC-01`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - dispatcher still calls Convex; empty - a convex/react import remains (grep non-empty); mock - verify:no-convex-client bypassed
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `voice_session_disabled`: actor `api_client`; steps: call createSession from useVoiceSession; observe the Hono command invoked (not Convex); read ephemeralKey/sessionId; run verify:no-convex-client -> MUST observe POST /api/voice-sessions returns 200 + a uuidv7 sessionId (36 chars); ephemeralKey length > 0 (non-empty, >=1 char); verify:no-convex-client exits 0; grep -rn 'convex/react' hooks lib/voice components/voice returns 0 hits (EMPTY); MUST NOT observe a convex/react import remaining (grep non-empty, >=1 hit); a Convex useAction/useMutation call; CONVEX_UNAVAILABLE thrown

### AC-2: Voice audio upload uses the content-addressed protocol
- **GIVEN:** a voice recording completes and audio bytes are available
- **WHEN:** the voice session triggers the audio upload
- **THEN:** upload-init is called with kind=voice_artifact, PUT streams the audio, finalize creates one file_objects row with content_hash, Zero-synced
- **Test tier:** `integration`  ·  **Verification service:** `hono+blob+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - finalize skipped (no hash/length verify); mock - upload endpoints mocked; disconnect - Hono/blob store down; empty - file_objects table empty (nothing promoted)
  - **Evidence:** artifact `db_query`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `api_client`; steps: complete a voice recording; init upload kind=voice_artifact; PUT stream the audio bytes; finalize -> MUST observe file_objects rows: 1; content_hash == audio SHA-256 (64 hex chars); mime_type starts with 'audio/' (e.g. 'audio/webm'); 1 Zero-synced file_objects row in the client query; MUST NOT observe file_objects rows: 0 (nothing promoted); content_hash mismatch; upload without SHA-256 verification; Convex _storage used

### AC-3: A cancelled recording leaves zero orphan file_objects rows
- **GIVEN:** a voice recording is in progress
- **WHEN:** the user cancels the recording before completion
- **THEN:** no upload-init/finalize occurs and file_objects has zero orphan rows for the cancelled audio
- **Test tier:** `integration`  ·  **Verification service:** `hono+blob+postgres`  ·  **Flow ref:** `T-DATA-021`
- **Verify:** `bun services/platform/src/cli/holo.ts verify:blob --orphans`
- **Scenario:** tier `visible`  ·  test_tier `integration`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - cancel still calls upload-init; empty - cancelled recording leaks a file_objects row; mock - verify:blob --orphans hardcoded to 0
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `cleared_file_objects`: actor `user`; steps: start a voice recording; record 2-3s of audio; tap cancel; run verify:blob --orphans -> MUST observe verify:blob --orphans exits 0; orphan rows: 0; file_objects rows: 0 for the cancelled session; state transitions to 'cancelled'; MUST NOT observe orphan rows > 0 (a leaked row); file_objects rows > 0 (orphan promoted); upload-init called for the cancelled recording

### AC-4: Voice state machine preserves the existing UI components
- **GIVEN:** the voice UI components exist (VoiceMicButton, VoiceSessionOverlay, VoiceAgentOrb, ...)
- **WHEN:** the voice session transitions idle -> recording -> cancelled
- **THEN:** all existing components render with Zero-synced state and no regressions
- **Test tier:** `unit`  ·  **Verification service:** `react-native-rendering`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Pure UI state-machine component test - no runtime I/O; assertions on mounted nodes per state.`
- **Verify:** `pnpm vitest run tests/components/voice/state-machine.test.ts`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** stub - components not mounted per state; empty - 0 components mounted; static - state never transitions
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `voice_session_idle`: actor `user`; steps: tap VoiceMicButton to start; observe the overlay + orb; speak 3s; tap cancel; observe idle -> MUST observe VoiceMicButton testID 'voice-mic' in state.idle (1 node); VoiceSessionOverlay testID 'voice-overlay' mounted during recording (1 node); VoiceAgentOrb testID 'voice-orb' animating (state.recording); 3 transitions logged: idle -> recording -> cancelled; MUST NOT observe 0 voice components mounted (empty); state stuck in 'recording' after cancel; broken transition (missing 'cancelled')

### AC-5: Type check and lint pass with zero convex imports
- **GIVEN:** the code changes are complete
- **WHEN:** the developer runs typecheck, lint, and the no-convex grep
- **THEN:** tsgo --noEmit exits 0, biome check exits 0, and grep finds zero convex/react imports in voice code
- **Test tier:** `unit`  ·  **Verification service:** `typescript+biome+grep`  ·  **Flow ref:** `None`  ·  **unit_test_justified:** `Static build-tool + grep gate (tsgo/biome/grep) - no runtime I/O; verified by exit codes.`
- **Verify:** `tsgo --noEmit && biome check . && ! grep -rn 'convex/react' hooks lib/voice components/voice`
- **Scenario:** tier `visible`  ·  test_tier `unit`  ·  topology `single-node`
  - **Negative control — would fail if:** static - type/lint errors or a convex/react import
  - **Evidence:** artifact `stdout`, required_capture=True
  - **Case 1** — start_ref `voice_session_disabled`: actor `cli_user`; steps: run tsgo --noEmit; run biome check .; run grep -rn 'convex/react' hooks lib/voice components/voice -> MUST observe tsgo exit code 0; biome exit code 0; grep returns 0 hits (EMPTY); MUST NOT observe >=1 TypeScript error (non-zero exit); >=1 biome violation; a convex/react import found (grep non-empty, >=1 hit)

## Test Criteria
| ID | Criterion | Maps to | Verify |
|----|-----------|---------|--------|
| `TC-1` | the dispatcher rewire removes all convex/react imports from voice code | `AC-1` | `bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib` |
| `TC-2` | voice audio uploads via the content-addressed protocol with SHA-256 verification | `AC-2` | `PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts` |
| `TC-3` | a cancelled recording leaves zero orphan rows | `AC-3` | `bun services/platform/src/cli/holo.ts verify:blob --orphans` |
| `TC-4` | the voice UI components render correctly per state with Zero state | `AC-4` | `pnpm vitest run tests/components/voice/state-machine.test.ts` |
| `TC-5` | tsgo, biome, and the no-convex grep all pass | `AC-5` | `tsgo --noEmit && biome check . && ! grep -rn 'convex/react' hooks lib/voice components/voice` |

## Scope (file-level write permissions)
**writeAllowed:**
- `hooks/use-voice-session.ts (MODIFY)`
- `hooks/use-voice-result-bridge.ts (MODIFY)`
- `lib/voice/audio-recorder.ts (MODIFY, upload integration only)`
- `lib/voice/webrtc-connection.ts (MODIFY, if dispatcher changes need it)`
- `components/voice/*.tsx (MODIFY, state updates only - no new components)`
- `app/zero/queries.ts (MODIFY, voice queries only)`
**writeProhibited:**
- `any new convex/react import anywhere`
- `calling Convex actions (useAction/useMutation/useConvex)`
- `creating orphan file_objects rows on cancel`
- `bypassing the content-addressed upload for voice audio`
- `creating new voice UI components`

## Reading List
1. `hooks/use-voice-session.ts` — lines 37-140 — current CONVEX_UNAVAILABLE stub + createSession/recordTranscript/generateAudioUploadUrl signatures (PRIMARY rewire target)
2. `hooks/use-voice-result-bridge.ts` — lines 1-22 — current no-op bridge requiring the CAP-CUT-01 rewire
3. `services/platform/src/http/hono-app.ts` — lines 258-290 — upload routes the audio lifecycle reuses
4. `components/voice/VoiceMicButton.tsx` — lines 1-60 — state-driven mic button to preserve
5. `.spec/prds/mk6-migration/08-uc-sync.md` — lines 20-30 — UC-SYNC-01 zero-convex/react requirement

## Design
- **References:** SPRINT.md, .spec/prds/mk6-migration/08-uc-sync.md, CAP-CUT-01
- **Pattern:** Hono command for session init + content-addressed upload for the audio blob (reuses S-UPLOAD-01 lifecycle)
- **Pattern source:** `app/zero/platform.ts:113-157 (upload functions)`
- **Anti-pattern:** Do NOT keep Convex createSession; do NOT upload without SHA-256; do NOT create orphan rows on cancel; do NOT inject a foreign session row
- **Interaction notes:**
  - Voice dispatcher rewire replaces Convex createSession with the Hono POST /api/voice-sessions command
  - Audio upload reuses the image upload lifecycle (init->PUT->finalize) with kind=voice_artifact; the audio blob attaches to voice_sessions.blob_id
  - ONE state machine: idle -> recording -> processing -> (complete|cancelled); cancel triggers an orphan-safe abort (never upload-init)
  - Zero-synced session state replaces the Convex watchQuery

## Verification Gates
| Gate | Command | Expected |
|------|---------|----------|
| `typecheck` | `tsgo --noEmit` | Exit 0 |
| `lint` | `biome check .` | Exit 0 |
| `no-convex-client` | `bun services/platform/src/cli/holo.ts verify:no-convex-client` | Exit 0 (zero convex/react imports) |
| `integration-tests` | `PLATFORM_IT=1 pnpm vitest run tests/integration/voice/` | Exit 0 |
| `scenario-validation` | `python3 /Users/inference1/Projects/brain/tools/validate-scenario/validate_scenario.py .validate-payloads/S-UPLOAD-02.json` | Exit 0 (0 CRITICAL/HIGH) |

## Dependencies
- **Depends on:** `S-UPLOAD-01`
- **Blocks:** `S-UPLOAD-03`, `S-UPLOAD-04`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-UPLOAD-02",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "voice_session_idle": {
      "description": "voice surface at idle with the Zero provider mounted",
      "seed_method": "public_api",
      "records": [
        "useVoiceSession state == 'idle'"
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
      "description": "GIVEN the voice hook currently throws CONVEX_UNAVAILABLE behind a convex/react guard comment WHEN the developer replaces the Convex createSession with the Hono /api/voice-sessions command THEN the voice session starts via the Hono command with Zero-synced state and grep -rn 'convex/react' over voice code returns EMPTY",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+zero+postgres",
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
              "actor": "api_client",
              "steps": [
                "call createSession from useVoiceSession",
                "observe the Hono command invoked (not Convex)",
                "read ephemeralKey/sessionId",
                "run verify:no-convex-client"
              ]
            },
            "end_state": {
              "must_observe": [
                "POST /api/voice-sessions returns 200 + a uuidv7 sessionId (36 chars)",
                "ephemeralKey length > 0 (non-empty, >=1 char)",
                "verify:no-convex-client exits 0",
                "grep -rn 'convex/react' hooks lib/voice components/voice returns 0 hits (EMPTY)"
              ],
              "must_not_observe": [
                "a convex/react import remaining (grep non-empty, >=1 hit)",
                "a Convex useAction/useMutation call",
                "CONVEX_UNAVAILABLE thrown"
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
      "description": "GIVEN a voice recording completes and audio bytes are available WHEN the voice session triggers the audio upload THEN upload-init is called with kind=voice_artifact, PUT streams the audio, finalize creates one file_objects row with content_hash, Zero-synced",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts",
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
              "actor": "api_client",
              "steps": [
                "complete a voice recording",
                "init upload kind=voice_artifact",
                "PUT stream the audio bytes",
                "finalize"
              ]
            },
            "end_state": {
              "must_observe": [
                "file_objects rows: 1",
                "content_hash == audio SHA-256 (64 hex chars)",
                "mime_type starts with 'audio/' (e.g. 'audio/webm')",
                "1 Zero-synced file_objects row in the client query"
              ],
              "must_not_observe": [
                "file_objects rows: 0 (nothing promoted)",
                "content_hash mismatch",
                "upload without SHA-256 verification",
                "Convex _storage used"
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
      "description": "GIVEN a voice recording is in progress WHEN the user cancels the recording before completion THEN no upload-init/finalize occurs and file_objects has zero orphan rows for the cancelled audio",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "hono+blob+postgres",
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
                "record 2-3s of audio",
                "tap cancel",
                "run verify:blob --orphans"
              ]
            },
            "end_state": {
              "must_observe": [
                "verify:blob --orphans exits 0",
                "orphan rows: 0",
                "file_objects rows: 0 for the cancelled session",
                "state transitions to 'cancelled'"
              ],
              "must_not_observe": [
                "orphan rows > 0 (a leaked row)",
                "file_objects rows > 0 (orphan promoted)",
                "upload-init called for the cancelled recording"
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
      "description": "GIVEN the voice UI components exist (VoiceMicButton, VoiceSessionOverlay, VoiceAgentOrb, ...) WHEN the voice session transitions idle -> recording -> cancelled THEN all existing components render with Zero-synced state and no regressions",
      "verify": "pnpm vitest run tests/components/voice/state-machine.test.ts",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "react-native-rendering",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "stub - components not mounted per state",
            "empty - 0 components mounted",
            "static - state never transitions"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "voice_session_idle",
            "action": {
              "actor": "user",
              "steps": [
                "tap VoiceMicButton to start",
                "observe the overlay + orb",
                "speak 3s",
                "tap cancel",
                "observe idle"
              ]
            },
            "end_state": {
              "must_observe": [
                "VoiceMicButton testID 'voice-mic' in state.idle (1 node)",
                "VoiceSessionOverlay testID 'voice-overlay' mounted during recording (1 node)",
                "VoiceAgentOrb testID 'voice-orb' animating (state.recording)",
                "3 transitions logged: idle -> recording -> cancelled"
              ],
              "must_not_observe": [
                "0 voice components mounted (empty)",
                "state stuck in 'recording' after cancel",
                "broken transition (missing 'cancelled')"
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
      "description": "GIVEN the code changes are complete WHEN the developer runs typecheck, lint, and the no-convex grep THEN tsgo --noEmit exits 0, biome check exits 0, and grep finds zero convex/react imports in voice code",
      "verify": "tsgo --noEmit && biome check . && ! grep -rn 'convex/react' hooks lib/voice components/voice",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "typescript+biome+grep",
        "topology": "single-node",
        "primary": false,
        "negative_control": {
          "would_fail_if": [
            "static - type/lint errors or a convex/react import"
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
                "run tsgo --noEmit",
                "run biome check .",
                "run grep -rn 'convex/react' hooks lib/voice components/voice"
              ]
            },
            "end_state": {
              "must_observe": [
                "tsgo exit code 0",
                "biome exit code 0",
                "grep returns 0 hits (EMPTY)"
              ],
              "must_not_observe": [
                ">=1 TypeScript error (non-zero exit)",
                ">=1 biome violation",
                "a convex/react import found (grep non-empty, >=1 hit)"
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
      "description": "the dispatcher rewire removes all convex/react imports from voice code",
      "verify": "bun services/platform/src/cli/holo.ts verify:no-convex-client && ! grep -rn 'convex/react' app components hooks lib",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "voice audio uploads via the content-addressed protocol with SHA-256 verification",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/voice/audio-upload.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "a cancelled recording leaves zero orphan rows",
      "verify": "bun services/platform/src/cli/holo.ts verify:blob --orphans",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "the voice UI components render correctly per state with Zero state",
      "verify": "pnpm vitest run tests/components/voice/state-machine.test.ts",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "tsgo, biome, and the no-convex grep all pass",
      "verify": "tsgo --noEmit && biome check . && ! grep -rn 'convex/react' hooks lib/voice components/voice",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
