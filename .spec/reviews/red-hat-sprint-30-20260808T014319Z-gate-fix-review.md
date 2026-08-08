# Sprint 30 — Independent Gate-Fix Review (four landed commits)

**Review date:** 2026-08-08  
**Exact reviewed HEAD:** `3ba6ab5c4189a3091e804b345342e9502604724f` (`main`)  
**Commits under review (oldest → tip):**

| SHA | Subject |
|---|---|
| `1208e388` | fix(sprint-30): fail-closed `DRILL_FENCE_NOT_ARMED` before five-surface probes |
| `3dcbcb42` | fix(sprint-30): gate preflight re-arms soak fence + live 423 + dual-path PONR clear |
| `972ece78` | fix(sprint-30): T-SYNC-013/014 identity-bound zero-loss and post-PONR oracles |
| `3ba6ab5c` | style(sprint-30): biome format GATE-FIX cutover sources after pre-commit |

**RED baseline residual run:** `20260808T011038Z` (partial 3/5 — steps 3–5 pass, 1–2 fail)  
**Disposition:** **NEEDS_REVISION** — one CRITICAL regression in the post-PONR identity-bind wiring against real human-gate logs; fence precondition and preflight re-arm design otherwise hold.

## Scope and review boundary

Independent, adversarial review of the four landed GATE-FIX commits only. No product code was changed for this review. Live checks were limited to:

- read-only inspection of durable fence shape and `/health`
- live POST via `prove-sprint30-fence-armed-live.sh` against the currently **disarmed** serving process (documents the fail path of the live oracle; it returned HTTP 201, exit 2)
- fixture/unit oracle reproduction and static call-order analysis
- unit suite: `gate-fix-drill-fence-precondition`, `gate-fix-gate-preflight-fence-rearm`, `gate-fix-zero-loss-t-sync-013` (18/18 pass)

`NEEDS_REVISION` blocks treating this tip as gate-fix complete for T-SYNC-014 / step5 post-bind. It does not claim the product fence precondition is wrong, and it does not move Sprint 30 to complete/release.

## Verification matrix (requested claims)

| # | Claim | Verdict | Independent evidence |
|---|---|---|---|
| 1 | Fence precondition fails closed **before** any of the five write-surface probes run | **PASS** | Source order in `runRollbackDrill`: `fenceArmed = isMigrationReadOnly()` then `if (!fenceArmed) { fencePreconditionFailed = true }` **else** `probes = await probeFiveWriteSurfaces(...)` at [`rollback-drill.ts:760–775`](services/platform/src/cutover/rollback-drill.ts). Only call site of `probeFiveWriteSurfaces` inside the drill is gated. Error composition prefers `DRILL_FENCE_NOT_ARMED` over `DRILL_WRITE_SURFACES_NOT_BLOCKED` (`:922` before `:928`). Unit TC asserts source call-order index. Integration test (landed) asserts all five `probes.*.executed === false`, empty `accepted_write_identities`, ledger count unchanged, and **not** the post-mint residual class. |
| 2 | Gate preflight re-arms the **durable** fence (not echo-only) and live write returns **423** for real | **PASS (wiring + durable path); live 423 inverted-proved** | Preflight default-ON `HOLO_GATE_REARM_FENCE` invokes `rearm-sprint30-cutover-control-plane.sh` → `scripts/lib/rearm-sprint30-cutover-control-plane.ts` → `writeDurableMigrationReadOnly` / `writeDurableDataPlane` (no `sed`/`re.sub` of secrets). Shape assert requires quoted `"1"` without `"1""` corruption. Live oracle script POSTs `/api/documents` and requires status 423 + `migration_read_only`. **Live at review time:** durable `HOLO_MIGRATION_READ_ONLY: "0"`; prove script exited **2** and the probe body was a real **HTTP 201** document mint — proving the oracle is not source-text theatre (fail path is real). Serving re-reads durable fence per request (`isMigrationReadOnly` / soak middleware). Full rearm→423 green path is covered by disposable-secrets integration AC-2; this review did **not** mutate production secrets.yaml. |
| 3 | Zero-loss / post-PONR oracles bind identity to **this-run** PONR; reject residual `…aaaaaaaaaaaa` | **PARTIAL — residual real; bind broken on real gate logs** | Residual `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa` is **real** in `20260808T011038Z` step1 nested repoint message (not invented). Compact residual fixtures correctly emit `residual_aaaa_sentinel` / `step5_write_row_id_is_aaaa_sentinel_not_this_run`. **But** the human-gate consumer path cannot parse real `step4.log` (see CRITICAL). Zero-loss identity oracle correctly fails the disarmed-fence RED fixture with the two residual document ids from that run. |
| 4 | No regression to steps 3/4/5 tip-bind / operator-secret checks | **FAIL on step5 post-bind regression** | Gate-plan steps 3–5 commands/assertions preserved (step5 only gains a notes field). `HOLO_CUTOVER_OPERATOR_SECRET` RH-S30-12 and RH-S30-07 tip-bind / `DEPLOY_REVISION_MISMATCH` remain and still run (secret load → rearm → tip-bind → steps). **However**, post-steps `assert-post-ponr-identity-bind` against real GATE-META logs always fails and **flips step5 pass → fail**, regressing the previously green step5 of partial 3/5 runs. |

