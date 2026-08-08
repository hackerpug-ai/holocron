# GATE-FIX-gate-preflight-fence-rearm — Gate preflight must re-arm soak fence + prove live 423 + leave deterministic pre-PONR soak for step1

> **Task ID:** GATE-FIX-gate-preflight-fence-rearm
> **Sprint:** [Sprint 30](./SPRINT.md)
> **Agent:** `devops-engineer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** HIGH
> **Source finding:** Human-gate partial `20260808T011038Z` @ HEAD `54299bfc76fec6fc52468dae451ca293a6f104c4` — step1 `DRILL_WRITE_SURFACES_NOT_BLOCKED` (`fence_armed=false`); step2 Postgres `accepted_count=2` / `drill_lost_accepted_writes=1`
> **Source:** `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/` + `gate-results.json` (verdict **partial** 3/5)
> **Proposed by:** `devops-engineer`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> Status: Plan only — not implemented
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)
> **Siblings:** `GATE-FIX-drill-fence-precondition` (mastra product fail-closed) · `GATE-FIX-zero-loss-t-sync-013` (security identity oracles)

## Finding

**Gate preflight resets ledger+PONR but never re-arms the durable soak fence, so step1 drill runs against a disarmed control-plane and accepts real production writes.** Severity: **HIGH**. Confidence: **HIGH**.

### What works (preserve)

- Dual-reset ledger preflight exists and is default-ON (`HOLO_GATE_RESET_LEDGER=1`) via `scripts/reset-sprint30-gate-ledger.sh --authorize --clear-ponr` wired in `scripts/run-sprint30-human-gate.sh:95-99`.
- Safe durable re-arm script already exists: `scripts/rearm-sprint30-cutover-control-plane.sh` + `scripts/lib/rearm-sprint30-cutover-control-plane.ts` — uses `writeDurableMigrationReadOnly` / optional `writeDurableDataPlane`; surgically repairs known doubled-quote YAML corruption; **never** ad-hoc regex rewrites of secrets.
- Step3–5 oracles still function when fence residue / PONR residue happen to align (run `20260808T011038Z` steps 3/4/5 **pass**; step5 still shows real `POST_PONR_INELIGIBLE` after real step4).
- Product fence semantics remain correct when durable is `'1'`: R2-C01 arm + GATE-FIX-fence-lift durable-lift disarm (`services/platform/src/cutover/soak-fence.ts`).

### What remains broken

Human-gate run `20260808T011038Z` @ `54299bfc…` (deployed `http://127.0.0.1:44121`):

| Step | Result | Evidence class |
|------|--------|----------------|
| 1 | **FAIL** | `DRILL_WRITE_SURFACES_NOT_BLOCKED` with `fence_armed=false`; app **201**, mcp **200**, job `ok=true`, mission not rejected |
| 2 | **FAIL** | Postgres `post_export_write_audit` `accepted_count=2`, `drill_lost_accepted_writes=1` (writes accepted under disarmed fence) |
| 3–5 | pass | Not sufficient for gate green while step1/2 fail |

**Proven root causes:**

1. **Durable fence left disarmed** — prior enable-writes / step4 left `HOLO_MIGRATION_READ_ONLY: "0"`. Gate preflight never re-arms. Drill CLI `isMigrationReadOnly()` reports `fence_armed=false` and five write surfaces accept real writes (`step1.log` error message). Current durable still shows `"0"` after the partial gate.
2. **Rearm script not wired** — `scripts/rearm-sprint30-cutover-control-plane.sh` exists but is **not** called from `scripts/run-sprint30-human-gate.sh` preflight (only ledger dual-reset is).
3. **Residual data-plane labels** — after prior repoint/drill residue, durable `HOLO_DATA_PLANE` may still be `convex` (observed post-run: `HOLO_DATA_PLANE=convex`, `HOLO_ROLLBACK_TARGET=convex-frozen`). Pre-PONR soak for step1 should typically start **postgres** (+ soak target label) with fence armed; step1 drill itself re-points **to** convex during the drill.
4. **PONR clear incomplete / dual-path mismatch** — preflight claimed `ponr_cleared:true` + `ponr_count:0` (`preflight-ledger-reset.json`), yet step1 child `cutover:rollback-repoint` refused with `POST_PONR_INELIGIBLE` for residual `ponr_id=585ecd45-…` / sentinel `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa` recorded `2026-08-07`. Reset uses scraped `DATABASE_URL` + `psql`; product latch uses `readDataPlanePonr()` → `resolveDatabaseUrl({ preferHolocron: true })`. Gate must leave **deterministic pre-PONR soak** so step1 can repoint; step5 must remain the **only** path that legitimately expects `POST_PONR_INELIGIBLE` after real step4.

