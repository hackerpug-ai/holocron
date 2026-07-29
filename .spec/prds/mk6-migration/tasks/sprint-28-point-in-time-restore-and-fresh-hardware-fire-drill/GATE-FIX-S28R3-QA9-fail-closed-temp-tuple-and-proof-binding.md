# GATE-FIX-S28R3-QA9 — Fail-closed temporary tuple + proof binding

> Status: ✅ Complete  

> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer / test-quality  
> Reviewer: code-reviewer + test-quality-reviewer + security-reviewer  
> Priority: P0  
> Source review: `.spec/reviews/red-hat-20260729T151421Z-sprint-28-sha-123bd09f.md` on `123bd09f1c40b30ad6850312b0a14a201dbfe49b`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Remediate every QA8 red-hat finding. Same-parent-ID temporary credentials remain supported only when the complete writer tuple can be resolved and proven different; the live read-only proof must be bound to the exact tuple consumed by provision/fire-drill.

## Findings

1. **HIGH-1:** same-ID exception accepts when the authoritative writer secret is unavailable, so distinctness is inferred rather than established.
2. **HIGH-2:** `verify-restore-creds.sh` does not import `R2_RESTORE_SESSION_TOKEN` from canonical secrets input.
3. **MEDIUM-1:** standalone live denial proof is not bound to the exact tuple later consumed by provision/fire-drill.
4. **MEDIUM-2:** verifier and fire-drill protection is source-text-only rather than behavioral.
5. **LOW-1:** mint flow logs the first six characters of the Access Key ID.

## MUST

1. Add RED behavioral tests for all four scripts using isolated executable fixtures:
   - valid same-ID + explicitly different secret + non-empty session token;
   - same-ID + missing writer secret;
   - same-ID + equal writer/restore secret;
   - same-ID + missing session token;
   - restore session token loaded from canonical secrets file;
   - fire-drill child receives the token without serializing/logging it.
2. For any same-parent-ID exception, require both authoritative writer ID and writer secret to be present. Require restore secret explicitly unequal to writer secret plus a non-empty restore session token. Unknown writer secret is a hard failure.
3. Import `R2_RESTORE_SESSION_TOKEN` beside restore ID/secret in `verify-restore-creds.sh`, preserving env-over-file precedence.
4. Bind a successful List-allowed / sacrificial Put-denied / Delete-denied proof to the exact effective tuple immediately before provision/fire-drill consumption. Use a safe non-secret tuple fingerprint/attestation or rerun the proof in-process; fail closed on missing/mismatched/stale proof. Do not weaken the sacrificial-key denylist.
5. Replace QA8 source-text assertions for verifier/fire-drill with mutation-resistant process tests.
6. Stop logging any Access Key ID prefix. Log only credential mint success and permission kind.
7. Run focused tests, all `sprint28-*.test.ts`, shell syntax checks, the real ignored-`.env` read-only proof, and the six-step preflight where applicable. Commit to `main` with hooks enabled.

## NEVER

Print or commit credential values · accept unknown/equal writer secret · bypass the session token · weaken List/Put/Delete live oracle · target live recovery keys with destructive probes · hand-edit gate results/evidence · touch Sprint 27 / unrelated `.tmp` changes / surface 137

## VERIFY

```bash
pnpm exec vitest run services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts
pnpm exec vitest run services/platform/tests/integration/sprint28-*.test.ts
bash -n scripts/prove-r2-readonly.sh scripts/provision-fresh-restore-target.sh \
  scripts/verify-restore-creds.sh scripts/run-fire-drill-on-fresh-target.sh
set -a; source .env; set +a
REQUIRE_LIVE_R2_RO=1 bash scripts/prove-r2-readonly.sh
```

## WRITE-ALLOWED

- `scripts/prove-r2-readonly.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/verify-restore-creds.sh`
- `scripts/run-fire-drill-on-fresh-target.sh`
- `services/platform/tests/integration/sprint28-s28r3-qa8-gate-fix.test.ts`
- `services/platform/tests/integration/sprint28-s28r3-qa9-gate-fix.test.ts` (NEW)
- this task and optional Sprint 28 task-row/status artifacts
- `.tmp/GATE-FIX-S28R3-QA9/**` local evidence

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA9","reviewed_sha":"123bd09f1c40b30ad6850312b0a14a201dbfe49b","findings":["HIGH-1","HIGH-2","MEDIUM-1","MEDIUM-2","LOW-1"],"tdd_mode":"red_first","unknown_writer_secret_fails":true,"session_token_file_load_required":true,"live_proof_binding_required":true}
-->
