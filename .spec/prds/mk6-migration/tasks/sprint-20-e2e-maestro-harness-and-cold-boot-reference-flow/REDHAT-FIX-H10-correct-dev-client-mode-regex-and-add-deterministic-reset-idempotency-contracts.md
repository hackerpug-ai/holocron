# REDHAT-FIX-H10 — Correct dev-client mode validation and add deterministic reset/idempotency and capstone replay contracts named by S-COLDBOOT-03/D03-04
> Status: ✅ Completed
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source findings: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` M2 (Medium) + M4 (High)

## Outcome

Two documented-but-unwired contracts are made executable, and the dev-client mode regex is corrected to match the documented grammar. (M2) the AC-3 verification oracle `"mode":"[a-z-]+"` is corrected to match the actual `server-list+already-running` mode produced by `run-maestro-reference-flow.sh:18-20,98-100` (and documented in D03-03's own allowed-values list) — the regex now accepts `[a-z0-9+-]+` and is asserted by a standing test. (M4) the `tests/integration/sprint20-coldboot-journey.test.ts` test title named by S-COLDBOOT-03 AC-3 ("namespace reset returns conversation 020 to a deterministic zero-message state") is added, wired to a real `holo namespace reset` + Postgres count check under `PLATFORM_IT=1 COLDBOOT_IT=1`, and asserts the deterministic-reset contract.

**Success state:** `rg -o '"mode":"[a-z0-9+-]+"' .tmp/maestro-reference-flow/dev-client-setup.json` returns `server-list+already-running` (or another documented mode) on a real run; `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'` passes against real nonprod Postgres; the capstone replay contract documented in D03-04 is satisfied by the reset idempotency proof (REDHAT-FIX-H7) plus this task's deterministic-reset test.

## Background

- **Specialist rationale:** Red-hat M2 (Medium) shows `D03-03:113,175,220` verifies `"mode":"[a-z-]+"`; current `dev-client-setup.json` has `"mode":"server-list+already-running"`, containing `+`. The source at `run-maestro-reference-flow.sh:18-20,98-100` documents and produces the plus-bearing modes; the task's own allowed-values list at `D03-03:113` includes `server-list+already-running`. The regex CANNOT match the documented default, so AC-3 has no valid command result. Red-hat M4 (High) shows `S-COLDBOOT-03:137-145,183,223` names a test title "namespace reset returns conversation 020 to a deterministic zero-message state" but `tests/integration/sprint20-coldboot-journey.test.ts` has no such title and its real-service cases return early unless `PLATFORM_IT=1 COLDBOOT_IT=1`; the AC command therefore cannot provide the promised deterministic reset proof.
- **Planning rationale:** This task closes D03-03 AC-3 (FAIL → PASS) by correcting the oracle and adding a standing test that exercises it. It closes S-COLDBOOT-03 AC-3 (FAIL → PASS) by wiring the named test title to a real reset invocation. Both are required by the capstone verifier (REDHAT-FIX-H1): the verifier derives `coldboot_gate: green` from real deterministic-reset evidence, and a missing-or-malformed mode field or an absent reset test means the gate cannot be recomputed.
- **How to verify (human):** Run a real `--run` and observe `dev-client-setup.json` matches the corrected regex; run the named coldboot-journey test title against real nonprod and observe it passes with the deterministic 0-count assertion.
- **Scope:** One regex correction (in test + any doc that copies the bad pattern), one new test case in `tests/integration/sprint20-coldboot-journey.test.ts`. Does NOT modify the harness script's mode production (the script is correct — D03-03 documents `server-list+already-running` as a valid mode; only the verification regex was wrong).
- **PRD refs:** UC-SYNC-02, 10-e2e-testing, D03-03 AC-3, S-COLDBOOT-03 AC-3, D03-04 capstone replay contract

## Critical Constraints

