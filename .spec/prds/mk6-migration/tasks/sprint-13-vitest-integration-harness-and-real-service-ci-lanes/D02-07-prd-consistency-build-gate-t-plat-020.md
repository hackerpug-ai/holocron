# D02-07 — PRD-consistency build gate (T-PLAT-020)
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: devops-engineer
> Estimate: 120 min
> Type: FEATURE
> Priority: P0
> Proposed by: devops-engineer
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Implement T-PLAT-020 PRD-consistency build gate that derives counts and fails on drift.

**Success state:** `holo prd:consistency` exits 0 on current PRD with derived 60 tables and 44 tools; seeded stale fixture exits non-zero naming the drifted stat.

## Background

- **Specialist rationale:** Owns machine-readable build gates that derive PRD counts/links from authoritative artifacts and fail closed on drift.
- **Planning rationale:** T-PLAT-020 and 13-prd-consistency.md require a build gate that keeps README/e2e quick-stats honest as the PRD evolves; Sprint 13 human gate step 5 requires pass on current PRD and fail on a seeded stale count.
- **How to verify (human):** Run `bun services/platform/src/cli/holo.ts prd:consistency` green on the real PRD tree; inject a stale table/tool count fixture and observe non-zero exit naming the drifted field.
- **Scope:** prd consistency CLI/module, fixtures for stale counts, integration tests, optional workflow step hook. Does not rewrite the whole PRD.
- **PRD refs:** T-PLAT-020, 13-prd-consistency

## Critical Constraints

### MUST
- MUST derive counts from authoritative files (12-convex-source-catalog.yaml, 14-mcp-compatibility-manifest.yaml, UC markdowns, technical-requirements index) rather than hand-copied constants alone
- MUST exit 0 on the current PRD tree and non-zero on a seeded stale count fixture
- MUST check at least: 60 catalog tables, 44 MCP tools, unique UC IDs, technical-section index links, version/date claims

### NEVER
- NEVER hardcode only the expected totals without reading the authoritative artifacts
- NEVER pass when a quick-stat in README disagrees with derived totals
- NEVER treat future-dated protocol claims as green

### STRICTLY
- STRICTLY machine-readable --json output names each check id, expected, actual, and verdict
- STRICTLY stale-count fixture is committed under tests/fixtures and used by the negative control
- STRICTLY reuses patterns from catalog:verify and mcp:verify-manifest fail-closed gates

## Specification

**Objective:** Implement T-PLAT-020 PRD-consistency build gate that derives counts and fails on drift.

**Success state:** `holo prd:consistency` exits 0 on current PRD with derived 60 tables and 44 tools; seeded stale fixture exits non-zero naming the drifted stat.

## Acceptance Criteria

