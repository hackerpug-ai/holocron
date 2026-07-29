# REDHAT-FIX-S28R3 — Bind six-step gate to provisioned fresh-target volumes + live distinct R2_RESTORE_* (Terra CRITICAL-1 + HIGH-1)

> Status: ⬜ Pending  
> Sprint: [Sprint 28](./SPRINT.md)  
> Agent: devops-engineer  
> Reviewer: code-reviewer + product-manager (+ test-quality-reviewer as product/test-reality lens)  
> Priority: P0  
> Proposed By: independent Terra High red-hat `red-hat-20260729T075401Z-sprint-28-final-independent-terra.md` CRITICAL-1 + HIGH-1  
> Reviewed SHA baseline: `e1e9221114c877cbb6f865de31c58cdf18000ce3`  
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes  

## Outcome

Authoritative CAP-BAK-01 six-step gate **binds fire-drill parity (steps 3→4→5)** to the **provisioned fresh-target volume-bound runner** with attestation (not host-local `.tmp/REDHAT-FIX-H2/step3-*`), and **step 2 isolation** requires **real distinct** `R2_RESTORE_ACCESS_KEY_ID` / `R2_RESTORE_SECRET_ACCESS_KEY` under `REQUIRE_LIVE_R2_RO=1` including `prove-r2-readonly.sh` list/get + sacrificial put/delete denial — never `ro-test` placeholders as green live proof.

Preserve fail-closed restore semantics and all six real gate claims. Do **not** weaken assertions, hand-edit gate results/evidence, or fabricate credentials/evidence. Use **existing project secrets only**. If distinct restore credentials are genuinely absent from project secret stores, the product/gate path must **fail closed** and emit the exact residual contract id **`DEPENDENCY-S28-R2-RO`** (do not invent mint tokens or stub RO keys).

## Evidence (immutable review — do not rewrite)

| Item | Path / fact |
|------|-------------|
| Review | `.spec/reviews/red-hat-20260729T075401Z-sprint-28-final-independent-terra.md` |
| Reviewed SHA | `e1e9221114c877cbb6f865de31c58cdf18000ce3` |
| CRITICAL-1 | Final gate step3 invokes `holo restore:fire-drill` with `.tmp/REDHAT-FIX-H2/step3-scratch` + `step3-blob` (`gate-plan.json` step 3) — never `run-fire-drill-on-fresh-target.sh` / volume mountpoints / attestation |
| HIGH-1 | Final gate step2 supplies `R2_ACCESS_KEY_ID=ro-test` placeholders; `prove-isolation.sh` may WARN and still PASS without live `prove-r2-readonly.sh` |
| Product already on main | `scripts/run-fire-drill-on-fresh-target.sh`, `scripts/provision-fresh-restore-target.sh` REQUIRE_LIVE_R2_RO fail-closed, `scripts/prove-r2-readonly.sh` — **not wired into authoritative gate-plan steps 2–3** |
| Credential inventory (orchestrator probe, no fabrication) | `services/platform/config/secrets.yaml` has ambient `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` (RW backup). **`R2_RESTORE_*` absent.** Mint parents (`CLOUDFLARE_API_TOKEN`, `R2_PARENT_*`) **absent**. |

## MUST

### CRITICAL-1 (gate bind + tests)
- MUST rewrite **gate-plan step 3 `literal_cmd`** so the fire-drill parity path runs via `scripts/run-fire-drill-on-fresh-target.sh` (or equivalent) against a **provisioned** fresh target’s named volumes (`${host}-pgdata`, `${host}-blobs`), writing **attestation JSON** and `parity-report.json` whose destinations are volume Mountpoints — **not** host `.tmp/REDHAT-FIX-H2/step3-scratch` / `step3-blob`
- MUST ensure steps 4 and 5 continue to read the **same** parity report produced by that volume-bound step 3 (path may move under `.tmp/REDHAT-FIX-S28R3/` or the runner’s report path, but **must not** reintroduce unbound host scratch as the restore destination)
- MUST emit/gate on attestation fields: host/container, volume names, mountpoints used as scratch+blob; refuse missing volumes
- MUST extend integration tests beyond `--resolve-only`: prove the live C1 path either (a) executes fire-drill on resolved volume paths when PLATFORM_IT+docker+credentials allow, or (b) fail-closes with a named error when volumes/creds missing — **never green solely on resolve-only for the gate claim**
- MUST preserve step 1, 4, 5, 6 **domain claims** (PITR / ledger 64-hex / blob parity / empty-chain fail-closed). Step 4/5 assertion regexes that match `jq -e` scalar `true` (GATE-FIX-QA4) stay; product jq predicates stay strong

