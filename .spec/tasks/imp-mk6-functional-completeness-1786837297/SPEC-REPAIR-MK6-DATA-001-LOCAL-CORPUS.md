# SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS: Bind the retained composite corpus

> Status: 🔵 In Review
> Cycle: 1
> Updated: 2026-08-18T00:00:00Z
> Assignee: mastra-planner
> Reviewer: mastra-reviewer
> Priority: P0
> Type: docs
> Proposed by: operator
> Files: .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md, .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md
> Blocks: MK6-DATA-001

## Outcome

MK6-DATA-001 is executable against the retained real Convex cutover export and the post-cutover local SQLite corpus. Its static contract rejects the former fixed-witness and asserted-provenance loopholes, preserves every existing conjunctive requirement that remains truthful, and pins the exact future implementation and runtime-write surface.

## Contradiction repaired

The former contract required a sidecar that does not exist in the retained export and a synthetic witness ID absent from both the export and SQLite. It also treated the export as the sole source, which would discard local research written after cutover. Those clauses were contract-invalid for the recovered corpus and are explicitly replaced by derived composite provenance plus deterministic, byte-derived per-origin witnesses.

The retained count-equal/content-corrupt control remains AC-2. New criteria add local-delta, forged-provenance, snapshot-drift, blob, selected-document, and fixture-source controls. No implementation, import, migration, database/export/blob mutation, service start, deployment, merge, push, or worktree lifecycle action is part of this repair.

## WRITE-ALLOWED for this repair

Only these two planning artifacts may change:

1. `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md`
2. `.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md`

Everything else, including source, tests, scripts, `.tmp`, databases, exports, blobs, primary checkout, services, network state, and runtime state, is read-only.

## Static oracle

The following block is deliberately extractable and shell-valid. It validates the target's machine-readable extension and mutation-tests the oracle entirely in memory. It prints only counts and status; it does not open source corpora or print research bodies.

