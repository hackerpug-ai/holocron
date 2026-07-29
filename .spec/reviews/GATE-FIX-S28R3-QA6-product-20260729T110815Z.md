# Product / Anti-Weakening Review: GATE-FIX-S28R3-QA6

| Field | Value |
|-------|--------|
| **Reviewer lens** | product-manager (independent anti-weakening) |
| **Task** | GATE-FIX-S28R3-QA6 — bounded collision-resistant fresh-target host from `GATE_RUN_ID` |
| **Worktree** | `/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/GATE-FIX-S28R3-QA6` |
| **Branch** | `task/GATE-FIX-S28R3-QA6` |
| **Reviewed tip** | `95bd0a994bb07063969f92a66f4b4e23ae74c046` |
| **Base (pre-fix main)** | `61da2cbe7da045c0ad77de46180e5a041b7c2f97` |
| **Goal** | `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa6-goal.md` |
| **Contract** | `.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/GATE-FIX-S28R3-QA6-bounded-host-from-gate-run-id.md` |
| **Review date (UTC)** | 2026-07-29T11:08:15Z |
| **Verdict** | **APPROVED** |

---

## Product outcome assessment

**Job:** When a valid long allowlisted `GATE_RUN_ID` runs the immutable human gate, operators should not fail step 3 on a **false host-length software defect**; the gate must advance past host validation to the honest external credential boundary.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Exact QA run id no longer produces host length 65 | **GO** | Naive `s28r3-gate-${QA_ID}` len=65; derived host `s28r3-9da1b3a8a7b07af9` len=22, allowlist-valid |
| Host always ≤64 for allowlisted IDs | **GO** | Live derive for QA id, max-64 id, short ids, same-prefix long pairs — all ≤64 |
| Full run ID remains in evidence/provenance paths | **GO** | Step3 `EVID=".tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}"`; steps 1/6 keep `.tmp/REDHAT-FIX-H2/${GATE_RUN_ID}` |
| Reaches honest residual (not fake 6/6) | **GO** | Step2 `literal_cmd` still emits `RESIDUAL: DEPENDENCY-S28-R2-RO` and exits non-zero when keys absent; no R2 fabrication; no gate-results rewrite |
| Scope discipline (only step3 host derivation) | **GO** | Steps 1,2,4,5,6 `literal_cmd` byte-identical to base; only step3 HOST assignment + notes/plan metadata for QA6 |

**Outcome call:** The fix correctly removes a **false defect** (host length) so the product surface can express the **true remaining job blocker** (missing distinct live `R2_RESTORE_*`). That is progress toward job completion without weakening the gate or claiming green.

---

## Anti-weakening checklist (FAIL if any violated)

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Did we lengthen host validator or weaken `assert-gate-run-id`? | **PASS** | `scripts/assert-gate-run-id.sh` SHA256 identical to `61da2cbe` (`78c81764…5925c2`). `scripts/provision-fresh-restore-target.sh` SHA256 identical (`ace33ae1…3e6eef`). Host allowlist still `^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$|^[A-Za-z0-9]$` / length 1–64. No commits touch either validator. |
| 2 | Did we silently truncate run-id without digest collision resistance? | **PASS** | `scripts/derive-s28-fresh-host.sh`: if naive ≤64 use full readable host; else `s28r3-` + first 16 hex of **sha256(GATE_RUN_ID)** — not bare prefix truncate. Same-prefix long IDs yield distinct hosts (live check + test). |
| 3 | Did we fabricate `R2_RESTORE` / claim 6/6 / rewrite failed QA gate-results? | **PASS** | Commit set: contract, step3 plan/HUMAN-GATE, derive script, tests, Terra history only. No `gate-results*`, `GATE-RESULTS*`, or `gate-verification*` in diff. Commit messages preserve residual; no 6/6 claim. |
| 4 | Did we remove or soften `DEPENDENCY-S28-R2-RO` in step2? | **PASS** | Step2 `literal_cmd` byte-identical (`sha256` `9da19b3c…e3ba1`). Still: absent keys → `RESIDUAL: DEPENDENCY-S28-R2-RO — distinct live R2_RESTORE_* absent…` + `exit 1`. |
| 5 | Did we change steps 1,2,4,5,6? | **PASS** (literal commands) | Python byte-compare vs `61da2cbe`: steps 1,2,4,5,6 `literal_cmd` **identical**. Frozen digests in test match plan. HUMAN-GATE `literal_cmd_sha256` for those steps match plan. Only step3 `literal_cmd` changed (`HOST="s28r3-gate-…"` → `HOST="$(bash scripts/derive-s28-fresh-host.sh)"`). |
| 6 | Evidence paths still use full `GATE_RUN_ID`? | **PASS** | Step3 EVID still `.tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}`; steps 1/6 scratch/log under `.tmp/REDHAT-FIX-H2/${GATE_RUN_ID}`. HUMAN-GATE retains full-id path strings. Host is **not** the evidence key. |
| 7 | Step3 host now always ≤64 for allowlisted run IDs including exact QA id? | **PASS** | QA `qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678` → host `s28r3-9da1b3a8a7b07af9` (22). Max-64 id → digest form 22. Short ids → `s28r3-gate-<id>` ≤64. PLATFORM_IT provision with derived QA host: **no** `refuse invalid host name`. |
| 8 | No hand-edited green gate verdicts? | **PASS** | No active gate-results files modified or introduced as green. Working tree clean at review. Residual dependency explicitly preserved in contract and commit messages. |

