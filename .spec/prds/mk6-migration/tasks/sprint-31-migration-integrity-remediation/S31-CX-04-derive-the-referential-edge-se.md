# S31-CX-04: Derive the referential edge set from the Convex source and make the FK audit gate on it

**SPRINT:** [Sprint 31](./SPRINT.md)
**AGENT:** convex-reviewer
**ESTIMATE:** 120 min
**TYPE:** FEATURE
**TDD_MODE:** red_first
**RED_GREEN_REQUIRED:** yes

> Status: Backlog
> **PROPOSED-BY:** convex-planner

## What this does

Derive and gate-enforce the referential edge set from Convex before deployment deletion.

## Why

80 referential edges in convex/schema.ts are the authoritative proof of the system's data model. After Convex deletion, this proof must live in an extracted, queryable artifact, and the audit gate must fail unless all edges have matching database constraints.

## How to verify

- Run all 0 acceptance criteria in sequence (RED → GREEN → REFACTOR per AC)
- Validate via `validate_scenario.py`: exit 0 with all PRIMARY scenarios un-fakeable
- Confirm: one test per AC, RED evidence captured, minimal implementation only

## Scope

**Must complete in this task:**
- Extract and validate the artifact per AC-1 (primary)
- Fail-closed gate implementation (AC-2 or later)
- All tests passing; no gold-plating

**Out of scope:**
- Applying constraints or implementing replacements (other sprint's work)
- Re-running one-time-only operations
- Modifying Convex source code

---

<details>
<summary>▸ Full agent specification (S31-CX-04 — required reading for implementer + reviewer)</summary>

## Task Specification: S31-CX-04

**Purpose:** convex/schema.ts declares 80 `v.id('Table')` relationships — that is the authoritative referential edge set of the system being migrated off, and it i...

**PlatformRef:** UC-DATA-05 AC-2, 01-scope.md:30

### Acceptance Criteria


### Fixtures

- **loaded_db_no_domain_fks**: the migrated Postgres database as it stands after the Sprint 29 load, with no FK constraints on domain tables


### Reading List

1. services/platform/src/etl/fk-audit.ts  [PRIMARY PATTERN] — :150-155 reads enforcedForeignKeys, :158 computes ok; this is the gate to change
2. convex/schema.ts — the 80 v.id('Table') declarations that are the authoritative edge set
3. services/platform/src/etl/run.ts — LOAD_ORDER :36-73 and buildTableOrder :375-379 alphabetical fallback
4. services/platform/src/etl/metadata.ts — resolveTargetColumnName, used to map edges to Postgres columns
5. services/platform/src/db/schema/index.ts — the 15 references() calls, to confirm which edges are actually enforced


### REQUIREMENT-CONTRACT v1

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-CX-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "loaded_db_no_domain_fks": {
      "description": "the migrated Postgres database as it stands after the Sprint 29 load, with no FK constraints on domain tables",
      "seed_method": "migration_fixture",
      "records": [
        "migrated domain tables present",
        "FOREIGN KEY constraints on migrated domain tables: 0",
        "chat_messages.conversation_id typed uuid with no constraint"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "hardcod - edge list hand-maintained instead of parsed from convex/schema.ts",
          "stub - extractor returns a fixed list",
          "empty - zero edges extracted"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "loaded_db_no_domain_fks",
          "action": {
            "actor": "cli_user",
            "steps": [
              "parse convex/schema.ts",
              "emit convex-referential-edges.json",
              "map each edge through the source catalog"
            ]
          },
          "end_state": {
            "must_observe": [
              "extracted edge count: 80 (matches v.id() declarations in convex/schema.ts)",
              "every edge carries a resolved `target` of form `table.column`",
              "edges resolving to a Postgres column: 80 of 80"
            ],
            "must_not_observe": [
              "edge count: 0 (nothing extracted)",
              "any edge with an empty or null target",
              "a placeholder edge list committed by hand"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": [
          "unchanged - ok still derived from issues.length alone",
          "stub - enforcedForeignKeys reported but not gated",
          "mock - information_schema query mocked"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "loaded_db_no_domain_fks",
          "action": {
            "actor": "cli_user",
            "steps": [
              "run `holo etl:fk-audit --json` against the migrated database"
            ]
          },
          "end_state": {
            "must_observe": [
              "report field `ok` == false",
              "unenforcedEdges array length >= 1, each naming a `table.column`",
              "exit code 1 (non-zero refusal)"
            ],
            "must_not_observe": [
              "ok == true with enforced constraint count 0",
              "unenforcedEdges empty while constraints are absent",
              "audit reporting a default pass"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "postgres",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": [
          "unchanged - buildTableOrder still appends unknown tables alphabetically",
          "hardcod - order read from the 36-element LOAD_ORDER constant",
          "empty - order computed over 0 edges"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "loaded_db_no_domain_fks",
          "action": {
            "actor": "cli_user",
            "steps": [
              "compute the load order topologically from convex-referential-edges.json",
              "emit the resolved order"
            ]
          },
          "end_state": {
            "must_observe": [
              "resolved order covers 60 of 60 source tables",
              "tables sorted alphabetically as a fallback: 0",
              "every referenced table precedes its referrer (violations: 0 across 80 edges)"
            ],
            "must_not_observe": [
              "0 edges consulted when computing order",
              "any table placed by the alphabetical default",
              "order identical to the hand-maintained LOAD_ORDER constant"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead via SendMessage once all files are written and validated.
