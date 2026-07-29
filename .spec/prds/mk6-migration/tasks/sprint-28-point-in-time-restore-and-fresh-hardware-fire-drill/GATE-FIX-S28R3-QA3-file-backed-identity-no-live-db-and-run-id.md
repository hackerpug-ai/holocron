# GATE-FIX-S28R3-QA3 — File-backed identity distinctness, no live DB, required GATE_RUN_ID

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Source: `.spec/reviews/red-hat-20260729T092559Z-sprint-28-final-sha-10bc18a0f.md` (NEEDS-FIXES CRITICAL=3 HIGH=1 MEDIUM=3)  
> Reviewed SHA: `10bc18a0f49a49e57def7ec3fec39978dc7b65f0`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa3-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Close every CRITICAL and HIGH in the Terra review; include all three MEDIUM for command fidelity, full-run success, and operator cleanup. Preserve **`DEPENDENCY-S28-R2-RO`**. Never fabricate keys, weaken gate claims, hand-edit green verdicts, or claim 6/6.

## Findings → fixes

| ID | Sev | Fix |
|----|-----|-----|
| C-1 | CRITICAL | Load writer + restore identities from the same secrets source; reject equal AK/SK regardless of env vs file; secrets-only equal-identity negative never invokes child |
| C-2 | CRITICAL | Do not forward `DATABASE_URL`/`PG*` into fire-drill child; freshTarget mode skips live pre-failure source; require R2 recovery baseline |
| C-3 | CRITICAL | Remove all `:-manual` defaults; require allowlisted `GATE_RUN_ID` before any state; regenerate HUMAN-GATE; unset/malformed negatives create no state |
| H-1 | HIGH | Parse policy JSON; reject any Allow object resource bare `bucket/*` or off-prefix even if exact prefix also present; mixed-resource negative |
| M-1 | MEDIUM | Hash each numbered fenced command block in HUMAN-GATE vs plan `literal_cmd` |
| M-2 | MEDIUM | Full-run tests assert exit 0 + completed attestation + expected report success |
| M-3 | MEDIUM | Step3 trap removes `${HOST}-net`; failed/repeat path test detects leak without afterEach masking |

## MUST (detail)

### C-1
- `run-fire-drill-on-fresh-target.sh`: resolve `R2_ACCESS_*` and `R2_RESTORE_*` from selected secrets file + env with consistent precedence; compare after resolution; equal → `DEPENDENCY-S28-R2-RO`, child not started.
- Test: secrets file has equal writer/restore; env lacks writer keys; assert nonzero + recorder not invoked.

### C-2
- Child env allowlist: no `DATABASE_URL`, no `PGHOST`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`/etc.
- `runFireDrill` when `freshTarget` set: skip live source connection; use baseline only (`requireRecoveryBaseline` true); fail closed without baseline.
- Tests: env dump has no DB keys; no live connection attempt (mock/spy or fail if DATABASE_URL would be needed).

### C-3
- `gate-plan.json` steps 1, 3, 6 (and any consumer): preflight `GATE_RUN_ID` with regex `^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$` via shared snippet/script; remove `:-manual`.
- Regenerate HUMAN-GATE via `render-human-gate-from-plan.sh`.
- Tests: unset + malformed for steps 1/3/6; no scratch dir / docker host / attestation created.

### H-1
- `prove-isolation.sh` r2_readonly: JSON-parse policy; for every Allow statement, reject bare `arn:aws:s3:::<bucket>/*`, wrong bucket, or prefix not equal exact restore prefix; mixed exact+bare fails overall.
- Test mixed policy nonzero RESULT.

### M-1–M3
- Digest oracle hashes fenced blocks (not “hash string anywhere”).
- Full-run recorder: `status === 0`, attestation ok, report path success fields.
- Trap: `docker network rm -f ${HOST}-net`; test without afterEach network cleanup proves trap would remove it (or inspect trap script content + invoke cleanup helper).

## NEVER
- Fabricate R2_RESTORE_* · ambient RW as RO · ro-test green · weaken step4/5/6 claims · hand-write gate-results pass · touch Sprint 27 / `.tmp/D05-*` / surface 137

## VERIFY
```bash
bash -n scripts/run-fire-drill-on-fresh-target.sh scripts/prove-isolation.sh scripts/provision-fresh-restore-target.sh scripts/render-human-gate-from-plan.sh
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts
pnpm tsgo --noEmit
```

## WRITE-ALLOWED
- `scripts/run-fire-drill-on-fresh-target.sh`
- `scripts/prove-isolation.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/render-human-gate-from-plan.sh`
- `scripts/assert-gate-run-id.sh` (NEW optional shared preflight)
- `services/platform/src/backup/fire-drill.ts`
- `services/platform/src/cli/holo.ts` (only if needed for freshTarget baseline path)
- `gate-plan.json`, `HUMAN-GATE.md`, `SPRINT.md` (task row only if needed; keep In Progress honesty)
- Tests: `sprint28-s28r3-qa3-gate-fix.test.ts` (NEW) + updates to qa2/human-gate oracles
- Include Terra report path if already untracked: `.spec/reviews/red-hat-20260729T092559Z-sprint-28-final-sha-10bc18a0f.md` (land with remediation)
- `.tmp/GATE-FIX-S28R3-QA3/**`, dual-lens note

## WRITE-PROHIBITED
- Fabricated secrets / green gate-results · Sprint 27 · `.tmp/D05-*` · overwriting historical `.gate-evidence/**`

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S28R3-QA3",
  "source_review": "red-hat-20260729T092559Z-sprint-28-final-sha-10bc18a0f.md",
  "reviewed_sha": "10bc18a0f49a49e57def7ec3fec39978dc7b65f0",
  "requirements": [
    {"id": "AC-C1", "primary": true},
    {"id": "AC-C2", "primary": true},
    {"id": "AC-C3", "primary": true},
    {"id": "AC-H1", "primary": true},
    {"id": "AC-M1"},
    {"id": "AC-M2"},
    {"id": "AC-M3"}
  ],
  "tdd_mode": "red_first",
  "residual_preserved": "DEPENDENCY-S28-R2-RO"
}
-->
