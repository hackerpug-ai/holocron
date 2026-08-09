# S31-FE-07 — Prove one declared offline contract behaviour end-to-end with Maestro on the simulator

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Authors a two-segment Maestro flow and an operator runbook that prove the airplane-mode-reads conjunct of UC-SYNC-01 AC-5 against genuinely stopped services, with video evidence.

## Why
UC-SYNC-01 AC-5's second conjunct names five behaviours and none has an implementation anywhere. This closes ONE of the five honestly rather than claiming all five; the other four stay recorded as risk R23.

## How to verify
`bash .maestro/reactive/run-offline-contract-airplane-reads.sh` — segment 1 with zero-cache stopped must show `research-detail-error` AND assert `research-detail-loading` is absent; segment 2 with Mastra stopped must show exactly one `chat-degraded-banner`.

## Scope
Adds one Maestro flow, one fail-closed harness, one runbook, and captured video. Changes no application code. iOS Simulator only.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-07 - Prove one declared offline contract behaviour end-to-end with Maestro on the simulator
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   180 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-SYNC-01, CAP-CUT-01
PRD_REFS:   08-uc-sync.md UC-SYNC-01 AC-5 · 01-scope.md:48 · 01-scope.md:78

RUNTIME_COMMANDS:
  test:      bash .maestro/reactive/run-offline-contract-airplane-reads.sh
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

A repeatable flow and runbook demonstrate the airplane-mode-reads conjunct against real stopped services, with the spinner explicitly excluded and the banner count checked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER introduce a testID, component, or error surface to make something assertable. If a state is not observable that is a finding to report, not a licence to add UI; assert only against research-detail-error, research-detail-loading, chat-degraded-banner and chat-input, all of which exist today.
- NEVER let the positive assertion stand alone. The load-bearing check is that `research-detail-loading` is NOT visible at the moment the error is asserted; without it the flow passes on a spinner sitting under a banner.
- NEVER let the flow silently pass on two degraded banners. Maestro's default matcher does not fail on multiple matches, so express a cardinality assertion or record an explicit operator count captured on video.
- NEVER add an Android lane, emulator, or adb invocation. 01-scope.md:48 provisions Maestro on an iOS Simulator Expo development build only.
- NEVER claim more than one conjunct. The runbook and evidence must name all five and mark exactly one proven, with the other four cited as risk R23.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] With zero-cache stopped, the flow reaches `research-detail-error` and `research-detail-loading` is absent — AC-1 (PRIMARY)
- [ ] With Mastra stopped, `chat-degraded-banner` renders and resolves to exactly 1 node — AC-2
- [ ] Against a watchdog-disabled build the flow FAILS — AC-3
- [ ] With zero-cache still up the harness exits non-zero before invoking Maestro — AC-4
- [ ] After the runbook restore both services answer and the healthy flows pass — AC-5
- [ ] The runbook names all 5 conjuncts and marks exactly 1 proven — AC-6
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Airplane-mode read shows a terminal error, not a spinner [PRIMARY]
  GIVEN: seeded Postgres, zero-cache stopped and confirmed not answering, Mastra up, a cold-launched build
  WHEN:  the operator navigates to the research list and taps a seeded session
  THEN:  the error surface renders within the deadline and the loading surface is absent

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Postgres + real Mastra on 4111 + launchd-stopped holocron-zerocache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/offline-contract-airplane-reads.yml
  TEST_FUNCTION: offline-contract-airplane-reads-segment-1

  SCENARIO:
    START_REF:        zero-down-mastra-up
    NEGATIVE_CONTROL: would fail if the app shows a static spinner forever, zero-cache is still connected, or the row is a fixture injected into the view
    EVIDENCE:         screenshot
    CASES:
      - ACTION:           seed while zero-cache is up, boot it out, confirm 4848 does not answer, launchApp clearState true, open the seeded session
        MUST_OBSERVE:     `research-detail-error` resolves to 1 node; the literal text 'Research session not found' renders 1 time
        MUST_NOT_OBSERVE: `research-detail-loading` visible 0 times at the assertion point; 0 ActivityIndicator nodes present