<!-- STATIC-ORACLE-BEGIN -->
```bash
set -euo pipefail
python3 - "$1" <<'PY'
import copy
import json
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
text = target.read_text(encoding="utf-8")
match = re.search(
    r"<!-- REQUIREMENT-CONTRACT v1 -->\s*<!--\s*(\{.*?\})\s*-->",
    text,
    re.DOTALL,
)
if match is None:
    raise SystemExit("missing REQUIREMENT-CONTRACT v1")
contract = json.loads(match.group(1))

expected_sources = [
    "MK6_DATA_CONVEX_EXPORT_DIR",
    "MK6_DATA_SQLITE_PATH",
    "MK6_DATA_SQLITE_BLOBS_DIR",
]
expected_facts = [
    "convex-export-source-bytes",
    "sqlite-import_batches",
    "sqlite-import_row_provenance",
    "sqlite-source-rows",
    "sqlite-file_objects",
]
expected_controls = [
    "count-equal-content-corrupt",
    "missing-local-delta",
    "forged-provenance",
    "source-mutated-after-snapshot",
    "missing-blob",
    "replaced-blob",
    "nonexistent-selected-document",
    "fixture-path",
]
expected_writes = [
    "services/platform/src/etl/composite-corpus.ts",
    "services/platform/src/etl/archive.ts",
    "services/platform/src/etl/run.ts",
    "services/platform/src/etl/reconcile.ts",
    "services/platform/src/etl/latest-run.ts",
    "services/platform/src/cutover/data-plane-content.ts",
    "services/platform/tests/integration/mk6-data-plane-truth-live.test.ts",
    "scripts/verify-mk6-data-plane-truth.sh",
    ".tmp/MK6-DATA-001/${RUN_ID}/**",
]
expected_formula = (
    "sha256(sourceOrigin+NUL+documents+NUL+sourceId+NUL+"
    "sha256(exactUtf8ContentBytes))"
)

def errors(candidate):
    found = []
    extension = candidate.get("data_plane_contract", {})
    snapshot = extension.get("snapshot_semantics", {})
    provenance = extension.get("provenance", {})
    witness = extension.get("witness_selection", {})
    if extension.get("schema") != "holocron.mk6.composite-corpus.v1":
        found.append("schema")
    if extension.get("sources") != expected_sources:
        found.append("sources")
    if snapshot.get("convex") != "run-scoped-copy-with-pre-post-source-sha256":
        found.append("convex-snapshot")
    if snapshot.get("sqlite") != "sqlite-backup-api-never-raw-copy":
        found.append("sqlite-snapshot")
    if provenance.get("mode") != "operator-invoked-derived-attestation":
        found.append("provenance-mode")
    if provenance.get("facts_from") != expected_facts:
        found.append("provenance-facts")
    if "source=real" not in provenance.get("forbidden_assertions", []):
        found.append("forged-provenance-rejection")
    if witness.get("origins") != ["convex", "local"]:
        found.append("witness-origins")
    if witness.get("requires_nonempty_source_bytes") is not True:
        found.append("nonempty-source-bytes")
    if witness.get("formula") != expected_formula:
        found.append("witness-formula")
    if witness.get("selection") != "lexicographically-smallest-identityKey-per-origin":
        found.append("witness-selection")
    if extension.get("negative_controls") != expected_controls:
        found.append("negative-controls")
    if extension.get("write_allowed") != expected_writes:
        found.append("write-scope")
    positive_surface = json.dumps({
        "fixtures": candidate.get("fixtures"),
        "requirements": candidate.get("requirements", [])[:1],
    })
    if "mk6-data-sentinel-1" in positive_surface:
        found.append("fixed-sentinel")
    if "_export_provenance.json" in positive_surface:
        found.append("mandatory-legacy-sidecar")
    return found

base_errors = errors(contract)
if base_errors:
    raise SystemExit("target rejected: " + ",".join(base_errors))

mutants = []
fixed_witness = copy.deepcopy(contract)
fixed_witness["data_plane_contract"]["witness_selection"]["formula"] = (
    "mk6-data-sentinel-1"
)
mutants.append(fixed_witness)

asserted_provenance = copy.deepcopy(contract)
asserted_provenance["data_plane_contract"]["provenance"] = {
    "mode": "declared-real",
    "facts_from": ["source=real"],
    "forbidden_assertions": [],
}
mutants.append(asserted_provenance)

missing_local_source = copy.deepcopy(contract)
missing_local_source["data_plane_contract"]["sources"] = [
    "MK6_DATA_CONVEX_EXPORT_DIR"
]
mutants.append(missing_local_source)

widened_scope = copy.deepcopy(contract)
widened_scope["data_plane_contract"]["write_allowed"] = ["services/**"]
mutants.append(widened_scope)

for index, mutant in enumerate(mutants, start=1):
    if not errors(mutant):
        raise SystemExit(f"oracle accepted mutant {index}")

print(json.dumps({
    "contractValid": True,
    "sourceCount": len(expected_sources),
    "negativeControlCount": len(expected_controls),
    "writeAllowedCount": len(expected_writes),
    "mutantsRejected": len(mutants),
}, sort_keys=True))
PY
```
<!-- STATIC-ORACLE-END -->

Run it from the worktree with:

```bash
TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md
REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md
awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' "$REPAIR" | bash -s -- "$TARGET"
```

## Acceptance Criteria

