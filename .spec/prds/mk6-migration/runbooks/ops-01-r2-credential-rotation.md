# S31-OPS-01 — Operator R2 Credential Rotation Checklist

**Capability:** CAP-BAK-01  
**Task:** S31-OPS-01  
**Audience:** **OPERATOR ONLY** (human with Cloudflare R2 console access)  
**IRREVERSIBLE:** yes — revoking the old access key cannot be undone by an agent

> **Agent boundary (hard):** Agents MUST NOT call the Cloudflare API, rotate or
> revoke R2 keys, or write live credentials into git. This runbook is executed
> by a human on the mini. Agents may only verify that this checklist exists and
> that repo LaunchAgent plists / conf examples are non-stub.

Related:

- LaunchAgents: `services/platform/deploy/launchd/holocron-{base-backup,wal-archive,restic-blob-mirror,backup-alert-sweep}.plist`
- Secrets template (names only): `services/platform/config/secrets.example.yaml`
- Live secrets (never commit): `services/platform/config/secrets.yaml` or `HOLOCRON_SECRETS_PATH` / `HOLO_SECRETS_PATH`
- Production pgBackRest conf (operator-owned, never harness-written):  
  `services/platform/config/pgbackrest/pgbackrest.conf`
- Nonprod/harness conf example only:  
  `services/platform/deploy/nonprod/pgbackrest.conf.example`
- Fire-drill runbook (restore proof, not rotation):  
  [fire-drill-monthly.md](./fire-drill-monthly.md)

---

## Why rotate

Stale or over-broad R2 tokens leave WAL archive, base backup, and restic mirror
failing silently or with delayed heartbeats. After Convex deletion (Sprint 32),
the mini + R2 chain is the only copy of the data (R19). Rotation proves the
standing chain still authenticates with current keys and that the **old** key
no longer works.

---

## Preconditions (operator)

- [ ] Cloudflare account access to the Holocron R2 bucket (`R2_BUCKET_NAME`, typically `holocron-backup`).
- [ ] Shell on the mini with repo checkout used as `HOLO_ROOT` (prefer main clone, not a disposable worktree).
- [ ] Ability to edit **local** secrets only (not git):
  ```bash
  # Prefer explicit path in worktrees
  export HOLOCRON_SECRETS_PATH="${HOLOCRON_SECRETS_PATH:-$HOLO_ROOT/services/platform/config/secrets.yaml}"
  test -f "$HOLOCRON_SECRETS_PATH"
  ```
- [ ] Optional: load operator `.env` when live credentials live there (never commit):
  ```bash
  set -a; source .env; set +a
  ```
- [ ] LaunchAgents installed with **real** ProgramArguments (not `/usr/bin/true`):
  ```bash
  UID_NUM=$(id -u)
  for L in holocron-base-backup holocron-wal-archive holocron-restic-blob-mirror holocron-backup-alert-sweep; do
    launchctl print "gui/${UID_NUM}/${L}" 2>/dev/null | head -40 || true
  done
  # Expect ProgramArguments → bun …/holo.ts backup:{base|wal|mirror|alert-sweep}
  ```
- [ ] Note wall-clock **rotation start** (UTC) for status comparison:
  ```bash
  export ROTATION_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "ROTATION_TS=$ROTATION_TS"
  ```

---

## Operator steps

### 1) Create a new scoped R2 API token / access key pair

In the **Cloudflare dashboard** (human browser session — not agent automation):

1. Open R2 → Manage R2 API Tokens (or account API tokens with R2 object permissions).
2. Create a **new** token scoped to the backup bucket only (List/Get/Put/Delete on that bucket; no multi-bucket admin parent keys for runtime).
3. Copy the new **Access Key ID** and **Secret Access Key** into a local password manager / operator notepad — **never** into a PR, chat, commit, or review artifact.
4. Keep the **old** key material available for a negative auth probe (step 6) until revoke.

### 2) Update mini secrets (local only — not git)

Edit the live secrets store (path above). Update at least:

| Key | Role |
|-----|------|
| `R2_ACCESS_KEY_ID` | Runtime backup token (pgBackRest + restic mirror) |
| `R2_SECRET_ACCESS_KEY` | Matching secret |
| `R2_SESSION_TOKEN` | Only if using temporary creds; clear if unused |
| `R2_ENDPOINT` / `R2_ACCOUNT_ID` / `R2_BUCKET_NAME` | Confirm unchanged |
| `R2_PGBACKREST_PREFIX` / `R2_RESTIC_PREFIX` | Confirm expected prefixes |
| `R2_REPO_CIPHER_PASS` / `RESTIC_PASSWORD` | Unchanged unless also rotating crypto |
| `ALERT_WEBHOOK_URL` | Non-empty production webhook for alert-sweep |

Also refresh **production** `pgbackrest.conf` if it embeds `repo1-s3-key` / `repo1-s3-key-secret` (common for `archive_command` with no ambient env):

