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
2. Requires request/run-scoped, complete accounting for every underlying `doStream` or equivalent model transport invocation on the actual public stream, including multi-step/tool-loop calls; missing, bypassed, unknown, cloud, outer-stream-only, or unreconciled accounting cannot pass as `cloudRequests=0`.
3. Requires exact expected-main/release-lock/health/deployed equality for `sourceRevision`, `imageDigest`, and `composeSha256`.
4. Replaces the in-memory no-mini suppression mechanism with real bounded read-only SSH/read attempts on both healthy minis and non-synthetic receipts that bind logical node, SSH destination, independently reported tailnet hostname, canonical log path, exact bounded options, commands, outputs, exits, and ordered bounded times.
5. Describes mini attribution honestly as bounded append-window/header/request-telemetry correlation and explicitly denies nonce-log binding.
6. Requires a real-path, test-only RED commit as the first child of the authorized base, with exact GREEN ancestry.
7. Pins the platform typecheck to `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json` and permits base-vs-candidate comparison only with orchestrator authorization, exact identities/toolchain, hashed raw outputs, and zero added normalized diagnostics.
8. Enforces mandatory `product-manager` plus `mastra-reviewer` source review before orchestrator landing, package/deploy of that resulting main SHA, proof at the same independently recomputed immutable tuple, and mandatory final review by both after proof. Reviewer identities and approval artifact hashes are independently bound; `test-quality-reviewer` is additional, never a substitute.
9. Preserves Network Continuity: no Tailscale, Wi-Fi, interface, route, or DNS mutation and no literal disconnect claim.
10. Pins every deployed-host SSH read to exactly `holocron@holocron`.

## Acceptance Criteria

### AC-1 — The repaired target is complete, non-weakening, executable, and mutation-sensitive

- **GIVEN** the restored 536-line base target and this repair artifact
- **WHEN** the canonical static verifier extracts both REQUIREMENT-CONTRACT v1 objects, executes the base-anchored Git scope gate, runs scenario validation, syntax-checks every shell verifier, checks human/JSON parity and pinned verifier hashes for all AC-1 through AC-9 and TC-1 through TC-12, and mutates regular temporary copies
- **THEN** the target retains AC-1 through AC-4 plus TC-1 through TC-7, adds AC-5 through AC-9 plus TC-8 through TC-12, has exactly one canonical contract marker, and all 9 scenarios validate with 0 violations
- **AND** the future WRITE-ALLOWED set is exactly the original four paths plus only `services/platform/src/http/chat-runs.ts`
- **AND** 29 real-filesystem mutations include one `verify=true` mutation for every one of the 21 criteria plus public-boundary, Network Continuity, positive same-mini relabel, no-mini same-mini relabel, correlation scenario, forged-lineage verifier, forged-lineage scenario, and forged-review mutations; every mutated candidate contract is parsed and rejected
- **Verify:** `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'`
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: 29 real temporary-file mutations

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both contracts parse uniquely; all 21 shell verifiers pass `bash -n`; all 21 human/JSON commands match pinned hashes; target and repair scenarios validate; the base-anchored exact Git scope and all 29 structured/prose mutations are enforced. | AC-1 | `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'` |

## Static mutation verifier

The verifier writes only regular files beneath a fresh local temporary directory and removes that directory automatically. It never invokes a future runtime verifier, SSH, HTTP, Docker, deployment, or network command.