## Claim 1 — fence precondition before probes

**Product control is correct.**

```text
// (3) Five write-surface probes
let probes = emptyProbes();
const fenceArmed = isMigrationReadOnly();
if (!options?.skipProbes && liveBaseUrl) {
  if (!fenceArmed) {
    fencePreconditionFailed = true;   // probes stay emptyProbes() — no network mint
  } else {
    probes = await probeFiveWriteSurfaces(...);
  }
}
```

- Not a post-hoc flag: probes are never invoked when disarmed.
- Report emits `fence_armed` + `accepted_write_identities` for T-SYNC-013.
- RED `20260808T011038Z` residual class (`app.status=201`, MCP accept, `DRILL_WRITE_SURFACES_NOT_BLOCKED` after mint) is exactly what this fails closed against.

Unit: 5/5 pass (call-order + extract identities).  
Integration test landed for no-mint under disarmed fence (not re-run in this session; source + unit order are sufficient for the fail-closed-before claim).

## Claim 2 — durable re-arm + live 423

**Wiring is real durable re-arm, not script echo.**

1. `run-sprint30-human-gate.sh` default-ON rearm with optional `--plane postgres --target postgres-soak`.
2. Worker uses platform `writeDurableMigrationReadOnly` only after optional surgical repair of known `"1""` corruption.
3. Preflight proves durable line shape, then runs `prove-sprint30-fence-armed-live.sh`.
4. Dual-path PONR clear uses `readDataPlanePonr` + `resolveDatabaseUrl({ preferHolocron: true })` (addresses residual aaaa PONR surviving psql-only clear on a divergent `DATABASE_URL`).

**Live independent check (this host, tip checkout, serving still at `sourceRevision=54299bfc…`):**

| Observation | Value |
|---|---|
| Durable fence | `HOLO_MIGRATION_READ_ONLY: "0"` |
| Prove script exit | `2` (`FENCE_NOT_ARMED_ON_SERVING_PROCESS` path) |
| Write probe | HTTP **201** + minted document body (not 423) |

That is the correct fail-closed outcome of the live oracle when the fence is disarmed. It is **not** a pass of “fence is armed”; it is proof the oracle exercises the serving process.

**Note (HIGH, see findings):** when the fence is disarmed, the prove POST itself mints a production write. Preflight order (rearm then prove) mitigates this if rearm succeeds; if rearm lies or is skipped, the prove step poisons zero-loss.

## Claim 3 — identity-bound zero-loss and residual aaaa

### Residual aaaa is real (run-stage evidence)

From `.gate-evidence/20260808T011038Z/step1.log` nested repoint error:

```text
write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa
ponr_id=585ecd45-65ed-43b3-875d-eed092697bbb
```

Same run’s step4 minted **this-run** identities:

- `ponr_id=31b33eb4-3e97-4520-b6a7-745186fc8d51`
- `write_row_id=ebd12bd6-f78d-4849-9595-8bc9d4036269`

Step5 of that run correctly refused with those this-run ids (regex oracle green). The residual aaaa was a **prior-run** PONR still visible to step1’s nested repoint — exactly the dual-path clear / identity-bind motivation.

### Zero-loss identity oracle (T-SYNC-013)

