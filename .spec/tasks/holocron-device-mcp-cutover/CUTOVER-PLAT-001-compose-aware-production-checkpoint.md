# CUTOVER-PLAT-001: Compose-aware production Postgres and blob checkpoint

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: feature
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: CUTOVER-RELEASE-001
> Blocks: CUTOVER-DATA-001

## Outcome

A versioned checkpoint of the real Compose Postgres and blob volumes restores into distinct empty volumes with independently equal database, ledger, and blob identities.

## Critical constraints

- Never target host `127.0.0.1:5432`; derive the production container/volume identity from the deployed release and Compose.
- Never claim a checkpoint from absent host paths, absent binaries, status text, or un-restored backup objects.
- Never restore into the production Compose project, production volumes, or live blob root.
- Never expose credential values, database URLs, or repository passwords in receipts.

## Acceptance criteria

- AC-1: Preflight binds the exact release, Postgres container, `holocron-postgres`, `holocron-blobs`, and Compose-native backup runner; the legacy 5432/path shape fails closed.
- AC-2: One checkpoint records real pgBackRest backup identity, blob snapshot identity, production database fingerprint, and composite-manifest binding before production corpus mutation.
- AC-3: The checkpoint restores into a unique Compose project with empty volumes and matches table/row/ledger/blob inventories and content digests independently.
- AC-4: Missing, stale, modified, or non-restorable checkpoint evidence exits nonzero and cannot unblock production apply.

## Test criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | The real Compose target passes while the 127.0.0.1:5432 legacy target fails before backup. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-compose-checkpoint.test.ts -t 'AC-1'` |
| TC-2 | The checkpoint receipt contains nonempty Postgres, blob, release, and manifest identities. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case create --json` |
| TC-3 | A distinct-volume restore reports zero table, ledger, and blob mismatches. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case restore --json` |
| TC-4 | A modified checkpoint object exits nonzero with production volume hashes unchanged. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case corruption-negative --json` |

## Guardrails

**WRITE-ALLOWED**

- `services/platform/src/backup/compose-checkpoint.ts` (NEW)
- `services/platform/src/backup/config.ts`
- `services/platform/src/backup/index.ts`
- `services/platform/src/cli/holo.ts` (thin dispatch and help only)
- `scripts/verify-cutover-compose-checkpoint.sh` (NEW)
- `services/platform/tests/integration/cutover-compose-checkpoint.test.ts` (NEW)
- `.tmp/CUTOVER-PLAT-001/${RUN_ID}/**` (generated evidence only)
- operator-authorized backup repository and disposable restore Compose project/volumes at runtime

**WRITE-PROHIBITED**

- production Postgres and blob volume contents
- `services/platform/deploy/**` and `services/platform/Dockerfile` (release lane)
- `services/platform/src/etl/**` and the immutable MK6 artifact
- durable cutover plane/read-only keys

## Verification gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case create --json`
- `PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case restore --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version":"1",
  "task_id":"CUTOVER-PLAT-001",
  "tdd_mode":"red_first",
  "verification_policy":{"requires_tests":true,"requires_red_evidence":true,"requires_seeded_evidence":true},
  "fixtures":{
    "production_compose":{"description":"Observed exact release with real production Postgres and blob named volumes","seed_method":"recorded_external","records":["postgresHostPort:44112","postgresVolume:holocron-postgres","blobVolume:holocron-blobs","migrationReadOnly:1"]},
    "restore_target":{"description":"Unique absent Compose project with distinct empty Postgres and blob volumes","seed_method":"cli","records":["projectName:holocron-restore-<run-id>","preRestoreRowCount:0","preRestoreBlobCount:0"]}
  },
  "requirements":[
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"Compose-aware preflight binds the exact production containers and rejects the legacy 5432/path shape.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-compose-checkpoint.test.ts -t 'AC-1'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-001/AC-1","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"production Docker Compose and backup runner","negative_control":{"would_fail_if":["Compose inspection is omitted","127.0.0.1:5432 is hardcoded"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"production_compose","action":{"actor":"operator","steps":["inspect Compose containers and mounts","run real preflight","run the legacy-target negative"]},"end_state":{"must_observe":["observedPostgresHostPort:44112","observedPostgresVolume == `holocron-postgres`","observedBlobVolume == `holocron-blobs`","legacyExitCode != 0"],"must_not_observe":["empty container identity","acceptedPort:5432","missing backup binary accepted"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"A real checkpoint binds Postgres, blobs, release, and immutable composite manifest before production mutation.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case create --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-001/AC-2","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Postgres blob volume pgBackRest restic and backup repository","negative_control":{"would_fail_if":["backup commands are stubbed","blob snapshot is omitted"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"production_compose","action":{"actor":"operator","steps":["create pgBackRest checkpoint","create blob snapshot","derive independent database and blob fingerprints","write signed receipt"]},"end_state":{"must_observe":["pgBackRestBackupId length >= 1","blobSnapshotId length >= 1","releaseManifestSha256 length:64","compositeManifestSha256 length:64"],"must_not_observe":["empty backup identifier","checkpoint after production load","credential value in receipt"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"Independent restore into distinct empty volumes equals the checkpoint database, ledger, and blob identities.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case restore --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-001/AC-3","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"disposable real Docker Compose Postgres and blob volumes","negative_control":{"would_fail_if":["restore is a no-op","parity queries are removed"]},"evidence":{"artifact_type":"db_query","required_capture":true},"cases":[{"start_ref":"restore_target","action":{"actor":"operator","steps":["restore Postgres and blobs","query table and ledger inventories","rehash every restored blob","compare to checkpoint"]},"end_state":{"must_observe":["restoredTableMismatchCount:0","restoredLedgerMismatchCount:0","restoredBlobMismatchCount:0","restoreProject != `holocron`"],"must_not_observe":["empty restored inventory","production volume mounted","unverified restore status"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Corrupt or stale checkpoint evidence fails closed without changing production volumes.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case corruption-negative --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-PLAT-001/AC-4","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"real backup repository and production Compose observations","negative_control":{"would_fail_if":["checkpoint digest validation is removed","production hashes are not re-read"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"production_compose","action":{"actor":"operator","steps":["corrupt a disposable checkpoint derivative","attempt validation","re-observe production volume identities"]},"end_state":{"must_observe":["validationExitCode != 0","productionPostgresIdentityDiff:0","productionBlobIdentityDiff:0","unblockReceiptCount:0"],"must_not_observe":["empty failure code","production restore attempted","green stale receipt"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"The Compose target passes and the legacy 5432 target fails before backup.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-compose-checkpoint.test.ts -t 'AC-1'","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-2","type":"test_criterion","description":"The checkpoint receipt contains nonempty Postgres, blob, release, and manifest identities.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case create --json","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-3","type":"test_criterion","description":"The distinct restore reports zero table, ledger, and blob mismatches.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case restore --json","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-4","type":"test_criterion","description":"A corrupt checkpoint fails with unchanged production volume identities.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-compose-checkpoint.sh --case corruption-negative --json","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}
  ]
}
-->
