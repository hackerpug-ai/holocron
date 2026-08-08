# Sprint 30 — Independent C-1 / H-1 Gate-Fix Review (three landed commits)

**Review date:** 2026-08-08  
**Exact reviewed HEAD:** `216b1ad7e97a244be65c933f609c2e96fbbc5a15` (`main`)  
**Commits under review (oldest → tip):**

| SHA | Subject |
|---|---|
| `b2222341` | fix(sprint-30): parse GATE-META multi-line JSON in post-PONR identity bind (C-1) |
| `c17a466d` | fix(sprint-30): refuse fence prove POST when durable fence is disarmed (H-1) |
| `216b1ad7` | style(sprint-30): biome format GATE-FIX C-1/H-1 unit tests after pre-commit |

**Prior residual run (RED baseline for C-1/H-1):** `20260808T011038Z` + independent review `red-hat-sprint-30-20260808T014319Z-gate-fix-review.md` (CRITICAL C-1 + HIGH H-1)  
**Disposition:** **APPROVED** — both prior blockers closed with independent live/fixture evidence; no CRITICAL/HIGH residuals introduced by these commits. Prior fence-precondition + preflight re-arm controls not regressed.

## Scope and review boundary

Independent, adversarial review of the three landed C-1/H-1 commits only. No product code was changed for this review. Live checks were limited to:

- durable fence state + `/health` identity (read-only)
- live `prove-sprint30-fence-armed-live.sh` against the **currently disarmed** serving process at `http://127.0.0.1:44121` with independent ledger count before/after
- real `@@GATE-META` step4/step5 logs from `20260808T011038Z` through the consumer oracle + wrapper
- residual-aaaa negative paths (compact + GATE-META-shaped)
- unit suites for C-1, H-1, and prior ninth/tenth-cycle controls (30/30)
- static call-order / human-gate wiring for steps 3/4/5, tip-bind, operator secret, rearm

`APPROVED` means C-1 and H-1 as specified in the prior red-hat are closed at this tip. It does **not** claim:

- the live serving process is at tip (`sourceRevision` still `54299bfc…`)
- a full human-gate 5/5 green has been re-run
- Sprint 30 is release-complete (remains operator In Progress until redeploy + full gate)

## Verification matrix (requested claims)

| # | Claim | Verdict | Independent evidence |
|---|---|---|---|
| 1 | **C-1:** post-PONR identity bind parses real `@@GATE-META` multi-line step4/step5; this-run PASS; residual aaaa FAIL | **PASS** | Real `20260808T011038Z` step4/step5 → `ok:true`, `t_sync_014:PASS`, `step4_ponr_id=31b33eb4…`, `step5` matches, **no** `step4_missing_ponr_identity`. Residual aaaa (compact + GATE-META fixtures) → FAIL with `residual_aaaa_sentinel` + `step5_write_row_id_is_aaaa_sentinel_not_this_run`. Wrapper `assert-post-ponr-identity-bind.sh` RC=0 on real logs. Unit suite 7/7. |
| 2 | **H-1:** fence prove refuses POST when durable fence disarmed; ledger delta=0 | **PASS** | Live at review: durable `"0"` / `armed:false`. Prove exit **2**, `error.code=FENCE_DISARMED_PRECHECK`, `post_attempted:false`, `write_probe:null`, script ledger `delta:0`. Independent `post_export_write_audit` count **8→8** (delta=0). `--out` written on fail. Unit live TC 5/5 incl. live disarmed path. |
| 3 | No regression to fence-precondition / gate-preflight-rearm / steps 3–5 controls | **PASS** | `rollback-drill.ts`: `fenceArmed` then `if (!fenceArmed) fencePreconditionFailed` **else** `probeFiveWriteSurfaces` only. Human-gate still has `HOLO_GATE_REARM_FENCE`, `prove-sprint30-fence-armed-live.sh`, tip-bind `DEPLOY_REVISION_MISMATCH`, `HOLO_CUTOVER_OPERATOR_SECRET`, post-steps T-SYNC-014 bind. Prior unit suites: drill-fence-precondition 5/5, gate-preflight-fence-rearm 5/5, zero-loss-t-sync-013 8/8. |

## Claim 1 — C-1 GATE-META multi-line parse

### Defect closed

Prior review reproduced:

```text
python3 …/zero-loss-identity-oracle.py --mode post-ponr \
  --step4 …/20260808T011038Z/step4.log --step5 …/20260808T011038Z/step5.log
→ ok:false, step4_ponr_id:null, reasons:["step4_missing_ponr_identity"]
```

