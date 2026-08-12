# D08-06 — Portable ARM64 private Compose runtime contract

> **Task ID:** D08-06
> **Sprint:** [Sprint 32 — Convex Decommission and Portable Holocron Handoff](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Reviewer:** `mastra-reviewer`
> **Estimate:** 1–2 days
> **Type:** FEATURE
> **Priority:** P0 · **Effort:** L
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Verification policy:** tests=true · red=true · seeded=true
> **Scope:** `/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json` (binding strategic option)
> **LOC budget:** 420 of 1080 aggregate
> Status: Backlog

**Capabilities:** CAP-DEP-01
**Binding requirements:** IMP-AC-1, IMP-AC-2, IMP-AC-3, IMP-AC-4, IMP-AC-6, IMP-AC-8, IMP-AC-9

## What this does

Turns the existing production Compose release from an `inference1`-only LAN deployment into a validated ARM64 server runtime for any compatible Mac, with `holocron` as the default example, one loopback backend port, a configurable ≤50 GiB container budget, and file-backed secret handling.

## Why

The image and exact four-service graph already exist, but the deployment record is typed to `inference1`, the generated override publishes Mastra on `0.0.0.0`, memory is unbounded, and the current secret path is not subject to the binding canonical-path security checks. Those defects prevent a safe portable M1 deployment.

## How to verify

Run the two real integration files with Docker enabled. The rendered deployment must report `linux/arm64`, host `holocron`, exactly four services, only `127.0.0.1:44111` for Mastra, two named volumes, a 50 GiB accepted ceiling, 51 GiB rejected, and zero credential literals.

## Scope

Only the Compose/runtime contract, deployment identity/release logic, and their existing Sprint 29 integration tests are modified. The Dockerfile and root `.dockerignore` remain unchanged; Tailscale lifecycle and live cross-tailnet proof belong to D08-07 through D08-09.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```text
================================================================================
TASK: D08-06 - Portable ARM64 private Compose runtime contract
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
TDD_MODE:   red_first

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts services/platform/tests/integration/sprint29-deployment.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/src/deploy/production-deploy.ts services/platform/src/deploy/production-release.ts services/platform/src/http/deployment-identity.ts services/platform/tests/integration/sprint29-compose-contract.test.ts services/platform/tests/integration/sprint29-deployment.test.ts

PROGRESS: 0/7 ACs complete
```

## Outcome

A digest-pinned server-only `linux/arm64` release runs the exact four services on any validated host while exposing only loopback port 44111 and enforcing a configurable ≤50 GiB stack limit.

## 🚫 Critical constraints

- NEVER change `services/platform/Dockerfile` or root `.dockerignore`; the existing server-only image boundary is binding.
- NEVER publish Mastra, Postgres, or Zero on `0.0.0.0`; Mastra's only host publication is `127.0.0.1:44111`.
- NEVER bake, render, log, or receipt credential values; never serialize inherited `process.env` into output or evidence.
- NEVER accept a secret path until canonical `realpath` checks prove it is a regular non-symlink file inside the operator-approved store with safe ownership/permissions; mount it read-only.
- NEVER delete/recreate named Postgres/blob volumes or expand the graph beyond `postgres`, `mastra`, `scheduler`, and `zero-cache`.

## Done when

- [ ] All seven task-local ACs are GREEN against real Docker/Compose behavior and map one-to-one to their binding `IMP-AC-*` source requirements.
- [ ] A 50 GiB per-container limit sum renders successfully; 51 GiB, zero, negative, malformed, or missing allocations fail before `docker compose up`.
- [ ] The generated override contains one Mastra publication, `127.0.0.1:44111:4111`, and no non-loopback publication.
- [ ] `holocron` and another valid hostname pass; invalid hostnames and amd64-only images fail closed.
- [ ] Runtime tests, typecheck, lint, and the scenario validator pass; only `writeAllowed` files change.

## Acceptance criteria

Each local `AC-N` preserves the exact binding source requirement shown in `SOURCE_REQUIREMENT` and owns one `TC-N`.

### AC-1 — Server-only ARM64 artifact remains [PRIMARY]

`SOURCE_REQUIREMENT: IMP-AC-1` — The existing server-only Bun Docker image remains the deployment artifact; Dockerfile and root Docker ignore policy remain unchanged and continue excluding Expo/mobile/client source, environment files, secrets, keys, and mutable runtime data.

GIVEN the clean release candidate, WHEN the real root-context image is built for `linux/arm64` and its OCI archive is inspected, THEN the Bun server entrypoint exists and forbidden client/secret/runtime entries total zero.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker BuildKit and OCI archive
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-compose-contract.test.ts`
- TEST_FUNCTION: `IMP-AC-1 server-only ARM64 artifact remains`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-1'`
- SCENARIO: start `portable_runtime_candidate`; observe `platform='linux/arm64'`, `server_entrypoint='bun src/index.ts'`, `forbidden_client_entry_count=0`; reject an empty archive or amd64-only result.

### AC-2 — Host target and identity are portable

`SOURCE_REQUIREMENT: IMP-AC-2` — Deployment target and identity accept a validated configurable host name for any compatible machine; holocron is the documented default/example, not a type literal or the only accepted target.

GIVEN the real deploy control plane, WHEN preflight evaluates `holocron`, `edge-m1`, and `bad_host!`, THEN both valid hosts are accepted and the invalid hostname is rejected without an `inference1` type literal.

- TEST_TIER: integration
- VERIFICATION_SERVICE: `holo` deploy control plane
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-2 portable host identity`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-2'`
- SCENARIO: observe `accepted_host='holocron'`, `accepted_host='edge-m1'`, `rejected_host='bad_host!'`; reject empty identity and inference1-only behavior.

### AC-3 — Apple-silicon compatibility fails closed

`SOURCE_REQUIREMENT: IMP-AC-3` — Preflight requires a linux/arm64 image manifest for Apple-silicon hosts and rejects an incompatible image before deployment; Docker Compose remains the supported packaging/runtime path.

GIVEN an immutable release digest, WHEN Docker Buildx manifest inspection and host preflight run, THEN at least one `linux/arm64` manifest is observed and an amd64-only candidate is rejected before mutation.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker Buildx manifest inspection
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-compose-contract.test.ts`
- TEST_FUNCTION: `IMP-AC-3 ARM64 manifest preflight`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-3'`
- SCENARIO: observe `required_platform='linux/arm64'`, `compatible_manifest_count>=1`, and explicit amd64-only rejection; reject an empty manifest response.

### AC-4 — Exactly one loopback server port

`SOURCE_REQUIREMENT: IMP-AC-4` — The Mastra container publishes only 127.0.0.1:44111 on the serving host; Postgres and Zero remain loopback-only and no second server port is published.

GIVEN the generated production override, WHEN the real Compose configuration is rendered, THEN Mastra publishes exactly `127.0.0.1:44111:4111` and no application port binds a non-loopback address.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker Compose rendered configuration
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-4 one loopback server port`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-4'`
- SCENARIO: observe one published server port and `non_loopback_publish_count=0`; reject `0.0.0.0:44111` and an empty port list.

### AC-5 — Container memory sum is bounded at 50 GiB

`SOURCE_REQUIREMENT: IMP-AC-6` — Compose exposes configurable per-container runtime memory limits whose configured sum is at most 50 GiB; invalid, non-positive, or over-budget allocations fail before docker compose up.

GIVEN configurable limits for all four services, WHEN preflight renders 50 GiB and attempts 51 GiB, zero, negative, malformed, or omitted values, THEN only the valid ≤50 GiB plan reaches Compose rendering.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker Compose memory contract
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-compose-contract.test.ts`
- TEST_FUNCTION: `IMP-AC-6 configurable 50 GiB memory ceiling`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-6'`
- SCENARIO: observe `memory_limit_sum_gib=50`, `over_budget_51_gib_rejected='true'`, `nonpositive_0_gib_rejected='true'`; reject an empty plan.

### AC-6 — Exact four-service persistence and migration graph

`SOURCE_REQUIREMENT: IMP-AC-8` — The exact postgres, mastra, scheduler, and zero-cache graph remains required, keeps named Postgres/blob volumes and Docker secret-file injection, and runs db:migrate before Mastra serves.

GIVEN the production Compose contract, WHEN it renders and starts against real Docker, THEN exactly four services and two named volumes exist, Docker secrets are file-backed, and migration precedes the Mastra server.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker Compose four-service runtime
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-compose-contract.test.ts`
- TEST_FUNCTION: `IMP-AC-8 exact graph persistence migration`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-8'`
- SCENARIO: observe `service_count=4`, the exact ordered names, `named_volume_count=2`, and `migration_before_server='true'`; reject empty storage/dependencies.

### AC-7 — Scoped auth and secret-safe mounts remain

`SOURCE_REQUIREMENT: IMP-AC-9` — Scoped-key authorization for API, MCP, and blobs remains unchanged; deployment does not bake credential values into the image, Compose literals, receipts, or logs.

GIVEN operator-approved secret files and scoped keys, WHEN Compose renders and authenticated/unauthenticated MCP probes run, THEN at least one read-only secret mount exists, literal credential count is zero, and the status pair is 200/401.

- TEST_TIER: integration
- VERIFICATION_SERVICE: Docker secret mounts and authenticated Holocron API
- TDD_STATE: none
- TEST_FILE: `services/platform/tests/integration/sprint29-deployment.test.ts`
- TEST_FUNCTION: `IMP-AC-9 scoped auth and secret-safe mounts`
- VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-9'`
- SCENARIO: observe `read_only_secret_mount_count>=1`, `credential_value_literal_count=0`, `authenticated_mcp_status=200`, `unauthenticated_mcp_status=401`; reject an empty path list or any literal.

## Test criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | The real ARM64 image archive contains the Bun server and zero forbidden client/secret/runtime entries. | AC-1 / IMP-AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-1'` |
| TC-2 | `holocron` and `edge-m1` are valid deployment identities while `bad_host!` fails. | AC-2 / IMP-AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-2'` |
| TC-3 | Docker manifest preflight accepts `linux/arm64` and rejects amd64-only before mutation. | AC-3 / IMP-AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-3'` |
| TC-4 | Rendered Compose has exactly one Mastra publication at `127.0.0.1:44111`. | AC-4 / IMP-AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-4'` |
| TC-5 | 50 GiB passes and every invalid/non-positive/51 GiB allocation fails pre-mutation. | AC-5 / IMP-AC-6 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-6'` |
| TC-6 | Compose starts exactly four services with two named volumes and migrate-before-serve. | AC-6 / IMP-AC-8 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-8'` |
| TC-7 | Secret mounts are read-only, literal values are absent, and scoped MCP auth returns 200/401. | AC-7 / IMP-AC-9 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-9'` |

## Fixtures

`portable_runtime_candidate` (`seed_method: cli`): clean ARM64 release candidate; existing server-only build context; exact four-service Compose graph; `holocron` target; port 44111; operator-approved secret files; 50 GiB ceiling.

## Capability chain

- touches_capabilities: `CAP-DEP-01`
- consumes: D06-06 immutable digest-qualified release and current four-service Compose contract
- provides: portable ARM64 Compose contract, configurable deployment identity, loopback publication contract, bounded memory contract
- boundary_contracts: OCI manifest → Apple-silicon host compatibility; operator secret store → read-only container mounts; Compose graph → loopback/persistence/migration invariants

## Scope

writeAllowed:

- `services/platform/deploy/compose/compose.yaml` (MODIFY)
- `services/platform/deploy/compose/production.env.example` (MODIFY; names/examples only)
- `services/platform/src/deploy/production-deploy.ts` (MODIFY)
- `services/platform/src/deploy/production-release.ts` (MODIFY)
- `services/platform/src/http/deployment-identity.ts` (MODIFY)
- `services/platform/tests/integration/sprint29-compose-contract.test.ts` (MODIFY)
- `services/platform/tests/integration/sprint29-deployment.test.ts` (MODIFY)

writeProhibited:

- `services/platform/Dockerfile`, `.dockerignore`, Expo/mobile/client source, secret values, and mutable runtime data
- Tailscale ACL policy, Funnel, Langfuse, Kubernetes, HA, or unrelated services
- Any file not explicitly listed in `writeAllowed`

## Boundaries

✅ Always:

- Preserve digest-qualified images, the existing server entrypoint, migration-before-serve, scoped auth, named volumes, and bounded logs.
- Resolve and validate hostname, architecture, port, memory, and secret paths before any Docker mutation.
- Redact child-process errors and evidence using known secret values without printing the values being redacted.
- Coordinate with D06-06: do not execute until its overlapping worktrees are reconciled into the branch used for Sprint 32.

⚠️ Ask first:

- Adding a service, package dependency, published port, new secret source, or new runtime file.
- Changing the 44111 external/private port, 4111 container port, 50 GiB ceiling, named volume names, or exact service list.

## Deliverable

- Compose/env contract: configurable limits, file-backed secrets, exact services/volumes, no client.
- Deployment/release/identity modules: portable validated host and ARM64/memory/path fail-closed checks.
- Integration tests: real Docker/Compose proof and all named negative controls.

## Agent instructions

1. Capture RED evidence for each `IMP-AC-*` test before product changes; failures must be assertions, not missing Docker or setup errors.
2. Implement ACs sequentially with the smallest change inside `writeAllowed`; keep the Dockerfile and `.dockerignore` byte-for-byte unchanged.
3. Base secret validation on canonical `realpath`, `lstat`/`stat`, regular-file, symlink, store-boundary, ownership, and permission checks; never include the secret content in exceptions.
4. Run real rendered Compose and Docker-backed checks, then typecheck/lint and the full two-file integration command.
5. Return RED/GREEN evidence per AC plus the Docker-observed manifest, port, service, volume, memory, auth, and redaction values.

## Reading list

1. `services/platform/src/deploy/production-deploy.ts:45-56,227-307,482-627` [PRIMARY PATTERN] — current identity, secret, override, and deployment flow.
2. `services/platform/deploy/compose/compose.yaml:14-177` — exact four-service graph, migration, health, volumes, and secrets.
3. `services/platform/src/deploy/production-release.ts:13-68,261-424` — release/Compose validation and required services.
4. `services/platform/tests/integration/sprint29-compose-contract.test.ts:227-542` — Docker-backed archive and Compose evidence patterns.
5. `services/platform/tests/integration/sprint29-deployment.test.ts:91-329` — authorization, identity, secret, and override tests.

## Evidence gates

1. Scenario validator exits 0 for all seven behavioral scenarios.
2. Each filtered `IMP-AC-*` test has captured RED then GREEN evidence against real Docker/filesystem behavior.
3. Full integration command, `pnpm tsgo --noEmit`, and scoped Biome command exit 0.
4. `git diff --name-only` is a subset of `writeAllowed`; Dockerfile and `.dockerignore` hashes are unchanged.
5. Captured evidence contains exact non-empty values and zero credential-value matches.

## Out of scope

- Tailscale Serve application/lifecycle and second-device proof (D08-07 through D08-09).
- Cold-host bootstrap and reboot recovery (D08-08).
- Expo/mobile/client builds, Tailscale ACL mutation, Funnel, Internet ingress, HA, Kubernetes, replication, or Langfuse.

## Review

Must pass: all seven AC/TC pairs; real integration evidence; unchanged server-only image boundary; exact service/port/volume/memory contracts; scope compliance.

Should verify: hostname normalization has no DNS rebinding shortcut; secret paths reject symlinks and unsafe files; all errors/receipts/logs redact values; no Docker mutation happens before validation/authorization.

Verdict: `APPROVED | NEEDS_FIXES`

## Dependencies

- Depends on: D08-02 integrated; D06-06, D06-06-codex-fix, and D06-06-r3 overlapping changes reconciled without discarding their work.
- Blocks: D08-07.
- Parallel: none; D08-06 through D08-09 are deliberately sequential because they share deployment modules and tests.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-06",
  "proposed_by":"devops-engineer",
  "source_scope":"/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json",
  "source_requirement_map":{"AC-1":"IMP-AC-1","AC-2":"IMP-AC-2","AC-3":"IMP-AC-3","AC-4":"IMP-AC-4","AC-5":"IMP-AC-6","AC-6":"IMP-AC-8","AC-7":"IMP-AC-9"},
  "touches_capabilities":["CAP-DEP-01"],
  "provides":["portable-arm64-compose-contract","configurable-deployment-identity","loopback-port-contract","bounded-stack-memory-contract"],
  "consumes":["D06-06 immutable digest release","existing four-service Compose graph"],
  "boundary_contracts":["OCI manifest to Apple-silicon compatibility","operator secret store to read-only mounts","Compose to loopback persistence migration invariants"],
  "loc_budget":420,
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{"portable_runtime_candidate":{"description":"Clean ARM64 release candidate, existing server-only Docker build context, exact four-service Compose graph, target host holocron, and operator-supplied secret files.","seed_method":"cli","records":["docker buildx candidate has linux/arm64 manifest","compose services are postgres, mastra, scheduler, zero-cache","stable application port is 44111","memory ceiling is 50 GiB"]}},
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a clean release candidate WHEN the real root-context image is built for linux/arm64 and inspected THEN the Bun server exists and forbidden client/secret/runtime entries total zero.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-1'","maps_to_ac":null,"scenario":{"id":"IMP-AC-1","primary":true,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker BuildKit and OCI archive","negative_control":{"would_fail_if":["the Docker build is stubbed","the denylist is omitted","client assets are hardcoded into the image"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["build the real root-context image for linux/arm64 and inspect its OCI archive and entrypoint"]},"end_state":{"must_observe":["platform='linux/arm64'","server_entrypoint='bun src/index.ts'","forbidden_client_entry_count=0"],"must_not_observe":["platform='linux/amd64-only'","forbidden_client_entry_count>=1","empty OCI archive"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN the deploy control plane WHEN holocron, edge-m1, and bad_host! are evaluated THEN both valid hosts pass and the invalid hostname fails.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-2'","maps_to_ac":null,"scenario":{"id":"IMP-AC-2","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"holo deploy control plane","negative_control":{"would_fail_if":["the target validator is a static inference1 check","invalid target validation is omitted","the deployment identity is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["run the real deployment preflight for holocron, edge-m1, and invalid bad_host! targets"]},"end_state":{"must_observe":["accepted_host='holocron'","accepted_host='edge-m1'","rejected_host='bad_host!'"],"must_not_observe":["accepted_host='inference1-only'","accepted_invalid_host_count=1","empty deployment identity"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"GIVEN an immutable release WHEN Docker manifest and host preflight run THEN linux/arm64 is observed and amd64-only fails before mutation.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-3'","maps_to_ac":null,"scenario":{"id":"IMP-AC-3","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker Buildx manifest inspection","negative_control":{"would_fail_if":["remote manifest inspection is omitted","an amd64-only result is hardcoded as accepted","Docker is disconnected"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["inspect the immutable image manifest through Docker and run host compatibility preflight"]},"end_state":{"must_observe":["required_platform='linux/arm64'","compatible_manifest_count>=1","amd64_only_candidate_rejected='true'"],"must_not_observe":["compatible_manifest_count=0","amd64_only_candidate_rejected='false'","empty manifest response"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"GIVEN the generated override WHEN Compose renders THEN Mastra has exactly one 127.0.0.1:44111 publication and zero non-loopback application publications.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-4'","maps_to_ac":null,"scenario":{"id":"IMP-AC-4","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker Compose rendered configuration","negative_control":{"would_fail_if":["the generated override retains a 0.0.0.0 bind","an extra server port is hardcoded","Compose rendering is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["render the real production Compose configuration and inspect every published port"]},"end_state":{"must_observe":["mastra_publish='127.0.0.1:44111:4111'","published_server_port_count=1","non_loopback_publish_count=0"],"must_not_observe":["mastra_publish='0.0.0.0:44111:4111'","published_server_port_count=0","empty port list"]}}]}},
    {"id":"AC-5","type":"acceptance_criterion","primary":false,"description":"GIVEN four configurable limits WHEN 50 GiB and invalid plans are preflighted THEN only valid positive allocations summing at most 50 GiB pass.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-6'","maps_to_ac":null,"scenario":{"id":"IMP-AC-6","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker Compose memory contract","negative_control":{"would_fail_if":["memory validation is omitted","a 51 GiB allocation is hardcoded as accepted","the Compose limits are static placeholders"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["render a 50 GiB allocation and preflight 51 GiB, zero, and negative allocations"]},"end_state":{"must_observe":["memory_limit_sum_gib=50","over_budget_51_gib_rejected='true'","nonpositive_0_gib_rejected='true'"],"must_not_observe":["memory_limit_sum_gib=0","over_budget_51_gib_rejected='false'","empty memory plan"]}}]}},
    {"id":"AC-6","type":"acceptance_criterion","primary":false,"description":"GIVEN production Compose WHEN rendered and started THEN exactly four services, two named volumes, file-backed secrets, and migrate-before-serve are observed.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-8'","maps_to_ac":null,"scenario":{"id":"IMP-AC-8","primary":false,"tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"Docker Compose four-service runtime","negative_control":{"would_fail_if":["one service is omitted","migrations are stubbed","named volumes are replaced by empty ephemeral storage"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"cli_user","steps":["render Compose, start the exact services, and inspect dependency, migration, secret, and volume contracts"]},"end_state":{"must_observe":["service_count=4","services='postgres,mastra,scheduler,zero-cache'","named_volume_count=2","migration_before_server='true'"],"must_not_observe":["service_count=0","named_volume_count=0","empty dependency graph"]}}]}},
    {"id":"AC-7","type":"acceptance_criterion","primary":false,"description":"GIVEN approved secret files and scoped keys WHEN Compose and MCP probes run THEN mounts are read-only, literal credential count is zero, and auth returns 200/401.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-9'","maps_to_ac":null,"scenario":{"id":"IMP-AC-9","primary":false,"tier":"holdout","test_tier":"integration","topology":"single-node","verification_service":"Docker secret mounts and authenticated Holocron API","negative_control":{"would_fail_if":["a credential is hardcoded into Compose","secret path checks are omitted","scoped authorization is stubbed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"portable_runtime_candidate","action":{"actor":"api_client","steps":["mount validated secret files read-only, render Compose, and call authenticated API and MCP surfaces"]},"end_state":{"must_observe":["read_only_secret_mount_count>=1","credential_value_literal_count=0","authenticated_mcp_status=200","unauthenticated_mcp_status=401"],"must_not_observe":["read_only_secret_mount_count=0","credential_value_literal_count>=1","empty secret path list"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"ARM64 image archive contains the Bun server and zero forbidden client/secret/runtime entries.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-1'","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Portable host validation accepts holocron and edge-m1 while rejecting bad_host!.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-2'","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Manifest preflight accepts linux/arm64 and rejects amd64-only before mutation.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-3'","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Rendered Compose exposes only one Mastra port on 127.0.0.1:44111.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-4'","maps_to_ac":"AC-4"},
    {"id":"TC-5","type":"test_criterion","description":"50 GiB passes while non-positive, malformed, missing, and 51 GiB plans fail.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-6'","maps_to_ac":"AC-5"},
    {"id":"TC-6","type":"test_criterion","description":"The exact four-service graph retains two named volumes and migrate-before-serve.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'IMP-AC-8'","maps_to_ac":"AC-6"},
    {"id":"TC-7","type":"test_criterion","description":"Secret mounts are read-only, credentials absent, and scoped MCP auth returns 200/401.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts -t 'IMP-AC-9'","maps_to_ac":"AC-7"}
  ]
}
-->
</details>
