# S31-FE-02 — Make an error representable in the Zero-backed hooks; collapse the duplicate degraded banner

**PROPOSED-BY:** react-native-ui-planner · **Sprint:** sprint-31-migration-integrity-remediation · **Template:** TASK-TEMPLATE v5.2

## What this does
Makes `error` capable of being non-null in the three Zero-backed hooks via one shared watchdog, so the error branches that already exist actually render when zero-cache is down — and deletes the duplicate degraded banner.

## Why
This is the client half of the sprint gate. `hooks/useResearchProgress.ts:89`, `hooks/useResearchSession.ts:129` and `hooks/use-chat-history.ts:97` all hardcode `error: null`, so with zero-cache down the app spins forever. The error UI already exists at `app/(drawer)/research/[sessionId].tsx:122` — only the data layer is missing.

## How to verify
With `holocron-zerocache` booted out, `bash .maestro/reactive/run-zero-down-terminal-error.sh` shows `research-detail-error` and asserts `research-detail-loading` is gone. With zero-cache up and a cold launch, `.maestro/research/session-loads.yml` must still pass — the R39 false-positive control.

## Scope
Touches the three hooks, one new shared watchdog hook, `ChatThread.tsx`, and the chat screen's duplicate banner. `app/(drawer)/research/[sessionId].tsx` is deliberately NOT modified.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-FE-02 - Make an error representable in the Zero-backed hooks; collapse the duplicate degraded banner
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=react-native-ui-implementer | reviewer=react-native-ui-reviewer
PROPOSED-BY: react-native-ui-planner
ESTIMATE:   240 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-SYNC-01
PRD_REFS:   08-uc-sync.md UC-SYNC-01 AC-5 · 08-uc-sync.md UC-SYNC-02 AC-1 · 01-scope.md:78 · 01-scope.md:79

RUNTIME_COMMANDS:
  test:      pnpm test:unit ; PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/6 ACs complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

With zero-cache down the research and chat surfaces reach a terminal error through their existing branches, and exactly one degraded banner exists in the tree.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER create a new error component, illustration, retry affordance, spinner, countdown, or iconography. 01-scope.md:79 excludes error-state and connectivity UX design; reuse the EXISTING research-detail-error branch and the banner at components/chat/ChatThread.tsx:434-450.
- NEVER ship a watchdog deadline below 15000ms, and never conclude without confirming on a cold-launched simulator against a healthy zero-cache that the error does NOT fire. A false positive on a healthy slow sync (RISK R39) is a worse regression than the current spinner.
- NEVER fire the watchdog while the query is disabled or the id is null — useResearchProgress.ts:58 and use-chat-history.ts:61 mean "not asked", which is not an error.
- NEVER hide the screen-level banner behind a conditional instead of deleting it. app/(drawer)/chat/[conversationId].tsx:971-983 must be REMOVED so two nodes can never coexist; diff both copies first so the survivor carries the union of information.
- NEVER inline the error copy at a call site; it is an exported constant following the SURFACE_UNAVAILABLE_MESSAGE precedent at hooks/use-resumable-sse-stream.ts:158.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] With zero-cache stopped, `research-detail-error` renders and `research-detail-loading` is gone — AC-1 (PRIMARY)
- [ ] With zero-cache stopped, the chat error branch renders and `chat-loading-inline` is gone — AC-2
- [ ] With zero-cache healthy and a cold launch, the watchdog does NOT fire — AC-3 (R39 control)
- [ ] `chat-degraded-banner` resolves to exactly 1 node in the degraded state — AC-4
- [ ] useZeroRowWatchdog returns an Error only for enabled-and-still-undefined — AC-5
- [ ] pnpm test:unit + PLATFORM_IT=1 pnpm test:integration pass; pnpm tsgo --noEmit and pnpm biome check . clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Research detail reaches a terminal error when zero-cache is down [PRIMARY]
  GIVEN: zero-cache stopped and confirmed not answering on 4848, Postgres and Mastra up, a seeded session
  WHEN:  the operator cold-launches and opens that session detail
  THEN:  research-detail-error renders and research-detail-loading is not visible

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Postgres + real Mastra + launchd-stopped holocron-zerocache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/zero-down-terminal-error.yml
  TEST_FUNCTION: zero-down-terminal-error

  SCENARIO:
    START_REF:        zero-cache-stopped
    NEGATIVE_CONTROL: would fail if the hardcoded error null is left so the screen spins, zero-cache is still connected, or the branch is a static shell
    EVIDENCE:         screenshot
    CASES:
      - ACTION:           seed while zero-cache is up, boot it out, launchApp clearState true, openLink the seeded session, wait for research-detail-error
        MUST_OBSERVE:     `research-detail-error` resolves to 1 node; the literal text 'Research session not found' renders 1 time
        MUST_NOT_OBSERVE: `research-detail-loading` visible 0 times; 0 ActivityIndicator nodes present at the assertion point

