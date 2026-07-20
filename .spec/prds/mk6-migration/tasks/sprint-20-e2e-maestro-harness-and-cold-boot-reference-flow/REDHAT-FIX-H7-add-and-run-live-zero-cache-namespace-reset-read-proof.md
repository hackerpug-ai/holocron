# REDHAT-FIX-H7 — Add and run the live Zero-cache namespace reset/read proof, including deterministic seed and replica membership assertions
> Status: ✅ Completed
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` H7 (High)

## Outcome

`services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts` exists, runs under `PLATFORM_IT=1` against the real nonprod namespace, and proves the four D03-04 live-zero-cache claims that `namespace-reset.json` alone cannot substantiate: (1) after `holo namespace reset`, a real zero-cache instance pointed at the same DATABASE_URL returns the reference conversation row with zero chat_messages; (2) two consecutive resets produce an identical zero_pub-scoped fingerprint; (3) `holo repl:status --json` reports `ok:true` with `conversations` and `chat_messages` in zero_pub membership after reset; (4) the test skips-with-reason (does NOT pass) when `PLATFORM_IT != 1`.

**Success state:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts` passes all four ACs against real holocron_nonprod Postgres + a real spawned zero-cache; running it without `PLATFORM_IT=1` prints a skip reason naming the required env vars; the existing `namespace-reset.json` CLI artifact is no longer the sole evidence of reset determinism.

## Background

- **Specialist rationale:** Red-hat H7 (High) shows D03-04:48-55,169-176,219 verifies `services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts`; that path is absent. The current `namespace-reset.json` proves only the CLI reset (`ok:true`, 122 tables truncated, three fixture IDs) — it does NOT prove a live Zero query returns the reference conversation and zero messages. Reset determinism is proven at most against Postgres/CLI output, contrary to D03-04's explicit real-zero-cache constraint (MUST/NEVER/STRICTLY).
- **Planning rationale:** This task unblocks D03-04 AC-1/AC-2/AC-3 (all FAIL/PARTIAL in the review verdict table) and is upstream of REDHAT-FIX-H5 (the durable Zero-synced message test) — both depend on the same substrate but this task owns the reset baseline proof. It also feeds the capstone verifier (REDHAT-FIX-H1) which derives `coldboot_gate: green` from real zero-cache evidence.
- **How to verify (human):** Set `PLATFORM_IT=1 DATABASE_URL=...holocron_nonprod... ZERO_ADMIN_PASSWORD=...` and run the test; observe a passing result that prints the zero-cache row content and the identical fingerprints; then run with `ZERO_CACHE_DISABLED=1` and confirm AC-1 fails RED.
- **Scope:** One new integration test file. Does NOT modify `services/platform/src/db/seed.ts`, `services/platform/src/db/zero-sync-check.ts`, the CLI, or the zero-cache itself — those are owned by D03-04 / S-COLDBOOT-01.
- **PRD refs:** UC-SYNC-01, 10-e2e-testing, D03-04 AC-1/AC-2/AC-3

## Critical Constraints

### MUST
- MUST spawn a real zero-cache process against the real nonprod DATABASE_URL (via the same `pnpm exec zero-cache` invocation `scripts/e2e/run-maestro-reference-flow.sh:57-64` uses) and query it via its HTTP/`@rocicorp/zero` client — NOT a Postgres SELECT, NOT a CLI stdout scrape
- MUST assert the seeded reference conversation is queryable through the live zero-cache with title `'Sprint 20 reference conversation'` AND `chat_messages` count for that conversation equal to zero
- MUST compute a zero_pub-scoped fingerprint over `conversations`+`chat_messages` rows after each of two consecutive resets and assert they are byte-identical (sha256 hex equality)
- MUST query `holo repl:status --json` after reset and assert the membership array contains the literal strings `"conversations"` and `"chat_messages"` AND `ok:true`

### NEVER
- NEVER substitute the `namespace-reset.json` CLI artifact or a Postgres-only SELECT for the live zero-cache read — that is the bug this task exists to fix
- NEVER mock the zero-cache process or its HTTP/`@rocicorp/zero` client response; the test is integration-tier against the real service or it does not run at all

