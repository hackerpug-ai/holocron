# SECURITY REVIEW — D05-06: Fresh-restore-target trust boundary

**Status:** Completed  
**Task:** D05-06 — Security review: fresh-restore-target trust boundary  
**Reviewer:** security-reviewer  
**Date:** 2026-07-28  
**Branch reviewed:** `task/D05-06-s28` (consumes D05-02..D05-05 implementation lineage)  
**Scope:** Fresh-restore-target trust boundary — isolation from original mini, R2 restore credential scope, secret hygiene in fire-drill artifacts, restored Postgres exposure  
**Out of scope:** Multi-tenant RLS, app-layer auth beyond restore path, modifying D05-02..D05-05 production code (read-only review)

**Evidence directory:** `.tmp/D05-06/`  
**Live probes:** `nc` to `MINI_HOST`, mount table, docker inspect `fresh-restore-01`, `prove-r2-readonly.sh` RW negative control against real R2, grep secret scan over D05-04/D05-05 artifacts, PGDATA `listen_addresses`/`pg_hba` + listeners  
**Sibling seeded evidence:** D05-03 provision + isolation; D05-04 fire drill + parity report; D05-05 runbook + mission template  

---

## AC verdict table (mandatory)

| AC | Check | Verdict | Evidence |
|----|--------|---------|----------|
| AC-1 | Fresh target has zero mini access | **PASS** | `scripts/verify-restore-isolation.sh --mini-host 203.0.113.1` exit **0**; nc unreachable; 0 mini mounts; container `NetworkMode=fresh-restore-01-net` (not host); PortBindings `127.0.0.1:55432`; in-container nc non-zero. Negative: `MINI_HOST=127.0.0.1` exit **1** (co-location + reachable). |
| AC-2 | Restore creds are read-only + scoped | **PASS (residual)** | Declarative RO policy: Actions = `ListBucket`/`GetBucketLocation`/`GetObject`, Put/Delete=0, Resource=`arn:aws:s3:::holocron-backup(/ *)`, kind=`object-read-only`. Live **fail-closed**: backup RW keys → `aws s3 cp` **SUCCEEDED** → prove-r2-readonly exit **1**. **Residual DEPENDENCY-S28-R2-RO:** no minted `R2_RESTORE_*` object-read-only identity; live positive RO List/Get proof blocked until human mints RO token. |
| AC-3 | Zero secret leakage in restored artifacts | **PASS** | `scripts/verify-restored-artifacts.sh` exit **0**; 37 files scanned; credential_pattern_hits=**0**; pgBackRest logs show `repo1-s3-key=<redacted>` / cipher-pass redacted; no `R2_SECRET_ACCESS_KEY` value dumps. |
| AC-4 | Restored Postgres not exposed | **PASS** | `fire-drill.ts` starts with `-h 127.0.0.1`; scratch PGDATA `listen_addresses=127.0.0.1,::1`; pg_hba 0 non-loopback host lines; postmaster torn down after drill; docker `HostIp=127.0.0.1` only; 0 postgres listeners on `0.0.0.0:55432`. |
| AC-5 | Findings doc with explicit verdict | **PASS** | This document; final **Verdict: APPROVED** line below. |

---

## SECURITY REVIEW VERDICT

**STATUS: PASS**

**Verdict: APPROVED**

No CRITICAL findings that break the fresh-restore trust boundary under exercised probes. The only material residual is **DEPENDENCY-S28-R2-RO** (durable/temporary object-read-only R2 identity not yet minted in this environment). Fail-closed behavior against RW identity reuse is proven live. Residual does **not** soft-pass as “live RO works”; it is documented as operator follow-up before production fire drills on separate hardware.

---

## What was checked

### AC-1 — Fresh target has zero mini access

**What:** Prove restore target cannot reach original mini Postgres and does not share PGDATA/blob mounts or host network.

**How (real probes):**
1. `MINI_HOST=203.0.113.1` (TEST-NET-3 stand-in used by D05-03 provision) via `scripts/verify-restore-isolation.sh`  
   - `nc -z 203.0.113.1 5432` → **non-zero** (unreachable)  
   - mount table: **0** `/mnt/mini-pgdata` / `/mnt/mini-blobs`  
   - docker `fresh-restore-01`: `NetworkMode=fresh-restore-01-net` (not `host`)  
   - PortBindings: `{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"55432"}]}`  
   - in-container nc → non-zero  
   Evidence: `.tmp/D05-06/ac1-isolation-probe.txt`, `ac1-incontainer-nc.txt`
2. **Negative control:** `MINI_HOST=127.0.0.1` while local `:5432` listens → **FAIL** (exit 1): co-location rejected + `nc` succeeded.  
   Evidence: `.tmp/D05-06/ac1-negative-loopback.txt`

**Must not observe:** reachable mini routes; shared mini mounts; `network_mode=host`.  
**Result:** **PASS**

---

### AC-2 — Restore creds are read-only + scoped

**What:** Restore identity must be List/Get only on backup bucket, distinct from app/backup RW, and probes must fail closed on write-capable keys.

