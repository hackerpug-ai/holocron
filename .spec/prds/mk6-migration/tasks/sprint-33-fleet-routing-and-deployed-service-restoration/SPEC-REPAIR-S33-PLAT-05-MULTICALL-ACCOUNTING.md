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
8. Only `HOLO_KEY_RN` may authorize the public Hono chat routes; `HOLO_KEY_MCP` is forbidden for every public request. Auth travels over private SSH stdin into a trap-removed mode-0600 temporary curl config; every URL/header value is quoted and escaped, and no secret value may appear in argv, stdout, stderr, JSON receipts, or retained artifacts. A fail-closed positive grammar allows literal names in prose/lists plus exactly two expansion-bearing standalone command forms: `test "${HOLO_KEY_RN+x}" = x` and the target's exact private-stdin verifier invocation. Every other shell expansion rejects independently of wrappers, prefixes, absolute paths, curl options, or positional argv; private non-secret stdin/config path arguments remain valid.
9. In-container telemetry/trace reads use `/app/src/cli/holo.ts` and privately bootstrap `DATABASE_URL` from `/run/secrets/database_url` without disclosing it.
10. A contractually executable `post-chat-invalid-stream` control must first complete a real public 2xx POST, capture its non-empty run ID and real SSE stream, truncate only a private copy of the first SSE JSON payload, and invoke the target verifier's production response parser. That target path must exit nonzero with `CHAT_STREAM_PARSE_FAILED`, `chat_request_issued:true`, real-stream and target-verifier receipt provenance, `synthetic:false`, zero secret exposure, and zero network mutation; a hand-authored receipt cannot pass.
11. Network Continuity remains absolute: only bounded public HTTP plus read-only SSH/Docker reads are allowed; no service, Tailscale, Wi-Fi, interface, route, DNS, or other network mutation and no literal disconnect claim is permitted.

## Acceptance Criteria

### AC-1 — The repaired target is canonical, executable, and rejects false multi-call proofs

- **GIVEN** the target task and this planning-only repair
- **WHEN** the static verifier uniquely extracts both canonical requirement contracts, syntax-checks every shell verifier, validates every scenario, checks human/JSON parity, evaluates a synthetic two-call serving receipt with the target's actual `jq` predicate, and applies structured receipt and contract mutations
- **THEN** the two-call baseline passes and distinct mutations for two serving minis, zero calls, serving/model/fleet/telemetry-row/transport/plural-header mismatches, missing or mismatched top-level and telemetry singular headers, laptop attribution, unknown traffic, or non-provider-model instrumentation all fail
- **AND** the target AC-10/TC-13 command is identical in human and JSON forms, syntax-valid, invokes the target verifier's real post-POST invalid-stream mode, requires a nonzero verifier exit, and the credential grammar accepts only its 2 canonical expansion-bearing lines while rejecting every wrapper/prefix/absolute-path/argv/inline-assignment variant plus all prior post-chat, MCP-auth, secret-exposure, unquoted/temp-leak, and network-mutation mutants
- **AND** the only changed paths are the target task and this new repair artifact, based on exact main `146b6e64472461219b52f820894138678b8c0371`
- **Verify:** `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'`
- **Scenario:** topology `single-node` · evidence `file_artifact` · negative control: real temporary-file and receipt mutations

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Both contracts parse uniquely, all shell verifiers pass `bash -n`, all scenarios validate, positive plus post-POST parity holds, the two-call receipt passes, 2 exact credential-expansion forms pass, and direct plus command/timeout/random-wrapper `-H`/`-d`/`-u`, positional, inline, and parameter-variant candidates reject. | AC-1 | `python3 -c 'import pathlib,re; p=pathlib.Path(".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md"); s=p.read_text(); m=re.search(r"<!-- STATIC-VERIFIER v1 -->\s*```python\n(.*?)\n```",s,re.S); assert m; exec(compile(m.group(1),str(p),"exec"),{"__file__":str(p)})'` |

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
    *(f"AC-{index}" for index in range(1, 11)),
    *(f"TC-{index}" for index in range(1, 14)),
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
    ".response_header_api_base == (\"http://\" + $served + \":8003/v1\")",
    ".telemetry.responseHeaderApiBase == (\"http://\" + $served + \":8003/v1\")",
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