AC-2: The chat degraded banner renders exactly once with Mastra down
  GIVEN: zero-cache restored and healthy, Mastra stopped and confirmed refusing connections
  WHEN:  the operator opens a conversation and sends a message
  THEN:  chat-degraded-banner is visible and resolves to exactly one node

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + holocron-zerocache on 4848 + launchd-stopped holocron-mastra on 4111
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/offline-contract-airplane-reads.yml
  TEST_FUNCTION: offline-contract-airplane-reads-segment-2

AC-3: The flow fails when the app shows a spinner instead of an error
  GIVEN: a build whose watchdog is scratch-disabled so the research screen spins
  WHEN:  the flow runs with zero-cache stopped
  THEN:  the flow fails, proving the negative assertion is load-bearing

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator running a deliberately regressed Metro build
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/offline-contract-airplane-reads.yml
  TEST_FUNCTION: negative-control-watchdog-disabled

AC-4: The preflight refuses to run when zero-cache is still up
  GIVEN: the harness invoked while holocron-zerocache is deliberately left running
  WHEN:  the preflight evaluates
  THEN:  it exits non-zero before any Maestro invocation

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  the real harness script against a running holocron-zerocache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/run-offline-contract-airplane-reads.sh
  TEST_FUNCTION: preflight-fail-closed

AC-5: The runbook restores every stopped service and the stack returns to green
  GIVEN: both segments have run
  WHEN:  the operator follows the runbook restore section
  THEN:  both services answer again and the healthy-stack flows pass

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + the fully restored real stack on 4848 and 4111
  TDD_STATE:     none
  TEST_FILE:     .maestro/research/session-loads.yml
  TEST_FUNCTION: session-loads-after-restore

