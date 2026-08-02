# D06-07: Deploy on inference1 and prove external network identity before cutover

> **Task ID:** D06-07
> **Sprint:** [Sprint 29 — Cutover](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `mastra-reviewer`
> **Estimate:** 120 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** M
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> Status: Backlog

**Capabilities:** CAP-DEP-01, CAP-CUT-01
**PRD refs:** UC-PLAT-05, UC-SYNC-03, AP-10, R20, T-PLAT-015, T-SYNC-020

## Specification

**Objective.** Deploy the exact D06-06 release on the named production host `inference1` and certify, before the write freeze, that an already-listening external endpoint independently reports the exact container identity and survives an unexpected process death without losing durable state.

**Success state.** An operator-authorized deployment receipt binds one non-loopback base URL to host `inference1`, runtime `container`, the pinned image digest/source revision, and the exact four-service generation. Real Postgres, fleet, queue, and zero-cache readiness is green; dependency loss returns 503; SIGKILL of Mastra PID 1 recovers automatically; non-empty Postgres/blob sentinels remain intact; deployment steps 2–4 are integrated into the eight-step Sprint 29 gate.

## Critical Constraints

- **MUST** deploy exactly the D06-06 lock for `postgres`, `mastra`, `scheduler`, and `zero-cache`, with `scheduler` owning the scheduler/worker role.
- **MUST** require explicit operator authorization and retain the prior pinned digest plus durable volumes for rollback.
- **MUST** derive host, runtime, image digest, and source revision from the already-listening deployment; verifier-supplied identity fields cannot satisfy the gate.
- **MUST** make `/health` depend on real Postgres, fleet, queue, and zero-cache readiness and return HTTP 503 when any required dependency is unavailable.
- **MUST** prove restart policy with unexpected SIGKILL/PID-1 death; `docker compose stop` is not a valid restart probe.
- **NEVER** accept loopback, an in-process listener, stale identity, a mismatched release, a static payload, or missing identity fields.
- **NEVER** freeze, flip, run ETL, invoke an MCP tool, start soak behavior, or delete durable volumes during deployment certification.
- **STRICTLY** allow only MCP `initialize` and `tools/list` for the 44-registration boundary check; all tool invocation remains D06-05 scope.
- **STRICTLY** keep credentials, authorization headers, and secret values out of receipts, health output, logs, and gate evidence.

## Implementation Steps

1. Extend production `/health` with deployment-derived host/runtime/digest/revision plus strict Postgres/fleet/queue/zero-cache readiness; return 503 with the failing dependency named.
2. Add an operator-authorized, idempotent `inference1` deployment path that consumes only the D06-06 lock, cold-recreates the exact four-service Compose generation without volume deletion, and emits a non-secret deployment receipt.
3. Add fail-closed external identity verification for non-loopback, already-listening endpoints and negative controls for in-process, stale, mismatched, verifier-supplied, and missing identities.
4. Add the SIGKILL/PID-1 restart probe and non-empty Postgres/blob persistence comparison against the same digest and base URL.
5. Extend `gate-plan.json` and the Sprint 29 rerun harness with deployment steps 2–4, one verified base-URL handoff, and MCP `initialize`/`tools/list` registration-only proof.

## Acceptance Criteria

#### AC-1 (PRIMARY): Authorized exact release on inference1

- **GIVEN** `authorized_release`
- **WHEN** the operator authorizes deployment of the D06-06 lock
- **THEN** `inference1` cold-recreates exactly the four pinned services and emits a deployment receipt with zero cutover actions

`test_tier: integration` · `service: inference1-docker-compose` · `flow_ref: UC-PLAT-05`

#### AC-2: Strict external health and readiness

- **GIVEN** `dependency_readiness`
- **WHEN** `/health` is fetched through the already-listening non-loopback base URL and a required dependency is then removed
- **THEN** the healthy response reports exact deployment identity plus all four readiness dimensions, and dependency loss returns HTTP 503

`test_tier: integration` · `service: inference1-hono` · `flow_ref: T-PLAT-015`

#### AC-3: Identity negative controls fail closed

- **GIVEN** `identity_negative`
- **WHEN** the verifier probes loopback, in-process, stale, mismatched, verifier-supplied, and missing identities
- **THEN** every invalid identity exits non-zero and none can produce a landing-eligible receipt

`test_tier: integration` · `service: inference1-hono` · `flow_ref: R20`

#### AC-4: Restart-policy and durability proof

- **GIVEN** `restart_probe`
- **WHEN** Mastra PID 1 is killed with SIGKILL and the operator waits for external recovery
- **THEN** a new process on the same digest becomes healthy and the original non-empty Postgres/blob sentinels remain exact

`test_tier: integration` · `service: inference1-docker-compose+postgres+blob-store` · `flow_ref: CAP-DEP-01`

#### AC-5: Single base-URL gate handoff

- **GIVEN** `handoff_gate`
- **WHEN** deployment steps 2–4 run and MCP `initialize` plus `tools/list` use the verified URL
- **THEN** the gate records one deployed URL, 44 registered tools, zero tool invocations, zero soak invocations, and an eight-step plan

`test_tier: integration` · `service: inference1-hono-mcp` · `flow_ref: UC-SYNC-03`

## Test Criteria

| ID | Boolean statement | Maps to | Verify |
|----|-------------------|---------|--------|
| TC-1 | Unauthorized deployment exits with authorization failure. | AC-1 | `bash scripts/deploy-inference1.sh --dry-run` |
| TC-2 | External health returns HTTP 503 when Postgres is unavailable. | AC-2 | `docker compose stop postgres; test "$(curl -s -o /tmp/health.json -w '%{http_code}' "$HOLO_VERIFY_BASE_URL/health")" = 503; docker compose start postgres` |
| TC-3 | Identity validation rejects loopback URLs. | AC-3 | `pnpm vitest run services/platform/tests/integration/sprint29-deployment.test.ts -t 'rejects loopback identity'` |
| TC-4 | Restart evidence records SIGKILL against Mastra PID 1. | AC-4 | `docker inspect -f '{{.State.Pid}}' mastra; docker kill --signal=KILL mastra; jq -e '.signal == "SIGKILL"' .tmp/REDHAT-FIX-S29-DEPLOY/restart.json` |
| TC-5 | MCP evidence records tools/list count 44. | AC-5 | `jq -e '.toolsListCount == 44' .tmp/REDHAT-FIX-S29-DEPLOY/mcp.json` |

## Reading List

- `.spec/prds/mk6-migration/04-uc-plat.md` — UC-PLAT-05 named-host deployment
- `.spec/prds/mk6-migration/08-uc-sync.md` — deployment must precede freeze/ETL/flip
- `.spec/prds/mk6-migration/10-technical-requirements/08-technical-risks.md` — R20 stale/in-process identity risk
- `.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md` — CAP-DEP-01 handoff into CAP-CUT-01
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` — real external deployment surface
- `.spec/prds/mk6-migration/10-technical-requirements/11-runtime-contracts.md` — exact production identity contract
- `.spec/prds/mk6-migration/11-e2e-testing-criteria.md` — T-PLAT-015 and T-SYNC-020
- `services/platform/src/http/health.ts` — current readiness and process identity
- `services/platform/src/cutover/soak-fence.ts` — existing base-URL and serving identity checks
- `services/platform/src/mcp/gateway.ts` — shared 44-tool registry; discovery only in this task
- `services/platform/src/http/middleware/scoped-key.ts` — MCP 401/403 scope boundary
- `services/platform/deploy/launchd/README.md` and `scripts/install-launchd.sh` — current host supervision boundary

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/http/health.ts` — MODIFY
- `services/platform/src/http/deployment-identity.ts` — NEW
- `services/platform/src/deploy/production-deploy.ts` — NEW
- `services/platform/src/deploy/verify-production.ts` — NEW
- `services/platform/src/cutover/soak-fence.ts` — MODIFY only to consume the verified receipt/base URL
- `services/platform/src/cli/holo.ts` — MODIFY only for deployment apply/verify commands
- `services/platform/tests/integration/service/health-readiness.test.ts` — MODIFY
- `services/platform/tests/integration/sprint29-deployment.test.ts` — NEW
- `scripts/deploy-inference1.sh` — NEW
- `scripts/run-sprint29-human-gate-rerun.sh` — MODIFY for the eight-step plan
- `gate-plan.json` — MODIFY for deployment steps 2–4
- `deployment-record.schema.json` — NEW
- `.gate-evidence/**` — generated evidence only; never commit secrets

**WRITE-PROHIBITED**

- `.env` and `services/platform/config/secrets.yaml` — operator secrets remain read-only runtime input
- `services/platform/Dockerfile` and `services/platform/deploy/compose/**` — owned by D06-06
- `convex/**` and the write-fence/drain/ETL implementation — existing D06-03/D06-04 scope
- `app/**`, `holocron-mcp/**`, `services/platform/src/tools/**`, and `services/platform/src/mcp/executor.ts` — no client rewrite or tool behavior changes
- Production write enablement, cutover flip, rollback drill, or volume deletion

## Design / Code Pattern

**Pattern.** A release receipt is valid only when an already-listening external endpoint independently reports the exact immutable release identity. Every later app/MCP/article/cutover URL derives from that one verified base URL.

**Pattern source.** `services/platform/src/cutover/soak-fence.ts` serving-identity checks plus `services/platform/src/mcp/gateway.ts` registry-only discovery.

**Anti-pattern.** Spawning Hono inside the verifier; accepting localhost, PID/service-label-only identity, caller-supplied digest/revision, multiple base URLs, `docker compose stop` as a restart test, or MCP tool invocation during deployment proof.

## Verification Gates

- `PLATFORM_IT=1 HOLO_DEPLOY_TARGET=inference1 pnpm vitest run --project integration services/platform/tests/integration/service/health-readiness.test.ts` → exact health/readiness + 503 controls pass
- `PLATFORM_IT=1 HOLO_DEPLOY_TARGET=inference1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-deployment.test.ts` → deployment, identity, SIGKILL, durability, and handoff controls pass
- `bun services/platform/src/cli/holo.ts deploy:verify --release services/platform/deploy/compose/image-lock.json --base-url "$HOLO_PRODUCTION_BASE_URL" --restart-probe --json` → exits 0 only for exact external identity
- `bash scripts/run-sprint29-human-gate-rerun.sh` → executes an honest eight-step plan; may remain non-landing until all steps are genuinely green
- `pnpm tsgo --noEmit` and `pnpm test:unit` → repository gates pass

## Capability Chain

- **Provides:** `inference1` deployment receipt; strict external identity/readiness proof; restart/durability evidence; single verified consumer base URL
- **Consumes:** D06-06 image/Compose lock; consolidated secrets; exact four-service topology; real Postgres/fleet/queue/zero-cache dependencies
- **Boundary contracts:** D06-03/D06-04/D06-05 and Sprint 30 may proceed only from the verified receipt; D06-07 performs no freeze, ETL, flip, write, or rollback action

## Agent Assignment

`devops-engineer` — owns named-host deployment, Compose lifecycle, strict readiness, restart recovery, durable-state proof, and operator gate integration.

## Dependencies

- **Depends on:** D06-02, D06-06
- **Blocks:** D06-03, D06-04, D06-05, Sprint 30

## Coding Standards

- RULES.md
- `/Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md`
- `/Users/inference1/Projects/brain/docs/mcp-rules/transport.md`
- `/Users/inference1/Projects/brain/docs/mcp-rules/security.md`

## Notes

Consolidated from `devops-engineer` with `mastra-planner` readiness/restart analysis and `mcp-planner` transport-boundary analysis. Deterministic TDD normalization for INFRA: `requires_tests=false`, `requires_red_evidence=false`, `requires_seeded_evidence=true`. Deployment MCP proof is discovery only; D06-05 retains the 44-tool invocation and soak gate.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"REQUIREMENT-CONTRACT v1","task_id":"D06-07","tdd_mode":"skipped","verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},"fixtures":{"authorized_release":{"seed_method":"cli","records":["operator authorization names D06-06 image-lock digest and source revision for inference1"]},"dependency_readiness":{"seed_method":"cli","records":["already-listening non-loopback base URL serves real Postgres, fleet, queue, and zero-cache readiness for the exact four-service release"]},"identity_negative":{"seed_method":"recorded_external","records":["recorded loopback, in-process, stale, and mismatched identity probes against the inference1 deployment"]},"restart_probe":{"seed_method":"cli","records":["Mastra PID 1 is observed and Postgres/blob contain sentinel s29-deploy-sentinel before SIGKILL"]},"handoff_gate":{"seed_method":"recorded_external","records":["one operator-supplied base URL is already listening and gate-plan/human-gate deployment steps 2-4 are available"]}},"requirements":[{"id":"AC-1","type":"acceptance_criterion","primary":true,"flow_ref":"UC-PLAT-05","description":"Deploy the exact D06-06 pinned four-service release to named host inference1 only after operator authorization, with no cutover side effects.","verify":"scripts/deploy-inference1.sh --authorize; inspect deployment record","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-07-AC-1","test_tier":"integration","topology":"single-node","start_ref":"authorized_release","action":{"steps":["Run deploy-inference1.sh with the D06-06 lock and explicit authorization; assert exact services postgres,mastra,scheduler,zero-cache; do not run freeze, flip, ETL, soak, or MCP tool calls."]},"end_state":{"must_observe":["deployment record host:\"inference1\" authorized:true imageDigest:\"sha256:<64 hex>\" sourceRevision:\"<40 hex>\"","deployment record services:\"postgres,mastra,scheduler,zero-cache\" and cutoverActions:0"],"must_not_observe":["empty deployment record","cutover action accepted"]},"negative_control":{"would_fail_if":["disconnect or static deployment","empty output is accepted"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-2","type":"acceptance_criterion","primary":false,"flow_ref":"T-PLAT-015","description":"Prove an already-listening external /health on inference1 reports exact host, runtime, imageDigest, and sourceRevision, with real Postgres, fleet, queue, and zero-cache readiness and HTTP 503 when a dependency is down.","verify":"fetch external /health; stop one dependency; fetch again; restore stack","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-07-AC-2","test_tier":"integration","topology":"single-node","start_ref":"dependency_readiness","action":{"steps":["Fetch /health through the already-listening non-loopback base URL; verify exact identity and all readiness fields; stop Postgres, fetch again, assert HTTP 503, then restore the pinned stack."]},"end_state":{"must_observe":["HTTP 200 response records host:\"inference1\" runtime:\"container\" imageDigest:\"sha256:<64 hex>\" sourceRevision:\"<40 hex>\"","healthy response records postgres:\"ready\" fleet:\"ready\" queue:\"ready\" zeroCache:\"ready\"","dependency-down response records status:503 and dependency:\"postgres\""],"must_not_observe":["empty health response","HTTP 200 while dependency is down"]},"negative_control":{"would_fail_if":["disconnect or stale health identity","static readiness accepts dependency failure"]},"evidence":{"artifact_type":"api_response"}}},
{"id":"AC-3","type":"acceptance_criterion","primary":false,"flow_ref":"R20","description":"Fail closed on loopback, in-process, stale, mismatched, verifier-supplied, or missing deployment identity.","verify":"run identity validator against loopback, in-process, stale, mismatched, and missing-field probes","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-07-AC-3","test_tier":"integration","topology":"single-node","start_ref":"identity_negative","action":{"steps":["Run all identity-negative probes against the deployment and compare only deployment-derived host, runtime, imageDigest, and sourceRevision."]},"end_state":{"must_observe":["identity validator records rejected:\"loopback,in-process,stale,mismatched,missing\" and exit:1","accepted record retains imageDigest:\"sha256:<64 hex>\" and sourceRevision:\"<40 hex>\""],"must_not_observe":["empty rejection report","invalid identity accepted"]},"negative_control":{"would_fail_if":["disconnect or verifier-supplied identity is accepted","static validator returns success"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-4","type":"acceptance_criterion","primary":false,"flow_ref":"CAP-DEP-01","description":"Unexpected Mastra SIGKILL/PID-1 death recovers through restart policy and preserves non-empty Postgres/blob state.","verify":"docker inspect PID 1; docker kill --signal=KILL; await recovery; read sentinel","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-07-AC-4","test_tier":"integration","topology":"single-node","start_ref":"restart_probe","action":{"steps":["Record Mastra PID 1, issue docker kill --signal=KILL, wait for a new container PID and healthy external /health, then read the Postgres/blob sentinel."]},"end_state":{"must_observe":["restart evidence records signal:\"SIGKILL\" oldPid:\"<number>\" newPid:\"<number>\" restartCount:1 health:\"healthy\"","readback records sentinel:\"s29-deploy-sentinel\" postgresRows:1 blobObjects:1 and deletedVolumes:0"],"must_not_observe":["empty readback","restartCount:0 or lost sentinel"]},"negative_control":{"would_fail_if":["docker compose stop is substituted for SIGKILL","disconnect or static restart proof"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"AC-5","type":"acceptance_criterion","primary":false,"flow_ref":"UC-SYNC-03","description":"Verify one external base URL handoff and integrate gate-plan/human-gate deployment steps 2-4; MCP proof is initialize plus tools/list count 44 only, with no tool invocation or soak behavior.","verify":"verify one base URL; run deployment-only gate-plan steps 2-4; MCP initialize/tools-list","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"test_tier":"integration","scenario":{"id":"D06-07-AC-5","test_tier":"integration","topology":"single-node","start_ref":"handoff_gate","action":{"steps":["Set the single already-listening base URL, verify deployment and gate-plan/human-gate steps 2-4 resolve it, run MCP initialize then tools/list, assert count 44, and do not invoke tools or execute soak/cutover steps."]},"end_state":{"must_observe":["handoff records baseUrl:\"<non-loopback-url>\" identityClass:\"deployed-http\" baseUrlMatches:3 handoffVerified:true","MCP evidence records initialize:true toolsListCount:44 toolInvocations:0","gate evidence records plannedSteps:8 deploymentSteps:\"2,3,4\" executedDeploymentSteps:3 soakInvocations:0"],"must_not_observe":["empty handoff evidence","tool invocation or soak invocation accepted"]},"negative_control":{"would_fail_if":["loopback or in-process handoff is accepted","disconnect or static gate integration"]},"evidence":{"artifact_type":"stdout"}}},
{"id":"TC-1","type":"test_criterion","description":"Unauthorized deployment exits with authorization failure.","verify":"bash scripts/deploy-inference1.sh --dry-run","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-2","type":"test_criterion","description":"External health returns HTTP 503 when Postgres is unavailable.","verify":"docker compose stop postgres; test \"$(curl -s -o /tmp/health.json -w '%{http_code}' \"$HOLO_VERIFY_BASE_URL/health\")\" = 503; docker compose start postgres","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-3","type":"test_criterion","description":"Identity validation rejects loopback URLs.","verify":"pnpm vitest run services/platform/tests/integration/sprint29-deployment.test.ts -t 'rejects loopback identity'","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-4","type":"test_criterion","description":"Restart evidence records SIGKILL against Mastra PID 1.","verify":"docker inspect -f '{{.State.Pid}}' mastra; docker kill --signal=KILL mastra; jq -e '.signal == \"SIGKILL\"' .tmp/REDHAT-FIX-S29-DEPLOY/restart.json","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
{"id":"TC-5","type":"test_criterion","description":"MCP evidence records tools/list count 44.","verify":"jq -e '.toolsListCount == 44' .tmp/REDHAT-FIX-S29-DEPLOY/mcp.json","maps_to_ac":"AC-5","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}]}
-->
