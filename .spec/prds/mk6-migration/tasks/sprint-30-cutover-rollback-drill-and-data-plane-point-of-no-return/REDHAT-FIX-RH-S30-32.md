# REDHAT-FIX-RH-S30-32 — Eighth independent closeout residuals (C-3 + M-3)

**Source review:** `.spec/reviews/red-hat-sprint-30-20260807T110711Z-independent-final-closeout.md`  
**Status:** Implemented + fresh gate/package ready for independent re-review. Sprint remains **In Progress** (no complete/release).

## Fresh package (independent review target)

| Field | Value |
|---|---|
| run_id | `20260807T113055Z` |
| source_sha_at_run / sourceRevision | `a607f2e0b4d3c46d88448d49e99a9ea4ffc6f502` |
| package_commit (P1) | `52ed2d0280ee7d14e2bf2d913c15596448f39c4f` |
| attestation_commit (A1) | `b9a7f91193b1dd3d11288186625b126e3cf9f713` |
| lock_commit / post-package tip | `62d72dff36a3a00e9f3fdb64c8ed0c034941ba0e` (HEAD at package complete) |
| protocol | C-2-atomic-v5-git-bound-attestation |
| gate verdict | pass 5/5; C-3 marker-miss + one-trigger-missing + success-path closed |
| M-3 | package-bound `m3-identity/` only; real RED/mutation vitest FAIL signatures; manifest no self-hash; `assert-m3-identity.post-package.json` committed |

Evidence root:  
`.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260807T113055Z/`

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