**Out of product-probe scope (sibling):** in-process drill fail-closed before five write-surface probes when fence is disarmed is owned by **`GATE-FIX-drill-fence-precondition`**. **This task owns gate runner / control-plane re-arm / pre-PONR soak preflight only.** Cross-link without duplicating product probe ACs.

### Required remediation

Wire **default-ON fence re-arm + live serving write-oracle + deterministic pre-PONR residue clear** into the human-gate preflight so step1 can run a real rollback drill under an **armed fence**, zero-loss ledger, and no residual PONR blocking legitimate pre-PONR rollback.

## Scope (WRITE-ALLOWED)

- `scripts/run-sprint30-human-gate.sh` — preflight block only (re-arm + live 423 prove + pre-PONR soak assertions; preserve tip-bind, step execution, C-3 packaging hooks)
- `scripts/rearm-sprint30-cutover-control-plane.sh` / `scripts/lib/rearm-sprint30-cutover-control-plane.ts` — only if needed for exit-code / JSON evidence contract (do **not** reintroduce regex rewrite of secrets)
- `scripts/reset-sprint30-gate-ledger.sh` — only if needed so post-clear PONR proof uses the **same** resolution path as `readDataPlanePonr` / `cutover:rollback-repoint` (platform path, not psql-only)
- Optional NEW helper(s) under `scripts/` for live fence write-probe + pre-PONR soak proof (e.g. `scripts/prove-sprint30-fence-armed-live.sh`, `scripts/assert-sprint30-prep-ponr-clear.sh`)
- `.tmp/GATE-FIX-gate-preflight-fence-rearm/**`
- Cross-link disposition to `GATE-FIX-drill-fence-precondition.md`, `GATE-FIX-zero-loss-t-sync-013.md`, and `GATE-FIX-fence-lift.md`
- **Does not** re-implement five write-surface probe product logic in drill
- **Does not** invent a second fence mechanism beyond `HOLO_MIGRATION_READ_ONLY`
- **Does not** ad-hoc regex-rewrite `secrets.yaml` (known corruption shape `HOLO_MIGRATION_READ_ONLY: "1""`)
- **Does not** weaken step5 `POST_PONR_INELIGIBLE` oracle after real step4

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY — preflight re-arm)** GIVEN a gate start after prior enable-writes left durable `HOLO_MIGRATION_READ_ONLY: "0"` WHEN `scripts/run-sprint30-human-gate.sh` preflight runs with default env (like `HOLO_GATE_RESET_LEDGER`) THEN it **MUST** invoke `scripts/rearm-sprint30-cutover-control-plane.sh` (or equivalent that only calls that script / its worker) so durable fence becomes `'1'` via `writeDurableMigrationReadOnly`. Default ON via `HOLO_GATE_REARM_FENCE` (or equivalently always-on unless explicit opt-out `=0`). **NEVER** ad-hoc `sed`/`re.sub` rewrite of secrets.yaml.

- [ ] **AC-2 (live serving 423 oracle)** GIVEN re-arm completed WHEN preflight proves the **serving process** (not only CLI `isMigrationReadOnly`) THEN against `HOLO_VERIFY_BASE_URL` it MUST:
  1. GET `/health` succeeds (base alive; tip-bind still enforced separately), and
  2. a **real write probe** (e.g. `POST /api/documents` or existing gate write surface) returns **HTTP 423** with body proving `migration_read_only` (`code` and/or `error` fields).
  CLI-only fence read without live 423 is **NOT** closed. Evidence: durable line shape + live response status/body JSON under `.tmp/GATE-FIX-gate-preflight-fence-rearm/`.