AC-2: Chat thread reaches a terminal error instead of an indefinite inline spinner
  GIVEN: zero-cache stopped and a seeded conversation with durable rows
  WHEN:  the operator opens that conversation
  THEN:  the ChatThread error branch renders the existing banner and chat-loading-inline is gone

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + launchd-stopped holocron-zerocache on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/reactive/zero-down-terminal-error.yml
  TEST_FUNCTION: zero-down-terminal-error-chat

AC-3: R39 control — a healthy slow cold sync produces no false error
  GIVEN: zero-cache healthy on 4848 and the app cold-launched with a cleared cache
  WHEN:  the operator opens the seeded session immediately
  THEN:  research-detail-view renders and research-detail-error is never shown

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Postgres + holocron-zerocache running on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/research/session-loads.yml
  TEST_FUNCTION: session-loads

AC-4: Exactly one chat-degraded-banner node exists in the degraded state
  GIVEN: the chat screen degraded after the screen-level banner is deleted
  WHEN:  the tree is queried for chat-degraded-banner
  THEN:  exactly one node matches

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  vitest integration lane PLATFORM_IT=1 rendering the real chat component tree
  TDD_STATE:     none
  TEST_FILE:     tests/integration/s31-fe-02-zero-error-representable.test.ts
  TEST_FUNCTION: exactly one degraded banner

AC-5: The shared watchdog fires only on enabled-and-still-undefined
  GIVEN: the watchdog exercised over its four input combinations with fake timers
  WHEN:  time advances past ZERO_ROW_WATCHDOG_DEADLINE_MS
  THEN:  it returns an Error only for enabled-and-still-undefined

  TEST_TIER:             unit — UNIT_TEST_JUSTIFIED: a pure timer-over-inputs reducer with 0 I/O; its integration with real Zero is covered by AC-1, AC-2 and AC-3
  VERIFICATION_SERVICE:  null (pure logic)
  TDD_STATE:     none
  TEST_FILE:     tests/unit/use-zero-row-watchdog.test.ts
  TEST_FUNCTION: useZeroRowWatchdog

AC-6: Happy path — healthy zero-cache leaves all three hooks with error null
  GIVEN: a healthy seeded stack with a warm cache
  WHEN:  the operator opens the research session and a chat conversation
  THEN:  both render normal content and no error surface appears

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  maestro-ios-simulator + real Postgres + holocron-zerocache running on 4848
  TDD_STATE:     none
  TEST_FILE:     .maestro/chat/thread-loads.yml
  TEST_FUNCTION: thread-loads

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- hooks/use-zero-row-watchdog.ts (NEW)
- hooks/useResearchProgress.ts (MODIFY)
- hooks/useResearchSession.ts (MODIFY)
- hooks/use-chat-history.ts (MODIFY)
- components/chat/ChatThread.tsx (MODIFY)
- app/(drawer)/chat/[conversationId].tsx (MODIFY — delete :971-983 and pass the phase signal down)
- .maestro/reactive/zero-down-terminal-error.yml (NEW)
- .maestro/reactive/run-zero-down-terminal-error.sh (NEW)
- tests/unit/use-zero-row-watchdog.test.ts (NEW)
- tests/integration/s31-fe-02-zero-error-representable.test.ts (NEW)