### STRICTLY
- STRICTLY the test must skip-with-reason (NOT pass) when `PLATFORM_IT != 1` or `DATABASE_URL` does not contain `holocron_nonprod`, naming the required env vars — a silent pass in the CI fast lane is the bug this task exists to fix

## Specification

**Objective:** Add `services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts` per D03-04 AC-1/AC-2/AC-3 contract; prove the four live-zero-cache claims against real services.

**Success state:** Test exists, passes against real nonprod + real zero-cache, fails RED when zero-cache is unreachable, and skips with reason when `PLATFORM_IT != 1`.

## Acceptance Criteria

### AC-1: After reset, a live zero-cache returns the reference conversation with zero chat_messages [PRIMARY]
**GIVEN:** the platform is running against the nonprod namespace (`DATABASE_URL` contains `holocron_nonprod`) and the zero-cache is online
**WHEN:** the test runs `bun services/platform/src/cli/holo.ts namespace reset --json`, spawns a real zero-cache against the same DATABASE_URL, and queries it for conversation `00000000-0000-0000-0000-000000000020`
**THEN:** the zero-cache returns the reference conversation with title `'Sprint 20 reference conversation'` AND zero `chat_messages` rows for that conversation — proving the reset is visible through the live replication path, not only through the CLI/Postgres
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real-nonprod-postgres + real-zero-cache + holo-cli
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real-nonprod-postgres + real-zero-cache + holo-cli",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "postgres-only", "zero-cache-disabled", "reset-no-op"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "nonprod_namespace_dirty_with_zero_pub",
      "action": { "actor": "operator", "steps": ["Run holo namespace reset --json against holocron_nonprod.", "Spawn a real zero-cache against the same DATABASE_URL.", "Query the zero-cache for conversation 020 and its messages."] },
      "end_state": {
        "must_observe": ["conversation title: 'Sprint 20 reference conversation'", "chat_messages count for conversation 020: 0", "zero-cache HTTP/query status: 200 (not a CLI/Postgres scrape)"],
        "must_not_observe": ["empty/start signature: conversation not found via zero-cache", "chat_messages count: >0 (reset did not propagate)", "ok:false in reset JSON"]
      }
    }
  ]
}
```

### AC-2: Two consecutive resets emit an identical zero_pub-scoped fingerprint
**GIVEN:** holocron_nonprod has been migrated with `zero_pub` publishing `conversations`+`chat_messages` (Sprint 04/13 substrate)
**WHEN:** the test runs `holo namespace reset --json` twice and extracts the zero_pub-scoped fingerprint from each run's JSON output
**THEN:** both runs report an identical `zero_pub_fingerprint` (sha256 hex, 64 chars) AND `chat_messages_count: 0` in both outputs — proving the reset reaches a deterministic baseline through the same replication path
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-2'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo-cli + real Postgres holocron_nonprod zero_pub
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo-cli + real Postgres holocron_nonprod zero_pub",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "fingerprint-drift", "no-reset"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "nonprod_namespace_dirty_with_zero_pub",
      "action": { "actor": "operator", "steps": ["Run holo namespace reset --json, capture zero_pub_fingerprint as fp1.", "Run holo namespace reset --json again, capture zero_pub_fingerprint as fp2.", "Compare fp1 and fp2 as sha256 hex strings."] },
      "end_state": {
        "must_observe": ["fp1 === fp2 (64-char sha256 hex equality)", "chat_messages_count: 0 in both reset JSON outputs"],
        "must_not_observe": ["empty/start signature: fingerprint drift", "fp1 !== fp2"]
      }
    }
  ]
}
```