- [ ] **AC-3 (optional soak plane restore — no second fence)** GIVEN residual durable `HOLO_DATA_PLANE=convex` (prior repoint/drill) WHEN preflight restores pre-PONR soak labels THEN it MUST use the existing rearm path (`--plane postgres --target postgres-soak` or documented soak labels only) — **not** a second fence mechanism. Document expectations:
  - pre-PONR soak: fence armed `'1'`; data plane typically `postgres` + soak target (e.g. `postgres-soak`) so step1 drill can repoint **to** convex
  - step1 drill owns the convex repoint during soak
  - step4 enable-writes still lifts fence for real PONR
  Opt-out via explicit env (e.g. `HOLO_GATE_RESTORE_SOAK_PLANE=0`) when operator intentionally starts already-on-plane.

- [ ] **AC-4 (deterministic pre-PONR PONR clear for step1)** GIVEN residual `data_plane_ponr` (including sentinel `write_row_id=…aaaaaaaaaaaa`) WHEN ledger dual-reset + clear runs THEN post-clear proof MUST show **zero** PONR rows via the **same resolution path** as `readDataPlanePonr` / `cutover:rollback-repoint` (platform `resolveDatabaseUrl({ preferHolocron: true })` or equivalent), not psql-only against a possibly different scraped `DATABASE_URL`. Step1 child repoint MUST NOT refuse with `POST_PONR_INELIGIBLE` from **preflight residue**. Fail closed if dual-path counts disagree.

- [ ] **AC-5 (ledger dual-reset still zero-loss for step1/2)** GIVEN preflight ledger dual-reset (Postgres + file) WHEN fence is armed so drill does not accept writes THEN step1 may green with `lost_accepted_writes=0` / `ok:true` (once product sibling also closed if needed) and step2 may observe `accepted_count=0`. Preflight alone must not leave accepted audit rows; re-arm prevents the residual class that produced `accepted_count=2` on `20260808T011038Z`.

- [ ] **AC-6 (step5 oracle preserved)** GIVEN real step4 `cutover:enable-writes` records PONR WHEN step5 `cutover:rollback-repoint` runs THEN it MUST still exit 2 with `POST_PONR_INELIGIBLE` + `"repointed": false`. Preflight clear must **not** weaken or skip the real post-PONR refuse path. Only **after** real step4 does POST_PONR become the pass oracle.

- [ ] **AC-7 (RED + evidence + branch)** Capture RED baseline from run `20260808T011038Z` (step1 `fence_armed=false` / DRILL_WRITE_SURFACES_NOT_BLOCKED; step2 accepted_count=2). GREEN evidence under `.tmp/GATE-FIX-gate-preflight-fence-rearm/` with real transcripts (durable shape, live 423 body, preflight JSON, optional step1 green path). Implementer branch; merge only after dual-lens APPROVED (orchestrator-only). Fresh gate package after land when packaging for closeout.

