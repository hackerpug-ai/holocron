# SPEC-REPAIR S33-PLAT-05: Close Predeploy Proof and Lineage Gaps

> Status: Backlog
> Assignee: mastra-planner
> Priority: P0
> Type: SPEC-REPAIR
> TDD_MODE: skipped — planning-only contract repair
> Target: `S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md`

## Outcome

Repair S33-PLAT-05 without weakening its existing public-turn, two-mini topology, substantive-response, no-laptop, or Network Continuity clauses. The target now adds conjunctive, uniquely extractable requirements for the real public `chat-runs.ts` stream boundary, complete fail-closed fleet/cloud accounting, immutable deployment identity, real no-mini SSH/read attempts, honest non-nonce correlation, true test-only RED ancestry, platform-specific typecheck comparison, and ordered source-review/landing/deploy/proof/final-review governance.

## Planning-only scope

This repair changes exactly:

1. `S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md` — MODIFY in place
2. `SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md` — ADD

It performs no source, runtime, evidence, state, network, remote, deployment, merge, or push operation.

## Repaired blockers

1. Confirms `services/platform/src/http/chat-runs.ts` is the public Hono `agent.stream` boundary and adds only that path to the four existing future implementation paths.
2. Requires request/run-scoped, complete accounting on the actual public stream, so missing or bypassed model transport cannot be reported as `cloudRequests=0`.
3. Requires exact expected-main/release-lock/health/deployed equality for `sourceRevision`, `imageDigest`, and `composeSha256`.
4. Replaces the in-memory no-mini suppression mechanism with real bounded read-only SSH/read attempts on both healthy minis and non-synthetic receipts.
5. Describes mini attribution honestly as bounded append-window/header/request-telemetry correlation and explicitly denies nonce-log binding.
6. Requires a real-path, test-only RED commit as the first child of the authorized base, with exact GREEN ancestry.
7. Pins the platform typecheck to `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json` and permits base-vs-candidate comparison only with orchestrator authorization, exact identities/toolchain, hashed raw outputs, and zero added normalized diagnostics.
8. Enforces mandatory `product-manager` plus `mastra-reviewer` source review before orchestrator landing, package/deploy of that resulting main SHA, proof at the same immutable tuple, and mandatory final review by both after proof. `test-quality-reviewer` is additional, never a substitute.
9. Preserves Network Continuity: no Tailscale, Wi-Fi, interface, route, or DNS mutation and no literal disconnect claim.
10. Pins every deployed-host SSH read to exactly `holocron@holocron`.

## Acceptance Criteria

### AC-1 — The repaired target is complete, non-weakening, executable, and mutation-sensitive

- **GIVEN** the restored 536-line base target and this repair artifact
- **WHEN** the canonical static verifier extracts both REQUIREMENT-CONTRACT v1 objects, runs scenario validation, syntax-checks every shell verifier, checks human/JSON parity for AC-2/TC-3 plus AC-5 through AC-9 and TC-8 through TC-12, and mutates regular temporary copies
- **THEN** the target retains AC-1 through AC-4 plus TC-1 through TC-7, adds AC-5 through AC-9 plus TC-8 through TC-12, has exactly one canonical contract marker, and all 9 scenarios validate with 0 violations
- **AND** the future WRITE-ALLOWED set is exactly the original four paths plus only `services/platform/src/http/chat-runs.ts`
- **AND** 12 real-filesystem mutations independently break prose, embedded verify commands, and embedded scenarios for public-boundary, accounting, provenance, no-mini, correlation, RED, review/order, typecheck, and Network Continuity, and every mutated candidate contract is parsed and rejected
- **Verify:** `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'`
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: 12 real temporary-file mutations

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both contracts parse uniquely; all shell verifiers pass `bash -n`; all 12 repaired human/JSON commands match; target and repair scenarios validate; exact scope and every structured/prose mutation are enforced. | AC-1 | `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'` |

