# S33-PLAT-05: Prove a deployed chat turn is generated on a Mac mini with no laptop serving dependency

> Status: Backlog
> Assignee: mastra-implementer
> Priority: P0
> Type: FEATURE
> Effort: M · 180 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: S33-PLAT-02, S33-PLAT-03, S33-OPS-01, S33-OPS-02
> Blocks: —

## Outcome

Close the sprint gate hardest step without disrupting any network: a chat turn issued from `inference1` to the deployed Holocron service whose tokens were demonstrably generated on `inference1` or `inference2`, while a read-only capture of the deployed router's effective model configuration proves that every `implementer` backend is one of those two minis and no laptop/local/self-hosted serving endpoint exists. Today the chat path resolves the divergent role through `resolveModel()` to the manifest hardcoded `127.0.0.1:4545` — inside the container that is the container itself — so no chat turn can produce tokens regardless of `/health`. This task supplies the two-node proof and fixes the endpoint-recording surfaces that would otherwise under-report a non-loopback fleet.

**Success state:** the fail-closed AC-1 verifier captures one JSON report, rejects any non-zero verifier exit, and applies an exact `jq -e` oracle. The report proves a nonce-bearing chat from `inference1`, non-empty streamed assistant text, two successful mini reads with exactly one serving mini, a serving count `N >= 1` equal to every model/telemetry/transport/header count, per-call serving-node/header equality, zero cloud/unknown calls, and a read-only effective-router snapshot containing exactly two distinct `implementer` records — one for each allowed mini URL and no duplicate row. It exits non-zero if any invariant is absent or malformed.

## Critical Constraints

**MUST**

- Drive the chat turn through the deployed service own public entrypoint (POST /api/chat-runs over the tailnet), not through an in-process harness.
- Independently observe the completion by reading ~/local-llm/logs/omlx-mini-8003.log on BOTH inference1 and inference2 over SSH — each node driven through its own entrypoint — and record both results including the negative one.
- Issue the public API turn from `inference1` through bounded SSH, and capture the running Holocron router's effective `/etc/litellm/config.yaml` read-only through the exact deployed-host identity `holocron@holocron`; the operator laptop may coordinate the verifier but cannot appear in any serving path.
- Require the effective `model_list` to contain exactly two `implementer` records, both using the divergent Qwen model, with two distinct API bases equal to `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`. Reject a missing, additional, or duplicate record even when its hostname is otherwise allowlisted.
- Capture x-litellm-model-api-base from the fleet response for the turn and record the resolved endpoint in inference telemetry, so the served backend is auditable after the fact.

**NEVER**

