# SECURITY REVIEW — D04-06: R2 bucket credentials + encryption

**Status:** Completed  
**Task:** D04-06 — Security review: R2 bucket credentials + encryption  
**Reviewer:** security-reviewer  
**Date:** 2026-07-27  
**Branch reviewed:** `task/D04-06-security-review` (D04-02..D04-05 implementation lineage)  
**Scope:** Credential scoping, encryption (at rest / in transit / repo), secret hygiene, key/ciphertext separation, alert-payload redaction — **credential/encryption surface only**  
**Out of scope (AP-7):** Multi-tenant isolation, RLS, app-layer access control beyond backup keys  

**Evidence directory:** `.tmp/D04-06/`  
**Live probes:** scoped R2 API against `holocron-backup` + negative ACL `laneshadow`  
**Sibling seeded evidence:** D04-02 provision/SSE/policy; D04-04 restic; D04-05 alert payloads  

---

## AC verdict table (mandatory)

| AC | Check | Verdict | Evidence |
|----|--------|---------|----------|
| AC-1 | R2 credentials least-privilege scoped to backup bucket only | **PASS** | Stored policy Resource = `arn:aws:s3:::holocron-backup` (+ `/*`); Actions = limited 5-action set (no `*`, no `s3:*`); live `head-bucket` OK on backup, **403 Forbidden** on `laneshadow`; runtime secret ≠ DATABASE_URL/FLEET_KEY |
| AC-2 | No secrets in tracked files or logs | **PASS** | `git check-ignore` → secrets.yaml + pgbackrest conf ignored; tracked config = `.gitignore` + `secrets.example.yaml` only; strict value-pattern git grep **0 hits** in product code; `holo secrets doctor` exit 0, R2 7/7 present, **values never printed** |
| AC-3 | Encryption-at-rest (SSE) + in-transit (TLS) + repo ciphers | **PASS** | Provision evidence SSEAlgorithm **AES256**; R2 endpoint `https://` enforced in `loadBackupConfig` / provision; pgBackRest `repo1-cipher-type=aes-256-cbc` (mode 0600 conf); `RESTIC_PASSWORD` present len≥16; restic repo `s3:https://…` |
| AC-4 | Repo keys NOT co-located with backups | **PASS** | Live list `pgbackrest/` (65 objects) + `restic/` (6 objects): **0** plaintext password/cipher/secret filenames; cipher + RESTIC_PASSWORD live in secrets store/env; restic `keys/` is encrypted repo key material (not the password) |
| AC-5 | Alert payloads redact secrets | **PASS** | Induced D04-05 payloads contain only job metadata fields; **0** forbidden keys/values (`account_id`/`access_key`/`secret`/`cipher`/passwords); credential-expired path alerts without credentials |
| AC-6 | Finding log with APPROVED/NEEDS_FIXES | **PASS** | This document; explicit verdict line below |

---

## SECURITY REVIEW VERDICT

**STATUS: PASS**

**Verdict: APPROVED**

No CRITICAL findings. Wildcard credentials, committed secrets, co-located plaintext keys, and secret-leaking alert payloads were **not** observed under real probes. Residual risks (temporary R2 credentials, R2 versioning NotImplemented, webhook HTTPS fail-open) are documented below as MEDIUM/LOW and do not block sprint close.

---

## What was checked

### AC-1 — R2 credentials least-privilege (backup bucket only)

**What:** Enumerate policy Resource/Action; prove scoped token works on backup bucket and is denied on a non-backup bucket; confirm identity distinct from app DB/Fleet.

**How (real probes):**
1. **Policy structure (code contract):** `buildBackupCredentialPolicy("holocron-backup")` →  
   - Actions: `s3:ListBucket`, `s3:GetBucketLocation`, `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` (count=5 ≤ 6)  
   - Resources: `arn:aws:s3:::holocron-backup`, `arn:aws:s3:::holocron-backup/*`  
   - `hasStarResource=false`, `hasStarAction=false`  
   Evidence: `.tmp/D04-06/ac1-policy-structure.json`
2. **Policy stored in secrets (operator state):** Parsed `R2_CREDENTIAL_POLICY` from main `secrets.yaml` (presence/structure only): same limited action set, bucket-only ARNs, no wildcards.  
   Evidence: `.tmp/D04-06/ac1-stored-policy-inspect.json`
