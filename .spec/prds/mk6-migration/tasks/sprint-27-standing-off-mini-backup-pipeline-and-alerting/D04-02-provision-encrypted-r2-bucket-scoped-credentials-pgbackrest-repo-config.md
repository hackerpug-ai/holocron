# D04-02 — Provision encrypted R2 bucket + scoped credentials + pgBackRest repo config

## What this does

Provision an encrypted Cloudflare R2 bucket for off-mini backups, create least-privilege scoped credentials (bucket-only, separate from app secrets), and configure the pgBackRest remote repository to point at it. This is the foundation for CAP-BAK-01: every downstream backup job (D04-03 WAL/base backups, D04-04 restic mirror) writes here, and D04-05 alerting depends on jobs being able to reach this repo.

Provides: an encrypted R2 bucket with SSE + versioning; a scoped R2 API token limited to the single backup bucket; the pgBackRest repo config (`repo1-*` S3 stanza pointing at the R2 endpoint) with `stanza-create` succeeding against real R2; credentials stored in the consolidated secrets store (`holo secrets`), never in source.

## Why

- The mini is the only compute/storage — a local hardware failure is a total-loss event unless a copy exists off-mini (UC-PLAT-06). R2 is that off-mini target.
- Credentials MUST be least-privilege and separate from the app DB/Fleet keys; the bucket MUST be encrypted at rest and in transit (D04-06 audits this).
- pgBackRest must own the WAL+base-backup repo so D04-03 can archive continuously with no WAL-continuity gap.
- Grounded in: UC-PLAT-06, T-PLAT-021, CAP-BAK-01.

## How to verify

- `aws s3api head-bucket --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" && aws s3api get-bucket-encryption --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" | grep -E 'AES256|aws:kms|SSE'` → Exit 0 (bucket exists + SSE on)
- `aws s3api get-bucket-versioning --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" | grep -E 'Enabled|Suspended'` → Exit 0 (versioning on)
- credential scoping: the R2 token policy enumerates only the backup bucket ARN + a limited action set and has NO `*` Resource and NO `s3:*` Action
- `pgbackrest --stanza=main stanza-create` → Exit 0 (repo reachable + writable against real R2)

## Scope

Writes: `services/platform/src/backup/r2-provision.ts` (NEW — bucket/credential/repo bootstrap helper), `services/platform/src/backup/config.ts` (NEW — R2 endpoint/bucket/prefix config keys read from secrets), `services/platform/src/cli/holo.ts` (MODIFY — add `holo backup:provision` bootstrap command), `~/Library/LaunchAgents/`-adjacent notes only if a launchd unit is introduced (prefer reusing Sprint-06 supervisor)

