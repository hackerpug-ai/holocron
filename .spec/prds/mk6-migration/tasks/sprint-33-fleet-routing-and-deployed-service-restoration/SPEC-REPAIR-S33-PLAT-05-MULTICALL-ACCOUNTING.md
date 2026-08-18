# SPEC-REPAIR S33-PLAT-05: Reconcile Multi-Call Mini Evidence

> Status: Backlog
> Assignee: mastra-planner
> Priority: P0
> Type: SPEC-REPAIR
> TDD_MODE: skipped — planning-only contract repair
> Target: `S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md`

## Outcome

Repair the positive S33-PLAT-05 proof so one public chat turn may make multiple underlying provider-model calls without being rejected merely because the serving mini appended more than one completion line. Success requires exactly one serving mini, not exactly one model call. All existing two-mini identity, topology, immutable deployment, review/lineage, no-cloud, fail-closed, and Network Continuity requirements remain conjunctive and non-weakened.

The live evidence that exposed the false cardinality assumption was inference1-originated public run `82b0b88d-2fa3-4d02-9fc4-cc8634a00eff`: it completed with substantive SSE and request accounting reported `modelRequests=2`, `fleetRequests=2`, `cloudRequests=0`, `unknownRequests=0`, `instrumentationBoundary=provider-model`, `underlyingTransportCalls=2`, and two response-header API bases naming inference1. This artifact records the observed shape; it is not itself the future governed proof receipt.

## Planning-only scope

This repair changes exactly:

1. `S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md` — MODIFY in place
2. `SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md` — ADD

It performs no source, runtime, evidence, state, network, remote, deployment, merge, or push operation.

## Binding repair

1. Let `N` be the serving mini's `matching_completion_count`.
2. Exactly one mini has `N > 0`; the other mini has count `0`.
3. `N` is an integer and `N >= 1`.
4. `N === telemetry.modelRequests === telemetry.fleetRequests === telemetry.telemetryRows === telemetry.underlyingTransportCalls === telemetry.responseHeaderApiBases.length`.
5. `telemetry.instrumentationBoundary === "provider-model"`, terminalization and reconciliation are true, and cloud/unknown counts are zero.
6. The top-level response header, accounting's singular response header, and every entry in `responseHeaderApiBases` equal `http://<serving-device-id>:8003/v1`.
7. Two positive minis, zero positive minis, any count mismatch, any header mismatch, a laptop/Holocron serving identity, an unknown request, or a non-provider-model boundary fails closed.
8. The public route uses `HOLO_KEY_RN`. Curl-config URL and header values stay quoted while credential values remain absent from argv, logs, receipts, and evidence.
9. In-container telemetry/trace reads use `/app/src/cli/holo.ts` and privately bootstrap `DATABASE_URL` from `/run/secrets/database_url` without disclosing it.
10. After the public POST is attempted, every subsequent error receipt truthfully retains `chat_request_issued:true`; only pre-POST failures may report false.
11. Network Continuity remains absolute: only bounded public HTTP plus read-only SSH/Docker reads are allowed; no service, Tailscale, Wi-Fi, interface, route, DNS, or other network mutation and no literal disconnect claim is permitted.

## Acceptance Criteria

### AC-1 — The repaired target is canonical, executable, and rejects false multi-call proofs

- **GIVEN** the target task and this planning-only repair
- **WHEN** the static verifier uniquely extracts both canonical requirement contracts, syntax-checks every shell verifier, validates every scenario, checks human/JSON parity, evaluates a synthetic two-call serving receipt with the target's actual `jq` predicate, and applies structured receipt and contract mutations
- **THEN** the two-call baseline passes and mutations for two serving minis, zero calls, serving/model/fleet/telemetry-row/transport/header mismatches, laptop attribution, unknown traffic, non-provider-model instrumentation, or false post-chat issuance all fail
- **AND** the only changed paths are the target task and this new repair artifact, based on exact main `146b6e64472461219b52f820894138678b8c0371`
- **Verify:** `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'`
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: real temporary-file and receipt mutations

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both contracts parse uniquely, all shell verifiers pass `bash -n`, all scenarios validate, positive human/JSON commands match, the two-call receipt passes, and every false cardinality/provenance/issuance mutation is rejected. | AC-1 | `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'` |

## Static verifier and mutation oracle

The verifier uses only local Git reads, contract parsing, `bash -n`, the canonical scenario validator, `jq` against synthetic receipts, and regular files beneath a temporary directory. It never executes the future live verifier, SSH, HTTP, Docker, deployment, or any network command.

