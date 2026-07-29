# Product / Anti-Weakening Review: GATE-FIX-S28R3-QA7

| Field | Value |
|-------|--------|
| **Reviewer lens** | product-manager (independent anti-weakening) |
| **Task** | GATE-FIX-S28R3-QA7 — Test-contract host oracle + self-contained inventory fixture |
| **Worktree** | `/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/GATE-FIX-S28R3-QA7` |
| **Branch** | `task/GATE-FIX-S28R3-QA7` |
| **Reviewed tip** | `f86a25a267372395011bde835f439c1dc15ad3c2` |
| **Base (pre-fix main)** | `a5b32f30678c167fbae69f2cd370431eec1af25b` |
| **Goal** | `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa7-goal.md` |
| **Contract** | `.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/GATE-FIX-S28R3-QA7-test-contract-host-oracle-and-inventory-fixture.md` |
| **Source Terra** | `.spec/reviews/red-hat-20260729T112018Z-sprint-28-final-sha-a5b32f30678.md` (NEEDS-FIXES: HIGH-1, MEDIUM-1) |
| **Review date (UTC)** | 2026-07-29T11:34:52Z |
| **Verdict** | **APPROVED** |

---

## Product outcome assessment

**Job:** When Sprint 28 closeout runs always-on regression contracts in a clean/archive-equivalent environment, I want the suite to enforce the **current** QA6 host-derive product surface and a **self-contained** inventory residual oracle, so green always-on tests prove real contracts—not stale naïve HOST, and not personal `secrets.yaml` theatre—while the honest external blocker remains `DEPENDENCY-S28-R2-RO`.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| HIGH-1 fixed: QA3 always-on oracle requires derive host | **GO** | `sprint28-s28r3-qa3-gate-fix.test.ts:149` matches `HOST="$(bash scripts/derive-s28-fresh-host.sh)"` |
| HIGH-1 fixed: QA3 explicitly rejects naïve HOST | **GO** | `:150` `expect(step3).not.toMatch(/HOST="s28r3-gate-\$\{GATE_RUN_ID\}"/)` |
| Preflight / full-ID evidence / network cleanup retained | **GO** | Same always-on block still asserts run-id preflight steps 1/2/3/6, step2 full-ID path, step3 `network rm` + `${HOST}-net` |
| MEDIUM-1 fixed: inventory unit contracts self-contained | **GO** | QA2 H4 + gate-bind AC-6 point at committed fixture; no `secretsCandidates` / personal path |
| Fixture cannot green live restore | **GO** | Inventory → `R2_RESTORE_present=false`, `residual=DEPENDENCY-S28-R2-RO`; `REQUIRE_LIVE_R2_RO=1 prove-r2-readonly.sh` with fixture path → exit 1, `RESIDUAL: DEPENDENCY-S28-R2-RO` |
| Product gate surface frozen | **GO** | No product scripts / gate-plan / HUMAN-GATE / validators in commit; SHA256 identical to base |
| No 6/6 / fabricated R2 / gate-results rewrite | **GO** | Diff is tests + fixture + task contract + SPRINT row + Terra history only |

**Outcome call:** This is a **test-contract remediation only**. QA6 product behavior is preserved byte-for-byte. Always-on oracles now align with product truth (derive host) and strengthen residual honesty (fixture always proves absent restore). That serves closeout job quality without weakening the human gate or residual story.

---

## Anti-weakening checklist (FAIL if any violated)

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | No product script / gate-plan / HUMAN-GATE / validator change? | **PASS** | Commit files: task contract, SPRINT.md row, Terra report, fixture, 3 test files only. `gate-plan.json` SHA256 `54e5993b…efc1` identical to `a5b32f30`. `HUMAN-GATE.md` SHA256 `371836c5…346f` identical. Scripts identical to base: `derive-s28-fresh-host.sh`, `assert-gate-run-id.sh`, `provision-fresh-restore-target.sh`, `inventory-restore-credentials.sh`, `run-fire-drill-on-fresh-target.sh`. Step3 plan still `HOST="$(bash scripts/derive-s28-fresh-host.sh)"` (sha16 `ac1b5267…`); step2 still residual-bearing (sha16 `9da19b3c…`). |
| 2 | No assertion weakened (QA3 must require derive host and reject naïve)? | **PASS** | QA3 replaced stale positive naïve match with **require derive + reject naïve**. Inventory residual checks **strengthened**: conditional `if (R2_RESTORE_present === false)` → unconditional `expect(R2_RESTORE_present).toBe(false)` + `expect(residual).toBe('DEPENDENCY-S28-R2-RO')` in both QA2 H4 and gate-bind AC-6. Presence/length-only and no-value assertions retained. |
| 3 | Inventory fixture has no real secrets and cannot green live restore? | **PASS** | Fixture `services/platform/tests/fixtures/sprint28/secrets-inventory-absent-restore.yaml`: empty writer keys, **restore keys omitted**, endpoint `example.invalid`. Inventory JSON: no secret values, `R2_RESTORE_present=false`, residual `DEPENDENCY-S28-R2-RO`. Live path: `REQUIRE_LIVE_R2_RO=1` + fixture secrets path → `prove_exit=1`, `RESULT: FAIL`, residual printed. QA2 also asserts fixture text has no long restore key shapes. |
| 4 | DEPENDENCY-S28-R2-RO still honest residual for absent restore? | **PASS** | Inventory fixture forces residual. Gate-bind AC-4/AC-4b/AC-4c still fail-closed with residual on placeholder/empty restore. Step2 `literal_cmd` unchanged (still emits residual on absent keys). Contract + SUMMARY + commit message preserve residual; no claim that residual is cleared. |
| 5 | No fabricated R2_RESTORE / hand-edited gate pass / claim 6/6? | **PASS** | No R2 key minting, no gate-results/verdict files, no “6/6” claim in commit message or product surface. Terra history documents prior fail honesty; remediation does not rewrite it green. |
| 6 | Active failed QA artifacts untouched? | **PASS** | No `gate-result*`, active QA evidence, or failed-run artifact paths in `git diff a5b32f30..HEAD --name-only`. Local `.tmp/GATE-FIX-S28R3-QA7/**` is task RED/GREEN evidence only (not staged as green gate pass). |

