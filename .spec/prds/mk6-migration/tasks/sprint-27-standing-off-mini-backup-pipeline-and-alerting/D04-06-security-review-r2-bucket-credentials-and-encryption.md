# D04-06 — Security review: R2 bucket credentials + encryption

## What this does

Adversarial **read-only** security review of the R2 backup credential/encryption surface after D04-02..D04-05 land — validating least-privilege scoping, end-to-end encryption, secret hygiene, key/backup separation, and alert-payload redaction. Produces a findings doc (`security-review-D04-06.md`) with an APPROVED/NEEDS_FIXES verdict. This is a REVIEW pass; it writes no implementation code.

Provides: a security-review findings log documenting each check (what / how / result / evidence) with a final verdict; CRITICAL findings (wildcard credentials, committed secrets, co-located keys, secret leaks in alert payloads) block sprint close and route back to D04-02..D04-05.

## Why

- AP-7 defines the trust boundary: single-user tailnet, keys ARE the security — there is NO RLS / multi-tenant hardening to review. The review focuses on credential scoping/separation, encryption, and secret hygiene.
- Rotation-safe design is a CAP-BAK-01 failure mode: a credential expiry/rotation failure must surface as an alert (D04-05), not a silent failure.
- A key co-located with the ciphertext it protects defeats the backup; the review enforces separation.
- Grounded in: UC-PLAT-06, CAP-BAK-01, AP-7, AP-9.

## How to verify

- R2 policy inspect shows the backup bucket ARN as the only Resource, a limited Action set, NO `*` Resource / `s3:*` Action
- `git grep -nIE` for credential patterns in tracked files returns 0; `holo secrets:doctor` exit 0, R2 secret present (value not printed)
- bucket SSE config (AES256/aws:kms) + TLS endpoints; pgBackRest repo-cipher set (not none); restic `RESTIC_PASSWORD` set
- the backup bucket prefix contains NO key/password/cipher file; repo keys live in the secrets store/env
- the alert payload (D04-05) contains only safe fields (status/job_type/timestamp/trace_id) — NO account_id/access_key/secret/cipher

## Scope

Writes: `.spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/security-review-D04-06.md` (NEW — findings log)

Prohibited: `services/platform/**` (MODIFY — review is read-only; CRITICAL findings route back to D04-02..D04-05), `services/platform/config/secrets.yaml` (MODIFY — audit only), any implementation change

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D04-06 — Security review: R2 bucket credentials + encryption
================================================================================

TASK_TYPE:  REVIEW
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      reviewer=security-reviewer
PROPOSED-BY: security-reviewer
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
A security-review findings log documenting credential scoping (bucket/prefix-only, no account wildcard), encryption-at-rest (R2 SSE) + in-transit (TLS), pgBackRest/restic repo encryption with separate keys not co-located with ciphertext, secret hygiene (no committed secrets / no logging), and alert-payload redaction. Verdict APPROVED or NEEDS_FIXES; CRITICAL findings block sprint close.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST review R2 bucket encryption-at-rest (SSE) and in-transit (TLS)
- MUST review R2 credential scoping (least-privilege to the backup bucket/prefix only) and separation from app secrets
- MUST review secret hygiene (no committed secrets / no logging)
- MUST review pgBackRest repo encryption + restic repo encryption (separate keys)
- MUST review that keys are NOT co-located with the backups they protect
- MUST review that the alerting sink (D04-05) redacts secrets from payloads
- MUST produce security-review-D04-06.md with an APPROVED/NEEDS_FIXES verdict
- NEVER review multi-tenant isolation or RLS (AP-7 single-user scope — out of scope)
- NEVER rubber-stamp credentials as scoped without a real policy inspect
- NEVER approve committed secrets, wildcard credentials, co-located keys, or secret-leaking alert payloads
- NEVER modify backup implementation code (review is read-only)
- STRICTLY review scope is the credential/encryption surface only
- STRICTLY every AC is proven by real command output (policy JSON, grep counts, bucket SSE config)
- STRICTLY CRITICAL findings block sprint close and route back to D04-02..D04-05
- STRICTLY rotation-safe = credential expiry/rotation failure surfaces as an alert, not a silent failure

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: R2 credentials least-privilege scoped to the backup bucket only
- [ ] AC-2: no secrets in tracked files or logs
- [ ] AC-3: encryption-at-rest (SSE) + in-transit (TLS) verified
- [ ] AC-4: repo keys NOT co-located with backups
- [ ] AC-5: alert payloads redact secrets
- [ ] AC-6: finding log produced with APPROVED/NEEDS_FIXES verdict

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (proven by real command output, not attestation)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] R2 credentials least-privilege scoped to the backup bucket only (flow_ref CAP-BAK-01)
  GIVEN D04-02 provisioned scoped R2 credentials
  WHEN  the reviewer inspects the credential policy
  THEN  the policy JSON Resource is the exact backup bucket ARN; Action is the limited set (PutObject/GetObject/ListBucket/DeleteObject); NO `*` Resource; NO `s3:*`/AdministratorAccess Action; the token is distinct from the app DB/Fleet keys
  TEST_TIER: integration · VERIFICATION_SERVICE: R2-policy-inspect · TDD_STATE: red
  SCENARIO — start_ref: d04_02_r2_bucket_provisioned · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review only checks files exist (rubber-stamp); trusts a declared scope without enumerating actions/resources; accepts a bucket wildcard without verifying prefix constraint; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: policy Resource = backup bucket ARN; Action = limited set; distinct from DATABASE_URL/Fleet
    MUST_NOT_OBSERVE: Resource `*`; Action `s3:*`/AdministratorAccess; token usable on non-backup buckets