<!-- STATIC-VERIFIER v1 -->
```python
from copy import deepcopy
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import tempfile

repair_path = Path(__file__)
target_path = repair_path.with_name(
    "S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md"
)
base_sha = "10196817d4c3ffcd6dcd4fc36537bee1947110e5"
target_rel = ".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md"
repair_rel = ".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md"
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

repo_result = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    cwd=repair_path.parent,
    text=True,
    capture_output=True,
    check=False,
)
assert repo_result.returncode == 0, repo_result.stderr
repo_root = Path(repo_result.stdout.strip())

def assert_git_scope() -> None:
    base_object = subprocess.run(
        ["git", "cat-file", "-e", f"{base_sha}^{{commit}}"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    assert base_object.returncode == 0, base_object.stderr
    ancestry = subprocess.run(
        ["git", "merge-base", "--is-ancestor", base_sha, "HEAD"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    assert ancestry.returncode == 0, ancestry.stderr
    scope = subprocess.run(
        ["git", "diff", "--name-status", f"{base_sha}..HEAD"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    assert scope.returncode == 0, scope.stderr
    assert scope.stdout.splitlines() == [f"M\t{target_rel}", f"A\t{repair_rel}"]

assert_git_scope()
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

parity_ids = [
    *(f"AC-{index}" for index in range(1, 10)),
    *(f"TC-{index}" for index in range(1, 13)),
]
expected_verify_sha256 = {
    "AC-1": "36144a4e56115d3a2c1806ef2e825daa7a2208c21ecf1f89dd8eda46a553f16c",
    "AC-2": "9a6f549d2b2a85983534152e1c0acd66f8a37ae7a42839538d53af70c03c85bf",
    "AC-3": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "AC-4": "2dc8e657bac1b18ce01fde1ca2fb1fc4fc1198579084cb4b3c09bf45d15e98d5",
    "AC-5": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "AC-6": "a11442879b3087d0a540f1b387d4df54c8642fb6b8fd08420560a5f87e079783",
    "AC-7": "9a6f549d2b2a85983534152e1c0acd66f8a37ae7a42839538d53af70c03c85bf",
    "AC-8": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "AC-9": "7e9e54480e7880d1732fa23f72714d97334223085d32f577a42806488e1d6aba",
    "TC-1": "36144a4e56115d3a2c1806ef2e825daa7a2208c21ecf1f89dd8eda46a553f16c",
    "TC-2": "36144a4e56115d3a2c1806ef2e825daa7a2208c21ecf1f89dd8eda46a553f16c",
    "TC-3": "9a6f549d2b2a85983534152e1c0acd66f8a37ae7a42839538d53af70c03c85bf",
    "TC-4": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "TC-5": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "TC-6": "36144a4e56115d3a2c1806ef2e825daa7a2208c21ecf1f89dd8eda46a553f16c",
    "TC-7": "2dc8e657bac1b18ce01fde1ca2fb1fc4fc1198579084cb4b3c09bf45d15e98d5",
    "TC-8": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "TC-9": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "TC-10": "9a6f549d2b2a85983534152e1c0acd66f8a37ae7a42839538d53af70c03c85bf",
    "TC-11": "bc2ed30989b270e6c9a4605659aa4b746427ce15ee76c9e5b1da17bc4a9f38ff",
    "TC-12": "7e9e54480e7880d1732fa23f72714d97334223085d32f577a42806488e1d6aba",
}
assert set(expected_verify_sha256) == expected_target_ids
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
    assert hashlib.sha256(human_match.group(1).encode()).hexdigest() == expected_verify_sha256[requirement_id]

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
            assert hashlib.sha256(human_match.group(1).encode()).hexdigest() == expected_verify_sha256[requirement_id]

        positive_verify = candidate_by_id["AC-1"]["verify"]
        assert all(
            candidate_by_id[requirement_id]["verify"] == positive_verify
            for requirement_id in ["TC-1", "TC-2", "TC-6"]
        )
        for required_fragment in [
            "(.telemetry.modelRequests | type == \"number\" and . >= 1)",
            "(.telemetry.fleetRequests | type == \"number\" and . >= 1)",
            ".telemetry.cloudRequests == 0",
            ".telemetry.unknownRequests == 0",
            ".telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests)",
            "([.mini_results[].ssh_destination] | unique | length) == 2",
            "([.mini_results[].reported_tailnet_hostname] | unique | length) == 2",
            ".hostname_source == \"remote-command\"",
            ".canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\"",
            ".bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"]",
            ".finished_epoch_ms > .started_epoch_ms",
            "(.finished_epoch_ms - .started_epoch_ms) <= 15000",
            ".binding_verified == true",
        ]:
            assert required_fragment in positive_verify

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
            "([.attempts[].ssh_destination] | unique | length) == 2",
            "([.attempts[].reported_tailnet_hostname] | unique | length) == 2",
            ".hostname_source == \"remote-command\"",
            ".canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\"",
            ".canonical_command_sha256",
            ".read_command_sha256",
            ".binding_verified == true",
            ".finished_epoch_ms > .started_epoch_ms",
            "(.finished_epoch_ms - .started_epoch_ms) <= 15000",
            ".bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"]",
        ]:
            assert required_fragment in no_mini_verify

        assert "public chat-runs agent.stream path" in candidate_by_id["AC-5"]["description"]
        assert "cloud/OpenAI" in candidate_by_id["AC-5"]["description"]
        assert "every underlying doStream or equivalent transport invocation" in candidate_by_id["AC-5"]["description"]
        assert "outer-stream-only" in candidate_by_id["AC-5"]["description"]
        assert "global-fetch" in candidate_by_id["AC-5"]["description"]
        assert all(
            field in candidate_by_id["AC-6"]["description"]
            for field in ["sourceRevision", "imageDigest", "composeSha256"]
        )
        assert all(
            field in candidate_by_id["AC-7"]["description"]
            for field in ["SSH destination", "remote-reported tailnet hostname", "command-output-exit-time hashes", "same-mini relabelling"]
        )
        assert "nonce binding" in candidate_by_id["AC-8"]["description"]
        assert "logical-node to SSH-destination to independently remote-reported tailnet-hostname bindings" in candidate_by_id["AC-8"]["description"]
        assert "product-manager plus mastra-reviewer" in candidate_by_id["AC-9"]["description"]
        ac8_scenario = json.dumps(candidate_by_id["AC-8"]["scenario"], sort_keys=True)
        assert "nonceLogBinding === false" in ac8_scenario
        assert "AMBIGUOUS_MINI_CORRELATION" in ac8_scenario
        assert "DUPLICATE_MINI_IDENTITY" in ac8_scenario
        assert "two reads from the same mini relabelled as two logical nodes" in ac8_scenario
        ac9_scenario = json.dumps(candidate_by_id["AC-9"]["scenario"], sort_keys=True)
        lineage_verify = candidate_by_id["AC-9"]["verify"]
        assert candidate_by_id["TC-12"]["verify"] == lineage_verify
        for required_fragment in [
            "S33_EXPECTED_LANDED_MAIN_SHA",
            "S33_RED_FAILURE_EVIDENCE",
            "S33_PROOF_RECEIPT",
            "S33_SOURCE_PRODUCT_REVIEW",
            "S33_SOURCE_MASTRA_REVIEW",
            "S33_FINAL_PRODUCT_REVIEW",
            "S33_FINAL_MASTRA_REVIEW",
            "--expected-landed-main-sha",
            "--release-lock",
            ".schema == \"s33-plat-05-lineage/v1\"",
            ".git.recomputed == true",
            ".git.redParentSha == $base",
            ".git.redFailureEvidencePath == $redEvidence",
            ".git.redFailureEvidenceIndependentlyHashed == true",
            ".git.redDiffPaths == [\"services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts\"]",
            ".git.candidateDescendsFromRed == true",
            ".git.landedMainContainsCandidate == true",
            ".release.recomputed == true",
            ".release.lockPath == $releaseLock",
            ".proof.recomputed == true",
            ".proof.receiptPath == $proofReceipt",
            ".proof.receiptIndependentlyHashed == true",
            "artifactPath: .artifactPath",
            "([.reviews.source[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"]",
            "([.reviews.final[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"]",
            ".receipt.strictSchemaValidated == true",
            ".receipt.verifiedAgainstCallerInputs == true",
        ]:
            assert required_fragment in lineage_verify
        assert "mandatory product-manager and mastra-reviewer source approval artifacts" in ac9_scenario
        assert "package.sourceRevision === deploy.sourceRevision === proof.expectedMainSha === callerLandedMainSha" in ac9_scenario
        assert "mandatory product-manager and mastra-reviewer final approval artifacts" in ac9_scenario
        assert "Git cat-file, rev-parse, show/diff, and merge-base checks" in ac9_scenario
        assert "a self-reported Git, identity, approval, or artifact-hash boolean accepted without independent recomputation" in ac9_scenario

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

criterion_mutations = [
    (f"{requirement_id}-verify-true", contract_candidate(requirement_id, ["verify"], "true"))
    for requirement_id in parity_ids
]
criterion_mutation_ids = {
    label.removesuffix("-verify-true") for label, _ in criterion_mutations
}
assert criterion_mutation_ids == expected_target_ids
assert {"AC-1", "AC-3", "AC-4", "TC-1", "TC-7"} <= criterion_mutation_ids
same_node_positive = target_by_id["AC-1"]["verify"].replace(
    "([.mini_results[].reported_tailnet_hostname] | unique | length) == 2",
    "([.mini_results[].reported_tailnet_hostname] | unique | length) == 1",
    1,
)
same_node_no_mini = target_by_id["AC-2"]["verify"].replace(
    "([.attempts[].reported_tailnet_hostname] | unique | length) == 2",
    "([.attempts[].reported_tailnet_hostname] | unique | length) == 1",
    1,
)
forged_lineage_verify = target_by_id["AC-9"]["verify"].replace(
    ".git.recomputed == true",
    ".git.recomputed != false",
    1,
)
assert same_node_positive != target_by_id["AC-1"]["verify"]
assert same_node_no_mini != target_by_id["AC-2"]["verify"]
assert forged_lineage_verify != target_by_id["AC-9"]["verify"]
additional_mutations = [
    ("public-boundary-prose", target_text.replace(sentinels[0], "BROKEN-PUBLIC-BOUNDARY", 1)),
    ("network-continuity-prose", target_text.replace(sentinels[8], "BROKEN-NETWORK-CONTINUITY", 1)),
    ("positive-same-node-relabel", contract_candidate("AC-1", ["verify"], same_node_positive)),
    ("no-mini-same-node-relabel", contract_candidate("AC-2", ["verify"], same_node_no_mini)),
    ("forged-lineage-verifier", contract_candidate("AC-9", ["verify"], forged_lineage_verify)),
    (
        "correlation-same-node-scenario",
        contract_candidate(
            "AC-8",
            ["scenario", "cases", 0, "end_state", "must_observe"],
            ["nonceLogBinding === false", "AMBIGUOUS_MINI_CORRELATION"],
        ),
    ),
    (
        "forged-lineage-self-report",
        contract_candidate(
            "AC-9",
            ["scenario", "cases", 0, "action", "steps"],
            ["Trust receipt booleans and supplied hashes without Git or filesystem recomputation."],
        ),
    ),
    (
        "forged-review-identity",
        contract_candidate(
            "AC-9",
            ["description"],
            "Accept any self-reported reviewer identity and approval hash.",
        ),
    ),
]
mutation_candidates = criterion_mutations + additional_mutations

assert static_oracle(target_text)
with tempfile.TemporaryDirectory(prefix="s33-plat-05-spec-mutations-") as temp_dir:
    root = Path(temp_dir)
    for index, (label, candidate) in enumerate(mutation_candidates):
        mutation_path = root / f"mutation-{index}-{label}.md"
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
            "criterion_verify_mutations": len(criterion_mutations),
            "git_scope": [f"M\t{target_rel}", f"A\t{repair_rel}"],
        },
        sort_keys=True,
    )
)
```