## Static mutation verifier

The verifier writes only regular files beneath a fresh local temporary directory and removes that directory automatically. It never invokes a future runtime verifier, SSH, HTTP, Docker, deployment, or network command.

<!-- STATIC-VERIFIER v1 -->
```python
from copy import deepcopy
from pathlib import Path
import json
import re
import subprocess
import sys
import tempfile

repair_path = Path(__file__)
target_path = repair_path.with_name(
    "S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md"
)
repair_text = repair_path.read_text()
target_text = target_path.read_text()
marker = "<!-- REQUIREMENT-" + "CONTRACT v1 -->"
contract_pattern = re.compile(
    re.escape(marker) + r"\s*<!--\s*(\{.*\})\s*-->",
    re.S,
)

assert target_path.is_file() and not target_path.is_symlink()
assert repair_path.is_file() and not repair_path.is_symlink()
assert target_text.count(marker) == 1
assert repair_text.count(marker) == 1

target_match = contract_pattern.search(target_text)
repair_match = contract_pattern.search(repair_text)
assert target_match and repair_match
target_contract = json.loads(target_match.group(1))
repair_contract = json.loads(repair_match.group(1))

target_by_id = {item["id"]: item for item in target_contract["requirements"]}
repair_by_id = {item["id"]: item for item in repair_contract["requirements"]}
expected_target_ids = {
    *(f"AC-{index}" for index in range(1, 10)),
    *(f"TC-{index}" for index in range(1, 13)),
}
assert set(target_by_id) == expected_target_ids
assert set(repair_by_id) == {"AC-1", "TC-1"}
assert target_contract["tdd_mode"] == "red_first"
assert target_contract["verification_policy"] == {
    "requires_tests": True,
    "requires_red_evidence": True,
    "requires_seeded_evidence": True,
}
assert repair_contract["tdd_mode"] == "skipped"

allowed_match = re.search(
    r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",
    target_text,
    re.S,
)
assert allowed_match
allowed_paths = re.findall(r"^- ([^ ]+)", allowed_match.group(1), re.M)
assert allowed_paths == [
    "scripts/verify-s33-mini-served-turn.sh",
    "services/platform/src/inference/telemetry.ts",
    "services/platform/src/compat/cells/agent.ts",
    "services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
    "services/platform/src/http/chat-runs.ts",
]
prohibited_match = re.search(
    r"\*\*WRITE-PROHIBITED\*\*\s*(.*?)\s*## Design",
    target_text,
    re.S,
)
assert prohibited_match
assert "services/platform/src/http/chat-runs.ts" not in prohibited_match.group(1)

sentinels = [
    "- services/platform/src/http/chat-runs.ts (MODIFY — only at the confirmed public `agent.stream` boundary for request/run-scoped accounting)",
    "- **AND** missing instrumentation, a direct provider/model/fetch bypass, `api.openai.com` or any cloud request, an unknown endpoint, or a counter mismatch fails closed rather than defaulting to `cloudRequests=0`",
    "- **AND** release-lock digest, health `imageDigest`, and deployed immutable image digest are present, valid `sha256:<64-hex>`, and byte-equal",
    "- **WHEN** no-mini-evidence mode first proves each canonical log is readable and then attempts the intentionally invalid `/dev/null/omlx-mini-8003.log` path on each mini",
    "- **THEN** the report names `bounded_append_window_header_and_run_telemetry`, records `nonceLogBinding=false`, and says the claim is not nonce binding",
    "- **THEN** RED is the first child of that base, changes exactly `services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`, reaches real Hono/Postgres/fleet dependencies, and fails for missing public-chat accounting rather than setup",
    "- Required source predeploy review by `product-manager` and `mastra-reviewer` precedes orchestrator landing; `test-quality-reviewer` may add an oracle-quality review but cannot replace either required reviewer. Packaging/deployment then uses the resulting main merge SHA; live proof uses that same SHA/digest/Compose tuple; required final `product-manager` and `mastra-reviewer` review follows proof.",
    "| platform typecheck | `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json` | Exit 0; any base-vs-candidate comparison must be explicitly orchestrator-authorized, exact-SHA/toolchain matched, raw-output hashed, and show zero added normalized diagnostics |",
    "The original two-mini topology, public-request, substantive-response, and Network Continuity requirements remain in force.",
]
assert all(target_text.count(sentinel) == 1 for sentinel in sentinels)

parity_ids = ["AC-2", *(f"AC-{index}" for index in range(5, 10)), "TC-3", *(f"TC-{index}" for index in range(8, 13))]
for requirement_id in parity_ids:
    if requirement_id.startswith("AC-"):
        human_match = re.search(
            rf"### {requirement_id} .*?- \*\*Verify:\*\* `(.*?)`",
            target_text,
            re.S,
        )
    else:
        human_match = re.search(
            rf"^\| {requirement_id} \|.*\| `(.*)` \|$",
            target_text,
            re.M,
        )
    assert human_match
    assert human_match.group(1) == target_by_id[requirement_id]["verify"]

for item in target_contract["requirements"]:
    result = subprocess.run(
        ["bash", "-n", "-c", item["verify"]],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, (item["id"], result.stderr)

validator = Path("/Users/justinrich/Projects/brain/tools/validate-scenario/validate_scenario.py")
assert validator.is_file()
for contract, expected_count in [(target_contract, 9), (repair_contract, 1)]:
    result = subprocess.run(
        [sys.executable, str(validator)],
        input=json.dumps(contract),
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    report = json.loads(result.stdout)
    assert report == {"ok": True, "scenario_count": expected_count, "violations": []}

expected_allowed_paths = [
    "scripts/verify-s33-mini-served-turn.sh",
    "services/platform/src/inference/telemetry.ts",
    "services/platform/src/compat/cells/agent.ts",
    "services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
    "services/platform/src/http/chat-runs.ts",
]

def static_oracle(candidate: str) -> bool:
    try:
        assert candidate.count(marker) == 1
        candidate_match = contract_pattern.search(candidate)
        assert candidate_match
        candidate_contract = json.loads(candidate_match.group(1))
        candidate_by_id = {
            item["id"]: item for item in candidate_contract["requirements"]
        }
        assert set(candidate_by_id) == expected_target_ids
        assert candidate_contract["tdd_mode"] == "red_first"
        assert candidate_contract["verification_policy"] == {
            "requires_tests": True,
            "requires_red_evidence": True,
            "requires_seeded_evidence": True,
        }
        assert all(candidate.count(sentinel) == 1 for sentinel in sentinels)
        assert "S33_MINI_NEGATIVE=no-mini-evidence" not in candidate
        assert "suppresses both node-read results in memory" not in candidate

        candidate_allowed_match = re.search(
            r"\*\*WRITE-ALLOWED\*\*\s*(.*?)\s*\*\*WRITE-PROHIBITED\*\*",
            candidate,
            re.S,
        )
        assert candidate_allowed_match
        assert re.findall(
            r"^- ([^ ]+)", candidate_allowed_match.group(1), re.M
        ) == expected_allowed_paths

        for requirement_id in parity_ids:
            if requirement_id.startswith("AC-"):
                human_match = re.search(
                    rf"### {requirement_id} .*?- \*\*Verify:\*\* `(.*?)`",
                    candidate,
                    re.S,
                )
            else:
                human_match = re.search(
                    rf"^\| {requirement_id} \|.*\| `(.*)` \|$",
                    candidate,
                    re.M,
                )
            assert human_match
            assert human_match.group(1) == candidate_by_id[requirement_id]["verify"]

        no_mini_verify = candidate_by_id["AC-2"]["verify"]
        assert all(
            candidate_by_id[requirement_id]["verify"] == no_mini_verify
            for requirement_id in ["TC-3", "AC-7", "TC-10"]
        )
        for required_fragment in [
            "--mode no-mini-evidence",
            ".actual_ssh_attempted == true",
            ".actual_read_attempted == true",
            ".synthetic == false",
            ".canonical_precheck_exit == 0",
            ".receipt_source == \"ssh\"",
            ".finished_epoch_ms > .started_epoch_ms",
            "(.finished_epoch_ms - .started_epoch_ms) <= 15000",
            ".bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"]",
        ]:
            assert required_fragment in no_mini_verify

        assert "public chat-runs agent.stream path" in candidate_by_id["AC-5"]["description"]
        assert "cloud/OpenAI" in candidate_by_id["AC-5"]["description"]
        assert all(
            field in candidate_by_id["AC-6"]["description"]
            for field in ["sourceRevision", "imageDigest", "composeSha256"]
        )
        assert "nonce binding" in candidate_by_id["AC-8"]["description"]
        assert "product-manager plus mastra-reviewer" in candidate_by_id["AC-9"]["description"]
        ac8_scenario = json.dumps(candidate_by_id["AC-8"]["scenario"], sort_keys=True)
        assert "nonceLogBinding === false" in ac8_scenario
        assert "AMBIGUOUS_MINI_CORRELATION" in ac8_scenario
        ac9_scenario = json.dumps(candidate_by_id["AC-9"]["scenario"], sort_keys=True)
        assert "product-manager and mastra-reviewer source approvals before orchestrator landing" in ac9_scenario
        assert "package/deploy/proof to share the landed main SHA, image digest, and Compose hash" in ac9_scenario
        assert "product-manager and mastra-reviewer final approvals after proof" in ac9_scenario

        for item in candidate_contract["requirements"]:
            result = subprocess.run(
                ["bash", "-n", "-c", item["verify"]],
                text=True,
                capture_output=True,
                check=False,
            )
            assert result.returncode == 0
        result = subprocess.run(
            [sys.executable, str(validator)],
            input=json.dumps(candidate_contract),
            text=True,
            capture_output=True,
            check=False,
        )
        assert result.returncode == 0
        assert json.loads(result.stdout) == {
            "ok": True,
            "scenario_count": 9,
            "violations": [],
        }
        return True
    except (AssertionError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False

def contract_candidate(requirement_id: str, path: list, value) -> str:
    mutated_contract = deepcopy(target_contract)
    item = next(
        requirement
        for requirement in mutated_contract["requirements"]
        if requirement["id"] == requirement_id
    )
    node = item
    for key in path[:-1]:
        node = node[key]
    node[path[-1]] = value
    return (
        target_text[: target_match.start(1)]
        + json.dumps(mutated_contract, indent=2)
        + target_text[target_match.end(1) :]
    )

legacy_no_mini = "set -o pipefail; S33_MINI_NEGATIVE=no-mini-evidence bash scripts/verify-s33-mini-served-turn.sh --json"
mutation_candidates = [
    target_text.replace(sentinels[0], "BROKEN-PUBLIC-BOUNDARY", 1),
    target_text.replace(sentinels[8], "BROKEN-NETWORK-CONTINUITY", 1),
    contract_candidate("AC-5", ["description"], "BROKEN ACCOUNTING"),
    contract_candidate("AC-6", ["description"], "BROKEN PROVENANCE"),
    contract_candidate("AC-7", ["verify"], legacy_no_mini),
    contract_candidate("AC-8", ["description"], "BROKEN CORRELATION"),
    contract_candidate(
        "AC-8",
        ["scenario", "cases", 0, "end_state", "must_observe"],
        ["nonceLogBinding === true"],
    ),
    contract_candidate("AC-9", ["description"], "BROKEN REVIEW ORDER"),
    contract_candidate(
        "AC-9",
        ["scenario", "negative_control", "would_fail_if"],
        [],
    ),
    contract_candidate("AC-2", ["verify"], legacy_no_mini),
    contract_candidate("TC-3", ["verify"], legacy_no_mini),
    contract_candidate(
        "AC-9",
        ["scenario", "cases", 0, "action", "steps"],
        [],
    ),
]

assert static_oracle(target_text)
with tempfile.TemporaryDirectory(prefix="s33-plat-05-spec-mutations-") as temp_dir:
    root = Path(temp_dir)
    for index, candidate in enumerate(mutation_candidates):
        mutation_path = root / f"mutation-{index}.md"
        mutation_path.write_text(candidate)
        assert mutation_path.is_file() and not mutation_path.is_symlink()
        assert not static_oracle(mutation_path.read_text())

print(
    json.dumps(
        {
            "ok": True,
            "target_requirements": len(target_by_id),
            "target_scenarios": 9,
            "repair_scenarios": 1,
            "shell_verifiers": len(target_by_id),
            "human_json_parity": len(parity_ids),
            "filesystem_mutations": len(mutation_candidates),
        },
        sort_keys=True,
    )
)
```

