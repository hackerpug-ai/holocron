# SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS: Bind the retained composite corpus

> Status: 🔵 In Review
> Cycle: 2
> Updated: 2026-08-18T00:00:00Z
> Assignee: mastra-planner
> Reviewer: mastra-reviewer
> Priority: P0
> Type: docs
> Proposed by: operator
> Files: .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md, .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md
> Blocks: MK6-DATA-001

## Outcome

MK6-DATA-001 is executable only against the canonically admitted retained Convex/SQLite/blob corpus and an exact pre-existing Hono/Postgres pair. Its contract pins symmetric source semantics, two-way provenance/tombstone accounting, external process/target identity, all required mutations, and the exact implementation scope.

## Contradictions and loopholes repaired

Cycle 1 removed the nonexistent sidecar and synthetic witness assumptions. Cycle 2 closes five further gaps:

1. Source paths derive from a realpath/no-symlink canonical `$HOME/.holocron` root or one explicitly equivalent durable root; arbitrary clones, fixtures, per-source overrides, temporary roots, and symlink indirection cannot satisfy the positive path.
2. Export, SQLite, and blob sources each have semantic `source-pre == snapshot-copy == source-post` proofs. SQLite uses two safe backups plus ordered table/provenance semantics; blobs use referenced-byte inventory hashes rather than existence.
3. External bytes come from a pre-existing non-self Hono PID that matches the operating-system listener owner and whose `/health.database_target` fingerprint equals the direct isolated Postgres fingerprint before and after probing. Wrong-target and self-minted listeners fail.
4. Local documents and provenance are reconciled in both directions. The live `19 provenance / 18 materialized` observation derives one losslessly preserved provenance-only tombstone; local-writes batch semantics come from SQLite fields, never a free origin claim.
5. The static oracle hashes the complete execution-critical extension and real fixture descriptor, then mutation-tests every required negative plus explicit source, snapshot, blob, Postgres/external, handwritten-hash, and fixture downgrades.

The retained AC-1/AC-2 and TC-1 through TC-9 remain conjunctive. AC-6 and TC-10 through TC-18 extend the contract without renumbering earlier IDs. No implementation, import, migration, data mutation, service start, deployment, merge, push, or worktree lifecycle action is part of this repair.

## WRITE-ALLOWED for this repair

Only these planning artifacts may change:

1. `.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md`
2. `.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md`

Everything else, including source, tests, scripts, `.tmp`, databases, exports, blobs, primary checkout, services, network state, and runtime state, is read-only.

## Static oracle

The extractable shell block validates the unique target contract. The SHA-256 values are over canonical JSON (`sort_keys=True`, separators `,` and `:`) for the entire `data_plane_contract` and `real_composite_corpus` fixture objects, so any execution-critical field drift fails. Specific in-memory mutants prove the oracle rejects the reviewed loopholes; one additional mutant removes each required negative control.

