# GATE-FIX-S28R3-QA8 — Cloudflare temporary credential identity tuple

> Status: ✅ Complete  

> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source: live Cloudflare R2 verification on 2026-07-29  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Accept a real Cloudflare R2 temporary `object-read-only` credential when Cloudflare reuses the parent Access Key ID but returns a distinct secret plus mandatory session token. Continue to reject the backup writer tuple and require the live List-allowed / Put-denied / Delete-denied proof.

## Finding

Cloudflare's supported `POST /accounts/{account_id}/r2/temp-access-credentials` flow returned an object-read-only session whose Access Key ID equals the parent writer ID. The new secret and session token distinguish the session. Live AWS verification against `holocron-backup` proved List allowed, sacrificial Put denied, sacrificial Delete denied, and unrelated-bucket List denied.

Sprint 28 currently compares Access Key ID alone in multiple restore paths. `prove-r2-readonly.sh` therefore rejects a demonstrably read-only Cloudflare session as "impossible", and the provision/fire-drill validators reject it before exercising the live denial oracle.

## MUST

1. Add RED tests for the real Cloudflare shape: same Access Key ID, different secret, non-empty restore session token. The restored tuple must be treated as distinct from the writer tuple.
2. Define identity equality over the complete effective credential tuple, not Access Key ID alone. A same-ID restore credential is acceptable only when its secret differs from the writer secret and it has a non-empty restore session token.
3. Continue to reject all of these cases before live restore:
   - same Access Key ID + same secret;
   - same Access Key ID + missing/empty restore session token;
   - missing restore secret;
   - placeholder values.
4. Preserve the live oracle: List must succeed; sacrificial `drill-neg/<uuid>` Put and Delete must both return AccessDenied/403. Never infer read-only permission only from credential shape.
5. Propagate `R2_RESTORE_SESSION_TOKEN` through provision and fire-drill paths without logging it.
6. Cover every current Access-Key-ID-only rejection in:
   - `scripts/prove-r2-readonly.sh`
   - `scripts/provision-fresh-restore-target.sh`
   - `scripts/verify-restore-creds.sh`
   - `scripts/run-fire-drill-on-fresh-target.sh`
7. Run focused RED/GREEN tests, the complete `sprint28-*.test.ts` suite, and the live read-only proof using the ignored `.env`. Commit the fix to `main` with all hooks enabled.

## NEVER

Print or commit `.env` values · accept a writer-equivalent tuple · weaken/remove Put/Delete denial · target any live recovery key with a destructive probe · hand-edit gate results/evidence · change the six literal gate commands merely to force green · touch Sprint 27 / unrelated `.tmp` changes / surface 137

## VERIFY

```bash
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- `scripts/prove-r2-readonly.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/verify-restore-creds.sh`
- `scripts/run-fire-drill-on-fresh-target.sh`
- `services/platform/tests/integration/sprint28-*.test.ts`
- this task and optional Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA8/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA8","source":"live-cloudflare-r2-temp-credential","tdd_mode":"red_first","same_id_allowed_only_with_distinct_secret_and_session":true,"live_denial_oracle_required":true,"secrets_must_not_be_logged":true}
-->
