# CUTOVER-RELEASE-001: Deterministic exact-SHA release staging, package, and safe deployment

> Status: Backlog
> Assignee: mastra-implementer
> Reviewer: mastra-reviewer
> Priority: P0
> Type: feature
> Proposed By: mastra-planner
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes
> Depends on: MK6-DATA-001
> Blocks: CUTOVER-PLAT-001, CUTOVER-DATA-001

## Outcome

One clean committed SHA produces one content-addressed release, deploys that exact package, and is independently observed while Convex still serves and Postgres writes remain fenced.

## Critical constraints

- Never package a dirty tree, moving branch name, mutable image tag, or uncommitted bytes.
- Never use `/health` alone as release authority; bind Git tree, package, OCI, Compose, and observed containers.
- Never change production database or blob volume contents in this task.
- Never deploy unless the release includes a Compose-native backup runner with versioned config and real binaries.

## Acceptance criteria

- AC-1: A clean exact SHA stages twice to byte-identical release manifests; dirty or wrong-SHA input exits nonzero before build or deploy.
- AC-2: The package pins source SHA, OCI digests, Compose SHA-256, backup-runner binaries/config, and immutable artifact paths.
- AC-3: Deployment proves the observed running containers and Compose generation equal the staged release while `data_plane=convex` and `HOLO_MIGRATION_READ_ONLY=1`.
- AC-4: A previously verified Postgres-capable release can be redeployed without recreating or restoring production data volumes.

## Test criteria

| ID | Statement | Maps | Verify |
|---|---|---|---|
| TC-1 | Dirty and wrong-SHA staging attempts exit nonzero before an image is pushed. | AC-1 | `PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-exact-release.test.ts -t 'AC-1'` |
| TC-2 | Two clean builds emit the same release-manifest SHA-256 and immutable OCI digest set. | AC-2 | `PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deterministic-package --json` |
| TC-3 | Independent container inspection equals the release manifest and retains Convex plus read-only state. | AC-3 | `PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deployed-identity --json` |
| TC-4 | Release rollback preserves the pre/post Postgres and blob volume identity strings. | AC-4 | `PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case postgres-preserving-release-rollback --json` |

## Guardrails

**WRITE-ALLOWED**

- `services/platform/Dockerfile`
- `services/platform/deploy/compose/compose.yaml`
- `services/platform/deploy/compose/pgbackrest.conf` (NEW)
- `services/platform/deploy/compose/README.md`
- `services/platform/src/deploy/production-release.ts`
- `services/platform/src/deploy/production-deploy.ts`
- `scripts/stage-holocron-release.sh` (NEW)
- `scripts/verify-cutover-exact-release.sh` (NEW)
- `services/platform/tests/integration/cutover-exact-release.test.ts` (NEW)
- `.tmp/CUTOVER-RELEASE-001/${RUN_ID}/**` (generated evidence only)

**WRITE-PROHIBITED**

- `services/platform/src/etl/**` and the immutable MK6 artifact
- `services/platform/src/backup/**` (checkpoint lane consumes the packaged runner)
- `services/platform/src/cutover/**` and durable cutover secrets
- production Postgres and blob volume contents