**How:**
1. **Declarative policy** from D05-03 `restore-target.env` `R2_CREDENTIAL_POLICY`:  
   - Actions: `s3:ListBucket`, `s3:GetBucketLocation`, `s3:GetObject` (Put/Delete count = **0**)  
   - Resources: `arn:aws:s3:::holocron-backup`, `arn:aws:s3:::holocron-backup/*`  
   - `R2_CREDENTIAL_KIND=object-read-only`  
   - No ambient `R2_PARENT_*` / `R2_*READ_WRITE*` on probe path  
   Evidence: `.tmp/D05-06/ac2-restore-creds.txt`
2. **Live fail-closed (RW as RO):** backup runtime keys from operator `secrets.yaml` exercised via `scripts/prove-r2-readonly.sh` against real endpoint `https://d5110b1895ee190e145c0c8756f49879.r2.cloudflarestorage.com`:  
   - `aws s3 ls s3://holocron-backup` → OK  
   - `aws s3 cp` → **SUCCEEDED** → probe **FAIL** (not object-read-only)  
   Evidence: `.tmp/D05-06/ac2-rw-negative-control.txt`
3. **Distinctness:** restore placeholder AK ≠ `DATABASE_URL` user; restore AK ≠ backup `R2_ACCESS_KEY_ID` string (placeholder vs RW).  
4. **Residual DEPENDENCY-S28-R2-RO:**  
   - No `R2_RESTORE_*` in secrets; mint path needs `CLOUDFLARE_API_TOKEN` + `R2_PARENT_ACCESS_KEY_ID` (absent)  
   - `restore-target.env` still carries placeholder endpoint/keys until human mints durable object-read-only token  
   - Full live positive (List OK + Put/Delete AccessDenied on **distinct** RO identity) **not** claimed

**Code contract (read-only):** `mintScopedCredentials({ permission: 'object-read-only' })` in `r2-provision.ts` emits List/Get-only policy; `fresh-target.md` documents the same ARN shape.

**Must not observe:** Put/Delete on restore policy; Resource `*`; RW identity accepted as RO.  
**Result:** **PASS with residual** — fail-closed + RO policy proven; live RO mint pending human/admin.

---

### AC-3 — Zero secret leakage in restored artifacts

**What:** Fire-drill outputs, runbook, mission template, and restored config logs must not embed credentials.

**How:**
1. `scripts/verify-restored-artifacts.sh` scanned **37** text artifacts under `.tmp/D05-04`, runbook, mission template, scratch start log / auto.conf.  
2. Patterns: `AKIA…`, `R2_SECRET_ACCESS_KEY=…`, `repo1-s3-key(-secret)=` non-redacted, `postgres://user:pass@`, PEM private keys, Bearer tokens, `RESTIC_PASSWORD=…`.  
3. Results: **credential_pattern_hits=0**; hits file empty.  
4. pgBackRest command lines in D05-04 logs use `<redacted>` for key/secret/token/cipher-pass.  
5. `resticPasswordInSecrets: true` is a boolean presence flag (allowlisted), not a password dump.  
6. Operational endpoint host (`…r2.cloudflarestorage.com`) appears in parity report — account id is not a secret key material (see LOW).

**Evidence:** `.tmp/D05-06/ac3-secret-scan.txt`, `ac3-secret-hits.txt` (empty), `ac3-scan-file-list.txt`  
**Result:** **PASS**

---

### AC-4 — Restored Postgres not exposed

**What:** Restored cluster binds localhost/unix only; not reachable externally; target access-scoped after drill.

**How:**
1. **Code:** `services/platform/src/backup/fire-drill.ts` `startRestoredPostgres` uses `pg_ctl … -o "-p ${port} -k ${socketDir} -h 127.0.0.1"`.  
2. **Scratch PGDATA** `/tmp/d05-04-fire-scratch` (D05-04 fire drill):  
   - `listen_addresses = '127.0.0.1,::1'`  
   - `pg_hba.conf` active host lines: `127.0.0.1/32` and `::1/128` only (trust local)  
   - `pg_ctl status` → not running (torn down after drill)  
3. **Listeners:** no postgres on `0.0.0.0:55432`; docker publish `127.0.0.1:55432` only; `PublishAllPorts=false`.  
4. **Note:** host `ssh` listens on `*:5432` (tunnel) and `127.0.0.1:55432` — not restored postgres; documented, not counted as restore exposure.

**Evidence:** `.tmp/D05-06/ac4-postgres-exposure.txt`, `ac4-pg-hba-active.txt`, `ac4-listeners.txt`, `ac4-docker-ports.json`  
**Result:** **PASS**

---

### AC-5 — Findings log with verdict

**What:** This document.  
**Result:** **PASS** — AC-1..AC-4 verdicts with command evidence; final **Verdict: APPROVED**.

---

## What was found

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM (do not block APPROVED; operator residual)