AC-6: The evidence states which conjunct is proven and which are not
  GIVEN: the captured video, screenshots and runbook
  WHEN:  a reviewer reads the scope section
  THEN:  exactly one of five conjuncts is claimed proven and four are marked uncovered

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  the real runbook and captured evidence artifacts in the repository tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-07-offline-contract-scope.test.ts
  TEST_FUNCTION: runbook claims exactly one conjunct

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- .maestro/reactive/offline-contract-airplane-reads.yml (NEW)
- .maestro/reactive/run-offline-contract-airplane-reads.sh (NEW)
- .spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md (NEW)
- .spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/** (NEW — video and screenshots)
- tests/integration/s31-fe-07-offline-contract-scope.test.ts (NEW)

writeProhibited:
- app/**, components/**, hooks/** — this task observes the app; it does not change it
- Any new testID anywhere
- .maestro/chat/**, .maestro/research/**, .maestro/articles/**, .maestro/subscriptions/** — existing flows are reused unchanged
- Any Android configuration, emulator script, or adb invocation
- ~/Library/LaunchAgents/** — the runbook uses bootout/bootstrap; it does not edit service definitions

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Assert by testID, never by screen coordinate — coordinates are device-profile dependent and silently flaky.
- Derive every wait timeout from ZERO_ROW_WATCHDOG_DEADLINE_MS plus a stated margin; use 0 independent numeric literals.
- Isolate one service per segment: segment 1 stops zero-cache only, segment 2 stops Mastra only.
- Reuse the Sprint 20 cold-boot launch and auth preamble rather than authoring a new one.
- Run the negative assertion at the same point as its paired positive assertion.

⚠️ Ask First:
- Recording the banner cardinality as an operator count instead of a runner assertion.
- Attempting any of the other four conjuncts.
- Changing which launchd services the runbook stops.
- Capturing evidence anywhere other than the sprint .gate-evidence path.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- .maestro/reactive/run-offline-contract-airplane-reads.sh (NEW): fail-closed preflight — blocker, the flow must not run without it
- .maestro/reactive/offline-contract-airplane-reads.yml (NEW): the two-segment flow with the load-bearing negative assertion
- .spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md (NEW): stop order, down-confirmation, restore, video capture, and the five-conjunct scope statement
- .gate-evidence/S31-FE-07-segment-1.mp4 and segment-2 screenshots (NEW): captured proof
- tests/integration/s31-fe-07-offline-contract-scope.test.ts (NEW): AC-6

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   the AC, existing flows, the READING LIST
  WRITE:  ONE flow segment or test exercising GIVEN-WHEN-THEN
  RUN:    the AC's TEST_FILE
  VERIFY: it FAILS against the pre-fix or regressed state (not errors — fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL flow/runbook content to pass
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  WRITE:  improved flow structure if needed; assertions stay green
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches react-native-ui-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. components/chat/ChatThread.tsx [PRIMARY PATTERN]
   - Lines: 434-450
   - Focus: the single surviving chat-degraded-banner after S31-FE-02 — the node segment 2 counts. Its copy comes from SURFACE_UNAVAILABLE_MESSAGE; assert that exact literal.

2. .maestro/reactive/degraded-no-hang.yml
   - Lines: 1-60, 95-160
   - Focus: the dev-client launch preamble and openLink retry ladder to reach chat-screen, and the existing degraded assertion structure segment 2 mirrors — exact message text, chat-agent-busy-false, and the stop-generating negative check.

3. .maestro/reactive/run-degraded-no-hang.sh + .maestro/reactive/run-reconnect-exactly-once.sh
   - Lines: 1-35 and 35-50
   - Focus: the fail-closed harness pattern that exits non-zero BEFORE Maestro, and the :4848/keepalive readiness check — inverted for segment 1's must-be-down preflight, used as-is for segment 2's restore gate.

4. app/(drawer)/research/[sessionId].tsx
   - Lines: 102-156
   - Focus: the two testIDs segment 1 asserts — research-detail-loading (:112) and research-detail-error (:132) — plus the 'Research session not found' text at :142-144 and research-detail-go-back at :147.

5. .spec/prds/mk6-migration/08-uc-sync.md + .spec/prds/mk6-migration/01-scope.md
   - Lines: 29, and 48 and 78
   - Focus: UC-SYNC-01 AC-5's second conjunct listing all five behaviours the runbook must name; the iOS-Simulator-only provisioning; and the reminder that offline-first operation is Out of Scope.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — the flow was watched FAIL against the regressed build (AC-3) before it went green.
Gate 2: One flow segment or test per AC.
Gate 3: bash .maestro/reactive/run-offline-contract-airplane-reads.sh exits 0 with both segments passing.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed; 0 files under app/, components/ or hooks/.
Gate 7: AC-1 (PRIMARY) is e2e against real stopped services; no PRIMARY unit test.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the captured video shows research-detail-error with research-detail-loading absent, and AC-4 proves the preflight refuses a doomed run.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- The other four UC-SYNC-01 AC-5 conjuncts: queued writes, rejection rollback, duplicate replay, concurrent-edit outcomes (risk R23)
- Any Android lane (01-scope.md:48 — iOS Simulator only)
- Any application code change; unobservable states are reported, not fixed here
- Offline-first operation without zero-cache (01-scope.md:78)

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** UC-SYNC-01 AC-5's second conjunct names five offline-contract behaviours and none has an implementation anywhere in the repository.

**Gap:** no flow proves any of them, and a naive flow asserting only the positive would pass on a spinner sitting under an error banner.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One flow segment or test per AC; assertions verify behavior not implementation
- RED evidence: the flow failed against the regressed build before passing
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — 0 new testIDs, existing surfaces only
- SCOPE respected; 0 application files modified

Should verify (<=5, judgment):
- The negative assertion runs at the same point as its paired positive assertion
- The banner cardinality claim rests on a runner assertion or a video-captured count, not on visibility alone
- The preflight genuinely refuses when zero-cache is up, evidenced by a captured non-zero exit
- Each segment isolates one service so the observed surface is attributable
- The runbook names all five conjuncts and claims exactly one

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: S31-FE-01 (terminating deadline on the chat path), S31-FE-02 (research-detail-error reachable, single banner, ZERO_ROW_WATCHDOG_DEADLINE_MS)
Blocks:     none
Parallel:   none — run after S31-FE-01 and S31-FE-02 are green

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-07",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-before-outage": {
      "description": "Real Postgres seeded through the platform CLI while zero-cache is still running so 1 research session and 1 conversation are replicated into the client-reachable state before any service is stopped",
      "seed_method": "cli",
      "records": [
        "deep_research_sessions: 1 row with topic text",
        "conversations: 1 row id=00000000-0000-4000-8000-0000000000e1",
        "seeding completed before any launchctl bootout"
      ]
    },
    "zero-down-mastra-up": {
      "description": "Segment 1 condition reached through the runbook: holocron-zerocache booted out and confirmed not answering on 4848 while Postgres and Mastra on 4111 stay up, then the app cold-launched on the iOS Simulator",
      "seed_method": "ui_flow",
      "records": [
        "curl 127.0.0.1:4848/keepalive exits non-zero",
        "curl 127.0.0.1:4111 returns ok",
        "app launched with clearState true"
      ]
    },
    "zero-up-mastra-down": {
      "description": "Segment 2 condition reached through the runbook: holocron-zerocache bootstrapped and answering on 4848, then holocron-mastra booted out and confirmed refusing connections on 4111",
      "seed_method": "ui_flow",
      "records": [
        "curl 127.0.0.1:4848/keepalive returns ok",
        "curl 127.0.0.1:4111 exits 7 connection refused",
        "1 conversation open in the app"
      ]
    },
    "watchdog-disabled-scratch-build": {
      "description": "A scratch Metro build in which useZeroRowWatchdog is edited to always return null so the research screen spins indefinitely, used as the negative control that the flow negative assertion is load-bearing, reverted with git checkout after the probe",
      "seed_method": "cli",
      "records": [
        "scratch edit applied: 1 file",
        "expected flow outcome: FAIL",
        "git checkout restores 1 file"
      ]
    },
    "harness-preflight-zero-still-up": {
      "description": "The runbook harness invoked while holocron-zerocache is deliberately left running, exercising the fail-closed preflight before any Maestro invocation",
      "seed_method": "cli",
      "records": [
        "curl 127.0.0.1:4848/keepalive returns ok",
        "expected harness exit: non-zero",
        "expected Maestro invocations: 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN zero-cache stopped and a seeded session WHEN the operator opens that session detail THEN the error surface renders within the deadline and the loading surface is gone",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Postgres + real Mastra on 4111 + launchd-stopped holocron-zerocache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the app shows a static spinner forever because the error is never representable",
            "zero-cache is still connected so nothing fails",
            "the research row is a fixture injected into the view instead of synced"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-down-mastra-up",
            "action": {
              "actor": "user",
              "steps": [
                "run pnpm seed:e2e while zero-cache is up, then launchctl bootout holocron-zerocache",
                "assert curl 127.0.0.1:4848/keepalive exits non-zero before launching",
                "start simulator video capture",
                "launchApp with clearState true using the Sprint 20 cold-boot launch preamble",
                "navigate to the research list and tapOn the seeded session row",
                "extendedWaitUntil id 'research-detail-error' visible with timeout ZERO_ROW_WATCHDOG_DEADLINE_MS plus 10000, then assertNotVisible id 'research-detail-loading'"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-error` resolves to 1 node",
                "the literal text 'Research session not found' renders 1 time",
                "`research-detail-go-back` resolves to 1 node"
              ],
              "must_not_observe": [
                "`research-detail-loading` visible 0 times at the assertion point",
                "the literal text 'Loading research session...' visible 0 times",
                "0 ActivityIndicator nodes are present at the assertion point"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN zero-cache restored and Mastra stopped WHEN the operator sends a message THEN the degraded banner renders and resolves to exactly one node",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + holocron-zerocache running on 4848 + launchd-stopped holocron-mastra on 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "2 banner nodes render because the duplicate was hidden rather than deleted",
            "Mastra is still running so nothing degrades",
            "the banner is a static shell rendered unconditionally"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-up-mastra-down",
            "action": {
              "actor": "user",
              "steps": [
                "launchctl bootstrap holocron-zerocache and poll 127.0.0.1:4848/keepalive until it returns ok",
                "launchctl bootout holocron-mastra and assert curl 127.0.0.1:4111 exits 7",
                "openLink MAESTRO_CHAT_URL for conversation 00000000-0000-4000-8000-0000000000e1",
                "tapOn id 'chat-input-field', inputText 'Offline contract probe', tapOn id 'chat-input-send-button'",
                "extendedWaitUntil id 'chat-degraded-banner' visible timeout 20000, then run the cardinality check"
              ]
            },
            "end_state": {
              "must_observe": [
                "`chat-degraded-banner` resolves to 1 node",
                "the literal text 'Local fleet unavailable — running in reduced mode' renders 1 time",
                "`chat-agent-busy-false` resolves to 1 node"
              ],
              "must_not_observe": [
                "2 or more nodes match `chat-degraded-banner`",
                "the composer stays disabled 0 seconds beyond the deadline plus 5000ms",
                "`chat-loading-inline` visible 0 times"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN a build whose watchdog is disabled so the screen spins WHEN the flow runs with zero-cache stopped THEN the flow fails proving the negative assertion is load-bearing",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator running a deliberately regressed Metro build",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the flow asserts only the positive so it passes on a static spinner sitting under a banner",
            "the flow is stubbed to always pass",
            "the regressed build is not actually rebuilt"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "watchdog-disabled-scratch-build",
            "action": {
              "actor": "system",
              "steps": [
                "scratch-edit useZeroRowWatchdog to always return null",
                "rebuild the Metro bundle with --clear",
                "run the flow with holocron-zerocache booted out and capture the exit status",
                "run git checkout on the scratch edit, rebuild and re-run"
              ]
            },
            "end_state": {
              "must_observe": [
                "the regressed run returns exit status 1, a non-zero value",
                "the failure output names 'research-detail-error' or 'research-detail-loading'",
                "the run after git checkout returns exit status 0"
              ],
              "must_not_observe": [
                "the regressed run returns exit status 0",
                "the scratch edit is committed, 0 permitted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the harness invoked while zero-cache is still running WHEN the preflight evaluates THEN it exits non-zero before invoking Maestro",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "the real harness script executed against a running holocron-zerocache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the preflight is a no-op so a doomed flow runs against a warm cache and looks like a pass",
            "the readiness check is stubbed",
            "the harness proceeds with an empty check result"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "harness-preflight-zero-still-up",
            "action": {
              "actor": "operator",
              "steps": [
                "ensure holocron-zerocache is running and 127.0.0.1:4848/keepalive returns ok",
                "run 'bash .maestro/reactive/run-offline-contract-airplane-reads.sh'",
                "capture the exit status and the full stderr output"
              ]
            },
            "end_state": {
              "must_observe": [
                "the harness returns exit status 1, a non-zero value",
                "the output names '4848' as the port still answering",
                "the output contains 0 Maestro flow invocations"
              ],
              "must_not_observe": [
                "a Maestro run starts, 0 permitted",
                "the harness returns exit status 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN both segments have run WHEN the operator follows the runbook restore section THEN both services answer again and the healthy-stack flows pass",
      "verify": "maestro test .maestro/research/session-loads.yml && maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-5",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + the fully restored real stack on 4848 and 4111",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "a service is left booted out so the stack stays degraded after the run",
            "the restore check is stubbed",
            "the healthy flows render mocked data"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-up-mastra-down",
            "action": {
              "actor": "operator",
              "steps": [
                "follow the runbook restore steps for holocron-zerocache and holocron-mastra in reverse order of stopping",
                "poll 127.0.0.1:4848/keepalive and 127.0.0.1:4111 until both answer",
                "run maestro test .maestro/research/session-loads.yml",
                "run maestro test .maestro/chat/send-streams.yml"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-view` renders the seeded topic text with >=10 characters",
                "`chat-assistant-message-latest` carries >=20 characters of live streamed reply text",
                "curl on 127.0.0.1:4848/keepalive returns ok and curl on 127.0.0.1:4111 returns exit status 0"
              ],
              "must_not_observe": [
                "`research-detail-error` visible 0 times on the restored stack",
                "`chat-degraded-banner` visible 0 times on the restored stack",
                "0 launchd services remain booted out after the runbook completes"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the captured evidence and runbook WHEN a reviewer reads the scope section THEN exactly one of the five declared conjuncts is claimed proven and four are marked uncovered",
      "verify": "grep -n 'airplane-mode reads' .spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-07-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "the real runbook and captured evidence artifacts in the repository tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the evidence claims the whole criterion is satisfied so 4 uncovered behaviours are hidden",
            "a conjunct is listed as proven with an absent artifact",
            "the scope section is omitted"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-before-outage",
            "action": {
              "actor": "system",
              "steps": [
                "read the runbook scope section and enumerate which conjuncts it names",
                "read the evidence header committed alongside the video and screenshots",
                "cross-check each claimed-proven conjunct against a captured artifact path"
              ]
            },
            "end_state": {
              "must_observe": [
                "all 5 conjuncts are named including 'queued writes' and 'duplicate replay'",
                "exactly 1 conjunct, 'airplane-mode reads', is marked proven with a pointer to the flow and the video path",
                "the remaining 4 are marked not covered citing risk R23"
              ],
              "must_not_observe": [
                "a claim that UC-SYNC-01 AC-5 is fully satisfied, 0 permitted",
                "a conjunct listed as proven with 0 captured artifacts"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "with zero-cache stopped the flow observes research-detail-error within ZERO_ROW_WATCHDOG_DEADLINE_MS plus 10000ms",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "research-detail-loading is not visible at the point research-detail-error is asserted",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "simulator video for segment 1 is written to the gate-evidence path",
      "verify": "test -e .spec/prds/mk6-migration/tasks/sprint-31-migration-integrity-remediation/.gate-evidence/S31-FE-07-segment-1.mp4",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "with Mastra stopped and zero-cache running the flow observes chat-degraded-banner",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "the chat-degraded-banner cardinality check records exactly 1 node",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "with the watchdog scratch-disabled the flow exits non-zero",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "after reverting the scratch edit the flow exits 0",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "with zero-cache still running the harness exits non-zero before invoking Maestro",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "the harness output names port 4848 as the reason for the refusal",
      "verify": "bash .maestro/reactive/run-offline-contract-airplane-reads.sh 2>&1 | grep 4848",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "after the runbook restore both 4848 keepalive and 4111 answer",
      "verify": "curl -sf 127.0.0.1:4848/keepalive && curl -sf 127.0.0.1:4111",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": ".maestro/research/session-loads.yml passes after restore",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": ".maestro/chat/send-streams.yml passes after restore",
      "verify": "maestro test .maestro/chat/send-streams.yml",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "the runbook names all 5 UC-SYNC-01 AC-5 conjuncts and marks exactly 1 proven",
      "verify": "grep -c 'airplane-mode reads' .spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "the flow and runbook reference 0 Android targets, emulators or adb invocations",
      "verify": "grep -in 'android\\|emulator\\|adb' .maestro/reactive/offline-contract-airplane-reads.yml .spec/prds/mk6-migration/runbooks/offline-contract-airplane-reads.md",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "description": "the flow asserts only against testIDs that existed before this task",
      "verify": "grep -n 'id:' .maestro/reactive/offline-contract-airplane-reads.yml",
      "maps_to_ac": "AC-2"
    }
  ]
}
-->

</details>