- Gate-plan step2 replaced count-only with `assert-zero-loss-identity-oracle.sh`.
- PASS requires `accepted_count==0`, `identity_count==0`, empty `accepted_write_identities`.
- RED fixture replaying residual doc ids `145f82e5-…` / `5ef15d4b-…` fails with nonempty identities (count-only is not closed).
- Unit suite 8/8 pass for fixture lanes.

### Post-PONR identity bind (T-SYNC-014) — CRITICAL defect

Oracle logic **when given parseable step4 JSON** correctly:

- PASS this-run step4 ↔ step5 ids
- FAIL residual aaaa with reasons including `residual_aaaa_sentinel` and `step5_write_row_id_is_aaaa_sentinel_not_this_run`

But human-gate wires:

```bash
bash scripts/assert-post-ponr-identity-bind.sh \
  --step4 "$EVID_DIR/step4.log" \
  --step5 "$EVID_DIR/step5.log"
```

Real `step4.log` is:

```text
@@GATE-META step=4 ...@@
CMD: ...
{ pretty multi-line enable-writes JSON }
@@GATE-EXIT=0@@
```

In `zero-loss-identity-oracle.py` `main()`:

1. `load_json(step4.log)` fails (GATE-META prefix) → `{}`
2. Line-by-line requires `ponr_id` **and** `line.startswith("{")` → never true on pretty logs
3. Regex extract is nested under `if step4_text.strip().startswith("{")` → **skipped** because strip starts with `@@GATE-META`

**Independent reproduction (this review):**

```text
python3 scripts/lib/zero-loss-identity-oracle.py --mode post-ponr \
  --step4 .../20260808T011038Z/step4.log \
  --step5 .../20260808T011038Z/step5.log
→ ok:false, step4_ponr_id:null, reasons:["step4_missing_ponr_identity"], RC=2
```

Yet the same logs **do** contain matching this-run ids (step5 binds `31b33eb4…` / `ebd12bd6…`). A JSONDecoder `raw_decode` walk extracts them cleanly. The unit fixtures avoid GATE-META prefixes, so unit GREEN does **not** cover the production consumer path.

Human-gate then **forces step5 fail** on bind RC≠0 even when step5 regex already passed — a hard regression of the green step5 path.

## Claim 4 — steps 3/4/5, tip-bind, operator secret

| Control | Status |
|---|---|
| Step3 pin-fallback + boot verify (`RH-S30-06`) | Unchanged in gate-plan; no regression in script path |
| Step4 enable-writes assertions | Unchanged (`ok`, `ponr_id`, `write_row_id`) |
| Step5 regex `POST_PONR_INELIGIBLE` + `repointed:false` | Unchanged; **plus** post-bind that currently breaks green step5 |
| RH-S30-07 tip-bind / `DEPLOY_REVISION_MISMATCH` | Still present after preflight rearm |
| RH-S30-12 `HOLO_CUTOVER_OPERATOR_SECRET` | Still loaded before irreversible CLIs; fail-closed if missing/short |
| Partial 3/5 not release | Explicit `t-sync-013-release-verdict.json` documentation — good honesty |

## Findings

### CRITICAL

**C-1 — Post-PONR identity bind cannot parse real human-gate `step4.log` / forces false step5 fail**

- **Where:** `scripts/lib/zero-loss-identity-oracle.py` `main()` step4 recovery; consumer `scripts/run-sprint30-human-gate.sh` post-steps bind.
- **Evidence:** Independent run against `20260808T011038Z` step4/step5 logs → `step4_missing_ponr_identity` despite both ids present; GATE-META prefix skips the only multi-line recovery branch.
- **Impact:** Any green step5 is flipped to fail after bind. T-SYNC-014 as wired cannot certify this-run bind on real gate artifacts; unit fixtures false-green the consumer path.
- **Required fix:** Parse gate logs with a robust JSON extract (e.g. `JSONDecoder.raw_decode` scan for objects containing `ponr_id`), or bind against `.tmp/D07-04/enable-writes-report.json` + step5 report JSON rather than GATE-META-wrapped logs. Add a unit/fixture that is a **verbatim** `@@GATE-META` step4/step5 pair from `20260808T011038Z` and requires PASS for this-run ids + FAIL for residual aaaa.

### HIGH

