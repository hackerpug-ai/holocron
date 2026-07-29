# GATE-FIX-S28R3-QA6 — Bounded collision-resistant fresh-target host from GATE_RUN_ID

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Source QA: `qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678` on `61da2cbe7da045c0ad77de46180e5a041b7c2f97` (step3 host length 65 refuse)  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa6-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Every allowlisted `GATE_RUN_ID` (1–64) yields a deterministic Docker/fresh-target host matching the existing host allowlist (1–64, alphanumeric + `_`/`-`). Full unmodified run ID remains for evidence paths. Step 3 no longer fails host validation on long valid run IDs (e.g. the QA ID that produced host length 65). Preserve **DEPENDENCY-S28-R2-RO**.

## Defect

`HOST="s28r3-gate-${GATE_RUN_ID}"` → prefix 11 + run-id up to 64 = up to 75 chars. QA run id length 54 → host 65 → provision refuses `length 1-64` before restore-only credential boundary.

## MUST

1. NEW `scripts/derive-s28-fresh-host.sh` (or equivalent): read `GATE_RUN_ID` (must already be allowlisted), print host ≤64 matching provision host regex.
   - Prefer: if `s28r3-gate-${GATE_RUN_ID}` length ≤64 use it; else `s28r3-` + first 16 hex of sha256(GATE_RUN_ID) (or similar readable prefix + digest) for collision resistance.
   - Do not silently truncate run id alone without digest.
2. gate-plan **step 3 only** `literal_cmd`: `HOST="$(bash scripts/derive-s28-fresh-host.sh)"` (after assert-gate-run-id); trap/cleanup uses same `$HOST` for container/volumes/network.
3. EVID remains `.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}` (full id).
4. Regenerate HUMAN-GATE from plan. Steps 1,2,4,5,6 **byte-identical**.
5. RED-first tests for: exact QA run id host valid ≤64; max 64-char run id; short ids; two long ids same prefix different suffix → distinct hosts; evidence path still contains full GATE_RUN_ID; step3 source uses derive script.

## NEVER
Weaken assert-gate-run-id · lengthen host validator · fabricate R2_RESTORE · rewrite active gate-results/evidence · Sprint 27 / .tmp/D05-* / surface 137

## VERIFY
```bash
bash -n scripts/derive-s28-fresh-host.sh scripts/assert-gate-run-id.sh scripts/provision-fresh-restore-target.sh
bash scripts/render-human-gate-from-plan.sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts
# optional: GATE_RUN_ID=qa28-... bash -c 'source assert; HOST=$(derive); provision dry or length check'
pnpm tsgo --noEmit
```

## WRITE-ALLOWED
scripts/derive-s28-fresh-host.sh (NEW)  
gate-plan.json step3 only · HUMAN-GATE.md · SPRINT.md task row  
tests sprint28-s28r3-qa6-gate-fix.test.ts  
Terra red-hat-20260729T104015Z if untracked  
.tmp/GATE-FIX-S28R3-QA6/**

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{"version":"1","task_id":"GATE-FIX-S28R3-QA6","qa_run_id":"qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678","reviewed_sha":"61da2cbe7da045c0ad77de46180e5a041b7c2f97","requirements":[{"id":"AC-1","primary":true},{"id":"AC-2"},{"id":"AC-3"},{"id":"AC-4"},{"id":"AC-5"}],"tdd_mode":"red_first","residual_preserved":"DEPENDENCY-S28-R2-RO"}
-->