- [ ] **AC-8 (sibling boundary)** Cross-link mastra sibling task `GATE-FIX-drill-fence-precondition` for **in-process drill fail-closed before probes** without duplicating five-surface product probe ACs here. This task’s fakeability floor is **gate preflight/control-plane**: durable value shape + live 423 + clean pre-PONR residue — path-only “rearm script exists” is **NOT** enough.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Gate preflight calls rearm script by default; opt-out `HOLO_GATE_REARM_FENCE=0` skips with explicit log | AC-1 | `ac1-preflight-rearm-wired.*` |
| TC-2 | After rearm, durable secrets line is exactly `HOLO_MIGRATION_READ_ONLY: "1"` (or bare `1`); no `"1""` corruption | AC-1 | `ac1-durable-fence-shape.json` |
| TC-3 | Live write probe to `HOLO_VERIFY_BASE_URL` returns HTTP 423 + `migration_read_only` body | AC-2 | `ac2-live-423-body.json` |
| TC-4 | `/health` base alive before write probe; tip-bind still enforced | AC-2 | `ac2-health-and-423.*` |
| TC-5 | Optional plane restore sets `HOLO_DATA_PLANE=postgres` (+ soak target) via rearm `--plane/--target` only | AC-3 | `ac3-soak-plane-restore.json` |
| TC-6 | Post-clear `readDataPlanePonr` path returns null / count 0; matches reset proof | AC-4 | `ac4-ponr-dual-path-clear.json` |
| TC-7 | Synthetic residual sentinel PONR (`…aaaaaaaaaaaa`) is cleared before step1; step1 repoint not POST_PONR from residue | AC-4 | `ac4-sentinel-ponr-cleared.*` |
| TC-8 | Disarmed durable residual RED class (20260808T011038Z) no longer reachable under default preflight | AC-5 / AC-7 | `ac7-red-baseline.*` + green preflight |
| TC-9 | After real step4, step5 still POST_PONR_INELIGIBLE (not weakened) | AC-6 | `ac6-step5-post-ponr-oracle.*` |
| TC-10 | Static audit: no ad-hoc secrets regex rewrite; rearm uses writeDurable* only | AC-1 | `ac1-no-regex-rewrite-static.md` |
| TC-11 | Path-only “script exists” fixture fails fakeability floor without live 423 + durable shape | AC-8 | `ac8-fakeability-floor.*` |
| TC-12 | Sibling cross-link documented; no product five-surface ACs claimed closed by this task alone | AC-8 | `ac8-sibling-boundary.md` |

## Anti-stub

- Path-only “`rearm-sprint30-cutover-control-plane.sh` exists” is **NOT** closed.
- Exporting `HOLO_MIGRATION_READ_ONLY=1` in the gate shell only (without durable write) is **NOT** closed.
- CLI `isMigrationReadOnly()===true` without live HTTP **423** `migration_read_only` body against `HOLO_VERIFY_BASE_URL` is **NOT** closed.
- Ad-hoc `sed` / `re.sub` on `secrets.yaml` (produces `HOLO_MIGRATION_READ_ONLY: "1""`) is **FORBIDDEN** and **NOT** a fix.
- `ponr_cleared: true` from psql-only while `readDataPlanePonr` still sees a row is **NOT** closed.
- Claiming step1 green solely because step4/5 passed on a partial gate is **NOT** closed.
- Inventing a second fence env/key beyond `HOLO_MIGRATION_READ_ONLY` is **NOT** allowed.
- Weakening step5 to accept repoint after real PONR is **NOT** allowed.
- Hand-edited gate logs / synthetic `ok:true` drill reports without real preflight + live server are **NOT** proof.
- Closing five write-surface **product** fail-closed under this task ID alone is **out of scope** (`GATE-FIX-drill-fence-precondition`).

## Critical Constraints

- **MUST** re-arm durable fence in gate preflight via existing rearm script / `writeDurableMigrationReadOnly` (default ON, opt-out explicit)
- **MUST** prove live serving 423 `migration_read_only` against `HOLO_VERIFY_BASE_URL` before step1
- **MUST** use platform PONR read path for post-clear proof (same as repoint latch)
- **MUST** preserve ledger dual-reset + real step5 POST_PONR after real step4
- **MUST** keep tip-bind (`sourceRevision` == HEAD) and RH-S30-07/08 packaging behavior
- **MUST** red_first from `20260808T011038Z`; evidence under `.tmp/GATE-FIX-gate-preflight-fence-rearm/`
- **MUST** implementer branch; merge only after dual-lens APPROVED (orchestrator-only)
- **NEVER** ad-hoc regex rewrite of secrets.yaml
- **NEVER** invent a second fence mechanism
- **NEVER** weaken CAP-CUT-01 PONR immutability / step5 oracle
- **STRICTLY** this task = gate/control-plane preflight; sibling mastra owns in-process drill fail-closed before probes
- **STRICTLY** fakeability floor: durable shape + live 423 body + clean pre-PONR residue (+ step1 ok path once green)