```bash
# Operator only — never with HOLO_HARNESS=1 or PLATFORM_IT=1
# Prefer:
holo backup:provision --validate   # if available / validate-only path
# or re-run provision without harness flags so conf is rewritten under
# services/platform/config/pgbackrest/pgbackrest.conf (gitignored, mode 0600)
```

**MUST NOT:**

- Commit `secrets.yaml`, live `.env` values, or production `pgbackrest.conf` contents.
- Point harness / `HOLO_HARNESS=1` processes at production conf (R24 / S31-OPS-03).
- Paste key material into tickets, Slack, or agent prompts.

### 3) Prove new credentials: base backup + status

```bash
export HOLO_ROOT="${HOLO_ROOT:-$HOME/Projects/holocron}"
cd "$HOLO_ROOT"

# Fresh base backup with the new key
holo backup:base --json
# Expect exit 0; JSON ok/success semantics for CAP-BAK-01 base job

# Standing status (WAL + base + mirror heartbeats)
holo backup:status --json
# Expect last base success timestamp >= ROTATION_TS
# Expect recent WAL success; mirror may lag until next schedule or manual run
```

Optional immediate mirror proof (AC-4 on mini):

```bash
holo backup:mirror --json
# Expect exit 0 and backup_heartbeat restic_blob_mirror status=ok
```

Optional webhook path (AC-5):

```bash
# ALERT_WEBHOOK_URL must resolve from env or secrets (plist carries @ALERT_WEBHOOK_URL@ placeholder)
test -n "${ALERT_WEBHOOK_URL:-}" || echo "ensure ALERT_WEBHOOK_URL in secrets before install"
holo backup:alert-sweep --json
# Missing webhook with overdue/failed jobs must fail closed (non-zero / explicit error)
```

### 4) Confirm LaunchAgents still run real commands

```bash
UID_NUM=$(id -u)
launchctl print "gui/${UID_NUM}/holocron-base-backup" | grep -A20 ProgramArguments || true
# MUST NOT be sole /usr/bin/true
# MUST invoke holo … backup:base (via bun …/holo.ts)
```

Re-install from repo templates if needed:

```bash
./scripts/install-launchd.sh --bootstrap
# Ensure ALERT_WEBHOOK_URL is expanded at install for alert-sweep (never commit the live URL)
```

### 5) Revoke the **old** R2 access key

Back in the Cloudflare console (human only):

1. Disable / delete the **previous** API token or access key that was replaced in step 2.
2. Do **not** revoke the new key.
3. Record revoke time (UTC) in the operator log.

> Agents must never be instructed to call Cloudflare APIs with live admin tokens
> to perform this step.

### 6) Negative control — prove old key fails

With the **old** key material only (local env override; do not write old keys back into secrets):

```bash
# Example shape only — paste values from your password manager, not from git
export R2_ACCESS_KEY_ID='OLD_ACCESS_KEY_ID'
export R2_SECRET_ACCESS_KEY='OLD_SECRET_ACCESS_KEY'
unset R2_SESSION_TOKEN

# Any cheap authenticated R2 list/head against the backup bucket should fail
# (AccessDenied / InvalidAccessKeyId / SignatureDoesNotMatch — not a silent empty success)
holo backup:status --json || true
# Prefer a direct aws-cli / rclone / s3-compatible list with the old key if status still
# uses ambient process secrets; the hard requirement is: old key auth FAILS.
```

**MUST_OBSERVE:** authentication failure for the revoked key.  
**MUST_NOT_OBSERVE:** successful object list/write with the old key; success with expired credentials.

### 7) Sign-off evidence (operator)

Capture (redact secrets):

- [ ] `ROTATION_TS=…`
- [ ] `holo backup:base --json` exit 0
- [ ] `holo backup:status --json` shows `last_base_success_at` (or equivalent) **after** `ROTATION_TS`
- [ ] Old key probe: AccessDenied / equivalent
- [ ] Confirm no secrets in git: `git status` clean of `secrets.yaml` / `.env` / production conf
- [ ] Operator name + UTC timestamp of revoke + sign-off

Agent half of AC-1 only checks that **this runbook file exists** and documents the
operator steps above — it does **not** perform rotation.

---

## Rollback notes

- If the new key fails auth before revoke: keep the old key active, fix secrets/conf, re-run `backup:base`, then resume rotation.
- After revoke, only the new key + restore-scoped keys (if separate) should work.
- Harness isolation (S31-OPS-03): never “fix” rotation by writing production conf from `HOLO_HARNESS=1` / gate processes.

---

## Checklist summary

| Step | Actor | Result |
|------|--------|--------|
| Create new R2 key | Operator (Cloudflare UI) | New key pair held offline |
| Update secrets + conf | Operator (local mini) | Runtime uses new key |
| `holo backup:base` / `backup:status` | Operator | Fresh success after `ROTATION_TS` |
| Optional `backup:mirror` / webhook | Operator | Heartbeat + alert path green |
| Revoke old key | Operator (Cloudflare UI) | Old key unusable |
| Prove old key fails | Operator | AccessDenied (or equivalent) |
| Sign-off | Operator | Evidence without raw secrets |
| Checklist artifact present | Agent tests | This file + rotation steps |