<!-- STATIC-ORACLE-BEGIN -->
```bash
set -euo pipefail
python3 - "$1" <<'PY'
import copy
import hashlib
import json
import re
import sys
from pathlib import Path

target = Path(sys.argv[1])
text = target.read_text(encoding="utf-8")
matches = re.findall(
    r"<!-- REQUIREMENT-CONTRACT v1 -->\s*<!--\s*(\{.*?\})\s*-->",
    text,
    re.DOTALL,
)
if len(matches) != 1:
    raise SystemExit(f"expected one REQUIREMENT-CONTRACT v1, found {len(matches)}")
contract = json.loads(matches[0])

expected_contract_sha256 = "55b553923d63c7f310a0ce35c2288c267fa2adc05de147719c4b3e9db4a67e32"
expected_fixture_sha256 = "748a43551b04c60f57024b253ebad8b8ade0d6fa991759745ed4e143e2ddb6bb"
expected_requirement_ids = [
    "AC-1", "AC-2", "AC-3", "AC-4", "AC-5", "AC-6",
    "TC-1", "TC-2", "TC-3", "TC-4", "TC-5", "TC-6", "TC-7", "TC-8", "TC-9",
    "TC-10", "TC-11", "TC-12", "TC-13", "TC-14", "TC-15", "TC-16", "TC-17", "TC-18",
]
expected_controls = [
    "count-equal-content-corrupt",
    "missing-local-delta",
    "forged-provenance",
    "export-mutated-after-snapshot",
    "sqlite-mutated-after-snapshot",
    "blob-source-mutated-after-snapshot",
    "missing-blob",
    "replaced-blob",
    "nonexistent-selected-document",
    "fixture-path",
    "arbitrary-source-clone",
    "symlink-source-indirection",
    "wrong-postgres-target",
    "self-minted-listener",
    "missing-materialized-local-provenance",
    "dropped-provenance-tombstone",
    "forged-local-batch-fields",
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

def canonical_sha256(value):
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()

def errors(candidate):
    found = []
    extension = candidate.get("data_plane_contract", {})
    fixture = candidate.get("fixtures", {}).get("real_composite_corpus", {})
    if canonical_sha256(extension) != expected_contract_sha256:
        found.append("execution-contract-drift")
    if canonical_sha256(fixture) != expected_fixture_sha256:
        found.append("real-fixture-descriptor-drift")
    if [item.get("id") for item in candidate.get("requirements", [])] != expected_requirement_ids:
        found.append("requirement-id-drift")
    if extension.get("negative_controls") != expected_controls:
        found.append("negative-control-drift")
    if extension.get("write_allowed") != expected_writes:
        found.append("write-scope-drift")
    positive_surface = json.dumps({
        "fixture": fixture,
        "primary": candidate.get("requirements", [])[:1],
    }).lower()
    if "mk6-data-sentinel-1" in positive_surface:
        found.append("fixed-sentinel")
    if "_export_provenance.json" in positive_surface:
        found.append("mandatory-legacy-sidecar")
    if "synthetic" in fixture.get("description", "").lower():
        found.append("synthetic-fixture")
    return found

base_errors = errors(contract)
if base_errors:
    raise SystemExit("target rejected: " + ",".join(base_errors))

mutants = []

fixed_witness = copy.deepcopy(contract)
fixed_witness["data_plane_contract"]["witness_selection"]["formula"] = "mk6-data-sentinel-1"
mutants.append(("fixed-witness", fixed_witness))

asserted_provenance = copy.deepcopy(contract)
asserted_provenance["data_plane_contract"]["provenance"]["mode"] = "declared-real"
asserted_provenance["data_plane_contract"]["provenance"]["facts_from"] = ["source=real"]
mutants.append(("asserted-provenance", asserted_provenance))

missing_local_source = copy.deepcopy(contract)
missing_local_source["data_plane_contract"]["sources"] = ["convex-export"]
mutants.append(("missing-local-source", missing_local_source))

widened_scope = copy.deepcopy(contract)
widened_scope["data_plane_contract"]["write_allowed"] = ["services/**"]
mutants.append(("widened-scope", widened_scope))

downgraded_blob = copy.deepcopy(contract)
downgraded_blob["data_plane_contract"]["snapshot_semantics"]["sqlite-blob-store"]["verification"] = "existence-only"
mutants.append(("downgraded-blob-semantics", downgraded_blob))

removed_postgres_boundary = copy.deepcopy(contract)
removed_postgres_boundary["data_plane_contract"]["witness_selection"]["boundaries"].remove("direct-postgres")
mutants.append(("removed-postgres-boundary", removed_postgres_boundary))

removed_external_boundary = copy.deepcopy(contract)
removed_external_boundary["data_plane_contract"]["witness_selection"]["boundaries"].remove("external-product-surface")
mutants.append(("removed-external-boundary", removed_external_boundary))

handwritten_hash = copy.deepcopy(contract)
handwritten_hash["data_plane_contract"]["provenance"]["allow_handwritten_expected_hash"] = True
mutants.append(("handwritten-hash-permission", handwritten_hash))

synthetic_fixture = copy.deepcopy(contract)
synthetic_fixture["fixtures"]["real_composite_corpus"]["description"] = "synthetic generated fixture"
mutants.append(("synthetic-fixture-description", synthetic_fixture))

arbitrary_clone = copy.deepcopy(contract)
arbitrary_clone["data_plane_contract"]["source_admission"]["arbitrary_per_source_override_allowed"] = True
mutants.append(("arbitrary-clone-admission", arbitrary_clone))

symlink_allowed = copy.deepcopy(contract)
symlink_allowed["data_plane_contract"]["source_admission"]["reject_symlink_in_any_component"] = False
mutants.append(("symlink-admission", symlink_allowed))

sqlite_raw_copy = copy.deepcopy(contract)
sqlite_raw_copy["data_plane_contract"]["snapshot_semantics"]["sqlite-database"]["copy"] = "raw-copy"
sqlite_raw_copy["data_plane_contract"]["snapshot_semantics"]["sqlite-database"]["required_equal_checkpoints"].pop()
mutants.append(("sqlite-one-sided-raw-copy", sqlite_raw_copy))

for control in expected_controls:
    removed_control = copy.deepcopy(contract)
    removed_control["data_plane_contract"]["negative_controls"].remove(control)
    mutants.append((f"removed-negative:{control}", removed_control))

for label, mutant in mutants:
    if not errors(mutant):
        raise SystemExit(f"oracle accepted mutant: {label}")

print(json.dumps({
    "contractValid": True,
    "contractSha256": expected_contract_sha256,
    "fixtureSha256": expected_fixture_sha256,
    "sourceCount": len(contract["data_plane_contract"]["sources"]),
    "negativeControlCount": len(expected_controls),
    "writeAllowedCount": len(expected_writes),
    "requirementCount": len(expected_requirement_ids),
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

- [ ] AC-1: The extractable oracle exits zero and reports three sources, 17 negative controls, nine future write paths, 24 stable requirements, and 29 rejected in-memory mutants.
- [ ] AC-2: Both files contain exactly one parseable `REQUIREMENT-CONTRACT v1`; the scenario validator reports zero critical issues for both.
- [ ] AC-3: `git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD` after the repair commit contains exactly the two planning files listed under WRITE-ALLOWED.
- [ ] AC-4: The target preserves AC-1/AC-2 and TC-1 through TC-9, adds AC-6 and TC-10 through TC-18, and explicitly does not require the MCP branch to land.

## Test Criteria

| ID | Binary statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The oracle pins the full execution contract and fixture hashes and rejects all 29 specific/control-removal mutants. | AC-1 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' "$REPAIR" \| bash -s -- "$TARGET"` |
| TC-2 | The target requirement contract parses and is scenario-valid. | AC-2 | `python3 -c 'import re,sys; s=open(sys.argv[1]).read(); m=re.findall(r"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->",s,re.S); assert len(m)==1; print(m[0])' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-3 | The repair requirement contract parses and is scenario-valid. | AC-2 | `python3 -c 'import re,sys; s=open(sys.argv[1]).read(); m=re.findall(r"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->",s,re.S); assert len(m)==1; print(m[0])' .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md \| python3 "$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py"` |
| TC-4 | The committed diff is limited to the two authorized planning files. | AC-3 | `test "$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD \| sort)" = "$(printf '%s\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md \| sort)"` |
| TC-5 | All stable target IDs and the no-MCP-landing decision remain explicit. | AC-4 | `TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9 TC-10 TC-11 TC-12 TC-13 TC-14 TC-15 TC-16 TC-17 TC-18; do rg -q "\"id\": \"$id\"" "$TARGET"; done && rg -q 'does \*\*not\*\* require the local-only MCP branch to land first' "$TARGET"` |

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
      "description": "repository MK6-DATA-001 contract at the dispatch base; evaluated without opening or mutating source corpora or runtime",
      "records": [
        "targetTaskId: MK6-DATA-001",
        "dispatchBase: ca853e8cc8071a9ff505c5d9549bb9f23295413d",
        "authorizedPlanningFileCount: 2",
        "expectedTargetRequirementCount: 24",
        "expectedNegativeControlCount: 17",
        "expectedOracleMutantCount: 29"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "The static oracle pins the complete target extension and real fixture descriptor and rejects 29 explicit or per-control mutants",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "static-contract-oracle-v2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "requirement-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "an empty extension, source admission downgrade, one-sided snapshot, existence-only blob check, removed Postgres/external boundary, handwritten hash, synthetic fixture, or missing required negative is accepted"
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
                "extract and run the static oracle against the repaired target, including 12 explicit downgrades and one removal mutant for each of 17 controls"
              ]
            },
            "end_state": {
              "must_observe": [
                "sourceCount: 3",
                "negativeControlCount: 17",
                "writeAllowedCount: 9",
                "requirementCount: 24",
                "mutantsRejected: 29"
              ],
              "must_not_observe": [
                "empty extension accepted",
                "oracle accepted mutant",
                "negativeControlCount: 8",
                "mutantsRejected: 4"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Both planning files contain exactly one parseable and scenario-valid requirement contract",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import re,sys; s=open(sys.argv[1]).read(); m=re.findall(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",s,re.S); assert len(m)==1; print(m[0])' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": null,
      "scenario": {
        "id": "unique-scenario-contract-validation",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "scenario-validator",
        "negative_control": {
          "would_fail_if": [
            "a JSON block is absent, duplicated, malformed, or empty, a behavioral criterion lacks a scenario, or any scenario oracle is weak"
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
                "extract exactly one contract from each planning file, parse it, and run the shared scenario validator"
              ]
            },
            "end_state": {
              "must_observe": [
                "validatedContractCount: 2",
                "duplicateContractCount: 0",
                "criticalIssueCount: 0"
              ],
              "must_not_observe": [
                "empty contract accepted",
                "JSONDecodeError",
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
        "id": "cycle-two-repair-write-scope",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "git",
        "negative_control": {
          "would_fail_if": [
            "a source, test, script, database, export, blob, runtime, state, network setting, or third planning file is changed, or an empty diff is accepted"
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
                "compare the committed branch diff to dispatch base and require the exact sorted two-path set"
              ]
            },
            "end_state": {
              "must_observe": [
                "changedPlanningFileCount: 2",
                "unauthorizedChangedPathCount: 0"
              ],
              "must_not_observe": [
                "empty diff accepted",
                "changedDatabaseCount: 1",
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
      "description": "The target preserves stable criteria, adds the reviewed Cycle-2 IDs, and does not require MCP branch landing",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9 TC-10 TC-11 TC-12 TC-13 TC-14 TC-15 TC-16 TC-17 TC-18; do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": null,
      "scenario": {
        "id": "stable-ids-and-mcp-dependency-v2",
        "test_tier": "integration",
        "tier": "visible",
        "verification_service": "task-contract-parser",
        "negative_control": {
          "would_fail_if": [
            "the count-equal criterion disappears, an empty ID set passes, stable IDs are renumbered, Cycle-2 controls lack IDs, or the MCP branch becomes an undeclared dependency"
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
                "inspect exact target AC/TC IDs and the explicit MCP branch decision"
              ]
            },
            "end_state": {
              "must_observe": [
                "acceptanceCriterionIds: AC-1,AC-2,AC-3,AC-4,AC-5,AC-6",
                "testCriterionRange: TC-1..TC-18",
                "mcpBranchLandingRequired: false"
              ],
              "must_not_observe": [
                "empty acceptance-criterion set",
                "acceptanceCriterionIds: AC-1,AC-3",
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
      "description": "The static oracle accepts the exact target and rejects all 29 mutants",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md REPAIR=.spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; awk '/^<!-- STATIC-ORACLE-BEGIN -->$/{on=1;next}/^<!-- STATIC-ORACLE-END -->$/{on=0}on && !/^```/{print}' \"$REPAIR\" | bash -s -- \"$TARGET\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Both unique requirement contracts are scenario-valid",
      "verify": "for f in .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md; do python3 -c 'import re,sys; s=open(sys.argv[1]).read(); m=re.findall(r\"<!-- REQUIREMENT-CONTRACT v1 -->\\s*<!--\\s*(\\{.*?\\})\\s*-->\",s,re.S); assert len(m)==1; print(m[0])' \"$f\" | python3 \"$HOME/Projects/brain/tools/validate-scenario/validate_scenario.py\"; done",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The committed branch diff contains only the authorized files",
      "verify": "test \"$(git diff --name-only ca853e8cc8071a9ff505c5d9549bb9f23295413d...HEAD | sort)\" = \"$(printf '%s\\n' .spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md .spec/tasks/imp-mk6-functional-completeness-1786837297/SPEC-REPAIR-MK6-DATA-001-LOCAL-CORPUS.md | sort)\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Stable and Cycle-2 IDs plus the no-MCP-landing decision are explicit",
      "verify": "TARGET=.spec/tasks/imp-mk6-functional-completeness-1786837297/MK6-DATA-001-data-plane-truth.md; for id in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 TC-1 TC-2 TC-3 TC-4 TC-5 TC-6 TC-7 TC-8 TC-9 TC-10 TC-11 TC-12 TC-13 TC-14 TC-15 TC-16 TC-17 TC-18; do rg -q '\"id\": \"'$id'\"' \"$TARGET\"; done && rg -q 'does \\*\\*not\\*\\* require the local-only MCP branch to land first' \"$TARGET\"",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
