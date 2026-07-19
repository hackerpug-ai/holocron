# REDHAT-FIX-H6 — Add and run the required testID uniqueness audit for the reference chat flow
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: react-native-ui-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H6 (High)

## Outcome

`tests/integration/sprint20-testid-audit.test.tsx` exists, runs under `COLDBOOT_IT=1`, and proves that each of the four Maestro selectors used by `.e2e/maestro/reference-flow.yaml` (`chat-screen`, `chat-input-field`, `chat-input-send-button`, `chat-assistant-message`) resolves to exactly one element when the reference-chat route is rendered through the real Expo Router Stack — including the seeded-agent-row case where `chat-assistant-message` is material (rendered per agent row at `app/(drawer)/chat/reference.tsx:102`), not optional. A RED-then-GREEN comparison against a deliberately weakened fixture (duplicate testID) proves the audit catches the regression.

**Success state:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx` passes; each of the four selectors resolves to length === 1, including `chat-assistant-message` once a seeded agent row exists; running the audit against `tests/integration/fixtures/reference-chat.duplicated-testids.tsx` (a fixture that mounts two `chat-assistant-message` testIDs) fails RED with a message naming the duplicate.

## Background

- **Specialist rationale:** Red-hat H6 (High) shows `S-COLDBOOT-03:93-99,181-182` requires `tests/integration/sprint20-testid-audit.test.tsx`; the file is absent. The screen source at `app/(drawer)/chat/reference.tsx:91-110` renders the assistant selector per agent row (`testID={item.role === 'agent' ? 'chat-assistant-message' : ...}`), so a uniqueness assertion is material rather than optional — two agent rows in conversation 020 would silently break the Maestro selector contract.
- **Planning rationale:** This task unblocks `S-COLDBOOT-03` AC-2 (FAIL) and is downstream of the cold-boot vertical (`S-COLDBOOT-02`). The Maestro flow at `.e2e/maestro/reference-flow.yaml` waits on each of these testIDs in sequence; an ambiguous selector (length > 1) makes Maestro's `tapOn`/`waitFor` flake or no-op. The audit must be a standing integration test, not a one-off manual check.
- **How to verify (human):** Set `COLDBOOT_IT=1`, run the audit, observe 4 passing selector assertions each with `length === 1`; then run the audit against the duplicated-testIDs fixture and observe a non-zero exit naming the offending selector.
- **Scope:** One new RNTL test file + one new weakened fixture. Does NOT modify `app/(drawer)/chat/reference.tsx`, `ChatInput`, or the Maestro flow YAML — a failing assertion here escalates to a follow-up fix task.
- **PRD refs:** UC-SYNC-02, S-COLDBOOT-03 AC-2, 10-e2e-testing

## Critical Constraints

### MUST
- MUST render the real Expo Router `RootLayout` with the reference-chat route active (the same tree Maestro launches against), NOT an isolated shallow render of `ReferenceChatScreen` — the test must observe the testID contract at the same altitude Maestro sees it
- MUST query each of the four Maestro selectors (`chat-screen`, `chat-input-field`, `chat-input-send-button`, `chat-assistant-message`) via `getAllByTestId` and assert `length === 1`; `chat-assistant-message` MUST be asserted both BEFORE and AFTER a seeded agent row is materialized
- MUST include a RED-then-GREEN gate: a `tests/integration/fixtures/reference-chat.duplicated-testids.tsx` fixture that mounts two `chat-assistant-message` testIDs MUST fail the audit with a message naming the duplicate; then the real tree MUST pass

### NEVER
- NEVER mock `@rocicorp/zero/react`'s `useQuery` to return a canned array — the audit is asserting on the rendered tree, not the data layer; use RNTL's normal render against the real module
- NEVER weaken the audit to `length >= 1` to make a flaky case pass; the contract is exactly one

### STRICTLY
- STRICTLY the audit must skip-with-reason (NOT pass) when `COLDBOOT_IT != 1`, naming the required env var — a silent pass in the CI fast lane is the bug this task exists to fix

## Specification

**Objective:** Add `tests/integration/sprint20-testid-audit.test.tsx` per S-COLDBOOT-03 AC-2 contract; prove each Maestro selector resolves to exactly one element, including the seeded-agent case; RED-then-GREEN against a weakened fixture.

**Success state:** Audit test exists, passes against the real tree, fails against the duplicate-testID fixture, and skips with reason when `COLDBOOT_IT != 1`.

## Acceptance Criteria

### AC-1: Each of the four Maestro selectors resolves to exactly one element [PRIMARY]
**GIVEN:** `COLDBOOT_IT=1` is set and the reference-chat route is the active route in the real Expo Router `RootLayout` (with `EXPO_PUBLIC_REFERENCE_FLOW=true` and `EXPO_PUBLIC_REFERENCE_CONVERSATION_ID` pointing at the seeded conversation 020)
**WHEN:** the audit renders `RootLayout` and queries each of `chat-screen`, `chat-input-field`, `chat-input-send-button` via `getAllByTestId`, AND renders the tree again once a real seeded agent row exists for conversation 020 (via `POST /api/chat-runs`) and queries `chat-assistant-message`
**THEN:** each selector resolves with `length === 1`; the test report names each selector and its observed count
**VERIFY:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** react-native-testing-library+expo-router-stack+real-nonprod-postgres
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "react-native-testing-library+expo-router-stack+real-nonprod-postgres",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "duplicated-testID", "missing-screen", "renamed-selector"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reference_route_active_with_seeded_agent_row",
      "action": { "actor": "operator", "steps": ["Render RootLayout with reference-chat route active and conversation 020 seeded with 1 user + 1 agent row.", "Query each of the four Maestro selectors via getAllByTestId."] },
      "end_state": {
        "must_observe": ["getAllByTestId('chat-screen').length === 1", "getAllByTestId('chat-input-field').length === 1", "getAllByTestId('chat-input-send-button').length === 1", "getAllByTestId('chat-assistant-message').length === 1"],
        "must_not_observe": ["empty/start signature: length === 0 (selector missing/renamed)", "length > 1 (ambiguous duplicate)"]
      }
    }
  ]
}
```

