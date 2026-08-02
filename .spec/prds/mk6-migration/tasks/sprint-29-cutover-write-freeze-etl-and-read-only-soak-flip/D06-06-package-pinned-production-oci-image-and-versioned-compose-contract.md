# D06-06: Package pinned production OCI image and versioned Compose contract

> **Task ID:** D06-06
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `code-reviewer`
> **Estimate:** 120 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-DEP-01
**PRD refs:** UC-PLAT-05, UC-SYNC-03, AP-10, R20, T-PLAT-015, T-SYNC-020

## Specification

**Objective.** Package the real platform runtime as an immutable OCI release and a versioned Compose contract that D06-07 can deploy on `inference1` without host supervision of application processes.

**Success state.** One exact source revision maps to a digest-qualified application image and release lock. Production and laptop Compose renders expose the same exact four services — `postgres`, `mastra`, `scheduler` (the scheduler/worker service), and `zero-cache` — with real health dependencies, restart policy, runtime-only secrets, and durable Postgres/blob volumes.

## Critical Constraints

- **MUST** pin the application release with `@sha256:<64-hex>` and record the exact 40-hex source revision plus the Compose manifest checksum.
- **MUST** declare exactly four services: `postgres`, `mastra`, `scheduler`, and `zero-cache`; `scheduler` owns the scheduler/worker process role.
- **MUST** configure real health checks, health-conditioned startup, `restart: unless-stopped` (or a documented equivalent), and explicit durable Postgres/blob volumes.
- **MUST** keep production and laptop topology identical while allowing endpoint, credential-source, and volume-location overrides.
- **NEVER** use `latest`, a tag-only application identity, host launchd supervision of application processes, or `docker compose down -v`.
- **NEVER** copy `.env`, `services/platform/config/secrets.yaml`, credentials, tokens, private keys, runtime data, or gate evidence into the build context or image.
- **STRICTLY** fail preflight on a missing digest, revision, required service, health dependency, restart policy, durable volume, or rollback reference.
- **STRICTLY** do not freeze, flip, invoke MCP tools, start the soak, or alter production volumes in this packaging task.

## Implementation Steps

1. Add a minimal multi-stage Bun production image with a non-root runtime user, exact lockfile install, OCI revision metadata, and a build context that excludes operator secrets and mutable evidence.
2. Add the versioned production Compose contract and laptop override for the exact four-service topology, health dependencies, restart policy, runtime secret mounts, and durable volumes.
3. Add `deploy:package` release preflight/lock generation so one source revision, application digest, Compose checksum, and prior rollback digest are captured together and mutable/incomplete releases fail closed.
4. Add the real Docker/Compose integration coverage for build identity, topology parity, secret scanning, durable volume preservation, and rollback-lock validation.

## Acceptance Criteria

#### AC-1 (PRIMARY): Immutable image build

- **GIVEN** `candidate_source`
- **WHEN** the operator builds the real production image and inspects its OCI metadata
- **THEN** the release lock records a real RepoDigest and the exact source revision; empty, dirty, tag-only, or mismatched identities fail

`test_tier: integration` · `service: docker-buildx` · `flow_ref: UC-PLAT-05`

#### AC-2: Exact four-service production topology

- **GIVEN** `compose_candidate`
- **WHEN** production Compose is rendered and started with `--wait`
- **THEN** exactly `postgres`, `mastra`, `scheduler`, and `zero-cache` reach real health with the specified dependency, restart, and durable-volume contracts

`test_tier: integration` · `service: docker-compose` · `flow_ref: UC-PLAT-05`

#### AC-3: Laptop/production topology parity

- **GIVEN** `laptop_candidate`
- **WHEN** the laptop override and production contract are rendered and compared
- **THEN** both resolve the same exact four services and the same pinned application digest

`test_tier: integration` · `service: docker-compose` · `flow_ref: UC-PLAT-05`

#### AC-4: Runtime-only secret hygiene

- **GIVEN** `secrets_candidate`
- **WHEN** image history, image filesystems, rendered Compose output, health payloads, and captured logs are scanned
- **THEN** runtime key names remain available by mount/reference while secret values have zero matches

`test_tier: integration` · `service: docker-engine` · `flow_ref: AP-10`

#### AC-5: Immutable rollback lock

- **GIVEN** `rollback_release`
- **WHEN** the release lock and Compose checksum are generated before deployment
- **THEN** the lock contains the new digest/revision/checksum and a valid prior digest that can be selected without deleting durable volumes

`test_tier: integration` · `service: docker-engine` · `flow_ref: CAP-DEP-01`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | Build verification fails when image digest is absent. | AC-1 | `pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'missing image digest'` |
| TC-2 | Compose validation fails when the postgres service is absent. | AC-2 | `pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'missing postgres service'` |
| TC-3 | Laptop parity reports equal four-service topology. | AC-3 | `pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'laptop topology parity'` |
| TC-4 | Secret scan fails on a credential literal in rendered Compose. | AC-4 | `pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'rendered Compose secret literal'` |
| TC-5 | Rollback selects the previous image lock. | AC-5 | `pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'previous image lock rollback'` |