### AC-3: holo repl:status confirms zero_pub membership for conversations + chat_messages after reset
**GIVEN:** reset has just run
**WHEN:** the test runs `bun services/platform/src/cli/holo.ts repl:status --json`
**THEN:** the JSON reports `ok:true` AND the `membership` array contains the literal strings `"conversations"` and `"chat_messages"` — proving zero_pub membership survives the truncate/reseed cycle
**VERIFY:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-3'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron_nonprod zero_pub
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron_nonprod zero_pub",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-membership"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "nonprod_namespace_after_reset",
      "action": { "actor": "operator", "steps": ["Run holo namespace reset --json.", "Run holo repl:status --json.", "Assert membership includes conversations and chat_messages."] },
      "end_state": {
        "must_observe": ["ok: true", "membership array contains the literal string \"conversations\"", "membership array contains the literal string \"chat_messages\""],
        "must_not_observe": ["empty/start signature: membership array missing conversations or chat_messages", "ok: false"]
      }
    }
  ]
}
```

### AC-4: Test skips with reason (NOT passes) when PLATFORM_IT is unset
**GIVEN:** `PLATFORM_IT` is unset or `0`, OR `DATABASE_URL` does not contain `holocron_nonprod`
**WHEN:** the operator runs `pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts`
**THEN:** the test prints a skip message naming `PLATFORM_IT=1` and the required env vars (`DATABASE_URL=...holocron_nonprod...`, `ZERO_ADMIN_PASSWORD=...`) and reports `skipped` (NOT `passed`)
**VERIFY:** `pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts 2>&1 | rg -q 'PLATFORM_IT'`
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
      "start_ref": "ci_fast_lane_no_platform_it_env",
      "action": { "actor": "operator", "steps": ["Run the test without PLATFORM_IT=1.", "Inspect the vitest report."] },
      "end_state": {
        "must_observe": ["test status: skipped (NOT passed)", "test stderr contains the literal 'PLATFORM_IT' and at least 1 env var name"],
        "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | A real zero-cache query after reset returns the reference conversation with zero chat_messages | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'` | happy_path |
| TC-2 | Two consecutive resets emit identical zero_pub-scoped fingerprints | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-2'` | happy_path |
| TC-3 | `holo repl:status --json` reports ok:true with conversations+chat_messages in membership after reset | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-3'` | happy_path |
| TC-4 | Without `PLATFORM_IT=1`, the test is skipped (not passed) with a reason | AC-4 | `pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts 2>&1 \| rg -q 'PLATFORM_IT'` | guard |

## Reading List