**H-1 — Live fence prove mints production writes when disarmed**

- **Where:** `scripts/prove-sprint30-fence-armed-live.sh` POST `/api/documents`.
- **Evidence:** This review’s live run against durable `"0"` returned HTTP 201 with a new document id (zero-loss poison if ledger not reset).
- **Impact:** If rearm fails open, is skipped (`HOLO_GATE_REARM_FENCE=0`), or durable write does not affect the serving process for any reason, the prove step itself recreates the T-SYNC-013 poison class.
- **Required fix:** Prefer a non-ledger probe if available, or prove under a unique title **and** auto dual-reset ledger on prove failure; or short-circuit prove only after durable+CLI `isMigrationReadOnly()` is true **and** document that 201 path must trigger immediate ledger clear. At minimum, fail before POST when durable fence reads disarmed.

### MEDIUM

**M-1 — Residual-aaaa unit fixture does not assert aaaa-specific reasons**

- Pretty multi-line residual fixture fails via “missing step4 ids in text” after weak step5 object parse, not via `residual_aaaa_sentinel`. Compact residual correctly emits aaaa reasons. Tighten fixture + assertions so aaaa is the named fail class.

**M-2 — Product fix not yet on live `sourceRevision`**

- Serving `/health` still reports `sourceRevision=54299bfc…` (pre-GATE-FIX). Fence precondition cannot protect production until redeploy of tip. Not a code defect in the commits; blocks live end-to-end green of claim 1 on this host.

### LOW

**L-1 — Prove script `--out` reliability on failure**

- Observed missing `--out` file on at least one fail run while probe body temp file was written. Harden so evidence JSON is always written before nonzero exit.

**L-2 — Biome-only tip commit**

- `3ba6ab5c` is format-only; no behavioral risk.

## What is solid (do not regress while fixing C-1)

1. **Product** `DRILL_FENCE_NOT_ARMED` before `probeFiveWriteSurfaces` — correct fail-closed control.
2. **Durable rearm worker** via `writeDurableMigrationReadOnly` (not sed) + soak plane restore hooks.
3. **Step2 identity oracle** replacing count-only zero-loss.
4. **Semantic** residual-aaaa rejection when inputs are parseable.
5. **Tip-bind and operator-secret** preflight controls intact.
6. **Honesty** that partial 4–5 green without 1–2 is not T-SYNC-013 release.

## Commands and outcomes

| Command | Outcome |
|---|---|
| `pnpm vitest run --project unit tests/cutover/gate-fix-{drill-fence-precondition,gate-preflight-fence-rearm,zero-loss-t-sync-013}.test.ts` | 18/18 pass |
| `python3 …/zero-loss-identity-oracle.py --mode post-ponr --step4 …/011038Z/step4.log --step5 …/011038Z/step5.log` | **FAIL** `step4_missing_ponr_identity` (CRITICAL) |
| Same oracle on compact residual aaaa vs this-run step4 | FAIL with `residual_aaaa_sentinel` |
| Same oracle on compact this-run pair | PASS |
| Zero-loss oracle on disarmed-fence residual fixture | FAIL, identities = residual app/mcp ids |
| `bash scripts/prove-sprint30-fence-armed-live.sh --base-url http://127.0.0.1:44121` with durable fence `"0"` | exit 2, live HTTP 201 (oracle real; fence not armed) |
| Static: no `sed` secrets fence rewrite in human-gate; rearm + tip-bind + operator secret present | pass |

## Final disposition

**NEEDS_REVISION**

| Severity | Count | Blockers for gate-fix land decision |
|---|---|---|
| CRITICAL | 1 | C-1 must fix before human-gate can use T-SYNC-014 bind without regressing step5 |
| HIGH | 1 | H-1 should fix before relying on prove under partial rearm failure |
| MEDIUM | 2 | M-1/M-2 hardening / deploy awareness |
| LOW | 2 | Non-blocking |

Approve **claim 1** (product fence precondition) and the **durable rearm design** of claim 2. Do **not** approve claim 3/4 as closed until C-1 is fixed and re-proven against a verbatim `@@GATE-META` step4/step5 pair from a real gate run (including residual-aaaa negative).

This review does not merge, redeploy, rearm production fence, or change Sprint 30 release state (remains **In Progress**).
