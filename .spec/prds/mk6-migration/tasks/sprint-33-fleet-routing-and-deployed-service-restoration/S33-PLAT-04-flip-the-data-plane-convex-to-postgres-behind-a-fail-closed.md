# S33-PLAT-04: Flip production reads to Postgres while retaining the write fence

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: FEATURE
> Effort: M · 195 min
> Sprint: sprint-33-fleet-routing-and-deployed-service-restoration
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: CUTOVER-DATA-001
> Blocks: CUTOVER-PLAT-002, S33-MCP-03

## Outcome

Production serves the reconciled Postgres corpus at the exact release while durable `HOLO_MIGRATION_READ_ONLY=1` remains armed for separate PONR authorization.

## Critical constraints

- Never flip from the isolated MK6 receipt alone; require the fresh production-apply and production-reconcile receipt.
- Never write or delete `HOLO_MIGRATION_READ_ONLY`; prove its durable value is `1` before and after every flip attempt.
- Never weaken the Convex-to-410 branch; it remains the pre-flip and pre-PONR rollback negative control.
- Never allow Convex re-point after `data_plane_ponr` exists or an ordinary Postgres write is accepted.

## Acceptance criteria

- AC-1: Missing, stale, mismatched, or non-read-only production proof refuses before control-plane mutation and leaves Convex returning 410.
- AC-2: A fresh exact-release production reconcile permits only the data-plane/rollback-target flip; a migrated document returns byte-equal Postgres content and read-only remains 1.
- AC-3: Re-running the same flip is a no-op with unchanged durable control bytes and read-only still 1.
- AC-4: Before PONR, explicit rollback may re-point to frozen Convex and restore 410; after a simulated PONR marker the same request refuses without changing Postgres.

## Test criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Every invalid proof matrix exits nonzero with Convex and read-only 1 unchanged. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-1'` |
| TC-2 | The successful flip returns the pre-captured document bytes from Postgres and retains read-only 1. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --case flip-read-only --json` |
| TC-3 | A second flip reports already_flipped with a byte-identical durable control file. | AC-3 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-3'` |
| TC-4 | Convex re-point succeeds only before PONR and refuses after the marker exists. | AC-4 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-4'` |

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/data-plane-flip.ts` (NEW)
- `scripts/verify-s33-data-plane-flip.sh` (NEW)
- `services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts` (NEW)
- `services/platform/src/cli/holo.ts` (thin dispatch and help only)
- `.tmp/S33-PLAT-04/${RUN_ID}/**` (generated evidence only)

**WRITE-PROHIBITED**

- `services/platform/src/cutover/data-plane-content.ts` and the Convex-to-410 branch
- `services/platform/src/cutover/soak-fence.ts`, `ponr.ts`, and `rollback-repoint.ts`
- `services/platform/src/etl/**`, backup/checkpoint code, and immutable cutover receipts
- `services/platform/deploy/**`, MCP source, frozen tool schemas, and production corpus rows

## Boundary contracts

- Consume `CUTOVER-DATA-001` only when manifest, checkpoint, release, target, and production-reconcile hashes agree freshly.
- Write exactly `HOLO_DATA_PLANE=postgres`, `HOLO_ROLLBACK_TARGET=postgres`, and the flip timestamp through the durable control-plane API.
- Re-read durable read-only state after the write; any value other than `1` makes the flip fail and re-point to the pre-PONR state.
- Leave write authorization exclusively to `CUTOVER-PLAT-002`.

## Verification gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case reconcile --json`
- `PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --case flip-read-only --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"S33-PLAT-04",
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{
    "production_reconciled":{"description":"Fresh exact-release production reconcile receipt with a discovered migrated document and no PONR","seed_method":"recorded_external","records":["dataPlane:convex","migrationReadOnly:1","productionMismatchCount:0","ponrCount:0","documentContentSha256:64-hex"]},
    "plane_control":{"description":"Real durable cutover control read through the consolidated secrets path","seed_method":"cli","records":["HOLO_DATA_PLANE:convex","HOLO_ROLLBACK_TARGET:convex-frozen","HOLO_MIGRATION_READ_ONLY:1"]}
  },
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"Invalid production proof refuses before mutation and retains Convex 410 plus read-only 1.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-1'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"S33-PLAT-04/AC-1","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"production reconcile verifier durable secrets and Hono","negative_control":{"would_fail_if":["proof validation is removed","read-only preflight is omitted"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"plane_control","action":{"actor":"operator","steps":["substitute one stale or mismatched receipt","run the flip","read durable controls","request the migrated document"]},"end_state":{"must_observe":["flipExitCode != 0","durableDataPlane == `convex`","durableMigrationReadOnly == `1`","documentStatus:410"],"must_not_observe":["empty failure code","data_plane=postgres","HOLO_MIGRATION_READ_ONLY=0"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"A fresh production proof flips reads to Postgres and retains durable read-only 1.","verify":"PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --case flip-read-only --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"S33-PLAT-04/AC-2","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"deployed Holocron Hono Postgres and durable secrets","negative_control":{"would_fail_if":["the plane write is a no-op","document bytes are static"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"production_reconciled","action":{"actor":"operator","steps":["freshly verify production reconcile","run the flip","request the discovered document","re-read durable controls"]},"end_state":{"must_observe":["documentStatus:200","documentContentSha256 == productionContentSha256","durableDataPlane == `postgres`","durableRollbackTarget == `postgres`","durableMigrationReadOnly == `1`"],"must_not_observe":["empty document content","retired_cloud_plane_removed_d08_02","HOLO_MIGRATION_READ_ONLY=0"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"Repeated flip is byte-idempotent and retains read-only 1.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-3'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"S33-PLAT-04/AC-3","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"durable secrets and data-plane flip CLI","negative_control":{"would_fail_if":["idempotency check is removed","durable file is rewritten"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"production_reconciled","action":{"actor":"operator","steps":["record durable control SHA-256","run the flip again","record durable control SHA-256"]},"end_state":{"must_observe":["alreadyFlipped:true","durableControlSha256Diff:0","durableMigrationReadOnly == `1`"],"must_not_observe":["empty pre-control hash","new flip timestamp","HOLO_MIGRATION_READ_ONLY=0"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Convex rollback is available only before PONR and refuses after PONR without changing Postgres.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-4'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"S33-PLAT-04/AC-4","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"durable cutover controls Postgres PONR ledger and Hono","negative_control":{"would_fail_if":["PONR guard is removed","Convex 410 oracle is omitted"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"plane_control","action":{"actor":"operator","steps":["perform pre-PONR re-point","verify 410","install a disposable PONR marker in an isolated database","attempt re-point again"]},"end_state":{"must_observe":["prePonrRepointExitCode:0","prePonrDocumentStatus:410","postPonrRepointExitCode != 0","postPonrDataPlane == `postgres`"],"must_not_observe":["empty PONR error","post-PONR data_plane=convex","production PONR mutation"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Every invalid proof leaves Convex and read-only 1 unchanged.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-1'","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-2","type":"test_criterion","description":"Successful flip serves byte-equal Postgres content with durable read-only 1.","verify":"PLATFORM_IT=1 bash scripts/verify-s33-data-plane-flip.sh --case flip-read-only --json","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-3","type":"test_criterion","description":"Repeated flip reports already_flipped with unchanged control bytes.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-3'","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-4","type":"test_criterion","description":"Convex re-point succeeds before PONR and refuses after PONR.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/s33-plat-04-data-plane-flip.test.ts -t 'AC-4'","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}
  ]
}
-->