### AC-1: Current PRD consistency passes with derived 60/44 [PRIMARY]
**GIVEN:** The live mk6-migration PRD tree is present.
**WHEN:** The operator runs `holo prd:consistency --json`.
**THEN:** Exit 0; derived catalog_tables=60; mcp_tools=44; unique UC IDs reported; all checks verdict=pass.
**VERIFY:** `bun services/platform/src/cli/holo.ts prd:consistency --json`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + authoritative PRD files on disk
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + authoritative PRD files on disk",
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
      "start_ref": "current_prd_tree",
      "action": {
        "actor": "operator",
        "steps": [
          "Run holo prd:consistency --json against the real PRD root.",
          "Capture exit code and derived counts."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 0",
          "catalog_tables: 60",
          "mcp_tools: 44",
          "verdict: 'pass'"
        ],
        "must_not_observe": [
          "empty/start signature: `exitCode: 1` OR count: 0",
          "catalog_tables: 0",
          "empty/start signature: `hand_copied_only: true` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-2: Seeded stale count fails closed
**GIVEN:** A committed stale-count fixture disagrees with authoritative catalog/manifest totals.
**WHEN:** The operator runs prd:consistency against that fixture root.
**THEN:** Exit non-zero naming the drifted field (tables_count or tools_count) with expected vs actual.
**VERIFY:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + committed stale fixture tree
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + committed stale fixture tree",
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
      "start_ref": "stale_count_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "Run prd:consistency on stale-count fixture root.",
          "Inspect failed check id and expected/actual."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "failed_check matches 'tables_count' OR 'tools_count'",
          "stale_count_delta: expected != actual == true"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `verdict: 'pass'` OR count: 0",
          "empty failed_check"
        ]
      }
    }
  ]
}
```

### AC-3: Broken index/cross-reference fails
**GIVEN:** A fixture index links to a missing technical-requirements file.
**WHEN:** prd:consistency runs on that fixture.
**THEN:** Exit non-zero with BROKEN_INDEX_LINK (or equivalent) naming the missing path.
**VERIFY:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + broken-link fixture tree
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + broken-link fixture tree",
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
      "start_ref": "broken_index_link_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "Run prd:consistency on broken-link fixture.",
          "Capture error code and missing path."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "errorCode: 'BROKEN_INDEX_LINK'",
          "must_observe_literal: `missing_path is non-empty` count: 1"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `ignored broken links` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: Future-dated protocol claim fails
**GIVEN:** A fixture asserts a future-dated protocol/date claim.
**WHEN:** prd:consistency runs on that fixture.
**THEN:** Exit non-zero naming the future-dated claim.
**VERIFY:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + future-date fixture tree
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + future-date fixture tree",
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
      "start_ref": "future_dated_protocol_fixture",
      "action": {
        "actor": "operator",
        "steps": [
          "Run prd:consistency on future-date fixture.",
          "Capture failed check for protocol/date."
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode: 1",
          "failed_check matches 'protocol_date' OR 'future_dated_claim'"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `verdict: 'pass'` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-5: Unique UC IDs and coverage inventory derived
**GIVEN:** Live UC markdown files under mk6-migration.
**WHEN:** prd:consistency runs on the current PRD.
**THEN:** Output lists unique UC IDs with no duplicates and reports AC coverage inventory non-zero.
**VERIFY:** `bun services/platform/src/cli/holo.ts prd:consistency --json | tee /tmp/prd-consistency.json && python3 -c "import json;d=json.load(open('/tmp/prd-consistency.json')); assert d['uc_unique'] is True and d['uc_count']>=20"`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** holo CLI + UC markdown files
**TDD_STATE:** none
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "holo CLI + UC markdown files",
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
      "start_ref": "current_prd_tree",
      "action": {
        "actor": "operator",
        "steps": [
          "Run prd:consistency --json.",
          "Assert uc_unique true and uc_count >= 20."
        ]
      },
      "end_state": {
        "must_observe": [
          "uc_unique: true",
          "uc_count: >=20",
          "ac_coverage_entries: >=1"
        ],
        "must_not_observe": [
          "empty/start signature: `duplicate UC IDs` OR count: 0",
          "uc_count: 0",
          "empty UC inventory with pass"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | prd:consistency exits 0 on the live mk6-migration PRD tree | AC-1 | `bun services/platform/src/cli/holo.ts prd:consistency --json` | happy_path |
| TC-2 | Derived catalog_tables equals 60 when authoritative catalog is read | AC-1 | `bun services/platform/src/cli/holo.ts prd:consistency --json` | happy_path |
| TC-3 | Derived mcp_tools equals 44 when authoritative manifest is read | AC-1 | `bun services/platform/src/cli/holo.ts prd:consistency --json` | happy_path |
| TC-4 | prd:consistency exits non-zero on the stale-count fixture | AC-2 | `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json` | error |
| TC-5 | prd:consistency exits non-zero on the broken-link fixture | AC-3 | `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json` | error |
| TC-6 | prd:consistency exits non-zero on the future-date fixture | AC-4 | `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json` | error |
| TC-7 | prd:consistency reports uc_unique true with uc_count at least 20 | AC-5 | `bun services/platform/src/cli/holo.ts prd:consistency --json` | edge |

## Reading List

- `.spec/prds/mk6-migration/10-technical-requirements/13-prd-consistency.md` (all) — Constitution for the gate
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` (50-51) — T-PLAT-020 row
- `.spec/prds/mk6-migration/README.md` (60-90) — Quick-stats that must be derived
- `services/platform/src/catalog/verify.ts` (all) — Fail-closed derive pattern for 60 tables
- `services/platform/src/cli/holo.ts` (135-200,496-600) — catalog:verify / mcp:verify-manifest CLI patterns to mirror
- `.spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml` (1-40) — Authoritative table inventory
- `.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml` (1-40) — Authoritative 44-tool inventory

