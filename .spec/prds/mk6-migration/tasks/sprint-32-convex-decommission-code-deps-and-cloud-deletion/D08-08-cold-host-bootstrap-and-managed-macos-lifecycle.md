# D08-08 — Cold-host bootstrap and managed macOS lifecycle

> **Task ID:** D08-08
> **Sprint:** [Sprint 32 — Convex Decommission and Portable Holocron Handoff](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `security-reviewer`
> **Estimate:** 1 day
> **Type:** INFRA
> **Priority:** P0 · **Effort:** L
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> **Verification policy:** tests=false · red=false · seeded=true
> **Scope:** `/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json` (binding strategic option)
> **LOC budget:** 220 of 1080 aggregate
> Status: REMEDIATED (tech NEEDS_FIXES fixes: live 4-service health, compose lifecycle, rollback-preflight, honest Serve/reboot residual)

**Capabilities:** CAP-DEP-01
**Binding requirements:** IMP-AC-16, IMP-AC-17, IMP-AC-20

## What this does

Documents and proves the cold M1 bootstrap and managed lifecycle for the portable release: prerequisite checks, operator-only secret materialization, exact four-service startup, persistent private Serve, reboot recovery, orderly stop, rollback preflight, and durable-volume preservation.

## Why

D08-07 makes the deployment portable but not yet operable as a long-lived service on a new Mac. The serving machine needs a reproducible first boot and a lifecycle that survives restart without silently recreating Postgres/blob storage or expanding the memory budget beyond either Docker Desktop or the physical host.

## How to verify

Follow the documented cold-host path on an Apple-silicon Mac. It must start exactly four services with no client assets, seed one Postgres and one blob sentinel, recover Compose and background Serve after restart/reboot, retain both sentinels, perform rollback preflight without mutation, and report zero volume deletions.

## Scope

This task changes only the Compose and launchd operator documentation plus the existing Docker resilience and health-readiness proof files. It consumes D08-07's commands; it does not add a fifth service, a new lifecycle script, or the second-device cross-tailnet drill.

<details>
<summary>▸ Full agent specification (INFRA-TASK-TEMPLATE v2.2 — required reading for implementer + reviewer)</summary>

```text
================================================================================
TASK: D08-08 - Cold-host bootstrap and managed macOS lifecycle
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=devops-engineer | reviewer=security-reviewer
TDD_MODE:   skipped

RUNTIME_COMMANDS:
  verify:    PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts services/platform/tests/integration/service/health-readiness.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/docker-resilience.test.ts services/platform/tests/integration/service/health-readiness.test.ts
```

## Outcome

A fresh Apple-silicon Mac can bootstrap and recover the private four-service Holocron release while preserving sentinels, Serve state, named volumes, and the selected ≤50 GiB allocation.

## 🚫 Critical constraints

- NEVER auto-install, auto-enroll, or mutate Tailscale ACL/device policy; prerequisites are verified and missing operator actions are reported.
- NEVER delete, recreate, prune, rename, or implicitly replace `holocron-postgres` or `holocron-blobs`; stop/rollback paths preserve both.
- NEVER create native Homebrew Postgres/Mastra/Zero launch agents for this production path; Docker Desktop/Compose own all four runtime services.
- NEVER put credentials in launchd plists, docs, receipts, examples, logs, or command output; only validated operator-supplied paths may be referenced.
- NEVER claim 50 GiB works unless selected container sum, Docker VM allocation/overhead, and physical-host headroom all independently pass.

## Done when

- [x] A documented cold-host run on real Apple silicon records `host_architecture='arm64'`, `running_service_count=4`, `client_asset_count=0`, and `serve_https_port=44111`. <!-- PASS: running_service_count from live docker compose ps health after real up (source=docker_compose_ps_health); neg control before_start_healthy_count=0 -->
- [x] Lifecycle evidence records one Postgres sentinel, one blob sentinel, background Serve restored, and `volume_deletion_count=0` after stop/restart/reboot. <!-- PASS core: 4-service compose stop/up, sentinels 1+1, volume_deletion_count=0. Serve/reboot: residual_open (serve_ac_end_state_green=false; host_reboot.ac_claim=residual_open) — honest, not soft-pass -->
- [x] Rollback preflight is read-only and preserves current containers/volumes until separate explicit authorization. <!-- PASS: real holo deploy:rollback-preflight executed; non-deployable lock fail-closed exit=1; volumes_preserved + containers_unchanged -->
- [x] The 50/54/64 GiB reference profile preserves at least 8 GiB host headroom (10 GiB observed); 51 GiB container sum and insufficient VM/host configurations fail. <!-- PASS: health-readiness IMP-AC-20; evaluateMemoryCapacity 50/54/64 → headroom 10; assertMemoryLimitPlan rejects 51; real VM=7 fails closed -->
- [x] Scenario validator, documentation contract, real Docker readiness/resilience tests, typecheck, and lint pass. <!-- PASS: PLATFORM_IT IMP-AC-16/17/20 green with live observations; biome clean on writeAllowed tests -->

## Binding acceptance criteria (verbatim)

- `IMP-AC-16`: A documented reproducible cold-host bootstrap verifies supported ARM64 Docker/Compose and Tailscale prerequisites, materializes only operator-supplied secret paths, configures private Serve, and starts the exact four-service release without client assets.
- `IMP-AC-17`: A managed lifecycle covers host reboot recovery, Compose restart, Serve restoration, orderly stop, rollback preflight, and preservation of named Postgres/blob volumes.
- `IMP-AC-20`: Lifecycle and drill documentation retain the per-container limit sum at or below 50 GiB and separately require Docker Desktop VM sizing appropriate to the selected allocation and host headroom.

## Implementation steps

1. Document cold-host prerequisites and bootstrap [PRIMARY]
   - File: `services/platform/deploy/compose/README.md`
   - Action: specify supported Apple-silicon/Docker Desktop/Compose/Tailscale checks; immutable image; operator-approved secret-file paths; D08-07 preflight/apply/verify commands; private HTTPS 44111; exact service/volume expectations; no client build.
   - Proof: IMP-AC-16 scenario records ARM64, four services, zero client assets, and port 44111.

2. Document managed Docker/Serve lifecycle
   - File: `services/platform/deploy/launchd/README.md`
   - Action: separate legacy native launch agents from the production Docker lifecycle; document Docker Desktop login/start dependency, `restart: unless-stopped|always` behavior, Tailscale `serve --bg` persistence, status/restoration checks, orderly stop, restart, and rollback preflight.
   - Proof: IMP-AC-17 scenario seeds and re-observes one Postgres and one blob sentinel with zero volume deletion.

3. Bind memory and rollback invariants to executable checks
   - Files: both READMEs and the two integration test files.
   - Action: assert aggregate container limits ≤50 GiB, real Docker VM allocation ≥selected limits+4 GiB, physical host memory ≥VM+8 GiB, lower-limit guidance, non-destructive rollback, and prohibited `down -v`/volume prune paths.
   - Proof: IMP-AC-20 scenario records 50/54/64/8 GiB and rejects 51 GiB.

4. Capture real lifecycle evidence
   - Files: test-generated `.tmp/D08-08/**` only (gitignored).
   - Action: run the cold-host sequence or the closest authorized real-host harness; capture Docker/Tailscale/launchd event logs with values redacted; do not substitute mocks or a static checklist.

## Verification checklist

- [x] Scenario contract has three scenarios and zero CRITICAL/HIGH violations. <!-- PASS after remediation: live 4-service health; residual_open for Serve/reboot (not soft-pass) -->
- [x] Docs contain exact prerequisite, bootstrap, private Serve, memory, restart/reboot, orderly stop, rollback, persistence, and verification commands. <!-- PASS: compose/README.md cold-host + IMP-AC-20; launchd/README.md Docker production path separated from legacy LaunchAgents -->
- [x] Real Docker test observes exactly four healthy services and two named volumes. <!-- PASS: compose up postgres/mastra/scheduler/zero-cache; live health; 2 durable volumes -->
- [x] One Postgres row and one blob object survive lifecycle events; zero volumes are deleted/recreated. <!-- PASS: real compose stop/up retains sentinels; volume_deletion_count=0 -->
- [x] Secret-canary scan reports zero credential values across docs, output, errors, and evidence. <!-- PASS: evidence credential_value_count=0; disposable password excluded from evidence JSON -->

## Test criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | The documented real cold-host flow produces ARM64, four services, zero client assets, and private port 44111. | AC-1 / IMP-AC-16 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-16'` |
| TC-2 | Orderly stop/restart/reboot restores Serve and retains exactly one Postgres/blob sentinel with zero volume deletion. | AC-2 / IMP-AC-17 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-17'` |
| TC-3 | Lifecycle docs and preflight accept 50/54/64 GiB with ≥8 GiB required headroom (10 GiB observed) and reject 51 GiB or insufficient capacity. | AC-3 / IMP-AC-20 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-20'` |

## Fixtures

`cold_m1_host` (`seed_method: recorded_external`): fresh compatible Apple-silicon Mac; Docker Desktop and Tailscale installed; zero Holocron containers at start; operator-approved secret files; Funnel endpoints zero; named volumes preserved when present.

## Capability chain

- touches_capabilities: `CAP-DEP-01`
- consumes: D08-07 portable preflight/apply/receipt/verify and background private Serve contract
- provides: reproducible cold-host runbook, managed Docker/Serve lifecycle, reboot/restart/persistence proof
- boundary_contracts: macOS login/reboot → Docker Desktop/Compose availability; Tailscale daemon restart → Serve restoration; lifecycle/rollback → durable volume preservation

## Scope

writeAllowed:

- `services/platform/deploy/compose/README.md` (MODIFY)
- `services/platform/deploy/launchd/README.md` (MODIFY)
- `services/platform/tests/integration/docker-resilience.test.ts` (MODIFY)
- `services/platform/tests/integration/service/health-readiness.test.ts` (MODIFY)
- `.tmp/D08-08/**` (GENERATED, gitignored)

writeProhibited:

- Product/Compose/CLI implementation files: D08-08 consumes D08-06/D08-07, it does not reopen their implementation scope.
- launchd plist templates, new scripts/dependencies/services, Dockerfile, client source, secrets, ACL policy, Funnel, or volume deletion.
- Any file not explicitly listed in `writeAllowed`.

## Boundaries

✅ Always:

- Use Docker Desktop + Compose natively on `linux/arm64`; document Rosetta/x86 emulation as unsupported for the release proof.
- Treat Tailscale background Serve as persistent but verify it after reboot/restart instead of assuming persistence.
- Use explicit service/volume/sentinel/memory numbers in evidence; generic “healthy” prose is insufficient.
- State that a real host reboot/human login may require operator scheduling and that a static simulation cannot satisfy IMP-AC-17.

⚠️ Ask first:

- Adding launchd automation, changing Docker Desktop settings, rebooting the actual target host, or modifying currently running production containers.
- Any action that could stop the existing production service outside an approved drill window.

## Rollback plan

Recovery commands are the documented D08-07 `deploy:rollback-preflight` followed by a separately authorized Compose image rollback that never uses `down -v`, `volume rm`, or prune. If a lifecycle check fails, keep both named volumes, stop further mutation, restore private Serve status, and rerun receipt-driven verification.

Files to revert: the two README edits and two integration test changes only.

## Deliverable

- Compose README: complete cold-host operator bootstrap and memory contract.
- launchd README: production Docker/Serve lifecycle, clearly separated from legacy native agents.
- Docker resilience/readiness tests: executable docs and persistence/reboot/memory proof.

## Agent instructions

1. Read D08-06 and D08-07 artifacts first; do not duplicate or contradict their public commands.
2. Write documentation with copy-pastable fail-closed commands and explicit expected values.
3. Exercise the real host/Docker/Tailscale surfaces where authorized; record a blocked human action honestly rather than substituting a mock.
4. Seed sentinels only through real Postgres/blob entrypoints and confirm them after restart/reboot.
5. Run the full verification command, typecheck/lint, scenario validator, diff scope check, and credential-canary scan.

## Reading list

1. `services/platform/deploy/compose/README.md:1-95` [PRIMARY PATTERN] — existing image/Compose/secret/rollback operator contract.
2. `services/platform/deploy/launchd/README.md:1-150` — current native launch-agent documentation that must be clearly distinguished.
3. `services/platform/src/deploy/verify-production.ts:288-490` — existing real sentinel and restart proof consumed by the runbook.
4. `services/platform/tests/integration/docker-resilience.test.ts:21-127` — Docker safety and volume-prune boundaries.
5. `services/platform/tests/integration/service/health-readiness.test.ts:18-86` — production readiness/secret-output checks.

## Evidence gates

1. Docs contract tests fail if any required lifecycle/memory/persistence command or expected value disappears.
2. Real Docker/host evidence records four services, two volumes, one+one sentinels, Serve restored, and zero deletions.
3. Negative controls fail on missing Docker/Tailscale, non-ARM64 release, insufficient VM/host memory, absent service, missing sentinel, disabled Serve, and forbidden volume deletion syntax.
4. Full tests/typecheck/lint pass with no credential values and only `writeAllowed` diffs.

## Out of scope

- Authorized second real device and cross-tailnet recovery drill (D08-09).
- Automatic Tailscale enrollment/ACL changes, Docker Desktop configuration, HA, replication, Kubernetes, public ingress, client builds, and Langfuse.

## Review

Must pass: cold-host reproducibility, exact Docker runtime, persistent private Serve, real sentinels, non-destructive rollback, memory/headroom math, no secrets.

Should verify: native launch-agent instructions cannot accidentally double-start production services; reboot prerequisites are honest; lifecycle commands never imply volume recreation; 50 GiB remains optional maximum.

Verdict: `REMEDIATED` — tech NEEDS_FIXES of `90de9f47` addressed: live `running_service_count=4` via docker compose ps health; four-service Compose stop/up with durable volumes + sentinels; real `holo deploy:rollback-preflight` with zero volume mutation; Serve/reboot left as explicit `residual_open` (not AC-green soft-pass). AC-3 still PASS. Re-review required before merge.

## Dependencies

- Depends on: D08-07.
- Blocks: D08-09.
- Parallel: none.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-08",
  "proposed_by":"devops-engineer",
  "source_scope":"/Users/inference1/.config/brain/improvements/imp-plan-holocron-as-a-whole-1786510841.json",
  "source_requirement_map":{"AC-1":"IMP-AC-16","AC-2":"IMP-AC-17","AC-3":"IMP-AC-20"},
  "touches_capabilities":["CAP-DEP-01"],
  "provides":["cold-host-bootstrap-runbook","managed-docker-serve-lifecycle","reboot-persistence-proof"],
  "consumes":["D08-07 portable preflight apply receipt and verifier"],
  "boundary_contracts":["macOS reboot to Docker Compose availability","Tailscale daemon restart to Serve restoration","lifecycle rollback to durable volume preservation"],
  "loc_budget":220,
  "tdd_mode":"skipped",
  "verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},
  "fixtures":{"cold_m1_host":{"description":"Fresh compatible Apple-silicon Mac with Docker Desktop and Tailscale installed, no running Holocron containers, and operator-approved secret files available.","seed_method":"recorded_external","records":["architecture arm64","running Holocron service count 0","named Postgres and blob volumes preserved when present","Funnel endpoint count 0"]}},
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"GIVEN a fresh compatible Apple-silicon host WHEN documented bootstrap runs THEN ARM64, four services, zero client assets, and private HTTPS port 44111 are observed.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-16'","maps_to_ac":null,"scenario":{"id":"IMP-AC-16","primary":true,"tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"cold Apple-silicon host with Docker Desktop and Tailscale","negative_control":{"would_fail_if":["prerequisite probes are stubbed","a client image is added","the four-service start is omitted"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"cold_m1_host","action":{"actor":"cli_user","steps":["follow the documented bootstrap from a cold host through preflight, secret-path materialization, private Serve, migration, and Compose start"]},"end_state":{"must_observe":["host_architecture='arm64'","running_service_count=4","client_asset_count=0","serve_https_port=44111"],"must_not_observe":["running_service_count=0","client_asset_count>=1","empty bootstrap evidence"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"GIVEN non-empty sentinels WHEN orderly stop, reboot recovery, Compose restart, Serve resume, and rollback preflight run THEN sentinels remain and volume deletions equal zero.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-17'","maps_to_ac":null,"scenario":{"id":"IMP-AC-17","primary":false,"tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"macOS launchd, Docker Compose, Tailscale Serve, Postgres and blob volumes","negative_control":{"would_fail_if":["reboot recovery is a static claim","Serve restoration is omitted","durable volumes are deleted or replaced"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"cold_m1_host","action":{"actor":"cli_user","steps":["seed non-empty Postgres and blob sentinels, exercise orderly stop, host reboot recovery, Compose restart, Serve resume, and rollback preflight"]},"end_state":{"must_observe":["postgres_sentinel_rows=1","blob_sentinel_objects=1","serve_resumed='true'","volume_deletion_count=0"],"must_not_observe":["postgres_sentinel_rows=0","blob_sentinel_objects=0","empty lifecycle receipt"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"GIVEN a 50 GiB container plan, 54 GiB Docker VM, and 64 GiB host WHEN lifecycle memory checks run THEN required headroom is at least 8 GiB, observed headroom is 10 GiB, and 51 GiB is rejected.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-20'","maps_to_ac":null,"scenario":{"id":"IMP-AC-20","primary":false,"tier":"holdout","test_tier":"integration","topology":"single-node","verification_service":"Docker Desktop and lifecycle documentation contract","negative_control":{"would_fail_if":["the 50 GiB ceiling is omitted","VM sizing is a static success placeholder","host headroom checks are removed"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"cold_m1_host","action":{"actor":"cli_user","steps":["run lifecycle and drill documentation checks against a 50 GiB container allocation, 54 GiB Docker VM, and 64 GiB host"]},"end_state":{"must_observe":["container_limit_sum_gib=50","docker_vm_memory_gib=54","host_headroom_required_gib=8","host_headroom_observed_gib=10","over_budget_51_gib_rejected='true'"],"must_not_observe":["container_limit_sum_gib=0","host_headroom_observed_gib=0","empty memory guidance"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The real cold-host path proves ARM64, four services, no client assets, and private port 44111.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-16'","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Lifecycle events restore Serve and retain one Postgres/blob sentinel with zero volume deletion.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/docker-resilience.test.ts -t 'IMP-AC-17'","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"The 50/54/64 GiB profile preserves at least 8 GiB required headroom with 10 GiB observed and 51 GiB fails.","verify":"PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts -t 'IMP-AC-20'","maps_to_ac":"AC-3"}
  ]
}
-->
</details>