3. **Live positive ACL:** `aws s3api head-bucket --bucket holocron-backup` with **scoped runtime** credentials → **exit 0**.  
4. **Live negative ACL:** `aws s3api head-bucket --bucket laneshadow` with same credentials → **403 Forbidden** (exit 254).  
   Evidence: `.tmp/D04-06/ac1-ac3-ac4-live-r2-probes.txt`
5. **Provision residual (D04-02):** `negativeAclDenied=true`, `policyHasWildcardResource=false`, `policyHasWildcardAction=false`, `credentialKind=temporary`.  
   Evidence: `.tmp/D04-06/d04-02-backup-provision.json`, `d04-02-negative-acl-probe.txt`
6. **Distinctness:** Runtime R2 secret present; fingerprints differ from `DATABASE_URL` and `FLEET_KEY`; parent multi-bucket secrets **not** stored as runtime.  
   Evidence: `.tmp/D04-06/live-secrets-presence-and-policy.json`

**Must not observe:** Resource `*`; Action `s3:*` / AdministratorAccess; token usable on non-backup buckets.  
**Result:** **PASS** — least-privilege scoping proven by live positive+negative ACL, not rubber-stamp file existence.

**Note:** Scoped identity correctly **cannot** call `GetBucketEncryption` (AccessDenied) — admin-only control-plane API is outside the object RW policy. SSE was verified at provision with admin credentials (AES256).

---

### AC-2 — No secrets in tracked files or logs

**What:** Git hygiene + secrets doctor presence-only; no plaintext credentials in tracked product code.

**How:**
1. `git check-ignore -v services/platform/config/secrets.yaml` → ignored by `services/platform/config/.gitignore:2`  
2. `git check-ignore -v services/platform/config/pgbackrest/pgbackrest.conf` → ignored by `pgbackrest/.gitignore:2` (`*` + `!.gitignore`)  
3. `git ls-files services/platform/config/` → only `.gitignore`, `pgbackrest/.gitignore`, `secrets.example.yaml`  
4. `git rev-list --all -- services/platform/config/secrets.yaml` → empty (never committed)  
5. Strict value patterns (`AKIA…`, long `R2_SECRET…` assignments, `repo1-cipher-pass=<hex>` in tracked files) → **0 hits** under `services/platform`  
6. `bun src/cli/holo.ts secrets doctor` against real secrets (symlinked for probe, removed after):  
   - exit **0**, `status: OK`  
   - backup keys **7/7 resolved**  
   - output shows `resolved` only — **no secret material**  
   Evidence: `.tmp/D04-06/ac2-secrets-doctor-linked.txt`, `ac2-gitignore-and-hardcoded.txt`
7. `secrets.example.yaml` documents R2/RESTIC/ALERT keys as **commented placeholders only** (`replace-me-*`).

**Must not observe:** Tracked 32-char Account ID / access key / base64 secret; doctor printing values.  
**Result:** **PASS**

Broad `git grep` for name tokens (`R2_`, `CLOUDFLARE`) hits **identifiers and comments** in source (expected). Value-bearing patterns are clean.

---

### AC-3 — Encryption at rest + in transit + repo ciphers

**What:** Bucket SSE, TLS endpoints, pgBackRest repo cipher ≠ none, restic password set.

**How:**
1. **SSE:** D04-02 provision recorded `encryption: "AES256"` via `get-bucket-encryption` under admin path; residual honesty for versioning (`R2_VERSIONING_NOT_IMPLEMENTED`). Live scoped call to `get-bucket-encryption` returns AccessDenied (expected; see AC-1).  
   Evidence: `d04-02-ac1-bucket-sse-versioning.txt`, `d04-02-backup-provision.json`
2. **TLS:** `R2_ENDPOINT` in secrets is `https://…r2.cloudflarestorage.com`; `loadBackupConfig` **fail-closes** on non-https (`config.ts` lines 168–169); restic repository built as `s3:https://…` (`restic-mirror.ts`).  
3. **pgBackRest:** Live conf on operator host: `repo1-cipher-type=aes-256-cbc`, mode **0600**, has cipher pass + scoped s3 key; cipher-type **not** `none`.  
   Evidence: `.tmp/D04-06/ac3-pgbackrest-conf-audit.txt`