- [ ] AC-1: The extractable static oracle exits zero and reports exactly three sources, eight negative controls, nine future write paths, and four rejected in-memory mutants.
- [ ] AC-2: Both embedded `REQUIREMENT-CONTRACT v1` blocks parse as JSON and the scenario validator reports zero critical issues for both files.
- [ ] AC-3: `git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD` after this repair commit contains exactly the two planning files listed under WRITE-ALLOWED.
- [ ] AC-4: The target contract preserves AC-1 and AC-2 as conjunctive requirements, adds AC-3 through AC-5 and TC-3 through TC-9, and never requires the MCP branch to land before the data task.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The oracle accepts the repaired target and rejects fixed witness, asserted provenance, missing-local-source, and widened-scope mutants. | AC-1 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' "$REPAIR" \| bash -s -- "$TARGET"` |
| TC-2 | The target requirement contract parses and is scenario-valid. | AC-2 | `python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); print(re.search(r"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->",s,re.S).group(1))' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-3 | The repair requirement contract parses and is scenario-valid. | AC-2 | `python3 -c 'import json,re,sys; s=open(sys.argv[1]).read(); print(re.search(r"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->",s,re.S).group(1))' .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-4 | The committed diff is limited to the two authorized planning files. | AC-3 | `test "$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)" = "$(printf '%s\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)"` |
| TC-5 | Stable requirement IDs remain present and the MCP landing decision is explicit. | AC-4 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9; do rg -q "\"id\": \"$id\"" "$TARGET"; done && rg -q 'does \*\*not\*\* require the local-only MCP branch to land first' "$TARGET"` |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "target_task_contract": {
      "seed_method": "migration_fixture",
      "description": "the repository MK6-DATA-001 planning artifact at the dispatch base, evaluated without opening or mutating either data source",
      "records": [
        "targetTaskId: MK6-DATA-001",
        "dispatchBase: ca853e8cc8071a9ff505c5d9549bb9f23295413d",
        "authorizedPlanningFileCount: 2"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "The static oracle validates the composite-corpus extension and rejects four old-loophole or scope mutants in memory",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "static-contract-oracle",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "requirement-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "a fixed witness, declared-real provenance, omitted local source, or widened future write scope is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "extract and run the static oracle against the repaired target, including all four in-memory mutations"
              ]
            },
            "end_state": {
              "must_observe": [
                "sourceCount: 3",
                "negativeControlCount: 8",
                "writeAllowedCount: 9",
                "mutantsRejected: 4"
              ],
              "must_not_observe": [
                "oracle accepted mutant 1",
                "empty contract accepted",
                "target rejected: fixed-sentinel",
                "writeAllowedCount: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Both planning files contain parseable and scenario-valid requirement contracts",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import re,sys; s=open(sys.argv[1]).read(); print(re.search(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",s,re.S).group(1))' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": null,
      "scenario": {
        "id": "scenario-contract-validation",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "scenario-validator",
        "negative_control": {
          "would_fail_if": [
            "either JSON block is malformed, any behavioral acceptance criterion lacks a scenario, or a scenario has an empty oracle"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "extract both requirement contracts, parse them, and run the shared scenario validator"
              ]
            },
            "end_state": {
              "must_observe": [
                "validatedContractCount: 2",
                "criticalIssueCount: 0"
              ],
              "must_not_observe": [
                "JSONDecodeError",
                "empty scenario oracle accepted",
                "CRITICAL"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "The repair commit changes exactly the two authorized planning files",
      "verify": "test \"$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)\" = \"$(printf '%s\\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "repair-write-scope",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "git",
        "negative_control": {
          "would_fail_if": [
            "a source, test, script, database, export, blob, runtime, or third planning file is changed, or an empty diff is accepted"
          ]
        },
        "evidence": {
          "artifact_type": "cli_output",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compare the committed repair diff to the dispatch base and sort both path sets"
              ]
            },
            "end_state": {
              "must_observe": [
                "changedPlanningFileCount: 2",
                "unauthorizedChangedPathCount: 0"
              ],
              "must_not_observe": [
                "changedDatabaseCount: 1",
                "empty diff accepted",
                "changedRuntimeFileCount: 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "The repaired target preserves stable criteria and explicitly allows direct platform consumption of the SQLite format without landing the MCP branch",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9; do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "stable-requirements-and-dependency",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "task-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "the retained count-equal control disappears, an empty requirement-ID set is accepted, stable IDs are renumbered, or the unmerged MCP branch is made an undeclared implementation dependency"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "target_task_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "inspect the target requirement IDs and its explicit MCP branch decision"
              ]
            },
            "end_state": {
              "must_observe": [
                "acceptanceCriterionIds: AC-1,AC-2,AC-3,AC-4,AC-5",
                "testCriterionIds: TC-1,TC-2,TC-3,TC-4,TC-5,TC-6,TC-7,TC-8,TC-9",
                "mcpBranchLandingRequired: false"
              ],
              "must_not_observe": [
                "acceptanceCriterionIds: AC-1,AC-3",
                "empty acceptance-criterion set",
                "mcpBranchLandingRequired: true"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The static oracle accepts the repair and rejects all four mutants",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Both requirement contracts are scenario-valid",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import re,sys; s=open(sys.argv[1]).read(); print(re.search(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",s,re.S).group(1))' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The committed diff contains only the authorized files",
      "verify": "test \"$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)\" = \"$(printf '%s\\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Stable criteria and the no-MCP-landing dependency decision are explicit",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9; do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
