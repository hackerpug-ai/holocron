# D08-07 — Portable host preflight, receipt, and private Serve verification

> **Task ID:** D08-07
> **Sprint:** [Sprint 32 — Convex Decommission and Portable Holocron Handoff](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `security-reviewer`
> **Estimate:** 1 day
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** L
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Verification policy:** tests=true · red=true · seeded=true
> **Scope:** `/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json` (binding strategic option)
> **LOC budget:** 300 of 1080 aggregate
> Status: Backlog

**Capabilities:** CAP-DEP-01
**Binding requirements:** IMP-AC-7, IMP-AC-10, IMP-AC-12, IMP-AC-13, IMP-AC-14, IMP-AC-15

## What this does

Adds the reusable operator control plane around D08-06: non-mutating Mac/Docker/Tailscale preflight, explicit deployment authorization, a redacted receipt, private Tailscale Serve on HTTPS port 44111, and receipt-driven verification.

## Why

Portable Compose is insufficient without proving the host can run it, separating Docker Desktop VM allocation from container limits, preserving host headroom, validating secret paths, and binding verification to the exact running deployment. The current CLI instead derives a LAN IP, assumes `inference1`, and passes runtime secrets through inherited process environment.

## How to verify

On an authorized M1 host, preflight must report nine named checks with zero Docker mutations. An authorized deployment must write a non-secret receipt for `holocron`, port 44111, four services, two volumes, the immutable image, memory selection, and generation. Verification must reject identity/image/memory drift.

## Scope

Extends the existing deploy modules, CLI, compatibility script, documentation, and integration tests. It does not perform the cold-host/reboot drill or require the second real tailnet device; those are D08-08 and D08-09.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```text
================================================================================
TASK: D08-07 - Portable host preflight, receipt, and private Serve verification
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=devops-engineer | reviewer=security-reviewer
TDD_MODE:   red_first

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts services/platform/tests/integration/service/health-readiness.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/deploy/production-deploy.ts services/platform/src/deploy/production-release.ts services/platform/src/deploy/verify-production.ts services/platform/src/http/deployment-identity.ts services/platform/src/cli/holo.ts services/platform/tests/integration/sprint29-deployment.test.ts services/platform/tests/integration/service/health-readiness.test.ts

PROGRESS: 0/6 ACs complete
```

## Outcome

An operator can preflight, authorize, deploy, receipt, privately Serve, and verify a portable Holocron release without exposing a public port or credential value.

## 🚫 Critical constraints

- NEVER mutate Docker, Compose, Tailscale Serve, volumes, or runtime state during `deploy:preflight`; report every failed check together and fail closed.
- NEVER enable or invoke Tailscale Funnel, change tailnet ACLs, or bind the backend beyond `127.0.0.1:44111`; private Serve listens on HTTPS 44111.
- NEVER log secret values, raw child environments, authorization headers, private runtime JSON, or unredacted command errors/receipts.
- NEVER accept symlinked, non-regular, unsafe-permission/ownership, or out-of-store secret paths; canonicalize first and mount only validated files read-only.
- NEVER treat 50 GiB as a default/minimum: it is the aggregate container ceiling; the Docker VM and physical Mac need separate overhead/headroom checks.

## Done when

- [ ] The six local ACs are GREEN and trace to the six binding `IMP-AC-*` requirements.
- [ ] `holo deploy:preflight --target holocron --port 44111 --json` is reusable and non-mutating, reporting all nine named dimensions.
- [ ] Private Serve is applied only after authorization using the supported equivalent of `tailscale serve --bg --https=44111 http://127.0.0.1:44111`; `tailscale serve status --json` proves no Funnel.
- [ ] The deployment receipt is non-secret and records host, port, Serve URL, digest/revision, four services, two volumes, limits, and generation.
- [ ] Receipt-driven verification rejects live identity, immutable metadata, service/volume, port/Serve, or memory drift; full tests/typecheck/lint pass.

## Acceptance criteria

### AC-1 — Docker VM allocation and host headroom are separate [PRIMARY]

`SOURCE_REQUIREMENT: IMP-AC-7` — Documentation and preflight separately cover Docker Desktop's macOS Linux-VM memory allocation: it must be sufficient for the selected container-limit sum while preserving host headroom, and smaller hosts use lower configured limits rather than attempting 50 GiB.

GIVEN a 64 GiB Mac, selected container sum 50 GiB, Docker VM 54 GiB, and required host headroom 8 GiB, WHEN real Docker/macOS memory is queried, THEN the selection passes; insufficient VM or host headroom requires lower limits.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker Desktop engine and macOS host preflight
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-7 Docker VM and host headroom`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-7'`
- SCENARIO: observe sum 50, VM 54, required headroom 8, observed headroom 10, and smaller-host lowering; reject zero/empty memory observations.

### AC-2 — Operator documentation is executable and complete

`SOURCE_REQUIREMENT: IMP-AC-10` — Operator documentation covers ARM64 prerequisites, immutable digest packaging, secret injection, loopback port 44111, private Serve lifecycle, persistence, memory sizing, rollback preflight, and real deployment verification.

GIVEN the portable operator runbook, WHEN every machine-checkable command is executed, THEN it names external HTTPS port 44111, four services, two volumes, and at least one non-destructive rollback preflight.

- TEST_TIER: integration
- VERIFICATION_SERVICE: operator documentation contract test
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-10 portable operator runbook contract`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-10'`
- SCENARIO: execute documented commands; reject empty verification, zero service/volume counts, stale LAN exposure, or destructive rollback.

### AC-3 — Host preflight is comprehensive and non-mutating

`SOURCE_REQUIREMENT: IMP-AC-12` — A reusable non-mutating host preflight checks Docker/Compose, linux/arm64 compatibility, target validity, loopback port, Tailscale Serve, secret paths, volumes, container-memory sum, and Docker Desktop VM memory sufficiency/headroom.

GIVEN a candidate host and release, WHEN preflight runs, THEN nine named dimensions are reported, at least one secret path is validated, HTTPS port 44111 is available, and Docker mutation count remains zero.

- TEST_TIER: integration
- VERIFICATION_SERVICE: `holo` preflight with Docker and Tailscale
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-12 reusable non-mutating host preflight`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-12'`
- SCENARIO: observe `preflight_check_count=9`, `docker_mutation_count=0`, validated paths, port 44111; reject empty results or any mutation.

### AC-4 — Deployment receipt binds the exact release

`SOURCE_REQUIREMENT: IMP-AC-13` — The deploy command writes a non-secret receipt recording target host, loopback port, private Serve URL, immutable image identity, exact four services, named volumes, selected memory allocation, and generation.

GIVEN explicit authorization and passing preflight, WHEN deployment completes, THEN the receipt records `holocron`, port 44111, four services, two volumes, digest/revision/generation/memory, and zero credential values.

- TEST_TIER: integration
- VERIFICATION_SERVICE: `holo` deploy receipt writer and Docker Compose
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-13 non-secret portable deployment receipt`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-13'`
- SCENARIO: compare receipt to real containers; reject zero counts, empty digest, inherited environment, or credential values.

### AC-5 — One command verifies receipt, Serve, and live state

`SOURCE_REQUIREMENT: IMP-AC-14` — One-command verification consumes the receipt, checks the private Serve URL and all readiness dimensions, and fails closed if identity, immutable metadata, or memory contract differs from the running deployment.

GIVEN the authorized receipt, WHEN `deploy:verify` compares the private Serve response and Docker state, THEN at least eight verification dimensions pass and wrong identity or memory drift is rejected.

- TEST_TIER: integration
- VERIFICATION_SERVICE: `holo` deploy verification and private Serve endpoint
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/service/health-readiness.test.ts`
- TEST_FUNCTION: `IMP-AC-14 receipt-driven private verification`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-14'`
- SCENARIO: observe ≥8 dimensions, health 200, identity/memory drift rejection; reject empty receipt metadata or disconnected Serve.

### AC-6 — Authorization and redaction gate every mutation

`SOURCE_REQUIREMENT: IMP-AC-15` — Preflight, receipt, and verification retain explicit authorization before mutating Docker state and never print secret values.

GIVEN unauthorized and authorized invocations, WHEN preflight/deploy/verify and evidence scans run, THEN pre-authorization Docker mutations and credential matches both equal zero while the authorized deployment succeeds.

- TEST_TIER: integration
- VERIFICATION_SERVICE: `holo` deploy authorization and redaction pipeline
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-15 authorization and zero-value leakage`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-15'`
- SCENARIO: scan stdout/stderr/receipt/evidence; reject an unauthorized mutation, inherited environment dump, empty scan, or any credential value.

## Test criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | Real Docker/macOS memory proves 50/54/64 GiB is viable with ≥8 GiB host headroom and smaller hosts must lower limits. | AC-1 / IMP-AC-7 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-7'` |
| TC-2 | The runbook contains executable ARM64/image/secret/port/Serve/persistence/memory/rollback/verification instructions. | AC-2 / IMP-AC-10 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-10'` |
| TC-3 | Preflight reports nine checks and zero Docker/Tailscale mutations. | AC-3 / IMP-AC-12 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-12'` |
| TC-4 | Receipt values match real Docker/Serve state and contain no credential values. | AC-4 / IMP-AC-13 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-13'` |
| TC-5 | Receipt-driven verification passes ≥8 dimensions and rejects identity/memory drift. | AC-5 / IMP-AC-14 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-14'` |
| TC-6 | Unauthorized mutation count and credential-value matches both remain zero. | AC-6 / IMP-AC-15 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-15'` |

## Fixtures

`authorized_host_preflight` (`seed_method: cli`): authorized M1 host named `holocron`; Docker Desktop VM 54 GiB; physical memory 64 GiB; selected limit sum 50 GiB; valid digest lock; approved secret paths; two named volumes; Serve HTTPS port 44111.

## Capability chain

- touches_capabilities: `CAP-DEP-01`
- consumes: D08-06 portable Compose/identity/memory/secret contract
- provides: non-mutating host preflight, private Serve configuration, deployment receipt, receipt-driven verifier
- boundary_contracts: operator authorization → Docker/Tailscale mutation; secret store → canonical read-only paths; receipt → live Docker/Serve identity; container limits → Docker VM/host capacity

## Scope

writeAllowed:

- `services/platform/deploy/compose/README.md` (MODIFY)
- `services/platform/src/deploy/production-deploy.ts` (MODIFY)
- `services/platform/src/deploy/production-release.ts` (MODIFY)
- `services/platform/src/deploy/verify-production.ts` (MODIFY)
- `services/platform/src/http/deployment-identity.ts` (MODIFY)
- `services/platform/src/cli/holo.ts` (MODIFY)
- `scripts/deploy-inference1.sh` (MODIFY; retain backward-compatible filename, remove host lock)
- `services/platform/tests/integration/sprint29-deployment.test.ts` (MODIFY)
- `services/platform/tests/integration/service/health-readiness.test.ts` (MODIFY)

writeProhibited:

- Dockerfile/root `.dockerignore`, client source, Tailscale ACL configuration, Funnel, secret values, durable volume deletion, and any file not listed above

## Boundaries

✅ Always:

- Keep `scripts/deploy-inference1.sh` as a compatibility entrypoint but derive target/base URL from validated portable inputs; never derive a LAN address.
- Use the installed Tailscale 1.52+ Serve grammar and verify status JSON; apply background HTTPS 44111 only after explicit authorization.
- Verify Docker Engine memory from the real daemon and physical memory from macOS; require ≥4 GiB VM overhead above selected limits and ≥8 GiB physical-host headroom.
- Aggregate errors without values and retain the existing `--authorize` fail-closed posture.

⚠️ Ask first:

- Adding dependencies, modifying tailnet policy, changing the port or memory safety thresholds, or automatically adjusting Docker Desktop settings.
- Removing the compatibility script or changing existing receipt consumers without a migration path.

## Deliverable

- CLI/modules: preflight, portable authorized apply, non-secret receipt, and receipt-driven verify.
- Docs/script: exact private Serve and M1 operator path, no LAN exposure.
- Tests: real Docker/Tailscale/filesystem checks and negative controls for capacity, path safety, authorization, identity, memory, and redaction.

## Agent instructions

1. Write each filtered integration test and capture real assertion RED before implementation.
2. Implement `deploy:preflight` as read-only; explicitly enumerate the nine checks in JSON so absent checks cannot pass.
3. Apply private Serve only on authorized deployment and verify its JSON status. Never call `tailscale funnel` or mutate ACLs.
4. Extend receipts and verification without persisting runtime secret paths that reveal store layout unnecessarily and without any values.
5. Run filtered tests, the full two-file lane, typecheck, lint, and a secret-value scan seeded with known canaries.

## Reading list

1. `services/platform/src/deploy/production-deploy.ts:279-307,380-627` [PRIMARY PATTERN] — current override, port, authorization, mutation, and receipt flow.
2. `services/platform/src/deploy/verify-production.ts:145-208,210-268,545-730` — receipt matching, readiness, negatives, and evidence.
3. `services/platform/src/http/deployment-identity.ts:1-146` — server-owned identity and hostname validation.
4. `services/platform/src/cli/holo.ts:1310-1360` — existing deploy apply/verify public CLI.
5. `scripts/deploy-inference1.sh:72-89` — LAN/inference1 coupling to remove while retaining compatibility.

## Evidence gates

1. Six validated scenarios and six AC/TC pairs; each has real RED then GREEN evidence.
2. Preflight output shows nine checks and zero mutations; a command-ledger negative control proves no `docker compose up` or `tailscale serve` call.
3. Receipt and live verification show exact host/port/services/volumes/digest/memory/generation values.
4. Secret canaries have zero matches across stdout, stderr, receipts, errors, and evidence; inherited environment is never serialized.
5. Full integration/typecheck/lint and scope diff pass.

## Out of scope

- Host reboot/bootstrap proof and automatic Docker Desktop configuration (D08-08).
- Authorized second-device tailnet drill (D08-09).
- ACL changes, Funnel/public ingress, HA, replication, Kubernetes, client builds, and Langfuse.

## Review

Must pass: non-mutating preflight; authorization before mutation; private Serve HTTPS 44111 to loopback; receipt/live-state binding; memory safety; zero secret leakage.

Should verify: canonical path checks resist symlink/race escapes; errors are redacted at every child-process boundary; no `process.env` serialization; Tailscale status proves Serve and not Funnel; lower-memory hosts remain supported.

Verdict: `APPROVED | NEEDS_FIXES`

## Dependencies

- Depends on: D08-06.
- Blocks: D08-08.
- Parallel: none; shared deploy/verify/CLI/test files require sequential execution.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-07",
  "proposed_by":"devops-engineer",
  "source_scope":"/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json",
  "source_requirement_map":{"AC-1":"IMP-AC-7","AC-2":"IMP-AC-10","AC-3":"IMP-AC-12","AC-4":"IMP-AC-13","AC-5":"IMP-AC-14","AC-6":"IMP-AC-15"},
  "touches_capabilities":["CAP-DEP-01"],
  "provides":["non-mutating-host-preflight","private-serve-configuration","portable-deployment-receipt","receipt-driven-verifier"],
  "consumes":["D08-06 portable runtime contract"],
  "boundary_contracts":["operator authorization to Docker and Tailscale mutation","secret store to canonical read-only paths","receipt to live deployment identity","container limits to Docker VM and host capacity"],
  "loc_budget":300,
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{"authorized_host_preflight":{"description":"Authorized M1 deployment host named holocron with Docker Desktop, Compose, Tailscale, a deployable digest lock, approved secret paths, and named volumes.","seed_method":"cli","records":["host architecture arm64","Docker VM memory 54 GiB","physical host memory 64 GiB","selected container limit sum 50 GiB","Serve HTTPS port 44111"]}},
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a 64 GiB Mac, 50 GiB selected limits, 54 GiB Docker VM, and 8 GiB required headroom WHEN real memory is queried THEN the selection passes and smaller hosts must lower limits.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-7'","maps_to_ac":null,"scenario":{"id":"IMP-AC-7","primary":true,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker Desktop engine and macOS host preflight","negative_control":{"would_fail_if":["Docker VM sizing is omitted","host headroom is a static success string","Docker is disconnected"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"cli_user","steps":["query real Docker and macOS memory, compare the selected limits, VM overhead, and host headroom"]},"end_state":{"must_observe":["container_limit_sum_gib=50","docker_vm_memory_gib=54","host_headroom_required_gib=8","host_headroom_observed_gib=10","smaller_host_lower_limits_required='true'"],"must_not_observe":["docker_vm_memory_gib=0","host_headroom_observed_gib=0","empty Docker memory observation"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN the portable runbook WHEN every machine-checkable command executes THEN port 44111, four services, two volumes, and rollback verification are proven.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-10'","maps_to_ac":null,"scenario":{"id":"IMP-AC-10","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"operator documentation contract test","negative_control":{"would_fail_if":["required runbook sections are omitted","commands are static placeholders","rollback verification is stubbed"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"cli_user","steps":["execute every machine-checkable runbook command through the documented operator path"]},"end_state":{"must_observe":["documented_external_https_port=44111","documented_service_count=4","documented_named_volume_count=2","documented_rollback_preflight_count>=1"],"must_not_observe":["documented_service_count=0","documented_named_volume_count=0","empty verification section"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"GIVEN a candidate host and release WHEN non-mutating preflight runs THEN nine checks, validated paths, port 44111, and zero Docker mutations are observed.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-12'","maps_to_ac":null,"scenario":{"id":"IMP-AC-12","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"holo deploy preflight with Docker and Tailscale","negative_control":{"would_fail_if":["a required host check is omitted","Docker or Tailscale calls are mocked","invalid secret paths are hardcoded as accepted"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"cli_user","steps":["run the reusable non-mutating host preflight against real Docker, Compose, filesystem, ports, volumes, memory, and Tailscale"]},"end_state":{"must_observe":["preflight_check_count=9","docker_mutation_count=0","validated_secret_path_count>=1","serve_https_port=44111"],"must_not_observe":["preflight_check_count=0","docker_mutation_count>=1","empty secret path result"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"GIVEN authorization and passing preflight WHEN deployment completes THEN the receipt binds holocron, port 44111, four services, two volumes, immutable identity, memory, and zero credentials.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-13'","maps_to_ac":null,"scenario":{"id":"IMP-AC-13","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"holo deploy receipt writer and Docker Compose","negative_control":{"would_fail_if":["the receipt is an empty static file","running metadata is omitted","a credential is hardcoded into evidence"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"cli_user","steps":["perform an authorized deployment and inspect the generated non-secret receipt against running Docker state"]},"end_state":{"must_observe":["receipt_host='holocron'","receipt_loopback_port=44111","receipt_service_count=4","receipt_named_volume_count=2","receipt_credential_value_count=0"],"must_not_observe":["receipt_service_count=0","receipt_named_volume_count=0","empty image digest"]}}]}},
    {"id":"AC-5","type":"acceptance_criterion","primary":false,"description":"GIVEN the receipt WHEN one-command verification compares private Serve and Docker state THEN at least eight dimensions pass and identity or memory drift fails.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-14'","maps_to_ac":null,"scenario":{"id":"IMP-AC-14","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"holo deploy verification and private Serve endpoint","negative_control":{"would_fail_if":["receipt consumption is omitted","identity comparison is stubbed","the private endpoint is disconnected"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"api_client","steps":["run one-command verification using the receipt and compare live Serve, identity, image, service, volume, and memory metadata"]},"end_state":{"must_observe":["verification_dimension_count>=8","serve_health_status=200","identity_mismatch_rejected='true'","memory_drift_rejected='true'"],"must_not_observe":["verification_dimension_count=0","serve_health_status=0","empty receipt metadata"]}}]}},
    {"id":"AC-6","type":"acceptance_criterion","primary":false,"description":"GIVEN unauthorized and authorized paths WHEN deploy and evidence scans run THEN pre-authorization mutation and credential-value counts are zero while authorized deployment succeeds.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-15'","maps_to_ac":null,"scenario":{"id":"IMP-AC-15","primary":false,"tier":"holdout","test_tier":"integration","topology":"single-node","verification_service":"holo deploy authorization and redaction pipeline","negative_control":{"would_fail_if":["authorization is omitted","process environment is dumped","credential redaction is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"authorized_host_preflight","action":{"actor":"cli_user","steps":["run unauthorized and authorized preflight/deploy/verify paths and scan stdout, stderr, receipt, and evidence"]},"end_state":{"must_observe":["docker_mutation_count_before_authorization=0","credential_value_count=0","authorized_deployment='true'"],"must_not_observe":["unauthorized_docker_mutation_count>=1","credential_value_count>=1","empty redaction scan"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Real Docker and macOS observations enforce VM overhead, host headroom, and lower limits on smaller hosts.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-7'","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"The operator runbook contains executable ARM64, image, secret, port, Serve, persistence, memory, rollback, and verification steps.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-10'","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Preflight reports nine required dimensions with zero Docker mutations.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-12'","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"The receipt matches live host, port, release, services, volumes, memory, generation, and contains zero credential values.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-13'","maps_to_ac":"AC-4"},
    {"id":"TC-5","type":"test_criterion","description":"One-command verification passes at least eight live dimensions and rejects identity or memory drift.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-14'","maps_to_ac":"AC-5"},
    {"id":"TC-6","type":"test_criterion","description":"Unauthorized mutation and credential-value counts are zero while explicitly authorized deployment succeeds.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-15'","maps_to_ac":"AC-6"}
  ]
}
-->
</details>
