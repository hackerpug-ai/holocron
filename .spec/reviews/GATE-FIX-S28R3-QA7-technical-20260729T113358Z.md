# GATE-FIX-S28R3-QA7 — Technical + Test-Reality Review

**Task:** `GATE-FIX-S28R3-QA7`  
**Reviewed tip:** `f86a25a267372395011bde835f439c1dc15ad3c2` on base `a5b32f30678c167fbae69f2cd370431eec1af25b`  
**Worktree:** `.kb-run-sprint/worktrees/GATE-FIX-S28R3-QA7` · branch `task/GATE-FIX-S28R3-QA7`  
**Source Terra:** `.spec/reviews/red-hat-20260729T112018Z-sprint-28-final-sha-a5b32f30678.md` (HIGH-1, MEDIUM-1)  
**Review date:** 2026-07-29T11:33:58Z  
**Mode:** Independent technical + test-reality (read + probe-only). No merge. No product code edits by this review.

## Verdict

**APPROVED**

| Severity | Count |
|---|---:|
| CRITICAL | **0** |
| HIGH | **0** |
| MEDIUM | **0** |
| LOW | **0** |

Both Terra findings are repaired with tests/fixtures/docs only. Oracles kill targeted regressions. Residual **DEPENDENCY-S28-R2-RO** is preserved. Six `literal_cmd` digests remain frozen.

---

## Verify matrix

| # | Check | Result | Evidence |
|---:|---|---|---|
| 1 | Diff is tests/fixtures/docs only — no product scripts, gate-plan, HUMAN-GATE, validators | **PASS** | `git diff a5b32f…HEAD --name-only` → 7 paths: task contract, SPRINT.md, Terra report, fixture, qa2/qa3/gate-bind tests only |
| 2 | All 6 `literal_cmd` digests frozen | **PASS** | SHA-256 of plan steps: 1 `c989b1de…`, 2 `9da19b3c…`, 3 `ac1b5267…`, 4 `4fbce84a…`, 5 `35da486c…`, 6 `13c74843…` (full digests below) |
| 3 | HIGH-1: QA3 requires derive HOST; rejects bare naïve; preflight + network trap retained | **PASS** | `sprint28-s28r3-qa3-gate-fix.test.ts:149-153` |
| 4 | MEDIUM-1: committed non-secret fixture; QA2 H4 + gate-bind AC-6 use it; residual when restore absent; never emits values | **PASS** | fixture + tests (below) |
| 5 | Fixture cannot satisfy live `REQUIRE_LIVE_R2_RO` | **PASS** | `prove-r2-readonly.sh` with fixture → exit **1**, residual DEPENDENCY-S28-R2-RO |
| 6 | Clean-env focused suite green | **PASS** | 4 files, **44 passed \| 13 skipped** (57) |
| 7 | No active gate-results rewrite; residual preserved | **PASS** | No `gate-results.json` in sprint-28 task dir; commit does not touch gate results/evidence |

### Frozen digests (recomputed on tip)

```
1 c989b1de8cbb8cf08c9fb50654e5717c42673d3c82388157c8b8e7f60f11786d
2 9da19b3c8d0d32841db8b2f65c53796b05ce07a53e4b0c3749efcfe3f18e3ba1
3 ac1b5267e5ac074f1487e1193ab0b8209480653a7d314da3f7f3087a2059b9ea
4 4fbce84a23cd9d81f13244a82a253221ff705f29947ae48ed06f7b848efb90b7
5 35da486ca7c3179319a432171a85f1a78f6176b6ee6495ae461d4dcaa39e901f
6 13c74843974a5202cfe4c352748ca69edcf92d31e26b74e42a0dce59187a0fff
```

---

## Technical findings (HIGH-1 / MEDIUM-1 disposition)

### HIGH-1 — closed

`sprint28-s28r3-qa3-gate-fix.test.ts` always-on C-3 block now:

- **Requires** `HOST="$(bash scripts/derive-s28-fresh-host.sh)"` (`:149`)
- **Rejects** bare `HOST="s28r3-gate-${GATE_RUN_ID}"` (`:150`)
- **Retains** run-ID preflight loop for steps 1/2/3/6 (`:132-140`), full-ID evidence path on step2 (`:144-145`), and step3 network cleanup (`:152-153`)

Product Step 3 was already on the derive form (QA6); this is test-oracle alignment only.

### MEDIUM-1 — closed

- New committed fixture: `services/platform/tests/fixtures/sprint28/secrets-inventory-absent-restore.yaml`
  - Non-secret: empty writer keys, `example.invalid` endpoint, **no** `R2_RESTORE_*` values (commented absent)
  - Inventory against it → `R2_RESTORE_present: false`, `residual: "DEPENDENCY-S28-R2-RO"`, keys presence/length only (no `"value"`)
- QA2 H4 (`:346-386`) and gate-bind AC-6 (`:294-320`) point at that fixture only (no `HOLO*_SECRETS_PATH` / personal `secrets.yaml` dependency)
- Unconditional asserts: `R2_RESTORE_present === false` and `residual === 'DEPENDENCY-S28-R2-RO'` (no soft `if` bypass)
- QA2 additionally regex-rejects fixture text that looks like live restore key material (`:355-356`)
- Live path still fail-closed: `REQUIRE_LIVE_R2_RO=1 HOLO_SECRETS_PATH=<fixture> bash scripts/prove-r2-readonly.sh` → **exit 1**, `RESIDUAL: DEPENDENCY-S28-R2-RO`

### Scope honesty