Prohibited: `services/platform/src/db/**` (MODIFY — Sprint 04 owns Postgres schema), any hardcoded credential in tracked files, the app's DATABASE_URL/Fleet secret scope

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-02 — Provision encrypted R2 bucket + scoped credentials + pgBackRest repo config
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Encrypted Cloudflare R2 bucket provisioned (SSE + versioning); least-privilege scoped credentials created (backup-bucket-only, separate from app secrets, stored in the consolidated secrets store); pgBackRest repo configured with an S3 stanza pointing at the R2 endpoint and stanza-create succeeds. All proven against real R2 (aws s3api / mc), not mocked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST provision an R2 bucket with SSE (AES-256 or SSE-KMS) and bucket versioning enabled
- MUST create scoped R2 credentials limited to the single backup bucket/prefix (least privilege)
- MUST keep the R2 token separate from the app DATABASE_URL/Fleet secrets
- MUST store credentials in the consolidated secrets store (`holo secrets`), referenced by env var, never hardcoded
- MUST configure a pgBackRest `repo1-*` S3 stanza pointing at the R2 endpoint and verify `stanza-create` against real R2
- MUST enforce minimum TLS 1.2 on the R2 endpoint
- NEVER use wildcard (`*`) credentials or account-wide tokens
- NEVER hardcode credentials in source or logs
- NEVER report the repo as configured without a real `stanza-create` succeeding against R2
- STRICTLY bucket encryption + versioning are queried from the real bucket, not asserted from config text
- STRICTLY the credential policy is inspected (actions + resources enumerated), not trusted from a label
- STRICTLY pgBackRest writes a probe object to R2 during stanza-create (real round-trip)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): encrypted R2 bucket exists with SSE + versioning, verified against real R2
- [ ] AC-2: R2 credentials are least-privilege scoped to the backup bucket only, separate from app secrets
- [ ] AC-3: pgBackRest repo configured and `stanza-create` succeeds against real R2
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — proven by real R2)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] encrypted R2 bucket exists with SSE + versioning (flow_ref T-PLAT-021)
  GIVEN no R2 bucket exists for backups
  WHEN  the operator provisions the R2 bucket via `holo backup:provision` (or wrangler/CF API)
  THEN  `aws s3api head-bucket` succeeds; `get-bucket-encryption` returns an SSE algorithm (AES256 or aws:kms); `get-bucket-versioning` shows Enabled
  TEST_TIER: integration · VERIFICATION_SERVICE: Cloudflare-R2 · TDD_STATE: red
  SCENARIO — start_ref: no_r2_bucket · evidence: api_response
    NEGATIVE_CONTROL: would fail if the bucket does not exist (head-bucket errors); SSE is null/disabled (get-bucket-encryption empty); versioning off (MFADelete/empty); a config file claims encryption without the bucket actually having SSE; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: aws s3 ls lists the bucket name; get-bucket-encryption JSON contains ServerSideEncryption AES256 or aws:kms; get-bucket-versioning Status = Enabled; endpoint is https:// (TLS)
    MUST_NOT_OBSERVE: head-bucket returns 404/403; SSE config null or missing; versioning Status empty; http:// (cleartext) endpoint

AC-2 R2 credentials are least-privilege scoped, separate from app secrets (flow_ref T-PLAT-021)
  GIVEN the bucket exists from AC-1
  WHEN  the operator creates a scoped R2 API token and stores it in the secrets store
  THEN  the token policy enumerates only the backup bucket ARN + limited actions (PutObject/GetObject/ListBucket/DeleteObject); NO `*` Resource; NO `s3:*` Action; the token is distinct from DATABASE_URL/Fleet keys; `holo secrets:doctor` shows the R2 secret present (value not printed)
  TEST_TIER: integration · VERIFICATION_SERVICE: R2-policy-inspect · TDD_STATE: red
  SCENARIO — start_ref: r2_bucket_exists · evidence: api_response
    NEGATIVE_CONTROL: would fail if the policy has Resource `*` or Action `s3:*`; the token equals the app DB key; the review trusts a declared scope without enumerating actions/resources; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: policy JSON Resource is the exact backup bucket ARN; Action list is the limited set; secrets store has an R2 entry distinct from DATABASE_URL/Fleet; secrets:doctor exit 0 and does not print the value
    MUST_NOT_OBSERVE: Resource `*`; Action `s3:*` or AdministratorAccess; the R2 token string in any tracked file; a printed secret value in secrets:doctor output

