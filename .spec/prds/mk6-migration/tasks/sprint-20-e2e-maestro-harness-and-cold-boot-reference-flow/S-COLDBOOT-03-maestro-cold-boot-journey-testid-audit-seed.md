# S-COLDBOOT-03 — Maestro cold-boot journey + testID audit + deterministic seed content
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: red-test-generator
> Estimate: 240 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Prove, with real fleet/Postgres/Zero/simulator services, that the Sprint 20 cold-boot reference flow delivers a genuinely synced chat reply, that its Maestro selectors are unambiguous, and that its seed/reset fixture is truly deterministic across repeated runs.

**Success state:** `scripts/e2e/run-maestro-reference-flow.sh --run` exits 0 against a real named simulator + real Expo dev build, junit.xml shows 0 failures, `chat_messages` for conversation `020` shows a fresh non-empty agent reply reachable only via Zero sync, a repeat run does not accumulate stale rows, and the four cold-boot testIDs are each singly-resolvable.

## Background

- **Specialist rationale:** Purely test-authoring work over already-committed infra (fail-closed harness, `holo namespace reset`, Zero reference-chat route) — no implementation code is missing, only the RED proof that the full cold-boot→fleet→Postgres→Zero chain and its selector/seed guarantees actually hold.
- **Planning rationale:** `.e2e/maestro/reference-flow.yaml` already exists with these exact assertions (launchApp → chat-screen → type → send → chat-assistant-message → screenshot). `testID="chat-screen"` is confirmed present in `app/(drawer)/chat/reference.tsx:84`. This task audits/locks that contract with real-service tests rather than authoring the journey from scratch.
- **How to verify (human):** Run `scripts/e2e/run-maestro-reference-flow.sh --run` twice back-to-back after a `holo namespace reset` between runs; confirm neither run leaves stale/accumulated rows and both produce a fresh agent reply.
- **Scope:** New integration/RNTL tests only (`tests/integration/sprint20-coldboot-journey.test.ts`, `tests/integration/sprint20-testid-audit.test.tsx`). Does not modify the harness script, `app/_layout.tsx`, or `services/platform/src/db/seed.ts` — a failing assertion here escalates, it is not silently patched in this task.
- **PRD refs:** UC-SYNC-01, UC-SYNC-02

## Critical Constraints

### MUST
- MUST query only the real DATABASE_URL nonprod Postgres and the real `.tmp/maestro-reference-flow/**` artifacts produced by an actual `--run` invocation — never synthesize junit.xml, screenshots, or DB rows as fixtures
- MUST assert both a fresh, non-empty agent chat_messages row AND the reset-to-zero pre-state so the test cannot be satisfied by a stale/replayed reply from a previous CI run

### NEVER
- NEVER point `holo namespace reset` / DATABASE_URL at anything other than `holocron_nonprod` — the reset TRUNCATEs every public table
- NEVER edit `scripts/e2e/run-maestro-reference-flow.sh`, `app/_layout.tsx`, or `services/platform/src/db/seed.ts` to make a test pass — a failing assertion here is signal to escalate, not a script bug to silently patch

### STRICTLY
- STRICTLY every AC's evidence artifact must be captured under the same `$E2E_ARTIFACT_DIR` / `.tmp/maestro-reference-flow` paths the CI workflow already uploads — no invented artifact locations

## Specification

**Objective:** Prove, with real fleet/Postgres/Zero/simulator services, that the Sprint 20 cold-boot reference flow delivers a genuinely synced chat reply, that its Maestro selectors are unambiguous, and that its seed/reset fixture is truly deterministic across repeated runs.

**Success state:** `scripts/e2e/run-maestro-reference-flow.sh --run` exits 0 against a real named simulator + real Expo dev build, junit.xml shows 0 failures, chat_messages for conversation 020 shows a fresh non-empty agent reply reachable only via Zero sync, a repeat run does not accumulate stale rows, and the four cold-boot testIDs are each singly-resolvable.

## Acceptance Criteria

