# CUTOVER-PLAT-002: Composite-bound enable writes and Postgres PONR

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: feature
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: CUTOVER-DATA-001, S33-PLAT-04
> Blocks: CUTOVER-MCP-001

## Outcome

A separate authorized command binds all cutover receipts, lifts the Postgres write fence, proves one real write, and records an immutable Postgres-only PONR.

## Critical constraints

- Never let the S33 read flip implicitly lift `HOLO_MIGRATION_READ_ONLY`.
- Never reuse legacy export-watermark or Convex escape-hatch evidence as the composite/checkpoint authorization oracle.
- Never allow Convex rollback after PONR or any accepted ordinary Postgres write.
- Never delete or restore production Postgres during post-PONR release rollback.

## Acceptance criteria

- AC-1: Missing, stale, mismatched, or unauthorized manifest/checkpoint/reconcile/release/flip receipts refuse before fence lift or write.
- AC-2: A separate operator authorization lifts the fence, commits one namespaced Postgres write, and records immutable PONR bound to all receipt hashes.
- AC-3: After PONR, Convex re-point and checkpoint restore refuse; a verified Postgres-capable release rollback preserves the accepted row and database identity.
- AC-4: Re-entry is idempotent, while any crash between fence lift, first write, and PONR re-arms the fence and emits no green PONR receipt.

## Test criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Each missing or mismatched receipt leaves read-only at 1 and creates zero writes. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-composite-enable-writes.test.ts -t 'AC-1'` |
| TC-2 | The PONR row stores all receipt hashes and the independently observed first-write digest. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case enable --json` |
| TC-3 | Convex re-point refuses after PONR while release rollback preserves the accepted row. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case post-ponr-rollback --json` |
| TC-4 | Injected crash windows re-arm read-only and emit zero green PONR receipts. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case crash-window --json` |

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/ponr.ts`
- `services/platform/src/cutover/ponr-marker.ts`
- `services/platform/src/cutover/rollback-repoint.ts`
- `services/platform/src/cutover/soak-fence.ts`
- `services/platform/src/db/schema/cutover.ts`
- `services/platform/src/db/schema/index.ts`
- `services/platform/src/db/migrations/0041_cutover_composite_ponr_binding.sql` (NEW)
- `services/platform/src/cli/holo.ts` (thin dispatch and help only)
- `scripts/verify-cutover-enable-writes.sh` (NEW)
- `services/platform/tests/integration/cutover-composite-enable-writes.test.ts` (NEW)
- `.tmp/CUTOVER-PLAT-002/${RUN_ID}/**` (generated evidence only)

**WRITE-PROHIBITED**

- `services/platform/src/etl/**`, backup/checkpoint code, and immutable cutover artifacts
- `services/platform/deploy/**` and release packages
- frozen MCP names, schemas, manifest, and executor behavior
- production row deletion or checkpoint restore after PONR

## Verification gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case enable --json`
- `PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case post-ponr-rollback --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"CUTOVER-PLAT-002",
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{
    "bound_cutover":{"description":"Fresh mutually bound production receipts while Postgres serves read-only and PONR is absent","seed_method":"recorded_external","records":["manifestSha256:64-hex","checkpointReceiptSha256:64-hex","productionReconcileSha256:64-hex","releaseManifestSha256:64-hex","flipReceiptSha256:64-hex","migrationReadOnly:1","ponrCount:0"]},
    "authorized_write":{"description":"Unique absent production namespace and operator authorization resolved without logging secret bytes","seed_method":"public_api","records":["namespace:ponr-<run-id>","preWriteRowCount:0","operatorAuthorizationPresent:true"]}
  },
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"Missing, stale, mismatched, or unauthorized receipts refuse before fence lift or write.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-composite-enable-writes.test.ts -t 'AC-1'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-002/AC-1","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"durable cutover receipts Postgres and Hono","negative_control":{"would_fail_if":["receipt binding is removed","authorization is hardcoded"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"bound_cutover","action":{"actor":"operator","steps":["replace one receipt hash","run enable-writes","repeat without authorization","query durable fence and namespace"]},"end_state":{"must_observe":["negativeExitCode != 0","durableMigrationReadOnly == `1`","namespaceRowCount:0","ponrCount:0"],"must_not_observe":["empty failure code","accepted ordinary write","green PONR receipt"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"Separate authorization lifts the fence, proves one real Postgres write, and records receipt-bound immutable PONR.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case enable --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-002/AC-2","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Hono Postgres durable secrets and PONR ledger","negative_control":{"would_fail_if":["the first write is a no-op","PONR hashes are omitted"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"authorized_write","action":{"actor":"operator","steps":["validate all bound receipts","authorize enable-writes separately","write one namespaced document through Hono","reselect it directly","read the immutable PONR row"]},"end_state":{"must_observe":["HTTPStatus:201","reselectedRowCount:1","durableMigrationReadOnly == `0`","ponrCount:1","boundReceiptHashCount:5"],"must_not_observe":["empty write id","PONR without committed write","credential bytes in evidence"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"Post-PONR rollback preserves Postgres and forbids Convex re-point or checkpoint restore.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case post-ponr-rollback --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-002/AC-3","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production rollback CLI Docker Compose and Postgres","negative_control":{"would_fail_if":["Convex rollback guard is removed","database preservation is not checked"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"authorized_write","action":{"actor":"operator","steps":["attempt Convex re-point","attempt checkpoint restore","deploy a prior verified Postgres-capable release","reselect the accepted row"]},"end_state":{"must_observe":["convexRepointExitCode != 0","checkpointRestoreExitCode != 0","durableDataPlane == `postgres`","acceptedRowCount:1","databaseIdentityDiff:0"],"must_not_observe":["empty PONR guard","data_plane=convex","production volume recreation"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Enable-writes is idempotent and crash windows re-arm the fence without a green PONR receipt.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case crash-window --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-002/AC-4","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"production durable fence Postgres audit and PONR ledger","negative_control":{"would_fail_if":["crash recovery is a no-op","idempotency check is removed"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"bound_cutover","action":{"actor":"operator","steps":["inject failure after fence lift","inspect recovery","complete one healthy run","invoke the same authorization again"]},"end_state":{"must_observe":["crashExitCode != 0","postCrashMigrationReadOnly == `1`","postCrashGreenReceiptCount:0","healthyPonrCount:1","secondRunAlreadyRecorded:true"],"must_not_observe":["empty recovery audit","writes open without PONR","duplicate PONR row"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Every invalid receipt matrix leaves read-only at 1 with zero writes.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-composite-enable-writes.test.ts -t 'AC-1'","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-2","type":"test_criterion","description":"The immutable PONR row stores five receipt hashes and one first-write digest.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case enable --json","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-3","type":"test_criterion","description":"Convex re-point refuses after PONR and release rollback preserves the accepted row.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case post-ponr-rollback --json","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-4","type":"test_criterion","description":"Crash-window injection re-arms read-only and emits zero green PONR receipts.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-enable-writes.sh --case crash-window --json","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}
  ]
}
-->