canonical_presence_line = 'test "${HOLO_KEY_RN+x}" = x'
canonical_private_stdin_line = 'PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode post-chat-invalid-stream --json <<<"${HOLO_KEY_RN}" >"$receipt"'

execution_sentinels = [
    "PUBLIC AUTH AND SECRET HYGIENE: only `HOLO_KEY_RN` may authorize the public Hono chat POST/GET routes; `HOLO_KEY_MCP` is forbidden for every public request.",
    "POSITIVE CREDENTIAL GRAMMAR: literal credential-name references are allowed in prose and credential-name lists, but command-bearing contract text may contain a shell expansion of `HOLO_KEY_RN` only on either of the two exact standalone lines below.",
    "mode-0600 temporary curl config",
    "Secret values are forbidden in process argv, stdout, stderr, JSON receipts, and retained artifacts.",
    "`bun /app/src/cli/holo.ts ...` inside the Mastra container after privately bootstrapping `DATABASE_URL` from `/run/secrets/database_url`",
    "every later failure receipt preserves `chat_request_issued:true`",
    "Exactly one serving mini has count `N >= 1`, the other count is zero",
    "NETWORK CONTINUITY: the verifier may make bounded public HTTP requests and read-only SSH/Docker reads only.",
]
assert all(sentinel in target_text for sentinel in execution_sentinels)
assert target_text.splitlines().count(canonical_presence_line) == 1
assert target_text.splitlines().count(canonical_private_stdin_line) == 1

post_chat_ids = ["AC-10", "TC-13"]
post_chat_verify = target_by_id["AC-10"]["verify"]
assert all(target_by_id[item_id]["verify"] == post_chat_verify for item_id in post_chat_ids)
for item_id in post_chat_ids:
    if item_id.startswith("AC-"):
        human = re.search(
            rf"### {item_id} .*?- \*\*Verify:\*\* `(.*?)`", target_text, re.S
        )
    else:
        human = re.search(rf"^\| {item_id} \|.*\| `(.*)` \|$", target_text, re.M)
    assert human and human.group(1) == target_by_id[item_id]["verify"]

required_post_chat_fragments = [
    "bash scripts/verify-s33-mini-served-turn.sh --mode post-chat-invalid-stream --json",
    "if PLATFORM_IT=1",
    ".error_code == \"CHAT_STREAM_PARSE_FAILED\"",
    ".chat_request_issued == true",
    ".public_post_succeeded == true",
    ".public_post_http_status >= 200",
    ".chat_run_id | type == \"string\" and length > 0",
    ".failure_stage == \"stream-response-parse\"",
    ".stream_capture_source == \"real-public-stream\"",
    ".response_mutation == \"truncate-first-sse-json-in-private-copy\"",
    ".receipt_source == \"scripts/verify-s33-mini-served-turn.sh\"",
    ".verifier_mode == \"post-chat-invalid-stream\"",
    ".synthetic == false",
    ".credential_contract.public_key_name == \"HOLO_KEY_RN\"",
    ".credential_contract.mcp_key_used_for_public_request == false",
    ".credential_contract.curl_config_values_quoted == true",
    ".credential_contract.secret_transport == \"ssh-stdin-private-0600-temp-curl-config\"",
    ".credential_contract.private_temp_config_removed == true",
    ".credential_contract.secret_in_argv == false",
    ".credential_contract.secret_in_stdout == false",
    ".credential_contract.secret_in_stderr == false",
    ".credential_contract.secret_in_receipt == false",
    ".credential_contract.secret_in_artifact == false",
    ".network_mutation_performed == false",
    ".literal_disconnect_claimed == false",
]
assert all(fragment in post_chat_verify for fragment in required_post_chat_fragments)
assert "jq -n" not in post_chat_verify

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
for contract, expected_count in [(target_contract, 10), (repair_contract, 1)]:
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
mutated("top-level-singular-header-mismatch")["response_header_api_base"] = "http://inference2.tail011a51.ts.net:8003/v1"
mutated("top-level-singular-header-missing").pop("response_header_api_base")
mutated("telemetry-singular-header-mismatch")["telemetry"]["responseHeaderApiBase"] = "http://inference2.tail011a51.ts.net:8003/v1"
mutated("telemetry-singular-header-missing")["telemetry"].pop("responseHeaderApiBase")
laptop = mutated("laptop-serving")
laptop["serving_device_id"] = "holocron.tail011a51.ts.net"
laptop["response_header_api_base"] = "http://holocron.tail011a51.ts.net:8003/v1"
mutated("unknown-request")["telemetry"]["unknownRequests"] = 1
mutated("wrong-boundary")["telemetry"]["instrumentationBoundary"] = "global-fetch"
assert all(not receipt_passes(value) for value in mutations.values())

