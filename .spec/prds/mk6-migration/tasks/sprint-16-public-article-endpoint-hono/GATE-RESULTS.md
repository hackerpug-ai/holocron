# Sprint 16 Gate Results — Public Article on Hono

**Source head:** `eedb17f396911e2eb8bd985db561001d00e0365a`  
**Database:** real `holocron_nonprod` Postgres  
**Service:** real Bun/Hono composition root  
**Raw evidence:** `.tmp/sprint-16-human-gate-20260718/`

## Verdict

**PASS — all six direct human steps passed.**

The gate used direct `curl`, `psql`, and the CLI against real Postgres, real Hono, and real filesystem BlobStore bytes. No wholesale test suite substituted for a human step.

| Step | Result | Proof |
|---|---|---|
| G1 public HTML | PASS | HTTP 200, HTML content, health Postgres/fleet/queue ready |
| G2 legacy compatibility | PASS | `holo article:compat` returns `/article/<token>` |
| G3 scoped asset | PASS | returned bytes match retained content-addressed file |
| G4 unshare revocation | PASS | article and asset both return 404 after `is_public=false` |
| G5 private token | PASS | 404 |
| G6 unknown token | PASS | 404 |

## Independent review

`.tmp/sprint-16-independent-review-final.md` reports PASS with zero CRITICAL/HIGH/MEDIUM findings. Remediation also proved UTC-stable byte-golden output across four time zones, exact public route exemption, `no-store` revocation behavior, and migration/schema safety.

`gate-verification.json` recomputes all six raw statuses, real dependency health, content type, asset bytes, revocation, private/unknown 404s, middleware boundary, and timezone checks.