### MUST
- MUST correct the verification regex from `"mode":"[a-z-]+"` to `"mode":"[a-z0-9+-]+"` (matching the documented grammar: lowercase letters, digits, hyphens, and `+` for compound modes like `server-list+already-running`)
- MUST add a standing test case `tests/integration/sprint20-maestro-harness-artifacts.test.ts` (the AC-3 home) that reads `.tmp/maestro-reference-flow/dev-client-setup.json` from a real `--run` and asserts the corrected regex matches one of the four documented modes (`tutorial`, `server-list+tutorial`, `server-list+already-running`, `already-running`)
- MUST add a test case to `tests/integration/sprint20-coldboot-journey.test.ts` titled exactly `namespace reset returns conversation 020 to a deterministic zero-message state` that: (a) seeds conversation 020 with 2 chat_messages rows via the real `POST /api/chat-runs`, (b) runs `holo namespace reset --json`, (c) asserts `ok:true` in the JSON AND a Postgres `select count(*)` of 0 for conversation 020, AND (d) re-runs reset and asserts the same 0-count to prove idempotency
- MUST skip-with-reason (NOT pass) when `PLATFORM_IT=1 COLDBOOT_IT=1` is unset — a silent pass in the CI fast lane is the bug M4 exists to fix

### NEVER
- NEVER weaken the corrected regex to a permissive `.+` that would match any string — the four documented modes are the contract; the regex MUST be anchored to the documented grammar
- NEVER mock the reset, the chat-runs POST, or the Postgres count query — the deterministic-reset contract is the entire point of S-COLDBOOT-03 AC-3

### STRICTLY
- STRICTLY the named test title `namespace reset returns conversation 020 to a deterministic zero-message state` MUST appear verbatim in `tests/integration/sprint20-coldboot-journey.test.ts` — the S-COLDBOOT-03 AC-3 verify command (`pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t "deterministic zero-message state"`) is a substring matcher that requires the literal phrase

## Specification

**Objective:** Correct the dev-client mode regex (M2); add the named deterministic-reset test title and wire it to real services (M4).

**Success state:** Mode regex matches `server-list+already-running`; named test title present and passing against real nonprod; both AC-3 contracts move FAIL → PASS.

## Acceptance Criteria

### AC-1: Dev-client mode regex matches the documented grammar including `+` [PRIMARY]
**GIVEN:** the harness at `scripts/e2e/run-maestro-reference-flow.sh` is on `main` and produces `dev-client-setup.json` with `"mode":"server-list+already-running"` (the documented default at line 20)
**WHEN:** the operator runs `rg -o '"mode":"[a-z0-9+-]+"' .tmp/maestro-reference-flow/dev-client-setup.json` against a real `--run` artifact
**THEN:** the regex matches and returns `server-list+already-running` (or one of the other three documented modes); a standing test in `tests/integration/sprint20-maestro-harness-artifacts.test.ts` asserts the match against the documented set; running the OLD regex `"mode":"[a-z-]+"` against the same file returns NO match (proving the old oracle was broken)
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'dev-client mode'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + real harness artifact + documented mode grammar
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + real harness artifact + documented mode grammar",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "old-regex", "weakened-regex", "missing-mode-field"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "harness_run_with_dev_client_setup_present",
      "action": { "actor": "operator", "steps": ["Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect .tmp/maestro-reference-flow/dev-client-setup.json.", "Run the dev-client-mode vitest case."] },
      "end_state": {
        "must_observe": ["dev-client-setup.json mode field matches regex [a-z0-9+-]+ (>= 1 match)", "mode value in set {'tutorial','server-list+tutorial','server-list+already-running','already-running'}", "old regex [a-z-]+ returns 0 matches against mode value (proving fix required)"],
        "must_not_observe": ["empty/start signature: mode field absent", "mode value contains characters outside [a-z0-9+-]", "test passes against a permissive .* regex"]
      }
    }
  ]
}
```

### AC-2: Named deterministic-reset test title present and wired to real services
**GIVEN:** `tests/integration/sprint20-coldboot-journey.test.ts` is on `main` and `PLATFORM_IT=1 COLDBOOT_IT=1` is set with a real `DATABASE_URL=...holocron_nonprod...`
**WHEN:** the operator runs `pnpm exec vitest run tests/integration/sprint20-coldboot-journey.test.ts -t "deterministic zero-message state"`
**THEN:** the named test runs (not skipped, not absent), seeds conversation 020 with 2 rows via the real `POST /api/chat-runs`, runs `holo namespace reset --json`, asserts `ok:true` AND `select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'` returns 0, re-runs reset, and asserts the same 0-count — proving the deterministic-reset contract
**VERIFY:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo-cli + real Postgres holocron_nonprod + real POST /api/chat-runs
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo-cli + real Postgres holocron_nonprod + real POST /api/chat-runs",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "no-reset", "reset-no-op", "reset-wrong-db", "non-idempotent"] },
  "evidence": { "artifact_type": "db_query", "required_capture": true },
  "cases": [
    {
      "start_ref": "conversation_020_seeded_with_two_rows",
      "action": { "actor": "api_client", "steps": ["POST /api/chat-runs to seed conversation 020 with 1 user + 1 agent row.", "Run holo namespace reset --json.", "Query chat_messages count for conversation 020.", "Re-run holo namespace reset --json and re-query."] },
      "end_state": {
        "must_observe": ["reset JSON ok:true (both runs, 2 of 2)", "chat_messages count for conversation 020: 0 after first reset (psql -tAc returns 0)", "chat_messages count for conversation 020: 0 after second reset (idempotent: 2 of 2 resets return 0)"],
        "must_not_observe": ["empty/start signature: count remains 2 (reset was a no-op)", "count: >0 after either reset", "ok:false"]
      }
    }
  ]
}
```

### AC-3: Test skips with reason (NOT passes) when COLDBOOT_IT is unset
**GIVEN:** `COLDBOOT_IT` is unset or `0` (CI fast-lane context)
**WHEN:** the operator runs `pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'deterministic zero-message state'`
**THEN:** the test prints a skip message naming `COLDBOOT_IT=1` and `DATABASE_URL=...holocron_nonprod...` and reports `skipped` (NOT `passed`)
**VERIFY:** `pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts 2>&1 | rg -q 'COLDBOOT_IT'`
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
      "action": { "actor": "operator", "steps": ["Run the named test without COLDBOOT_IT=1.", "Inspect the vitest report."] },
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
| TC-1 | Corrected mode regex `[a-z0-9+-]+` matches `server-list+already-running`; old `[a-z-]+` does not | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'dev-client mode'` | happy_path |
| TC-2 | Named test title "namespace reset returns conversation 020 to a deterministic zero-message state" is present and passes against real nonprod with idempotency | AC-2 | `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'` | happy_path |
| TC-3 | Without `COLDBOOT_IT=1`, the named test is skipped (not passed) with a reason | AC-3 | `pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts 2>&1 \| rg -q 'COLDBOOT_IT'` | guard |