credential_expansion_pattern = re.compile(
    r"\$(?:HOLO_KEY_(?:RN|MCP)\b|\{HOLO_KEY_(?:RN|MCP)[^}]*\})"
)

def credential_expansion_grammar_passes(candidate: str) -> bool:
    for line in candidate.splitlines():
        expansions = [match.group(0) for match in credential_expansion_pattern.finditer(line)]
        if not expansions:
            continue
        if line == canonical_presence_line and expansions == ["${HOLO_KEY_RN+x}"]:
            continue
        if line == canonical_private_stdin_line and expansions == ["${HOLO_KEY_RN}"]:
            continue
        return False
    return True

semantic_credential_contradictions = [
    re.compile(r"Authorization\s*:?\s*Bearer\s+\$?\{?HOLO_KEY_MCP\}?"),
    re.compile(r"PUBLIC_REQUEST_AUTH\s*=\s*HOLO_KEY_MCP"),
]

def human_verify(candidate: str, item_id: str):
    if item_id.startswith("AC-"):
        match = re.search(
            rf"### {item_id} .*?- \*\*Verify:\*\* `(.*?)`", candidate, re.S
        )
    else:
        match = re.search(rf"^\| {item_id} \|.*\| `(.*)` \|$", candidate, re.M)
    return match.group(1) if match else None

def static_target_passes(candidate: str) -> bool:
    try:
        if candidate.count(marker) != 1:
            return False
        match = contract_pattern.search(candidate)
        if not match:
            return False
        contract = json.loads(match.group(1))
        by_id = {item["id"]: item for item in contract["requirements"]}
        if set(by_id) != expected_target_ids:
            return False
        positive = by_id["AC-1"]["verify"]
        post_chat = by_id["AC-10"]["verify"]
        return (
            all(sentinel in candidate for sentinel in execution_sentinels)
            and all(fragment in positive for fragment in required_positive_fragments)
            and all(fragment in post_chat for fragment in required_post_chat_fragments)
            and all(by_id[item_id]["verify"] == positive for item_id in positive_ids)
            and all(by_id[item_id]["verify"] == post_chat for item_id in post_chat_ids)
            and all(human_verify(candidate, item_id) == by_id[item_id]["verify"] for item_id in positive_ids + post_chat_ids)
            and candidate.splitlines().count(canonical_presence_line) == 1
            and candidate.splitlines().count(canonical_private_stdin_line) == 1
            and credential_expansion_grammar_passes(candidate)
            and not any(pattern.search(candidate) for pattern in semantic_credential_contradictions)
            and ".matching_completion_count == 0 or .matching_completion_count == 1" not in candidate
            and "select(.matching_completion_count == 1)" not in candidate
            and ".credential_contract.mcp_key_used_for_public_request == true" not in post_chat
            and not re.search(r"\.credential_contract\.secret_in_(?:argv|stdout|stderr|receipt|artifact) == true", post_chat)
            and ".credential_contract.curl_config_values_quoted == false" not in post_chat
            and ".credential_contract.private_temp_config_removed == false" not in post_chat
            and ".network_mutation_performed == true" not in post_chat
            and "jq -n" not in post_chat
        )
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return False

def contract_verify_candidate(replacements: list[tuple[str, str]]) -> str:
    contract = deepcopy(target_contract)
    by_id = {item["id"]: item for item in contract["requirements"]}
    for item_id in post_chat_ids:
        verify = by_id[item_id]["verify"]
        for old, new in replacements:
            assert old in verify
            verify = verify.replace(old, new)
        by_id[item_id]["verify"] = verify
    start, end = target_match.span(1)
    return target_text[:start] + json.dumps(contract, indent=2) + target_text[end:]