## Evidence

`.tmp/GATE-FIX-gate-preflight-fence-rearm/`

| Artifact | Proves |
|----------|--------|
| `red-20260808T011038Z-summary.json` | AC-7 RED pointer |
| `red-20260808T011038Z-step1-fence-disarmed.json` (or copy/pointer to gate evidence) | AC-7 RED: `fence_armed=false`, surfaces accepted |
| `red-20260808T011038Z-step2-accepted-count.json` | AC-7 RED: accepted_count=2 / lost_accepted_writes=1 |
| `ac1-preflight-rearm-wired.*` | AC-1 rearm invocation |
| `ac1-durable-fence-shape.json` | AC-1 durable `"1"` shape; no doubled quotes |
| `ac1-no-regex-rewrite-static.md` | TC-10 static |
| `ac2-live-423-body.json` | AC-2 live write 423 + body |
| `ac2-health-and-423.*` | AC-2 health + write |
| `ac3-soak-plane-restore.json` | AC-3 plane/target labels |
| `ac4-ponr-dual-path-clear.json` | AC-4 platform-path clear proof |
| `ac4-sentinel-ponr-cleared.*` | AC-4 sentinel residue class |
| `ac6-step5-post-ponr-oracle.*` | AC-6 step5 still refuses after real step4 |
| `ac7-red-baseline.*` + `ac7-green-preflight.*` | AC-7 RED→GREEN |
| `ac8-fakeability-floor.*` + `ac8-sibling-boundary.md` | AC-8 |
| Optional `step1-green-transcript.*` | End-to-end step1 ok once sibling+preflight green |

**Red-first seed (recorded external):**

- Run id: `20260808T011038Z`
- HEAD: `54299bfc76fec6fc52468dae451ca293a6f104c4`
- Path: `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/`
- Step1 error: `DRILL_WRITE_SURFACES_NOT_BLOCKED` / `fence_armed=false`; app 201, mcp 200, job.ok, mission not rejected
- Step1 repoint residue: `POST_PONR_INELIGIBLE` `ponr_id=585ecd45-65ed-43b3-875d-eed092697bbb` `write_row_id=00000000-0000-4000-8000-aaaaaaaaaaaa`
- Preflight claimed: `ponr_cleared: true`, `ponr_count: 0` while step1 still saw PONR — dual-path clear hole

## Reading List

- Gate evidence RED: `.gate-evidence/20260808T011038Z/step1.log`, `step2.log`, `preflight-ledger-reset.json`, `gate-results.json`
- `scripts/run-sprint30-human-gate.sh:88-102` — ledger dual-reset only; **missing fence re-arm**
- `scripts/rearm-sprint30-cutover-control-plane.sh` + `scripts/lib/rearm-sprint30-cutover-control-plane.ts` — safe upsert path (use this)
- `scripts/reset-sprint30-gate-ledger.sh` — Postgres+file ledger + optional PONR truncate (extend proof path if needed)
- `services/platform/src/cutover/soak-fence.ts` — `isMigrationReadOnly` / `writeDurableMigrationReadOnly` / data-plane keys
- `services/platform/src/cutover/rollback-drill.ts` — `DRILL_WRITE_SURFACES_NOT_BLOCKED` / `fence_armed=${isMigrationReadOnly()}`
- `services/platform/src/cutover/rollback-repoint.ts` + `ponr.ts` `readDataPlanePonr` — PONR latch sole source of truth
- `GATE-FIX-fence-lift.md` — durable lift disarm (preserve; this task is re-arm for pre-step1 soak)
- `GATE-FIX-drill-fence-precondition.md` — product sibling
- `GATE-FIX-zero-loss-t-sync-013.md` — oracle sibling
- `gate-plan.json` steps 1–5 oracles (step1 expected ok/repointed/lost=0; step5 expected_exit=2 POST_PONR)

## Design

### Pattern (chosen)

Extend `scripts/run-sprint30-human-gate.sh` preflight **after** (or tightly around) ledger dual-reset, default-ON:

```
1) HOLO_GATE_RESET_LEDGER (existing): dual-reset post_export_write_audit + clear PONR
2) Prove PONR empty via platform readDataPlanePonr path (same DB as repoint); fail closed on mismatch vs psql
3) HOLO_GATE_REARM_FENCE (new, default 1):
     bash scripts/rearm-sprint30-cutover-control-plane.sh --fence 1
       [--plane postgres --target postgres-soak]  # when HOLO_GATE_RESTORE_SOAK_PLANE=1 (default ON recommended)
4) Live oracle:
     curl /health  (must be up)
     real write POST → expect 423 + migration_read_only body
     record durable fence line shape + rearm JSON + probe JSON under EVID_DIR + .tmp/GATE-FIX-...
5) Proceed to tip-bind + steps 1–5 unchanged in oracle semantics
```

**Env contract (document in gate runner header):**

| Env | Default | Meaning |
|-----|---------|---------|
| `HOLO_GATE_RESET_LEDGER` | `1` | dual-reset ledger + clear PONR (existing) |
| `HOLO_GATE_CLEAR_PONR` | `1` with reset | clear `data_plane_ponr` for clean step4 (existing) |
| `HOLO_GATE_REARM_FENCE` | `1` | **NEW** call rearm script to durable `'1'` |
| `HOLO_GATE_RESTORE_SOAK_PLANE` | `1` (recommended) | rearm also `--plane postgres --target postgres-soak` |
| `HOLO_VERIFY_BASE_URL` | required | live tip-bind + 423 write probe |

**PONR dual-path note:** if `reset-sprint30-gate-ledger.sh` clears via scraped `DATABASE_URL` but `readDataPlanePonr` uses `preferHolocron: true` and they diverge, preflight MUST fail closed until both show empty — fix resolution so clear and proof share one authoritative URL (prefer platform resolve used by repoint).

**Data-plane expectations (document only; no second fence):**

- Pre-PONR soak entry: fence `'1'`, typically `HOLO_DATA_PLANE=postgres`, `HOLO_ROLLBACK_TARGET`/`target` soak label (`postgres-soak`) so step1 drill can repoint **to** convex-frozen.
- Step1 drill: Sev-1 + five surfaces blocked + real repoint CLI → convex content probe.
- Step4: enable-writes lifts fence + records PONR.
- Step5: repoint refuses `POST_PONR_INELIGIBLE` only after that real PONR.

### Anti-pattern

- Regex rewrite secrets to force `"1"` / `"0"`.
- Env-only re-arm without durable write.
- Trusting `preflight-ledger-reset.json` `ponr_count` from psql alone while product latch still holds a row.
- Skipping live 423 “because CLI says armed”.
- Claiming product five-surface drill probes closed under this task alone.

## Disposition

Release-blocking human-gate partial: step1 cannot prove UC-SYNC-04 rollback drill under soak when durable fence remains disarmed from prior enable-writes and preflight never re-arms. Close by wiring **safe rearm + live 423 serving oracle + dual-path pre-PONR clear** into the gate runner. Step5 real POST_PONR oracle after step4 is preserved. Product in-process drill fail-closed is sibling `GATE-FIX-drill-fence-precondition`. Sprint 30 remains **In Progress** until dual-lens APPROVED on a landed SHA with green step1 under armed fence and zero-loss ledger.