despite both this-run ids present in the logs.

### Fix shape

`scripts/lib/zero-loss-identity-oracle.py`:

- `extract_json_objects()` — `JSONDecoder.raw_decode` scan (no `startswith("{")` sole path)
- `load_step_payload(prefer="ponr"|"step5"|"any")` for bare JSON **or** GATE-META-wrapped pretty multi-line logs
- `evaluate_post_ponr_bind` string path uses the same extractor; operator-precedence fix for `s5_ponr`
- `main()` post-ponr path calls `load_step_payload` for step4

Unit fixtures **copy real evidence when present** (or seed byte-faithful `@@GATE-META` fallback), so bare-JSON-only false-green is closed.

### Independent reproduction (this review)

| Input | Result |
|---|---|
| Real `20260808T011038Z` step4/step5 GATE-META logs | **PASS** `t_sync_014=PASS`, ponr/write ids bound `31b33eb4…` / `ebd12bd6…` |
| Compact residual aaaa step5 | **FAIL** reasons include `residual_aaaa_sentinel`, `step5_write_row_id_is_aaaa_sentinel_not_this_run`, ponr/write mismatch |
| GATE-META residual aaaa fixture | same aaaa-named FAIL class (not `step4_missing_ponr_identity` alone) |
| `assert-post-ponr-identity-bind.sh` on real logs | RC=0 |

Human-gate post-steps wiring still forces step5 fail only when bind RC≠0 — now a **true** bind, not a parse miss flipping honest step5 green→red.

## Claim 2 — H-1 prove no-mint when disarmed

### Defect closed

Prior review: with durable fence `"0"`, prove POST minted HTTP **201** and poisoned `post_export_write_audit`.

### Fix shape

`scripts/prove-sprint30-fence-armed-live.sh`:

1. Health check
2. **Precheck** `readDurableMigrationReadOnly` + `isMigrationReadOnly` **before** any POST
3. If not armed → emit `FENCE_DISARMED_PRECHECK`, `post_attempted:false`, ledger before=after, **exit 2 without POST**
4. Armed path only: live POST requiring **423 + migration_read_only**
5. Defense-in-depth: dual-reset if HTTP 201 ever observed after precheck; always write `--out` via `emit_and_exit` / post-RESULT write (prior L-1)

### Independent live check (this host, tip scripts, serving still disarmed)

| Observation | Value |
|---|---|
| `/health` | 200; `sourceRevision=54299bfc76fec6fc52468dae451ca293a6f104c4` |
| Durable fence | `HOLO_MIGRATION_READ_ONLY: "0"`, `isMigrationReadOnly()=false` |
| Ledger before | **8** |
| Prove exit | **2** |
| `error.code` | `FENCE_DISARMED_PRECHECK` |
| `post_attempted` | **false** |
| `write_probe` | **null** |
| Script ledger delta | **0** |
| Independent ledger after | **8** (delta **0**) |
| `--out` on fail | written |

This is the designed fail-closed path: oracle fails because the host is disarmed, **without** recreating the T-SYNC-013 poison class.

Armed PASS remains live-423-only (static + comments); CLI-only armed is not treated as PASS.

## Claim 3 — no regression to ninth/tenth-cycle controls

| Control | Status |
|---|---|
| Product `DRILL_FENCE_NOT_ARMED` before `probeFiveWriteSurfaces` | Unchanged; fail-closed before network mint |
| Gate preflight durable rearm (`HOLO_GATE_REARM_FENCE` default-ON) | Still present; still calls prove live oracle after rearm |
| Tip-bind / `DEPLOY_REVISION_MISMATCH` | Still present |
| `HOLO_CUTOVER_OPERATOR_SECRET` (RH-S30-12) | Still fail-closed if missing/short |
| Step3 pin-fallback / boot verify | Unchanged in human-gate comments + plan path |
| Step4 enable-writes assertions | Unchanged |
| Step5 regex `POST_PONR_INELIGIBLE` + post-bind | Unchanged regex; post-bind now works on real GATE-META |
| T-SYNC-013 zero-loss identity oracle | Residual disarmed fixture still FAIL with nonempty identities (8/8 unit) |

## Findings

### CRITICAL

_None._ Prior C-1 closed.

### HIGH

_None._ Prior H-1 closed on the live disarmed host (no mint; delta=0).

### MEDIUM

**M-1 — Product tip still not on live `sourceRevision` (carry-forward)**

- Serving `/health` still reports `sourceRevision=54299bfc…` (pre GATE-FIX product fence precondition / later tips).
- Not a defect in the three commits under review; blocks live end-to-end green of product `DRILL_FENCE_NOT_ARMED` on this host until redeploy.
- Operator action: redeploy tip, then re-run full human-gate.

