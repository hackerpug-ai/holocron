# REDHAT-FIX-H5 — Add and run the durable Zero-synced message integration test against the real nonprod namespace
> Status: ✅ Completed
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: react-native-ui-implementer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H5 (High)

## Outcome

`services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` exists, runs against the real nonprod namespace (`COLDBOOT_IT=1`), and proves the central claim that the assistant reply is durable via Zero — i.e. the agent message observed by the RN client is read from a real zero-cache query, NOT from the Hono command's response body or a builder-query source-shape check.

**Success state:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` passes; the test (a) sends a reference chat message via the Hono `/api/chat-runs` command, (b) waits for the specialist fleet to write the agent row to Postgres, (c) queries the live zero-cache for the same conversation, and (d) asserts the zero-cache returns the agent row with non-empty content — and (e) FAILS RED when the zero-cache is intentionally disconnected (negative control).

## Background

- **Specialist rationale:** Red-hat H5 (High) shows S-COLDBOOT-02:16,88-95,167-169,214 requires `services/platform/tests/integration/sprint20-reference-zero-durable.test.ts`; that file does not exist. `sprint-goal-state.json:34,184` acknowledges this as a follow-up while still marking AC-2 satisfied/non-blocking. The existing `sprint20-zero-builder-query.test.ts` only checks source shape; its real-substrate cases printed `SKIPPED` without `COLDBOOT_IT=1`.
- **Planning rationale:** This is the central claim of the cold-boot vertical: "the durable message is observable via Zero, not the response body." It unblocks S-COLDBOOT-02 AC-2 (FAIL) and feeds the capstone verifier's `coldboot_gate: green` derivation (REDHAT-FIX-H1).
- **How to verify (human):** Set `COLDBOOT_IT=1 DATABASE_URL=...holocron_nonprod... ZERO_ADMIN_PASSWORD=...` and run the test; observe a passing result that prints the actual zero-cache row content (not the response body); then run with `ZERO_CACHE_DISABLED=1` and confirm the test fails RED.
- **Scope:** One new integration test file. Does NOT modify the chat route, the RN client, or the zero-cache itself (those are owned by S-COLDBOOT-01/S-COLDBOOT-02).
- **PRD refs:** UC-SYNC-01, UC-SYNC-02, S-COLDBOOT-02 AC-2

## Critical Constraints

### MUST
- MUST run against the real nonprod namespace (`DATABASE_URL` containing `holocron_nonprod`) and the real zero-cache endpoint (via `EXPO_PUBLIC_PLATFORM_URL`/`ZERO_ADMIN_PASSWORD`); MUST refuse to run (skip with a non-passing marker) when `COLDBOOT_IT != 1`
- MUST prove durability by querying the zero-cache for the SAME conversation_id AFTER the Hono command returns, NOT by inspecting the command's response body
- MUST include a negative control: when the zero-cache is intentionally unreachable (`ZERO_CACHE_DISABLED=1` or pointing at a closed port), the test MUST fail RED with a message naming the unreachable endpoint

### NEVER
- NEVER use the Hono response body's `assistantMessage` field as evidence of durability — that proves the command, not the cache
- NEVER mock the zero-cache; the test is integration-tier against the real service or it does not run at all

### STRICTLY
- STRICTLY the test must seed the reference conversation via the real entrypoint (`POST /api/chat-runs` against the running platform), wait for the agent row via a real Postgres poll, then issue a real zero-cache query — never a builder-query source-shape check

## Specification

**Objective:** Add `services/platform/tests/integration/sprint20-reference-zero-durable.test.ts` and prove the durable-via-Zero claim against real services.

**Success state:** Test exists, passes against real nonprod, fails RED when zero-cache is unreachable.

## Acceptance Criteria

### AC-1: Real zero-cache returns the durable agent row for the reference conversation [PRIMARY]
**GIVEN:** the platform is running against the nonprod namespace, the zero-cache is online, and a reference conversation has been seeded by `POST /api/chat-runs`
**WHEN:** the test polls Postgres for the agent row (`select id, content from chat_messages where conversation_id=? and role='agent'`), then queries the zero-cache for the same conversation
**THEN:** the zero-cache returns the same agent row with content length > 0 AND the same `id` as the Postgres row — proving durability, not command-response echoing
**VERIFY:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real-nonprod-postgres + real-zero-cache + real-platform HTTP
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real-nonprod-postgres + real-zero-cache + real-platform HTTP",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "response-body-only", "missing-zero-cache"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "nonprod_namespace_seeded_with_reference_conversation",
      "action": { "actor": "api_client", "steps": ["POST /api/chat-runs with the reference message.", "Poll Postgres for the agent row.", "Query the zero-cache for the same conversation_id."] },
      "end_state": {
        "must_observe": ["Postgres agent row exists (content length > 0)", "zero-cache returns the SAME agent row id", "zero-cache content matches Postgres content (byte-for-byte OR normalized equality)"],
        "must_not_observe": ["empty/start signature: zero-cache returns 0 rows for the conversation", "zero-cache content is empty string", "agent row exists ONLY in response body but NOT in zero-cache"]
      }
    }
  ]
}
```