assert static_target_passes(target_text)
safe_credential_candidates = {
    "canonical-two-form-target": target_text,
    "literal-names-and-private-paths": target_text + '\nHOLO_KEY_RN HOLO_KEY_MCP\nssh inference1 private-reader < "$S33_PRIVATE_STDIN_PATH"; curl --config "$S33_PRIVATE_CURL_CONFIG"\n',
}
assert all(static_target_passes(candidate) for candidate in safe_credential_candidates.values())
contract_mutations = {}
with tempfile.TemporaryDirectory(prefix="s33-plat-05-multicall-spec-") as temp_dir:
    root = Path(temp_dir)
    for index, sentinel in enumerate(execution_sentinels):
        candidate = target_text.replace(sentinel, f"BROKEN-{index}")
        contract_mutations[f"missing-sentinel-{index}"] = candidate

    contract_mutations["missing-canonical-presence-form"] = target_text.replace(
        canonical_presence_line, "test credential-name-presence"
    )
    contract_mutations["missing-canonical-private-stdin-form"] = target_text.replace(
        canonical_private_stdin_line, "run-target-verifier-with-private-input"
    )

    post_chat_replacements = {
        "false-post-chat-issuance": [(".chat_request_issued == true", ".chat_request_issued == false")],
        "no-real-public-post": [(".public_post_succeeded == true", ".public_post_succeeded == false")],
        "pre-post-status": [(".public_post_http_status >= 200", ".public_post_http_status == 0")],
        "synthetic-stream": [(".stream_capture_source == \"real-public-stream\"", ".stream_capture_source == \"synthetic\"")],
        "hand-authored-receipt": [(".receipt_source == \"scripts/verify-s33-mini-served-turn.sh\"", ".receipt_source == \"hand-authored\"")],
        "bypass-target-verifier": [("bash scripts/verify-s33-mini-served-turn.sh --mode post-chat-invalid-stream --json", "jq -n --argjson ok false '{ok:$ok}'")],
        "mcp-public-auth": [(".credential_contract.mcp_key_used_for_public_request == false", ".credential_contract.mcp_key_used_for_public_request == true")],
        "unquoted-curl-config": [(".credential_contract.curl_config_values_quoted == true", ".credential_contract.curl_config_values_quoted == false")],
        "argv-secret-transport": [(".credential_contract.secret_transport == \"ssh-stdin-private-0600-temp-curl-config\"", ".credential_contract.secret_transport == \"argv\"")],
        "temp-config-leak": [(".credential_contract.private_temp_config_removed == true", ".credential_contract.private_temp_config_removed == false")],
        "secret-in-argv": [(".credential_contract.secret_in_argv == false", ".credential_contract.secret_in_argv == true")],
        "secret-in-stdout": [(".credential_contract.secret_in_stdout == false", ".credential_contract.secret_in_stdout == true")],
        "secret-in-stderr": [(".credential_contract.secret_in_stderr == false", ".credential_contract.secret_in_stderr == true")],
        "secret-in-receipt": [(".credential_contract.secret_in_receipt == false", ".credential_contract.secret_in_receipt == true")],
        "secret-in-artifact": [(".credential_contract.secret_in_artifact == false", ".credential_contract.secret_in_artifact == true")],
        "network-mutation": [(".network_mutation_performed == false", ".network_mutation_performed == true")],
    }
    for name, replacements in post_chat_replacements.items():
        contract_mutations[name] = contract_verify_candidate(replacements)

    credential_text_mutations = {
        "contradictory-mcp-use": "\nPUBLIC_REQUEST_AUTH=HOLO_KEY_MCP\n",
        "credential-in-header-argv": '\ncurl --header "Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-header-separated": '\ncurl -H "Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-header-attached": '\ncurl -H"Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-header-equals": '\ncurl -H="Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-header-cluster": '\ncurl -sSH"Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-data-separated": '\ncurl -d "token=${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-data-attached": '\ncurl -d"token=${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-data-equals": '\ncurl -d="token=${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-user-separated": '\ncurl -u "agent:${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-user-attached": '\ncurl -u"agent:${HOLO_KEY_RN}" https://example.invalid\n',
        "credential-in-short-user-equals": '\ncurl -u="agent:${HOLO_KEY_RN}" https://example.invalid\n',
        "inline-secret-assignment": '\nHOLO_KEY_RN="$HOLO_KEY_RN" curl https://example.invalid\n',
        "inline-env-secret-assignment": '\nenv HOLO_KEY_RN="${HOLO_KEY_RN}" curl https://example.invalid\n',
        "credential-in-positional-argv": '\ncurl https://example.invalid "$HOLO_KEY_RN"\n',
        "command-wrapper-short-header": '\ncommand curl -H "Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "command-wrapper-short-data": '\ncommand curl -d "${HOLO_KEY_RN}" https://example.invalid\n',
        "command-wrapper-short-user": '\ncommand curl -u "${HOLO_KEY_RN}" https://example.invalid\n',
        "timeout-wrapper-short-header": '\ntimeout 1 curl -H "Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "timeout-wrapper-short-data": '\ntimeout 1 curl -d "${HOLO_KEY_RN}" https://example.invalid\n',
        "timeout-wrapper-short-user": '\ntimeout 1 curl -u "${HOLO_KEY_RN}" https://example.invalid\n',
        "random-prefix-absolute-curl": '\nFOO=bar env LC_ALL=C nice -n 1 /usr/bin/curl -H "Authorization: Bearer ${HOLO_KEY_RN}" https://example.invalid\n',
        "parameter-expansion-variant": '\nrandom-wrapper curl -H "${HOLO_KEY_RN:-missing}" https://example.invalid\n',
        "prefixed-canonical-lookalike": "\nrandom-wrapper " + canonical_private_stdin_line + "\n",
        "credential-print-stdout": '\nprintf "%s\\n" "$HOLO_KEY_RN"\n',
        "credential-print-stderr": '\necho "$HOLO_KEY_RN" >&2\n',
        "credential-logger": '\nlogger "$HOLO_KEY_RN"\n',
        "credential-in-receipt": '\n{"secret":"${HOLO_KEY_RN}"}\n',
    }
    for name, suffix in credential_text_mutations.items():
        contract_mutations[name] = target_text + suffix

    for index, (name, candidate) in enumerate(contract_mutations.items()):
        mutation_path = root / f"target-mutation-{index}-{name}.md"
        mutation_path.write_text(candidate)
        assert mutation_path.is_file() and not mutation_path.is_symlink()
        assert not static_target_passes(mutation_path.read_text())