## Reading List

1. `scripts/e2e/run-maestro-reference-flow.sh` (18-20, 98-101) [PRIMARY PATTERN] — the harness that produces `dev-client-setup.json` with the documented `server-list+already-running` default; lines 18-20 are the documented-mode comment, lines 98-101 are the JSON emission
2. `.tmp/maestro-reference-flow/dev-client-setup.json` — the artifact the corrected regex parses; current `mode` value is `server-list+already-running` (contains `+`)
3. `tests/integration/sprint20-maestro-harness-artifacts.test.ts` (full) — home of the existing TC-3 dev-client-mode test that needs the regex correction
4. `tests/integration/sprint20-coldboot-journey.test.ts` (full) — home of the missing named test title; existing cases return early unless `PLATFORM_IT=1 COLDBOOT_IT=1`
5. `services/platform/src/db/seed.ts` (1-160) — the deterministic-reset semantics (TRUNCATE...RESTART IDENTITY CASCADE) the named test exercises
6. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/S-COLDBOOT-03-maestro-cold-boot-journey-testid-audit-seed.md` (137-145,183,223) — original S-COLDBOOT-03 AC-3 contract this task fulfills
7. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-03-build-maestro-runner-harness-boot-install-execute-capture.md` (113,175,220) — original D03-03 AC-3 contract this task fulfills
8. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (84-97) — M2 + M4 findings: bad regex + absent named test title

## Guardrails

### WRITE-ALLOWED
- tests/integration/sprint20-maestro-harness-artifacts.test.ts (MODIFY — correct the dev-client-mode regex from `[a-z-]+` to `[a-z0-9+-]+`; assert against the documented-mode set)
- tests/integration/sprint20-coldboot-journey.test.ts (MODIFY — add the named test title "namespace reset returns conversation 020 to a deterministic zero-message state" wired to real services)
- docs/ci/maestro-harness.md (MODIFY — if the bad regex pattern is copied anywhere in docs, correct it in lockstep)

### WRITE-PROHIBITED
- scripts/e2e/run-maestro-reference-flow.sh — owned by D03-03 / REDHAT-FIX-H3; the harness's mode production is correct (the documented default is `server-list+already-running`); only the test oracle was wrong
- services/platform/src/db/seed.ts — owned by D03-04 / REDHAT-FIX-H7; the reset semantics are correct
- services/platform/src/cli/holo.ts — owned by D03-04 (modulo REDHAT-FIX-H1 capstone replay contracts)
- .e2e/maestro/reference-flow.yaml — flow content owned by S-COLDBOOT-03

