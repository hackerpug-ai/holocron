# CUTOVER-DATA-001: Frozen immutable composite artifact production apply

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: feature
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: MK6-DATA-001, CUTOVER-RELEASE-001, CUTOVER-PLAT-001
> Blocks: S33-PLAT-04

## Outcome

The reviewed MK6 artifact is applied once to production under a durable local freeze and reconciles symmetrically while Convex still serves and Postgres remains read-only.

## Critical constraints

- Never extend `MK6-DATA-001` to production; consume its immutable isolated-green artifact byte-for-byte.
- Never load if current canonical source identities differ from the artifact or the local SQLite/blob write freeze is not durably enforced.
- Never load without the independently restored `CUTOVER-PLAT-001` checkpoint and exact `CUTOVER-RELEASE-001` runtime.
- Never flip the serving plane or lift `HOLO_MIGRATION_READ_ONLY` in this task.

## Acceptance criteria

- AC-1: A durable reversible local SQLite/blob freeze rejects a real local mutation and the current source identities equal the reviewed MK6 manifest.
- AC-2: Production receives the exact artifact through the reviewed transform with manifest, code, release, checkpoint, and target identities bound in one receipt.
- AC-3: Symmetric production reconciliation reports zero missing/extra identities, FK orphans, checksum, blob, embedding, provenance, or API witness mismatches.
- AC-4: Drift, wrong target, load failure, or reconciliation failure restores the bound checkpoint before PONR and leaves Convex serving with both write fences armed.

## Test criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | A real local mutation fails while the frozen source identity remains equal to the MK6 manifest. | AC-1 | `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case local-freeze --json` |
| TC-2 | Production apply reports the same manifest and transform SHA-256 used by the isolated candidate. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case apply --json` |
| TC-3 | Production reconcile reports zero source-to-target and target-to-source mismatches. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case reconcile --json` |
| TC-4 | Injected post-load corruption restores the checkpoint and leaves Convex plus both fences armed. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case restore-negative --json` |

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/cutover/local-corpus-freeze.ts` (NEW)
- `services/platform/src/cutover/production-corpus-apply.ts` (NEW)
- `services/platform/src/cli/holo.ts` (thin dispatch and help only)
- `scripts/verify-cutover-production-apply.sh` (NEW)
- `services/platform/tests/integration/cutover-production-composite-apply.test.ts` (NEW)
- `.tmp/CUTOVER-DATA-001/${RUN_ID}/**` (generated evidence only)
- production Postgres/blob volumes at runtime only after all preconditions pass
- canonical local corpus permissions/freeze marker at runtime only; content bytes are immutable

**WRITE-PROHIBITED**

- `services/platform/src/etl/**`, `scripts/verify-mk6-data-plane-truth.sh`, and `.tmp/MK6-DATA-001/**`
- `services/platform/deploy/**` and release manifests
- `services/platform/src/cutover/data-plane-flip.ts`, `ponr.ts`, and `rollback-repoint.ts`
- `HOLO_DATA_PLANE` and lifting `HOLO_MIGRATION_READ_ONLY`

## Verification gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case local-freeze --json`
- `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case apply --json`
- `PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case reconcile --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"CUTOVER-DATA-001",
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{
    "reviewed_mk6_artifact":{"description":"Immutable isolated-green MK6 composite artifact and reviewer receipt","seed_method":"recorded_external","records":["manifestSchema:holocron.mk6.composite-corpus.v2","manifestSha256:64-hex","isolatedMismatchCount:0","artifactWriteCount:0"]},
    "production_preload":{"description":"Exact fenced production release plus independently restored checkpoint","seed_method":"recorded_external","records":["dataPlane:convex","migrationReadOnly:1","checkpointRestoreMismatchCount:0","productionPonrCount:0"]}
  },
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"A durable local freeze rejects a real mutation and preserves identity equality with the reviewed artifact.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case local-freeze --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-DATA-001/AC-1","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"canonical SQLite blob filesystem and local MCP write surface","negative_control":{"would_fail_if":["the local freeze is a no-op","source drift comparison is removed"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"reviewed_mk6_artifact","action":{"actor":"operator","steps":["arm the durable local freeze","attempt one namespaced local mutation","recompute canonical source identities"]},"end_state":{"must_observe":["localMutationExitCode != 0","canonicalSourceIdentity == artifactSourcePostIdentity","sourceContentMutationCount:0","freezeState == `armed`"],"must_not_observe":["empty freeze receipt","accepted local write","modified MK6 artifact"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"Production apply uses the exact reviewed artifact and transform bound to release, checkpoint, and target identities.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case apply --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-DATA-001/AC-2","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Postgres blob volumes and exact release loader","negative_control":{"would_fail_if":["a different artifact is substituted","production target validation is omitted"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"production_preload","action":{"actor":"operator","steps":["validate all receipt bindings","invoke the exact release loader once","capture transaction and blob promotion identities"]},"end_state":{"must_observe":["productionArtifactSha256 == isolatedArtifactSha256","productionTransformSha256 == isolatedTransformSha256","checkpointId length >= 1","productionApplyCount:1"],"must_not_observe":["empty artifact hash","second transform path","serving-plane flip"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"Production reconciles symmetrically with zero row, relationship, blob, embedding, provenance, or API witness mismatches.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case reconcile --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-DATA-001/AC-3","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Postgres blob storage and pre-existing authenticated Hono","negative_control":{"would_fail_if":["target-to-source comparison is omitted","Hono is stubbed"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"production_preload","action":{"actor":"operator","steps":["recompute source and target inventories","verify relationships blobs embeddings and provenance","read both origin witnesses through Hono"]},"end_state":{"must_observe":["discoveredSourceIdentityCount >= 1","honoWitnessStatus:200","sourceToTargetMismatchCount:0","targetToSourceMismatchCount:0","fkOrphanCount:0","blobEmbeddingChecksumMismatchCount:0","apiWitnessMismatchCount:0"],"must_not_observe":["empty target inventory","unexpected target row","self-started Hono"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Any apply or reconcile failure restores the checkpoint before PONR and retains Convex plus both fences.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case restore-negative --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-DATA-001/AC-4","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Compose checkpoint restore and durable cutover controls","negative_control":{"would_fail_if":["restore on failure is removed","read-only state is not rechecked"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"production_preload","action":{"actor":"operator","steps":["inject disposable post-load corruption","force reconcile failure","restore the bound checkpoint","re-read durable controls"]},"end_state":{"must_observe":["reconcileExitCode != 0","restoredCheckpointMismatchCount:0","durableDataPlane == `convex`","durableMigrationReadOnly == `1`","ponrCount:0"],"must_not_observe":["empty restore receipt","partial production corpus","HOLO_MIGRATION_READ_ONLY=0"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"A real local mutation fails and source identity equals the MK6 manifest.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case local-freeze --json","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-2","type":"test_criterion","description":"Production and isolated receipts carry equal artifact and transform hashes.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case apply --json","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-3","type":"test_criterion","description":"Production reconcile reports zero mismatch counts in both directions.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case reconcile --json","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-4","type":"test_criterion","description":"Injected corruption restores the checkpoint with Convex and both fences armed.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-production-apply.sh --case restore-negative --json","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}
  ]
}
-->