### AC-2: Audit fails RED against a duplicated-testID fixture, then GREEN against the real tree
**GIVEN:** `tests/integration/fixtures/reference-chat.duplicated-testids.tsx` exists and mounts two `chat-assistant-message` testIDs (a deliberately weakened tree)
**WHEN:** the operator runs the audit's RED case against the fixture, then re-runs the audit against the real `RootLayout`
**THEN:** the RED case exits non-zero with a message naming `chat-assistant-message` as the offending duplicate; the GREEN case against the real tree exits 0 — proving the audit is not a stub
**VERIFY:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-2'; test $? -ne 0 && PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** react-native-testing-library+fixture-comparison
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "react-native-testing-library+fixture-comparison",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass", "no-fixture"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "duplicated_testid_fixture_present",
      "action": { "actor": "operator", "steps": ["Run the audit's AC-2 case against tests/integration/fixtures/reference-chat.duplicated-testids.tsx.", "Run the audit's AC-1 case against the real RootLayout tree."] },
      "end_state": {
        "must_observe": ["AC-2 against fixture: exitCode != 0 with message containing 'chat-assistant-message'", "AC-1 against real tree: exitCode: 0"],
        "must_not_observe": ["empty/start signature: both runs pass", "AC-2 passes against the duplicated-testID fixture"]
      }
    }
  ]
}
```

### AC-3: Audit skips with reason (NOT passes) when COLDBOOT_IT is unset
**GIVEN:** `COLDBOOT_IT` is unset or `0`
**WHEN:** the operator runs `pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx`
**THEN:** the test prints a skip message naming `COLDBOOT_IT=1` (and the other required env vars) and reports `skipped` (NOT `passed`); CI fast lane does NOT accidentally green on this audit
**VERIFY:** `pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx 2>&1 | rg -q 'COLDBOOT_IT'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest skip-with-reason
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest skip-with-reason",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["silent-pass", "stub", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "ci_fast_lane_no_coldboot_env",
      "action": { "actor": "operator", "steps": ["Run the audit without COLDBOOT_IT=1.", "Inspect the vitest report."] },
      "end_state": {
        "must_observe": ["test status: skipped (NOT passed)", "test stderr contains the literal 'COLDBOOT_IT' and at least 1 env var name"],
        "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Each of the four Maestro selectors resolves with `length === 1` against the real tree | AC-1 | `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'` | happy_path |
| TC-2 | Audit fails RED against the duplicated-testID fixture and passes GREEN against the real tree | AC-2 | `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-2'; test $? -ne 0 && PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'` | error |
| TC-3 | Without `COLDBOOT_IT=1`, the audit is skipped (not passed) with a reason | AC-3 | `pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx 2>&1 \| rg -q 'COLDBOOT_IT'` | guard |

## Reading List

1. `app/(drawer)/chat/reference.tsx` (1-126) [PRIMARY PATTERN] — the screen under audit; lines 91-110 render the assistant testID per agent row (the duplicate-source risk)
2. `app/_layout.tsx` (1-180) — the real Expo Router `RootLayout` the audit must render (not a shallow render of `ReferenceChatScreen`)
3. `.e2e/maestro/reference-flow.yaml` (full) — the four Maestro selectors (`chat-screen`, `chat-input-field`, `chat-input-send-button`, `chat-assistant-message`) the audit locks to length === 1
4. `components/chat/ChatInput.tsx` — exposes `chat-input-field` / `chat-input-send-button` testIDs via the `testID` prefix prop; the audit must observe the composed IDs, not the prefix
5. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/S-COLDBOOT-03-maestro-cold-boot-journey-testid-audit-seed.md` (93-99,181-182) — original AC-2 contract this task fulfills
6. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (59-63) — H6 finding: audit absent, per-row render makes uniqueness material

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-testid-audit.test.tsx (NEW)
- tests/integration/fixtures/reference-chat.duplicated-testids.tsx (NEW — deliberately weakened fixture for the RED case)

### WRITE-PROHIBITED
- app/(drawer)/chat/reference.tsx — owned by S-COLDBOOT-02; this task only observes the testID contract
- components/chat/ChatInput.tsx — exposes the prefixed testIDs; out of scope
- .e2e/maestro/reference-flow.yaml — flow content owned by S-COLDBOOT-03
- services/platform/** — backend out of scope

### Boundaries
- **always:** Render the real `RootLayout`; query via `getAllByTestId`; include the seeded-agent case for `chat-assistant-message`; skip-with-reason when `COLDBOOT_IT != 1`
- **ask_first:** Any change to `reference.tsx` or `ChatInput.tsx` suggested by a failing assertion (escalate as a separate fix task)
- **never:** Mocking `@rocicorp/zero/react`; weakening `length === 1` to `length >= 1` to absorb a duplicate; recording a silent pass when `COLDBOOT_IT` is unset

## Design

- **references:** app/(drawer)/chat/reference.tsx, app/_layout.tsx, .e2e/maestro/reference-flow.yaml
- **pattern:** RNTL + Expo Router. Setup: skip-with-reason unless `COLDBOOT_IT=1` AND `EXPO_PUBLIC_REFERENCE_CONVERSATION_ID` is set. Test (GREEN): render `RootLayout` with `EXPO_PUBLIC_REFERENCE_FLOW=true`, assert each of `chat-screen` / `chat-input-field` / `chat-input-send-button` resolves to length === 1; then seed conversation 020 via `POST /api/chat-runs` (or use an existing seeded row), re-render, assert `chat-assistant-message` length === 1. RED case: render `tests/integration/fixtures/reference-chat.duplicated-testids.tsx` (a tree that mounts two `chat-assistant-message` views) and assert the audit throws with a message naming the duplicate.
- **pattern_source:** tests/integration/sprint20-zero-builder-query.test.ts (the existing skip-with-reason pattern)
- **anti_pattern:** A shallow `render(<ReferenceChatScreen />)` test that bypasses Expo Router — `RootLayout` owns providers and route shape that affect testID resolution; a shallow render cannot catch a duplicate testID introduced by a sibling route.

## Agent Assignment

- **implementer:** react-native-ui-implementer — owns the RN testID contract (same as S-COLDBOOT-02/S-COLDBOOT-03)
- **reviewer:** react-native-ui-reviewer — verifies the audit renders the real `RootLayout`, not a shallow tree; verifies the RED case catches duplicates

## Verification Gates

- **AC-1 selector uniqueness:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'` → Exit 0; four selectors each length === 1
- **AC-2 RED-then-GREEN:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-2'` (non-zero) THEN `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'` (zero)
- **AC-3 skip-with-reason:** `pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx 2>&1 | rg -q 'COLDBOOT_IT'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** S-COLDBOOT-02 (defines the reference-chat route + ChatInput testID contract this audit observes), S-COLDBOOT-03 (defines the original AC-2 this task fulfills)
- **blocks:** S-COLDBOOT-03 AC-2 (FAIL → PASS), D03-07 AC-1 (capstone Maestro run depends on unambiguous selectors), the Sprint-20 close handshake

## Notes

The `chat-assistant-message` testID is rendered once per agent row at `app/(drawer)/chat/reference.tsx:102`. The cold-boot contract is exactly one agent reply per conversation 020 (1 user + 1 agent row), so the audit's `length === 1` assertion is correct AND material: a regression that renders two agent rows (e.g. a stale persisted row surviving reset, or a duplicated render key) would silently break the Maestro flow's `waitFor` step. The RED fixture proves the audit catches that.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H6",
  "proposed_by": "react-native-ui-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "reference_route_active_with_seeded_agent_row": {
      "description": "EXPO_PUBLIC_REFERENCE_FLOW=true, EXPO_PUBLIC_REFERENCE_CONVERSATION_ID points at conversation 00000000-0000-0000-0000-000000000020 which has been seeded via POST /api/chat-runs with exactly 1 user + 1 agent row.",
      "seed_method": "public_api",
      "records": [
        "POST /api/chat-runs with conversationId=020 produced 1 user + 1 agent chat_messages row",
        "zero-cache returns the agent row for conversation 020",
        "EXPO_PUBLIC_REFERENCE_FLOW=true is set in the test env"
      ]
    },
    "duplicated_testid_fixture_present": {
      "description": "tests/integration/fixtures/reference-chat.duplicated-testids.tsx exists and renders a tree that mounts two elements with testID='chat-assistant-message' (the deliberately weakened tree for the RED case).",
      "seed_method": "recorded_external",
      "records": [
        "tests/integration/fixtures/reference-chat.duplicated-testids.tsx exists",
        "fixture renders two chat-assistant-message testIDs"
      ]
    },
    "ci_fast_lane_no_coldboot_env": {
      "description": "COLDBOOT_IT is unset or 0, matching the CI fast-lane environment; the audit must skip-with-reason, not pass.",
      "seed_method": "cli",
      "records": [
        "COLDBOOT_IT unset",
        "ci-fast.yml context"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN COLDBOOT_IT=1 and the reference route active with a seeded agent row WHEN the audit renders RootLayout and queries each of the four Maestro selectors THEN each resolves with length === 1.",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "react-native-testing-library+expo-router-stack+real-nonprod-postgres",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "duplicated-testID", "missing-screen", "renamed-selector"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "reference_route_active_with_seeded_agent_row",
            "action": { "actor": "operator", "steps": ["Render RootLayout with reference-chat route active and conversation 020 seeded with 1 user + 1 agent row.", "Query each of the four Maestro selectors via getAllByTestId."] },
            "end_state": {
              "must_observe": ["getAllByTestId('chat-screen').length === 1", "getAllByTestId('chat-input-field').length === 1", "getAllByTestId('chat-input-send-button').length === 1", "getAllByTestId('chat-assistant-message').length === 1"],
              "must_not_observe": ["empty/start signature: length === 0 (selector missing/renamed)", "length > 1 (ambiguous duplicate)"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN a duplicated-testID fixture WHEN the audit's AC-2 case runs against it THEN it fails non-zero naming the duplicate, then against the real tree passes zero.",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-2'; test $? -ne 0 && PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "react-native-testing-library+fixture-comparison",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass", "no-fixture"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "duplicated_testid_fixture_present",
            "action": { "actor": "operator", "steps": ["Run the audit's AC-2 case against tests/integration/fixtures/reference-chat.duplicated-testids.tsx.", "Run the audit's AC-1 case against the real RootLayout tree."] },
            "end_state": {
              "must_observe": ["AC-2 against fixture: exitCode != 0 with message containing 'chat-assistant-message'", "AC-1 against real tree: exitCode: 0"],
              "must_not_observe": ["empty/start signature: both runs pass", "AC-2 passes against the duplicated-testID fixture"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN COLDBOOT_IT is unset WHEN operator runs the audit THEN it is skipped (not passed) with a reason naming the required env vars.",
      "verify": "pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx 2>&1 | rg -q 'COLDBOOT_IT'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest skip-with-reason",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["silent-pass", "stub", "mock", "static"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "ci_fast_lane_no_coldboot_env",
            "action": { "actor": "operator", "steps": ["Run the audit without COLDBOOT_IT=1.", "Inspect the vitest report."] },
            "end_state": {
              "must_observe": ["test status: skipped (NOT passed)", "test stderr contains the literal 'COLDBOOT_IT' and at least 1 env var name"],
              "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Each of the four Maestro selectors resolves with length === 1 against the real tree",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Audit RED against duplicated-testID fixture, GREEN against real tree",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-2'; test $? -ne 0 && PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx -t 'AC-1'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Without COLDBOOT_IT=1, audit is skipped (not passed) with a reason",
      "verify": "pnpm vitest run tests/integration/sprint20-testid-audit.test.tsx 2>&1 | rg -q 'COLDBOOT_IT'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
