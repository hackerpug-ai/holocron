# D08-05 — Delete the Convex cloud deployment (Operator-executed, irreversible)

> **Task ID:** D08-05
> **Sprint:** [Sprint 32 — Convex Decommission — Code, Deps and Cloud Deletion](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Reviewer:** `security-reviewer`
> **Estimate:** 45 min
> **Type:** INFRA
> **Priority:** P0 · **Effort:** S
> **Proposed By:** `devops-engineer`
> **TDD_MODE:** `skipped` · **RED_GREEN_REQUIRED:** no
> **Verification policy:** tests=false · red=false · seeded=true
> Status: Backlog

**Capabilities:** CAP-CUT-01 · CAP-BAK-01
**PRD refs:** UC-SYNC-05 · T-SYNC-018 · CAP-CUT-01 · CAP-BAK-01

## Operator outcome

An explicitly authorized human operator confirms the exact production Convex account, organization, environment, and deployment fingerprint, verifies D08-01 through D08-04 plus D08-09 and both pre-deletion gate artifacts, performs the provider's documented irreversible deletion action, and records a redacted immutable receipt. The operator then proves through the authenticated provider control plane that the exact target is absent and that the real platform, app, and MCP surfaces have no Convex references or dependency on that deployment.

This task is planning for the human action only. No provider deletion is performed by the task author, no repository deletion verb is invented, and no automation may bridge eligibility to the irreversible action.

## Scope and guardrails

WRITE-ALLOWED (task-author repository writes) is limited to:

- .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json
- .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json
- .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/post-delete-verification.json
- services/platform/tests/integration/sprint32-d08-05-deletion-gate.test.ts
- .tmp/REDHAT-FIX-S32-D08-05/**

WRITE-PROHIBITED: secrets or raw provider responses in evidence; edits to D08-03 evidence, restore targets, R2 objects, product source, package dependencies, or the wrong provider deployment; automatic deletion; a mock provider; and any deletion action before explicit human authorization. The irreversible provider action is not a repository write and is permitted only as a human-operated action through the provider's documented console or API, after all gates pass.

## Exact verification

    set -euo pipefail
    ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json
    PORTABLE=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json
    test -s "$ART"
    test -s "$PORTABLE"
    /usr/bin/jq -e '.schema == "holo.decommission.deletion-gate.v1" and .status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass"))' "$ART"
    /usr/bin/jq -e '.schema == "holo.deploy.cross-tailnet-drill.v1" and .real_device_count == 2 and .healthy_service_count == 4 and .second_device_health_status == 200 and .mcp_tool_count == 44 and .funnel_endpoint_count == 0 and .credential_value_count == 0' "$PORTABLE"
    bun services/platform/src/cli/holo.ts verify:no-convex-client --roots app,components,hooks,screens,lib,holocron-mcp/src --json
    bun services/platform/src/cli/holo.ts verify-no-convex-env
    bun services/platform/src/cli/holo.ts verify:decommission-inventory
    PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'
    /bin/bash scripts/e2e/run-maestro-reference-flow.sh --run

## Full agent specification

<details>
<summary>Full agent specification</summary>

TASK: D08-05 — Delete the Convex cloud deployment (Operator-executed, irreversible)
TASK_TYPE: INFRA
STATUS: Backlog
PRIORITY: P0
EFFORT: S (45 min)
AGENT: devops-engineer
REVIEWER: security-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE: skipped
RED_GREEN_REQUIRED: no
CAPABILITY: CAP-CUT-01

## Outcome

The external provider deployment is deleted only after a human has recorded scope identity, authorization, and all upstream gates. A redacted receipt binds the provider operation to the target fingerprint. Post-delete evidence proves authenticated control-plane absence for that exact target and real app/MCP operation through Postgres/Zero without Convex references.

## Critical constraints

- D08-01, D08-02, D08-03, D08-04, and D08-09 are hard prerequisites; the D08-03 artifact must be all-pass/hash-bound with convex_deletion_performed=false, and the D08-09 artifact must prove two real devices, four services, health 200, 44 MCP tools, no Funnel, and zero credential values.
- Pre-delete identity must include provider account, organization, environment, deployment fingerprint, and a production-scope confirmation; a mismatched or unqueried target aborts.
- The irreversible action is an explicit human authorization and a manual action on the external provider's documented control surface. Do not invent a repository CLI verb, script, or API endpoint.
- The receipt is immutable, redacted, and secret-scanned. It may contain provider status, operation identifier, target fingerprint, response hash, timestamp, and operator approval reference, never tokens, credentials, cookies, or raw response bodies.
- After deletion there is no Convex rollback. Recovery is through the proven Postgres backup/PITR and R2 blob path, with escalation on any failed or contradictory probe.

## Acceptance criteria

AC-1 [PRIMARY] Pre-delete hard gate: GIVEN D08-01 through D08-04, D08-09, and both gate artifacts, WHEN the operator verifies identity and readiness, THEN the exact production target is matched, all five upstream gates pass, the provider is reachable for scope confirmation, and app/MCP pre-delete probes are recorded.

AC-2 Authorized irreversible action: GIVEN AC-1 passes, WHEN the human operator records explicit authorization and uses the provider's documented manual control surface, THEN only the confirmed production deployment is acted on and a provider operation identifier is captured; no repository automation or implicit approval can pass.

AC-3 Redacted receipt: GIVEN the provider reports completion, WHEN the operator writes the immutable receipt, THEN it records deleted status, target fingerprint, operation and response hashes, convex_deletion_performed=true, and zero secret-scan hits without retaining raw provider content.

AC-4 Post-delete independence: GIVEN AC-3 receipt evidence, WHEN provider reachability, no-Convex checks, real MCP integration, and the reference Maestro app journey run, THEN the provider target is not found, source/env inventories have zero Convex references, and Postgres/Zero-backed app and MCP flows return real non-empty evidence.

## Reading list

1. .spec/prds/mk6-migration/08-uc-sync.md (UC-SYNC-05 AC-4)
2. .spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-SYNC-018)
3. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-CUT-01, CAP-BAK-01)
4. .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md
5. .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/HUMAN-GATE.md

## Evidence gates

- The pre-delete authorization artifact contains the five upstream gate references, including the hash of D08-09's sealed cross-tailnet evidence, target identity fields, explicit human authorization, and app/MCP pre-delete observations.
- The provider receipt has a stable schema, target fingerprint, operation identifier, response hash, immutable timestamp, redacted contents, and convex_deletion_performed=true only after observed provider success.
- Post-delete evidence contains the provider not-found observation, the exact no-Convex CLI outputs, the Sprint 31 real stdio-MCP integration result, and the real Maestro flow result.
- Any mismatch, missing evidence, failed probe, mock provider, secret hit, or empty payload is a hard abort and escalation condition.

## Design, source, anti-pattern

Pattern: immutable upstream evidence -> human scope confirmation -> explicit irreversible provider action -> redacted receipt -> independent provider/app/MCP verification.

Source: Sprint 28 HUMAN-GATE and fire-drill evidence schemas, Sprint 31 legacy MCP repoint integration, and the repository no-Convex verification commands.

Anti-pattern: a script that deletes the provider, an invented repository deletion command, implicit approval, a staging target, a raw provider receipt, a mock app/MCP proof, or a claim that Convex can be rolled back after deletion.

## Dependencies and boundaries

Depends on D08-01, D08-02, D08-03, D08-04, D08-09, Sprint 28 recovery evidence, and Sprint 31 MCP readiness. D08-05 is the final operator-only boundary and does not authorize changes to those upstream artifacts. Its post-delete proof may read Postgres/Zero and R2-backed recovery evidence but may not mutate or delete those systems.

## Test criteria

- TC-1 maps to AC-1: all five upstream gates, including D08-09's two-device private deployment proof, exact production identity, provider reachability, and real app/MCP pre-delete observations are recorded.
- TC-2 maps to AC-2: explicit human authorization and manual external-provider action are bound to the confirmed production target with an operation identifier.
- TC-3 maps to AC-3: the immutable receipt records deleted status, target/operation hashes, and zero secret hits without a raw provider response.
- TC-4 maps to AC-4: the real provider is not found and Postgres/Zero-backed app and MCP probes pass with zero Convex references and non-empty payload evidence.

## Agent rationale and pairing

devops-engineer owns the operator handoff and evidence protocol because the task crosses the external provider, Postgres/Zero, app, MCP, and recovery boundaries. security-reviewer pairs on human authorization, target-scope matching, least-privilege receipt contents, secret scanning, and irreversible-action controls.

## Agent instructions

1. Confirm D08-01, D08-02, D08-03, D08-04, and D08-09 status and read both D08-03 and D08-09 artifacts before requesting authorization.
2. Query the real external provider to confirm account, organization, production environment, and deployment fingerprint. Abort on any mismatch or unavailable provider response.
3. Obtain explicit human authorization recorded in pre-delete-authorization.json. Do not infer approval from a passing gate and do not run an automated deletion path.
4. Perform the provider's documented console/API deletion action manually. This task does not prescribe or invent a repository command for that action.
5. Write only redacted, immutable evidence. Never print or retain tokens, credentials, cookies, private URLs, or raw provider response bodies.
6. After provider success, run the exact post-delete checks against the real provider, Postgres/Zero, app, HTTP MCP, and stdio MCP surfaces. Abort and escalate on any reachable provider, reference, failed command, or empty payload.
7. Do not attempt Convex rollback. Use the proven Postgres/PITR and R2 blob recovery path only if escalation requires recovery.

## Orchestrator verification protocol

The orchestrator may validate artifacts and readiness, but may not perform the provider action. A human must complete AC-2. Each AC is fail-closed; missing or contradictory evidence blocks the next AC.

AC-1:

    set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json; PORTABLE=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json; test -s "$ART"; test -s "$PORTABLE"; /usr/bin/jq -e '.status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass"))' "$ART"; /usr/bin/jq -e '.schema == "holo.deploy.cross-tailnet-drill.v1" and .real_device_count == 2 and .healthy_service_count == 4 and .second_device_health_status == 200 and .mcp_tool_count == 44 and .funnel_endpoint_count == 0 and .credential_value_count == 0' "$PORTABLE"; test -s .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; /usr/bin/jq -e '.operator_authorized == true and .target_environment == "production" and .target_fingerprint_match == true and .provider_api_status == "reachable" and .predelete_gate_count == 5 and .portable_deployment_gate_pass == true and .app_mcp_predelete_event_count > 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json

AC-2:

    set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; test -s "$ART"; /usr/bin/jq -e '.operator_authorized == true and .provider_action_manual == true and .target_environment == "production" and (.provider_operation_id|length) > 0 and .app_mcp_predelete_event_count > 0' "$ART"

AC-3:

    set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json; test -s "$ART"; /usr/bin/jq -e '.schema == "holo.decommission.convex-deletion-receipt.v1" and .provider_status == "deleted" and .convex_deletion_performed == true and (.target_fingerprint|length) > 0 and (.provider_operation_id|length) > 0 and (.provider_response_sha256|length) == 64 and .secret_scan_hits == 0 and (.raw_provider_response_present == false)' "$ART"

AC-4:

    set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/post-delete-verification.json; test -s "$ART"; bun services/platform/src/cli/holo.ts verify:no-convex-client --roots app,components,hooks,screens,lib,holocron-mcp/src --json; bun services/platform/src/cli/holo.ts verify-no-convex-env; bun services/platform/src/cli/holo.ts verify:decommission-inventory; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'; /bin/bash scripts/e2e/run-maestro-reference-flow.sh --run; /usr/bin/jq -e '.provider_lookup == "not-found" and .source_convex_reference_count == 0 and .env_convex_reference_count == 0 and .mcp_exit_code == 0 and .app_exit_code == 0 and .documents_payload_count > 0' "$ART"

## Coding standards and source paths

Follow /Users/inference1/Projects/brain/docs/kanban/TASK-TEMPLATE.md, REQUIREMENT-CONTRACT-V1.md, SCENARIO-CONTRACT-V1.md, REQUIREMENT-TRACKING.md, CAPABILITY-CHAIN-PLANNING.md, TESTING-HIERARCHY.md, and RED-FIRST-TEST-GATE.md. Follow AGENTS.md secret-index rules and the redaction conventions in Sprint 28 HUMAN-GATE.md. Preserve existing paths and commands in services/platform/src/cli/holo.ts, services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts, and scripts/e2e/run-maestro-reference-flow.sh. Provider action syntax comes only from the provider's documented operator surface and must not be fabricated here.

## Review criteria

The reviewer must confirm exact fixed metadata, four GWT ACs and one-to-one TCs, valid visible/holdout tiers with integration/e2e services, multi-node topology that actually drives the external provider and platform/app/MCP nodes, resolvable fixtures, concrete positive and negative observations, explicit human authorization, production target identity, redacted immutable receipt, allowed evidence artifact types, no secret leakage, real post-delete no-Convex checks, and no rollback claim. Review must reject provider mocks, staging scope, implicit authorization, automated deletion, invented repository verbs, static evidence, empty journeys, or any provider action performed by the task author.

## Dependencies, out of scope, and notes

Dependencies: D08-01 through D08-04, D08-09, Sprint 28 recovery evidence, Sprint 31 MCP readiness, operator access to the provider's documented control surface, and the Postgres/Zero and R2 recovery paths. Out of scope: modifying upstream evidence, deleting Postgres/R2/Zero, changing application or package code, secret rotation, provider actions by automation, and any rollback promise. Notes: the human operator owns the irreversible external action; the task's repository checks only validate the human-produced evidence and post-delete observations.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"D08-05",
  "proposed_by":"devops-engineer",
  "tdd_mode":"skipped",
  "verification_policy":{"requires_tests":false,"requires_red_evidence":false,"requires_seeded_evidence":true},
  "fixtures":{
    "chain":{"description":"D08-01 through D08-04 plus D08-09 completion chain and both gate artifacts.","seed_method":"recorded_external","records":["five upstream status=pass records","D08-03 deletion_eligible=true","D08-03 convex_deletion_performed=false","D08-09 real_device_count=2","D08-09 healthy_service_count=4","D08-09 funnel_endpoint_count=0","evidence manifest SHA-256"]},
    "target":{"description":"Live external provider target and connected platform/app/MCP topology.","seed_method":"recorded_external","records":["provider account/org/environment","production deployment fingerprint","provider reachability response","platform Postgres/Zero endpoint","real app and MCP pre-delete observations"]},
    "receipt":{"description":"Immutable redacted provider deletion receipt.","seed_method":"recorded_external","records":["schema holo.decommission.convex-deletion-receipt.v1","provider status","operation identifier","target fingerprint","provider response SHA-256","secret scan count"]},
    "nodes":{"description":"Post-delete external provider, Postgres/Zero, app, HTTP MCP, and stdio MCP observations.","seed_method":"recorded_external","records":["provider not-found response","source/env no-Convex counts","MCP integration exit","Maestro flow payload count"]}
  },
  "requirements":[
    {
      "id":"AC-1","type":"acceptance_criterion","primary":true,
      "description":"All upstream gates, exact production target identity, provider reachability, and real app/MCP pre-delete probes are required.",
      "verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json; PORTABLE=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json; test -s \"$ART\"; test -s \"$PORTABLE\"; /usr/bin/jq -e '.status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == \"pass\"))' \"$ART\"; /usr/bin/jq -e '.schema == \"holo.deploy.cross-tailnet-drill.v1\" and .real_device_count == 2 and .healthy_service_count == 4 and .second_device_health_status == 200 and .mcp_tool_count == 44 and .funnel_endpoint_count == 0 and .credential_value_count == 0' \"$PORTABLE\"; test -s .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; /usr/bin/jq -e '.operator_authorized == true and .target_environment == \"production\" and .target_fingerprint_match == true and .provider_api_status == \"reachable\" and .predelete_gate_count == 5 and .portable_deployment_gate_pass == true and .app_mcp_predelete_event_count > 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-1","tier":"visible","test_tier":"integration","topology":"multi-node","verification_service":"jq+provider-scope+platform-app-mcp","flow_ref":"T-SYNC-018","start_ref":"chain",
        "action":{"actor":"authorized_operator","steps":["read D08-03 deletion-gate and D08-09 cross-tailnet artifacts","confirm provider account organization environment and production fingerprint on the external provider","observe Postgres/Zero platform and real app/MCP nodes","write pre-delete authorization evidence without secrets"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/D08-05/pre-delete-authorization.json"]},
        "negative_control":{"would_fail_if":["any upstream gate is absent or failed","deletion_eligible is false","convex_deletion_performed is true","provider identity is not queried","app or MCP node is not probed","mock provider is used","empty authorization artifact is accepted"]},
        "cases":[{"start_ref":"chain","action":{"actor":"authorized_operator","steps":["validate five upstream gate records plus D08-03 and D08-09 manifests","query and compare external provider production identity","probe platform app and MCP surfaces"]},"end_state":{"must_observe":["deletion_eligible='true'","predelete_gate_count=5","portable_deployment_gate_pass='true'","provider_api_status='reachable'","mcp_surface_count>=1","target_fingerprint_match='true'"],"must_not_observe":["deletion_eligible='false'","predelete_gate_count<5","portable_deployment_gate_pass='false'","provider_api_status='unknown'","mcp_surface_count=0","target_fingerprint_match='false'","empty pre-delete evidence"]}}]
      }
    },
    {
      "id":"AC-2","type":"acceptance_criterion","primary":false,
      "description":"Only an explicitly authorized human may perform the irreversible action against the confirmed production provider target.",
      "verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; test -s \"$ART\"; /usr/bin/jq -e '.operator_authorized == true and .provider_action_manual == true and .target_environment == \"production\" and (.provider_operation_id|length) > 0 and .app_mcp_predelete_event_count > 0' \"$ART\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-2","tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"external-provider+operator-authorization+platform-app-mcp","flow_ref":"T-SYNC-018","start_ref":"target",
        "action":{"actor":"authorized_operator","steps":["confirm external provider account organization environment and deployment fingerprint","record explicit human authorization reference","use only the provider's documented manual console or API control surface","observe provider operation completion and record its identifier","do not invoke a repository deletion command"]},
        "evidence":{"artifact_type":"api_response","required_capture":true,"paths":["evidence/D08-05/provider-operation-response.json"]},
        "negative_control":{"would_fail_if":["wrong deployment is selected","authorization is implicit or absent","provider action is automatic","repository automation is invoked","provider is not contacted","a mock provider response is substituted","staging scope is used"]},
        "cases":[{"start_ref":"target","action":{"actor":"authorized_operator","steps":["query the real external provider target","capture human authorization and exact scope","perform the single manual provider deletion action","capture redacted operation response"]},"end_state":{"must_observe":["target_environment='production'","operator_authorized='true'","provider_action_manual='true'","provider_operation_id_length>=1","app_mcp_predelete_event_count>=1"],"must_not_observe":["target_environment='staging'","operator_authorized='false'","provider_action_automatic='true'","provider_operation_id_length=0","provider_contacted='false'","empty provider response"]}}]
      }
    },
    {
      "id":"AC-3","type":"acceptance_criterion","primary":false,
      "description":"The deletion receipt is immutable, redacted, hash-bound, and records successful provider deletion without secrets.",
      "verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json; test -s \"$ART\"; /usr/bin/jq -e '.schema == \"holo.decommission.convex-deletion-receipt.v1\" and .provider_status == \"deleted\" and .convex_deletion_performed == true and (.target_fingerprint|length) > 0 and (.provider_operation_id|length) > 0 and (.provider_response_sha256|length) == 64 and .secret_scan_hits == 0 and (.raw_provider_response_present == false)' \"$ART\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-3","tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"external-provider+immutable-receipt+secret-scan","flow_ref":"T-SYNC-018","start_ref":"receipt",
        "action":{"actor":"authorized_operator","steps":["observe successful deletion status from the real provider","hash the provider response without retaining its raw body","write the immutable redacted receipt with target and operation identifiers","run the repository secret-safe evidence check"]},
        "evidence":{"artifact_type":"file_artifact","required_capture":true,"paths":["evidence/D08-05/deletion-receipt.json"]},
        "negative_control":{"would_fail_if":["provider status is pending or unknown","convex_deletion_performed is set before provider success","target or operation hash is missing","raw provider response is retained","secret scan finds a credential","receipt is empty or mutable"]},
        "cases":[{"start_ref":"receipt","action":{"actor":"authorized_operator","steps":["compare provider success to the confirmed target fingerprint","write redacted receipt","scan receipt and evidence directory for secret-shaped values","seal receipt for review"]},"end_state":{"must_observe":["provider_status='deleted'","convex_deletion_performed='true'","target_fingerprint_length>=1","provider_response_sha256_length=64","secret_scan_hits=0"],"must_not_observe":["provider_status='pending'","convex_deletion_performed='false'","provider_response_sha256_length=0","raw_provider_response_present='true'","secret_scan_hits>=1","empty receipt"]}}]
      }
    },
    {
      "id":"AC-4","type":"acceptance_criterion","primary":false,
      "description":"Post-delete proof shows the external provider target is not found and real Postgres/Zero-backed app and MCP journeys operate with zero Convex references.",
      "verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/post-delete-verification.json; test -s \"$ART\"; bun services/platform/src/cli/holo.ts verify:no-convex-client --roots app,components,hooks,screens,lib,holocron-mcp/src --json; bun services/platform/src/cli/holo.ts verify-no-convex-env; bun services/platform/src/cli/holo.ts verify:decommission-inventory; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'; /bin/bash scripts/e2e/run-maestro-reference-flow.sh --run; /usr/bin/jq -e '.provider_lookup == \"not-found\" and .source_convex_reference_count == 0 and .env_convex_reference_count == 0 and .mcp_exit_code == 0 and .app_exit_code == 0 and .documents_payload_count > 0' \"$ART\"",
      "maps_to_ac":null,
      "scenario":{
        "id":"AC-4","tier":"holdout","test_tier":"e2e","topology":"multi-node","verification_service":"external-provider+Postgres/Zero+app+HTTP-MCP+stdio-MCP","flow_ref":"T-SYNC-018","start_ref":"nodes",
        "action":{"actor":"authorized_operator","steps":["query the real external provider for the deleted deployment and record not-found","run verify:no-convex-client, verify-no-convex-env, and verify:decommission-inventory","run the real Sprint 31 stdio MCP integration against Postgres/Zero","run the real Maestro reference app journey and capture non-empty payload evidence"]},
        "evidence":{"artifact_type":"stdout","required_capture":true,"paths":["evidence/D08-05/post-delete-verification.stdout","evidence/D08-05/post-delete-verification.json"]},
        "negative_control":{"would_fail_if":["provider remains reachable","source or environment contains a Convex reference","app or MCP is not driven","a mock MCP or static fixture replaces the real journey","any command exits non-zero","payload evidence is empty","post-delete evidence is missing"]},
        "cases":[{"start_ref":"nodes","action":{"actor":"authorized_operator","steps":["observe provider not-found on the external control surface","run all three exact no-Convex repository commands","drive real app and MCP nodes through Postgres/Zero","record redacted outputs and payload counts"]},"end_state":{"must_observe":["provider_lookup='not-found'","source_convex_reference_count=0","env_convex_reference_count=0","mcp_exit_code=0","app_exit_code=0","documents_payload_count>=1"],"must_not_observe":["provider_lookup='reachable'","source_convex_reference_count>=1","env_convex_reference_count>=1","mcp_exit_code=1","app_exit_code=1","documents_payload_count=0","empty post-delete evidence"]}}]
      }
    },
    {"id":"TC-1","type":"test_criterion","description":"Five upstream gates including the portable two-device proof, scope identity, provider reachability, and app/MCP pre-delete evidence pass.","verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json; PORTABLE=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-09/cross-tailnet-drill.json; test -s \"$ART\"; test -s \"$PORTABLE\"; /usr/bin/jq -e '.status == \"pass\" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == \"pass\"))' \"$ART\"; /usr/bin/jq -e '.schema == \"holo.deploy.cross-tailnet-drill.v1\" and .real_device_count == 2 and .healthy_service_count == 4 and .second_device_health_status == 200 and .mcp_tool_count == 44 and .funnel_endpoint_count == 0 and .credential_value_count == 0' \"$PORTABLE\"; test -s .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; /usr/bin/jq -e '.operator_authorized == true and .target_environment == \"production\" and .target_fingerprint_match == true and .provider_api_status == \"reachable\" and .predelete_gate_count == 5 and .portable_deployment_gate_pass == true and .app_mcp_predelete_event_count > 0' .spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json","maps_to_ac":"AC-1"},
    {"id":"TC-2","type":"test_criterion","description":"Human authorization and manual provider action are recorded against production scope.","verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/pre-delete-authorization.json; test -s \"$ART\"; /usr/bin/jq -e '.operator_authorized == true and .provider_action_manual == true and .target_environment == \"production\" and (.provider_operation_id|length) > 0 and .app_mcp_predelete_event_count > 0' \"$ART\"","maps_to_ac":"AC-2"},
    {"id":"TC-3","type":"test_criterion","description":"Receipt records deleted status, hashes, and zero secret hits without a raw response.","verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/deletion-receipt.json; test -s \"$ART\"; /usr/bin/jq -e '.schema == \"holo.decommission.convex-deletion-receipt.v1\" and .provider_status == \"deleted\" and .convex_deletion_performed == true and (.target_fingerprint|length) > 0 and (.provider_operation_id|length) > 0 and (.provider_response_sha256|length) == 64 and .secret_scan_hits == 0 and (.raw_provider_response_present == false)' \"$ART\"","maps_to_ac":"AC-3"},
    {"id":"TC-4","type":"test_criterion","description":"Provider is not found and real app/MCP no-Convex checks pass after deletion.","verify":"set -euo pipefail; ART=.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-05/post-delete-verification.json; test -s \"$ART\"; bun services/platform/src/cli/holo.ts verify:no-convex-client --roots app,components,hooks,screens,lib,holocron-mcp/src --json; bun services/platform/src/cli/holo.ts verify-no-convex-env; bun services/platform/src/cli/holo.ts verify:decommission-inventory; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint31-legacy-mcp-repoint.test.ts -t 'AC-4 legacy package serves Postgres over stdio with no Convex references'; /bin/bash scripts/e2e/run-maestro-reference-flow.sh --run; /usr/bin/jq -e '.provider_lookup == \"not-found\" and .source_convex_reference_count == 0 and .env_convex_reference_count == 0 and .mcp_exit_code == 0 and .app_exit_code == 0 and .documents_payload_count > 0' \"$ART\"","maps_to_ac":"AC-4"}
  ]
}
-->
</details>