## Reading List

- `.spec/prds/mk6-migration/04-uc-plat.md` — UC-PLAT-05 named-host container deployment
- `.spec/prds/mk6-migration/08-uc-sync.md` — deploy-before-freeze ordering
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` — CAP-DEP-01 handoff into CAP-CUT-01
- `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` — production image and Compose identity contract
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-PLAT-015 and T-SYNC-020
- `services/platform/package.json` and `services/platform/bun.lock` — exact runtime/dependency inputs
- `services/platform/deploy/launchd/README.md` — current host-process topology being replaced at the application boundary
- `scripts/run-zero-cache.sh` — current zero-cache runtime contract

## Guardrails

**WRITE-ALLOWED**

- `services/platform/Dockerfile` — NEW
- `services/platform/.dockerignore` — NEW
- `services/platform/deploy/compose/compose.yaml` — NEW
- `services/platform/deploy/compose/compose.dev.yaml` — NEW
- `services/platform/deploy/compose/production.env.example` — NEW, names/placeholders only
- `services/platform/deploy/compose/development.env.example` — NEW, names/placeholders only
- `services/platform/deploy/compose/image-lock.json` — NEW, non-secret release metadata
- `services/platform/deploy/compose/README.md` — NEW
- `services/platform/src/deploy/production-release.ts` — NEW
- `services/platform/src/cli/holo.ts` — MODIFY only for `deploy:package`
- `services/platform/tests/integration/sprint29-compose-contract.test.ts` — NEW

**WRITE-PROHIBITED**

- `.env` and `services/platform/config/secrets.yaml` — operator credentials are read-only runtime input
- `convex/**` and `services/platform/src/cutover/**` — freeze/flip behavior belongs to the existing cutover tasks
- `app/**`, `holocron-mcp/**`, and `services/platform/src/tools/**` — consumer behavior and the frozen tool surface are out of scope
- `gate-plan.json` and `scripts/run-sprint29-human-gate-rerun.sh` — deployment gate integration belongs to D06-07
- Any production volume deletion or live cutover action

## Design / Code Pattern

**Pattern.** Immutable release manifest: exact source revision → built OCI digest → versioned Compose checksum → previous digest. The laptop override changes environment-specific values, never topology or image identity.

**Pattern source.** PRD `CAP-DEP-01` and the existing consolidated secrets loader; D06-07 consumes the emitted release lock.

**Anti-pattern.** Floating tags, static health payloads, secrets in build args/layers, laptop-only fake services, or YAML-only validation that never starts real dependencies.

## Verification Gates

- `docker buildx build --file services/platform/Dockerfile --tag holocron-platform:candidate --load .` → real image builds
- `docker compose -f services/platform/deploy/compose/compose.yaml --env-file services/platform/deploy/compose/production.env.example config --quiet` → production contract validates
- `docker compose -f services/platform/deploy/compose/compose.yaml -f services/platform/deploy/compose/compose.dev.yaml --env-file services/platform/deploy/compose/development.env.example config --quiet` → laptop override validates
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-compose-contract.test.ts` → all behavioral packaging controls pass
- `pnpm tsgo --noEmit` and `pnpm test:unit` → repository gates pass

## Capability Chain

- **Provides:** digest-qualified production image; exact four-service Compose contract; image/revision/checksum/rollback lock
- **Consumes:** exact Git revision; compatibility-pinned Bun/dependencies; consolidated runtime secret source; Postgres/pgvector and zero-cache images
- **Boundary contracts:** D06-07 accepts only this release lock and must prove it on `inference1`; D06-06 does not certify deployment or cutover

## Agent Assignment

`devops-engineer` — owns image packaging, Compose topology, immutable promotion, runtime secret injection, durability, and rollback contracts.

## Dependencies

- **Depends on:** D06-02
- **Blocks:** D06-07, D06-03, D06-04, D06-05, Sprint 30

## Coding Standards

- RULES.md
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `.env.example` and `services/platform/config/secrets.example.yaml` are templates only; never source them as live credentials

## Notes

Consolidated from `devops-engineer` with `mastra-planner` deployment-boundary analysis. Deterministic TDD normalization for INFRA: `requires_tests=false`, `requires_red_evidence=false`, `requires_seeded_evidence=true`. Fakeability audit must remain non-vacuous with `scenario_count=5`.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"REQUIREMENT-CONTRACT v1","task_id":"D06-06","tdd_mode":"skipped","verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"candidate_source":{"seed_method":"cli","records":["git rev-parse HEAD returns a 40-hex source revision"]},"image_lock":{"seed_method":"cli","records":["docker buildx inspect records RepoDigest sha256:<64 hex> and source revision"]},"compose_candidate":{"seed_method":"cli","records":["docker compose config resolves exactly postgres,mastra,scheduler,zero-cache; scheduler is the scheduler/worker service"]},"laptop_candidate":{"seed_method":"cli","records":["laptop compose config resolves exactly postgres,mastra,scheduler,zero-cache; scheduler is the scheduler/worker service"]},"secrets_candidate":{"seed_method":"cli","records":["runtime key names DATABASE_URL and MASTRA_API_KEY with no secret values"]},"rollback_release":{"seed_method":"cli","records":["prior image lock records a sha256:<64 hex> digest"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"flow_ref":"UC-PLAT-05","description":"Build a real OCI image and record its immutable digest and source revision.","verify":"docker buildx build; docker image inspect","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-06-AC-1","test_tier":"integration","topology":"single-node","start_ref":"candidate_source","action":{"steps":["Run docker buildx build with OCI revision metadata, then docker image inspect."]},"end_state":{"must_observe":["inspect records RepoDigest:\"sha256:<64 hex>\" and revision:\"<40 hex>\"","image-lock records digest:\"sha256:<64 hex>\" and sourceRevision:\"<40 hex>\""],"must_not_observe":["empty artifact","no digest"]},"negative_control":{"would_fail_if":["disconnect or static implementation","empty output is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-2","type":"acceptance_criterion","primary":false,"flow_ref":"UC-PLAT-05","description":"Publish versioned Compose with exactly postgres, mastra, scheduler (the scheduler/worker service), and zero-cache, plus health dependencies, restart policy, and durable volumes.","verify":"docker compose config; assert exactly postgres,mastra,scheduler,zero-cache; docker compose up --wait","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-06-AC-2","test_tier":"integration","topology":"single-node","start_ref":"compose_candidate","action":{"steps":["Run docker compose config and up --wait on the pinned release; assert exactly postgres,mastra,scheduler,zero-cache."]},"end_state":{"must_observe":["config records exactly services:\"postgres,mastra,scheduler,zero-cache\" with scheduler as the scheduler/worker service","config records restart:\"unless-stopped\" and volumes:\"postgres-data,blob-data\""],"must_not_observe":["empty artifact","no zero-cache service"]},"negative_control":{"would_fail_if":["disconnect or static implementation","empty output is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-3","type":"acceptance_criterion","primary":false,"flow_ref":"UC-PLAT-05","description":"Prove laptop and production Compose resolve the same exact four-service topology and digest.","verify":"docker compose -f compose.dev.yaml config; compare exact four-service parity and digest","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-06-AC-3","test_tier":"integration","topology":"single-node","start_ref":"laptop_candidate","action":{"steps":["Run laptop compose config and compare its exact four-service image set to the production lock."]},"end_state":{"must_observe":["parity records exactly services:\"postgres,mastra,scheduler,zero-cache\" with scheduler as the scheduler/worker service and imageDigest:\"sha256:<64 hex>\"","parity records topologyEqual:true"],"must_not_observe":["empty artifact","no parity result"]},"negative_control":{"would_fail_if":["disconnect or static implementation","empty output is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-4","type":"acceptance_criterion","primary":false,"flow_ref":"AP-10","description":"Keep credentials runtime-only and absent from layers, history, Compose, health, and logs.","verify":"docker history; rendered Compose redaction scan; health and log scan","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-06-AC-4","test_tier":"integration","topology":"single-node","start_ref":"secrets_candidate","action":{"steps":["Build, render redacted Compose, then scan history, health, and captured logs."]},"end_state":{"must_observe":["scan records secretValueMatches:0 and runtimeKeys:\"DATABASE_URL,MASTRA_API_KEY\"","scan records imageHistoryLeaks:0"],"must_not_observe":["empty scan artifact","secret values present"]},"negative_control":{"would_fail_if":["disconnect or static implementation","hardcoded credential is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-5","type":"acceptance_criterion","primary":false,"flow_ref":"CAP-DEP-01","description":"Record an immutable release lock with rollback digest, source revision, and Compose checksum.","verify":"render image-lock.json; compute Compose checksum; execute rollback selection","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-06-AC-5","test_tier":"integration","topology":"single-node","start_ref":"rollback_release","action":{"steps":["Render image-lock and compute the manifest checksum before deployment."]},"end_state":{"must_observe":["lock records previousDigest:\"sha256:<64 hex>\" and composeSha256:\"<64 hex>\"","rollback selects pinned digest and exit:0"],"must_not_observe":["empty lock artifact","no rollback digest"]},"negative_control":{"would_fail_if":["disconnect or static implementation","mutable or empty lock is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"TC-1","type":"test_criterion","description":"Build verification fails when image digest is absent.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'missing image digest'","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-2","type":"test_criterion","description":"Compose validation fails when the postgres service is absent.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'missing postgres service'","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-3","type":"test_criterion","description":"Laptop parity reports equal four-service topology.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'laptop topology parity'","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-4","type":"test_criterion","description":"Secret scan fails on a credential literal in rendered Compose.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'rendered Compose secret literal'","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-5","type":"test_criterion","description":"Rollback selects the previous image lock.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-compose-contract.test.ts -t 'previous image lock rollback'","maps_to_ac":"AC-5","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}]}
-->