AC-3 pgBackRest repo configured, stanza-create succeeds (flow_ref T-PLAT-021)
  GIVEN the bucket + scoped credentials exist
  WHEN  the operator configures the pgBackRest S3 stanza and runs stanza-create
  THEN  pgBackRest writes a probe object to R2 and stanza-create exits 0; `pgbackrest --stanza=main check` reports the repo reachable
  TEST_TIER: integration · VERIFICATION_SERVICE: pgBackRest+R2 · TDD_STATE: red
  SCENARIO — start_ref: scoped_credentials · evidence: stdout
    NEGATIVE_CONTROL: would fail if the repo-path/endpoint is misconfigured (auth or permission failure); stanza-create is skipped/assumed; the repo cipher is none (plaintext); a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: pgbackrest stanza-create exit 0; pgbackrest check reports stanza status OK; an R2 object exists under the repo prefix after stanza-create (aws s3 ls shows it); repo-cipher-type is set (not none)
    MUST_NOT_OBSERVE: stanza-create auth/permission error; check reports an error/missing stanza; repo prefix empty after stanza-create; cipher-type=none

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/r2-provision.ts (NEW)
- services/platform/src/backup/config.ts (NEW)
- services/platform/src/cli/holo.ts (MODIFY — add `holo backup:provision`)
writeProhibited: services/platform/src/db/** (MODIFY — Sprint 04 owns Postgres schema), hardcoded credentials in tracked files, the app DATABASE_URL/Fleet secret scope

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:79-88 [UC-PLAT-06 remote backup & DR]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 hops: WAL → pgBackRest archive-push → encrypted repo on R2]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 [T-PLAT-021 WAL+base backups to remote bucket]
4. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-46 [AP-7 single-user tailnet trust — keys ARE the security; AP-9 local durability requires remote durability]
5. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1710-1760 [holo secrets / secrets:doctor — where R2 creds are stored/referenced]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Bucket + SSE + versioning: `aws s3api head-bucket --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" && aws s3api get-bucket-encryption --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" | grep -E 'AES256|aws:kms|SSE' && aws s3api get-bucket-versioning --bucket "$R2_BUCKET_NAME" --endpoint-url "$R2_ENDPOINT" | grep -E 'Enabled|Suspended'` → Exit 0
- Credential scoping: policy inspect shows backup-bucket ARN only, limited actions, no `*` → Exit 0; `holo secrets:doctor` exit 0, R2 secret present + value not printed
- pgBackRest repo: `pgbackrest --stanza=main stanza-create && pgbackrest --stanza=main check` → Exit 0; `aws s3 ls "$R2_BUCKET/pgbackrest/" --endpoint-url "$R2_ENDPOINT"` non-empty
- No leaked secrets: `git grep -nIE 'R2_|CLOUDFLARE|Account ID|Access Key' -- services/platform/src` returns only config-key references, never a value

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: bucket SSE+versioning queried from real R2 (not config text); credentials least-privilege + distinct from app secrets + stored in secrets store; pgBackRest stanza-create is a real R2 round-trip; repo cipher not none; no hardcoded credentials.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: D04-03, D04-04

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-02",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "no_r2_bucket": {
      "description": "Initial state: no backup R2 bucket exists",
      "seed_method": "recorded_external",
      "records": ["aws s3 ls --endpoint-url $R2_ENDPOINT returns no backup bucket"]
    },
    "r2_bucket_exists": {
      "description": "After AC-1: an encrypted, versioned R2 bucket exists",
      "seed_method": "public_api",
      "records": ["aws s3api head-bucket succeeds", "get-bucket-encryption returns SSE", "get-bucket-versioning Status = Enabled"]
    },
    "scoped_credentials": {
      "description": "After AC-2: a least-privilege R2 token stored in the secrets store, distinct from app secrets",
      "seed_method": "public_api",
      "records": ["policy Resource = backup bucket ARN", "limited Action set, no s3:* ", "holo secrets:doctor exit 0, value not printed"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN no R2 bucket exists WHEN the operator provisions the bucket THEN aws s3api head-bucket succeeds; get-bucket-encryption returns SSE (AES256 or aws:kms); get-bucket-versioning shows Enabled",
      "verify": "aws s3api head-bucket --bucket $R2_BUCKET_NAME --endpoint-url $R2_ENDPOINT; get-bucket-encryption | grep SSE; get-bucket-versioning | grep Enabled",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Cloudflare-R2",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": ["bucket does not exist (head-bucket errors)", "SSE null/disabled (empty get-bucket-encryption)", "versioning off", "a config file claims encryption without the bucket actually having SSE", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [
          {
            "start_ref": "no_r2_bucket",
            "action": { "actor": "operator", "steps": ["run holo backup:provision (or wrangler/CF API) to create the bucket with SSE + versioning", "query head-bucket / get-bucket-encryption / get-bucket-versioning against real R2"] },
            "end_state": {
              "must_observe": ["aws s3 ls lists the bucket name", "get-bucket-encryption JSON contains ServerSideEncryption AES256 or aws:kms", "get-bucket-versioning Status = Enabled", "endpoint is https:// (TLS)"],
              "must_not_observe": ["head-bucket returns 404/403", "SSE config null or missing", "versioning Status empty", "http:// cleartext endpoint"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN the bucket exists WHEN the operator creates a scoped R2 token stored in the secrets store THEN the policy enumerates only the backup bucket ARN + limited actions, no * Resource, no s3:* Action, distinct from DATABASE_URL/Fleet, secrets:doctor shows R2 present (value not printed)",
      "verify": "policy inspect: backup-bucket ARN only, limited actions; holo secrets:doctor exit 0, R2 present, value not printed",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "R2-policy-inspect",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": ["policy Resource is *", "policy Action is s3:* or AdministratorAccess", "token equals the app DB key", "review trusts a declared scope without enumerating actions/resources", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "api_response", "required_capture": true },
        "cases": [
          {
            "start_ref": "r2_bucket_exists",
            "action": { "actor": "operator", "steps": ["create a scoped R2 API token (bucket-only)", "store it in the consolidated secrets store", "inspect the token policy actions/resources", "run holo secrets:doctor"] },
            "end_state": {
              "must_observe": ["policy Resource is the exact backup bucket ARN", "Action list is PutObject/GetObject/ListBucket/DeleteObject (no s3:*)", "secrets store has an R2 entry distinct from DATABASE_URL/Fleet", "secrets:doctor exit 0 and does not print the value"],
              "must_not_observe": ["Resource *", "Action s3:* or AdministratorAccess", "the R2 token string in any tracked file", "a printed secret value in secrets:doctor output"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "description": "GIVEN scoped credentials exist WHEN the operator configures the pgBackRest S3 stanza and runs stanza-create THEN pgBackRest writes a probe object to R2 and stanza-create exits 0; check reports the repo reachable",
      "verify": "pgbackrest --stanza=main stanza-create exit 0; pgbackrest check OK; aws s3 ls repo prefix non-empty; repo-cipher-type set",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": ["repo-path/endpoint misconfigured (auth or permission failure)", "stanza-create skipped/assumed", "repo cipher is none (plaintext)", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "scoped_credentials",
            "action": { "actor": "operator", "steps": ["configure pgBackRest repo1-* S3 stanza for the R2 endpoint", "run pgbackrest stanza-create", "run pgbackrest check", "aws s3 ls the repo prefix"] },
            "end_state": {
              "must_observe": ["pgbackrest stanza-create exit 0", "pgbackrest check stanza status OK", "an R2 object exists under the repo prefix after stanza-create", "repo-cipher-type is set (not none)"],
              "must_not_observe": ["stanza-create auth/permission error", "check reports an error/missing stanza", "repo prefix empty after stanza-create", "cipher-type=none"]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "Encrypted R2 bucket exists with SSE + versioning", "maps_to_ac": "AC-1", "verify": "aws s3api head-bucket + get-bucket-encryption | grep SSE + get-bucket-versioning | grep Enabled" },
    { "id": "TC-2", "type": "test_criterion", "description": "Credentials least-privilege scoped, separate from app secrets", "maps_to_ac": "AC-2", "verify": "policy inspect: backup-bucket ARN, limited actions, no *; secrets:doctor exit 0, value not printed" },
    { "id": "TC-3", "type": "test_criterion", "description": "pgBackRest stanza-create succeeds against real R2", "maps_to_ac": "AC-3", "verify": "pgbackrest stanza-create exit 0; check OK; repo prefix non-empty" }
  ]
}
-->
</details>