4. **restic:** `RESTIC_PASSWORD` present (len 43 ≥ 16), distinct from pgBackRest cipher pass; D04-04 verify `encrypted: true`, `restic check` exit 0.  
   Evidence: `live-secrets-presence-and-policy.json`, `d04-04-restic-verify.json`, `d04-04-secrets-presence.json`

**Must not observe:** SSE null; `http://` endpoints; `cipher-type=none`; empty RESTIC_PASSWORD.  
**Result:** **PASS**

---

### AC-4 — Repo keys NOT co-located with ciphertext

**What:** Keys live in secrets store/env; backup prefixes do not hold password/cipher files.

**How:**
1. **Secrets store holds keys:** `R2_REPO_CIPHER_PASS`, `RESTIC_PASSWORD` present in secrets.yaml (gitignored); doctor presence-only.  
2. **pgBackRest conf** holds cipher pass for archive-push (no ambient env) but is **gitignored + mode 0600** — not co-located in R2.  
3. **Live R2 list `pgbackrest/`:** 65 objects under `archive/` + `backup/` only; basenames are WAL/backup artifacts; **plaintext_secret_file_hits=0**.  
4. **Live R2 list `restic/`:** objects are `config`, `data/…`, `index/…`, `keys/…`, `snapshots/…` — standard restic layout.  
   - `keys/` holds **encrypted** repository keys (unlocked only by `RESTIC_PASSWORD` held outside the prefix).  
   - **plaintext_password_file_hits=0** (no `password`, `RESTIC_PASSWORD`, `cipher` filenames).  
5. Code contract: `ensureResticPassword` writes only to secrets.yaml/env; never to R2 prefix (`restic-mirror.ts` header + implementation). Prefixes forced distinct (`restic` ≠ `pgbackrest`).  
6. Cipher separation: pgBackRest cipher ≠ restic password (distinct fingerprints).

**Evidence:** `.tmp/D04-06/ac4-pgbackrest-prefix-list.txt`, `ac4-restic-prefix-list.txt`  
**Result:** **PASS** — plaintext keys are not co-located with backups.

---

### AC-5 — Alert payloads redact secrets

**What:** Alert JSON contains only safe operational fields; webhook delivery path does not embed credentials.

**How:**
1. **Type + builder audit:** `BackupAlertPayload` / `buildPayload` fields:  
   `job_name`, `job_id`, `reason`, `failure_reason`, `last_success_at`, `overdue_by_minutes`, `last_wal_segment`, `last_snapshot_id`, `trace_id`, `timestamp`, `status`  
   — no account/access/secret/cipher fields.  
2. **Induced real payloads (D04-05):**  
   - `failure-credential-alert.json`, `failure-kill-alert.json`, `failure-config-alert.json` → keys_union is the safe set; **forbidden_keys=[]**, **forbidden_value_fields=[]**  
   - Sample credential-expired body: `"failure_reason":"credential expired — R2 auth denied for job base_backup"` with **no** keys/tokens.  
3. **Healthy silence:** `healthy-silence-posts.json` → `postCount: 0` (no leak surface on success).  
4. LaunchAgent plists deliberately omit secrets (`ALERT_WEBHOOK_URL` from env > secrets only).

**Evidence:** `.tmp/D04-06/ac5-alert-payload-audit.json`, `ac5-sample-credential-alert.json`  
**Result:** **PASS** for redaction (no secrets in payloads).

**HTTPS note:** Production example schema uses `https://hooks.example…`. Test harness used `http://127.0.0.1:9999/alert` (local RED sink). `postBackupAlert` does **not** currently fail-closed on non-HTTPS webhook URLs — see MEDIUM finding below. Does not constitute a secret leak.

**Rotation-safe (CAP-BAK-01):** credential expiry is modeled as a first-class induce mode and surfaces as an alert (not silent) — proven by D04-05 credential-expired payload capture.

---

### AC-6 — Findings log with verdict

**What:** This document.  
**Result:** **PASS** — AC-1..AC-5 verdicts present; final **Verdict: APPROVED**.

---

## What was found

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM (do not block APPROVED; route as follow-up)

1. **Webhook HTTPS not fail-closed** (`services/platform/src/backup/alerting.ts` `postBackupAlert`):  
   Unlike `R2_ENDPOINT` (rejects non-https), `ALERT_WEBHOOK_URL` accepts any scheme. Local RED tests use `http://127.0.0.1`.  
   **Risk:** Operator misconfiguration could POST alert metadata (not secrets) to cleartext remote HTTP.  
   **Recommendation:** Reject non-`https://` URLs except explicit loopback allowlist for tests.  
   **Routes to:** D04-05 hardening (non-blocking for this sprint gate).