## Verification gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deterministic-package --json`
- `PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deployed-identity --json`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "CUTOVER-RELEASE-001",
  "tdd_mode": "red_first",
  "verification_policy": {"requires_tests": true, "requires_red_evidence": true, "requires_seeded_evidence": true},
  "fixtures": {
    "clean_release_source": {"description": "Clean detached worktree at one reviewed 40-hex commit with registry access", "seed_method": "cli", "records": ["sourceRevision: 40-hex", "gitStatusCount: 0", "expectedPlane: convex", "expectedReadOnly: 1"]},
    "deployed_release": {"description": "Real production Compose project before corpus mutation", "seed_method": "recorded_external", "records": ["origin: https://holocron.tail011a51.ts.net:44111", "postgresVolume: holocron-postgres", "blobVolume: holocron-blobs"]}
  },
  "requirements": [
    {"id":"AC-1","type":"acceptance_criterion","primary":true,"description":"A clean exact SHA stages deterministically and dirty or wrong-SHA input fails before build or deploy.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-exact-release.test.ts -t 'AC-1'","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-RELEASE-001/AC-1","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"real Git worktree and OCI builder","negative_control":{"would_fail_if":["dirty-tree rejection is removed","source SHA is hardcoded"]},"evidence":{"artifact_type":"stdout","required_capture":true},"cases":[{"start_ref":"clean_release_source","action":{"actor":"cli_user","steps":["stage the clean SHA","repeat staging","attempt dirty and wrong-SHA staging"]},"end_state":{"must_observe":["cleanRunCount:2","cleanManifestSha256Count:1","negativeExitCode != 0","negativePushCount:0"],"must_not_observe":["empty sourceRevision","mutable image tag","dirty build accepted"]}}]}},
    {"id":"AC-2","type":"acceptance_criterion","primary":false,"description":"The release manifest pins Git, OCI, Compose, backup binaries, config, and immutable package paths.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deterministic-package --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-RELEASE-001/AC-2","tier":"visible","test_tier":"integration","topology":"single-node","verification_service":"real OCI registry and staged release filesystem","negative_control":{"would_fail_if":["backup binary is omitted","Compose digest is static"]},"evidence":{"artifact_type":"file_artifact","required_capture":true},"cases":[{"start_ref":"clean_release_source","action":{"actor":"cli_user","steps":["build and push immutable images","stage the versioned release","execute packaged backup binaries with version flags"]},"end_state":{"must_observe":["sourceRevision length:40","imageDigestCount >= 2","composeSha256 length:64","pgBackRestExitCode:0","resticExitCode:0"],"must_not_observe":["empty imageDigest","latest tag","missing pgBackRest config"]}}]}},
    {"id":"AC-3","type":"acceptance_criterion","primary":false,"description":"Observed production containers equal the staged release while Convex serves and writes remain fenced.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deployed-identity --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-RELEASE-001/AC-3","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Docker Compose and Holocron health","negative_control":{"would_fail_if":["container inspection is omitted","health self-report is the only oracle"]},"evidence":{"artifact_type":"api_response","required_capture":true},"cases":[{"start_ref":"deployed_release","action":{"actor":"operator","steps":["deploy the staged release","inspect Compose and containers independently","query durable cutover state and health"]},"end_state":{"must_observe":["observedSourceRevision == stagedSourceRevision","observedImageDigestSet == stagedImageDigestSet","health.data_plane == `convex`","durableMigrationReadOnly == `1`"],"must_not_observe":["empty container digest","HOLO_MIGRATION_READ_ONLY=0","production data mutation"]}}]}},
    {"id":"AC-4","type":"acceptance_criterion","primary":false,"description":"Release rollback changes code only and preserves production Postgres and blob volumes.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case postgres-preserving-release-rollback --json","maps_to_ac":null,"satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null,"scenario":{"id":"CUTOVER-RELEASE-001/AC-4","tier":"visible","test_tier":"e2e","topology":"single-node","verification_service":"production Docker Compose volumes","negative_control":{"would_fail_if":["volume preservation assertion is removed","rollback recreates volumes"]},"evidence":{"artifact_type":"event_log","required_capture":true},"cases":[{"start_ref":"deployed_release","action":{"actor":"operator","steps":["record volume identities","deploy a prior verified Postgres-capable release","record volume identities again"]},"end_state":{"must_observe":["postgresVolumeIdentityDiff:0","blobVolumeIdentityDiff:0","rollbackPlane != `convex-fallback`"],"must_not_observe":["empty pre-volume identity","docker compose down -v","Convex rollback after PONR"]}}]}},
    {"id":"TC-1","type":"test_criterion","description":"Dirty and wrong-SHA staging attempts exit nonzero before an image is pushed.","verify":"PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/cutover-exact-release.test.ts -t 'AC-1'","maps_to_ac":"AC-1","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-2","type":"test_criterion","description":"Two clean builds emit one release-manifest SHA-256 and one immutable digest set.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deterministic-package --json","maps_to_ac":"AC-2","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-3","type":"test_criterion","description":"Observed containers equal the release manifest while durable read-only equals 1.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case deployed-identity --json","maps_to_ac":"AC-3","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null},
    {"id":"TC-4","type":"test_criterion","description":"Release rollback preserves both production volume identities.","verify":"PLATFORM_IT=1 bash scripts/verify-cutover-exact-release.sh --case postgres-preserving-release-rollback --json","maps_to_ac":"AC-4","satisfied":null,"evidence":null,"remediation":null,"last_evaluated_cycle":null,"last_evaluated_commit":null}
  ]
}
-->