## Guardrails

### WRITE-ALLOWED
- services/platform/src/cli/holo.ts (MODIFY — prd:consistency command)
- services/platform/src/prd/consistency.ts (NEW)
- services/platform/tests/integration/prd-consistency.test.ts (NEW)
- tests/fixtures/prd-consistency/stale-count/ (NEW)
- tests/fixtures/prd-consistency/broken-link/ (NEW)
- tests/fixtures/prd-consistency/future-date/ (NEW)
- package.json (MODIFY — optional script prd:consistency)
- .github/workflows/prd-consistency.yml (NEW optional thin wrapper) OR docs/ci note for D02-05 to invoke

### WRITE-PROHIBITED
- .spec/prds/mk6-migration/04-uc-*.md content rewrites beyond fixture copies under tests/
- services/platform/src/db/schema/**
- app/**
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — do not touch Sprint 12 evidence

### Boundaries
- **always:** Derive from authoritative YAML/MD files, Emit machine-readable failed_check ids
- **ask_first:** Auto-rewriting README stats in-place during the gate (prefer report-only unless explicitly desired)
- **never:** Pass on hand-copied constants without reading artifacts, Skip stale fixture negative control

## Design

- **references:** .spec/prds/mk6-migration/10-technical-requirements/13-prd-consistency.md, services/platform/src/catalog/verify.ts, services/platform/src/cli/holo.ts
- **pattern:** CLI command loads catalog YAML + MCP manifest + UC globs + README stats; compares derived vs documented; returns structured checks[].
- **pattern_source:** services/platform/src/catalog/verify.ts
- **anti_pattern:** A unit test that asserts 60===60 without opening the catalog file, or a gate that only greps README.
- note: May be invoked from the fast CI lane (D02-05) as a cheap every-commit gate
- note: Reuses catalog-loader and MCP manifest parsers where possible

## Agent Assignment

- **implementer:** devops-engineer — Owns machine-readable build gates that derive PRD counts/links from authoritative artifacts and fail closed on drift.
- **reviewer:** mastra-reviewer — Must verify derivation from catalog/manifest/UC files rather than hand-copied constants, consistent with catalog:verify and mcp:verify-manifest gates.

## Verification Gates

- **AC-1 live pass:** `bun services/platform/src/cli/holo.ts prd:consistency --json` → Exit 0; tables 60; tools 44
- **AC-2 stale fail:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json` → Exit non-zero; failed_check set
- **AC-3 broken link fail:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json` → Exit non-zero; BROKEN_INDEX_LINK
- **AC-4 future date fail:** `bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json` → Exit non-zero
- **AC-5 UC inventory:** `bun services/platform/src/cli/holo.ts prd:consistency --json` → uc_unique true; uc_count>=20
- **Scope compliance:** `git diff --name-only HEAD~1 HEAD | sort -u` → Only write_allowed paths

## Coding Standards

- RULES.md
- brain/docs/kanban/TASK-TEMPLATE.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md

## Dependencies

- **depends_on:** —
- **blocks:** —

## Notes

Authoritative counts: 60 tables from 12-convex-source-catalog.yaml; 44 tools from 14-mcp-compatibility-manifest.yaml; UC set from 04–08 UC markdown files. Optional workflow file is allowed but D02-05 may instead call the CLI from the fast lane — either is fine if gate step 5 is operator-runnable via holo.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-07",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "current_prd_tree": {
      "description": "Live .spec/prds/mk6-migration tree with authoritative catalog, MCP manifest, UC files, README stats.",
      "seed_method": "cli",
      "entrypoint": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "records": [
        "catalog path: .spec/prds/mk6-migration/10-technical-requirements/12-convex-source-catalog.yaml",
        "manifest path: .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml",
        "README quick-stats present"
      ]
    },
    "stale_count_fixture": {
      "description": "Committed fixture that rewrites a documented quick-stat to a wrong table or tool count while leaving authoritative files correct.",
      "seed_method": "migration_fixture",
      "entrypoint": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json",
      "records": [
        "documented_tables: 59 (stale)",
        "authoritative_tables: 60",
        "expected failure field: tables_count or tools_count"
      ]
    },
    "broken_index_link_fixture": {
      "description": "Fixture README/index pointing at a missing technical-requirements section file.",
      "seed_method": "migration_fixture",
      "entrypoint": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json",
      "records": [
        "broken link path present",
        "expected errorCode BROKEN_INDEX_LINK or equivalent"
      ]
    },
    "future_dated_protocol_fixture": {
      "description": "Fixture claiming a future protocol/date beyond allowed claims.",
      "seed_method": "migration_fixture",
      "entrypoint": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json",
      "records": [
        "future-dated protocol claim",
        "expected non-zero exit"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN live PRD tree WHEN prd:consistency runs THEN exit 0 with catalog_tables=60 mcp_tools=44 verdict=pass.",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-1",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + authoritative PRD files on disk",
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
            "start_ref": "current_prd_tree",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo prd:consistency --json against the real PRD root.",
                "Capture exit code and derived counts."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 0",
                "catalog_tables: 60",
                "mcp_tools: 44",
                "verdict: 'pass'"
              ],
              "must_not_observe": [
                "empty/start signature: `exitCode: 1` OR count: 0",
                "catalog_tables: 0",
                "empty/start signature: `hand_copied_only: true` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN stale-count fixture WHEN prd:consistency runs THEN exit 1 with failed tables/tools check.",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json",
      "maps_to_ac": "AC-2",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + committed stale fixture tree",
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
            "start_ref": "stale_count_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "Run prd:consistency on stale-count fixture root.",
                "Inspect failed check id and expected/actual."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "failed_check matches 'tables_count' OR 'tools_count'",
                "stale_count_delta: expected != actual == true"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `verdict: 'pass'` OR count: 0",
                "empty failed_check"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN broken-link fixture WHEN prd:consistency runs THEN exit 1 BROKEN_INDEX_LINK.",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json",
      "maps_to_ac": "AC-3",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + broken-link fixture tree",
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
            "start_ref": "broken_index_link_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "Run prd:consistency on broken-link fixture.",
                "Capture error code and missing path."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "errorCode: 'BROKEN_INDEX_LINK'",
                "must_observe_literal: `missing_path is non-empty` count: 1"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `ignored broken links` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN future-date fixture WHEN prd:consistency runs THEN exit 1 on protocol/date claim.",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json",
      "maps_to_ac": "AC-4",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + future-date fixture tree",
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
            "start_ref": "future_dated_protocol_fixture",
            "action": {
              "actor": "operator",
              "steps": [
                "Run prd:consistency on future-date fixture.",
                "Capture failed check for protocol/date."
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode: 1",
                "failed_check matches 'protocol_date' OR 'future_dated_claim'"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `verdict: 'pass'` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN live UC files WHEN prd:consistency runs THEN uc_unique true and uc_count>=20.",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-5",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo CLI + UC markdown files",
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
            "start_ref": "current_prd_tree",
            "action": {
              "actor": "operator",
              "steps": [
                "Run prd:consistency --json.",
                "Assert uc_unique true and uc_count >= 20."
              ]
            },
            "end_state": {
              "must_observe": [
                "uc_unique: true",
                "uc_count: >=20",
                "ac_coverage_entries: >=1"
              ],
              "must_not_observe": [
                "empty/start signature: `duplicate UC IDs` OR count: 0",
                "uc_count: 0",
                "empty UC inventory with pass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "prd:consistency exits 0 on the live mk6-migration PRD tree",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Derived catalog_tables equals 60 when authoritative catalog is read",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Derived mcp_tools equals 44 when authoritative manifest is read",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "prd:consistency exits non-zero on the stale-count fixture",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/stale-count --json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "prd:consistency exits non-zero on the broken-link fixture",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/broken-link --json",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "prd:consistency exits non-zero on the future-date fixture",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --root tests/fixtures/prd-consistency/future-date --json",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "prd:consistency reports uc_unique true with uc_count at least 20",
      "verify": "bun services/platform/src/cli/holo.ts prd:consistency --json",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