### Boundaries
- **always:** Read the actual `dev-client-setup.json` from a real `--run`; assert the corrected regex against the documented-mode set; wire the named test title to a real reset + Postgres count; skip-with-reason when `COLDBOOT_IT != 1`
- **ask_first:** Any change to the harness's mode production (escalate to REDHAT-FIX-H3); any change to seed.ts reset semantics (escalate to REDHAT-FIX-H7)
- **never:** Weakening the regex to `.+`; mocking the reset, the chat-runs POST, or the Postgres count; recording a silent pass when `COLDBOOT_IT` is unset

## Design

- **references:** scripts/e2e/run-maestro-reference-flow.sh, tests/integration/sprint20-maestro-harness-artifacts.test.ts, tests/integration/sprint20-coldboot-journey.test.ts
- **pattern:** (M2) Replace `"mode":"[a-z-]+"` with `"mode":"[a-z0-9+-]+"` everywhere it appears in tests and docs; in the dev-client-mode vitest case, read `.tmp/maestro-reference-flow/dev-client-setup.json` after a real `--run` and assert the matched value is in `{tutorial, server-list+tutorial, server-list+already-running, already-running}`. (M4) Add `it('namespace reset returns conversation 020 to a deterministic zero-message state', () => {...}, 60_000)` to `sprint20-coldboot-journey.test.ts`: skip-with-reason unless `PLATFORM_IT=1 COLDBOOT_IT=1` and `DATABASE_URL` matches `/holocron_nonprod/`; seed conversation 020 via real `POST /api/chat-runs`; run `bun services/platform/src/cli/holo.ts namespace reset --json` and parse JSON; assert `ok === true`; query Postgres `select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020'` and assert 0; re-run reset and re-query to prove idempotency.
- **pattern_source:** tests/integration/sprint20-coldboot-journey.test.ts (existing skip-with-reason pattern), tests/integration/sprint20-maestro-harness-artifacts.test.ts (existing dev-client-mode case)
- **anti_pattern:** Mocking the reset or counting rows from a canned fixture — the deterministic-reset contract is the entire point; a mocked reset cannot prove truncate semantics.

## Agent Assignment

- **implementer:** devops-engineer — owns the harness artifact contract + the reset/seed proof (same as D03-03/D03-04)
- **reviewer:** mastra-reviewer — verifies the corrected regex matches the documented grammar (not a permissive `.+`); verifies the named test exercises real services, not mocks

## Verification Gates

