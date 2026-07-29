# GATE-FIX-S28R3-QA6 — Independent Technical Review (code-reviewer / devops)

| Field | Value |
|---|---|
| **Verdict** | **APPROVED** |
| **Reviewer lens** | Technical / devops (independent) |
| **Reviewed at** | `20260729T110934Z` |
| **Worktree** | `/Users/inference1/Projects/holocron/.kb-run-sprint/worktrees/GATE-FIX-S28R3-QA6` |
| **Branch** | `task/GATE-FIX-S28R3-QA6` |
| **Base** | `61da2cbe7da045c0ad77de46180e5a041b7c2f97` |
| **HEAD** | `95bd0a994bb07063969f92a66f4b4e23ae74c046` |
| **Commits** | `8eb7b048` (contract) + `95bd0a99` (implement) |
| **Contract** | `.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/GATE-FIX-S28R3-QA6-bounded-host-from-gate-run-id.md` |
| **Goal** | `.spec/orchestrate/s28-20260728T231409Z-codex-gate-fix-s28r3-qa6-goal.md` |
| **Do not merge** | Review only — no merge performed |

---

## 1. AC enumeration (PASS/FAIL with evidence)

| AC | Requirement | Verdict | Evidence |
|---|---|---|---|
| **AC-1** | Every allowlisted `GATE_RUN_ID` yields deterministic host ≤64 matching host allowlist | **PASS** | `scripts/derive-s28-fresh-host.sh`: re-invokes `assert-gate-run-id.sh`; naive `s28r3-gate-${ID}` when ≤64 else `s28r3-` + sha256[:16]; host regex + length checks. Tests: short / max / QA / fail-closed. |
| **AC-2** | Collision-resistant for distinct long IDs (same prefix); no silent truncate-only | **PASS** | Digest path uses full-id sha256. Collision pair → `s28r3-6849503a579190f2` vs `s28r3-3920654644e9dda6`. Test `two long IDs same prefix different suffix → distinct hosts`. |
| **AC-3** | Full run ID remains for evidence paths | **PASS** | Step3 still `EVID=".tmp/REDHAT-FIX-S28R3/${GATE_RUN_ID}"`; trap/provision/fire-drill use `$HOST` only for docker resources. |
| **AC-4** | Exact QA run id no longer triggers `refuse invalid host name` | **PASS** | QA id → `s28r3-9da1b3a8a7b07af9` (len 22). Live provision: no `refuse invalid host name`. Vitest 13/13 green. |
| **AC-5** | Steps 1,2,4,5,6 byte-identical; step3 + HUMAN-GATE digest parity | **PASS** | Digests below; HUMAN-GATE all 6 fenced blocks match plan. |
| **AC-residual** | Preserve `DEPENDENCY-S28-R2-RO`; no fabricate R2; no gate-results rewrite | **PASS** | Step2 residual text unchanged in `literal_cmd`; no changes to assert/provision validators; no active `gate-results.json` rewrite; no D05 / surface 137 / Sprint 27 product rewrites. |

**Block rule:** zero FAIL / PARTIAL / CRITICAL stub → completion not blocked.

---

## 2. Step digests (literal_cmd sha256)

| Step | Base `61da2cbe` | HEAD `95bd0a99` | Byte-identical |
|---:|---|---|---|
| 1 | `c989b1de8cbb8cf08c9fb50654e5717c42673d3c82388157c8b8e7f60f11786d` | same | **YES** |
| 2 | `9da19b3c8d0d32841db8b2f65c53796b05ce07a53e4b0c3749efcfe3f18e3ba1` | same | **YES** |
| 3 | `90e9b01fbf63d161c4aca1ce3871a9e9dd3dec08e1a9a922615d5b16bd39c134` | `ac1b5267e5ac074f1487e1193ab0b8209480653a7d314da3f7f3087a2059b9ea` | **NO (expected)** |
| 4 | `4fbce84a23cd9d81f13244a82a253221ff705f29947ae48ed06f7b848efb90b7` | same | **YES** |
| 5 | `35da486ca7c3179319a432171a85f1a78f6176b6ee6495ae461d4dcaa39e901f` | same | **YES** |
| 6 | `13c74843974a5202cfe4c352748ca69edcf92d31e26b74e42a0dce59187a0fff` | same | **YES** |

**Step3-only change (verified):**
- `literal_cmd`: `HOST="s28r3-gate-${GATE_RUN_ID}"` → `HOST="$(bash scripts/derive-s28-fresh-host.sh)"`
- `assertion.notes`: appended `GATE-FIX-S28R3-QA6: HOST via scripts/derive-s28-fresh-host.sh (≤64, collision-resistant).`
- Full step objects 1,2,4,5,6 equal to base (parsed JSON).
- Top-level `notes[]`: one new QA6 note (allowed documentation); residual `DEPENDENCY-S28-R2-RO` note retained.

**HUMAN-GATE:** steps 1–6 fenced bash match plan `literal_cmd` exactly (including step3 digest `ac1b5267…`).

---

## 3. Example host for exact QA run id

