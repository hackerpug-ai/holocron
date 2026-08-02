# REDHAT-FIX-S29-H02 — Reconcile every migrated table against immutable export/catalog evidence (H-02)

> Status: Backlog
> Task ID: REDHAT-FIX-S29-H02
> Assignee: devops-engineer
> Priority: P0
> Type: FEATURE

## What this does

Close red-hat **H-02**: read parity must compare **every** mapped migrated table against
immutable D06-04 export/catalog counts — not only documents/conversations/subscription_sources.
Tests must not overwrite ETL baseline with current DB counts immediately before verification.

## Why

Review: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md`. soak-fence.ts hardcodes three tables; soak-flip test authors baseline from current state.

## How to verify

- `rg -n 'documents|conversations|subscription_sources|expectedCounts|baseline' services/platform/src/cutover/soak-fence.ts services/platform/tests/integration/sprint29-soak-flip.test.ts`
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'parity|reconcile|table'`

## Scope

Writes: soak-fence.ts parity path, sprint29-soak-flip.test.ts, `.tmp/REDHAT-FIX-S29-H02/**`

<details>
<summary>▸ Full agent specification</summary>

================================================================================
TASK: REDHAT-FIX-S29-H02
================================================================================
TASK_TYPE: FEATURE
PRIORITY: P0
AGENT: implementer=devops-engineer | reviewer=mastra-reviewer
TDD_MODE: red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test: PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts
  typecheck: pnpm tsgo --noEmit

DONE WHEN
---------
- [ ] AC-1: parity iterates all mapped ETL target tables from catalog/export
- [ ] AC-2: baseline is immutable export artifact (not live DB overwrite in test)
- [ ] AC-3: missing/divergent table fails overall
- [ ] AC-4: typecheck clean

ACCEPTANCE CRITERIA
-------------------

### AC-1 [PRIMARY] — full table set
VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'parity|table'`
SCENARIO:
  start_ref: soak_full_parity
  MUST_OBSERVE: table count > 3 in parity report OR catalog-driven list
  MUST_NOT_OBSERVE: only three hard-coded tables as sole set

### AC-2 — immutable baseline
VERIFY: suite -t 'baseline|export|catalog'
SCENARIO:
  start_ref: soak_immutable_baseline
  MUST_OBSERVE: baseline loaded from export/catalog path
  MUST_NOT_OBSERVE: test overwrites baseline from current counts before assert

### AC-3 — fail on variance
VERIFY: suite -t 'variance|diverge'
SCENARIO:
  start_ref: soak_parity_fail
  MUST_OBSERVE: overall.ok false on forced mismatch
  MUST_NOT_OBSERVE: mismatch ignored

### AC-4 — typecheck
VERIFY: `pnpm tsgo --noEmit`

<!-- REQUIREMENT-CONTRACT v1 -->
```json
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fx-export-catalog": {
      "description": "export catalog",
      "seed_method": "public_api",
      "records": [
        "catalog"
      ]
    },
    "fx-all-tables": {
      "description": "all tables",
      "seed_method": "public_api",
      "records": [
        "tables"
      ]
    },
    "fx-mismatch": {
      "description": "mismatch",
      "seed_method": "public_api",
      "records": [
        "mismatch"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-010",
      "description": "full tables",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'parity|table'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-all-tables",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'parity|table'"
              ]
            },
            "end_state": {
              "must_observe": [
                "parity_table_count >= 4",
                "catalog_driven == true OR mapped_tables_count >= 4"
              ],
              "must_not_observe": [
                "parity_table_count == 3 only hard-coded",
                "parity_table_count == 0",
                "empty catalog"
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
      "flow_ref": "T-SYNC-010",
      "description": "immutable baseline",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'baseline|export'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-export-catalog",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'baseline|export'"
              ]
            },
            "end_state": {
              "must_observe": [
                "baseline_source == export OR baseline_source == catalog",
                "live_overwrite_before_assert == false"
              ],
              "must_not_observe": [
                "live_overwrite_before_assert == true",
                "empty baseline",
                "baseline_source == live_db"
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
      "flow_ref": "T-SYNC-010",
      "description": "variance fails",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'variance|diverge'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-mismatch",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint29-soak-flip.test.ts -t 'variance|diverge'"
              ]
            },
            "end_state": {
              "must_observe": [
                "overall.ok == false on mismatch",
                "variance_count >= 1"
              ],
              "must_not_observe": [
                "overall.ok == true on mismatch",
                "variance_count == 0 on forced mismatch",
                "empty variance ignored"
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
      "flow_ref": "T-SYNC-010",
      "description": "typecheck",
      "verify": "pnpm tsgo --noEmit",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub or mock replaces the real CLI/service boundary",
            "disconnect from real Postgres/Convex so no request is issued",
            "empty start with zero gates/tools/tables still reports green",
            "static hardcoded pass without executing the real path"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fx-all-tables",
            "action": {
              "actor": "test_suite",
              "steps": [
                "Run pnpm tsgo --noEmit"
              ]
            },
            "end_state": {
              "must_observe": [
                "typecheck exit_code == 0"
              ],
              "must_not_observe": [
                "typecheck exit_code != 0",
                "empty skip"
              ]
            }
          }
        ]
      }
    }
  ]
}
```
