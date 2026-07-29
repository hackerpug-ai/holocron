# GATE-FIX-S28R3-QA2 — Restore-only fire-drill identity, doc/plan lock, honest closeout

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager  
> Priority: P0  
> Source: `.spec/reviews/red-hat-20260729T084459Z-sprint-28-final-sha-71f12cabe.md` (NEEDS-FIXES CRITICAL=3 HIGH=3 MEDIUM=3)  
> Reviewed SHA baseline: `71f12cabe31c1d4158b7ce18688196e94edbbb67`  
> Goal: `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa2-goal.md`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Close **every CRITICAL and HIGH** finding in the Terra review at `71f12cabe`. Include the three MEDIUM items needed for credible test-reality and failure-safe cleanup. Preserve external residual **`DEPENDENCY-S28-R2-RO`**. Never fabricate keys, ambient-writer green, or hand-written gate pass.

## Findings → ACs

| ID | Severity | Fix |
|----|----------|-----|
| C1 | CRITICAL | Fire-drill child env maps distinct `R2_RESTORE_*` → `R2_ACCESS_*`, strips ambient writer keys |
| C2 | CRITICAL | HUMAN-GATE.md + SPRINT human steps generated from / locked to `gate-plan.json`; digest oracle; allowlisted `GATE_RUN_ID` |
| C3 | CRITICAL | Honest sprint status; archive stale unbound `gate-results.json` pass; active path absent for next QA |
| H1 | HIGH | `--fresh-target` rejects explicit scratch/blob unless canonical-equal to resolved volume paths |
| H2 | HIGH | Exact bucket+prefix policy in provisioner + gate-plan; isolation rejects `${bucket}/*` |
| H4 | HIGH | Real redacted credential inventory command (no test-synthesized evidence) |
| M1 | MEDIUM | Full runner invocation test (not resolve-only only) with path/identity proof |
| M2 | MEDIUM | Real-Docker inaccessible daemon-only volume refusal |
| M3 | MEDIUM | trap/afterEach cleanup + GATE_RUN_ID/host allowlist before destructive cleanup |

## MUST (summary)

1. **C1:** `run-fire-drill-on-fresh-target.sh` (and any CLI path that spawns fire-drill) builds a **minimal child env** for `holo restore:fire-drill`: map verified distinct `R2_RESTORE_*` into `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, drop ambient writer keys, keep only required endpoint/account/bucket/prefix/session fields; missing/equal/placeholder → `DEPENDENCY-S28-R2-RO`. Integration test with deliberately different writer vs restore identities; assert child env (via recorder/env dump, never log secrets).
2. **C2:** HUMAN-GATE.md and SPRINT human-testing section must not diverge from `gate-plan.json`. Prefer generate-from-plan or “authoritative plan is sole literal source” + rendered listing. Oracle: every published executable command digest matches corresponding `literal_cmd`. Live runs require nonempty allowlisted `GATE_RUN_ID`.
3. **H1:** With `--fresh-target`, reject explicit `--scratch`/`--blob-dir` unless `realpath`/canonical equality with resolved named-volume host execution paths. Unrelated writable `/tmp` → exit ≠0, no successful attestation.
4. **H2:** Use `buildRestoreCredentialPolicy` / exact prefix (default `R2_PGBACKREST_PREFIX`/`pgbackrest`) in provisioner policy emission and gate-plan step2 policy JSON. Harden `prove-isolation.sh` to reject bucket-wide object `/*` without exact prefix. Tests: `${bucket}/*` fail; `${bucket}/${exactPrefix}/*` pass.
5. **H4:** Script or CLI e.g. `scripts/inventory-restore-credentials.sh` reads secrets path, emits redacted inventory (presence/length only) to stdout/file. Tests call it; fail if inventory cannot be generated. Remove test fallback that writes residual JSON when missing.
6. **C3:** SPRINT status must **not** claim current-SHA 6/6 closeout while residual depends. Archive committed unbound pass `gate-results.json` (`run_id` `20260729T031355Z`) to e.g. `gate-results.unbound-20260729T031355Z.json` (if not already) and **remove active** `gate-results.json` from tree (or leave absent). Do not stage working-tree QA fail as pass. Do not hand-edit green verdict.
7. **M1–M3:** Full runner invocation via injectable CLI recorder or real seam; daemon-only inaccessible volume refusal; trap/afterEach cleanup; allowlist `GATE_RUN_ID`/host names + path containment before rm.

## NEVER

- Fabricate `R2_RESTORE_*` or mint tokens  
- Reuse ambient RW as restore-only proof  
- Accept `ro-test` as live green  
- Weaken step4/5 jq predicates or empty-chain fail-closed  
- Touch Sprint 27, `.tmp/D05-*`, surface 137, historical `.gate-evidence/**` content (except archival moves of unbound committed results per C3)  
- Hand-write `gate-results.json` pass  

## VERIFY

```bash
bash -n scripts/run-fire-drill-on-fresh-target.sh scripts/provision-fresh-restore-target.sh scripts/prove-isolation.sh
# inventory (if new)
bash scripts/inventory-restore-credentials.sh --secrets services/platform/config/secrets.yaml --out .tmp/GATE-FIX-S28R3-QA2/credential-inventory.json

PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa1-gate-fix.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts
pnpm tsgo --noEmit
```

## WRITE-ALLOWED

- `scripts/run-fire-drill-on-fresh-target.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/prove-isolation.sh`
- `scripts/inventory-restore-credentials.sh` (NEW)
- `scripts/render-human-gate-from-plan.sh` (NEW optional)
- `services/platform/src/cli/holo.ts`
- `services/platform/src/backup/config.ts` (only if shared helper export needed)
- `gate-plan.json` (policy text + GATE_RUN_ID validation notes; preserve claim strength)
- `HUMAN-GATE.md`, `SPRINT.md` (status honesty + human commands lock)
- Archive: `gate-results.unbound-*.json`; **delete or untrack active forged pass** `gate-results.json` when it is the unbound pass
- Tests: `sprint28-s28r3-qa2-gate-fix.test.ts` (NEW), update gate-bind, human-gate-oracles, fresh-target-fire-drill, qa1 as needed
- `.tmp/GATE-FIX-S28R3-QA2/**`, dual-lens note under `.spec/reviews/`

## WRITE-PROHIBITED

- Fabricating secrets / green gate-results  
- Overwriting `.gate-evidence/20260729T160000Z/**`  
- Sprint 27, `.tmp/D05-*`, unrelated surfaces  

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-S28R3-QA2",
  "source_review": "red-hat-20260729T084459Z-sprint-28-final-sha-71f12cabe.md",
  "reviewed_sha": "71f12cabe31c1d4158b7ce18688196e94edbbb67",
  "requirements": [
    {"id": "AC-C1", "primary": true},
    {"id": "AC-C2", "primary": true},
    {"id": "AC-C3", "primary": true},
    {"id": "AC-H1", "primary": true},
    {"id": "AC-H2"},
    {"id": "AC-H4"},
    {"id": "AC-M1"},
    {"id": "AC-M2"},
    {"id": "AC-M3"}
  ],
  "tdd_mode": "red_first",
  "residual_preserved": "DEPENDENCY-S28-R2-RO"
}
-->