- **AC-1 mode regex:** `PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'dev-client mode'` → Exit 0; corrected regex matches `server-list+already-running`
- **AC-2 named test:** `PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'` → Exit 0; ok:true + count:0 + idempotent
- **AC-3 skip-with-reason:** `pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts 2>&1 | rg -q 'COLDBOOT_IT'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-03 (defines the AC-3 dev-client-mode contract this task corrects), S-COLDBOOT-03 (defines the named test title this task wires), D03-04 (defines the deterministic-reset semantics), REDHAT-FIX-H7 (owns the broader live zero-cache reset proof; this task owns the named-title deterministic-reset test)
- **blocks:** D03-03 AC-3 (FAIL → PASS), S-COLDBOOT-03 AC-3 (FAIL → PASS), D03-07 AC-1 (capstone needs deterministic-reset evidence), REDHAT-FIX-H1 (capstone replay contract), the Sprint-20 close handshake

## Notes

M2 and M4 are paired: M2 is a verification-oracle bug (the regex doesn't match what the harness actually produces), M4 is a missing-coverage bug (the named test title is absent). Together they constitute a documentation-vs-execution drift: the contracts LOOK complete on paper, but the commands to verify them don't work. The capstone replay contract (D03-04) requires BOTH the deterministic-reset semantics AND a way to recompute them on demand — H7 owns the live-zero-cache half of that replay, this task owns the deterministic-reset half. The corrected regex is anchored to `[a-z0-9+-]+` (NOT `.+`) so a future regression that emits `mode:"tutorial\nextra junk"` would still be caught.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H10",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "harness_run_with_dev_client_setup_present": {
      "description": "A real scripts/e2e/run-maestro-reference-flow.sh --run has produced .tmp/maestro-reference-flow/dev-client-setup.json with mode:'server-list+already-running' (the documented default) under PLATFORM_IT=1.",
      "seed_method": "cli",
      "records": [
        "PLATFORM_IT=1 set",
        ".tmp/maestro-reference-flow/dev-client-setup.json exists",
        "dev-client-setup.json mode value is server-list+already-running"
      ]
    },
    "conversation_020_seeded_with_two_rows": {
      "description": "POST /api/chat-runs has seeded conversation 00000000-0000-0000-0000-000000000020 with 1 user + 1 agent chat_messages row against real holocron_nonprod Postgres.",
      "seed_method": "public_api",
      "records": [
        "DATABASE_URL contains holocron_nonprod",
        "POST /api/chat-runs {conversationId:020, msg:'seed row'} completed",
        "select count(*) from chat_messages where conversation_id='00000000-0000-0000-0000-000000000020' returns 2"
      ]
    },
    "ci_fast_lane_no_coldboot_env": {
      "description": "COLDBOOT_IT is unset or 0, matching the CI fast-lane environment; the test must skip-with-reason, not pass.",
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
      "description": "GIVEN a real harness --run produces dev-client-setup.json WHEN the corrected regex [a-z0-9+-]+ runs THEN it matches server-list+already-running (or another documented mode) AND the old [a-z-]+ does not.",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'dev-client mode'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + real harness artifact + documented mode grammar",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["stub", "empty", "mock", "static", "old-regex", "weakened-regex", "missing-mode-field"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "harness_run_with_dev_client_setup_present",
            "action": { "actor": "operator", "steps": ["Run scripts/e2e/run-maestro-reference-flow.sh --run.", "Inspect .tmp/maestro-reference-flow/dev-client-setup.json.", "Run the dev-client-mode vitest case."] },
            "end_state": {
              "must_observe": ["dev-client-setup.json mode field matches regex [a-z0-9+-]+ (>= 1 match)", "mode value in set {'tutorial','server-list+tutorial','server-list+already-running','already-running'}", "old regex [a-z-]+ returns 0 matches against mode value (proving fix required)"],
              "must_not_observe": ["empty/start signature: mode field absent", "mode value contains characters outside [a-z0-9+-]", "test passes against a permissive .* regex"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN conversation 020 seeded with 2 rows WHEN the named test runs THEN reset returns ok:true with count:0 AND re-running reset is idempotent.",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli + real Postgres holocron_nonprod + real POST /api/chat-runs",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "no-reset", "reset-no-op", "reset-wrong-db", "non-idempotent"] },
        "evidence": { "artifact_type": "db_query", "required_capture": true },
        "cases": [
          {
            "start_ref": "conversation_020_seeded_with_two_rows",
            "action": { "actor": "api_client", "steps": ["POST /api/chat-runs to seed conversation 020 with 1 user + 1 agent row.", "Run holo namespace reset --json.", "Query chat_messages count for conversation 020.", "Re-run holo namespace reset --json and re-query."] },
            "end_state": {
              "must_observe": ["reset JSON ok:true (both runs, 2 of 2)", "chat_messages count for conversation 020: 0 after first reset (psql -tAc returns 0)", "chat_messages count for conversation 020: 0 after second reset (idempotent: 2 of 2 resets return 0)"],
              "must_not_observe": ["empty/start signature: count remains 2 (reset was a no-op)", "count: >0 after either reset", "ok:false"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN COLDBOOT_IT is unset WHEN operator runs the named test THEN it is skipped (not passed) with a reason naming the required env vars.",
      "verify": "pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts 2>&1 | rg -q 'COLDBOOT_IT'",
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
            "action": { "actor": "operator", "steps": ["Run the named test without COLDBOOT_IT=1.", "Inspect the vitest report."] },
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
      "description": "Corrected mode regex [a-z0-9+-]+ matches server-list+already-running; old [a-z-]+ does not",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/sprint20-maestro-harness-artifacts.test.ts -t 'dev-client mode'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Named test title 'namespace reset returns conversation 020 to a deterministic zero-message state' present and passing with idempotency",
      "verify": "PLATFORM_IT=1 COLDBOOT_IT=1 pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts -t 'namespace reset returns conversation 020 to a deterministic zero-message state'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Without COLDBOOT_IT=1, the named test is skipped (not passed) with a reason",
      "verify": "pnpm vitest run tests/integration/sprint20-coldboot-journey.test.ts 2>&1 | rg -q 'COLDBOOT_IT'",
      "maps_to_ac": "AC-3"
    }
  ]
}
-->