## Validation gates

| Gate | Command | Expected |
|---|---|---|
| static contract and mutation oracle | Run AC-1/TC-1 exact verifier | JSON `ok=true`, 9 target scenarios, 1 repair scenario, 21 shell verifiers, 21 parity/hash checks, 21 criterion mutations, and 29 rejected filesystem mutations |
| planning consistency | `pnpm prd:consistency` | Exit 0 |
| diff scope | Executed inside the canonical verifier via `git diff --name-status 10196817d4c3ffcd6dcd4fc36537bee1947110e5..HEAD` after object and ancestry checks | Exactly target M plus this repair A |
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
      "description": "GIVEN the restored target and repair WHEN the canonical static verifier parses contracts, executes the base-anchored Git scope gate, validates scenarios, checks all 21 shell commands plus human/JSON parity and pinned hashes, and rejects 29 regular-file mutations including every criterion verify=true, same-node relabel, and forged-lineage controls THEN all original plus repaired requirements remain enforceable.",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'",
      "scenario": {
        "id": "SPEC-REPAIR-S33-PLAT-05/AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "local filesystem + Git planning contracts",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["removed_requirement", "verify_true", "static_fake_success", "empty_contract", "scope_drift", "same_node_relabel", "forged_lineage"]
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
                "Run bash -n on all 21 target verifier commands and compare all 21 human/JSON verifier pairs to pinned SHA-256 values.",
                "Run the canonical scenario validator on the 9 target and 1 repair scenarios.",
                "Execute Git object, ancestry, and exact base..HEAD name-status checks for target M plus repair A.",
                "Write 29 independently mutated target copies to a fresh temporary directory: one embedded verify=true copy per criterion plus public-boundary, Network Continuity, positive/no-mini same-node relabel, correlation scenario, forged-lineage verifier/scenario, and forged-review copies; require the full candidate oracle to reject each."
              ]
            },
            "end_state": {
              "must_observe": [
                "target requirement count === 21 and canonical target marker count === 1",
                "scenario validator reports target scenario_count === 9 and repair scenario_count === 1 with violations === []",
                "shell verifier syntax pass count === 21 and human/JSON parity plus pinned-hash count === 21",
                "criterion verify=true mutation count === 21 and filesystem mutation count === rejected mutation count === 29",
                "Git scope equals exactly target M plus repair A relative to 10196817d4c3ffcd6dcd4fc36537bee1947110e5",
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
      "description": "The canonical verifier proves unique contracts, all-21 executable shell syntax and pinned human/JSON verifier content, scenario validity, base-anchored exact Git scope, and 29 rejected regular-file mutations including every criterion verify=true, same-node relabel, and forged-lineage controls.",
      "maps_to_ac": "AC-1",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-PREDEPLOY-PROOF-CONTRACT.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'"
    }
  ]
}
-->