**Checklist overall: all PASS → no anti-weakening FAIL.**

---

## Scope / JTBD framing (product)

### Job statement
"When I run the Sprint 28 human gate with a valid long session run ID, I want step 3 to accept a legal fresh-target host name, so I can exercise provision/fire-drill and surface the real credential dependency instead of a host-length refuse."

### Four Forces (this remediation)
| Force | Finding |
|-------|---------|
| Push | QA run failed step3 on host length 65 despite allowlisted 54-char run id — false software defect blocked the gate story. |
| Pull | Deterministic bounded host + full-id evidence paths preserves auditability and Docker allowlist. |
| Anxiety | Fear of weakening run-id or host validators, silent truncate collisions, or greenwashing residual. |
| Habit | Previous `HOST="s28r3-gate-${GATE_RUN_ID}"` was readable but unbounded relative to host 64 limit. |

### Functional coverage of ACs
| AC (from goal/contract) | Product GO/NO-GO |
|-------------------------|------------------|
| Every allowlisted run id → host 1–64 matching existing host contract | **GO** |
| Distinct long IDs same prefix do not collide | **GO** |
| Full run IDs authoritative in evidence paths | **GO** |
| Exact QA id no longer `refuse invalid host name`; residual remains R2 RO | **GO** |
| Steps 1,2,4,5,6 byte-identical; step3 + HUMAN-GATE digest parity | **GO** |

---

## What changed (product-relevant only)

1. **NEW** `scripts/derive-s28-fresh-host.sh` — reuses `assert-gate-run-id.sh`; emits ≤64 host with digest fallback.
2. **Step 3 only** in `gate-plan.json` — single HOST assignment via derive; same `$HOST` for provision, fire-drill, trap cleanup (container / volumes / network).
3. **HUMAN-GATE.md** regenerated — step3 fenced bash + `literal_cmd_sha256` updated to match plan (`ac1b5267…b9ea`).
4. **Regression suite** `sprint28-s28r3-qa6-gate-fix.test.ts` — RED-first contract + frozen digests + live provision host-accept check.
5. Task contract + Terra history commit (documentation / durability only).

**Not changed:** `assert-gate-run-id.sh`, provision host validator, steps 1/2/4/5/6 commands, R2 policy, dependency residual language.

---

## Regression / live evidence (reviewer-run)

```text
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts
→ 13 passed (13), including live provision: derived QA host not refused as invalid host name
```

Manual derive spot-check (reviewer):
- QA id → `s28r3-9da1b3a8a7b07af9` (valid, ≤64)
- Prefix-collision pair → distinct hosts

---

## Residual dependency statement (must remain honest)

**`DEPENDENCY-S28-R2-RO` remains the external blocker.**

No distinct live `R2_RESTORE_ACCESS_KEY_ID` / `R2_RESTORE_SECRET_ACCESS_KEY` is available, and no mint authority is in scope for this task. Step 2 still fail-closes with that residual when keys are absent. This fix does **not** claim 6/6, does **not** fabricate restore credentials, and does **not** rewrite failed QA gate-results. After host-length is fixed, a fresh QA is expected to still fail closed on the R2 restore-only dependency (and any cascade from missing parity when step3 cannot complete fire-drill without live RO credentials) — that is **honest product state**, not a software defect introduced or hidden by QA6.

---

## Incidental notes (non-blocking)

- Plan/HUMAN-GATE **metadata** notes for step3 and a plan-level QA6 note were added; step assertion notes for step3 updated. These do not alter frozen `literal_cmd` digests for steps 1,2,4,5,6.
- JSON/UTF-8 display of em-dashes in `git diff` for non-command fields can appear noisy; byte identity of the six frozen commands was verified via JSON-parsed `literal_cmd` strings and SHA-256.

---

## Verdict

### **APPROVED**

The remediation serves the intended job: remove a false host-length defect so step 3 can pass host validation under the existing allowlist, keep full run IDs on evidence paths, preserve steps 1/2/4/5/6 and `DEPENDENCY-S28-R2-RO`, and refuse silent truncate / validator weakening / green hand-edits. Ready for dual-lens technical alignment and land-on-main **only after** technical review also approves; this product review does **not** merge.

**Do not merge from this review.** Residual after land: **`DEPENDENCY-S28-R2-RO`**.