### HIGH-1 (live distinct RO)
- MUST rewrite **gate-plan step 2 `literal_cmd`** so it does **not** default to `ro-test` placeholders as the live green path
- MUST set `REQUIRE_LIVE_R2_RO=1` and supply **distinct** `R2_RESTORE_*` loaded from existing project secrets/env (secrets.yaml / env already present — **no invention**)
- MUST invoke live proof including `prove-r2-readonly.sh` (list/get success + sacrificial put/delete denial) as part of step 2 or an equivalent chained command that must pass for RESULT:PASS
- MUST make `prove-isolation.sh` **fail closed** when `REQUIRE_LIVE_R2_RO=1` and keys are placeholder / missing / equal to ambient RW — **no WARN→PASS** on placeholders under that flag
- MUST **not** use ambient backup RW keys as `object-read-only`
- IF `R2_RESTORE_*` are genuinely absent: product + gate path exit non-zero with residual **`DEPENDENCY-S28-R2-RO`** (and clear human-readable message). Do **not** mint fake keys, do **not** claim live RO PASS, do **not** weaken step 2 to placeholders again

### Global
- NEVER weaken gate assertions or six-claim semantics
- NEVER hand-edit `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, or any `.gate-evidence/**` as “proof”
- NEVER fabricate credentials, mint tokens, or forged evidence
- NEVER touch Sprint 27 artifacts, `.tmp/D05-*`, or surface 137
- NEVER `--no-verify` / hook bypass
- RED→GREEN: failing tests first against current main behavior, then implement

## ACs

### AC-1 [PRIMARY][CRITICAL-1] — Gate step3 is volume-bound fresh-target fire-drill
GIVEN the authoritative `gate-plan.json`  
WHEN step 3 `literal_cmd` is inspected and executed under a provisioned target with resolvable volumes  
THEN it invokes `run-fire-drill-on-fresh-target.sh` (or CLI `--fresh-target` path that uses the same runner) with attestation output  
AND restore destinations are provisioned volume mountpoints (not `.tmp/REDHAT-FIX-H2/step3-*`)  
AND parity-report is written for steps 4–5  

**scenario (discriminating):**  
- start: current main gate-plan step3 uses host `.tmp` paths  
- must_observe: `run-fire-drill-on-fresh-target` OR equivalent + attestation schema `holo.fresh-target.fire-drill-attestation.v1` + volume names  
- must_not_observe: sole green path on `.tmp/REDHAT-FIX-H2/step3-scratch` as restore destination  

### AC-2 [CRITICAL-1] — Integration test proves bind or fail-closed (not resolve-only-only green)
GIVEN PLATFORM_IT (+ docker when required)  
WHEN the S28R3 fresh-target fire-drill test suite runs  
THEN it fails closed without volumes  
AND when volumes exist, either full fire-drill+attestation is exercised or a named residual/skip is **not** claimed as gate-green for host-only paths  
AND tests RED→GREEN against the pre-fix gap (resolve-only-only was insufficient for gate claim)

### AC-3 [PRIMARY][HIGH-1] — Gate step2 requires live distinct R2_RESTORE_* + prove-r2-readonly
GIVEN the authoritative `gate-plan.json` step 2  
WHEN `literal_cmd` is inspected  
THEN it requires `REQUIRE_LIVE_R2_RO=1` and does not default `R2_ACCESS_KEY_ID=ro-test` as the live success path  
AND live path includes `prove-r2-readonly.sh` (or `prove-isolation` path that **fails** without live RO proof under REQUIRE_LIVE_R2_RO=1)  
AND sacrificial put/delete denial is part of the proof  

### AC-4 [HIGH-1] — Fail-closed when restore creds absent or non-distinct
GIVEN only ambient RW `R2_ACCESS_KEY_ID` (or missing restore keys) in secrets/env  
WHEN step2 / provision / prove path runs with `REQUIRE_LIVE_R2_RO=1`  
THEN exit non-zero  
AND output names residual/contract **`DEPENDENCY-S28-R2-RO`** (or equivalent explicit refuse of missing/non-distinct restore identity)  
AND never PASS with placeholder WARN alone  

### AC-5 — Six gate claims preserved; no assertion weakening
GIVEN gate-plan after remediation  
WHEN steps 1,4,5,6 domain predicates and fail-closed restore semantics are compared to baseline  
THEN ledger 64-hex + blob matched_objects≥1 jq predicates remain  
AND empty-chain named failure remains  
AND step4/5 may still assert `^true$` for jq -e scalar output (QA4) — that is not weakening  

### AC-6 — Credential honesty inventory
GIVEN project secret stores only  
WHEN implementer probes for `R2_RESTORE_*`  
THEN evidence records present/absent (lengths only, never secret values)  
AND if absent, completion package documents **`DEPENDENCY-S28-R2-RO`** as the live-green residual without inventing keys  

## VERIFY

```bash
# Syntax / scripts
bash -n scripts/run-fire-drill-on-fresh-target.sh
bash -n scripts/provision-fresh-restore-target.sh
bash -n scripts/prove-isolation.sh
bash -n scripts/prove-r2-readonly.sh

# RED/GREEN suite (new or extended)
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts
# and/or extend:
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts
PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fresh-target-creds.test.ts

# Gate-plan static contracts
pnpm vitest run services/platform/tests/integration/sprint28-human-gate-oracles.test.ts 2>/dev/null || true
# Prefer a focused S28R3 test that reads gate-plan.json and asserts step2/3 literal_cmd contracts.

# Typecheck scoped
pnpm tsgo --noEmit
```

Live human-gate re-run is **out of band** for this task’s commit gate when `DEPENDENCY-S28-R2-RO` is honest; do not hand-write green gate-results.

## WRITE-ALLOWED

- `gate-plan.json` (step 2 and step 3 `literal_cmd` + related assertion notes; preserve claim strength; steps 4–5 may only adjust report **path** to the volume-bound report, not weaken jq predicates)
- `scripts/run-fire-drill-on-fresh-target.sh`
- `scripts/provision-fresh-restore-target.sh`
- `scripts/prove-isolation.sh`
- `scripts/prove-r2-readonly.sh` (only if needed for REQUIRE_LIVE fail-closed / residual messaging)
- `scripts/verify-restore-creds.sh` (residual messaging alignment only)
- `services/platform/src/cli/holo.ts` / `services/platform/src/backup/fire-drill.ts` only if required for attestation parity fields
- `services/platform/tests/integration/sprint28-fresh-target-fire-drill.test.ts`
- `services/platform/tests/integration/sprint28-fresh-target-creds.test.ts`
- `services/platform/tests/integration/sprint28-s28r3-gate-bind.test.ts` (NEW preferred)
- `services/platform/src/backup/fresh-target.md` (docs only if needed)
- Task file / SPRINT.md row
- `.tmp/REDHAT-FIX-S28R3/**` (local evidence only; never commit secrets)

## WRITE-PROHIBITED

- `gate-results.json`, `gate-verification.json`, `GATE-RESULTS.md`, `.gate-evidence/**` (all historical and current)
- Sprint 27 paths, `.tmp/D05-*`
- Fabricated `R2_RESTORE_*` values in secrets.yaml or committed files
- Weakening step 1/4/5/6 domain claims or empty-chain fail-closed
- Ambient RW keys written as restore object-read-only without distinct identity

## Patterns

- Follow REDHAT-FIX-S28R2-C1 runner + attestation schema
- Follow REDHAT-FIX-S28R2-H3 / verify-restore-creds residual `DEPENDENCY-S28-R2-RO`
- GATE-FIX-QA4: jq -e scalar `true` assertions for steps 4–5 stdout remain valid
- Fail closed > fake green

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S28R3",
  "source_review": "red-hat-20260729T075401Z-sprint-28-final-independent-terra.md",
  "findings": ["CRITICAL-1", "HIGH-1"],
  "requirements": [
    {"id": "AC-1", "primary": true},
    {"id": "AC-2"},
    {"id": "AC-3", "primary": true},
    {"id": "AC-4"},
    {"id": "AC-5"},
    {"id": "AC-6"}
  ],
  "tdd_mode": "red_first",
  "residual_contract_if_creds_absent": "DEPENDENCY-S28-R2-RO",
  "write_prohibited": [
    "gate-results.json",
    "gate-verification.json",
    "GATE-RESULTS.md",
    ".gate-evidence/",
    "services/platform/config/secrets.yaml"
  ]
}
-->