<!-- STATIC-VERIFIER v1 -->
```python
from copy import deepcopy
from pathlib import Path
import json
import re
import subprocess
import sys
import tempfile

repair_path = Path(__file__).resolve()
target_path = repair_path.with_name(
    "S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md"
)
base_sha = "146b6e64472461219b52f820894138678b8c0371"
target_rel = ".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/S33-PLAT-05-prove-a-deployed-chat-turn-is-generated-on-a-mac-mini-two-no.md"
repair_rel = ".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md"
marker = "<!-- REQUIREMENT-" + "CONTRACT v1 -->"
contract_pattern = re.compile(
    re.escape(marker) + r"\s*<!--\s*(\{.*\})\s*-->", re.S
)
target_text = target_path.read_text()
repair_text = repair_path.read_text()

assert target_path.is_file() and not target_path.is_symlink()
assert repair_path.is_file() and not repair_path.is_symlink()
assert target_text.count(marker) == 1
assert repair_text.count(marker) == 1
target_match = contract_pattern.search(target_text)
repair_match = contract_pattern.search(repair_text)
assert target_match and repair_match
target_contract = json.loads(target_match.group(1))
repair_contract = json.loads(repair_match.group(1))

repo = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    cwd=repair_path.parent,
    text=True,
    capture_output=True,
    check=True,
).stdout.strip()
assert subprocess.run(
    ["git", "merge-base", "--is-ancestor", base_sha, "HEAD"], cwd=repo
).returncode == 0
committed = subprocess.run(
    ["git", "diff", "--name-only", f"{base_sha}..HEAD"],
    cwd=repo,
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()
status = subprocess.run(
    ["git", "status", "--porcelain", "--untracked-files=all"],
    cwd=repo,
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()
allowed = {target_rel, repair_rel}
assert set(committed) <= allowed
for row in status:
    path = row[3:].split(" -> ")[-1]
    assert path in allowed, row
assert subprocess.run(
    ["git", "diff", "--quiet", base_sha, "--", target_rel], cwd=repo
).returncode == 1
assert subprocess.run(
    ["git", "cat-file", "-e", f"{base_sha}:{repair_rel}"],
    cwd=repo,
    capture_output=True,
).returncode != 0

target_by_id = {item["id"]: item for item in target_contract["requirements"]}
repair_by_id = {item["id"]: item for item in repair_contract["requirements"]}
expected_target_ids = {
    *(f"AC-{index}" for index in range(1, 10)),
    *(f"TC-{index}" for index in range(1, 13)),
}
assert set(target_by_id) == expected_target_ids
assert set(repair_by_id) == {"AC-1", "TC-1"}
assert target_contract["tdd_mode"] == "red_first"
assert repair_contract["tdd_mode"] == "skipped"

positive_ids = ["AC-1", "TC-1", "TC-2", "TC-6"]
positive_verify = target_by_id["AC-1"]["verify"]
assert all(target_by_id[item_id]["verify"] == positive_verify for item_id in positive_ids)
for item_id in positive_ids:
    if item_id.startswith("AC-"):
        human = re.search(
            rf"### {item_id} .*?- \*\*Verify:\*\* `(.*?)`", target_text, re.S
        )
    else:
        human = re.search(rf"^\| {item_id} \|.*\| `(.*)` \|$", target_text, re.M)
    assert human and human.group(1) == target_by_id[item_id]["verify"]

required_positive_fragments = [
    "select(.matching_completion_count > 0)",
    ".telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)",
    ".telemetry.fleetRequests == .telemetry.modelRequests",
    ".telemetry.telemetryRows == .telemetry.modelRequests",
    ".telemetry.underlyingTransportCalls == .telemetry.modelRequests",
    ".telemetry.responseHeaderApiBases | type == \"array\"",
    "(.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests",
    "all(.telemetry.responseHeaderApiBases[]; . == (\"http://\" + $served + \":8003/v1\"))",
    ".telemetry.instrumentationBoundary == \"provider-model\"",
    ".telemetry.cloudRequests == 0",
    ".telemetry.unknownRequests == 0",
    ".network_mutation_performed == false",
    ".literal_disconnect_claimed == false",
]
assert all(fragment in positive_verify for fragment in required_positive_fragments)
assert ".matching_completion_count == 0 or .matching_completion_count == 1" not in positive_verify
assert "select(.matching_completion_count == 1)" not in positive_verify

execution_sentinels = [
    "Authorization Bearer HOLO_KEY_RN, supplied over SSH stdin and rendered as quoted curl-config URL/header values without credential argv/log/evidence exposure",
    "`bun /app/src/cli/holo.ts ...` inside the Mastra container after privately bootstrapping `DATABASE_URL` from `/run/secrets/database_url`",
    "every later failure receipt preserves `chat_request_issued:true`",
    "Exactly one serving mini has count `N >= 1`, the other count is zero",
    "NETWORK CONTINUITY: the verifier may make bounded public HTTP requests and read-only SSH/Docker reads only.",
]
assert all(sentinel in target_text for sentinel in execution_sentinels)
assert "Authorization Bearer HOLO_KEY_MCP" not in target_text

for contract in [target_contract, repair_contract]:
    for item in contract["requirements"]:
        result = subprocess.run(
            ["bash", "-n", "-c", item["verify"]],
            text=True,
            capture_output=True,
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
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert json.loads(result.stdout) == {
        "ok": True,
        "scenario_count": expected_count,
        "violations": [],
    }

jq_match = re.search(r"\| jq -e '(.*?)' >/dev/null$", positive_verify, re.S)
assert jq_match
jq_filter = jq_match.group(1)
sha = "a" * 64

def mini(node: str, count: int) -> dict:
    device = f"{node}.tail011a51.ts.net"
    return {
        "node": node,
        "device_id": device,
        "ssh_destination": node,
        "reported_tailnet_hostname": device,
        "hostname_source": "remote-command",
        "canonical_log_path": "~/local-llm/logs/omlx-mini-8003.log",
        "bounded_ssh_options": [
            "BatchMode=yes",
            "ConnectTimeout=10",
            "ServerAliveCountMax=2",
            "ServerAliveInterval=5",
        ],
        "command_sha256": sha,
        "stdout_sha256": sha,
        "command_exit": 0,
        "started_epoch_ms": 1000,
        "finished_epoch_ms": 2000,
        "binding_verified": True,
        "receipt_binding_sha256": sha,
        "query_succeeded": True,
        "matching_completion_count": count,
    }

serving = "inference1.tail011a51.ts.net"
serving_url = f"http://{serving}:8003/v1"
baseline = {
    "ok": True,
    "chat_request_issued": True,
    "request_origin": "inference1",
    "assistant_text_length": 42,
    "mini_results": [mini("inference1", 2), mini("inference2", 0)],
    "serving_device_id": serving,
    "response_header_api_base": serving_url,
    "telemetry": {
        "modelRequests": 2,
        "fleetRequests": 2,
        "cloudRequests": 0,
        "unknownRequests": 0,
        "telemetryRows": 2,
        "underlyingTransportCalls": 2,
        "responseHeaderApiBase": serving_url,
        "responseHeaderApiBases": [serving_url, serving_url],
        "instrumentationBoundary": "provider-model",
        "terminalized": True,
        "reconciliationComplete": True,
        "resolved_fleet_endpoint": "http://host.docker.internal:4545/v1",
    },
    "effective_topology": {
        "ssh_destination": "holocron@holocron",
        "compose_project": "holocron-router",
        "compose_service": "litellm-router",
        "implementer_records": [
            {"model": "openai/Qwen3.6-35B-A3B-MLX-8bit", "api_base": "http://inference1.tail011a51.ts.net:8003/v1"},
            {"model": "openai/Qwen3.6-35B-A3B-MLX-8bit", "api_base": "http://inference2.tail011a51.ts.net:8003/v1"},
        ],
        "config_sha256": sha,
    },
    "network_mutation_performed": False,
    "literal_disconnect_claimed": False,
}

def receipt_passes(receipt: dict) -> bool:
    result = subprocess.run(
        ["jq", "-e", jq_filter],
        input=json.dumps(receipt),
        text=True,
        capture_output=True,
    )
    return result.returncode == 0

assert receipt_passes(baseline)

mutations = {}
def mutated(name: str) -> dict:
    value = deepcopy(baseline)
    mutations[name] = value
    return value

mutated("two-serving-minis")["mini_results"][1]["matching_completion_count"] = 2
zero = mutated("zero-count")
zero["mini_results"][0]["matching_completion_count"] = 0
for field in ["modelRequests", "fleetRequests", "telemetryRows", "underlyingTransportCalls"]:
    value = mutated(f"{field}-mismatch")
    value["telemetry"][field] = 3
mutated("serving-count-mismatch")["mini_results"][0]["matching_completion_count"] = 1
mutated("header-count-mismatch")["telemetry"]["responseHeaderApiBases"] = [serving_url]
mutated("header-node-mismatch")["telemetry"]["responseHeaderApiBases"][1] = "http://inference2.tail011a51.ts.net:8003/v1"
laptop = mutated("laptop-serving")
laptop["serving_device_id"] = "holocron.tail011a51.ts.net"
laptop["response_header_api_base"] = "http://holocron.tail011a51.ts.net:8003/v1"
mutated("unknown-request")["telemetry"]["unknownRequests"] = 1
mutated("wrong-boundary")["telemetry"]["instrumentationBoundary"] = "global-fetch"
assert all(not receipt_passes(value) for value in mutations.values())

def post_chat_error_passes(value: dict) -> bool:
    return not value["post_attempted"] or value["chat_request_issued"] is True

assert post_chat_error_passes({"post_attempted": True, "chat_request_issued": True})
assert not post_chat_error_passes({"post_attempted": True, "chat_request_issued": False})

def static_target_passes(candidate: str) -> bool:
    return (
        candidate.count(marker) == 1
        and all(sentinel in candidate for sentinel in execution_sentinels)
        and "Authorization Bearer HOLO_KEY_MCP" not in candidate
        and ".matching_completion_count == 0 or .matching_completion_count == 1" not in candidate
    )

assert static_target_passes(target_text)
with tempfile.TemporaryDirectory(prefix="s33-plat-05-multicall-spec-") as temp_dir:
    root = Path(temp_dir)
    for index, sentinel in enumerate(execution_sentinels):
        candidate = target_text.replace(sentinel, f"BROKEN-{index}")
        mutation_path = root / f"target-mutation-{index}.md"
        mutation_path.write_text(candidate)
        assert mutation_path.is_file() and not mutation_path.is_symlink()
        assert not static_target_passes(mutation_path.read_text())

print(json.dumps({
    "ok": True,
    "target_requirements": len(target_by_id),
    "repair_requirements": len(repair_by_id),
    "target_scenarios": 9,
    "repair_scenarios": 1,
    "shell_verifiers": len(target_by_id) + len(repair_by_id),
    "positive_human_json_parity": len(positive_ids),
    "receipt_mutations_rejected": len(mutations),
    "post_chat_issuance_mutation_rejected": True,
    "contract_mutations_rejected": len(execution_sentinels),
    "scope": [target_rel, repair_rel],
}, sort_keys=True))
```