AC-2 no secrets in tracked files or logs (flow_ref CAP-BAK-01)
  GIVEN D04-02 stored R2 credentials in the consolidated secrets store
  WHEN  the reviewer greps tracked files + checks logs
  THEN  `git grep` for Account ID/Access Key/Secret/r2_/CLOUDFLARE patterns returns 0; `holo secrets:doctor` exit 0, R2 present (value not printed); logs have no plaintext credentials
  TEST_TIER: integration · VERIFICATION_SERVICE: git-audit+secrets-store · TDD_STATE: red
  SCENARIO — start_ref: secrets_in_store · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review only checks .gitignore exists; skips file types; accepts a placeholder without validating it is not a real key; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: git grep returns 0 credential-pattern hits; secrets.yaml is gitignored; secrets:doctor exit 0, value not printed
    MUST_NOT_OBSERVE: a tracked file with a 32-char hex Account ID / AKIA or r2_ access key / base64 secret; a log entry with a full credential

AC-3 encryption-at-rest + in-transit verified (flow_ref CAP-BAK-01)
  GIVEN D04-02 (bucket SSE) + D04-03 (pgBackRest repo) + D04-04 (restic repo)
  WHEN  the reviewer inspects encryption
  THEN  bucket SSE config shows AES256/aws:kms; backup jobs use https:// TLS endpoints; pgBackRest repo-cipher set (not none); restic RESTIC_PASSWORD set
  TEST_TIER: integration · VERIFICATION_SERVICE: R2-SSE-inspect · TDD_STATE: red
  SCENARIO — start_ref: encryption_configured · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review only greps for 'encrypt' without querying the bucket; accepts 'TLS' without the protocol version; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: get-bucket-encryption returns an SSE algorithm; https:// endpoints; repo-cipher set; RESTIC_PASSWORD set
    MUST_NOT_OBSERVE: SSE null/disabled; http:// endpoints; cipher-type=none; restic without a password

AC-4 repo keys NOT co-located with backups (flow_ref CAP-BAK-01)
  GIVEN D04-03/D04-04 configured repo ciphers/passwords
  WHEN  the reviewer audits key location
  THEN  keys live in the secrets store/env; repo config references keys by env var; the backup bucket prefix contains NO key/password/cipher file
  TEST_TIER: integration · VERIFICATION_SERVICE: file-location-audit · TDD_STATE: red
  SCENARIO — start_ref: repos_configured · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review only checks keys exist; accepts a key in the same directory as the repo config; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: repo config references ${PGBACKREST_CIPHER}/RESTIC_PASSWORD env vars; secrets store/env holds the keys; `mc ls`/`aws s3 ls` of the backup prefix shows NO key/password/cipher file
    MUST_NOT_OBSERVE: a key/password/cipher file in the backup prefix; a hardcoded key in repo-cipher; a cipher file readable from the backup URL