- Never assert cross-device behavior from a row on one node. A telemetry row on the holocron host, or a response header read there, is not proof a mini generated the tokens — the mini must independently show the completion in its own log. A fixture-supplied row standing in for the other node is CROSS_NODE_SEEDED and will be rejected.
- Never count a fleet request by matching the literal strings 127.0.0.1:4545 / localhost:4545. That hardcoded check (compat/cells/agent.ts:80) reports zero fleet requests against the host.docker.internal router, which would make a passing test meaningless — and makes Sprint 8's 'zero Anthropic on the default path' gate satisfiable by a system that makes no inference calls at all.
- Never accept an empty or whitespace-only assistant reply as a passing turn.
- Never fall back to the DeepSeek escape path or any cloud provider to make the turn succeed — allowEscape stays false and cloudRequests must be 0.
- Never stop, restart, reconfigure, or write through the router, minis, Holocron deployment, Tailscale, Wi-Fi, network interfaces, or routes. This verifier is read-only apart from the ordinary public chat request and its normal application records.
- Never accept a deployed `implementer` backend whose API-base hostname is anything except the exact `inference1.tail011a51.ts.net` or `inference2.tail011a51.ts.net` allowlist. This rejects laptop names or addresses, `localhost`, `127.0.0.1`, `host.docker.internal`, the Holocron host itself, cloud hosts, and unknown/self-hosted endpoints as serving backends. (`host.docker.internal:4545` remains valid only as the deployed service's router ingress, never as an `implementer` API base.)

**STRICTLY**

- Do not provision, restart, or reconfigure the routers or the minis model servers — that is the devops lane. This task observes them.
- Never claim that a literal laptop disconnect was performed. The no-laptop-dependency claim comes from the independent request origin, the exact effective-backend allowlist, and matching one-serving-mini log/per-call-header/telemetry evidence.
- The chat turn exercises the divergent role (implementer -> Qwen3.6-35B-A3B on the minis). Do NOT extend this task to embed or rerank: embed is proven by S33-PLAT-03 / S33-OPS-05, and rerank is unobtainable.

## Binding Predeploy Repair (Conjunctive, Non-Weakening)

The original two-mini topology, public-request, substantive-response, and Network Continuity requirements remain in force. AC-5 through AC-9 below add the missing predeploy invariants and are conjunctive with AC-1 through AC-4. Where the original text says the prompt nonce is "correlated" to a mini log, it does **not** mean the nonce occurs in that log: only the bounded append window, serving header, and request-scoped run telemetry may support mini attribution, and the receipt must explicitly deny nonce-log binding. Where AC-2 previously described suppressing node reads in memory, AC-7 supersedes only that control mechanism with real bounded SSH/read failures while preserving the fail-closed expected result.

The confirmed public model boundary is `services/platform/src/http/chat-runs.ts`: `createChatRun()` persists the run, `processChatRun()` creates the fleet agent, and `agentBundle.agent.stream(...)` performs the public model call. Compatibility-cell accounting does not envelop this path, and model-bundle creation alone does not count its stream egress. Accounting must instrument every underlying request/run-bound model `doStream` or equivalent transport invocation reached by that public stream, including every multi-step and tool-loop call. Counting the outer `agent.stream` once, counting model-bundle creation, or applying a process-global fetch patch is explicitly insufficient.

## Binding Multicall and Live-Verifier Repair (Conjunctive, Non-Weakening)

The positive serving-node contract is cardinality-aware: exactly one mini may have `matching_completion_count > 0`, the other mini must have count `0`, and the serving count must equal `telemetry.modelRequests`, `telemetry.fleetRequests`, `telemetry.telemetryRows`, `telemetry.underlyingTransportCalls`, and `telemetry.responseHeaderApiBases | length`. That common integer is at least one; every per-call response-header API base equals the serving mini URL; and the accounting boundary is `provider-model`. A valid multi-step/tool-loop turn can therefore produce two or more completion lines on one serving mini. Requiring the serving count to equal exactly one is unsound.

The live verifier must use the public route's `HOLO_KEY_RN` credential and deliver it without secret material in argv, logs, or evidence. Curl config values for the URL and headers must remain quoted so spaces and punctuation survive parsing. In the deployed container, the telemetry/trace CLI is `/app/src/cli/holo.ts`; its command must bootstrap `DATABASE_URL` from `/run/secrets/database_url` inside the container without exposing the value. Once the public POST has been attempted, every subsequent error receipt must truthfully retain `chat_request_issued:true`; only failures before the POST may report `false`.

## Acceptance Criteria

### AC-1 — A deployed chat turn returns real tokens and exactly one mini's own log accounts for every model call

- **GIVEN** The deployed service is healthy, a read-only capture proves the router has exactly two distinct `implementer` records — one per mini — and the request origin is `inference1`
- **WHEN** A chat run carrying a unique nonce is created from `inference1` through the deployed public API and the oMLX log is read directly on each mini
- **THEN** The captured JSON passes an exact fail-closed oracle for chat issuance, inference1 request origin, two successful per-mini results, exactly one serving mini with a positive completion count, the other count zero, serving-count/model/telemetry/transport/header cardinality equality, every per-call header naming that serving mini, provider-model instrumentation, exact deployed topology provenance, exactly two non-duplicate implementer records, a 64-character config hash, zero cloud/unknown calls, and zero network/disconnect mutation claims
- **Verify:** `set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$pos" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == "inference1" and (.assistant_text_length | type == "number" and . >= 10) and (.mini_results | type == "array" and length == 2) and ([.mini_results[].device_id] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].ssh_destination] | sort) == ["inference1","inference2"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .device_id == .reported_tailnet_hostname and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and .command_exit == 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == "number") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == "inference1.tail011a51.ts.net" or $served == "inference2.tail011a51.ts.net") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == ("http://" + $served + ":8003/v1") and .telemetry.responseHeaderApiBase == ("http://" + $served + ":8003/v1") and (.telemetry.responseHeaderApiBases | type == "array") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == ("http://" + $served + ":8003/v1"))) and (.telemetry.modelRequests | (type == "number") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == "provider-model" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == "http://host.docker.internal:4545/v1" and (.effective_topology as $topology | $topology.ssh_destination == "holocron@holocron" and $topology.compose_project == "holocron-router" and $topology.compose_service == "litellm-router" and ($topology.implementer_records | type == "array" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and ($topology.config_sha256 | type == "string" and test("^[0-9a-f]{64}$"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: forbidden backend, stub, empty, static, mock

### AC-2 — The verifier fails closed when real bounded node reads cannot supply evidence

- **GIVEN** both canonical mini logs are readable without mutation
- **WHEN** no-mini-evidence mode performs actual bounded SSH/read attempts against `/dev/null/omlx-mini-8003.log` on both real minis
- **THEN** It exits non-zero with MINI_EVIDENCE_UNAVAILABLE and two non-synthetic, timestamp-ordered, bounded attempt receipts rather than passing on the chat response or header alone
- **Verify:** `set -o pipefail; : "${S33_EXPECTED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; receipt="$(mktemp)"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha "$S33_EXPECTED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --json >"$receipt"; then rm -f "$receipt"; exit 1; fi; jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and .chat_request_issued == false and ([.attempts[].node] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .read_path == "/dev/null/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.canonical_command_sha256 | test("^[0-9a-f]{64}$")) and (.canonical_stdout_sha256 | test("^[0-9a-f]{64}$")) and (.read_command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == "/dev/null/omlx-mini-8003.log" and .read_exit != 0 and .receipt_source == "ssh" and (.started_at | type == "string" and length > 0) and (.finished_at | type == "string" and length > 0) and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == "holocron@holocron"' "$receipt"; status=$?; rm -f "$receipt"; exit $status`
- **Tier:** e2e · **Service:** deployed-holocron-chat + omlx-mini · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: stub, static, mock, missing node evidence

### AC-3 — Fleet-request accounting no longer assumes a loopback address

- **GIVEN** A resolved fleet endpoint whose host is the configured router rather than 127.0.0.1 or localhost
- **WHEN** A real fleet-backed generate runs through the agent cell and telemetry records the call
- **THEN** The fleet-request count is greater than zero and the recorded endpoint is the resolved router base
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`
- **Tier:** integration · **Service:** litellm-fleet-router · **Flow:** UC-INFER-01
- **Scenario:** topology `single-node` · evidence `db_query` · negative control: static, stub, mock

### AC-4 — The deployed router topology proves there is no laptop serving dependency and rejects forbidden backends

- **GIVEN** The verifier can read the running `litellm-router` container's effective config through bounded, read-only SSH to `holocron@holocron`
- **WHEN** It enumerates every `model_name=implementer` `api_base`, validates the exact allowlist, and exercises the forbidden-backend contract control without changing the running config
- **THEN** The live snapshot contains exactly two distinct implementer records, one for each mini API base, while a duplicate or any laptop/local/self/unknown backend in the in-memory control exits non-zero with `LAPTOP_DEPENDENCY_DETECTED` before the public chat request
- **Verify:** `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "LAPTOP_DEPENDENCY_DETECTED" and .chat_request_issued == false and (.control_violations | sort) == ["duplicate_api_base","forbidden_api_base"] and (.effective_implementer_records_before | type == "array" and length == 2) and ([.effective_implementer_records_before[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([.effective_implementer_records_before[].api_base] | unique | length) == 2 and all(.effective_implementer_records_before[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and (.effective_config_sha256_before | type == "string" and test("^[0-9a-f]{64}$")) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null`
- **Tier:** integration · **Service:** deployed-litellm-router-config · **Flow:** UC-INFER-01
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: forbidden backend, laptop endpoint, local endpoint, self-hosted endpoint

### AC-5 — Public chat accounting is complete, request scoped, and fail closed

- **GIVEN** the real public `POST /api/chat-runs` path reaches `agentBundle.agent.stream(...)` in `services/platform/src/http/chat-runs.ts`
- **WHEN** one real Hono/Postgres/fleet turn runs
- **THEN** instrumentation was attached before the stream, is bound to its persisted request ID and run ID, terminalizes after the stream, counts at least one model request, and reconciles every model request exactly once as fleet, cloud, or unknown
- **AND** every underlying request/run-bound model `doStream` or equivalent transport invocation is counted independently, including multi-step/tool-loop invocations; one outer `agent.stream` count is not accounting completeness
- **AND** success requires one common integer `N >= 1` where `modelRequests === fleetRequests === telemetryRows === underlyingTransportCalls === responseHeaderApiBases.length ===` the serving mini's `matching_completion_count`, the other mini count is zero, every `responseHeaderApiBases` entry equals the serving mini URL, `instrumentationBoundary === "provider-model"`, `cloudRequests === 0`, and `unknownRequests === 0`
- **AND** missing instrumentation, a direct provider/model/fetch bypass, `api.openai.com` or any cloud request, an unknown endpoint, or a counter mismatch fails closed rather than defaulting to `cloudRequests=0`
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`
- **Scenario:** topology `single-node` · evidence `transcript` · negative control: real-filesystem public-boundary/cloud/unknown/counter mutations

### AC-6 — Source revision, image digest, and Compose/release-lock identity are mandatory and equal

- **GIVEN** an orchestrator-landed main merge SHA and a deployable schema-v1 release lock
- **WHEN** live proof reads `/health` and the deployed Compose/container identity through bounded read-only SSH to exactly `holocron@holocron`
- **THEN** expected main SHA, release-lock `sourceRevision`, health source revision, and deployed source revision are present and byte-equal
- **AND** release-lock digest, health `imageDigest`, and deployed immutable image digest are present, valid `sha256:<64-hex>`, and byte-equal
- **AND** release-lock `composeSha256`, health Compose hash, and the deployed rendered Compose hash are present, valid 64-hex, and byte-equal
- **AND** regular temporary filesystem copies with each field independently missing or mutated fail before any proof success
- **Verify:** `set -o pipefail; : "${S33_EXPECTED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode live --expected-main-sha "$S33_EXPECTED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --json`
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: real-filesystem sourceRevision/imageDigest/composeSha256 mutations

### AC-7 — No-mini evidence performs real bounded reads on both minis

- **GIVEN** both real minis remain healthy and unchanged
- **WHEN** no-mini-evidence mode first proves each canonical log is readable and then attempts the intentionally invalid `/dev/null/omlx-mini-8003.log` path on each mini
- **THEN** both bounded SSH/read attempts actually execute, the verifier exits nonzero, and the JSON contains node, start/end timestamps, canonical precheck exit, invalid-read exit, and SHA-256 hashes of stdout/stderr for both attempts
- **AND** each receipt binds `inference1 -> inference1 -> inference1.tail011a51.ts.net` or `inference2 -> inference2 -> inference2.tail011a51.ts.net` as logical node -> SSH destination -> independently remote-reported hostname, plus canonical log path, exact bounded SSH options, canonical/read command and output hashes, exits, ordered <=15000ms times, and a recomputed binding hash
- **AND** neither row is skipped, synthetic, replayed, canned, or derived from the other node
- **AND** no chat request, remote mutation, service change, network mutation, or literal disconnect occurs
- **Verify:** `set -o pipefail; : "${S33_EXPECTED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; receipt="$(mktemp)"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha "$S33_EXPECTED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --json >"$receipt"; then rm -f "$receipt"; exit 1; fi; jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and .chat_request_issued == false and ([.attempts[].node] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .read_path == "/dev/null/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.canonical_command_sha256 | test("^[0-9a-f]{64}$")) and (.canonical_stdout_sha256 | test("^[0-9a-f]{64}$")) and (.read_command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == "/dev/null/omlx-mini-8003.log" and .read_exit != 0 and .receipt_source == "ssh" and (.started_at | type == "string" and length > 0) and (.finished_at | type == "string" and length > 0) and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == "holocron@holocron"' "$receipt"; status=$?; rm -f "$receipt"; exit $status`
- **Scenario:** topology `multi-node` · evidence `stdout` · negative control: real SSH invalid-path reads, never skipped/canned

### AC-8 — Request/run-to-mini correlation is honest and ambiguity fails closed

- **GIVEN** the public request has request/run IDs but the oMLX completion line has no nonce field
- **WHEN** proof compares pre/post inode and byte offsets, appended bytes, serving-node header, and request-scoped endpoint telemetry
- **THEN** the report names `bounded_append_window_header_and_run_telemetry`, records `nonceLogBinding=false`, and says the claim is not nonce binding
- **AND** it requires exactly one serving mini with `N >= 1` appended completions, the other mini with zero, and serving-count/model/telemetry/transport/per-call-header agreement
- **AND** each node receipt binds the logical node to its exact SSH destination, independently remote-reported tailnet hostname, canonical log path, exact bounded SSH options, command/output hashes, exit code, ordered bounded timestamps, and receipt-binding hash
- **AND** the only allowed mappings are `inference1 -> inference1 -> inference1.tail011a51.ts.net` and `inference2 -> inference2 -> inference2.tail011a51.ts.net`
- **AND** the two receipts have two distinct SSH destinations and remote hostnames; two reads from one mini relabelled as two nodes fail `DUPLICATE_MINI_IDENTITY`
- **AND** a missing node receipt, inode change, truncation, unreadable range, zero completions, completions on both minis, any cardinality mismatch, missing header, or header/telemetry disagreement fails `AMBIGUOUS_MINI_CORRELATION`
- **Verify:** `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`
- **Scenario:** topology `multi-node` · evidence `transcript` · negative control: real-filesystem correlation-receipt mutations

### AC-9 — True RED lineage and governed predeploy-to-final ordering are exact

- **GIVEN** caller-supplied exact implementation-base, RED, candidate, expected landed-main SHA, release-lock path, and authoritative review/proof artifact paths
- **WHEN** source-predeploy and final-lineage modes apply a strict no-additional-fields schema and independently run Git object/parent/diff/ancestry checks, hash evidence/review artifacts, and recompute the release/proof identity tuple
- **THEN** RED is the first child of that base, changes exactly `services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`, reaches real Hono/Postgres/fleet dependencies, and fails for missing public-chat accounting rather than setup
- **AND** GREEN is its exact descendant, both base and candidate use `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json` under the same toolchain, and the orchestrator-authorized comparison retains raw-output hashes with zero added normalized diagnostics
- **AND** the mandatory dual reviewers `product-manager` plus `mastra-reviewer` approve the exact candidate before the orchestrator lands it; `test-quality-reviewer` may add an oracle-quality lens but cannot substitute for either; packaging and deployment use the resulting main merge SHA; live proof uses that same SHA/digest/Compose tuple; and mandatory final `product-manager` plus `mastra-reviewer` reviews postdate the proof
- **AND** any non-test RED diff, false/setup RED, non-descendant GREEN, unauthorized comparison, reordered event, or unequal identity fails
- **AND** self-reported booleans or receipt SHAs are never trusted without recomputation; mandatory source/final reviewer roles, approved candidate/proof identities, artifact paths, and artifact SHA-256 values are independently hashed and matched
- **Verify:** `set -o pipefail; : "${S33_IMPLEMENTATION_BASE_SHA:?}"; : "${S33_RED_SHA:?}"; : "${S33_CANDIDATE_SHA:?}"; : "${S33_EXPECTED_LANDED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; : "${S33_LINEAGE_RECEIPT:?}"; : "${S33_RED_FAILURE_EVIDENCE:?}"; : "${S33_PROOF_RECEIPT:?}"; : "${S33_SOURCE_PRODUCT_REVIEW:?}"; : "${S33_SOURCE_MASTRA_REVIEW:?}"; : "${S33_FINAL_PRODUCT_REVIEW:?}"; : "${S33_FINAL_MASTRA_REVIEW:?}"; result="$(bash scripts/verify-s33-mini-served-turn.sh --mode final-lineage --implementation-base "$S33_IMPLEMENTATION_BASE_SHA" --red-commit "$S33_RED_SHA" --candidate "$S33_CANDIDATE_SHA" --expected-landed-main-sha "$S33_EXPECTED_LANDED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --receipt "$S33_LINEAGE_RECEIPT" --red-failure-evidence "$S33_RED_FAILURE_EVIDENCE" --proof-receipt "$S33_PROOF_RECEIPT" --source-product-review "$S33_SOURCE_PRODUCT_REVIEW" --source-mastra-review "$S33_SOURCE_MASTRA_REVIEW" --final-product-review "$S33_FINAL_PRODUCT_REVIEW" --final-mastra-review "$S33_FINAL_MASTRA_REVIEW" --json)" && printf '%s\n' "$result" | jq -e --arg base "$S33_IMPLEMENTATION_BASE_SHA" --arg red "$S33_RED_SHA" --arg candidate "$S33_CANDIDATE_SHA" --arg landed "$S33_EXPECTED_LANDED_MAIN_SHA" --arg releaseLock "$S33_RELEASE_LOCK" --arg lineageReceipt "$S33_LINEAGE_RECEIPT" --arg redEvidence "$S33_RED_FAILURE_EVIDENCE" --arg proofReceipt "$S33_PROOF_RECEIPT" --arg sourceProduct "$S33_SOURCE_PRODUCT_REVIEW" --arg sourceMastra "$S33_SOURCE_MASTRA_REVIEW" --arg finalProduct "$S33_FINAL_PRODUCT_REVIEW" --arg finalMastra "$S33_FINAL_MASTRA_REVIEW" '.ok == true and .schema == "s33-plat-05-lineage/v1" and .git.recomputed == true and .git.baseSha == $base and .git.redSha == $red and .git.redParentSha == $base and .git.redDiffPaths == ["services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"] and .git.redRealPublicPathReached == true and .git.redFailureClass == "missing_public_chat_accounting" and .git.redFailureEvidencePath == $redEvidence and .git.redFailureEvidenceRegular == true and .git.redFailureEvidenceSymlink == false and .git.redFailureEvidenceIndependentlyHashed == true and (.git.redFailureEvidenceSha256 | test("^[0-9a-f]{64}$")) and .git.candidateSha == $candidate and .git.candidateDescendsFromRed == true and .git.landedMainSha == $landed and .git.landedMainContainsCandidate == true and .typecheck.command == "pnpm exec tsgo --noEmit -p services/platform/tsconfig.json" and .typecheck.authorizedBy == "orchestrator" and .typecheck.baseSha == $base and .typecheck.candidateSha == $candidate and .typecheck.sameToolchain == true and .typecheck.addedNormalizedDiagnostics == 0 and (.typecheck.baseRawOutputSha256 | test("^[0-9a-f]{64}$")) and (.typecheck.candidateRawOutputSha256 | test("^[0-9a-f]{64}$")) and .release.recomputed == true and .release.lockPath == $releaseLock and .release.lockRegular == true and .release.lockSymlink == false and .release.sourceRevision == $landed and (.release.imageDigest | test("^sha256:[0-9a-f]{64}$")) and (.release.composeSha256 | test("^[0-9a-f]{64}$")) and .proof.recomputed == true and .proof.receiptPath == $proofReceipt and .proof.receiptRegular == true and .proof.receiptSymlink == false and .proof.receiptIndependentlyHashed == true and (.proof.receiptSha256 | test("^[0-9a-f]{64}$")) and .proof.expectedMainSha == $landed and .proof.sourceRevision == .release.sourceRevision and .proof.imageDigest == .release.imageDigest and .proof.composeSha256 == .release.composeSha256 and ([.reviews.source[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{"role":"mastra-reviewer","artifactPath":$sourceMastra},{"role":"product-manager","artifactPath":$sourceProduct}] and ([.reviews.source[].role] | sort) == ["mastra-reviewer","product-manager"] and all(.reviews.source[]; .approved == true and .candidateSha == $candidate and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test("^[0-9a-f]{64}$"))) and ([.reviews.final[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{"role":"mastra-reviewer","artifactPath":$finalMastra},{"role":"product-manager","artifactPath":$finalProduct}] and ([.reviews.final[].role] | sort) == ["mastra-reviewer","product-manager"] and all(.reviews.final[]; .approved == true and .proofSha256 == .proof.receiptSha256 and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test("^[0-9a-f]{64}$")) and .reviewedAt > .proof.finishedAt) and .ordering.sourceReviewsBeforeLanding == true and .ordering.packageDeployBeforeProof == true and .ordering.finalReviewsAfterProof == true and .receipt.path == $lineageReceipt and .receipt.regular == true and .receipt.symlink == false and .receipt.independentlyHashed == true and (.receipt.sha256 | test("^[0-9a-f]{64}$")) and .receipt.strictSchemaValidated == true and .receipt.verifiedAgainstCallerInputs == true'`
- **Scenario:** topology `single-node` · evidence `state` · negative control: real-filesystem lineage and identity mutations

## Test Criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A deployed chat turn issued from inference1 returns assistant text of length >= 10 and reconciles every underlying model call to one serving mini without any laptop endpoint. | AC-1 | `set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$pos" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == "inference1" and (.assistant_text_length | type == "number" and . >= 10) and (.mini_results | type == "array" and length == 2) and ([.mini_results[].device_id] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].ssh_destination] | sort) == ["inference1","inference2"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .device_id == .reported_tailnet_hostname and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and .command_exit == 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == "number") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == "inference1.tail011a51.ts.net" or $served == "inference2.tail011a51.ts.net") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == ("http://" + $served + ":8003/v1") and .telemetry.responseHeaderApiBase == ("http://" + $served + ":8003/v1") and (.telemetry.responseHeaderApiBases | type == "array") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == ("http://" + $served + ":8003/v1"))) and (.telemetry.modelRequests | (type == "number") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == "provider-model" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == "http://host.docker.internal:4545/v1" and (.effective_topology as $topology | $topology.ssh_destination == "holocron@holocron" and $topology.compose_project == "holocron-router" and $topology.compose_service == "litellm-router" and ($topology.implementer_records | type == "array" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and ($topology.config_sha256 | type == "string" and test("^[0-9a-f]{64}$"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |
| TC-2 | Exactly one mini has a positive oMLX completion count, the other has zero, the positive count equals all model/telemetry/transport/header counts, and every header names that same mini. | AC-1 | `set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$pos" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == "inference1" and (.assistant_text_length | type == "number" and . >= 10) and (.mini_results | type == "array" and length == 2) and ([.mini_results[].device_id] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].ssh_destination] | sort) == ["inference1","inference2"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .device_id == .reported_tailnet_hostname and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and .command_exit == 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == "number") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == "inference1.tail011a51.ts.net" or $served == "inference2.tail011a51.ts.net") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == ("http://" + $served + ":8003/v1") and .telemetry.responseHeaderApiBase == ("http://" + $served + ":8003/v1") and (.telemetry.responseHeaderApiBases | type == "array") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == ("http://" + $served + ":8003/v1"))) and (.telemetry.modelRequests | (type == "number") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == "provider-model" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == "http://host.docker.internal:4545/v1" and (.effective_topology as $topology | $topology.ssh_destination == "holocron@holocron" and $topology.compose_project == "holocron-router" and $topology.compose_service == "litellm-router" and ($topology.implementer_records | type == "array" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and ($topology.config_sha256 | type == "string" and test("^[0-9a-f]{64}$"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |
| TC-3 | With node-side evidence unavailable, real bounded reads on both minis produce two ordered non-synthetic receipts and the verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE. | AC-2 | `set -o pipefail; : "${S33_EXPECTED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; receipt="$(mktemp)"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha "$S33_EXPECTED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --json >"$receipt"; then rm -f "$receipt"; exit 1; fi; jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and .chat_request_issued == false and ([.attempts[].node] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .read_path == "/dev/null/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.canonical_command_sha256 | test("^[0-9a-f]{64}$")) and (.canonical_stdout_sha256 | test("^[0-9a-f]{64}$")) and (.read_command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == "/dev/null/omlx-mini-8003.log" and .read_exit != 0 and .receipt_source == "ssh" and (.started_at | type == "string" and length > 0) and (.finished_at | type == "string" and length > 0) and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == "holocron@holocron"' "$receipt"; status=$?; rm -f "$receipt"; exit $status` |
| TC-4 | A real generate against a non-loopback router yields fleetRequests >= 1 and cloudRequests === 0. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-5 | The persisted telemetry endpoint for the turn is the configured router, not the loopback default. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-6 | The live effective topology contains exactly two non-duplicate implementer records, one for each allowed mini, with no laptop/local/self/unknown endpoint. | AC-4 | `set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$pos" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == "inference1" and (.assistant_text_length | type == "number" and . >= 10) and (.mini_results | type == "array" and length == 2) and ([.mini_results[].device_id] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].ssh_destination] | sort) == ["inference1","inference2"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .device_id == .reported_tailnet_hostname and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and .command_exit == 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == "number") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == "inference1.tail011a51.ts.net" or $served == "inference2.tail011a51.ts.net") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == ("http://" + $served + ":8003/v1") and .telemetry.responseHeaderApiBase == ("http://" + $served + ":8003/v1") and (.telemetry.responseHeaderApiBases | type == "array") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == ("http://" + $served + ":8003/v1"))) and (.telemetry.modelRequests | (type == "number") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == "provider-model" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == "http://host.docker.internal:4545/v1" and (.effective_topology as $topology | $topology.ssh_destination == "holocron@holocron" and $topology.compose_project == "holocron-router" and $topology.compose_service == "litellm-router" and ($topology.implementer_records | type == "array" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and ($topology.config_sha256 | type == "string" and test("^[0-9a-f]{64}$"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |
| TC-7 | The in-memory duplicate-plus-forbidden control exits non-zero with LAPTOP_DEPENDENCY_DETECTED before issuing a chat request. | AC-4 | `set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\n' "$neg" | jq -e '.ok == false and .error_code == "LAPTOP_DEPENDENCY_DETECTED" and .chat_request_issued == false and (.control_violations | sort) == ["duplicate_api_base","forbidden_api_base"] and (.effective_implementer_records_before | type == "array" and length == 2) and ([.effective_implementer_records_before[].api_base] | sort) == ["http://inference1.tail011a51.ts.net:8003/v1","http://inference2.tail011a51.ts.net:8003/v1"] and ([.effective_implementer_records_before[].api_base] | unique | length) == 2 and all(.effective_implementer_records_before[]; .model == "openai/Qwen3.6-35B-A3B-MLX-8bit") and (.effective_config_sha256_before | type == "string" and test("^[0-9a-f]{64}$")) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null` |
| TC-8 | A real public Hono/Postgres/fleet turn has complete request/run-bound accounting, and temporary source/receipt mutations for wrapper removal, direct OpenAI/cloud, unknown transport, and counter mismatch all fail. | AC-5 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-9 | Temporary regular-file release-lock/receipt mutations independently change sourceRevision, imageDigest, and composeSha256; each mismatch fails before proof success. | AC-6 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-10 | No-mini mode performs real bounded SSH/read attempts against the intentionally invalid path on both healthy minis, binds each logical node to its SSH destination and independently reported tailnet hostname, and rejects two reads from one mini relabelled as two nodes. | AC-7 | `set -o pipefail; : "${S33_EXPECTED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; receipt="$(mktemp)"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha "$S33_EXPECTED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --json >"$receipt"; then rm -f "$receipt"; exit 1; fi; jq -e '.ok == false and .error_code == "MINI_EVIDENCE_UNAVAILABLE" and .chat_request_issued == false and ([.attempts[].node] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | sort) == ["inference1","inference2"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == ["inference1.tail011a51.ts.net","inference2.tail011a51.ts.net"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == "inference1" and .ssh_destination == "inference1" and .reported_tailnet_hostname == "inference1.tail011a51.ts.net") or (.node == "inference2" and .ssh_destination == "inference2" and .reported_tailnet_hostname == "inference2.tail011a51.ts.net")) and .hostname_source == "remote-command" and .canonical_log_path == "~/local-llm/logs/omlx-mini-8003.log" and .read_path == "/dev/null/omlx-mini-8003.log" and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"] and (.canonical_command_sha256 | test("^[0-9a-f]{64}$")) and (.canonical_stdout_sha256 | test("^[0-9a-f]{64}$")) and (.read_command_sha256 | test("^[0-9a-f]{64}$")) and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test("^[0-9a-f]{64}$")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == "/dev/null/omlx-mini-8003.log" and .read_exit != 0 and .receipt_source == "ssh" and (.started_at | type == "string" and length > 0) and (.finished_at | type == "string" and length > 0) and (.started_epoch_ms | type == "number") and (.finished_epoch_ms | type == "number") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test("^[0-9a-f]{64}$")) and (.stderr_sha256 | test("^[0-9a-f]{64}$")) and .bounded_ssh_options == ["BatchMode=yes","ConnectTimeout=10","ServerAliveCountMax=2","ServerAliveInterval=5"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == "holocron@holocron"' "$receipt"; status=$?; rm -f "$receipt"; exit $status` |
| TC-11 | Positive correlation explicitly denies nonce binding; missing/discontinuous/multiple/disagreeing temporary receipt mutations fail `AMBIGUOUS_MINI_CORRELATION`, and a same-mini relabel mutation fails `DUPLICATE_MINI_IDENTITY`. | AC-8 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` |
| TC-12 | Static Git/source verification plus temporary lineage-receipt mutations prove test-only RED, exact ancestry, authorized platform typecheck comparison, source-review-before-land, same-identity deploy/proof, and final-review-after-proof. | AC-9 | `set -o pipefail; : "${S33_IMPLEMENTATION_BASE_SHA:?}"; : "${S33_RED_SHA:?}"; : "${S33_CANDIDATE_SHA:?}"; : "${S33_EXPECTED_LANDED_MAIN_SHA:?}"; : "${S33_RELEASE_LOCK:?}"; : "${S33_LINEAGE_RECEIPT:?}"; : "${S33_RED_FAILURE_EVIDENCE:?}"; : "${S33_PROOF_RECEIPT:?}"; : "${S33_SOURCE_PRODUCT_REVIEW:?}"; : "${S33_SOURCE_MASTRA_REVIEW:?}"; : "${S33_FINAL_PRODUCT_REVIEW:?}"; : "${S33_FINAL_MASTRA_REVIEW:?}"; result="$(bash scripts/verify-s33-mini-served-turn.sh --mode final-lineage --implementation-base "$S33_IMPLEMENTATION_BASE_SHA" --red-commit "$S33_RED_SHA" --candidate "$S33_CANDIDATE_SHA" --expected-landed-main-sha "$S33_EXPECTED_LANDED_MAIN_SHA" --release-lock "$S33_RELEASE_LOCK" --receipt "$S33_LINEAGE_RECEIPT" --red-failure-evidence "$S33_RED_FAILURE_EVIDENCE" --proof-receipt "$S33_PROOF_RECEIPT" --source-product-review "$S33_SOURCE_PRODUCT_REVIEW" --source-mastra-review "$S33_SOURCE_MASTRA_REVIEW" --final-product-review "$S33_FINAL_PRODUCT_REVIEW" --final-mastra-review "$S33_FINAL_MASTRA_REVIEW" --json)" && printf '%s\n' "$result" | jq -e --arg base "$S33_IMPLEMENTATION_BASE_SHA" --arg red "$S33_RED_SHA" --arg candidate "$S33_CANDIDATE_SHA" --arg landed "$S33_EXPECTED_LANDED_MAIN_SHA" --arg releaseLock "$S33_RELEASE_LOCK" --arg lineageReceipt "$S33_LINEAGE_RECEIPT" --arg redEvidence "$S33_RED_FAILURE_EVIDENCE" --arg proofReceipt "$S33_PROOF_RECEIPT" --arg sourceProduct "$S33_SOURCE_PRODUCT_REVIEW" --arg sourceMastra "$S33_SOURCE_MASTRA_REVIEW" --arg finalProduct "$S33_FINAL_PRODUCT_REVIEW" --arg finalMastra "$S33_FINAL_MASTRA_REVIEW" '.ok == true and .schema == "s33-plat-05-lineage/v1" and .git.recomputed == true and .git.baseSha == $base and .git.redSha == $red and .git.redParentSha == $base and .git.redDiffPaths == ["services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"] and .git.redRealPublicPathReached == true and .git.redFailureClass == "missing_public_chat_accounting" and .git.redFailureEvidencePath == $redEvidence and .git.redFailureEvidenceRegular == true and .git.redFailureEvidenceSymlink == false and .git.redFailureEvidenceIndependentlyHashed == true and (.git.redFailureEvidenceSha256 | test("^[0-9a-f]{64}$")) and .git.candidateSha == $candidate and .git.candidateDescendsFromRed == true and .git.landedMainSha == $landed and .git.landedMainContainsCandidate == true and .typecheck.command == "pnpm exec tsgo --noEmit -p services/platform/tsconfig.json" and .typecheck.authorizedBy == "orchestrator" and .typecheck.baseSha == $base and .typecheck.candidateSha == $candidate and .typecheck.sameToolchain == true and .typecheck.addedNormalizedDiagnostics == 0 and (.typecheck.baseRawOutputSha256 | test("^[0-9a-f]{64}$")) and (.typecheck.candidateRawOutputSha256 | test("^[0-9a-f]{64}$")) and .release.recomputed == true and .release.lockPath == $releaseLock and .release.lockRegular == true and .release.lockSymlink == false and .release.sourceRevision == $landed and (.release.imageDigest | test("^sha256:[0-9a-f]{64}$")) and (.release.composeSha256 | test("^[0-9a-f]{64}$")) and .proof.recomputed == true and .proof.receiptPath == $proofReceipt and .proof.receiptRegular == true and .proof.receiptSymlink == false and .proof.receiptIndependentlyHashed == true and (.proof.receiptSha256 | test("^[0-9a-f]{64}$")) and .proof.expectedMainSha == $landed and .proof.sourceRevision == .release.sourceRevision and .proof.imageDigest == .release.imageDigest and .proof.composeSha256 == .release.composeSha256 and ([.reviews.source[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{"role":"mastra-reviewer","artifactPath":$sourceMastra},{"role":"product-manager","artifactPath":$sourceProduct}] and ([.reviews.source[].role] | sort) == ["mastra-reviewer","product-manager"] and all(.reviews.source[]; .approved == true and .candidateSha == $candidate and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test("^[0-9a-f]{64}$"))) and ([.reviews.final[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{"role":"mastra-reviewer","artifactPath":$finalMastra},{"role":"product-manager","artifactPath":$finalProduct}] and ([.reviews.final[].role] | sort) == ["mastra-reviewer","product-manager"] and all(.reviews.final[]; .approved == true and .proofSha256 == .proof.receiptSha256 and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test("^[0-9a-f]{64}$")) and .reviewedAt > .proof.finishedAt) and .ordering.sourceReviewsBeforeLanding == true and .ordering.packageDeployBeforeProof == true and .ordering.finalReviewsAfterProof == true and .receipt.path == $lineageReceipt and .receipt.regular == true and .receipt.symlink == false and .receipt.independentlyHashed == true and (.receipt.sha256 | test("^[0-9a-f]{64}$")) and .receipt.strictSchemaValidated == true and .receipt.verifiedAgainstCallerInputs == true'` |

## Fixtures

**`nonce_chat_turn`** — One chat run created through the deployed service real public API, carrying a unique nonce so the completion can be correlated on the mini side. _(seed: public_api)_

- POST https://holocron.tail011a51.ts.net:44111/api/chat-runs with Authorization Bearer HOLO_KEY_RN, supplied over SSH stdin and rendered as quoted curl-config URL/header values without credential argv/log/evidence exposure
- body: requestId s33-<uuid>, msg 'S33 nonce <uuid>: reply with one short sentence.'
- captured: run id, conversation id, request start timestamp in ISO-8601, nonce

**`mini_omlx_logs`** — The live oMLX server logs on the two devices inference1 and inference2 — the independent cross-device evidence surface confirmed present by the devops lane. Each device is read through its own SSH entrypoint; neither device's state is ever read from the other. _(seed: cli)_

- second device inference1: ~/local-llm/logs/omlx-mini-8003.log confirmed present
- second device inference2: ~/local-llm/logs/omlx-mini-8003.log confirmed present
- device_id for each mini is its tailnet hostname: inference1.tail011a51.ts.net and inference2.tail011a51.ts.net
- device_id of the deployed holocron host is holocron.tail011a51.ts.net and is NOT a valid serving device
- line form: '<timestamp> - omlx.server - INFO - Chat completion: model=Qwen3.6-35B-A3B-MLX-8bit, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'
- both nodes reachable by SSH alias inference1 and inference2 with key auth
- every read receipt binds logical node, exact SSH destination, independently executed remote hostname output, canonical log path, exact bounded SSH options, command/output hashes, exit code, ordered bounded timestamps, and a recomputed receipt-binding hash
- positive and no-mini proof require two distinct SSH destinations and two distinct remote-reported tailnet hostnames; relabelling two reads from one mini is `DUPLICATE_MINI_IDENTITY`

**`deployed_router_topology`** — One read-only snapshot of the running Holocron LiteLLM router's effective configuration, plus an independent request origin on `inference1`. _(seed: cli)_

- bounded SSH destination for the deployed host is exactly `holocron@holocron`; bounded mini aliases remain exactly `inference1` and `inference2`
- the verifier identifies exactly one running container with Compose project/service labels `holocron-router`/`litellm-router`, then reads `/etc/litellm/config.yaml` without modifying it
- there are exactly two `model_name: implementer` records; both have model `openai/Qwen3.6-35B-A3B-MLX-8bit`
- the two records have distinct `api_base` values exactly `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`; duplicates fail closed
- the public chat request is executed from `inference1` with `HOLO_KEY_RN`; auth is delivered only over SSH stdin, URL/header curl-config values remain quoted, and credentials are never placed in argv, environment receipts, logs, or evidence
- deployed telemetry/trace reads execute `bun /app/src/cli/holo.ts ...` inside the Mastra container after privately bootstrapping `DATABASE_URL` from `/run/secrets/database_url`; neither secret value appears in argv, logs, receipts, or evidence
- once the public POST is attempted, every later error receipt keeps `chat_request_issued:true`; only pre-POST errors may report `false`
- no service, router config, Tailscale state, Wi-Fi, interface, route, or network setting is stopped, restarted, toggled, or rewritten

**`deployed_release_identity`** — A regular, non-symlink schema-v1 release lock plus read-only `/health` and deployed Compose/container identity. _(seed: operator)_

- required landed-main source revision is exactly 40 lowercase hex
- required immutable image digest is exactly `sha256:<64 lowercase hex>`
- required Compose hash is exactly 64 lowercase hex
- every value is present and equal across expected main, release lock, health, and deployed identity
- mutation controls write only regular temporary copies and independently remove/change every field

**`governed_lineage`** — Exact base, RED, GREEN/candidate, landed-main, package/deploy, proof, and review receipts. _(seed: operator)_

- RED parent is the authorized base and RED diff is exactly the new integration test
- RED transcript proves the real public path was reached and the expected missing-accounting assertion failed
- platform typecheck command is exactly `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json`; base/candidate comparison is orchestrator-authorized and retains SHA-256 raw-output hashes
- required source and final dual reviews are `product-manager` plus `mastra-reviewer`; `test-quality-reviewer` is an additional focused oracle lens, not a substitute
- event order is source dual review, orchestrator landing, package/deploy of the resulting main SHA, proof at that exact immutable tuple, then final dual review
- the lineage receipt uses schema `s33-plat-05-lineage/v1`; every object rejects missing and additional fields
- caller supplies the exact base, RED, candidate, expected landed-main SHA, release-lock path, proof artifact path, and mandatory review artifact paths
- the verifier uses Git object/parent/diff/ancestry commands and hashes regular non-symlink evidence/review artifacts itself; receipt booleans and claimed hashes are never authoritative

## Reading List

- `services/platform/src/compat/cells/agent.ts` (58-110) — withCloudRequestTracking — line 80 counts fleet requests by matching the literal strings 127.0.0.1:4545 / localhost:4545, reporting zero against the host.docker.internal router. Must derive from the resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (480-500) — The process.env.FLEET_URL ?? 'http://127.0.0.1:4545/v1' endpoint default used when recording a call — must record the actually-resolved endpoint.
- `services/platform/src/inference/telemetry.ts` (1090-1110) — Second configuredEndpoint loopback default on the same pattern.
- `services/platform/src/http/chat-runs.ts` — Confirmed public Hono chat boundary: `createChatRun()` persists the run, `processChatRun()` creates the fleet agent, and `agentBundle.agent.stream(...)` performs the model call. Request-scoped accounting must attach at this actual boundary.
- `services/platform/deploy/compose/router.compose.yaml` (42-76) — Committed router topology shape to compare with the running container's effective config; it is read-only in this task.
- `.spec/prds/mk6-migration/tasks/sprint-33-fleet-routing-and-deployed-service-restoration/SPRINT.md` (66-96) — The human testing gate steps 4 and 5 this verifier must make reproducible.

## Guardrails

**WRITE-ALLOWED**

- scripts/verify-s33-mini-served-turn.sh (NEW)
- services/platform/src/inference/telemetry.ts (MODIFY — endpoint recording only)
- services/platform/src/compat/cells/agent.ts (MODIFY — fleet-request accounting only; unowned by any other S33 lane, and its hardcoded loopback match would otherwise invalidate AC-3)
- services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts (NEW)
- services/platform/src/http/chat-runs.ts (MODIFY — only at the confirmed public `agent.stream` boundary for request/run-scoped accounting)

**WRITE-PROHIBITED**

- services/platform/src/mcp/** - mcp lane
- services/platform/deploy/** - devops lane
- scripts/deploy* - devops lane
- router / oMLX configuration on inference1, inference2 and the holocron host - devops lane; observe only, never reconfigure
- services/platform/deploy/compose/router.compose.yaml - read-only topology reference; do not edit it in this task
- Tailscale, Wi-Fi, interfaces, routes, DNS, and all host/container network configuration - network continuity is non-negotiable

## Design

**References**

- services/platform/src/compat/cells/agent.ts:80
- services/platform/src/inference/telemetry.ts:488
- services/platform/src/inference/telemetry.ts:1097

**Interaction notes**

- Capture the request-window start BEFORE issuing the turn so the log scan is bounded and non-retroactive — otherwise an unrelated earlier completion could be miscredited. Keep the window tight enough that both minis cannot match.
- Run the public request from `inference1` and capture `request_origin=inference1`. The coordinator's continued connectivity is not serving-path evidence; no-laptop dependency is proven by the exact effective backend allowlist plus the serving mini's own log.
- Through bounded `ssh holocron@holocron`, identify the single running container labeled `com.docker.compose.project=holocron-router` and `com.docker.compose.service=litellm-router`, read `/etc/litellm/config.yaml`, and persist its SHA-256 plus parsed implementer records. Do not accept the committed file alone as proof of deployed effective state.
- Validate every implementer `api_base` by exact parsed URL, not substring. Require record count `=== 2`, distinct-API-base count `=== 2`, and the sorted list to equal both mini URLs. Reject duplicates and any additional/missing/malformed endpoint, including `localhost`, `127.0.0.1`, `host.docker.internal`, Holocron, cloud, laptop, raw-IP, and unknown hosts.
- Query BOTH minis every run and record both results, including the zero-count one. A serving mini may append `N >= 1` completion lines for a multi-call turn; the other mini must append zero. This makes the exactly-one-serving-mini claim checkable without imposing a false exactly-one-call constraint.
- On each SSH connection, independently execute the remote hostname read and bind it with the logical node, SSH destination, canonical log path, exact SSH options, command/output hashes, exit code, ordered <=15-second time interval, and receipt hash. Reject duplicate SSH destinations or remote-reported hostnames before correlation.
- Correlate primarily on the bounded window plus the token/prompt counts in the omlx line, cross-checked against x-litellm-model-api-base. State plainly in the report which correlation strength was achieved rather than implying nonce-level matching the log format does not provide.
- The fleet-request counter should compare against the resolved endpoint host:port (ResolvedModel.endpoint, available at the call site) — not a hardcoded list.
- Mini attribution must state `nonceLogBinding=false`; append-window plus header/telemetry agreement is not nonce binding.
- Public-path accounting must reject a direct provider/model/fetch bypass through static reachability checks and real-filesystem mutation controls. A process-global `globalThis.fetch` patch is not sufficient request-scoped proof.
- The public boundary instruments every underlying request/run-bound model `doStream` or equivalent transport call, including each multi-step/tool-loop model invocation. Counting only the outer `agent.stream` call once is a failing mutation.
- The deployed telemetry and trace reads execute `bun /app/src/cli/holo.ts ...` inside the Mastra container after privately bootstrapping `DATABASE_URL` from `/run/secrets/database_url`; neither secret value may enter argv, logs, or evidence.
- Once the public POST is attempted, every later failure receipt preserves `chat_request_issued:true`; only pre-POST topology/auth/identity failures may emit `chat_request_issued:false`.

**Pattern** — Two-node attestation plus deployed-topology allowlisting: each mini is read through its own entrypoint, the request originates independently on inference1, the effective router config is read from the running Holocron container, and the claim is the intersection. Absence of any half is a hard failure, not a downgrade.

_Source:_ `services/platform/src/compat/cells/agent.ts:58-95 (network-assertion shape to generalize)`

**Anti-pattern** — Single-node inference about a cross-device fact, or a literal network disconnect used as a substitute for deployed routing proof. A telemetry row — or a response header — read on the Holocron host proves what that host believes, not which machine ran the model. Equally: a fleet-request counter keyed to hardcoded loopback strings reports 0 against a correctly-configured fleet, so a test asserting 'no cloud calls happened' would pass even if no call happened at all.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| lint | `pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/inference/telemetry.ts services/platform/src/compat/cells/agent.ts services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| platform typecheck | `pnpm exec tsgo --noEmit -p services/platform/tsconfig.json` | Exit 0; any base-vs-candidate comparison must be explicitly orchestrator-authorized, exact-SHA/toolchain matched, raw-output hashed, and show zero added normalized diagnostics |
| unit | `pnpm test:unit` | Exit 0 |
| integration | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts` | Exit 0 |
| two-node-e2e + no-laptop topology | Run AC-1's exact fail-closed capture + `jq -e` command | Exit 0 only when every positive JSON invariant passes, including exactly two non-duplicate implementer records |
| two-node negative | Run TC-3's exact fail-closed command | Exit 0 only after the underlying verifier exits non-zero with MINI_EVIDENCE_UNAVAILABLE and both attempted nodes are asserted |
| forbidden-backend negative | Run TC-7's exact fail-closed command | Exit 0 only after the underlying verifier exits non-zero with LAPTOP_DEPENDENCY_DETECTED before chat and the live config hash is unchanged |

## Agent Assignment

**mastra-implementer** — Ties the fleet resolution work to the sprint hardest gate step. Touches src/inference/telemetry.ts endpoint recording and the fleet-request counter in src/compat/cells/agent.ts (both hardcode loopback today and would silently under-report a non-loopback fleet), plus a two-node verifier script. Requires a real chat turn from inference1 against the deployed service, real observation on both minis, and a read-only capture of the deployed router's effective backend topology.

## Coding Standards

- No z.any(); the verifier JSON output is schema-validated.
- Never print HOLO_KEY_RN, FLEET_KEY, DATABASE_URL, or any SSH credential into argv, stdout, logs, receipts, or evidence — node identities and endpoint hosts only.
- Bounded SSH reads with explicit timeouts; a hung log read must fail the verifier, not stall it.
- Every deployed-host SSH invocation uses exact destination `holocron@holocron` with `BatchMode=yes`, `ConnectTimeout=10`, `ServerAliveInterval=5`, and `ServerAliveCountMax=2`; every mini SSH invocation uses the same bounds with stable aliases `inference1`/`inference2`.
- The forbidden-backend negative control operates on an in-memory copy of the freshly read effective config, appends one duplicate allowlisted row plus one forbidden endpoint, reports both violation classes, proves `LAPTOP_DEPENDENCY_DETECTED`, and exits before the chat call. It never edits or replaces the live config.
- No mocked fetch, no recorded fixtures, and no simulated mini in any test that claims a mini served a completion.
- A true RED commit changes only `services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts`, is the exact first child of the authorized base, reaches real Hono/Postgres/fleet dependencies, and fails for missing public-path accounting. GREEN must descend from RED.
- Required source predeploy review by `product-manager` and `mastra-reviewer` precedes orchestrator landing; `test-quality-reviewer` may add an oracle-quality review but cannot replace either required reviewer. Packaging/deployment then uses the resulting main merge SHA; live proof uses that same SHA/digest/Compose tuple; required final `product-manager` and `mastra-reviewer` review follows proof.
- Lineage verification rejects unknown/missing schema fields and independently executes `git cat-file -e <sha>^{commit}`, `git rev-parse <red>^`, `git diff-tree --no-commit-id --name-only -r <red>`, and `git merge-base --is-ancestor` checks against caller-supplied identities. It independently SHA-256 hashes real RED/typecheck/review/proof artifacts, re-reads the regular non-symlink release lock, and recomputes the sourceRevision/imageDigest/composeSha256 tuple. Self-reported receipt booleans and hashes are non-authoritative.

## Boundary Contracts

- MINI-SIDE OBSERVABLE (supplied and live-verified by s33-devops): log file ~/local-llm/logs/omlx-mini-8003.log present on BOTH inference1 and inference2, appending one line per served completion in the form '<timestamp> - omlx.server - INFO - Chat completion: model=<model>, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'. devops confirmed causation by matching a deliberately bad request to a 404 WARNING line at the same timestamp.
- HOLOCRON-SIDE CORROBORATION: LiteLLM response headers x-litellm-model-api-base (e.g. http://inference1.tail011a51.ts.net:8003/v1), x-litellm-model-name, x-litellm-model-group. Useful for correlation but NOT sufficient alone — it is the holocron host asserting a fact about another node.
- DEPLOYED TOPOLOGY PROOF: exact `ssh holocron@holocron` read of the one running `holocron-router`/`litellm-router` container's `/etc/litellm/config.yaml`; parsed `implementer` records must have count exactly two, model-exact values, and two distinct API bases equal to both mini URLs. A duplicate row fails closed. This proves the deployed router has no laptop/local/self/unknown serving path without mutating network state.
- NETWORK CONTINUITY: the verifier may make bounded public HTTP requests and read-only SSH/Docker reads only. It must never stop/restart/reconfigure a service or toggle Tailscale, Wi-Fi, interfaces, routes, or DNS, and its result must state `network_mutation_performed=false` and `literal_disconnect_claimed=false`.
- PUBLIC CHAT ACCOUNTING: request-scoped instrumentation wraps the actual `agentBundle.agent.stream(...)` call in `services/platform/src/http/chat-runs.ts`, binds request/run IDs and resolved endpoint, counts at least one model egress, reconciles fleet/cloud/unknown totals, and fails on missing, unknown, cloud/OpenAI, or bypassed egress.
- MODEL INVOCATION CARDINALITY: accounting attaches to every underlying request/run-bound `doStream` or equivalent transport invocation, including multi-step/tool-loop calls; an outer `agent.stream` count of one is not a transport ledger. Exactly one serving mini has count `N >= 1`, the other count is zero, and `N` equals model, fleet, durable-telemetry-row, underlying-transport-call, and per-call-header cardinalities; every per-call header names that serving mini.
- LIVE VERIFIER EXECUTION: public API auth is `HOLO_KEY_RN`; URL/header values remain quoted in curl config while credentials stay absent from argv/logs/evidence; in-container telemetry commands use `/app/src/cli/holo.ts` and privately bootstrap `DATABASE_URL` from `/run/secrets/database_url`; any error after POST issuance reports `chat_request_issued:true`.
- CORRELATION HONESTY: the oMLX completion line has no nonce. Proof is bounded append-window/header/request-telemetry correlation only, explicitly not nonce binding, and any ambiguity fails closed.
- MINI IDENTITY BINDING: each positive/negative receipt independently binds node -> SSH destination -> remote-reported tailnet hostname plus command/output/exit/time/log-path/options hashes. Duplicate destinations/hostnames fail even if rows are relabelled.
- IMMUTABLE DEPLOYMENT IDENTITY: expected main, release-lock, health, and deployed Compose/container source revision, image digest, and Compose hash are all mandatory and equal.
- LINEAGE AUTHORITY: strict receipt schema is only an input manifest. Git ancestry/diff, evidence and reviewer artifact hashes, reviewer identity/approval binding, and release/proof tuple are independently recomputed from caller-supplied identities and regular files.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S33-PLAT-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "nonce_chat_turn": {
      "description": "One chat run created through the deployed service real public API, carrying a unique nonce so the completion can be correlated on the mini side.",
      "seed_method": "public_api",
      "records": [
        "POST https://holocron.tail011a51.ts.net:44111/api/chat-runs with Authorization Bearer HOLO_KEY_RN; supply auth over SSH stdin and render quoted curl-config URL/header values without credential argv/log/evidence exposure",
        "body: requestId s33-<uuid>, msg 'S33 nonce <uuid>: reply with one short sentence.'",
        "captured: run id, conversation id, request start timestamp in ISO-8601, nonce"
      ]
    },
    "mini_omlx_logs": {
      "description": "The live oMLX server logs on the two devices inference1 and inference2 \u2014 the independent cross-device evidence surface confirmed present by the devops lane. Each device is read through its own SSH entrypoint; neither device's state is ever read from the other.",
      "seed_method": "cli",
      "records": [
        "second device inference1: ~/local-llm/logs/omlx-mini-8003.log confirmed present",
        "second device inference2: ~/local-llm/logs/omlx-mini-8003.log confirmed present",
        "device_id for each mini is its tailnet hostname: inference1.tail011a51.ts.net and inference2.tail011a51.ts.net",
        "device_id of the deployed holocron host is holocron.tail011a51.ts.net and is NOT a valid serving device",
        "line form: '<timestamp> - omlx.server - INFO - Chat completion: model=Qwen3.6-35B-A3B-MLX-8bit, <n> tokens in <s>s (<rate> tok/s), prompt: <n>, finish_reason=<r>'",
        "both nodes reachable by SSH alias inference1 and inference2 with key auth",
        "each read independently binds node to exact SSH destination, remote-reported tailnet hostname, canonical log path, exact bounded options, command/output hashes, exit, ordered bounded time, and receipt hash",
        "SSH destinations and remote-reported tailnet hostnames each have unique count exactly 2; same-mini relabel fails DUPLICATE_MINI_IDENTITY"
      ]
    },
    "deployed_router_topology": {
      "description": "A read-only snapshot of the running Holocron LiteLLM router effective configuration, combined with a public API request executed from inference1, proves every implementer serving endpoint is one of the two minis without any network mutation.",
      "seed_method": "cli",
      "records": [
        "deployed host SSH destination is exactly holocron@holocron; mini aliases are inference1 and inference2",
        "one running container has Compose project/service labels holocron-router/litellm-router and /etc/litellm/config.yaml is read without modification",
        "exactly two implementer records exist and both name openai/Qwen3.6-35B-A3B-MLX-8bit",
        "the two implementer api_base values are distinct and equal http://inference1.tail011a51.ts.net:8003/v1 plus http://inference2.tail011a51.ts.net:8003/v1; duplicate rows fail closed",
        "the public chat request is executed from inference1 with HOLO_KEY_RN delivered over SSH stdin; quoted curl-config URL/header values preserve spaces and punctuation while credentials remain absent from argv, environment receipts, logs, and evidence",
        "deployed telemetry and trace reads run bun /app/src/cli/holo.ts inside the Mastra container after privately bootstrapping DATABASE_URL from /run/secrets/database_url; secret values remain absent from argv, logs, receipts, and evidence",
        "after the public POST is attempted, every later failure receipt retains chat_request_issued=true; only pre-POST failures may report false",
        "network_mutation_performed=false and literal_disconnect_claimed=false"
      ]
    },
    "deployed_release_identity": {
      "description": "A regular non-symlink schema-v1 release lock plus read-only health and deployed Compose/container identity.",
      "seed_method": "cli",
      "records": [
        "expected main SHA, release-lock sourceRevision, health source revision, and deployed source revision are mandatory and byte-equal",
        "release-lock digest, health imageDigest, and deployed immutable image digest are mandatory valid sha256 digests and byte-equal",
        "release-lock composeSha256, health Compose hash, and deployed rendered Compose hash are mandatory 64-hex values and byte-equal",
        "mutation controls use regular temporary filesystem copies for each required identity field"
      ]
    },
    "governed_lineage": {
      "description": "Exact base, RED, GREEN candidate, source reviews, landed main, package/deploy, proof, and final review receipts.",
      "seed_method": "cli",
      "records": [
        "RED is the first child of the authorized base and changes exactly services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
        "RED reached real Hono, Postgres, and fleet dependencies and failed for missing public-chat accounting rather than setup",
        "platform typecheck is exactly pnpm exec tsgo --noEmit -p services/platform/tsconfig.json and the exact-SHA base/candidate comparison is orchestrator-authorized with hashed raw outputs",
        "mandatory product-manager and mastra-reviewer source reviews precede orchestrator landing; package/deploy/proof share the landed main immutable tuple; mandatory final reviews follow proof",
        "test-quality-reviewer may provide an additional oracle-quality review but cannot substitute for either mandatory reviewer",
        "schema s33-plat-05-lineage/v1 rejects unknown or missing fields and binds caller-supplied base, RED, candidate, expected landed main, release lock, proof, and review paths",
        "Git object, parent, diff, and ancestry checks plus evidence/review hashes and release/proof identity are independently recomputed; self-reported receipt booleans and hashes are non-authoritative"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN the live effective router config contains exactly two distinct mini implementer records and the request origin is inference1 WHEN a nonce-carrying chat run is created through the deployed public API and the oMLX log is read on each mini THEN one captured JSON report proves exactly one serving mini has count N at least one, the other count is zero, N equals model, fleet, durable telemetry row, underlying transport call, and per-call header cardinalities, every header names the serving mini, provider-model instrumentation is complete, and all prior topology, zero-cloud, zero-unknown, and zero-mutation invariants hold.",
      "verify": "set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$pos\" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == \"inference1\" and (.assistant_text_length | type == \"number\" and . >= 10) and (.mini_results | type == \"array\" and length == 2) and ([.mini_results[].device_id] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .device_id == .reported_tailnet_hostname and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and .command_exit == 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == \"number\") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == \"inference1.tail011a51.ts.net\" or $served == \"inference2.tail011a51.ts.net\") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == (\"http://\" + $served + \":8003/v1\") and .telemetry.responseHeaderApiBase == (\"http://\" + $served + \":8003/v1\") and (.telemetry.responseHeaderApiBases | type == \"array\") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == (\"http://\" + $served + \":8003/v1\"))) and (.telemetry.modelRequests | (type == \"number\") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == \"provider-model\" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == \"http://host.docker.internal:4545/v1\" and (.effective_topology as $topology | $topology.ssh_destination == \"holocron@holocron\" and $topology.compose_project == \"holocron-router\" and $topology.compose_service == \"litellm-router\" and ($topology.implementer_records | type == \"array\" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and ($topology.config_sha256 | type == \"string\" and test(\"^[0-9a-f]{64}$\"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null",
      "scenario": {
        "id": "S33-PLAT-05/AC-1",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-chat + omlx-mini",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "forbidden_backend",
            "stub",
            "empty",
            "static",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "nonce_chat_turn",
            "action": {
              "actor": "operator coordinating bounded reads while inference1 issues the public request, holocron@holocron exposes the effective router config read-only, and inference1/inference2 each expose their own oMLX log",
              "steps": [
                "Use bounded SSH to holocron@holocron to identify exactly one running holocron-router/litellm-router container, read /etc/litellm/config.yaml without modification, and require exactly two implementer records with two distinct api_base values equal to both exact mini URLs before any chat request.",
                "Record the request-window start timestamp and request_origin=inference1, then execute POST /api/chat-runs from inference1 with the nonce prompt and HOLO_KEY_RN; deliver auth only over SSH stdin, preserve quoted curl-config URL/header values, and do not place the credential in argv, environment receipts, logs, or evidence.",
                "Consume GET /api/chat-runs/:id/events until terminal and capture the full assistant text.",
                "Read telemetry and trace with bun /app/src/cli/holo.ts inside the deployed Mastra container after privately bootstrapping DATABASE_URL from /run/secrets/database_url; do not expose either credential, and retain chat_request_issued=true on every failure after POST issuance.",
                "SSH to inference1, independently run the remote hostname command, and read its own ~/local-llm/logs/omlx-mini-8003.log; bind node, destination, reported hostname, path, exact options, command/output hashes, exit, ordered <=15000ms interval, and receipt hash.",
                "SSH to inference2 and independently perform the same hostname/log/binding operations; neither result is derived from the other, and duplicate destination or reported-host identity fails DUPLICATE_MINI_IDENTITY.",
                "Emit one JSON report with ok, chat_request_issued, request_origin, assistant_text_length, mini_results, serving_device_id, response_header_api_base, telemetry, effective_topology provenance plus exactly two implementer_records and config_sha256, network_mutation_performed, and literal_disconnect_claimed; the shell wrapper must capture it and apply jq -e."
              ]
            },
            "end_state": {
              "must_observe": [
                "assistant text length >= 10 characters",
                "exactly 1 of the 2 devices logs one or more `Chat completion:` lines with model=`Qwen3.6-35B-A3B-MLX-8bit` inside the request window",
                "the serving device_id === `inference1.tail011a51.ts.net` or === `inference2.tail011a51.ts.net`",
                "the serving device_id is inference1.tail011a51.ts.net or inference2.tail011a51.ts.net and is not holocron.tail011a51.ts.net; it may equal request_origin=inference1 because inference1 is an allowed serving mini",
                "mini_results has length exactly 2, names each exact mini device once, has exactly 2 distinct SSH destinations and 2 distinct independently reported tailnet hostnames, query_succeeded is true for both, exactly one matching_completion_count is N >= 1, and the other is 0",
                "each mini receipt binding_verified === true and binds exact canonical log path, bounded SSH options, command/output hashes, exit === 0, ordered elapsed milliseconds > 0 and <= 15000, and a 64-hex receipt hash",
                "response_header_api_base and every telemetry.responseHeaderApiBases entry equal `http://<serving-device_id>:8003/v1`, whose hostname equals the device whose own log matched",
                "request_origin === `inference1`",
                "exactly 1 effective_topology object has ssh_destination === `holocron@holocron`, compose_project === `holocron-router`, and compose_service === `litellm-router`",
                "effective_topology.implementer_records has length exactly 2, its two api_base values are distinct and equal the two exact mini URLs, and every record names `openai/Qwen3.6-35B-A3B-MLX-8bit`",
                "effective_topology.config_sha256 is a 64-character lowercase hexadecimal string",
                "one integer N >= 1 equals the serving matching_completion_count, telemetry.modelRequests, telemetry.fleetRequests, telemetry.telemetryRows, telemetry.underlyingTransportCalls, and telemetry.responseHeaderApiBases.length; telemetry.instrumentationBoundary === `provider-model`, terminalized and reconciliationComplete are true, cloudRequests and unknownRequests are zero, every per-call header names the serving mini, and resolved_fleet_endpoint === `http://host.docker.internal:4545/v1`",
                "network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "an empty or whitespace-only assistant reply",
                "0 devices logging the completion, which would mean the tokens came from elsewhere",
                "2 devices both logging it, which means the window is too wide for sound correlation",
                "a serving device_id === `holocron.tail011a51.ts.net`, which would mean the deployed host served itself",
                "any request to `api.anthropic.com`, `api.openai.com` or `api.deepseek.com`",
                "a telemetry endpoint containing `127.0.0.1` or `localhost`",
                "an implementer record count other than 2, duplicate api_base values, or an api_base containing laptop, localhost, 127.0.0.1, host.docker.internal, holocron, a raw IP, a cloud host, or any host outside the two exact mini allowlist",
                "a pass produced from 1 device of evidence, from two same-mini reads relabelled as two nodes, from the response header alone, from two serving minis, from zero calls, or from any serving-count/model/telemetry/transport/header mismatch"
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
      "description": "GIVEN both canonical mini logs are readable WHEN no-mini-evidence mode performs real bounded SSH/read attempts against the invalid path on both minis THEN it exits nonzero with MINI_EVIDENCE_UNAVAILABLE and two non-synthetic, timestamp-ordered, bounded receipts rather than passing on chat or header evidence.",
      "verify": "set -o pipefail; : \"${S33_EXPECTED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; receipt=\"$(mktemp)\"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha \"$S33_EXPECTED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --json >\"$receipt\"; then rm -f \"$receipt\"; exit 1; fi; jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and .chat_request_issued == false and ([.attempts[].node] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .read_path == \"/dev/null/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.canonical_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.canonical_stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.read_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == \"/dev/null/omlx-mini-8003.log\" and .read_exit != 0 and .receipt_source == \"ssh\" and (.started_at | type == \"string\" and length > 0) and (.finished_at | type == \"string\" and length > 0) and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == \"holocron@holocron\"' \"$receipt\"; status=$?; rm -f \"$receipt\"; exit $status",
      "scenario": {
        "id": "S33-PLAT-05/AC-2",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-chat + omlx-mini",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "stub",
            "static",
            "mock",
            "missing_node_evidence"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer driving the two devices inference1 and inference2",
              "steps": [
                "Perform bounded canonical-log readability prechecks independently on inference1 and inference2.",
                "Perform actual bounded SSH/read attempts against /dev/null/omlx-mini-8003.log independently on both nodes.",
                "Capture timestamps, epoch milliseconds, exact bounded SSH options, exit codes, and stdout/stderr hashes for each attempt."
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code !== 0",
                "emitted JSON contains the literal error code `MINI_EVIDENCE_UNAVAILABLE`",
                "emitted JSON contains exactly 2 actual non-synthetic SSH/read receipts whose canonical precheck exit is 0, invalid read exit is nonzero, and elapsed milliseconds are > 0 and <= 15000"
              ],
              "must_not_observe": [
                "exit code 0 from the verifier",
                "a served_by device_id naming a device that returned 0 successful queries",
                "an empty reason list, skipped/canned receipt, identical start/end epoch, or a pass justified by the chat response or the x-litellm-model-api-base header alone"
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
      "description": "GIVEN a non-loopback resolved fleet endpoint WHEN a real generate runs THEN fleetRequests is at least 1, cloudRequests is 0, and the telemetry endpoint is the resolved router base.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
      "scenario": {
        "id": "S33-PLAT-05/AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static",
            "stub",
            "mock"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Resolve the divergent role against the configured non-loopback router.",
                "Run one real generate through the agent cell with cloud-request tracking enabled.",
                "Read back the fleet request count and the persisted telemetry endpoint."
              ]
            },
            "end_state": {
              "must_observe": [
                "fleetRequests >= 1",
                "cloudRequests === 0",
                "the persisted telemetry endpoint host === `host.docker.internal`",
                "returned text length >= 1"
              ],
              "must_not_observe": [
                "fleetRequests === 0 while a real completion was returned",
                "a telemetry endpoint falling back to the hardcoded default `http://127.0.0.1:4545/v1`",
                "an empty telemetry row, or any counted request to a cloud provider host"
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
      "description": "GIVEN read-only access to the running Holocron router effective config WHEN every implementer record is parsed and checked for exact count, model, and distinct two-mini api_base membership THEN the live records are exactly the two minis with no duplicate, while an in-memory duplicate or forbidden-backend control fails before chat with LAPTOP_DEPENDENCY_DETECTED and makes no runtime or network mutation.",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"LAPTOP_DEPENDENCY_DETECTED\" and .chat_request_issued == false and (.control_violations | sort) == [\"duplicate_api_base\",\"forbidden_api_base\"] and (.effective_implementer_records_before | type == \"array\" and length == 2) and ([.effective_implementer_records_before[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([.effective_implementer_records_before[].api_base] | unique | length) == 2 and all(.effective_implementer_records_before[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and (.effective_config_sha256_before | type == \"string\" and test(\"^[0-9a-f]{64}$\")) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null",
      "scenario": {
        "id": "S33-PLAT-05/AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "deployed-litellm-router-config",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": [
            "forbidden_backend",
            "laptop_endpoint",
            "local_endpoint",
            "self_hosted_endpoint",
            "unknown_endpoint",
            "duplicate_backend",
            "empty"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deployed_router_topology",
            "action": {
              "actor": "mastra-implementer using bounded read-only SSH to holocron@holocron",
              "steps": [
                "Identify exactly one running container labeled com.docker.compose.project=holocron-router and com.docker.compose.service=litellm-router.",
                "Read /etc/litellm/config.yaml and its sha256 without modifying the container, file, service, host, or network.",
                "Parse every model_name=implementer record and require record count exactly 2, model exactness, two distinct api_base values, and exact equality with the two-mini contract.",
                "For the negative control only, append both a duplicate inference1 row and http://127.0.0.1:8003/v1 to an in-memory copy of the freshly read records; collect both duplicate_api_base and forbidden_api_base violations, do not write that copy anywhere, and do not issue the chat request.",
                "Capture the nonzero exit plus result JSON and independently re-read the live effective config sha256 to prove it did not change."
              ]
            },
            "end_state": {
              "must_observe": [
                "positive live snapshot contains exactly 2 implementer records with exactly 2 distinct api_base values: `http://inference1.tail011a51.ts.net:8003/v1` and `http://inference2.tail011a51.ts.net:8003/v1`",
                "every positive live implementer record names openai/Qwen3.6-35B-A3B-MLX-8bit",
                "forbidden-backend control exit code !== 0",
                "forbidden-backend control error code === `LAPTOP_DEPENDENCY_DETECTED`",
                "control_violations contains exactly 2 literals: `duplicate_api_base` and `forbidden_api_base`",
                "chat_request_issued === false for the forbidden-backend control",
                "effective_config_sha256_before === effective_config_sha256_after",
                "network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "a positive live implementer record count other than 2, duplicate api_base values, or an api_base outside the two exact mini URLs",
                "a missing mini URL or empty implementer backend list",
                "host.docker.internal accepted as a serving backend rather than router ingress",
                "a control exit code 0 or a chat request issued after the forbidden backend is introduced",
                "any service, config, Tailscale, Wi-Fi, interface, route, DNS, or network mutation"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "A deployed chat turn issued from inference1 returns assistant text of length >= 10 and reconciles every underlying model call to one serving mini without any laptop endpoint.",
      "maps_to_ac": "AC-1",
      "verify": "set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$pos\" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == \"inference1\" and (.assistant_text_length | type == \"number\" and . >= 10) and (.mini_results | type == \"array\" and length == 2) and ([.mini_results[].device_id] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .device_id == .reported_tailnet_hostname and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and .command_exit == 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == \"number\") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == \"inference1.tail011a51.ts.net\" or $served == \"inference2.tail011a51.ts.net\") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == (\"http://\" + $served + \":8003/v1\") and .telemetry.responseHeaderApiBase == (\"http://\" + $served + \":8003/v1\") and (.telemetry.responseHeaderApiBases | type == \"array\") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == (\"http://\" + $served + \":8003/v1\"))) and (.telemetry.modelRequests | (type == \"number\") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == \"provider-model\" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == \"http://host.docker.internal:4545/v1\" and (.effective_topology as $topology | $topology.ssh_destination == \"holocron@holocron\" and $topology.compose_project == \"holocron-router\" and $topology.compose_service == \"litellm-router\" and ($topology.implementer_records | type == \"array\" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and ($topology.config_sha256 | type == \"string\" and test(\"^[0-9a-f]{64}$\"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Exactly one mini has a positive omlx completion count, the other has zero, the positive count equals all model/telemetry/transport/header counts, and every header names that same mini.",
      "maps_to_ac": "AC-1",
      "verify": "set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$pos\" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == \"inference1\" and (.assistant_text_length | type == \"number\" and . >= 10) and (.mini_results | type == \"array\" and length == 2) and ([.mini_results[].device_id] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .device_id == .reported_tailnet_hostname and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and .command_exit == 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == \"number\") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == \"inference1.tail011a51.ts.net\" or $served == \"inference2.tail011a51.ts.net\") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == (\"http://\" + $served + \":8003/v1\") and .telemetry.responseHeaderApiBase == (\"http://\" + $served + \":8003/v1\") and (.telemetry.responseHeaderApiBases | type == \"array\") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == (\"http://\" + $served + \":8003/v1\"))) and (.telemetry.modelRequests | (type == \"number\") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == \"provider-model\" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == \"http://host.docker.internal:4545/v1\" and (.effective_topology as $topology | $topology.ssh_destination == \"holocron@holocron\" and $topology.compose_project == \"holocron-router\" and $topology.compose_service == \"litellm-router\" and ($topology.implementer_records | type == \"array\" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and ($topology.config_sha256 | type == \"string\" and test(\"^[0-9a-f]{64}$\"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "With node-side evidence unavailable, actual bounded reads on both minis produce two ordered non-synthetic receipts and the verifier exits nonzero with MINI_EVIDENCE_UNAVAILABLE.",
      "maps_to_ac": "AC-2",
      "verify": "set -o pipefail; : \"${S33_EXPECTED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; receipt=\"$(mktemp)\"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha \"$S33_EXPECTED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --json >\"$receipt\"; then rm -f \"$receipt\"; exit 1; fi; jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and .chat_request_issued == false and ([.attempts[].node] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .read_path == \"/dev/null/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.canonical_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.canonical_stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.read_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == \"/dev/null/omlx-mini-8003.log\" and .read_exit != 0 and .receipt_source == \"ssh\" and (.started_at | type == \"string\" and length > 0) and (.finished_at | type == \"string\" and length > 0) and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == \"holocron@holocron\"' \"$receipt\"; status=$?; rm -f \"$receipt\"; exit $status"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "A real generate against a non-loopback router yields fleetRequests >= 1 and cloudRequests === 0.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "The persisted telemetry endpoint for the turn is the configured router, not the loopback default.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The live effective topology contains exactly two non-duplicate implementer records, one for each allowed mini, with no laptop, local, self-hosted, cloud, or unknown endpoint.",
      "maps_to_ac": "AC-4",
      "verify": "set -o pipefail; if ! pos=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$pos\" | jq -e '.ok == true and .chat_request_issued == true and .request_origin == \"inference1\" and (.assistant_text_length | type == \"number\" and . >= 10) and (.mini_results | type == \"array\" and length == 2) and ([.mini_results[].device_id] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.mini_results[].ssh_destination] | unique | length) == 2 and ([.mini_results[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.mini_results[].reported_tailnet_hostname] | unique | length) == 2 and all(.mini_results[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .device_id == .reported_tailnet_hostname and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and .command_exit == 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and all(.mini_results[]; .query_succeeded == true and (.matching_completion_count | type == \"number\") and (.matching_completion_count | floor) == .matching_completion_count and .matching_completion_count >= 0) and ([.mini_results[] | select(.matching_completion_count > 0)] | length) == 1 and ([.mini_results[] | select(.matching_completion_count == 0)] | length) == 1 and (.serving_device_id as $served | ($served == \"inference1.tail011a51.ts.net\" or $served == \"inference2.tail011a51.ts.net\") and $served == ([.mini_results[] | select(.matching_completion_count > 0)][0].device_id) and (.telemetry.modelRequests == ([.mini_results[] | select(.matching_completion_count > 0)][0].matching_completion_count)) and .response_header_api_base == (\"http://\" + $served + \":8003/v1\") and .telemetry.responseHeaderApiBase == (\"http://\" + $served + \":8003/v1\") and (.telemetry.responseHeaderApiBases | type == \"array\") and (.telemetry.responseHeaderApiBases | length) == .telemetry.modelRequests and all(.telemetry.responseHeaderApiBases[]; . == (\"http://\" + $served + \":8003/v1\"))) and (.telemetry.modelRequests | (type == \"number\") and (floor == .) and (. >= 1)) and .telemetry.fleetRequests == .telemetry.modelRequests and .telemetry.telemetryRows == .telemetry.modelRequests and .telemetry.underlyingTransportCalls == .telemetry.modelRequests and .telemetry.instrumentationBoundary == \"provider-model\" and .telemetry.terminalized == true and .telemetry.reconciliationComplete == true and .telemetry.cloudRequests == 0 and .telemetry.unknownRequests == 0 and .telemetry.modelRequests == (.telemetry.fleetRequests + .telemetry.cloudRequests + .telemetry.unknownRequests) and .telemetry.resolved_fleet_endpoint == \"http://host.docker.internal:4545/v1\" and (.effective_topology as $topology | $topology.ssh_destination == \"holocron@holocron\" and $topology.compose_project == \"holocron-router\" and $topology.compose_service == \"litellm-router\" and ($topology.implementer_records | type == \"array\" and length == 2) and ([$topology.implementer_records[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([$topology.implementer_records[].api_base] | unique | length) == 2 and all($topology.implementer_records[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and ($topology.config_sha256 | type == \"string\" and test(\"^[0-9a-f]{64}$\"))) and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "The in-memory duplicate-plus-forbidden control exits nonzero with LAPTOP_DEPENDENCY_DETECTED before issuing a chat request, reports both violation classes, and leaves the effective config hash unchanged.",
      "maps_to_ac": "AC-4",
      "verify": "set -o pipefail; if neg=$(PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron S33_MINI_NEGATIVE=forbidden-backend bash scripts/verify-s33-mini-served-turn.sh --json); then exit 1; fi; printf '%s\\n' \"$neg\" | jq -e '.ok == false and .error_code == \"LAPTOP_DEPENDENCY_DETECTED\" and .chat_request_issued == false and (.control_violations | sort) == [\"duplicate_api_base\",\"forbidden_api_base\"] and (.effective_implementer_records_before | type == \"array\" and length == 2) and ([.effective_implementer_records_before[].api_base] | sort) == [\"http://inference1.tail011a51.ts.net:8003/v1\",\"http://inference2.tail011a51.ts.net:8003/v1\"] and ([.effective_implementer_records_before[].api_base] | unique | length) == 2 and all(.effective_implementer_records_before[]; .model == \"openai/Qwen3.6-35B-A3B-MLX-8bit\") and (.effective_config_sha256_before | type == \"string\" and test(\"^[0-9a-f]{64}$\")) and .effective_config_sha256_before == .effective_config_sha256_after and .network_mutation_performed == false and .literal_disconnect_claimed == false' >/dev/null"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the real public chat-runs agent.stream path WHEN a real Hono/Postgres/fleet turn runs THEN request/run-scoped provider-model accounting instruments every underlying doStream or equivalent transport invocation including multi-step/tool-loop calls, observes N at least one, and requires modelRequests, fleetRequests, telemetryRows, underlyingTransportCalls, responseHeaderApiBases length, and the sole serving mini completion count all equal N while every per-call header names that mini; missing, outer-stream-only, global-fetch, bypassed, cloud/OpenAI, unknown, zero, dual-serving, or inconsistent accounting fails closed.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
      "scenario": {
        "id": "S33-PLAT-05/AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "public-hono-chat + postgres + litellm-fleet-router",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["missing_public_boundary", "direct_cloud_call", "unknown_transport", "counter_mismatch", "static", "stub", "mock"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "nonce_chat_turn",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Issue a real public chat request and follow the persisted run through agent.stream.",
                "Assert every request/run-bound underlying doStream or equivalent transport invocation is counted, including each multi-step/tool-loop call, with provider-model status and one common N at least one across model, fleet, telemetry-row, transport-call, per-call-header, and sole-serving-mini completion counts; require every per-call header to name that mini, the other mini count zero, cloud zero, and unknown zero.",
                "On regular temporary source and receipt copies, remove the public-boundary wrapper, count the outer agent.stream once, use a global fetch patch, insert direct api.openai.com and unknown requests, and corrupt totals; run the same oracle for each."
              ]
            },
            "end_state": {
              "must_observe": [
                "one integer N >= 1 equals modelRequests, fleetRequests, telemetryRows, underlyingTransportCalls, responseHeaderApiBases.length, and the sole serving mini matching_completion_count",
                "instrumentationBoundary === provider-model, every responseHeaderApiBases entry names the serving mini, the other mini count is zero, cloudRequests === 0, and unknownRequests === 0",
                "exactly 6 real-filesystem missing-wrapper, outer-stream-only, global-fetch, cloud, unknown, and counter mutations exit nonzero"
              ],
              "must_not_observe": [
                "missing instrumentation reported as cloudRequests === 0 success",
                "a global fetch monkey patch or one outer agent.stream count treated as request-scoped transport proof",
                "a model request outside the public boundary accounting"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the landed main SHA and schema-v1 release lock WHEN live proof reads health and deployed identity THEN sourceRevision, imageDigest, and composeSha256 are mandatory and equal across expected main, release lock, health, and deployed Compose/container identity.",
      "verify": "set -o pipefail; : \"${S33_EXPECTED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; PLATFORM_IT=1 S33_REQUEST_HOST=inference1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode live --expected-main-sha \"$S33_EXPECTED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --json",
      "scenario": {
        "id": "S33-PLAT-05/AC-6",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "deployed-holocron-health + compose + release-lock",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": ["missing_identity", "source_revision_mismatch", "image_digest_mismatch", "compose_hash_mismatch", "symlink_lock", "static"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "deployed_release_identity",
            "action": {
              "actor": "mastra-implementer using bounded read-only SSH to holocron@holocron",
              "steps": [
                "Validate the release lock is regular, non-symlink, schema-v1, and deployable.",
                "Read health and deployed Compose/container identity without mutation.",
                "Require exact source revision, immutable image digest, and Compose hash equality.",
                "Mutate each required field independently on regular temporary copies and rerun the identity oracle."
              ]
            },
            "end_state": {
              "must_observe": [
                "`sourceRevision` value count === 4 and all 4 values are byte-equal",
                "`imageDigest` value count === 3 and all 3 values are valid sha256 digests and byte-equal",
                "`composeSha256` value count === 3 and all 3 values are 64-hex and byte-equal",
                "exactly 6 missing-or-changed identity mutations exit nonzero before success"
              ],
              "must_not_observe": [
                "proof against an unlanded source revision",
                "a mutable image tag accepted instead of an immutable digest",
                "a missing or unequal Compose hash",
                "an empty identity tuple"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-7",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN healthy real minis WHEN no-mini-evidence mode runs THEN canonical reads succeed, real bounded SSH/read attempts against the invalid path execute on both nodes, each logical node is bound to its exact SSH destination and independently remote-reported tailnet hostname with canonical/read command-output-exit-time hashes, the verifier returns nonzero with two non-synthetic receipts, same-mini relabelling fails, and no chat, remote, service, or network mutation occurs.",
      "verify": "set -o pipefail; : \"${S33_EXPECTED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; receipt=\"$(mktemp)\"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha \"$S33_EXPECTED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --json >\"$receipt\"; then rm -f \"$receipt\"; exit 1; fi; jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and .chat_request_issued == false and ([.attempts[].node] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .read_path == \"/dev/null/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.canonical_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.canonical_stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.read_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == \"/dev/null/omlx-mini-8003.log\" and .read_exit != 0 and .receipt_source == \"ssh\" and (.started_at | type == \"string\" and length > 0) and (.finished_at | type == \"string\" and length > 0) and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == \"holocron@holocron\"' \"$receipt\"; status=$?; rm -f \"$receipt\"; exit $status",
      "scenario": {
        "id": "S33-PLAT-05/AC-7",
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "omlx-mini read-only SSH",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": ["skipped_read", "canned_row", "synthetic_receipt", "single_node", "state_mutation", "static"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer driving inference1 and inference2 independently",
              "steps": [
                "Perform bounded canonical-log readability prechecks on both nodes and independently execute the remote hostname command on each SSH connection.",
                "Perform bounded real reads of /dev/null/omlx-mini-8003.log over SSH on both nodes.",
                "Bind each logical node to exact SSH destination, remote-reported tailnet hostname, canonical/negative paths, exact options, command/output hashes, exits, ordered <=15000ms interval, and recomputed receipt hash.",
                "Reject duplicate SSH destinations or remote-reported hostnames as DUPLICATE_MINI_IDENTITY before considering labels."
              ]
            },
            "end_state": {
              "must_observe": [
                "underlying verifier exit code !== 0",
                "actual SSH/read receipt count === 2 with exactly 2 distinct SSH destinations and 2 distinct remote-reported hostnames; each binding_verified === true, canonical precheck exit === 0, invalid-read exit !== 0, and elapsed milliseconds are > 0 and <= 15000",
                "network_mutation_performed === false and literal_disconnect_claimed === false"
              ],
              "must_not_observe": [
                "a skipped, synthetic, replayed, canned, or same-mini-relabelled node row",
                "a public chat request",
                "a remote, service, Tailscale, Wi-Fi, interface, route, or DNS mutation",
                "an empty attempt list"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-8",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the mini log has no nonce WHEN request/run telemetry, exact logical-node to SSH-destination to independently remote-reported tailnet-hostname bindings, two-mini append windows, and serving headers are correlated THEN the receipt explicitly denies nonce binding, requires exactly one serving mini with N at least one completions, the other count zero, full serving-count/model/telemetry/transport/per-call-header agreement, rejects same-mini relabelling as DUPLICATE_MINI_IDENTITY, and fails closed on every ambiguity.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts",
      "scenario": {
        "id": "S33-PLAT-05/AC-8",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "chat request telemetry + omlx-mini logs",
        "topology": "multi-node",
        "negative_control": {
          "would_fail_if": ["false_nonce_binding", "missing_node", "same_mini_relabel", "inode_change", "truncation", "ambiguous_cardinality", "header_telemetry_disagreement", "static"]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "mini_omlx_logs",
            "action": {
              "actor": "mastra-implementer",
              "steps": [
                "Independently bind each logical node to exact SSH destination, remote-reported tailnet hostname, canonical path, exact options, command/output hashes, exit/time interval, and receipt hash; require exactly 2 distinct destinations and reported hostnames.",
                "Record per-node before/after inode, byte offsets, timestamps, and hashes and read only appended bytes.",
                "Require exactly one serving mini with N >= 1 appended completions, the other mini with zero, and N equal to model, fleet, durable telemetry row, underlying transport call, and per-call serving-header cardinalities.",
                "Set method bounded_append_window_header_and_run_telemetry, nonceLogBinding=false, and an explicit not-nonce-binding claim.",
                "Mutate regular temporary receipt copies for every ambiguity input and replace the second node binding with a relabelled first-node receipt; rerun the oracle."
              ]
            },
            "end_state": {
              "must_observe": [
                "exactly 1 serving mini has matching_completion_count === N >= 1 and the other count === 0",
                "`N === modelRequests === fleetRequests === telemetryRows === underlyingTransportCalls === responseHeaderApiBases.length` and every servingHeaderNode === telemetryNode === matchingNode",
                "nonceLogBinding === false and claim explicitly says not nonce binding",
                "exactly 7 ambiguity mutations fail with `AMBIGUOUS_MINI_CORRELATION`, and 1 same-mini relabel mutation fails with `DUPLICATE_MINI_IDENTITY`"
              ],
              "must_not_observe": [
                "a claim that the nonce was found in the oMLX completion line",
                "success after an inode/offset discontinuity or unreadable range",
                "success with zero appended completions, two serving minis, or any count/header mismatch",
                "an empty node receipt list",
                "two reads from the same mini relabelled as two logical nodes"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-9",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN caller-supplied exact base, RED, candidate, expected landed-main SHA, release lock, and authoritative artifact paths WHEN strict-schema lineage verification independently runs Git object/parent/diff/ancestry checks, hashes evidence/review artifacts, and recomputes release/proof identity THEN real test-only RED and descendant GREEN precede mandatory product-manager plus mastra-reviewer source review, orchestrator landing, same-main package/deploy/proof, and mandatory final dual review.",
      "verify": "set -o pipefail; : \"${S33_IMPLEMENTATION_BASE_SHA:?}\"; : \"${S33_RED_SHA:?}\"; : \"${S33_CANDIDATE_SHA:?}\"; : \"${S33_EXPECTED_LANDED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; : \"${S33_LINEAGE_RECEIPT:?}\"; : \"${S33_RED_FAILURE_EVIDENCE:?}\"; : \"${S33_PROOF_RECEIPT:?}\"; : \"${S33_SOURCE_PRODUCT_REVIEW:?}\"; : \"${S33_SOURCE_MASTRA_REVIEW:?}\"; : \"${S33_FINAL_PRODUCT_REVIEW:?}\"; : \"${S33_FINAL_MASTRA_REVIEW:?}\"; result=\"$(bash scripts/verify-s33-mini-served-turn.sh --mode final-lineage --implementation-base \"$S33_IMPLEMENTATION_BASE_SHA\" --red-commit \"$S33_RED_SHA\" --candidate \"$S33_CANDIDATE_SHA\" --expected-landed-main-sha \"$S33_EXPECTED_LANDED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --receipt \"$S33_LINEAGE_RECEIPT\" --red-failure-evidence \"$S33_RED_FAILURE_EVIDENCE\" --proof-receipt \"$S33_PROOF_RECEIPT\" --source-product-review \"$S33_SOURCE_PRODUCT_REVIEW\" --source-mastra-review \"$S33_SOURCE_MASTRA_REVIEW\" --final-product-review \"$S33_FINAL_PRODUCT_REVIEW\" --final-mastra-review \"$S33_FINAL_MASTRA_REVIEW\" --json)\" && printf '%s\\n' \"$result\" | jq -e --arg base \"$S33_IMPLEMENTATION_BASE_SHA\" --arg red \"$S33_RED_SHA\" --arg candidate \"$S33_CANDIDATE_SHA\" --arg landed \"$S33_EXPECTED_LANDED_MAIN_SHA\" --arg releaseLock \"$S33_RELEASE_LOCK\" --arg lineageReceipt \"$S33_LINEAGE_RECEIPT\" --arg redEvidence \"$S33_RED_FAILURE_EVIDENCE\" --arg proofReceipt \"$S33_PROOF_RECEIPT\" --arg sourceProduct \"$S33_SOURCE_PRODUCT_REVIEW\" --arg sourceMastra \"$S33_SOURCE_MASTRA_REVIEW\" --arg finalProduct \"$S33_FINAL_PRODUCT_REVIEW\" --arg finalMastra \"$S33_FINAL_MASTRA_REVIEW\" '.ok == true and .schema == \"s33-plat-05-lineage/v1\" and .git.recomputed == true and .git.baseSha == $base and .git.redSha == $red and .git.redParentSha == $base and .git.redDiffPaths == [\"services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts\"] and .git.redRealPublicPathReached == true and .git.redFailureClass == \"missing_public_chat_accounting\" and .git.redFailureEvidencePath == $redEvidence and .git.redFailureEvidenceRegular == true and .git.redFailureEvidenceSymlink == false and .git.redFailureEvidenceIndependentlyHashed == true and (.git.redFailureEvidenceSha256 | test(\"^[0-9a-f]{64}$\")) and .git.candidateSha == $candidate and .git.candidateDescendsFromRed == true and .git.landedMainSha == $landed and .git.landedMainContainsCandidate == true and .typecheck.command == \"pnpm exec tsgo --noEmit -p services/platform/tsconfig.json\" and .typecheck.authorizedBy == \"orchestrator\" and .typecheck.baseSha == $base and .typecheck.candidateSha == $candidate and .typecheck.sameToolchain == true and .typecheck.addedNormalizedDiagnostics == 0 and (.typecheck.baseRawOutputSha256 | test(\"^[0-9a-f]{64}$\")) and (.typecheck.candidateRawOutputSha256 | test(\"^[0-9a-f]{64}$\")) and .release.recomputed == true and .release.lockPath == $releaseLock and .release.lockRegular == true and .release.lockSymlink == false and .release.sourceRevision == $landed and (.release.imageDigest | test(\"^sha256:[0-9a-f]{64}$\")) and (.release.composeSha256 | test(\"^[0-9a-f]{64}$\")) and .proof.recomputed == true and .proof.receiptPath == $proofReceipt and .proof.receiptRegular == true and .proof.receiptSymlink == false and .proof.receiptIndependentlyHashed == true and (.proof.receiptSha256 | test(\"^[0-9a-f]{64}$\")) and .proof.expectedMainSha == $landed and .proof.sourceRevision == .release.sourceRevision and .proof.imageDigest == .release.imageDigest and .proof.composeSha256 == .release.composeSha256 and ([.reviews.source[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{\"role\":\"mastra-reviewer\",\"artifactPath\":$sourceMastra},{\"role\":\"product-manager\",\"artifactPath\":$sourceProduct}] and ([.reviews.source[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"] and all(.reviews.source[]; .approved == true and .candidateSha == $candidate and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test(\"^[0-9a-f]{64}$\"))) and ([.reviews.final[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{\"role\":\"mastra-reviewer\",\"artifactPath\":$finalMastra},{\"role\":\"product-manager\",\"artifactPath\":$finalProduct}] and ([.reviews.final[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"] and all(.reviews.final[]; .approved == true and .proofSha256 == .proof.receiptSha256 and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test(\"^[0-9a-f]{64}$\")) and .reviewedAt > .proof.finishedAt) and .ordering.sourceReviewsBeforeLanding == true and .ordering.packageDeployBeforeProof == true and .ordering.finalReviewsAfterProof == true and .receipt.path == $lineageReceipt and .receipt.regular == true and .receipt.symlink == false and .receipt.independentlyHashed == true and (.receipt.sha256 | test(\"^[0-9a-f]{64}$\")) and .receipt.strictSchemaValidated == true and .receipt.verifiedAgainstCallerInputs == true'",
      "scenario": {
        "id": "S33-PLAT-05/AC-9",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git + typecheck + release lineage",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": ["non_test_red", "setup_failure_red", "non_descendant_green", "unauthorized_comparison", "reordered_event", "identity_mismatch", "static"]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "governed_lineage",
            "action": {
              "actor": "integrator",
              "steps": [
                "Validate a strict no-additional-fields lineage schema against caller-supplied exact base, RED, candidate, expected landed-main SHA, release lock, proof, and authoritative review artifact paths.",
                "Independently run Git cat-file, rev-parse, show/diff, and merge-base checks for RED parent, sole diff path, real-path failure evidence hash, GREEN ancestry, and landed-main containment.",
                "Verify exact platform typecheck command, exact base/candidate SHAs, orchestrator authorization, same toolchain, raw-output hashes, and zero added normalized diagnostics.",
                "Independently hash mandatory product-manager and mastra-reviewer source approval artifacts and bind each approval to the exact candidate before orchestrator landing.",
                "Re-read the regular non-symlink release lock and proof identity inputs and recompute sourceRevision, imageDigest, and composeSha256 equality against the caller-supplied landed main SHA.",
                "Independently hash mandatory product-manager and mastra-reviewer final approval artifacts and bind each approval to the exact proof hash after proof; treat test-quality-reviewer as additional only.",
                "Mutate regular temporary lineage copies for receipt fields, caller-input binding, Git identities, artifact hashes, reviewer identities, event order, and release/proof equality."
              ]
            },
            "end_state": {
              "must_observe": [
                "`git.recomputed === true`, `red.parentSha === callerBaseSha`, `red.diffPaths === [services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts]`, and `green.descendsFromRed === true`",
                "`typecheck.command === pnpm exec tsgo --noEmit -p services/platform/tsconfig.json`, `authorizedBy === orchestrator`, and `addedNormalizedDiagnostics === 0`",
                "`sourceReviewProductAt < landedAt` and `sourceReviewMastraAt < landedAt`",
                "`release.recomputed === true`, `proof.recomputed === true`, and `package.sourceRevision === deploy.sourceRevision === proof.expectedMainSha === callerLandedMainSha` with equal digest/Compose values",
                "source and final reviewer lists each equal `[product-manager,mastra-reviewer]`, every artifact hash is independently recomputed, and final review timestamps are greater than `proof.finishedAt`"
              ],
              "must_not_observe": [
                "RED caused by setup failure or containing production changes",
                "review after landing substituted for source predeploy review",
                "proof against any SHA, digest, or Compose hash other than the deployed release tuple",
                "test-quality-reviewer substituted for product-manager or mastra-reviewer",
                "a self-reported Git, identity, approval, or artifact-hash boolean accepted without independent recomputation",
                "an empty lineage receipt"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Real public accounting plus real-filesystem wrapper, cloud, unknown, and counter mutations prove fail-closed completeness.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "Regular temporary sourceRevision, imageDigest, and composeSha256 mutations each fail before live proof success.",
      "maps_to_ac": "AC-6",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "No-mini mode performs two real bounded invalid-path SSH reads, binds each logical node to its SSH destination and independently reported tailnet hostname, rejects same-mini relabelling, and emits two non-synthetic receipts while returning nonzero.",
      "maps_to_ac": "AC-7",
      "verify": "set -o pipefail; : \"${S33_EXPECTED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; receipt=\"$(mktemp)\"; if PLATFORM_IT=1 S33_HOLOCRON_HOST=holocron@holocron bash scripts/verify-s33-mini-served-turn.sh --mode no-mini-evidence --expected-main-sha \"$S33_EXPECTED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --json >\"$receipt\"; then rm -f \"$receipt\"; exit 1; fi; jq -e '.ok == false and .error_code == \"MINI_EVIDENCE_UNAVAILABLE\" and .chat_request_issued == false and ([.attempts[].node] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | sort) == [\"inference1\",\"inference2\"] and ([.attempts[].ssh_destination] | unique | length) == 2 and ([.attempts[].reported_tailnet_hostname] | sort) == [\"inference1.tail011a51.ts.net\",\"inference2.tail011a51.ts.net\"] and ([.attempts[].reported_tailnet_hostname] | unique | length) == 2 and all(.attempts[]; (((.node == \"inference1\" and .ssh_destination == \"inference1\" and .reported_tailnet_hostname == \"inference1.tail011a51.ts.net\") or (.node == \"inference2\" and .ssh_destination == \"inference2\" and .reported_tailnet_hostname == \"inference2.tail011a51.ts.net\")) and .hostname_source == \"remote-command\" and .canonical_log_path == \"~/local-llm/logs/omlx-mini-8003.log\" and .read_path == \"/dev/null/omlx-mini-8003.log\" and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"] and (.canonical_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.canonical_stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.read_command_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .canonical_precheck_exit == 0 and .read_exit != 0 and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and .binding_verified == true and (.receipt_binding_sha256 | test(\"^[0-9a-f]{64}$\")))) and ([.attempts[] | select(.actual_ssh_attempted == true and .actual_read_attempted == true and .synthetic == false and .canonical_precheck_exit == 0 and .read_path == \"/dev/null/omlx-mini-8003.log\" and .read_exit != 0 and .receipt_source == \"ssh\" and (.started_at | type == \"string\" and length > 0) and (.finished_at | type == \"string\" and length > 0) and (.started_epoch_ms | type == \"number\") and (.finished_epoch_ms | type == \"number\") and .finished_epoch_ms > .started_epoch_ms and (.finished_epoch_ms - .started_epoch_ms) <= 15000 and (.stdout_sha256 | test(\"^[0-9a-f]{64}$\")) and (.stderr_sha256 | test(\"^[0-9a-f]{64}$\")) and .bounded_ssh_options == [\"BatchMode=yes\",\"ConnectTimeout=10\",\"ServerAliveCountMax=2\",\"ServerAliveInterval=5\"])] | length) == 2 and .network_mutation_performed == false and .literal_disconnect_claimed == false and .remote_host == \"holocron@holocron\"' \"$receipt\"; status=$?; rm -f \"$receipt\"; exit $status"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "Positive correlation denies nonce binding; real-filesystem ambiguity mutations fail AMBIGUOUS_MINI_CORRELATION, and a same-mini relabel mutation fails DUPLICATE_MINI_IDENTITY.",
      "maps_to_ac": "AC-8",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "Git/source checks and real-filesystem lineage mutations prove true RED, exact ancestry, authorized platform comparison, ordered mandatory reviews, and immutable deploy/proof equality.",
      "maps_to_ac": "AC-9",
      "verify": "set -o pipefail; : \"${S33_IMPLEMENTATION_BASE_SHA:?}\"; : \"${S33_RED_SHA:?}\"; : \"${S33_CANDIDATE_SHA:?}\"; : \"${S33_EXPECTED_LANDED_MAIN_SHA:?}\"; : \"${S33_RELEASE_LOCK:?}\"; : \"${S33_LINEAGE_RECEIPT:?}\"; : \"${S33_RED_FAILURE_EVIDENCE:?}\"; : \"${S33_PROOF_RECEIPT:?}\"; : \"${S33_SOURCE_PRODUCT_REVIEW:?}\"; : \"${S33_SOURCE_MASTRA_REVIEW:?}\"; : \"${S33_FINAL_PRODUCT_REVIEW:?}\"; : \"${S33_FINAL_MASTRA_REVIEW:?}\"; result=\"$(bash scripts/verify-s33-mini-served-turn.sh --mode final-lineage --implementation-base \"$S33_IMPLEMENTATION_BASE_SHA\" --red-commit \"$S33_RED_SHA\" --candidate \"$S33_CANDIDATE_SHA\" --expected-landed-main-sha \"$S33_EXPECTED_LANDED_MAIN_SHA\" --release-lock \"$S33_RELEASE_LOCK\" --receipt \"$S33_LINEAGE_RECEIPT\" --red-failure-evidence \"$S33_RED_FAILURE_EVIDENCE\" --proof-receipt \"$S33_PROOF_RECEIPT\" --source-product-review \"$S33_SOURCE_PRODUCT_REVIEW\" --source-mastra-review \"$S33_SOURCE_MASTRA_REVIEW\" --final-product-review \"$S33_FINAL_PRODUCT_REVIEW\" --final-mastra-review \"$S33_FINAL_MASTRA_REVIEW\" --json)\" && printf '%s\\n' \"$result\" | jq -e --arg base \"$S33_IMPLEMENTATION_BASE_SHA\" --arg red \"$S33_RED_SHA\" --arg candidate \"$S33_CANDIDATE_SHA\" --arg landed \"$S33_EXPECTED_LANDED_MAIN_SHA\" --arg releaseLock \"$S33_RELEASE_LOCK\" --arg lineageReceipt \"$S33_LINEAGE_RECEIPT\" --arg redEvidence \"$S33_RED_FAILURE_EVIDENCE\" --arg proofReceipt \"$S33_PROOF_RECEIPT\" --arg sourceProduct \"$S33_SOURCE_PRODUCT_REVIEW\" --arg sourceMastra \"$S33_SOURCE_MASTRA_REVIEW\" --arg finalProduct \"$S33_FINAL_PRODUCT_REVIEW\" --arg finalMastra \"$S33_FINAL_MASTRA_REVIEW\" '.ok == true and .schema == \"s33-plat-05-lineage/v1\" and .git.recomputed == true and .git.baseSha == $base and .git.redSha == $red and .git.redParentSha == $base and .git.redDiffPaths == [\"services/platform/tests/integration/s33-plat-05-mini-served-turn.test.ts\"] and .git.redRealPublicPathReached == true and .git.redFailureClass == \"missing_public_chat_accounting\" and .git.redFailureEvidencePath == $redEvidence and .git.redFailureEvidenceRegular == true and .git.redFailureEvidenceSymlink == false and .git.redFailureEvidenceIndependentlyHashed == true and (.git.redFailureEvidenceSha256 | test(\"^[0-9a-f]{64}$\")) and .git.candidateSha == $candidate and .git.candidateDescendsFromRed == true and .git.landedMainSha == $landed and .git.landedMainContainsCandidate == true and .typecheck.command == \"pnpm exec tsgo --noEmit -p services/platform/tsconfig.json\" and .typecheck.authorizedBy == \"orchestrator\" and .typecheck.baseSha == $base and .typecheck.candidateSha == $candidate and .typecheck.sameToolchain == true and .typecheck.addedNormalizedDiagnostics == 0 and (.typecheck.baseRawOutputSha256 | test(\"^[0-9a-f]{64}$\")) and (.typecheck.candidateRawOutputSha256 | test(\"^[0-9a-f]{64}$\")) and .release.recomputed == true and .release.lockPath == $releaseLock and .release.lockRegular == true and .release.lockSymlink == false and .release.sourceRevision == $landed and (.release.imageDigest | test(\"^sha256:[0-9a-f]{64}$\")) and (.release.composeSha256 | test(\"^[0-9a-f]{64}$\")) and .proof.recomputed == true and .proof.receiptPath == $proofReceipt and .proof.receiptRegular == true and .proof.receiptSymlink == false and .proof.receiptIndependentlyHashed == true and (.proof.receiptSha256 | test(\"^[0-9a-f]{64}$\")) and .proof.expectedMainSha == $landed and .proof.sourceRevision == .release.sourceRevision and .proof.imageDigest == .release.imageDigest and .proof.composeSha256 == .release.composeSha256 and ([.reviews.source[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{\"role\":\"mastra-reviewer\",\"artifactPath\":$sourceMastra},{\"role\":\"product-manager\",\"artifactPath\":$sourceProduct}] and ([.reviews.source[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"] and all(.reviews.source[]; .approved == true and .candidateSha == $candidate and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test(\"^[0-9a-f]{64}$\"))) and ([.reviews.final[] | {role: .role, artifactPath: .artifactPath}] | sort_by(.role)) == [{\"role\":\"mastra-reviewer\",\"artifactPath\":$finalMastra},{\"role\":\"product-manager\",\"artifactPath\":$finalProduct}] and ([.reviews.final[].role] | sort) == [\"mastra-reviewer\",\"product-manager\"] and all(.reviews.final[]; .approved == true and .proofSha256 == .proof.receiptSha256 and .artifactRegular == true and .artifactSymlink == false and .independentlyHashed == true and (.artifactSha256 | test(\"^[0-9a-f]{64}$\")) and .reviewedAt > .proof.finishedAt) and .ordering.sourceReviewsBeforeLanding == true and .ordering.packageDeployBeforeProof == true and .ordering.finalReviewsAfterProof == true and .receipt.path == $lineageReceipt and .receipt.regular == true and .receipt.symlink == false and .receipt.independentlyHashed == true and (.receipt.sha256 | test(\"^[0-9a-f]{64}$\")) and .receipt.strictSchemaValidated == true and .receipt.verifiedAgainstCallerInputs == true'"
    }
  ]
}
-->