## Validation gates

| Gate | Command | Expected |
|---|---|---|
| static contract and mutation oracle | Run AC-1/TC-1 exact verifier | JSON `ok=true`; 21 target plus 2 repair shell verifiers; 9 target plus 1 repair scenarios; two-call baseline accepted; all receipt, issuance, and contract mutations rejected |
| planning consistency | `pnpm prd:consistency` | Exit 0 |
| diff scope | canonical verifier local Git checks | Exactly target M plus this repair A relative to `146b6e64472461219b52f820894138678b8c0371` |
| hooks | normal commit, no bypass | Exit 0 |

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": false,
    "requires_red_evidence": false,
    "requires_seeded_evidence": false
  },
  "fixtures": {
    "repaired_target_contract": {
      "description": "The target task plus this planning-only repair, validated locally without runtime or network mutation.",
      "seed_method": "cli",
      "records": [
        "exact base main is 146b6e64472461219b52f820894138678b8c0371",
        "only the target task and this repair artifact may differ",
        "the two-call synthetic baseline mirrors the observed provider-model accounting shape without substituting for live governed proof"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the target and repair WHEN the local static verifier extracts canonical JSON, bash-n checks every verifier, validates scenarios, checks parity, runs the target jq predicate on a two-call baseline, and mutates receipt and contract facts THEN the baseline passes while false serving, cardinality, provenance, issuance, secret-handling, CLI-path, and Network Continuity contracts are rejected.",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'",
      "scenario": {
        "id": "SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING/AC-1",
        "tier": "contract",
        "test_tier": "integration",
        "verification_service": "local-filesystem-git-jq",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["static", "stub", "mock", "two_serving_minis", "count_mismatch", "header_mismatch", "laptop", "unknown", "false_post_chat_issuance"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repaired_target_contract",
            "action": {
              "actor": "mastra-planner",
              "steps": [
                "Extract both canonical requirement contracts and validate shell syntax, scenarios, parity, and exact two-file Git scope.",
                "Run the target AC-1 jq predicate against a synthetic provider-model receipt with one serving mini count two, the other zero, and every accounting/header count equal two.",
                "Mutate dual-serving, zero, serving/model/fleet/telemetry-row/transport/header, laptop, unknown, instrumentation-boundary, post-chat issuance, credential, CLI-path, and Network Continuity facts one at a time."
              ]
            },
            "end_state": {
              "must_observe": [
                "baseline matching_completion_count === 2 and telemetry.modelRequests === 2 passes jq -e",
                "exactly 12 receipt mutations plus 1 post-chat issuance mutation and 5 contract mutations are rejected",
                "all 10 scenarios validate with zero violations",
                "Git scope contains exactly 2 paths and network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "0 model calls, empty responseHeaderApiBases, or an exactly-one-call constraint",
                "a second serving mini",
                "a count or header mismatch",
                "HOLO_KEY_MCP used for the public route",
                "a secret in argv, logs, receipts, or evidence",
                "a false chat_request_issued value after POST",
                "a service or network mutation"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Both contracts parse uniquely, every shell verifier passes bash-n, all scenarios validate, positive human and JSON commands match, a two-call one-serving-mini receipt passes, and all false cardinality, provenance, issuance, and execution-contract mutations are rejected.",
      "maps_to_ac": "AC-1",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'"
    }
  ]
}
-->