AC-5 alert payloads redact secrets (flow_ref CAP-BAK-01)
  GIVEN D04-05 implemented the alerting sink
  WHEN  the reviewer inspects an alert payload
  THEN  the payload contains only safe fields (status/job_type/timestamp/trace_id/last_success_at) and NO account_id/access_key/secret/cipher; the webhook endpoint is HTTPS
  TEST_TIER: integration · VERIFICATION_SERVICE: alert-payload-audit · TDD_STATE: red
  SCENARIO — start_ref: alerting_configured · evidence: stdout
    NEGATIVE_CONTROL: would fail if the review only checks the alert fires; accepts 'backup failed' without inspecting the payload body; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: payload keys are the safe set; no secret-valued fields; HTTPS endpoint
    MUST_NOT_OBSERVE: account_id/access_key/secret/cipher in the payload; a plaintext credential in alert logs

AC-6 finding log produced with APPROVED/NEEDS_FIXES (flow_ref CAP-BAK-01)
  GIVEN AC-1..AC-5 completed
  WHEN  the reviewer compiles findings
  THEN  security-review-D04-06.md documents each check (what/how/result/evidence) and a final Verdict; CRITICAL findings (wildcard creds, committed secrets, co-located keys, secret leaks) yield NEEDS_FIXES and route back to D04-02..D04-05
  TEST_TIER: integration · VERIFICATION_SERVICE: documentation · TDD_STATE: red
  SCENARIO — start_ref: checks_completed · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if the review skips writing findings; writes an empty template without AC verdicts; a stub/static implementation that hardcodes a healthy result with no real service round-trip
    MUST_OBSERVE: findings file exists; AC-1..AC-5 verdicts present; a final Verdict: APPROVED|NEEDS_FIXES line
    MUST_NOT_OBSERVE: no findings file; verdict line missing; AC sections missing

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/security-review-D04-06.md (NEW — findings log)
writeProhibited: services/platform/** (MODIFY — review is read-only; CRITICAL findings route back to D04-02..D04-05), services/platform/config/secrets.yaml (MODIFY — audit only), app/** + holocron-mcp/** (not this sprint)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:63-72 [CAP-BAK-01 failure mode: credential expiry/rotation -> alert, not silent]
2. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-46 [AP-7 single-user tailnet trust, keys ARE the security; AP-9 local durability requires remote durability]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/security-review-D01-06.md:1-175 [precedent findings-doc format]
4. /Users/inference1/Projects/holocron/services/platform/src/cli/holo.ts:1710-1760 [holo secrets:doctor — the secret-store doctor the review runs]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Policy scoped: `mc admin user info` / rclone policy inspect / `aws sts` → single-bucket ARN, limited actions, no `*` → Exit 0
- No committed secrets: `git grep -nIE 'Account ID|Access Key|Secret|r2_|R2_|CLOUDFLARE' -- . ':!*.env.bak*'` → 0 hits; `holo secrets:doctor` exit 0
- Encryption: `aws s3api get-bucket-encryption` (SSE); pgBackRest repo-cipher set; restic RESTIC_PASSWORD set
- Key separation: `aws s3 ls "$R2_BUCKET/pgbackrest/"` + restic prefix show NO key/password/cipher file
- Alert redaction: an induced alert payload inspected → only safe fields, no secrets
- Finding log: `test -f …/security-review-D04-06.md && grep -q 'Verdict: APPROVED\|Verdict: NEEDS_FIXES' …/security-review-D04-06.md` → Exit 0

--------------------------------------------------------------------------------
REVIEW (security-reviewer)
--------------------------------------------------------------------------------
Must pass: scope is credential/encryption surface ONLY (not multi-tenant); every AC proven by real command output; CRITICAL findings block sprint close; findings doc has an explicit verdict. Rotation-safe = expiry/rotation surfaces as an alert (D04-05), not a silent failure.
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D04-02, D04-03, D04-04, D04-05 · Blocks: none (sprint's review/closure pass — the sprint gate requires its APPROVED verdict)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D04-06",
  "proposed_by": "security-reviewer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "d04_02_r2_bucket_provisioned": {
      "description": "D04-02 provisioned an encrypted R2 bucket with scoped credentials and pgBackRest repo config",
      "seed_method": "recorded_external",
      "records": ["R2 bucket exists", "scoped credential in secrets store", "pgBackRest repo points to R2", "bucket SSE on"]
    },
    "secrets_in_store": {
      "description": "R2 credentials are stored in the consolidated secrets store (holo secrets)",
      "seed_method": "recorded_external",
      "records": ["holo secrets:doctor shows R2 present (value not printed)"]
    },
    "encryption_configured": {
      "description": "Bucket SSE + pgBackRest repo-cipher + restic RESTIC_PASSWORD configured",
      "seed_method": "recorded_external",
      "records": ["SSE algorithm set", "repo-cipher not none", "RESTIC_PASSWORD set"]
    },
    "repos_configured": {
      "description": "pgBackRest + restic repos configured with their ciphers/passwords",
      "seed_method": "recorded_external",
      "records": ["repo keys referenced by env var", "keys live in secrets store/env"]
    },
    "alerting_configured": {
      "description": "D04-05 alerting sink emits alert payloads",
      "seed_method": "recorded_external",
      "records": ["an alert payload can be captured", "webhook endpoint is HTTPS"]
    },
    "checks_completed": {
      "description": "AC-1..AC-5 checks have been run",
      "seed_method": "induced",
      "records": ["each check has command output evidence"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN D04-02 scoped credentials WHEN the reviewer inspects the policy THEN Resource = backup bucket ARN only, limited Action set, no * Resource, no s3:* Action, distinct from app DB/Fleet keys",
      "verify": "mc admin user info / rclone policy inspect / aws sts -> single-bucket ARN, limited actions, no *",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "R2-policy-inspect",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review only checks files exist (rubber-stamp)", "trusts declared scope without enumerating actions/resources", "accepts a bucket wildcard without verifying prefix", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "d04_02_r2_bucket_provisioned",
            "action": { "actor": "security-reviewer", "steps": ["inspect the R2 token policy actions/resources", "compare against the app DATABASE_URL/Fleet secret scope"] },
            "end_state": {
              "must_observe": ["policy Resource = backup bucket ARN", "Action = limited set", "distinct from DATABASE_URL/Fleet"],
              "must_not_observe": ["Resource *", "Action s3:* or AdministratorAccess", "token usable on non-backup buckets"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN D04-02 stored credentials in the secrets store WHEN the reviewer greps tracked files + checks logs THEN git grep returns 0 credential patterns; secrets:doctor exit 0 (value not printed); logs clean",
      "verify": "git grep -nIE credential patterns -> 0; holo secrets:doctor exit 0, value not printed",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "git-audit+secrets-store",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review only checks .gitignore exists", "skips file types", "accepts a placeholder without validating it is not a real key", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "secrets_in_store",
            "action": { "actor": "security-reviewer", "steps": ["git grep -nIE for credential patterns in tracked files", "run holo secrets:doctor", "sample logs for plaintext credentials"] },
            "end_state": {
              "must_observe": ["git grep returns 0 credential-pattern hits", "secrets.yaml gitignored", "secrets:doctor exit 0, value not printed"],
              "must_not_observe": ["a tracked file with Account ID / access key / base64 secret", "a log entry with a full credential"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN encryption configured WHEN the reviewer inspects THEN bucket SSE shows AES256/aws:kms; https:// endpoints; pgBackRest repo-cipher set; restic RESTIC_PASSWORD set",
      "verify": "aws s3api get-bucket-encryption (SSE); https endpoints; repo-cipher set; RESTIC_PASSWORD set",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "R2-SSE-inspect",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review only greps for 'encrypt' without querying the bucket", "accepts 'TLS' without the protocol version", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "encryption_configured",
            "action": { "actor": "security-reviewer", "steps": ["query bucket SSE", "check backup job endpoints are https", "check repo-cipher / RESTIC_PASSWORD"] },
            "end_state": {
              "must_observe": ["get-bucket-encryption returns an SSE algorithm", "https:// endpoints", "repo-cipher set", "RESTIC_PASSWORD set"],
              "must_not_observe": ["SSE null/disabled", "http:// endpoints", "cipher-type=none", "restic without a password"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN repos configured WHEN the reviewer audits key location THEN keys live in secrets store/env, referenced by env var; backup prefix has NO key/password/cipher file",
      "verify": "repo config references env vars; mc ls/aws s3 ls backup prefix shows no key/password/cipher file",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "file-location-audit",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review only checks keys exist", "accepts a key in the same directory as the repo config", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "repos_configured",
            "action": { "actor": "security-reviewer", "steps": ["inspect repo config key references", "list the backup bucket prefix for key/password/cipher files"] },
            "end_state": {
              "must_observe": ["repo config references ${PGBACKREST_CIPHER}/RESTIC_PASSWORD env vars", "keys in secrets store/env", "backup prefix has NO key/password/cipher file"],
              "must_not_observe": ["a key/password/cipher file in the backup prefix", "a hardcoded key in repo-cipher", "a cipher file readable from the backup URL"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN D04-05 alerting WHEN the reviewer inspects an alert payload THEN it contains only safe fields (status/job_type/timestamp/trace_id/last_success_at) and NO account_id/access_key/secret/cipher; webhook is HTTPS",
      "verify": "capture an induced alert payload; inspect keys for secret-valued fields; confirm HTTPS endpoint",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "alert-payload-audit",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review only checks the alert fires", "accepts 'backup failed' without inspecting the payload body", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "stdout", "required_capture": true },
        "cases": [
          {
            "start_ref": "alerting_configured",
            "action": { "actor": "security-reviewer", "steps": ["induce an alert", "capture the payload", "inspect keys + endpoint"] },
            "end_state": {
              "must_observe": ["payload keys are the safe set", "no secret-valued fields", "HTTPS endpoint"],
              "must_not_observe": ["account_id/access_key/secret/cipher in the payload", "a plaintext credential in alert logs"]
            }
          }
        ]
      }
    },
    {
      "id": "AC-6",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "description": "GIVEN AC-1..AC-5 completed WHEN the reviewer compiles findings THEN security-review-D04-06.md documents each check + a final Verdict; CRITICAL findings yield NEEDS_FIXES and route back to D04-02..D04-05",
      "verify": "test -f security-review-D04-06.md; grep -q 'Verdict: APPROVED|Verdict: NEEDS_FIXES'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "documentation",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": ["review skips writing findings", "writes an empty template without AC verdicts", "a stub/static implementation that hardcodes a healthy result with no real service round-trip"]
        },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [
          {
            "start_ref": "checks_completed",
            "action": { "actor": "security-reviewer", "steps": ["write findings for each AC with evidence", "set a final Verdict"] },
            "end_state": {
              "must_observe": ["findings file exists", "AC-1..AC-5 verdicts present", "a final Verdict: APPROVED|NEEDS_FIXES line"],
              "must_not_observe": ["no findings file", "verdict line missing", "AC sections missing"]
            }
          }
        ]
      }
    },
    { "id": "TC-1", "type": "test_criterion", "description": "R2 policy scoped to backup bucket only, no wildcard", "maps_to_ac": "AC-1", "verify": "policy inspect: single-bucket ARN, limited actions, no *" },
    { "id": "TC-2", "type": "test_criterion", "description": "Zero secrets in tracked files or logs", "maps_to_ac": "AC-2", "verify": "git grep credential patterns -> 0; secrets:doctor exit 0" },
    { "id": "TC-3", "type": "test_criterion", "description": "Encryption-at-rest + in-transit verified", "maps_to_ac": "AC-3", "verify": "bucket SSE algorithm + https endpoints + repo-cipher + RESTIC_PASSWORD" },
    { "id": "TC-4", "type": "test_criterion", "description": "Repo keys NOT co-located with backups", "maps_to_ac": "AC-4", "verify": "backup prefix has no key/password/cipher file; keys in secrets store/env" },
    { "id": "TC-5", "type": "test_criterion", "description": "Alert payloads redact secrets", "maps_to_ac": "AC-5", "verify": "alert payload has only safe fields, no secrets; HTTPS endpoint" },
    { "id": "TC-6", "type": "test_criterion", "description": "Finding log exists with APPROVED/NEEDS_FIXES verdict", "maps_to_ac": "AC-6", "verify": "security-review-D04-06.md exists with a Verdict line" }
  ]
}
-->
</details>