AGENT: implementer=devops-engineer | proposed_by=devops-engineer | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T02:00:00Z
finding_ids: [GATE-FIX-gate-preflight-fence-rearm, DRILL_WRITE_SURFACES_NOT_BLOCKED, 20260808T011038Z, GATE-FIX-fence-lift]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-gate-preflight-fence-rearm",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "devops-engineer",
  "agent": "devops-engineer",
  "technical_reviewer": "code-reviewer",
  "standing_test_reality": "test-quality-reviewer",
  "touches_capabilities": ["CAP-CUT-01"],
  "siblings": [
    "GATE-FIX-drill-fence-precondition",
    "GATE-FIX-zero-loss-t-sync-013"
  ],
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "env_defaults": {
    "HOLO_GATE_RESET_LEDGER": "1",
    "HOLO_GATE_REARM_FENCE": "1",
    "HOLO_GATE_RESTORE_SOAK_PLANE": "1"
  },
  "forbidden": [
    "ad-hoc regex rewrite of secrets.yaml",
    "second fence mechanism beyond HOLO_MIGRATION_READ_ONLY",
    "CLI-only fence proof without live HTTP 423 migration_read_only",
    "psql-only ponr_cleared without readDataPlanePonr path proof",
    "weakening step5 POST_PONR_INELIGIBLE after real step4"
  ],
  "fixtures": {
    "red_gate_20260808T011038Z": {
      "description": "partial 3/5 @ 54299bfc; step1 fence_armed=false DRILL_WRITE_SURFACES_NOT_BLOCKED; step2 accepted_count=2; residual POST_PONR on step1 repoint despite preflight ponr_count=0",
      "seed_method": "recorded_external",
      "path": ".spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/"
    },
    "durable_fence_disarmed_after_enable_writes": {
      "description": "HOLO_MIGRATION_READ_ONLY durable 0 residue; rearm must restore quoted 1 without doubled quotes",
      "seed_method": "cli+secrets"
    },
    "sentinel_ponr_aaaaaaaaaaaa": {
      "description": "residual data_plane_ponr write_row_id 00000000-0000-4000-8000-aaaaaaaaaaaa must be cleared on platform path before step1",
      "seed_method": "recorded_external+cli_real_postgres"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "Gate preflight default-ON re-arms durable fence via existing rearm script / writeDurableMigrationReadOnly; never ad-hoc regex", "verify": "ac1-preflight-rearm-wired + ac1-durable-fence-shape"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "Live serving write probe on HOLO_VERIFY_BASE_URL returns HTTP 423 migration_read_only after re-arm; health base up", "verify": "ac2-live-423-body.json"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "Optional restore HOLO_DATA_PLANE=postgres + soak target via rearm --plane/--target only; document pre-PONR soak expectations", "verify": "ac3-soak-plane-restore.json"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "PONR clear proven empty on readDataPlanePonr path; step1 not POST_PONR_INELIGIBLE from residue", "verify": "ac4-ponr-dual-path-clear.json"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "Ledger dual-reset + armed fence leave zero-loss path for step1/2 (no accepted writes from disarmed residue class)", "verify": "ac7-green-preflight + step2 class"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "Step5 POST_PONR_INELIGIBLE only after real step4; preflight does not weaken", "verify": "ac6-step5-post-ponr-oracle"},
    {"id": "AC-7", "type": "acceptance_criterion", "description": "RED from 20260808T011038Z + GREEN evidence under .tmp/GATE-FIX-gate-preflight-fence-rearm/; branch discipline", "verify": "ac7-*"},
    {"id": "AC-8", "type": "acceptance_criterion", "description": "Sibling mastra boundary; fakeability floor durable+live423 not path-only script exists", "verify": "ac8-*"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Default rearm wired; opt-out skips", "verify": "ac1-preflight-rearm-wired"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Durable fence shape quoted 1 no corruption", "verify": "ac1-durable-fence-shape"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Live 423 body", "verify": "ac2-live-423-body"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Health + 423", "verify": "ac2-health-and-423"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Soak plane restore via rearm", "verify": "ac3-soak-plane-restore"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Dual-path PONR clear", "verify": "ac4-ponr-dual-path-clear"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Sentinel PONR cleared", "verify": "ac4-sentinel-ponr-cleared"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "RED disarmed class not reachable under default preflight", "verify": "ac7"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "Step5 oracle preserved", "verify": "ac6"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static no regex rewrite", "verify": "ac1-no-regex-rewrite-static"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "Fakeability floor", "verify": "ac8-fakeability-floor"},
    {"id": "TC-12", "type": "test_criterion", "maps_to_ac": "AC-8", "description": "Sibling boundary", "verify": "ac8-sibling-boundary"}
  ]
}
-->