### AC-1: Cold-boot chat round-trip proves Postgres write reaches Zero-synced RN client [PRIMARY]
**GIVEN:** conversation 020 reset to 0 messages and a real Expo dev build installed on a booted named simulator, real zero-cache running against DATABASE_URL
**WHEN:** `scripts/e2e/run-maestro-reference-flow.sh --run` executes `.e2e/maestro/reference-flow.yaml` (cold-launch, wait chat-screen, type, tap send, wait chat-assistant-message)
**THEN:** junit.xml reports 0 failures, a screenshot exists, and chat_messages holds a fresh non-empty agent reply for conversation 020 synced via Zero
**VERIFY:** `scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml && psql "$DATABASE_URL" -tAc "select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'"`
**TEST_TIER:** e2e
**VERIFICATION_SERVICE:** maestro+ios-simulator+real-fleet+postgres+zero-cache
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "e2e",
  "verification_service": "maestro+ios-simulator+real-fleet+postgres+zero-cache",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "zero-cache is disconnected from DATABASE_URL",
      "the Maestro flow launches the Expo Go tutorial screen instead of the real dev build",
      "the chat-runs processor is stubbed to return a canned finalText without calling the real fleet",
      "the assistant-reply screenshot is a static fixture not tied to a fresh run"
    ]
  },
  "evidence": { "artifact_type": "db_query", "required_capture": true },
  "cases": [
    {
      "start_ref": "reset_reference_conversation",
      "action": { "actor": "cli_user", "steps": ["run scripts/e2e/run-maestro-reference-flow.sh --run once against real simulator+fleet+postgres+zero"] },
      "end_state": {
        "must_observe": ["testsuite ... failures=\"0\" errors=\"0\" in junit.xml", "2 rows in chat_messages for conversation 00000000-0000-0000-0000-000000000020 (1 role='user', 1 role='agent')", "role='agent' row content length > 0"],
        "must_not_observe": ["failures=\"1\"", "0 rows in chat_messages for that conversation", "content=''"]
      }
    },
    {
      "start_ref": "reset_reference_conversation",
      "action": { "actor": "cli_user", "steps": ["run --run a second time immediately after a fresh holo namespace reset, back-to-back with the first run"] },
      "end_state": {
        "must_observe": ["exactly 2 chat_messages rows for conversation 020 after the second run (1 fresh user + 1 fresh agent)"],
        "must_not_observe": ["4 rows (accumulated from two runs without an effective reset)", "empty/start signature: 0 rows (reset wiped the fresh pair too)"]
      }
    }
  ]
}
```

### AC-2: testID selector audit — no ambiguous duplicates at cold boot
**GIVEN:** the reference-chat route (EXPO_PUBLIC_REFERENCE_FLOW=true) rendered as the only mounted screen under the real Expo Router Stack
**WHEN:** an RNTL render of the actual root Stack + reference screen queries for the four Maestro selectors, including after a seeded agent row renders
**THEN:** each selector resolves to exactly one element instance
**VERIFY:** `pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx -t "resolves each Maestro selector to exactly one element"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** react-native-testing-library+expo-router-stack
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "react-native-testing-library+expo-router-stack",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "ChatInput's hardcoded 'chat-input-field'/'chat-input-send-button' testIDs are duplicated by two simultaneously-mounted screens",
      "chat-assistant-message is renamed in reference.tsx without updating reference-flow.yaml"
    ]
  },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reset_reference_conversation",
      "action": { "actor": "cli_user", "steps": ["render RootLayout with the reference route active, then getAllByTestId for each of the four selectors"] },
      "end_state": {
        "must_observe": ["getAllByTestId('chat-screen').length === 1", "getAllByTestId('chat-input-field').length === 1", "getAllByTestId('chat-input-send-button').length === 1"],
        "must_not_observe": ["empty/start signature: length === 0 (selector missing/renamed)", "length > 1 (ambiguous duplicate)"]
      }
    },
    {
      "start_ref": "prior_run_two_rows",
      "action": { "actor": "cli_user", "steps": ["render the same tree once a real seeded agent row exists for conversation 020"] },
      "end_state": {
        "must_observe": ["getAllByTestId('chat-assistant-message').length === 1"],
        "must_not_observe": ["empty/start signature: length === 0", "length > 1"]
      }
    }
  ]
}
```

### AC-3: Namespace reset idempotency — deterministic seed content
**GIVEN:** conversation 020 already has 2 chat_messages rows from a real chat run
**WHEN:** `bun services/platform/src/cli/holo.ts namespace reset --json` executes
**THEN:** the response reports ok:true and chat_messages for conversation 020 immediately reads back as 0 rows
**VERIFY:** `pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t "namespace reset returns conversation 020 to a deterministic zero-message state"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo-cli+real-postgres
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo-cli+real-postgres",
  "topology": "single-node",
  "negative_control": {
    "would_fail_if": [
      "reset only truncates unrelated tables and leaves chat_messages untouched",
      "reset is a no-op that returns ok:true without truncating",
      "reset silently targets the wrong database"
    ]
  },
  "evidence": { "artifact_type": "db_query", "required_capture": true },
  "cases": [
    {
      "start_ref": "prior_run_two_rows",
      "action": { "actor": "cli_user", "steps": ["bun services/platform/src/cli/holo.ts namespace reset --json"] },
      "end_state": {
        "must_observe": ["\"ok\":true in the CLI JSON output", "chat_messages count for conversation 020 = 0 immediately after reset despite 2 pre-existing rows"],
        "must_not_observe": ["count = 2 (stale rows survived reset)", "\"ok\":false", "empty/start signature: reset returns count without truncating (0 effect)"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | junit.xml from a real --run reports testsuite failures="0" errors="0" | AC-1 | `test -s .tmp/maestro-reference-flow/junit.xml && grep -q 'failures="0"' .tmp/maestro-reference-flow/junit.xml` | happy_path |
| TC-2 | chat_messages holds exactly 1 user + 1 agent row with non-empty agent content for conversation 020 after a fresh --run | AC-1 | `psql "$DATABASE_URL" -tAc "select role, length(content) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020' order by created_at"` | happy_path |
| TC-3 | a second consecutive --run after reset does not accumulate rows beyond the fresh pair | AC-1 | `psql "$DATABASE_URL" -tAc "select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'"` | boundary |
| TC-4 | getAllByTestId('chat-input-field') returns exactly 1 element in the rendered reference-chat tree | AC-2 | `pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx -t "chat-input-field"` | happy_path |
| TC-5 | getAllByTestId('chat-assistant-message') returns exactly 1 element once a seeded agent row is present | AC-2 | `pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx -t "chat-assistant-message"` | boundary |
| TC-6 | `holo namespace reset --json` returns ok:true | AC-3 | `bun services/platform/src/cli/holo.ts namespace reset --json \| grep -q '"ok": true'` | happy_path |
| TC-7 | chat_messages count for conversation 020 is 0 immediately after reset despite pre-existing rows | AC-3 | `pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t "deterministic zero-message state"` | boundary |

## Reading List

- `scripts/e2e/run-maestro-reference-flow.sh` (1-161) — the exact fail-closed sequencing (reset → zero-cache boot → simulator install → maestro run) the new test orchestrates and observes
- `services/platform/src/http/chat-runs.ts` (158-245) — the real causal chain from POST /api/chat-runs to the chat_messages 'agent' row insert that AC-1/TC-2 query
- `services/platform/src/db/seed.ts` (40-132) — TRUNCATE...RESTART IDENTITY CASCADE reset semantics that AC-3 verifies
- `app/(drawer)/chat/reference.tsx` (1-129) — the RN screen's testID contract and Zero query wiring AC-2 inspects
- `brain/docs/kanban/SCENARIO-CONTRACT-V1.md` (1-233) — Fakeability Floor

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-coldboot-journey.test.ts (NEW) — AC-1 and AC-3
- tests/integration/sprint20-testid-audit.test.tsx (NEW) — AC-2
- .tmp/maestro-reference-flow/** (NEW, generated CI artifacts)

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — already-committed fail-closed harness; a defect found here escalates to a follow-up fix task
- services/platform/src/db/seed.ts — reset logic under test in AC-3; do not modify to force green
- app/_layout.tsx — Convex provider removal is S-COLDBOOT-01's scope

### Boundaries
- **always:** Query real Postgres and real .tmp artifacts from an actual --run, Assert both fresh non-empty rows and reset-to-zero pre-state
- **ask_first:** Any change to the harness script, seed.ts, or app/_layout.tsx suggested by a failing assertion
- **never:** Synthesizing junit.xml/screenshots/DB rows as fixtures, Pointing reset at anything but holocron_nonprod

## Design

- **references:** (none)
- **pattern:** spawnSync against the real bash harness + psql/holo CLI assertions, matching the existing sprint20-maestro-harness.test.ts convention
- **pattern_source:** tests/integration/sprint20-maestro-harness.test.ts
- **anti_pattern:** asserting on a mocked chat-runs response or a pre-recorded screenshot instead of a live --run invocation

## Agent Assignment

- **implementer:** red-test-generator — authors RED proofs over already-committed infra
- **reviewer:** mastra-reviewer — verifies real-service evidence and no stub/mocked assertions

## Verification Gates

- **Cold-boot e2e run:** `scripts/e2e/run-maestro-reference-flow.sh --run` → Exit 0; junit.xml failures="0"
- **Postgres sync proof:** `psql "$DATABASE_URL" -tAc "select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'"` → 2
- **testID uniqueness audit:** `pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx` → Exit 0
- **Namespace reset idempotency:** `pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t "deterministic zero-message state"` → Exit 0
- **Typecheck:** `pnpm tsgo --noEmit` → Exit 0

## Coding Standards

- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/TESTING-HIERARCHY.md
- brain/docs/RED-FIRST-TEST-GATE.md

## Dependencies

- **depends_on:** —
- **blocks:** D03-01

## Notes

Existing evidence at planning time: `.tmp/maestro-reference-flow-official11/junit.xml` already shows a real SUCCESS run (iPhone 17, iOS 26.5, 28s) from prior local testing. This task's job is to lock that behavior into a standing, repeatable test suite (not a one-off manual run) and to prove idempotency/testID stability across repeated runs.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S-COLDBOOT-03",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "reset_reference_conversation": {
      "description": "conversation 00000000-0000-0000-0000-000000000020 truncated to 0 chat_messages rows by holo namespace reset, conversations row re-seeded with title 'Sprint 20 reference conversation'",
      "seed_method": "cli",
      "records": [
        "conversations: id=00000000-0000-0000-0000-000000000020, title='Sprint 20 reference conversation'",
        "chat_messages: 0 rows where conversation_id='00000000-0000-0000-0000-000000000020'"
      ]
    },
    "expo_dev_build_installed": {
      "description": "a real Expo development build installed via xcrun simctl install on the named MAESTRO_DEVICE simulator from EXPO_DEV_BUILD_PATH",
      "seed_method": "cli",
      "records": [
        "xcrun simctl list devices available includes MAESTRO_DEVICE booted",
        "app bundle at EXPO_DEV_BUILD_PATH installed under MAESTRO_APP_ID"
      ]
    },
    "prior_run_two_rows": {
      "description": "conversation 020 pre-populated with 1 user + 1 agent chat_messages row from a real prior POST /api/chat-runs, before a second holo namespace reset is issued",
      "seed_method": "public_api",
      "records": [
        "POST /api/chat-runs {conversationId:'00000000-0000-0000-0000-000000000020', msg:'seed row'} completed, producing 2 chat_messages rows"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN reset conversation 020 and an installed real Expo dev build WHEN scripts/e2e/run-maestro-reference-flow.sh --run executes THEN junit.xml is 0-failure and chat_messages shows a fresh Zero-synced agent reply",
      "verify": "scripts/e2e/run-maestro-reference-flow.sh --run && test -s .tmp/maestro-reference-flow/junit.xml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "maestro+ios-simulator+real-fleet+postgres+zero-cache",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "zero-cache is disconnected from DATABASE_URL",
            "the Maestro flow launches the Expo Go tutorial screen instead of the real dev build",
            "the chat-runs processor is stubbed to return a canned finalText without calling the real fleet",
            "the assistant-reply screenshot is a static fixture not tied to a fresh run"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reset_reference_conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run scripts/e2e/run-maestro-reference-flow.sh --run once against real simulator+fleet+postgres+zero"
              ]
            },
            "end_state": {
              "must_observe": [
                "testsuite ... failures=\"0\" errors=\"0\" in junit.xml",
                "2 rows in chat_messages for conversation 00000000-0000-0000-0000-000000000020 (1 role='user', 1 role='agent')",
                "role='agent' row content length > 0"
              ],
              "must_not_observe": [
                "failures=\"1\"",
                "0 rows in chat_messages for that conversation",
                "content=''"
              ]
            }
          },
          {
            "start_ref": "reset_reference_conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run --run a second time immediately after a fresh holo namespace reset, back-to-back with the first run"
              ]
            },
            "end_state": {
              "must_observe": [
                "exactly 2 chat_messages rows for conversation 020 after the second run (1 fresh user + 1 fresh agent)"
              ],
              "must_not_observe": [
                "4 rows (accumulated from two runs without an effective reset)",
                "empty/start signature: 0 rows (reset wiped the fresh pair too)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the reference-chat route rendered alone WHEN the four Maestro testID selectors are queried THEN each resolves to exactly one element",
      "verify": "pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "react-native-testing-library+expo-router-stack",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "ChatInput's hardcoded 'chat-input-field'/'chat-input-send-button' testIDs are duplicated by two simultaneously-mounted screens",
            "chat-assistant-message is renamed in reference.tsx without updating reference-flow.yaml"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reset_reference_conversation",
            "action": {
              "actor": "cli_user",
              "steps": [
                "render RootLayout with the reference route active, then getAllByTestId for each of the four selectors"
              ]
            },
            "end_state": {
              "must_observe": [
                "getAllByTestId('chat-screen').length === 1",
                "getAllByTestId('chat-input-field').length === 1",
                "getAllByTestId('chat-input-send-button').length === 1"
              ],
              "must_not_observe": [
                "empty/start signature: length === 0 (selector missing/renamed)",
                "length > 1 (ambiguous duplicate)"
              ]
            }
          },
          {
            "start_ref": "prior_run_two_rows",
            "action": {
              "actor": "cli_user",
              "steps": [
                "render the same tree once a real seeded agent row exists for conversation 020"
              ]
            },
            "end_state": {
              "must_observe": [
                "getAllByTestId('chat-assistant-message').length === 1"
              ],
              "must_not_observe": [
                "empty/start signature: length === 0",
                "length > 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN conversation 020 pre-populated with 2 rows WHEN holo namespace reset --json runs THEN chat_messages reads back 0 rows and ok:true",
      "verify": "bun services/platform/src/cli/holo.ts namespace reset --json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli+real-postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "reset only truncates unrelated tables and leaves chat_messages untouched",
            "reset is a no-op that returns ok:true without truncating",
            "reset silently targets the wrong database"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "prior_run_two_rows",
            "action": {
              "actor": "cli_user",
              "steps": [
                "bun services/platform/src/cli/holo.ts namespace reset --json"
              ]
            },
            "end_state": {
              "must_observe": [
                "\"ok\":true in the CLI JSON output",
                "chat_messages count for conversation 020 = 0 immediately after reset despite 2 pre-existing rows"
              ],
              "must_not_observe": [
                "count = 2 (stale rows survived reset)",
                "\"ok\":false",
                "empty/start signature: reset returns count without truncating (0 effect)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "junit.xml reports failures=\"0\"",
      "verify": "grep -q 'failures=\"0\"' .tmp/maestro-reference-flow/junit.xml",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "chat_messages holds 1 user + 1 non-empty agent row",
      "verify": "psql \"$DATABASE_URL\" -tAc \"select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "a repeat --run does not accumulate stale rows",
      "verify": "psql \"$DATABASE_URL\" -tAc \"select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "chat-input-field resolves singly",
      "verify": "pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx -t \"chat-input-field\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "chat-assistant-message resolves singly once a reply exists",
      "verify": "pnpm exec vitest run tests/integration/sprint20-testid-audit.test.tsx -t \"chat-assistant-message\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "namespace reset returns ok:true",
      "verify": "bun services/platform/src/cli/holo.ts namespace reset --json | grep -q '\"ok\": true'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "namespace reset zeroes chat_messages for conversation 020",
      "verify": "pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t \"deterministic zero-message state\"",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