| Input | Value |
|---|---|
| `GATE_RUN_ID` | `qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678` |
| Run-id length | 54 |
| Naive host | `s28r3-gate-qa28-20260729T104535Z-420995be4d2d4690911d9bb2e7f96678` |
| Naive length | **65** (would refuse) |
| **Derived host** | **`s28r3-9da1b3a8a7b07af9`** |
| Derived length | **22** |
| Form | `s28r3-` + first 16 hex of `sha256(GATE_RUN_ID)` |
| Allowlist | matches `^[A-Za-z0-9][A-Za-z0-9_-]{0,62}[A-Za-z0-9]$` |

Short IDs (readable path): `a` → `s28r3-gate-a`; `ab` → `s28r3-gate-ab`; `qa6-short` → `s28r3-gate-qa6-short`.

---

## 4. Technical verification checklist

| Check | Result |
|---|---|
| `scripts/derive-s28-fresh-host.sh` deterministic, ≤64, allowlist, digest not silent truncate | **PASS** |
| Re-validates via `assert-gate-run-id.sh` (no weaker copy) | **PASS** |
| openssl / shasum / sha256sum fallbacks | **PASS** |
| `bash -n` derive + assert + provision | **PASS** |
| gate-plan: only step3 `literal_cmd` (+ step3 notes annotation + top notes QA6) | **PASS** |
| Steps 1,2,4,5,6 `literal_cmd` byte-identical vs base | **PASS** |
| HUMAN-GATE regenerated; step3 matches plan | **PASS** |
| Tests: QA id, max id, short ids, collision pair, evidence full run id, step3 uses derive | **PASS** |
| `assert-gate-run-id` not weakened (still length 1–64 allowlist) | **PASS** (diff empty) |
| provision host validator not lengthened | **PASS** (diff empty) |
| No rewrite gate-results / Sprint 27 / D05 / surface 137 | **PASS** (diff name-only within allowed paths) |
| No Category-1 stubs in derive script | **PASS** |
| Vitest re-run | **PASS** — see §5 |

### Diff scope (`61da2cbe..HEAD`)

```
GATE-FIX-S28R3-QA6-bounded-host-from-gate-run-id.md  (contract)
HUMAN-GATE.md                                        (step3 only, rendered)
SPRINT.md                                            (task row)
gate-plan.json                                       (step3 + notes)
red-hat-20260729T104015Z-sprint-28-final-sha-61da2cbe7da.md  (durable history)
scripts/derive-s28-fresh-host.sh                     (NEW)
sprint28-s28r3-qa6-gate-fix.test.ts                   (NEW)
```

---

## 5. Test re-run

```bash
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-qa6-gate-fix.test.ts
```

```
✓ |integration| sprint28-s28r3-qa6-gate-fix.test.ts (13 tests) 2454ms
  ✓ provision with derived QA host fails for reasons OTHER than invalid host name  2189ms
Test Files  1 passed (1)
Tests       13 passed (13)
```

Always-on coverage exercised: script exists, QA host digest form, max 64-char run id, short ids, collision pair, determinism, fail-closed invalid/unset, step3 source, frozen digests 1/2/4/5/6, HUMAN-GATE parity, assert not weakened, provision validator intact. Live seam: provision accepts derived QA host (no host-name refuse).

Evidence dir (local, not claimed as gate pass): `.tmp/GATE-FIX-S28R3-QA6/`.

---

## 6. Residual: DEPENDENCY-S28-R2-RO

**Preserved.** This fix only removes the false host-length barrier that blocked step3 before the intended restore-only credential boundary.

- Step2 still fails closed when distinct live `R2_RESTORE_*` are absent and emits residual `DEPENDENCY-S28-R2-RO`.
- No keys fabricated; no writer credentials reused as live green; placeholders not treated as live green for closeout.
- Live human gate remains incomplete until distinct restore-only credentials exist.
- Sprint correctly stays **In Progress** with residual named; QA6 does **not** claim 6/6.

---

## 7. Anti-stub / fakeability notes

| Risk | Assessment |
|---|---|
| Explicit stub in derive | None — real assert + openssl/shasum digest path |
| Silent truncate of run-id alone | Refused by design — digest form for long ids |
| Test theatre | Tests invoke real bash scripts; live provision checks absence of host refuse |
| Weakened validators | assert + provision unchanged vs base |
| Scope creep | Only step3 host derivation + contract/tests/docs |

---

## 8. Findings

| Severity | Finding |
|---|---|
| CRITICAL | **0** |
| HIGH | **0** |
| MEDIUM | **0** |
| LOW | **0** (informational only: top-level `gate-plan.json` notes gained a QA6 bullet and JSON re-serialization may escape unicode as `\u2014` in non-`literal_cmd` prose; steps 1/2/4/5/6 `literal_cmd` remain byte-identical to base — not a defect) |

---

## 9. Verdict

# **APPROVED**

Implementation satisfies the QA6 contract and goal for bounded, collision-resistant, deterministic host derivation from `GATE_RUN_ID`, with step3-only gate-plan change, HUMAN-GATE parity, unweakened validators, full evidence-path run IDs, and green always-on + live host-validation coverage.

**Not merged.** Residual **`DEPENDENCY-S28-R2-RO`** remains the external live-closeout blocker.

**Review path:** `.spec/reviews/GATE-FIX-S28R3-QA6-technical-20260729T110934Z.md`