1. **DEPENDENCY-S28-R2-RO — live object-read-only identity not minted**  
   Only backup **object-read-write** temporary credentials exist in operator secrets. Restore path has correct declarative RO policy + kind, but live positive RO proof (List allowed + Put/Delete AccessDenied on a **distinct** key) cannot complete until:
   - Cloudflare dashboard: Object Read only token on `holocron-backup`, exported as `R2_RESTORE_*`, **or**
   - Admin mint: `CLOUDFLARE_API_TOKEN` + `R2_PARENT_ACCESS_KEY_ID` → `prove-r2-readonly.sh --try-mint`  
   **Risk:** Operator might reuse RW keys on a restore target if isolation scripts are skipped. Mitigated by: provision writes RO policy/kind; `prove-isolation` / `prove-r2-readonly` / `verify-restore-creds` **fail closed** when RW Put succeeds.  
   **Routes to:** D05-03 ops follow-up / human mint (not a production code fix in this review).

### LOW / informational

1. **R2 account id in parity/report URLs** (`restic_repository` host) — operational endpoint, not key material; acceptable for internal evidence; avoid publishing publicly if account id is considered sensitive inventory.  
2. **Host `ssh *:5432` tunnel** coexists with localhost postgres — outside restore-target contract; do not confuse with restored PG exposure.  
3. **Docker restore container** currently runs `sleep infinity` with empty PGDATA (D05-03 shell); actual D05-04 PITR used host scratch `/tmp/d05-04-fire-scratch`. Both paths audited: compose loopback publish + fire-drill `-h 127.0.0.1` + scratch listen/hba.  
4. gitleaks/trufflehog not installed on reviewer host — grep-based scan + redaction checks used (real pattern match, not stub zero).

---

## Adversarial probe summary

| Probe | Command / method | Result |
|-------|------------------|--------|
| Isolation (happy) | `verify-restore-isolation.sh --mini-host 203.0.113.1` | exit 0; 0 routes; 0 mounts |
| Isolation (co-located) | `MINI_HOST=127.0.0.1` | exit 1; nc succeeded |
| Docker network/mounts | `docker inspect fresh-restore-01` | bridge net; loopback ports; no mini binds |
| RO policy shape | parse `R2_CREDENTIAL_POLICY` | List/Get only; bucket ARN; Put/Delete=0 |
| RW as RO (live) | `prove-r2-readonly` with backup keys | Put succeeded → FAIL closed |
| Live RO positive | distinct `R2_RESTORE_*` | **blocked** — DEPENDENCY-S28-R2-RO |
| Secret scan | `verify-restored-artifacts.sh` | 0 credential hits / 37 files |
| PG bind code | `fire-drill.ts` `-h 127.0.0.1` | present |
| PGDATA listen/hba | scratch conf | localhost only; 0 external hba |
| Listeners | lsof/netstat | no 0.0.0.0 postgres on restore port |

---

## Verify scripts (write_allowed; real checks)

| Script | Role | Gate |
|--------|------|------|
| `scripts/verify-restore-isolation.sh` | nc + mounts + docker isolation | AC-1 |
| `scripts/verify-restore-creds.sh` | policy + distinctness + live RW negative / optional RO | AC-2 |
| `scripts/verify-restored-artifacts.sh` | secret pattern scan over fire-drill artifacts | AC-3 |
| `scripts/verify-postgres-exposure.sh` | listen_addresses, pg_hba, listeners, docker ports | AC-4 |

All four exit **0** on the review host with evidence under `.tmp/D05-06/` (AC-2: `PASS_WITH_RESIDUAL`).

---

## Artifacts reviewed (read-only)

| Path | Role |
|------|------|
| `scripts/prove-isolation.sh` / `prove-r2-readonly.sh` | Existing live isolation/RO probes (D05-03) |
| `scripts/provision-fresh-restore-target.sh` | Fresh target compose/env (loopback publish, RO env) |
| `services/platform/src/backup/fire-drill.ts` | Restored PG bind `-h 127.0.0.1` |
| `services/platform/src/backup/r2-provision.ts` | `object-read-only` mint policy |
| `services/platform/src/backup/fresh-target.md` | Isolation + RO policy contract |
| `.tmp/D05-04/parity-report.json` + fire-drill logs | Restored artifact secret scan surface |
| `.spec/…/runbooks/fire-drill-monthly.md` | Runbook secret hygiene language |
| `services/platform/src/mission/templates/fire-drill-monthly.json` | Mission template |
| Operator `secrets.yaml` (gitignored) | Key presence + RW negative control only (values never copied into review) |
| Docker `fresh-restore-01` | Live provisioned target |

**Prohibited:** No modifications to `services/platform/**` production restore code in this review.

---

## Gate summary

| Gate | Status |
|------|--------|
| 0 reachable mini routes (real nc) | PASS |
| 0 shared mini PGDATA/blob mounts | PASS |
| Restore container not host-networked | PASS |
| RO policy Put/Delete count = 0 | PASS |
| RO policy backup bucket ARN only | PASS |
| Fail-closed rejects RW as RO (live Put) | PASS |
| Live distinct RO mint proven | **RESIDUAL** DEPENDENCY-S28-R2-RO |
| Secret scan 0 credential matches | PASS |
| listen_addresses localhost-only | PASS |
| pg_hba 0 external host entries | PASS |
| 0 external restore postgres listeners | PASS |
| Findings doc with explicit verdict | PASS |

**Verdict: APPROVED**