print(json.dumps({
    "ok": True,
    "target_requirements": len(target_by_id),
    "repair_requirements": len(repair_by_id),
    "target_scenarios": 10,
    "repair_scenarios": 1,
    "shell_verifiers": len(target_by_id) + len(repair_by_id),
    "human_json_parity": len(positive_ids) + len(post_chat_ids),
    "receipt_mutations_rejected": len(mutations),
    "singular_header_mutations_rejected": 4,
    "safe_credential_controls_accepted": len(safe_credential_candidates),
    "post_chat_and_credential_contract_mutations_rejected": len(contract_mutations),
    "scope": [target_rel, repair_rel],
}, sort_keys=True))
```

## Validation gates

| Gate | Command | Expected |
|---|---|---|
| static contract and mutation oracle | Run AC-1/TC-1 exact verifier | JSON `ok=true`; 23 target plus 2 repair shell verifiers; 10 target plus 1 repair scenarios; two-call baseline accepted; 16 receipt mutations including 4 singular-header controls plus 54 post-chat/credential contract mutations rejected; 2 exact safe credential controls accepted |
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
        "the two-call synthetic baseline mirrors the observed provider-model accounting shape without substituting for live governed proof",
        "AC-10 and TC-13 contract a real public POST followed by the target verifier parser rejecting a truncated private copy of the real SSE stream; the static oracle validates the executable contract but performs no network request",
        "public Hono auth is HOLO_KEY_RN only; HOLO_KEY_MCP, credential argv/print/log/receipt/artifact exposure, unquoted curl config, and leaked temp config are rejection mutants",
        "the positive grammar accepts exactly the canonical names-only presence line and exact target-verifier private-stdin line; direct, command-wrapped, timeout-wrapped, randomly prefixed absolute-path, parameter-variant, curl-option, positional argv, and inline-assignment expansions are adversarial candidates"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the target and repair WHEN the local static verifier extracts canonical JSON, bash-n checks every verifier, validates scenarios, checks positive plus post-POST parity, runs the target jq predicate on a two-call baseline, and applies a positive grammar to every credential expansion THEN the baseline and exactly two canonical expansion forms pass while all other direct/wrapped/prefixed/absolute-path/argv/parameter variants plus false serving, cardinality, provenance, post-chat, CLI-path, and Network Continuity contracts reject.",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'",
      "scenario": {
        "id": "SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING/AC-1",
        "tier": "contract",
        "test_tier": "integration",
        "verification_service": "local-filesystem-git-jq",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["static", "stub", "mock", "two_serving_minis", "count_mismatch", "singular_header_mismatch", "laptop", "unknown", "false_post_chat_issuance", "hand_authored_receipt", "mcp_public_auth", "secret_exposure"]
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
                "Extract both canonical requirement contracts and validate shell syntax, scenarios, positive plus post-POST human/JSON parity, and exact two-file Git scope.",
                "Run the target AC-1 jq predicate against a synthetic provider-model receipt with one serving mini count two, the other zero, and every accounting/header count equal two.",
                "Mutate dual-serving, zero, serving/model/fleet/telemetry-row/transport/plural-header, each top-level/telemetry singular-header missing or mismatch case, laptop, unknown, and instrumentation-boundary facts one at a time.",
                "Mutate the AC-10/TC-13 contract for false issuance, no real POST, synthetic stream, hand-authored receipt, target-verifier bypass, MCP public auth, unquoted or leaked temp config, each argv/stdout/stderr/receipt/artifact exposure flag, curl -H/-d/-u separated/clustered/attached/equals variants, long/positional argv, inline assignment, explicit credential print/logging, and Network Continuity.",
                "Add command and timeout wrappers around each -H/-d/-u bypass, one random-prefix absolute-path curl bypass, a parameter-expansion variant, and a prefixed canonical-lookalike; require rejection without adding those wrapper names to a blacklist.",
                "Use the canonical target containing exactly one names-only presence form and one target-verifier private-stdin form; add only literal credential names and private non-secret stdin/config paths in the second safe candidate, and require both candidates to remain accepted."
              ]
            },
            "end_state": {
              "must_observe": [
                "baseline matching_completion_count === 2 and telemetry.modelRequests === 2 passes jq -e",
                "exactly 16 receipt mutations including 4 distinct singular-header controls are rejected",
                "exactly 54 post-chat and credential contract mutations are rejected",
                "exactly 2 canonical safe credential controls are accepted",
                "all 11 scenarios validate with zero violations and 25 shell verifiers pass bash -n",
                "Git scope contains exactly 2 paths and network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "0 model calls, empty responseHeaderApiBases, or an exactly-one-call constraint",
                "a second serving mini",
                "a count or header mismatch",
                "HOLO_KEY_MCP used for the public route",
                "a secret in argv, stdout, stderr, JSON receipt, or retained artifact",
                "any noncanonical credential expansion, including command/timeout/random-wrapper curl or a parameter variant",
                "a false chat_request_issued value after POST, a hand-authored failure receipt, or a target-verifier bypass",
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
      "description": "Both contracts parse uniquely, every shell verifier passes bash-n, all scenarios validate, positive and post-POST human/JSON commands match, a two-call receipt plus two exact credential forms pass, and four singular-header plus 54 target-verifier/credential mutations including absent canonical forms and command/timeout/random wrappers reject.",
      "maps_to_ac": "AC-1",
      "verify": "python3 -c 'import pathlib,re; p=pathlib.Path(\".spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPEC-REPAIR-S33-PLAT-05-MULTICALL-ACCOUNTING.md\"); s=p.read_text(); m=re.search(r\"<!-- STATIC-VERIFIER v1 -->\\s*```python\\n(.*?)\\n```\",s,re.S); assert m; exec(compile(m.group(1),str(p),\"exec\"),{\"__file__\":str(p)})'"
    }
  ]
}
-->