- Diff paths: task contract + SPRINT row + Terra history + fixture + three test files only
- No changes to: product scripts, `gate-plan.json`, `HUMAN-GATE.md`, validators, active/unbound gate results, verification reports
- Residual external blocker **DEPENDENCY-S28-R2-RO** not fabricated green; no 6/6 claim

---

## Test-Reality Review

**Verdict (oracle lens):** APPROVED  
**Probe coverage:** 2 of 2 behavioral ACs for this task (HIGH-1 host oracle, MEDIUM-1 inventory fixture/residual)  
**Tree clean at exit (primary worktree):** `git status --porcelain` → (empty)

### Oracle Verdicts

| AC | Test(s) | Mutants | Killed | Verdict |
|----|---------|---------|--------|---------|
| HIGH-1 host oracle | `sprint28-s28r3-qa3-gate-fix.test.ts` C-3 (~:125-159) | 3 | 3 | ✅ strong |
| MEDIUM-1 inventory fixture / residual | `qa2` H4 (~:341-387); `gate-bind` AC-6 (~:291-327) | 3 | 3 | ✅ strong |

### Seed / fixture reality (Audit 2)

| Check | Code | Result |
|---|---|---|
| Seed present | — | Committed fixture path resolved and required (`existsSync`) |
| Not personal/ignored secrets | was `SEED_MISSING` / env-dependent | Fixed: fixture under `tests/fixtures/sprint28/` |
| Start state meaningful | — | Absent restore → residual asserted; not empty-store tautology |
| Fixture non-secret | — | Empty keys + invalid endpoint; no restore secret material |

### Negative path (Audit 3)

| Check | Result |
|---|---|
| Reject naïve HOST reintroduction | `not.toMatch` bare assignment |
| Reject live-looking restore keys in fixture (QA2) | regex on fixture text |
| Residual when restore absent | unconditional `DEPENDENCY-S28-R2-RO` |
| Never emit values | `not.toMatch(/"value"/)` + per-key `value` undefined (QA2); secret-length pattern guard (AC-6) |
| Live RO fail-closed with fixture | `prove-r2-readonly` exit 1 |

### Probe Log (disposable worktree `/tmp/tq-probe-qa7-*`, removed after)

| Mutant | Change | Suite | Outcome |
|---|---|---|---|
| H1-1 | `gate-plan` Step3 `HOST` → naïve `s28r3-gate-${GATE_RUN_ID}` | `vitest …qa3 -t 'C-3: gate-plan steps'` | **KILLED** — fail `toMatch(/derive-s28-fresh-host/)` |
| H1-2 | Step3 trap: delete `docker network rm … ${HOST}-net` | same | **KILLED** — fail `toMatch(/network rm/)` |
| H1-3 | Step3 `HOST="s28r3-static-host"` | same | **KILLED** — fail derive match |
| M1-1 | `inventory-restore-credentials.sh`: `residual = None` always | `qa2` + `gate-bind` `-t 'H4\|AC-6'` | **KILLED** — both expect residual string |
| M1-2 | Inventory JSON forces `R2_RESTORE_present: True` | same | **KILLED** — both expect `false` |
| M1-3 | Fixture gains fake long `R2_RESTORE_*` values | same | **KILLED** — QA2 fixture regex; AC-6 present/residual |

Probe hygiene: mutations only in disposable worktree; primary checkout never mutated; worktree removed; primary `git status --porcelain` empty.

### Bounds

- Probed only the two remediation ACs (HIGH-1, MEDIUM-1). Pre-existing QA2/QA3/QA6 live/`PLATFORM_IT` cases and unrelated Sprint 28 ACs were not re-mutated (outside this task’s write surface; focused suite already green).
- ≤3 mutants per AC observed.

---

## Execution evidence (clean env)

```bash
env -u HOLO_SECRETS_PATH -u HOLOCRON_SECRETS_PATH pnpm exec vitest run \
  services/platform/tests/integration/sprint28-s28r3-qa3-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa2-gate-fix.test.ts \
  services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts \
  services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts
```

```
Test Files  4 passed (4)
     Tests  44 passed | 13 skipped (57)
  Duration  ~19.7s
```

| File | Result |
|---|---|
| `sprint28-s28r3-qa6-gate-fix.test.ts` | 13 tests \| 1 skipped |
| `sprint28-s28r3-gate-bind.test.ts` | 8 tests |
| `sprint28-s28r3-qa2-gate-fix.test.ts` | 20 tests \| 6 skipped |
| `sprint28-s28r3-qa3-gate-fix.test.ts` | 16 tests \| 6 skipped |

Skips are existing live/`PLATFORM_IT` gates — not new weakenings.

Live fixture refusal (not piped — real exit):

```text
REQUIRE_LIVE_R2_RO=1 HOLO_SECRETS_PATH=<fixture> bash scripts/prove-r2-readonly.sh
→ PROVE_EXIT:1
→ RESIDUAL: DEPENDENCY-S28-R2-RO
→ RESULT: FAIL (… no live RO credentials …)
```

Inventory on fixture:

```text
R2_RESTORE_present=False residual='DEPENDENCY-S28-R2-RO'
note: presence/length only — values never included
```

---

## Residual

**DEPENDENCY-S28-R2-RO** — external: distinct live R2 restore RO credentials still required for full human gate 6/6. Not a software defect; not closed by this task. Active failed QA history not rewritten.

---

## Final

**APPROVED** — HIGH-1 and MEDIUM-1 remediated with strong oracles; product gate surface frozen; clean-env focused selection green (44 pass / 13 skip); residual dependency preserved.

**Do not merge from this review.** Land via orchestrator after product/anti-weakening lens if required.