**Checklist overall: all PASS → no anti-weakening FAIL.**

---

## Scope / JTBD framing (product)

### Job statement
"When I run Sprint 28 always-on integration contracts from a clean archive, I want host and inventory oracles to match the frozen QA6 product gate and prove residual honesty without personal secrets, so closeout green means real contract compliance—not stale or environment-theatre tests."

### Four Forces (this remediation)
| Force | Finding |
|-------|---------|
| Push | Terra HIGH-1: cumulative suite red on stale QA3 naïve HOST; MEDIUM-1: always-on inventory needs personal secrets → false red or theatre. |
| Pull | Align oracle with derive-host product surface; committed absent-restore fixture for portable residual proof. |
| Anxiety | Weakening assertions, smuggling real secrets into fixtures, greening live restore, or rewriting gate product. |
| Habit | Old QA3 expected `HOST="s28r3-gate-${GATE_RUN_ID}"`; inventory resolved HOLO*_SECRETS_PATH / ignored secrets.yaml. |

### Functional coverage of goal findings
| Finding | Product GO/NO-GO |
|---------|------------------|
| HIGH-1 QA3 oracle → derive + reject naïve | **GO** |
| MEDIUM-1 inventory self-contained non-secret fixture | **GO** |
| Product scripts / six literal_cmd / validators frozen | **GO** |
| Residual DEPENDENCY-S28-R2-RO preserved | **GO** |

---

## What changed (product-relevant only)

1. **QA3 always-on oracle** — require derive host; reject naïve assignment (HIGH-1).
2. **Committed fixture** — `secrets-inventory-absent-restore.yaml` (no real secrets; restore absent).
3. **QA2 H4 + gate-bind AC-6** — always-on inventory uses fixture; residual required unconditionally (MEDIUM-1).
4. **Durable docs** — task contract, SPRINT.md row, Terra NEEDS-FIXES report committed as history.

**Not changed:** product scripts, `gate-plan.json`, `HUMAN-GATE.md`, six `literal_cmd`s, validators, R2 policy, active failed QA artifacts, claim of 6/6.

---

## Regression / evidence (agent-captured + reviewer spot-check)

From `.tmp/GATE-FIX-S28R3-QA7/SUMMARY.json` and logs:

| Phase | Result |
|-------|--------|
| RED QA3 | 1 failed (stale naïve HOST assertion) / 9 passed / 6 skipped |
| RED QA2 + gate-bind (clean env) | 2 failed (secrets path candidates length 0) |
| GREEN focused clean | 4 files: **44 passed \| 13 skipped** |
| GREEN full `sprint28-*.test.ts` clean | **16 passed \| 3 skipped files**; **122 passed \| 56 skipped** tests |

Reviewer spot-checks:
- Inventory on fixture → residual `DEPENDENCY-S28-R2-RO`, `R2_RESTORE_present=false`, no values.
- `REQUIRE_LIVE_R2_RO=1 prove-r2-readonly.sh` with fixture → **exit 1**, residual, not PASS.
- Plan/HUMAN-GATE digests byte-identical to base `a5b32f30`.

---

## Residual dependency statement (must remain honest)

**`DEPENDENCY-S28-R2-RO` remains the external blocker.**

No distinct live `R2_RESTORE_ACCESS_KEY_ID` / `R2_RESTORE_SECRET_ACCESS_KEY` is provided by this task. The committed inventory fixture **encodes absence** of restore credentials and **cannot** satisfy live restore-only gates. This fix does **not** claim 6/6, does **not** fabricate restore credentials, does **not** rewrite failed QA gate-results, and does **not** alter product step commands. After land, human-gate closeout is still blocked on real distinct RO credentials—that is **honest product state**.

---

## Incidental notes (non-blocking)

- Negative live tests elsewhere may still *construct* a naïve `HOST="s28r3-gate-…"` string to probe preflight refuse-before-docker; that is not the product Step 3 oracle and does not reintroduce the removed plan assignment.
- Task status checkbox in contract may still show Pending; process hygiene only—does not affect product freeze.

---

## Verdict

### **APPROVED**

Remediation is **test-contract only**: QA3 oracle now requires derive host and rejects naïve; inventory always-on contracts are self-contained with a non-secret absent-restore fixture that cannot green live restore; product gate/scripts/validators/HUMAN-GATE frozen; residual `DEPENDENCY-S28-R2-RO` honest; no fabricated credentials or gate-pass theatre.

Ready for dual-lens technical alignment and land-on-main **only after** technical review also approves; this product review does **not** merge.

**Do not merge from this review.** Residual after land: **`DEPENDENCY-S28-R2-RO`**.