### LOW

**L-1 — Prove script requires Bash ≥4 for secrets-load heredoc (pre-existing)**

- On macOS stock `/bin/bash` 3.2, `bash -n scripts/prove-sprint30-fence-armed-live.sh` fails to parse the pre-existing `RN_KEY="$( python3 … <<'PY' … )"` secrets block (`unexpected EOF while looking for matching ')'`).
- Homebrew bash 5.3 (`/opt/homebrew/bin/bash`) parses and runs correctly; shebang is `#!/usr/bin/env bash`.
- **Not introduced by H-1** (parent `c17a466d^` has the same syntax failure under bash 3.2). H-1 live path verified under bash 5.
- Residual risk only if an operator forces `/bin/bash` 3.2 with empty `HOLO_KEY_RN` (parse fail before POST — still no mint, but no structured `--out`). Prefer PATH with bash 5 or export `HOLO_KEY_RN`.

**L-2 — Biome-only tip commit**

- `216b1ad7` is format-only on the two new unit test files; no behavioral risk.

**L-3 — Armed-path 201 dual-reset is best-effort**

- If durable precheck says armed but serving is still disarmed, POST may mint; script attempts `reset-sprint30-gate-ledger.sh --authorize`. Failures of dual-reset are not fail-closed at prove exit beyond non-ok status. Acceptable defense-in-depth residual; main H-1 disarmed path never POSTs.

## What is solid (do not regress)

1. **C-1** raw_decode / `load_step_payload` consumer path grounded on **real** GATE-META evidence.
2. **H-1** durable/CLI precheck before POST; `FENCE_DISARMED_PRECHECK` + ledger delta 0.
3. **Product** `DRILL_FENCE_NOT_ARMED` before five-surface probes (prior cycle).
4. **Durable rearm worker** via `writeDurableMigrationReadOnly` + live 423 prove when armed.
5. **T-SYNC-013** identity zero-loss (not count-only).
6. **Tip-bind + operator-secret** preflight controls intact.
7. **Residual aaaa** rejection with named reasons on both bare and GATE-META fixtures.

## Commands and outcomes

| Command | Outcome |
|---|---|
| `pnpm vitest run --project unit tests/cutover/gate-fix-{post-ponr-gate-meta-parse,prove-fence-no-mint-disarmed,drill-fence-precondition,gate-preflight-fence-rearm,zero-loss-t-sync-013}.test.ts` | **30/30 pass** |
| `python3 …/zero-loss-identity-oracle.py --mode post-ponr --step4 …/011038Z/step4.log --step5 …/011038Z/step5.log` | **PASS** this-run bind (C-1 closed) |
| Same oracle residual aaaa compact + GATE-META | **FAIL** `residual_aaaa_sentinel` |
| `bash scripts/assert-post-ponr-identity-bind.sh` on real 011038Z logs | RC=0 |
| `bash scripts/prove-sprint30-fence-armed-live.sh --base-url http://127.0.0.1:44121 --out …` (durable `"0"`) | exit 2, `FENCE_DISARMED_PRECHECK`, `post_attempted:false`, ledger **8→8** |
| Zero-loss oracle on disarmed-fence residual fixture | FAIL, identities = residual app/mcp ids |
| Static: fence precheck before probeFiveWriteSurfaces; prove precheck before POST; rearm + tip-bind + operator secret present | pass |

## Final disposition

**APPROVED**

| Severity | Count | Blockers for C-1/H-1 land decision |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 1 | Deploy awareness only (M-1); not a code blocker for these three commits |
| LOW | 3 | Non-blocking |

### Approval scope

| Prior finding | Status |
|---|---|
| C-1 post-PONR GATE-META parse / false step5 fail | **CLOSED** |
| H-1 prove mint on disarmed host | **CLOSED** (live delta=0) |
| Claim 1 fence precondition (prior cycle) | **No regression** |
| Claim 2 durable rearm design (prior cycle) | **No regression** |
| Steps 3/4/5 + tip-bind + operator secret | **No regression** |

### Still not claimed by this review

1. Full human-gate 5/5 re-execution after tip redeploy.
2. Live product `DRILL_FENCE_NOT_ARMED` on serving process (needs redeploy past `54299bfc`).
3. Armed-path live 423 green on this host (fence currently disarmed; not mutated by this review).

This review does not merge, redeploy, rearm production fence, or change Sprint 30 release state (remains **In Progress** until operator full-gate + deploy).
