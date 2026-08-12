# D08-09 — Cross-tailnet cold-host recovery drill

> **Task ID:** D08-09
> **Sprint:** [Sprint 32 — Convex Decommission and Portable Holocron Handoff](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `test-quality-reviewer`
> **Estimate:** 90 min + operator window
> **Type:** INFRA / HUMAN GATE
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> **Verification policy:** tests=false · red=false · seeded=true
> **Scope:** `/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json` (binding strategic option)
> **LOC budget:** 140 of 1080 aggregate
> Status: Backlog — requires an authorized second real tailnet device and live operator credentials

**Capabilities:** CAP-DEP-01 · CAP-BAK-01
**Binding requirements:** IMP-AC-5, IMP-AC-11, IMP-AC-18, IMP-AC-19

## What this does

Runs the final un-fakeable deployment gate across two real tailnet devices: the serving Mac `holocron` and one authorized peer. It proves private HTTPS 44111, exact service readiness, Postgres failure/recovery, authenticated MCP discovery, Mastra restart persistence, no Funnel, and fail-closed negative controls.

## Why

Loopback tests cannot establish tailnet reachability, and static Tailscale status cannot prove the second-device request path. This gate closes the server handoff before the irreversible Convex deletion by driving both nodes through their own real entrypoints and capturing redacted, non-empty evidence.

## How to verify

From the second authorized device, call `https://<holocron-tailnet-fqdn>:44111/health` and authenticated `/mcp`. From the server, verify four containers, stop/recover Postgres, restart Mastra, and inspect Serve/Funnel status. Re-run the peer probes and prove one Postgres plus one blob sentinel survived.

## Scope

This task may update the operator runbook and existing verification/readiness test surfaces and may write only redacted evidence beneath `evidence/D08-09`. It does not mutate Tailscale ACLs, expose Funnel, or delete/recreate volumes.

<details>
<summary>▸ Full agent specification (INFRA-TASK-TEMPLATE v2.2 — required reading for implementer + reviewer)</summary>

```text
================================================================================
TASK: D08-09 - Cross-tailnet cold-host recovery drill
================================================================================

TASK_TYPE:  INFRA / HUMAN GATE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M + operator window
AGENT:      implementer=devops-engineer | reviewer=test-quality-reviewer
TDD_MODE:   skipped

RUNTIME_COMMANDS:
  verify:    PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/deploy/verify-production.ts services/platform/src/cli/holo.ts services/platform/tests/integration/service/health-readiness.test.ts
```

## Outcome

Two real tailnet devices prove the portable `holocron` release is private, authentic, recoverable, persistent, and fail-closed with no public Funnel endpoint or credential leakage.

## 🚫 Critical constraints

- NEVER substitute localhost, a second process, a mock peer, injected peer rows, or test-authored HTTP responses for the second real authorized device.
- NEVER invoke or enable Funnel; status/config evidence must prove `funnel_endpoint_count=0` and private Serve targets `http://127.0.0.1:44111`.
- NEVER store API/MCP keys, Tailscale auth/session material, cookies, raw environments, or credential-bearing URLs in commands, receipts, logs, or evidence.
- NEVER run the drill without an explicit operator window and authorization for Postgres stop/recovery and Mastra restart; always restore service in `finally`/trap paths.
- NEVER delete/recreate volumes or accept empty health/MCP/sentinel evidence.

## Done when

- [ ] An authorized second real device receives health HTTP 200 over private HTTPS port 44111 and the server reports no Funnel.
- [ ] Exactly four services are healthy; real Postgres removal yields health 503, recovery yields 200, and authenticated MCP discovery returns exactly 44 tools.
- [ ] Mastra restarts at least once; the second device succeeds before/after; one Postgres and one blob sentinel persist.
- [ ] Unreachable Serve, wrong deployment identity, and missing dependency each produce exactly one rejection.
- [ ] Evidence reports `credential_value_count=0`, passes scenario/receipt checks, and blocks D08-05 on any missing/failed/empty result.

## Binding acceptance criteria (verbatim)

- `IMP-AC-5`: The documented private Tailscale Serve configuration proxies the stable holocron tailnet hostname to loopback :44111 without Funnel or public Internet exposure, and a verifier reaches that URL from an authorized tailnet peer.
- `IMP-AC-11`: Docker-backed verification proves strict four-service readiness, Postgres-down 503/recovery, external deployment identity, persistent Postgres/blob sentinels after restart, authenticated MCP discovery, and the tailnet-private Serve endpoint.
- `IMP-AC-18`: A cross-tailnet cold-host drill proves an authorized second device reaches private Serve, verifies the four services, restarts Mastra, confirms persistent sentinels, and proves no Funnel endpoint was enabled.
- `IMP-AC-19`: The drill has negative controls for an unreachable Serve endpoint, wrong deployment identity, and a missing dependency, and its evidence contains no credential values.

## Implementation steps

1. Prepare the two-node evidence contract [PRIMARY]
   - File: `services/platform/deploy/compose/README.md`
   - Action: document node A (`holocron`) and authorized node B commands, timeouts, exact observations, redaction rules, evidence schema, and cleanup/recovery traps.
   - Proof: no command embeds credentials; peer commands consume secure local environment/keychain input without printing it.

2. Extend verification for a remote peer receipt
   - Files: `services/platform/src/deploy/verify-production.ts`, `services/platform/src/cli/holo.ts`, and readiness test.
   - Action: consume a redacted peer-produced receipt or execute an authorized remote command transport already available to the operator; bind it to target FQDN, HTTPS port 44111, generation/digest, peer identity hash, timestamps, status, and counts.
   - Proof: no raw credential or inherited environment crosses the boundary.

3. Run positive recovery path
   - Node A: verify Serve/private status and exact four services; seed sentinels; drive real Postgres 503/recovery; drive Mastra restart.
   - Node B: call private health and authenticated MCP discovery before and after restart.
   - Evidence: record values/counts/hashes, not vague pass strings.

4. Run negative controls and seal evidence
   - Node B: unreachable Serve URL fails.
   - Verifier: wrong generation/digest/host fails.
   - Node A: missing Postgres dependency fails health, then is restored.
   - Scan all evidence for seeded credential canaries, confirm no Funnel, write immutable redacted artifact, and rerun receipt-driven verification.

## Verification checklist

- [ ] Both real devices are identified by redacted stable hashes and both command entrypoints are recorded.
- [ ] Private Serve health returns 200 on port 44111 from node B; Funnel count is zero.
- [ ] Four services, Postgres 503/recovery 200, 44 MCP tools, restart count ≥1, and one+one sentinels are observed.
- [ ] Three named negative controls each reject exactly once and the recovery cleanup completes.
- [ ] Credential-value scan is zero and D08-05 dependency/gate text includes D08-09.

## Test criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | Two real tailnet devices prove private Serve HTTPS 44111 health 200 and Funnel false. | AC-1 / IMP-AC-5 | `jq -e '.real_device_count == 2 and .serve_https_port == 44111 and .second_device_health_status == 200 and .funnel_enabled == false' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json` |
| TC-2 | Four services, Postgres 503/recovery 200, persistent sentinels, and authenticated MCP 44 tools are real. | AC-2 / IMP-AC-11 | `jq -e '.healthy_service_count == 4 and .postgres_down_health_status == 503 and .recovered_health_status == 200 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .mcp_tool_count == 44' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json` |
| TC-3 | Mastra restart count is ≥1, peer health recovers, sentinels remain, and Funnel endpoint count is zero. | AC-3 / IMP-AC-18 | `jq -e '.real_device_count == 2 and .healthy_service_count == 4 and .mastra_restart_count >= 1 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .funnel_endpoint_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json` |
| TC-4 | Unreachable Serve, wrong identity, and missing dependency reject exactly once and credential values remain zero. | AC-4 / IMP-AC-19 | `jq -e '.unreachable_serve_rejection_count == 1 and .wrong_identity_rejection_count == 1 and .missing_dependency_rejection_count == 1 and .credential_value_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json` |

## Fixtures

`tailnet_drill` (`seed_method: recorded_external`): serving device A named `holocron`; authorized second real device B on the same tailnet; private Serve HTTPS port 44111 → `http://127.0.0.1:44111`; exact four-service release; one Postgres and one blob sentinel; Funnel count zero.

## Evidence schema

`evidence/D08-09/cross-tailnet-drill.json` must include at least:

- schema `holo.deploy.cross-tailnet-drill.v1`, target host/FQDN hash, peer identity hash, release digest/revision/generation, started/completed timestamps
- `real_device_count=2`, `serve_https_port=44111`, `second_device_health_status=200`, `funnel_enabled=false`, `funnel_endpoint_count=0`
- `healthy_service_count=4`, `postgres_down_health_status=503`, `recovered_health_status=200`, `mcp_tool_count=44`, `mastra_restart_count>=1`
- `postgres_sentinel_rows=1`, `blob_sentinel_objects=1`, three rejection counts each `1`, `credential_value_count=0`, `raw_environment_present=false`

## Capability chain

- touches_capabilities: `CAP-DEP-01`, `CAP-BAK-01`
- consumes: D08-08 boot/lifecycle proof; authorized node B; live scoped MCP credential; D08-07 deployment receipt
- provides: two-node private reachability/recovery gate and redacted immutable evidence for D08-05
- boundary_contracts: Tailscale Serve node A → authorized peer node B; peer receipt → release identity; Docker failure/restart → persistence/readiness; secret inputs → redacted evidence

## Scope

writeAllowed:

- `services/platform/deploy/compose/README.md` (MODIFY)
- `services/platform/src/deploy/verify-production.ts` (MODIFY)
- `services/platform/src/cli/holo.ts` (MODIFY)
- `services/platform/tests/integration/service/health-readiness.test.ts` (MODIFY)
- `.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/**` (NEW, redacted evidence only)
- `.tmp/D08-09/**` (GENERATED, gitignored)

writeProhibited:

- Tailscale ACL/device policy, Funnel, Dockerfile, Compose service graph, client source, secrets/raw responses/environments, volume deletion/recreation, and any file not listed above.

## Boundaries

✅ Always:

- Drive both nodes through their own real entrypoints and record independently timestamped outputs.
- Use secure operator-local secret loading; evidence stores only hashes/counts/status and redacted identifiers.
- Put Postgres recovery and Mastra restart cleanup in fail-safe traps/finally paths.
- Reject stale receipts, mismatched target/generation/digest, peer count other than two, and evidence older than the drill window.

⚠️ Ask first:

- Which authorized second device and remote execution mechanism to use; this is a human/operator choice and must not be guessed.
- Stopping production Postgres, restarting Mastra, or scheduling the actual drill window.

## Rollback plan

If any negative or recovery path fails, restore Postgres and all Compose services, reapply/verify background private Serve, retain named volumes, run D08-07 receipt verification, and leave D08-05 blocked. The evidence remains a failed immutable record; never rewrite failure as pass.

Files to revert: only documentation, verifier/CLI/test changes; evidence is retained as audit history unless a separate retention policy authorizes removal.

## Deliverable

- Operator runbook section for a two-real-device drill.
- Optional verifier/CLI support for redacted remote-peer evidence.
- Real readiness integration check and sealed D08-09 evidence artifact.
- D08-05 dependency amended so Convex deletion cannot proceed without this pass.

## Agent instructions

1. Confirm D08-06 through D08-08 are approved and their exact receipt/generation is the drill target.
2. Request explicit human selection of node B and a drill window before disruptive operations; do not choose or reboot devices autonomously.
3. Run positive and negative controls through real Tailscale/Docker/HTTP/MCP boundaries with fail-safe recovery.
4. Redact before write, then scan evidence with seeded canaries and assert `raw_environment_present=false`.
5. Run scenario validator, artifact jq checks, integration/typecheck/lint, and scope diff; report blocked if a real second device or credential is unavailable.

## Reading list

1. `services/platform/src/deploy/verify-production.ts:210-268,288-542,545-730` [PRIMARY PATTERN] — dependency, restart/sentinel, MCP, and identity negatives.
2. `services/platform/src/http/deployment-identity.ts:147-310` — external non-loopback identity verification.
3. `services/platform/deploy/compose/README.md` — D08-07/D08-08 operator path to extend.
4. `services/platform/tests/integration/service/health-readiness.test.ts:18-86` — real readiness and secret-output assertions.
5. `.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/D08-05-delete-the-convex-cloud-deployment-operator-executed-irreversible.md` — irreversible downstream gate.

## Evidence gates

1. All four multi-node scenarios pass the deterministic fakeability validator; topology is `multi-node` and both real device entrypoints appear.
2. The JSON artifact passes all four exact jq commands and includes non-empty digest/generation/timestamps/identity hashes.
3. Real peer health/MCP output and server Docker/Tailscale output are independently captured; no mock/static response is accepted.
4. Cleanup verification shows Postgres/Compose/Serve recovered and both sentinels remain.
5. Credential-canary scan, full integration/typecheck/lint, and scope diff pass; D08-05 remains blocked otherwise.

## Out of scope

- Automatic peer provisioning, ACL/device policy changes, Funnel/public ingress, third devices, HA/replication, client builds, and unrelated services.
- Convex deletion itself (D08-05, still explicit human-only and irreversible).

## Review

Must pass: two real nodes, private-only port 44111, exact service/readiness/MCP/restart/sentinel counts, three biting negatives, cleanup recovery, zero credentials.

Should verify: peer identity is privacy-preserving but stable; evidence cannot be replayed across generations; remote command syntax does not leak secrets; failure evidence cannot be rewritten as success.

Verdict: `APPROVED | NEEDS_FIXES`

## Dependencies

- Depends on: D08-08; an authorized second real tailnet device; operator-approved drill window; live scoped MCP credential.
- Blocks: D08-05 irreversible Convex cloud deletion.
- Parallel: none.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-09",
  "proposed_by":"devops-engineer",
  "source_scope":"/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json",
  "source_requirement_map":{"AC-1":"IMP-AC-5","AC-2":"IMP-AC-11","AC-3":"IMP-AC-18","AC-4":"IMP-AC-19"},
  "touches_capabilities":["CAP-DEP-01","CAP-BAK-01"],
  "provides":["two-node-private-reachability-gate","cross-tailnet-recovery-evidence"],
  "consumes":["D08-08 lifecycle proof","authorized second tailnet device","scoped MCP credential","D08-07 deployment receipt"],
  "boundary_contracts":["Tailscale Serve node A to authorized peer node B","peer receipt to immutable release identity","Docker failure and restart to persistence and readiness","secret inputs to redacted evidence"],
  "loc_budget":140,
  "tdd_mode":"skipped",
  "verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},
  "fixtures":{"tailnet_drill":{"description":"Serving device holocron plus an authorized second real device on the same tailnet, with the four-service release running and non-empty Postgres/blob sentinels.","seed_method":"recorded_external","records":["two real devices are driven through their own Tailscale and curl entrypoints","Serve HTTPS port 44111 targets http://127.0.0.1:44111","Postgres sentinel rows 1","blob sentinel objects 1"]}},
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN device A holocron and authorized real device B WHEN B calls private Serve HTTPS 44111 THEN health is 200 and Funnel is false.","verify":"jq -e '.real_device_count == 2 and .serve_https_port == 44111 and .second_device_health_status == 200 and .funnel_enabled == false' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":null,"scenario":{"id":"IMP-AC-5","primary":true,"tier":"visible","test_tier":"e2e","topology":"multi-node","verification_service":"Tailscale Serve on holocron and curl on a second real device","negative_control":{"would_fail_if":["the second real device is disconnected","Serve is a static URL","Funnel state is omitted"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"tailnet_drill","action":{"actor":"api_client","steps":["configure Serve on device A holocron, then drive the second real device B through curl to the tailnet FQDN on HTTPS port 44111"]},"end_state":{"must_observe":["real_device_count=2","serve_https_port=44111","second_device_health_status=200","funnel_enabled='false'"],"must_not_observe":["real_device_count=0","second_device_health_status=0","empty Serve URL"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN the four-service deployment WHEN node A drives Postgres recovery and node B drives health and MCP THEN services=4, statuses=503/200, sentinels=1/1, and tools=44.","verify":"jq -e '.healthy_service_count == 4 and .postgres_down_health_status == 503 and .recovered_health_status == 200 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .mcp_tool_count == 44' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":null,"scenario":{"id":"IMP-AC-11","primary":false,"tier":"visible","test_tier":"e2e","topology":"multi-node","verification_service":"Docker Compose, Postgres, Holocron HTTP/MCP, Tailscale Serve, and second real device","negative_control":{"would_fail_if":["a service is omitted","Postgres failure is mocked","the second real device is disconnected","MCP discovery is stubbed"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"tailnet_drill","action":{"actor":"api_client","steps":["from device A drive Docker failure/recovery and from second real device B drive private health and authenticated MCP discovery"]},"end_state":{"must_observe":["healthy_service_count=4","postgres_down_health_status=503","recovered_health_status=200","postgres_sentinel_rows=1","blob_sentinel_objects=1","mcp_tool_count=44"],"must_not_observe":["healthy_service_count=0","mcp_tool_count=0","empty readiness evidence"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"GIVEN non-empty sentinels WHEN node A restarts Mastra and node B repeats Serve checks THEN restart>=1, services=4, sentinels=1/1, and Funnel endpoints=0.","verify":"jq -e '.real_device_count == 2 and .healthy_service_count == 4 and .mastra_restart_count >= 1 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .funnel_endpoint_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":null,"scenario":{"id":"IMP-AC-18","primary":false,"tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"two real Tailscale devices and four-service Docker deployment","negative_control":{"would_fail_if":["the second real device is not driven","Mastra restart is omitted","sentinel persistence is mocked","Funnel status is a static claim"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"tailnet_drill","action":{"actor":"api_client","steps":["drive device A through Mastra restart and drive second real device B through private Serve before and after restart"]},"end_state":{"must_observe":["real_device_count=2","healthy_service_count=4","mastra_restart_count>=1","postgres_sentinel_rows=1","blob_sentinel_objects=1","funnel_endpoint_count=0"],"must_not_observe":["real_device_count=0","healthy_service_count=0","empty post-restart response"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"GIVEN the two-node drill WHEN unreachable Serve, wrong identity, missing Postgres, and evidence scan run THEN each negative rejects once and credential count is zero.","verify":"jq -e '.unreachable_serve_rejection_count == 1 and .wrong_identity_rejection_count == 1 and .missing_dependency_rejection_count == 1 and .credential_value_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":null,"scenario":{"id":"IMP-AC-19","primary":false,"tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"two real Tailscale devices, deployment identity verifier, Docker dependency probe, and evidence redactor","negative_control":{"would_fail_if":["negative controls are omitted","the second real device is disconnected","wrong identity is accepted","credential scanning is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"tailnet_drill","action":{"actor":"api_client","steps":["drive second real device B against an unreachable Serve URL, then drive wrong identity and missing Postgres dependency controls and scan all evidence"]},"end_state":{"must_observe":["unreachable_serve_rejection_count=1","wrong_identity_rejection_count=1","missing_dependency_rejection_count=1","credential_value_count=0"],"must_not_observe":["unreachable_serve_rejection_count=0","wrong_identity_rejection_count=0","missing_dependency_rejection_count=0","credential_value_count>=1","empty negative-control evidence"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Two real tailnet devices prove private HTTPS 44111 health 200 and Funnel false.","verify":"jq -e '.real_device_count == 2 and .serve_https_port == 44111 and .second_device_health_status == 200 and .funnel_enabled == false' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Four services, Postgres 503/recovery 200, sentinels 1/1, and authenticated MCP 44 tools are observed.","verify":"jq -e '.healthy_service_count == 4 and .postgres_down_health_status == 503 and .recovered_health_status == 200 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .mcp_tool_count == 44' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Mastra restart recovery retains services and sentinels while Funnel endpoint count remains zero.","verify":"jq -e '.real_device_count == 2 and .healthy_service_count == 4 and .mastra_restart_count >= 1 and .postgres_sentinel_rows == 1 and .blob_sentinel_objects == 1 and .funnel_endpoint_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Unreachable Serve, wrong identity, and missing dependency reject once and credential count is zero.","verify":"jq -e '.unreachable_serve_rejection_count == 1 and .wrong_identity_rejection_count == 1 and .missing_dependency_rejection_count == 1 and .credential_value_count == 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json","maps_to_ac":"AC-4"}
  ]
}
-->
</details>