2. **Temporary R2 credentials residual** (`R2_SCOPED_CREDENTIAL_TEMPORARY`, session token present in operator secrets):  
   Honest residual from D04-02. Expiry/rotation is covered by D04-05 alerting (credential_expired induce → alert). Prefer durable bucket-scoped token for standing mini when CF token-write is available.  
   **Risk:** Silent backup failure if alert path is also broken — mitigated by launchd alert sweep + fail-closed when webhook missing + overdue jobs exist.

### LOW / informational

1. **R2 versioning NotImplemented** — durability relies on SSE-AES256 + TLS + pgBackRest/restic repo encryption + object presence (documented residual; not soft-passed as Enabled).  
2. **Scoped creds cannot read bucket encryption config** — correct least privilege; SSE verification is provision-time/admin.  
3. **restic `keys/` directory** in the bucket is encrypted key material by restic design, not a co-located `RESTIC_PASSWORD`. Call out for auditors so it is not misclassified.  
4. Worktree without local `secrets.yaml` fails doctor until operator copies/symlinks secrets — expected single-host config hygiene under AP-7.

---

## Adversarial probe summary

| Probe | Command / method | Result |
|-------|------------------|--------|
| Policy structure | `buildBackupCredentialPolicy` | limited actions; bucket ARNs only |
| Policy in secrets | parse `R2_CREDENTIAL_POLICY` | same; no `*` |
| Positive ACL | `aws s3api head-bucket holocron-backup` | OK |
| Negative ACL | `aws s3api head-bucket laneshadow` | 403 Forbidden |
| SSE (provision) | D04-02 `get-bucket-encryption` | AES256 |
| SSE (scoped runtime) | `get-bucket-encryption` | AccessDenied (expected) |
| TLS | endpoint + code fail-closed | https only |
| pgBackRest cipher | conf audit | aes-256-cbc ≠ none; mode 0600 |
| RESTIC_PASSWORD | secrets presence | present len 43 |
| Prefix list pgbackrest | `list-objects-v2` | 0 password/cipher files |
| Prefix list restic | `list-objects-v2` | 0 plaintext password files |
| Git secret values | strict patterns | 0 hits |
| secrets doctor | presence only | exit 0; 7/7 R2; no values |
| Alert payloads | D04-05 induced JSON | safe fields only |

---

## Artifacts reviewed (read-only)

| Path | Role |
|------|------|
| `services/platform/src/backup/config.ts` | Policy builder, https fail-closed, secret key names |
| `services/platform/src/backup/r2-provision.ts` | SSE put/get, scoped mint, conf render, negative ACL |
| `services/platform/src/backup/restic-mirror.ts` | RESTIC_PASSWORD, s3:https repo, no co-location |
| `services/platform/src/backup/alerting.ts` | Payload builder, webhook POST, induce modes |
| `services/platform/config/secrets.example.yaml` | Schema placeholders only |
| `services/platform/config/.gitignore` + `pgbackrest/.gitignore` | Secret file ignore rules |
| Operator `secrets.yaml` (gitignored) | Presence + policy JSON (values not copied into review) |
| D04-02/04/05 `.tmp` evidence | SSE, provision, restic, alert captures |

**Prohibited:** No modifications to `services/platform/**` production code in this review.

---

## Gate summary

| Gate | Status |
|------|--------|
| Policy Resource = backup bucket ARN only | PASS |
| Policy Action limited (no s3:*) | PASS |
| Negative ACL on non-backup bucket | PASS |
| secrets.yaml / pgbackrest conf gitignored | PASS |
| Zero committed secret values | PASS |
| secrets doctor presence-only OK | PASS |
| SSE AES256 (provision evidence) | PASS |
| TLS https endpoints | PASS |
| pgBackRest cipher ≠ none | PASS |
| RESTIC_PASSWORD set | PASS |
| Keys not co-located in R2 prefixes | PASS |
| Alert payload redaction | PASS |
| Rotation failure → alert (not silent) | PASS |
| Finding log with verdict | PASS |

**Verdict: APPROVED**
