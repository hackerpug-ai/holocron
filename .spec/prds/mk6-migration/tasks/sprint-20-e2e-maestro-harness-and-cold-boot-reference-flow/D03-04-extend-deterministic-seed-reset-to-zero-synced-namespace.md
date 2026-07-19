# D03-04 — Extend deterministic seed/reset to the Zero-synced namespace
> Status: Backlog
> Sprint: [Sprint 20 — E2E Maestro Harness and Cold-Boot Reference Flow](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 90 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Extend `holo namespace reset`'s determinism proof to the Zero-synced replication subset by verifying the seeded conversation through a real zero-cache read, and confirm the reset baseline has zero stale chat_messages.

**Success state:** After `holo namespace reset`, a real zero-cache instance pointed at the same DATABASE_URL returns the reference conversation row and zero chat_messages for it; two consecutive resets produce identical zero_pub-scoped fingerprints.

## Background

- **Specialist rationale:** Owns the nonprod namespace seed/reset path and its extension to prove Zero-synced (not just Postgres-side) visibility of the seeded reference conversation.
- **Planning rationale:** Audit found `services/platform/src/db/seed.ts` (`holo namespace reset`) already seeds the reference conversation and truncates cleanly, and `zero_pub` already publishes `conversations`/`chat_messages` (proven Postgres-side by `replication-ready.test.ts`), but nothing proves the seeded rows are visible through a *live* zero-cache. That's the real gap this task closes.
- **How to verify (human):** Run `holo namespace reset --json`, boot a real zero-cache against the same DATABASE_URL, and confirm a query for the reference conversation returns it with zero chat_messages.
- **Scope:** `services/platform/src/db/seed.ts` fingerprint extension + a new Zero-sync integration test. Does not touch `services/platform/src/db/schema/**` or `app/**`.
- **PRD refs:** UC-SYNC-01, 10-e2e-testing

## Critical Constraints

### MUST
- MUST prove the seeded reference conversation is queryable through a real zero-cache instance pointed at the same DATABASE_URL after holo namespace reset, not only via direct Postgres SELECT
- MUST leave zero prior chat_messages for the reference conversation immediately after reset (clean baseline for the next Maestro run)
- MUST keep the existing REFUSE_PROD_SEED guard intact through this extended path

### NEVER
- NEVER treat a passing Postgres-only check as sufficient proof of Zero-synced determinism
- NEVER mock the zero-cache process or a zero-cache client query in the proof

### STRICTLY
- STRICTLY the zero_pub-scoped fingerprint (conversations+chat_messages) is idempotent across two consecutive resets, matching D02-02's whole-DB fingerprint contract

## Specification

**Objective:** Extend holo namespace reset's determinism proof to the Zero-synced replication subset by verifying the seeded conversation through a real zero-cache read, and confirm the reset baseline has zero stale chat_messages.

**Success state:** After holo namespace reset, a real zero-cache instance pointed at the same DATABASE_URL returns the reference conversation row and zero chat_messages for it; two consecutive resets produce identical zero_pub-scoped fingerprints.

## Acceptance Criteria

### AC-1: Reset proven visible through a live zero-cache read [PRIMARY]
**GIVEN:** the nonprod namespace has stale conversation/message rows
**WHEN:** the operator runs `holo namespace reset --json`, boots a real zero-cache against the same DATABASE_URL, and queries it for the reference conversation
**THEN:** zero-cache returns the reference conversation with title 'Sprint 20 reference conversation' and zero chat_messages for it
**VERIFY:** `bun services/platform/src/cli/holo.ts namespace reset --json && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** real Postgres holocron_nonprod + real zero-cache
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "real Postgres holocron_nonprod + real zero-cache",
  "topology": "single-node",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "db_query", "required_capture": true },
  "cases": [
    {
      "start_ref": "dirty_zero_namespace",
      "action": { "actor": "operator", "steps": ["Run holo namespace reset --json.", "Start a real zero-cache against the same DATABASE_URL.", "Query zero-cache for the reference conversation and its messages."] },
      "end_state": {
        "must_observe": ["conversation title: 'Sprint 20 reference conversation'", "chat_messages count for conversation: 0"],
        "must_not_observe": ["empty/start signature: `conversation not found via zero-cache` OR count: 0", "chat_messages count: >0"]
      }
    }
  ]
}
```

### AC-2: Zero_pub-scoped fingerprint is idempotent across resets
**GIVEN:** holocron_nonprod has been migrated with zero_pub publishing conversations+chat_messages
**WHEN:** the operator runs `holo namespace reset --json` twice
**THEN:** both runs report an identical zero_pub-scoped fingerprint even though the whole-DB fingerprint already matched under D02-02
**VERIFY:** `bun services/platform/src/cli/holo.ts namespace reset --json && bun services/platform/src/cli/holo.ts namespace reset --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron_nonprod
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron_nonprod",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reset_zero_pub_ready",
      "action": { "actor": "operator", "steps": ["Run reset once, capture zero_pub_fingerprint.", "Run reset again, compare."] },
      "end_state": {
        "must_observe": ["zero_pub_fingerprint_run1 == zero_pub_fingerprint_run2", "chat_messages_count: 0"],
        "must_not_observe": ["empty/start signature: `zero_pub_fingerprint drift` OR count: 0"]
      }
    }
  ]
}
```

### AC-3: repl:status confirms zero_pub membership survives reset
**GIVEN:** reset has just run
**WHEN:** the operator runs `holo repl:status --json`
**THEN:** zero_pub membership includes conversations and chat_messages with ok:true, unaffected by the truncate/reseed cycle
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json`
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
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reset_zero_pub_ready",
      "action": { "actor": "operator", "steps": ["Run namespace reset.", "Run repl:status --json.", "Check conversations/chat_messages membership."] },
      "end_state": {
        "must_observe": ["ok: true", "membership array contains the literal string \"conversations\"", "membership array contains the literal string \"chat_messages\""],
        "must_not_observe": ["empty/start signature: `zero_pub missing conversations` OR count: 0", "ok: false"]
      }
    }
  ]
}
```

### AC-4: Prod guard still enforced through the extended reset path
**GIVEN:** DATABASE_URL points at production holocron without HOLO_ALLOW_PROD_SEED
**WHEN:** the operator runs `holo namespace reset --json`
**THEN:** the command exits non-zero naming REFUSE_PROD_SEED and prod zero_pub/messages are untouched
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts namespace reset --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + real Postgres holocron
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + real Postgres holocron",
  "negative_control": { "would_fail_if": ["disconnect", "stub", "empty", "mock", "static"] },
  "evidence": { "artifact_type": "stdout", "required_capture": true },
  "cases": [
    {
      "start_ref": "reset_zero_pub_ready",
      "action": { "actor": "operator", "steps": ["Point DATABASE_URL at prod holocron.", "Run namespace reset without HOLO_ALLOW_PROD_SEED.", "Check exit code and prod row baseline."] },
      "end_state": {
        "must_observe": ["exitCode: 1", "errorCode: 'REFUSE_PROD_SEED'", "prod_row_baseline_unchanged: true"],
        "must_not_observe": ["exitCode: 0", "empty/start signature: `prod chat_messages truncated` OR count: 0"]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | A real zero-cache query after reset returns the reference conversation with zero chat_messages | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'TC-1'` | happy_path |
| TC-2 | Two consecutive resets emit identical zero_pub-scoped fingerprints | AC-2 | `bun services/platform/src/cli/holo.ts namespace reset --json && bun services/platform/src/cli/holo.ts namespace reset --json` | happy_path |
| TC-3 | holo repl:status reports zero_pub membership for conversations and chat_messages after reset | AC-3 | `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json` | happy_path |
| TC-4 | namespace reset exits non-zero with REFUSE_PROD_SEED against prod without the allow flag | AC-4 | `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts namespace reset --json; test $? -ne 0` | error |

## Reading List

- `services/platform/src/db/seed.ts` (1-160) — existing namespace reset/fingerprint logic to extend with a zero_pub-scoped fingerprint
- `services/platform/src/db/repl-status.ts` (1-60) — existing zero_pub membership check pattern to reuse post-reset
- `services/platform/src/db/schema/zero-pub.ts` (1-40) — ZERO_PUB_TABLE_NAMES, the published table set this task must prove synced
- `services/platform/tests/integration/replication-ready.test.ts` (1-60) — existing Postgres-side zero_pub proof pattern (extend to a live zero-cache read, don't duplicate)
- `scripts/e2e/run-maestro-reference-flow.sh` (52-93) — real zero-cache boot invocation to reuse in the integration test

## Guardrails

### WRITE-ALLOWED
- services/platform/src/db/seed.ts (MODIFY — zero_pub-scoped fingerprint)
- services/platform/src/db/zero-sync-check.ts (NEW — live zero-cache read helper)
- services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — namespace reset --json additional fields only)
- docs/ci/nonprod-namespace.md (MODIFY — document Zero-synced verification)

### WRITE-PROHIBITED
- services/platform/src/db/schema/** — Sprint 04 owns domain schema shape
- app/** — client out of scope
- .github/workflows/** — D03-05/D03-06 own workflows

### Boundaries
- **always:** Prove Zero-sync via a live zero-cache read, Keep REFUSE_PROD_SEED intact
- **ask_first:** Any change to the whole-DB fingerprint contract from D02-02
- **never:** Declaring Zero-sync proven from Postgres-only checks, Mocking the zero-cache process

## Design

- **references:** services/platform/src/db/repl-status.ts, scripts/e2e/run-maestro-reference-flow.sh
- **pattern:** After the existing truncate+reseed in seedDatabase(), boot a short-lived real zero-cache (or reuse the harness's zero-cache invocation) pointed at the same DATABASE_URL, run one query against it for the reference conversation, and compute a zero_pub-scoped fingerprint over conversations+chat_messages rows only.
- **pattern_source:** services/platform/src/db/seed.ts:95-150
- **anti_pattern:** Declaring the reset 'Zero-synced' based solely on the existing Postgres-side zero_pub membership check without a live zero-cache read.

## Agent Assignment

- **implementer:** devops-engineer — owns namespace reset/seed path extension
- **reviewer:** mastra-reviewer — verifies real zero-cache proof, not Postgres-only

## Verification Gates

- **AC-1 zero-cache visibility:** `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'` → Reference conversation visible via zero-cache; 0 messages
- **AC-2 fingerprint idempotent:** `bun services/platform/src/cli/holo.ts namespace reset --json && bun services/platform/src/cli/holo.ts namespace reset --json` → Identical zero_pub_fingerprint both runs
- **AC-3 zero_pub survives reset:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json` → ok:true; conversations+chat_messages present
- **AC-4 prod refuse:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts namespace reset --json; test $? -ne 0` → Non-zero; REFUSE_PROD_SEED
- **Scope compliance:** `git diff --name-only | sort -u` → Only guardrails.write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** —
- **blocks:** D03-05, D03-07

## Notes

`scripts/e2e/run-maestro-reference-flow.sh` already calls `holo namespace reset --json` before boot (line 53), so the reset-before-flow wiring exists; the gap is proving that reset is meaningfully "Zero-synced," not just a Postgres truncate.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D03-04",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "dirty_zero_namespace": {
      "description": "holocron_nonprod has stale chat_messages from a prior Maestro run plus extra operator-inserted rows.",
      "seed_method": "cli",
      "records": [
        "conversations row for 00000000-0000-0000-0000-000000000020 exists with >0 chat_messages from a prior run",
        "dirty marker row present"
      ]
    },
    "reset_zero_pub_ready": {
      "description": "holocron_nonprod has been migrated with zero_pub publishing conversations+chat_messages (Sprint 04/13 substrate).",
      "seed_method": "cli",
      "records": [
        "zero_pub publication exists",
        "conversations and chat_messages are members"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a dirty zero-synced namespace WHEN namespace reset runs and a real zero-cache queries it THEN the reference conversation appears with zero messages.",
      "verify": "bun services/platform/src/cli/holo.ts namespace reset --json && PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "real Postgres holocron_nonprod + real zero-cache",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "dirty_zero_namespace",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo namespace reset --json.",
                "Start a real zero-cache against the same DATABASE_URL.",
                "Query zero-cache for the reference conversation and its messages."
              ]
            },
            "end_state": {
              "must_observe": [
                "conversation title: 'Sprint 20 reference conversation'",
                "chat_messages count for conversation: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `conversation not found via zero-cache` OR count: 0",
                "chat_messages count: >0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN zero_pub-ready namespace WHEN reset runs twice THEN zero_pub-scoped fingerprints match.",
      "verify": "bun services/platform/src/cli/holo.ts namespace reset --json && bun services/platform/src/cli/holo.ts namespace reset --json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron_nonprod",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reset_zero_pub_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Run reset once, capture zero_pub_fingerprint.",
                "Run reset again, compare."
              ]
            },
            "end_state": {
              "must_observe": [
                "zero_pub_fingerprint_run1 == zero_pub_fingerprint_run2",
                "chat_messages_count: 0"
              ],
              "must_not_observe": [
                "empty/start signature: `zero_pub_fingerprint drift` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN reset has run WHEN repl:status runs THEN zero_pub membership for conversations/chat_messages is ok:true.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron_nonprod zero_pub",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reset_zero_pub_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Run namespace reset.",
                "Run repl:status --json.",
                "Check conversations/chat_messages membership."
              ]
            },
            "end_state": {
              "must_observe": [
                "ok: true",
                "membership array contains the literal string \"conversations\"",
                "membership array contains the literal string \"chat_messages\""
              ],
              "must_not_observe": [
                "empty/start signature: `zero_pub missing conversations` OR count: 0",
                "ok: false"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN DATABASE_URL targets prod without allow flag WHEN reset runs THEN exit non-zero REFUSE_PROD_SEED with prod unchanged.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts namespace reset --json; test $? -ne 0",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + real Postgres holocron",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "reset_zero_pub_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Point DATABASE_URL at prod holocron.",
                "Run namespace reset without HOLO_ALLOW_PROD_SEED.",
                "Check exit code and prod row baseline."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errorCode: 'REFUSE_PROD_SEED'",
                "prod_row_baseline_unchanged: true"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `prod chat_messages truncated` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Real zero-cache query after reset returns reference conversation with zero messages",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/nonprod-namespace-zero-sync.test.ts -t 'TC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Zero_pub-scoped fingerprint idempotent across resets",
      "verify": "bun services/platform/src/cli/holo.ts namespace reset --json && bun services/platform/src/cli/holo.ts namespace reset --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "zero_pub membership for conversations/chat_messages survives reset",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts repl:status --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "REFUSE_PROD_SEED still enforced through extended reset path",
      "verify": "DATABASE_URL=postgres://127.0.0.1:5432/holocron env -u HOLO_ALLOW_PROD_SEED bun services/platform/src/cli/holo.ts namespace reset --json; test $? -ne 0",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
