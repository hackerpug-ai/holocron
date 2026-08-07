# REDHAT-FIX-RH-S30-32 — Eighth independent closeout residuals (C-3 + M-3)

**Source review:** `.spec/reviews/red-hat-sprint-30-20260807T110711Z-independent-final-closeout.md`  
**Status:** Implemented + fresh gate/package ready for independent re-review. Sprint remains **In Progress** (no complete/release).

## Fresh package (independent review target)

**Supersedes** partial retry `20260807T112331Z` (2/5, verifier fail) that followed a secrets re-arm quote corruption, and prior green `20260807T113055Z`.

| Field | Value |
|---|---|
| run_id | `20260807T113518Z` |
| source_sha_at_run / sourceRevision | `74c3846c3f0ca335ec4bd8ebdf8691f4d0517bc8` |
| package_commit (P1) | `47dffa317f1490a1850f1750d5f02f04f47f9217` |
| attestation_commit (A1) | `3ab45b0b513dbe3cd6698ad3f841c2d01f7a8b1c` |
| lock_commit | `ec0d354c9b5c106bddb7eae9773425e7c4572cd2` |
| post-package tip | `7d6ac3b0d850333bb72ceb3392f52ff6a6029956` |
| protocol | C-2-atomic-v5-git-bound-attestation |
| gate verdict | pass 5/5; verifier verified:true; C-3 marker-miss + one-trigger-missing + success-path closed |
| M-3 | package-bound `m3-identity/` only; real RED/mutation vitest FAIL signatures; manifest no self-hash; `assert-m3-identity.post-package.json` committed |

Evidence root:  
`.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T113518Z/`

### Secrets re-arm quote bug (fixed)

Ad-hoc `re.sub` re-arm left `HOLO_MIGRATION_READ_ONLY: "1""` (YAML `Unexpected double-quoted-scalar`), blocking tip boot.  
**Durable fix:** `scripts/rearm-sprint30-cutover-control-plane.sh` + `scripts/lib/rearm-sprint30-cutover-control-plane.ts` — surgical repair of that one key if corrupt, then `writeDurableMigrationReadOnly` / `writeDurableDataPlane` (upsertSecretsFile). Never regex-rewrite secrets values. Pre/post YAML parse checks; never prints secret values.

## Blockers closed

### C-3 CRITICAL — operator-supplied disposable DB + canonical alias reject + seed opt-in false

| Requirement | Change |
|---|---|
| No silent default marker URL | `run-sprint30-human-gate.sh` fails if `HOLO_PROBE_MARKER_MISS_DATABASE_URL` unset |
| Seed opt-in default off | `HOLO_PROBE_SEED_PONR` defaults to `0` in gate runner; probe already refused empty without `=1` |
| Canonical URI equality | `scripts/lib/canonical-pg-url.py` — `postgres`≡`postgresql`, omitted port≡`:5432`, lowercased host |
| Reject gate-target aliases | Marker probe + gate runner compare canonical identities; same-target URI-alias negative retained |
| One-trigger-missing negative | `scripts/probe-ponr-one-trigger-missing-negative.sh` disables each required trigger in turn on disposable DB; package-binds report + URI-alias refuse |

### M-3 HIGH — no legacy fallback; package-bound; real RED/mutation; valid manifest

| Requirement | Change |
|---|---|
| Remove legacy fallback | `assert-m3-identity-evidence.sh` accepts only `m3-identity/`; package removes `m3-branch-identity` |
| No optional `\|\| true` staging | Package script fails closed if m3 tree/required files missing |
| Real RED/mutation signatures | Assert requires FAIL/AssertionError/Tests failed + vitest/exit; `capture-m3-identity-red-mutation.sh` runs controlled vitest RED |
| Valid manifest digests | Manifest omits self-entry; every listed path SHA-256 verified |
| Package-bind assertion | Attestation binds `m3-*` OIDs; post-package `assert-m3-identity.post-package.json` is committed |

## Operator env for next gate package

```bash
set -a; source .env; set +a
# or secrets.yaml DATABASE_URL for gate
export DATABASE_URL=...                          # gate/cutover
export HOLO_PROBE_MARKER_MISS_DATABASE_URL=...   # REQUIRED distinct disposable (e.g. holocron_nonprod)
export HOLO_PROBE_SEED_PONR=1                    # only if disposable needs seed row
bash scripts/capture-m3-identity-red-mutation.sh  # refresh RED/mutation if needed
# then human gate + package-sprint30-gate-evidence.sh
```

## Keep In Progress

Do not mark Sprint 30 complete, do not write a gate pass release, do not merge/push as done until a fresh independent closeout re-review.