writeProhibited:
- app/(drawer)/research/[sessionId].tsx — its error branch already exists and must stay exactly as-is; that is the proof this is a hook change, not a UI change
- components/ui/** — no new or modified primitives
- app/zero/schema.ts, app/zero/queries.ts — no schema or query change
- services/platform/** — no server-side change
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First)
--------------------------------------------------------------------------------

✅ Always:
- Extract ONE shared hooks/use-zero-row-watchdog.ts and wire it into all three hooks (Rule of 2 — three call sites).
- Keep the deadline as a named exported constant importable by tests.
- Reuse the existing banner presentation verbatim for the ChatThread error branch.
- Clear the watchdog timer on unmount and on every dependency change.
- Use ScreenLayout's existing `edges` prop for safe areas; never hand-roll a View or add SafeAreaView.

⚠️ Ask First:
- Changing the ZERO_ROW_WATCHDOG_DEADLINE_MS value below 15000 or above 45000.
- Changing any existing testID name or the wording of the surviving banner copy.
- Adding a new npm dependency.
- Altering the composer/insets wrapper at app/(drawer)/chat/[conversationId].tsx:970.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- hooks/use-zero-row-watchdog.ts (NEW): useZeroRowWatchdog, ZERO_ROW_WATCHDOG_DEADLINE_MS, ZERO_ROW_WATCHDOG_MESSAGE — blocker file, the other three hooks import it
- hooks/useResearchProgress.ts, hooks/useResearchSession.ts, hooks/use-chat-history.ts (MODIFY): hardcoded `error: null` replaced with the watchdog result
- components/chat/ChatThread.tsx (MODIFY): error branch beside chat-loading-inline; sole owner of chat-degraded-banner
- app/(drawer)/chat/[conversationId].tsx (MODIFY): duplicate banner at :971-983 deleted, phase signal passed as a prop
- tests/unit/use-zero-row-watchdog.test.ts + tests/integration/s31-fe-02-zero-error-representable.test.ts (NEW)

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

## FOR EACH ACCEPTANCE CRITERION:

### RED PHASE
  READ:   the AC, existing tests, the READING LIST
  WRITE:  ONE test exercising GIVEN-WHEN-THEN
  RUN:    the AC's TEST_FILE
  VERIFY: the test FAILS (not errors — fails)
  RETURN: { phase: "RED", test_file, test_function, failure_output }

### GREEN PHASE (after orchestrator VERIFY_RED passes)
  WRITE:  MINIMAL code to pass
  VERIFY: the test PASSES
  RETURN: { phase: "GREEN", files_changed, test_output }

### REFACTOR PHASE (after orchestrator VERIFY_GREEN passes)
  WRITE:  improved code if needed; tests stay green
  RETURN: { phase: "REFACTOR", files_changed, still_passing }

## AFTER ALL ACs COMPLETE:
  Orchestrator dispatches react-native-ui-reviewer.

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. components/chat/ChatThread.tsx [PRIMARY PATTERN]
   - Lines: 380-462
   - Focus: chat-loading-inline at :382-391 (where the error branch goes) and the canonical banner at :434-450 — warning tokens, accessibilityRole='alert', chat-degraded-message inside, deliberately NO ActivityIndicator (the reconnecting indicator at :451-462 is the one that legitimately has one).

2. app/(drawer)/research/[sessionId].tsx
   - Lines: 73-156
   - Focus: THE ERROR UI ALREADY EXISTS. :78 destructures error; :102 is the loading branch; :122 is `if (error || !viewData)` rendering research-detail-error with a Go Back button at :145-152. Build nothing here — read it to confirm the fix belongs in the hooks.

3. hooks/useResearchProgress.ts + hooks/useResearchSession.ts + hooks/use-chat-history.ts
   - Lines: 38-91, 120-140, 55-99
   - Focus: the three hardcoded error values at :89, :129 and :97; the `enabled` flag at :58 and the undefined-query case at :61 that mean "not asked" and must never trip the watchdog.

4. app/(drawer)/chat/[conversationId].tsx
   - Lines: 960-1000
   - Focus: the duplicate banner to DELETE at :971-983 — differing classNames (border-t border-warning/30 px-4 py-2, no Text variant) sitting inside the insets.bottom wrapper at :970 alongside error-banner and the composer. Diff against the ChatThread copy before deleting.

5. .maestro/reactive/run-reconnect-exactly-once.sh + .maestro/research/session-loads.yml
   - Lines: 35-50 and 1-55
   - Focus: the :4848/keepalive readiness check to invert for the fail-closed outage preflight; the research deep-link flow reused unchanged as the R39 control.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: RED evidence — TDD_STATE shows each test went red before green.
Gate 2: One test per AC.
Gate 3: pnpm test:unit and PLATFORM_IT=1 pnpm test:integration exit 0.
Gate 4: pnpm tsgo --noEmit exits 0.
Gate 5: pnpm biome check . exits 0.
Gate 6: git diff --name-only ⊆ SCOPE.writeAllowed.
Gate 7: AC-1 is e2e; AC-5 is the only unit AC and carries UNIT_TEST_JUSTIFIED.
Gate 8: validate_scenario.py exits 0 on the PRIMARY scenario; the AC-1 screenshot shows research-detail-error with research-detail-loading absent, and AC-1 was watched FAIL against the pre-fix build (which spins forever) before it went green.

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Any new error component, illustration, or retry affordance (01-scope.md:79)
- Offline-first operation without zero-cache (01-scope.md:78 — the deliverable is a representable terminal error, not continued operation)
- Editing app/(drawer)/research/[sessionId].tsx — its branch already works
- Chat-path request deadlines — S31-FE-01 owns those

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** three Zero-backed hooks hardcode `error: null`, so with zero-cache down the row stays undefined and research-detail-loading / chat-loading-inline render indefinitely; two components render testID chat-degraded-banner simultaneously.

**Gap:** an error is not representable in the data layer, so the error branch that already exists at app/(drawer)/research/[sessionId].tsx:122 can never open.

--------------------------------------------------------------------------------
REVIEW (for react-native-ui-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; tests verify behavior not implementation
- RED evidence present in TDD_STATE history
- Minimal implementation; no gold-plating
- Pattern consistent with READING LIST [PRIMARY PATTERN] — 0 new error components, 0 new testIDs
- SCOPE respected; app/(drawer)/research/[sessionId].tsx unmodified

Should verify (<=5, judgment):
- The R39 control (AC-3) was actually run on a cold-launched simulator at the shipped deadline value
- One shared watchdog serves all three hooks; 0 per-hook copies of the timer logic
- The screen-level banner is deleted, not conditionally hidden
- The surviving banner carries the union of information from both prior copies
- The composer remains reachable with the keyboard raised after the banner moves

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     S31-FE-07 (supplies research-detail-error, the single banner, and ZERO_ROW_WATCHDOG_DEADLINE_MS)
Parallel:   S31-FE-01, S31-FE-04, S31-FE-05, S31-FE-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-FE-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "seeded-research-session": {
      "description": "Real Postgres seeded through the platform CLI while zero-cache is running; 1 deep research session row with iterations replicated over zero-cache and reachable at MAESTRO_RESEARCH_SESSION_URL",
      "seed_method": "cli",
      "records": [
        "deep_research_sessions: 1 row with topic text",
        "research_iterations: >=2 rows",
        "documentId: null so the detail screen does not redirect"
      ]
    },
    "zero-cache-stopped": {
      "description": "holocron-zerocache booted out via launchctl after seeding; port 4848 keepalive does not answer while Postgres and Mastra stay up",
      "seed_method": "cli",
      "records": [
        "curl 127.0.0.1:4848/keepalive exits non-zero",
        "postgres up: 1",
        "mastra on 4111: ok"
      ]
    },
    "zero-cache-warm-cold-app": {
      "description": "holocron-zerocache bootstrapped and answering on 4848, then the app relaunched with clearState true so the client Zero cache holds 0 rows at launch",
      "seed_method": "ui_flow",
      "records": [
        "curl 127.0.0.1:4848/keepalive returns ok",
        "app local cache rows at launch: 0",
        "watchdog constant left at its shipped value"
      ]
    },
    "seeded-chat-conversation-degraded": {
      "description": "Real seeded conversation rendered with the stream controller driven into the degraded phase by enterDegradedFromEnvelope with a real ROLE_UNAVAILABLE failure envelope",
      "seed_method": "cli",
      "records": [
        "conversations: 1 row id=00000000-0000-4000-8000-0000000000e1",
        "envelope code: 'ROLE_UNAVAILABLE'",
        "resulting phase: 'degraded'"
      ]
    },
    "watchdog-timer-fixture": {
      "description": "Checked-in fixture inputs in tests/unit/use-zero-row-watchdog.test.ts covering the 4 combinations of row undefined-or-defined against enabled true-or-false, driven with vitest fake timers and 0 network calls",
      "seed_method": "migration_fixture",
      "records": [
        "case 1: row undefined, enabled true",
        "case 2: row undefined, enabled false",
        "case 3: row defined, enabled true",
        "case 4: row undefined then defined at 60% of the deadline"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN zero-cache stopped and a seeded research session in Postgres WHEN the operator opens that session detail THEN the existing research-detail-error renders and research-detail-loading is gone",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-1",
        "primary": true,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Postgres + real Mastra + launchd-stopped holocron-zerocache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the hardcoded error null is left in place so the screen spins forever",
            "zero-cache is still connected so nothing fails",
            "the error branch is a static shell rendered unconditionally"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-cache-stopped",
            "action": {
              "actor": "user",
              "steps": [
                "run pnpm seed:e2e while zero-cache is up, then launchctl bootout holocron-zerocache",
                "assert curl 127.0.0.1:4848/keepalive exits non-zero before launching",
                "launchApp with clearState true on the named iOS Simulator",
                "openLink MAESTRO_RESEARCH_SESSION_URL for the seeded session",
                "extendedWaitUntil id 'research-detail-error' visible with timeout ZERO_ROW_WATCHDOG_DEADLINE_MS plus 10000"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-error` resolves to 1 node",
                "literal text 'Research session not found' rendered 1 time",
                "`research-detail-go-back` resolves to 1 node and accepts a tap"
              ],
              "must_not_observe": [
                "`research-detail-loading` visible 0 times at the assertion point",
                "literal text 'Loading research session...' visible 0 times",
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
      "description": "GIVEN zero-cache stopped and a seeded conversation WHEN the operator opens that conversation THEN the ChatThread error branch renders the existing degraded banner and chat-loading-inline is gone",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-2",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + launchd-stopped holocron-zerocache on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "use-chat-history keeps its hardcoded error null so the spinner is static forever",
            "zero-cache is disconnected but the thread renders mocked rows",
            "the banner is a stub"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-cache-stopped",
            "action": {
              "actor": "user",
              "steps": [
                "with holocron-zerocache booted out, launchApp with clearState true",
                "openLink MAESTRO_CHAT_URL for conversation 00000000-0000-4000-8000-0000000000e1",
                "extendedWaitUntil id 'chat-degraded-banner' visible with timeout ZERO_ROW_WATCHDOG_DEADLINE_MS plus 10000"
              ]
            },
            "end_state": {
              "must_observe": [
                "`chat-degraded-banner` resolves to 1 node",
                "`chat-degraded-message` renders the exported constant text verbatim, >=20 characters"
              ],
              "must_not_observe": [
                "`chat-loading-inline` visible 0 times once the error branch renders",
                "0 testIDs absent from the pre-task codebase are introduced"
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
      "description": "GIVEN zero-cache healthy and the app cold-launched with a cleared cache WHEN the operator opens the seeded session immediately THEN the watchdog does not fire and the detail view renders",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-3",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Postgres + holocron-zerocache running on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the deadline is set below the real cold-sync latency so a healthy sync is wrongly reported broken",
            "the session row is a fixture row injected into the view instead of synced",
            "the detail view is a static shell"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "zero-cache-warm-cold-app",
            "action": {
              "actor": "user",
              "steps": [
                "launchctl bootstrap holocron-zerocache and poll 127.0.0.1:4848/keepalive until it returns ok",
                "launchApp with clearState true so the client cache holds 0 rows",
                "openLink MAESTRO_RESEARCH_SESSION_URL immediately after launch",
                "extendedWaitUntil id 'research-detail-view' visible timeout 90000",
                "run at the shipped ZERO_ROW_WATCHDOG_DEADLINE_MS value with no test override"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-view` resolves to 1 node",
                "the seeded session topic text renders with >=10 characters",
                "the seeded session iteration count renders as a value >=2"
              ],
              "must_not_observe": [
                "`research-detail-error` visible 0 times during the run",
                "literal text 'Research session not found' visible 0 times"
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
      "description": "GIVEN the chat screen in the degraded phase after the screen-level banner is deleted WHEN the rendered tree is queried for chat-degraded-banner THEN exactly one node matches",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'exactly one degraded banner'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-4",
        "primary": false,
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest integration lane PLATFORM_IT=1 rendering the real chat component tree",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the screen-level copy is hidden by a conditional rather than deleted so 2 nodes remain reachable",
            "the phase is set by direct state assignment instead of a real envelope",
            "the banner is stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-chat-conversation-degraded",
            "action": {
              "actor": "system",
              "steps": [
                "render the chat screen tree for conversation 00000000-0000-4000-8000-0000000000e1",
                "drive the controller into degraded via enterDegradedFromEnvelope with code 'ROLE_UNAVAILABLE'",
                "query getAllByTestId('chat-degraded-banner') and getAllByTestId('chat-degraded-message')",
                "read the surviving node accessibilityRole and accessibilityLabel"
              ]
            },
            "end_state": {
              "must_observe": [
                "getAllByTestId('chat-degraded-banner').length == 1",
                "getAllByTestId('chat-degraded-message').length == 1",
                "the surviving node accessibilityRole == 'alert'"
              ],
              "must_not_observe": [
                "2 or more nodes match `chat-degraded-banner`",
                "0 nodes match `chat-degraded-banner` while the phase is degraded"
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
      "description": "GIVEN the shared watchdog exercised over its four input combinations WHEN time advances past the deadline THEN it returns an Error only for enabled-and-still-undefined",
      "verify": "pnpm test:unit -t 'useZeroRowWatchdog'",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-5",
        "primary": false,
        "tier": "logic",
        "test_tier": "unit",
        "verification_service": null,
        "topology": "single-node",
        "unit_test_justified": true,
        "negative_control": {
          "would_fail_if": [
            "the watchdog is a no-op that always returns null",
            "the timer is stubbed so no deadline elapses",
            "the return value is hardcoded"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "watchdog-timer-fixture",
            "action": {
              "actor": "system",
              "steps": [
                "renderHook(() => useZeroRowWatchdog(undefined, true)) and advance fake timers past ZERO_ROW_WATCHDOG_DEADLINE_MS",
                "renderHook(() => useZeroRowWatchdog(undefined, false)) and advance the same amount",
                "renderHook with a defined row from the start and advance the same amount",
                "renderHook with row undefined, rerender with a defined row at 60% of the deadline, then advance past it",
                "unmount every hook and assert the pending timer count"
              ]
            },
            "end_state": {
              "must_observe": [
                "case 1 returns an Error whose message == the exported ZERO_ROW_WATCHDOG_MESSAGE constant",
                "case 2 returns null and case 3 returns null",
                "case 4 returns null after 1 rerender with a defined row"
              ],
              "must_not_observe": [
                "an Error is returned in cases 2, 3, and 4 a total of 0 times",
                "0 timers remain pending after unmount"
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
      "description": "GIVEN a healthy seeded stack with a warm cache WHEN the operator opens the research session and a chat conversation THEN every surface renders normal content and no error surface appears",
      "verify": "maestro test .maestro/chat/thread-loads.yml",
      "maps_to_ac": null,
      "scenario": {
        "id": "S31-FE-02-AC-6",
        "primary": false,
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro-ios-simulator + real Postgres + holocron-zerocache running on 4848",
        "topology": "single-node",
        "unit_test_justified": false,
        "negative_control": {
          "would_fail_if": [
            "the watchdog fires on a healthy stack so the happy path regresses",
            "the thread renders mocked rows while zero-cache is disconnected",
            "the surfaces are static shells"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded-research-session",
            "action": {
              "actor": "user",
              "steps": [
                "with the full stack healthy, launchApp on the named iOS Simulator",
                "openLink MAESTRO_RESEARCH_SESSION_URL and wait for id 'research-detail-view'",
                "openLink MAESTRO_CHAT_URL and wait for the durable message list to render"
              ]
            },
            "end_state": {
              "must_observe": [
                "`research-detail-view` renders the seeded topic text with >=10 characters",
                "the seeded conversation durable message content renders in `chat-thread` with >=2 bubbles"
              ],
              "must_not_observe": [
                "`research-detail-error` visible 0 times",
                "`chat-degraded-banner` visible 0 times",
                "`chat-loading-inline` visible 0 times after the thread renders"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "research-detail-error becomes visible within ZERO_ROW_WATCHDOG_DEADLINE_MS plus 10000ms with zero-cache stopped",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "research-detail-loading is not visible when research-detail-error is asserted",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "chat-degraded-banner becomes visible on the chat screen with zero-cache stopped",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "chat-loading-inline is not visible once the chat error branch renders",
      "verify": "bash .maestro/reactive/run-zero-down-terminal-error.sh",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "research-detail-view becomes visible and research-detail-error never appears with zero-cache running and clearState true",
      "verify": "maestro test .maestro/research/session-loads.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "ZERO_ROW_WATCHDOG_DEADLINE_MS is greater than or equal to 15000",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'watchdog deadline floor'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "rendering the chat screen in degraded yields exactly 1 node with testID chat-degraded-banner",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'exactly one degraded banner'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "app/(drawer)/chat/[conversationId].tsx contains 0 occurrences of testID chat-degraded-banner",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'screen no longer owns the banner'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "useZeroRowWatchdog(undefined, true) returns a non-null Error after the deadline",
      "verify": "pnpm test:unit -t 'useZeroRowWatchdog fires on enabled and undefined'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "useZeroRowWatchdog(undefined, false) returns null after the deadline",
      "verify": "pnpm test:unit -t 'useZeroRowWatchdog stays null when disabled'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "useZeroRowWatchdog returns null when the row becomes defined before the deadline",
      "verify": "pnpm test:unit -t 'useZeroRowWatchdog cancels on row arrival'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": ".maestro/chat/thread-loads.yml passes unchanged against the healthy stack",
      "verify": "maestro test .maestro/chat/thread-loads.yml",
      "maps_to_ac": "AC-6"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "description": "all 3 Zero-backed hooks import useZeroRowWatchdog and 0 of them return a hardcoded null error literal",
      "verify": "PLATFORM_IT=1 pnpm test:integration -t 'all three hooks wire the shared watchdog'",
      "maps_to_ac": "AC-5"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "description": "pnpm biome check . exits 0 and pnpm tsgo --noEmit exits 0",
      "verify": "pnpm biome check . && pnpm tsgo --noEmit",
      "maps_to_ac": "AC-6"
    }
  ]
}
-->

</details>