1. `services/platform/src/db/seed.ts` (1-160) [PRIMARY PATTERN] — the existing `holo namespace reset` truncate+reseed+fingerprint logic this test exercises
2. `services/platform/src/db/repl-status.ts` (1-60) — the existing zero_pub membership check pattern this test invokes via the CLI
3. `services/platform/src/db/schema/zero-pub.ts` (1-40) — `ZERO_PUB_TABLE_NAMES`, the published table set this test must prove synced
4. `services/platform/tests/integration/replication-ready.test.ts` (1-60) — existing Postgres-side zero_pub proof pattern (extend to a live zero-cache read, don't duplicate)
5. `scripts/e2e/run-maestro-reference-flow.sh` (52-93) — real zero-cache boot invocation (lines 57-64) this test must reuse, not a mocked equivalent
6. `.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow/D03-04-extend-deterministic-seed-reset-to-zero-synced-namespace.md` (48-55,169-176,219) — original D03-04 AC-1/AC-2/AC-3 contract this task fulfills
7. `.spec/reviews/red-hat-sprint-20-20260719T204500Z.md` (65-69) — H7 finding: live zero-cache proof absent

## Guardrails

### WRITE-ALLOWED
- services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts (NEW)

### WRITE-PROHIBITED
- services/platform/src/db/seed.ts — owned by D03-04; this test only invokes the CLI
- services/platform/src/db/zero-sync-check.ts — owned by D03-04
- services/platform/src/cli/holo.ts — owned by D03-04 (modulo REDHAT-FIX-H10 capstone replay contracts)
- services/platform/src/db/schema/** — Sprint 04 owns domain schema shape
- app/** — client out of scope

### Boundaries
- **always:** Spawn a real zero-cache process and query it via HTTP/`@rocicorp/zero`; reuse the harness's exact zero-cache invocation; include a skip-with-reason guard
- **ask_first:** Seeding additional fixture conversations if the reference conversation id conflicts with an existing row
- **never:** Treating the `namespace-reset.json` CLI artifact or a Postgres SELECT as proof of zero-cache visibility; mocking the zero-cache process or its client

## Design

- **references:** services/platform/src/db/seed.ts, services/platform/src/db/repl-status.ts, scripts/e2e/run-maestro-reference-flow.sh
- **pattern:** Vitest integration test. Setup: skip-with-reason unless `PLATFORM_IT=1` and `DATABASE_URL` matches `/holocron_nonprod/`. AC-1: spawn a real `pnpm exec zero-cache --upstream-db "$DATABASE_URL" --cvr-db "$DATABASE_URL" --change-db "$DATABASE_URL" --app-publications zero_pub --port "$ZERO_PORT" --admin-password "$ZERO_ADMIN_PASSWORD"` (mirroring `run-maestro-reference-flow.sh:57-64`), wait for `/keepalive` to return 200, run `holo namespace reset --json`, then query the zero-cache via its HTTP/`@rocicorp/zero` client for conversation 020. Assert title and zero messages. AC-2: capture `zero_pub_fingerprint` from two consecutive reset runs, compare as sha256 hex. AC-3: run `holo repl:status --json` and assert membership literals.
- **pattern_source:** scripts/e2e/run-maestro-reference-flow.sh:57-93 (zero-cache boot + readiness check)
- **anti_pattern:** Asserting `ok:true` in `namespace-reset.json` as proof of zero-cache visibility — that proves the CLI ran, not that the live replication path carries the seeded rows.

## Agent Assignment

- **implementer:** devops-engineer — owns namespace reset/seed path proof (same as D03-04)
- **reviewer:** mastra-reviewer — verifies the test queries a real zero-cache, not a Postgres SELECT; verifies the skip-with-reason guard

## Verification Gates

- **AC-1 live zero-cache visibility:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'` → Exit 0
- **AC-2 fingerprint idempotent:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-2'` → Exit 0; fp1 === fp2
- **AC-3 membership survives reset:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-3'` → Exit 0
- **AC-4 skip-with-reason:** `pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts 2>&1 | rg -q 'PLATFORM_IT'` → Exit 0
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** D03-04 (defines the reset/fingerprint contract this test verifies), REDHAT-FIX-H5 (sister task — both depend on the same zero-cache substrate; H7 owns the reset baseline, H5 owns the durable message read)
- **blocks:** D03-04 AC-1/AC-2/AC-3 (FAIL/PARTIAL → PASS), D03-07 AC-1 (capstone needs deterministic seed proof), REDHAT-FIX-H1 (capstone verifier consumes zero-cache evidence), the Sprint-20 close handshake

## Notes

The current `namespace-reset.json` is a CLI stdout scrape that proves `ok:true`, 122 truncated tables, and three fixture IDs — it does NOT prove the live zero-cache path carries those rows to a client. This test is the contract D03-04 promised: "MUST prove the seeded reference conversation is queryable through a real zero-cache instance pointed at the same DATABASE_URL after holo namespace reset, not only via direct Postgres SELECT" (D03-04 MUST constraint, line 29). The test MUST spawn its own zero-cache (not rely on a long-lived daemon) so the proof is self-contained and replayable from a clean checkout.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H7",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "nonprod_namespace_dirty_with_zero_pub": {
      "description": "holocron_nonprod is migrated with zero_pub publishing conversations+chat_messages (Sprint 04/13 substrate); the namespace has stale rows from prior runs. PLATFORM_IT=1 is set, DATABASE_URL contains holocron_nonprod, and a real zero-cache can be spawned.",
      "seed_method": "migration_fixture",
      "records": [
        "DATABASE_URL contains 'holocron_nonprod'",
        "zero_pub publication exists with conversations+chat_messages as members",
        "PLATFORM_IT=1 is set"
      ]
    },
    "nonprod_namespace_after_reset": {
      "description": "holo namespace reset --json has just run successfully; the reference conversation is reseeded and chat_messages for conversation 020 is zero.",
      "seed_method": "cli",
      "records": [
        "namespace reset returned ok:true",
        "reference conversation 020 reseeded with title 'Sprint 20 reference conversation'"
      ]
    },
    "ci_fast_lane_no_platform_it_env": {
      "description": "PLATFORM_IT is unset or 0, OR DATABASE_URL does not contain holocron_nonprod — matching the CI fast-lane environment; the test must skip-with-reason, not pass.",
      "seed_method": "cli",
      "records": [
        "PLATFORM_IT unset",
        "ci-fast.yml context"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN nonprod namespace dirty with zero_pub WHEN reset runs and a real zero-cache queries it THEN the reference conversation appears with zero messages via the live replication path.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real-nonprod-postgres + real-zero-cache + holo-cli",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "postgres-only", "zero-cache-disabled", "reset-no-op"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "nonprod_namespace_dirty_with_zero_pub",
            "action": { "actor": "operator", "steps": ["Run holo namespace reset --json against holocron_nonprod.", "Spawn a real zero-cache against the same DATABASE_URL.", "Query the zero-cache for conversation 020 and its messages."] },
            "end_state": {
              "must_observe": ["conversation title: 'Sprint 20 reference conversation'", "chat_messages count for conversation 020: 0", "zero-cache HTTP/query status: 200 (not a CLI/Postgres scrape)"],
              "must_not_observe": ["empty/start signature: conversation not found via zero-cache", "chat_messages count: >0 (reset did not propagate)", "ok:false in reset JSON"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN zero_pub-ready namespace WHEN reset runs twice THEN zero_pub-scoped fingerprints are byte-identical AND chat_messages_count is 0 in both outputs.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli + real Postgres holocron_nonprod zero_pub",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "fingerprint-drift", "no-reset"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "nonprod_namespace_dirty_with_zero_pub",
            "action": { "actor": "operator", "steps": ["Run holo namespace reset --json, capture zero_pub_fingerprint as fp1.", "Run holo namespace reset --json again, capture zero_pub_fingerprint as fp2.", "Compare fp1 and fp2 as sha256 hex strings."] },
            "end_state": {
              "must_observe": ["fp1 === fp2 (64-char sha256 hex equality)", "chat_messages_count: 0 in both reset JSON outputs"],
              "must_not_observe": ["empty/start signature: fingerprint drift", "fp1 !== fp2"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN reset has run WHEN repl:status runs THEN zero_pub membership for conversations/chat_messages is ok:true.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron_nonprod zero_pub",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static", "missing-membership"] },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "nonprod_namespace_after_reset",
            "action": { "actor": "operator", "steps": ["Run holo namespace reset --json.", "Run holo repl:status --json.", "Assert membership includes conversations and chat_messages."] },
            "end_state": {
              "must_observe": ["ok: true", "membership array contains the literal string \"conversations\"", "membership array contains the literal string \"chat_messages\""],
              "must_not_observe": ["empty/start signature: membership array missing conversations or chat_messages", "ok: false"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN PLATFORM_IT is unset WHEN operator runs the test THEN it is skipped (not passed) with a reason naming the required env vars.",
      "verify": "pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts 2>&1 | rg -q 'PLATFORM_IT'",
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
            "start_ref": "ci_fast_lane_no_platform_it_env",
            "action": { "actor": "operator", "steps": ["Run the test without PLATFORM_IT=1.", "Inspect the vitest report."] },
            "end_state": {
              "must_observe": ["test status: skipped (NOT passed)", "test stderr contains the literal 'PLATFORM_IT' and at least 1 env var name"],
              "must_not_observe": ["empty/start signature: test reports passed", "silent skip without naming the required env vars"]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Real zero-cache query after reset returns reference conversation with zero messages",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Zero_pub-scoped fingerprint idempotent across two consecutive resets",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "repl:status reports ok:true with conversations+chat_messages in membership after reset",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Without PLATFORM_IT=1, test is skipped (not passed) with a reason",
      "verify": "pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts 2>&1 | rg -q 'PLATFORM_IT'",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