### AC-2: Test fails RED when zero-cache is unreachable (negative control)
**GIVEN:** the same setup as AC-1, but `ZERO_CACHE_DISABLED=1` (or the zero-cache endpoint is pointed at a closed port)
**WHEN:** the test queries the zero-cache for the reference conversation
**THEN:** the test fails (non-zero exit) with a message naming the unreachable endpoint; the failure proves the test would catch a regression where the durable path silently breaks
**VERIFY:** `PLATFORM_IT=1 COLDBOOT_IT=1 ZERO_CACHE_DISABLED=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real-zero-cache (intentionally unreachable)
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real-zero-cache (intentionally unreachable)",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "nonprod_namespace_with_zero_cache_disabled",
      "action": { "actor": "api_client", "steps": ["POST /api/chat-runs with the reference message.", "Poll Postgres for the agent row.", "Query the (unreachable) zero-cache."] },
      "end_state": {
        "must_observe": ["test exitCode != 0", "test stderr names the zero-cache endpoint", "test report shows the failure is the zero-cache query, not the Hono command"],
        "must_not_observe": ["test passes (false-pass)", "empty/start signature: test skipped without running"]
      }
    }
  ]
}
```

### AC-3: Test refuses to run without COLDBOOT_IT=1 (skip-with-reason, not silent pass)
**GIVEN:** `COLDBOOT_IT` is unset or `0`
**WHEN:** the operator runs `pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts`
**THEN:** the test prints a skip message naming the required env vars (`COLDBOOT_IT=1 DATABASE_URL=...holocron_nonprod... ZERO_ADMIN_PASSWORD=...`) and reports `skipped` (NOT `passed`); CI fast lane does NOT accidentally green on this test
**VERIFY:** `pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts 2>&1 | rg -q 'COLDBOOT_IT'`
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
      "action": { "actor": "operator", "steps": ["Run the test without COLDBOOT_IT=1.", "Inspect the report."] },
      "end_state": {
        "must_observe": ["test status: skipped (NOT passed)", "test stderr/stdout names COLDBOOT_IT and the required env vars"],
        "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Real zero-cache returns the durable agent row matching the Postgres row | AC-1 | `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'` | happy_path |
| TC-2 | With `ZERO_CACHE_DISABLED=1`, the test fails RED naming the unreachable endpoint | AC-2 | `PLATFORM_IT=1 COLDBOOT_IT=1 ZERO_CACHE_DISABLED=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'; test $? -ne 0` | error |
| TC-3 | Without `COLDBOOT_IT=1`, the test is skipped (not passed) with a reason | AC-3 | `pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts 2>&1 \| rg -q 'COLDBOOT_IT'` | guard |

## Reading List

1. `app/(drawer)/chat/reference.tsx` (1-79) [PRIMARY PATTERN] — the RN client's Zero query path this test mirrors server-side
2. `services/platform/tests/integration/sprint20-zero-builder-query.test.ts` (full) — the existing builder-query test; demonstrates the skip-with-reason pattern this task strengthens
3. `services/platform/src/server/routes/chat-runs.ts` (or equivalent) — the Hono `/api/chat-runs` command the test invokes
4. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/S-COLDBOOT-02-thin-chat-vertical-hono-command-zero-read.md` (16,88-95,167-169) — original AC-2 contract
5. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (54-57) — H5 finding: durable Zero test absent

## Guardrails

### WRITE-ALLOWED
- services/platform/tests/integration/sprint20-reference-zero-durable.test.ts (NEW)

### WRITE-PROHIBITED
- app/** — owned by S-COLDBOOT-01/S-COLDBOOT-02; this test mirrors the client path server-side
- services/platform/src/server/routes/chat-runs.ts — owned by S-COLDBOOT-02 / REDHAT-FIX-H7 may touch the reset
- services/platform/src/db/** — schema is owned by Sprint 04

### Boundaries
- **always:** Query the zero-cache AFTER the Hono command returns; compare row id and content; include a negative-control run
- **ask_first:** Seeding additional test conversations if the reference conversation id conflicts with an existing row
- **never:** Inspecting the Hono response body's `assistantMessage` as evidence of durability; mocking the zero-cache

## Design

- **references:** app/(drawer)/chat/reference.tsx, services/platform/src/server/routes/chat-runs.ts
- **pattern:** Vitest integration test. Setup: skip-with-reason unless `COLDBOOT_IT=1` and `DATABASE_URL` matches `/holocron_nonprod/`. Test: `POST /api/chat-runs` with the reference message → poll Postgres (`select id, content from chat_messages where conversation_id=? and role='agent'`) → query the zero-cache HTTP endpoint for the same conversation_id → assert the zero-cache returns a row with the SAME id and non-empty content matching Postgres. Negative control: re-run with `ZERO_CACHE_DISABLED=1` and assert non-zero exit.
- **pattern_source:** services/platform/tests/integration/sprint20-zero-builder-query.test.ts
- **anti_pattern:** Asserting `response.body.assistantMessage.content` is non-empty — that proves the command echoed the message, not that the durable zero-cache path works.

## Agent Assignment

- **implementer:** react-native-ui-implementer — owns the durable Zero claim (same as S-COLDBOOT-02)
- **reviewer:** mastra-reviewer — verifies the test queries the cache, not the response body; verifies the negative control fails

## Verification Gates

- **AC-1 durable read:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'` → Exit 0
- **AC-2 negative control:** `PLATFORM_IT=1 COLDBOOT_IT=1 ZERO_CACHE_DISABLED=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'` → Exit non-zero
- **AC-3 skip-with-reason:** `pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts 2>&1 | rg -q 'COLDBOOT_IT'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** S-COLDBOOT-02 (defines the durable-via-Zero contract this test verifies)
- **blocks:** S-COLDBOOT-02 AC-2, D03-07 AC-1 (capstone needs durable proof), REDHAT-FIX-H1 (verifier consumes this evidence)

## Notes

This test is the central claim of the cold-boot vertical. The Hono command response is intentionally NOT evidence — the agent message must be observable via a SEPARATE zero-cache query after the command returns, proving the durable path. The skip-with-reason pattern (AC-3) prevents a CI fast-lane false green: a skipped test must NOT be reported as passed.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H5",
  "proposed_by": "react-native-ui-implementer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "nonprod_namespace_seeded_with_reference_conversation": {
      "description": "Platform is running against the real holocron_nonprod Postgres; zero-cache is online; the reference conversation can be seeded via POST /api/chat-runs.",
      "seed_method": "public_api",
      "records": [
        "DATABASE_URL contains 'holocron_nonprod'",
        "GET /health on the platform returns 200",
        "zero-cache admin endpoint reachable"
      ]
    },
    "nonprod_namespace_with_zero_cache_disabled": {
      "description": "Same substrate, but ZERO_CACHE_DISABLED=1 OR the zero-cache endpoint points at a closed port (e.g. localhost:9) to prove the negative control.",
      "seed_method": "env",
      "records": [
        "ZERO_CACHE_DISABLED=1 OR EXPO_PUBLIC_PLATFORM_URL=http://127.0.0.1:9",
        "zero-cache admin endpoint unreachable"
      ]
    },
    "ci_fast_lane_no_coldboot_env": {
      "description": "COLDBOOT_IT is unset or 0, matching the CI fast-lane environment; the test must skip-with-reason, not pass.",
      "seed_method": "env",
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
      "description": "GIVEN nonprod namespace seeded WHEN test queries the zero-cache for the reference conversation THEN it returns the SAME agent row id with non-empty content matching Postgres.",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real-nonprod-postgres + real-zero-cache + real-platform HTTP",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "response-body-only", "missing-zero-cache"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "nonprod_namespace_seeded_with_reference_conversation",
            "action": { "actor": "api_client", "steps": ["POST /api/chat-runs with the reference message.", "Poll Postgres for the agent row.", "Query the zero-cache for the same conversation_id."] },
            "end_state": {
              "must_observe": ["Postgres agent row exists (content length > 0)", "zero-cache returns the SAME agent row id", "zero-cache content matches Postgres content (byte-for-byte OR normalized equality)"],
              "must_not_observe": ["empty/start signature: zero-cache returns 0 rows for the conversation", "zero-cache content is empty string", "agent row exists ONLY in response body but NOT in zero-cache"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN ZERO_CACHE_DISABLED=1 WHEN test queries the zero-cache THEN test fails non-zero with a message naming the endpoint.",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 ZERO_CACHE_DISABLED=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'; test $? -ne 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real-zero-cache (intentionally unreachable)",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "mock", "static", "always-pass"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "nonprod_namespace_with_zero_cache_disabled",
            "action": { "actor": "api_client", "steps": ["POST /api/chat-runs with the reference message.", "Poll Postgres for the agent row.", "Query the (unreachable) zero-cache."] },
            "end_state": {
              "must_observe": ["test exitCode != 0", "test stderr names the zero-cache endpoint", "test report shows the failure is the zero-cache query, not the Hono command"],
              "must_not_observe": ["test passes (false-pass)", "empty/start signature: test skipped without running"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN COLDBOOT_IT is unset WHEN operator runs the test THEN it is skipped (not passed) with a reason naming the required env vars.",
      "verify": "pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts 2>&1 | rg -q 'COLDBOOT_IT'",
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
            "action": { "actor": "operator", "steps": ["Run the test without COLDBOOT_IT=1.", "Inspect the report."] },
            "end_state": {
              "must_observe": ["test status: skipped (NOT passed)", "test stderr/stdout names COLDBOOT_IT and the required env vars"],
              "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Real zero-cache returns the durable agent row matching Postgres",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "With ZERO_CACHE_DISABLED=1, test fails RED naming the endpoint",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 ZERO_CACHE_DISABLED=1 pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts -t 'AC-1'; test $? -ne 0",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Without COLDBOOT_IT=1, test is skipped (not passed) with a reason",
      "verify": "pnpm vitest run services/platform/tests/integration/sprint20-reference-zero-durable.test.ts 2>&1 | rg -q 'COLDBOOT_IT'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