## Validation gates

| Gate | Command | Expected |
|---|---|---|
| static contract and mutation oracle | Run AC-1/TC-1 exact verifier | JSON `ok=true`, 9 target scenarios, 1 repair scenario, 21 shell verifiers, 12 parity checks, 12 rejected filesystem mutations |
| planning consistency | `pnpm prd:consistency` | Exit 0 |
| diff scope | `git diff --name-status 10196817d4c3ffcd6dcd4fc36537bee1947110e5..HEAD` | Exactly target M plus this repair A after commit |
| hooks | normal commit, no bypass | Exit 0 |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "restored_target_and_repair": {
      "description": "The restored base target modified in place plus exactly one new repair artifact, both regular local files.",
      "seed_method": "cli",
      "records": [
        "target Git status is M and repair Git status is A",
        "target has exactly one REQUIREMENT-CONTRACT v1 marker",
        "repair has exactly one REQUIREMENT-CONTRACT v1 marker",
        "temporary mutation directory starts empty and is removed automatically"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the restored target and repair WHEN the canonical static verifier parses contracts, validates scenarios, checks shell syntax and human/JSON parity, enforces exact scope, and mutates regular temporary copies THEN all original plus repaired requirements remain enforceable and every sentinel mutation fails.",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'",
      "scenario": {
        "id": "SPEC-REPAIR-S33-PLAT-05/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "local filesystem + Git planning contracts",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["removed_requirement", "static_fake_success", "empty_contract", "scope_drift"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "restored_target_and_repair",
            "action": {
              "actor": "mastra-planner",
              "steps": [
                "Extract and parse exactly 2 canonical contracts from 2 regular files.",
                "Run bash -n on all 21 target verifier commands and compare 12 repaired human/JSON verifier pairs.",
                "Run the canonical scenario validator on the 9 target and 1 repair scenarios.",
                "Write 12 independently mutated target copies, including embedded verify and scenario fields, to a fresh temporary directory and require full candidate parse/parity/scope/scenario validation to reject each copy."
              ]
            },
            "end_state": {
              "must_observe": [
                "target requirement count === 21 and canonical target marker count === 1",
                "scenario validator reports target scenario_count === 9 and repair scenario_count === 1 with violations === []",
                "shell verifier syntax pass count === 21 and human/JSON parity count === 12",
                "filesystem mutation count === 12 and rejected mutation count === 12",
                "future WRITE-ALLOWED paths equal exactly the 5-item expected list"
              ],
              "must_not_observe": [
                "an empty contract or zero scenario count",
                "a static mutation accepted by the oracle",
                "a sixth future implementation path",
                "target status D or repair status M"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The canonical verifier proves unique contracts, executable shell syntax, scenario validity, human/JSON parity, exact scope, and 12 rejected regular-file prose/verify/scenario mutations.",
      "maps_to_ac": "AC-1",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'"
    }
  ]
}
-->
