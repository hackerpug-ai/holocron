# GATE-FIX-drill-fence-precondition — Fail-closed soak-fence precondition before five-surface probes (zero-loss poison)

> **Task ID:** GATE-FIX-drill-fence-precondition
> **Sprint:** [Sprint 30 — Cutover Rollback Drill and Data-Plane PONR](./SPRINT.md)
> **Agent:** `mastra-implementer`
> **Priority:** P0
> **Type:** FIX
> **Severity:** CRITICAL
> **Source finding:** Human-gate partial 3/5 — step1 `DRILL_WRITE_SURFACES_NOT_BLOCKED` + step2 zero-loss poison under disarmed fence
> **Source evidence:**
> - `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/gate-results.json`
> - `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/step1.log`
> - `.spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/20260808T011038Z/step2.log`
> **Reviewed HEAD / deployed sourceRevision:** `54299bfc76fec6fc52468dae451ca293a6f104c4`
> **Proposed by:** `mastra-planner`
> **TDD:** red_first · RED_GREEN_REQUIRED=yes · seeded_evidence=yes
> **Status:** Backlog (plan-only — do not implement until dispatch)
> **Branch:** implementer task branch; plan-only on main via orchestrator; unreviewed NEVER merges; merge only after dual-lens APPROVED via `kb-orchestrate` `references/merge-to-main.sh` (orchestrator-only)
> **Siblings:** `GATE-FIX-gate-preflight-fence-rearm` (devops preflight re-arm) · `GATE-FIX-zero-loss-t-sync-013` (security identity oracles)

## Finding

**Human gate `20260808T011038Z` against reviewed/deployed HEAD `54299bfc…` verdict partial 3/5.** Severity: **CRITICAL**. Confidence: **HIGH**.

### What works (preserve)

- Steps **3–5 PASS** on the same run: pin/boot, `cutover:enable-writes` PONR, post-PONR `POST_PONR_INELIGIBLE` (do **not** weaken).
- Fence **wiring when armed** is real:
  - Hono `createSoakFenceMiddleware` on `/api/*` → HTTP **423** + `code: migration_read_only` (`soak-fence.ts`, mounted in `hono-app.ts`)
  - MCP `assertMcpWritable` in executor
  - Job `runJob` re-checks `isMigrationReadOnly`
  - Mission `publishDocumentForRun` re-checks fence
- `allFiveBlocked` oracle is already strict (app 423+code, mcp rejected, upload 423, job `migration_read_only:` prefix, mission rejected) — **do not loosen**.
- Durable fence lift semantics from **GATE-FIX-fence-lift** preserved: durable explicit `'0'` wins over sticky env; durable `'1'` arms serving process via per-request re-read.
- Existing helper `scripts/rearm-sprint30-cutover-control-plane.sh` + `scripts/lib/rearm-sprint30-cutover-control-plane.ts` correctly write durable fence via `writeDurableMigrationReadOnly` (no regex rewrite).
- Integration suite already proves fenced five-surface block when secrets are intentionally armed (`sprint30-rollback-drill.test.ts` AC-2).

### What remains broken

1. **Durable fence left disarmed** after prior `cutover:enable-writes` / step4 (`HOLO_MIGRATION_READ_ONLY: "0"`).
2. **`scripts/run-sprint30-human-gate.sh` preflight** dual-resets ledger + optional clear PONR only — **never** re-arms soak fence (`rearm-sprint30-cutover-control-plane.sh` is never called). Owned primarily by sibling `GATE-FIX-gate-preflight-fence-rearm`.
3. **`runRollbackDrill` assumes fence is armed for soak.** It runs repoint then **unconditionally** `probeFiveWriteSurfaces` against the live base URL, and only *afterwards* reports `fence_armed=${isMigrationReadOnly()}` inside `DRILL_WRITE_SURFACES_NOT_BLOCKED`. It never fail-closes before probes and never calls `writeDurableMigrationReadOnly('1')` / freeze / rearm.
4. **Probe order + disarmed fence = production accepted writes.** With fence off, five-surface probes create **real** documents / job work and poison T-SYNC-013 zero-loss (`post_export_write_audit`).

### Concrete RED evidence — run `20260808T011038Z`

**Step 1 FAIL** — `cutover:rollback-drill --json` (`step1.log`):

```text
error.code = DRILL_WRITE_SURFACES_NOT_BLOCKED
message = Not all five write surfaces blocked under soak fence
  (fence_armed=false; app.status=201 mcp.rejected=false upload.status=404
   job.ok=true mission.rejected=false)
lost_accepted_writes = 1
probes.app    = HTTP 201 document id 145f82e5-567d-4fd6-b97d-ff9a9ab998e2
probes.mcp    = status 200 accepted store_document 5ef15d4b-2f27-451f-9a03-efee7d8d4b7a
probes.upload = 404 business error (NOT migration_read_only 423)
probes.job.ok = true
probes.mission.rejected = false
```

**Step 2 FAIL** — Postgres zero-loss oracle (`step2.log`):

```json
{
  "accepted_count": 2,
  "drill_lost_accepted_writes": 1,
  "drill_ok": false,
  "ledger": "postgres:post_export_write_audit"
}
```

**Upload 404 under disarmed fence is not a pass substitute** for 423 + `migration_read_only` under an armed fence.

## Root cause (proven — implement against this)

| Layer | Gap |
|-------|-----|
| Control plane | Durable `HOLO_MIGRATION_READ_ONLY="0"` after prior enable-writes |
| Gate preflight | Ledger/PONR reset only; **no re-arm** of soak fence (sibling GATE-FIX-gate-preflight-fence-rearm) |
| Drill product | `runRollbackDrill` probes live surfaces without fail-closed fence precondition (**this task**) |
| Zero-loss | Disarmed probes mint real accepted writes → step2 `accepted_count>0` (sibling GATE-FIX-zero-loss-t-sync-013 oracles) |

This is **not** missing middleware. Middleware works when armed. The drill path must **refuse to probe** so disarmed soak cannot poison the ledger even if gate preflight is skipped.

## Design (product-primary)

### Option A (REQUIRED) — fail-closed fence precondition inside `runRollbackDrill`

Before **any** call to `probeFiveWriteSurfaces` (and before any other live write-minting probe path):

1. Read durable + env via existing `isMigrationReadOnly()` / `readDurableMigrationReadOnly()`.
2. Optionally (recommended) prove **live serving** is armed with a **non-mutating** or **expect-reject** preflight (e.g. dry POST that must 423) — **must not accept writes**.
3. If durable/live fence is **not** armed → compose report:
   - `ok: false`
   - `error.code = DRILL_FENCE_NOT_ARMED` (preferred distinct code; may strengthen message on `DRILL_WRITE_SURFACES_NOT_BLOCKED` **only if** probes were never executed)
   - `probes.*.executed === false` for all five surfaces (or probes omitted / empty)
   - **NEVER** call `probeFiveWriteSurfaces`
   - `lost_accepted_writes` must not increase because of this drill invocation
4. If armed → run existing five-surface probes; `allFiveBlocked` remains the green path for soak.

### Option B (secondary — gate sibling owns primary wire)

Gate preflight re-arm is **owned by** `GATE-FIX-gate-preflight-fence-rearm`. This task may add a defensive note / optional env for tests, but must not leave product safety dependent solely on gate preflight.

### Option C (REQUIRED proof) — live 423 after durable re-arm

After durable write to `'1'`, prove the **live serving process** (not only CLI `isMigrationReadOnly()`) returns HTTP **423** + body `code: migration_read_only` on a real mutating `/api/*` route. Relies on per-request re-read (GATE-FIX-fence-lift / R2-C01 arm path).

### Explicit non-goals

- Do **not** auto-accept writes under disarmed fence and “count them later.”
- Do **not** treat upload **404** as blocked.
- Do **not** weaken `POST_PONR_INELIGIBLE`, enable-writes, or `allFiveBlocked`.
- Do **not** invent green zero-loss by file-only audit tricks; Postgres ledger remains authoritative.

## Agent selection (justification)

**Implementer = `mastra-implementer`** (platform cutover domain):

- Primary defect is product drill orchestration in `services/platform/src/cutover/rollback-drill.ts` and its tests under `services/platform/tests/integration/`.
- Gate re-arm wiring is owned by sibling devops task; this task is the fail-closed safety net when any caller forgets preflight re-arm.

`proposed_by` remains **`mastra-planner`**.

## Scope (WRITE-ALLOWED)

- `services/platform/src/cutover/rollback-drill.ts` — fail-closed fence precondition; new error code; never probe when disarmed
- `services/platform/tests/integration/sprint30-rollback-drill.test.ts` (and/or new focused integration file under `services/platform/tests/integration/`) — RED→GREEN for precondition + live 423 + no ledger mint
- Optional small export of precondition helper if needed for tests (same cutover module)
- `.tmp/GATE-FIX-drill-fence-precondition/**` — RED/GREEN evidence
- Cross-link `GATE-FIX-fence-lift.md`, `GATE-FIX-gate-preflight-fence-rearm.md`, `GATE-FIX-zero-loss-t-sync-013.md`
- **Does not** rewrite `allFiveBlocked` success semantics to accept 404
- **Does not** weaken enable-writes / POST_PONR_INELIGIBLE
- **Does not** invent gate pass evidence; **does not** regex-rewrite secrets.yaml (use existing rearm worker)
- **Does not** own gate runner preflight re-arm (sibling) or step2 identity oracle consumers (sibling)

## Acceptance Criteria

- [ ] **AC-1 (PRIMARY)** GIVEN durable and/or live soak fence is **disarmed** (`HOLO_MIGRATION_READ_ONLY` not armed) WHEN `runRollbackDrill` would otherwise probe five write surfaces THEN it **fail-closes before any `probeFiveWriteSurfaces` execution** with distinct `error.code = DRILL_FENCE_NOT_ARMED` (or equivalent distinct precondition code), `ok:false`, and **all five** `probes.*.executed === false` (no live mutating probe ran). GIVEN the RED baseline shape of `20260808T011038Z` (disarmed live server) WHEN the fixed drill is invoked THEN it MUST NOT create HTTP 201 documents or MCP-accepted `store_document` rows as a side effect of the drill.

- [ ] **AC-2** GIVEN durable fence re-armed to `'1'` via `writeDurableMigrationReadOnly('1')` / `rearm-sprint30-cutover-control-plane.sh --fence 1` WHEN a live serving process re-reads control plane on the next request THEN a real mutating `POST /api/documents` (or equivalent `/api/*` write) returns HTTP **423** with body `code: 'migration_read_only'` (not only CLI-process `isMigrationReadOnly()===true`).

- [ ] **AC-3** GIVEN fence is armed and live serving blocks WHEN `probeFiveWriteSurfaces` / full drill soak path runs THEN `allFiveBlocked` remains strict:
  - app: status **423** + `body.code === 'migration_read_only'`
  - mcp: `rejected === true` (real `MIGRATION_READ_ONLY` / migration_read_only rejection)
  - upload: status **423** (not 404-as-pass)
  - job: `ok === false` and `error` starts with `migration_read_only:`
  - mission: `rejected === true`
  Upload **404** under any state is **not** a pass substitute for 423 under armed fence.

- [ ] **AC-4** GIVEN a clean dual-reset ledger (`accepted_count=0`) AND fence armed for soak WHEN drill runs the five-surface path THEN post-drill Postgres `post_export_write_audit` **accepted_count remains 0** and drill `lost_accepted_writes === 0` (or drill ok with independent recompute 0). GIVEN disarmed fence WHEN fixed drill fail-closes (AC-1) THEN ledger accepted_count is **unchanged** by the drill (no new identity rows from app/mcp probes).

- [ ] **AC-5** GIVEN steps 4–5 semantics WHEN fence is intentionally lifted by `cutover:enable-writes` THEN first accepted write + PONR still work; subsequent `cutover:rollback-repoint` still refuses with **`POST_PONR_INELIGIBLE`** (no regression of `20260808T011038Z` steps 4–5 PASS).

- [ ] **AC-6** RED baseline recorded from **real** `20260808T011038Z` step1/step2 logs (not invented): step1 `DRILL_WRITE_SURFACES_NOT_BLOCKED` with `fence_armed=false` + accepted app/mcp identities; step2 `accepted_count=2`. GREEN evidence under `.tmp/GATE-FIX-drill-fence-precondition/` after fix. Branch discipline: implementer task branch; merge only after dual-lens APPROVED.

## Test Criteria

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Disarmed durable fence → drill exits precondition fail **before** probes; no `probeFiveWriteSurfaces` network mint | AC-1 | `ac1-disarmed-precondition-fail.*` + static/order audit |
| TC-2 | Disarmed path leaves `probes.*.executed=false` and does not create app document / MCP document identities | AC-1, AC-4 | `ac1-no-minted-writes.*` + Postgres count delta |
| TC-3 | After durable re-arm `'1'`, live `POST /api/*` returns **423** + `code:migration_read_only` from **serving** process | AC-2 | `ac2-live-serving-423.*` |
| TC-4 | Armed fence: all five surfaces satisfy strict `allFiveBlocked` (app/mcp/upload/job/mission) | AC-3 | `ac3-all-five-blocked.*` |
| TC-5 | Upload 404 alone never counts as blocked/pass under soak oracle | AC-3 | `ac3-upload-404-not-pass.*` |
| TC-6 | Armed soak + clean ledger → post-drill `accepted_count=0` and `lost_accepted_writes=0` | AC-4 | `ac4-zero-loss-ledger.*` |
| TC-7 | enable-writes + post-PONR `POST_PONR_INELIGIBLE` still green (no weaken) | AC-5 | `ac5-ponr-ineligible-preserved.*` |
| TC-8 | RED baseline artifacts from `20260808T011038Z` step1/step2 under evidence dir | AC-6 | `red-20260808T011038Z-step{1,2}.*` |
| TC-9 | Static: `runRollbackDrill` has fence precondition **before** `probeFiveWriteSurfaces` call site | AC-1 | `ac1-static-call-order.md` |
| TC-10 | Error code is distinct `DRILL_FENCE_NOT_ARMED` when probes never ran | AC-1 | `ac1-error-code.*` |
| TC-11 | Existing integration fenced path remains green; full drill must not mint under disarmed | AC-3 | `sprint30-rollback-drill.test.ts` + new orchestrator cases |

## Anti-stub (fakeability floor)

- **NOT closed:** checking only CLI `isMigrationReadOnly()` while live server still accepts writes.
- **NOT closed:** running probes then failing with `DRILL_WRITE_SURFACES_NOT_BLOCKED` **after** HTTP 201 / MCP accept (current residual).
- **NOT closed:** counting “surfaces attempted” without identity: if any write is accepted, evidence MUST include document id / ledger row identity and the test MUST fail the zero-loss claim.
- **NOT closed:** treating upload **404** as migration_read_only block.
- **NOT closed:** success-path-only tests that never run with durable `'0'`.
- **NOT closed:** path-only / count-only oracles without real HTTP status+body code or real MCP rejection text.
- **NOT closed:** mocking Hono / fetch to fake 423 without a real serving process or disposable secrets path.
- **NOT closed:** hand-editing `post_export_write_audit` to force `accepted_count=0` without proving probes did not mint.
- **NOT closed:** regex-rewriting `secrets.yaml` for re-arm (must use existing `writeDurableMigrationReadOnly` / rearm worker).
- **NOT closed:** weakening `POST_PONR_INELIGIBLE` or enable-writes to green the gate.

## Critical Constraints

- **MUST** fail closed **before** `probeFiveWriteSurfaces` when fence is not armed (`DRILL_FENCE_NOT_ARMED`)
- **MUST** keep `allFiveBlocked` strict (423+code, mcp rejected, upload 423, job `migration_read_only:` prefix, mission rejected)
- **MUST** prove live serving HTTP **423** + `code: migration_read_only` after durable re-arm to `'1'`
- **MUST** preserve zero-loss: disarmed drill path mints **zero** accepted ledger rows
- **MUST** record RED from `20260808T011038Z` step1/step2 before GREEN
- **MUST** work on implementer task branch; merge only after dual-lens APPROVED (orchestrator-only)
- **MUST** redeploy so live `sourceRevision` matches fixed source before claiming human-gate green (RH-S30-07 / RH-S30-35 executable-HEAD)
- **NEVER** treat upload 404 as pass for soak block
- **NEVER** weaken `POST_PONR_INELIGIBLE` or enable-writes
- **NEVER** probe live write surfaces under known-disarmed fence
- **NEVER** invent gate pass evidence or hand-edit ledger to fake zero-loss
- **STRICTLY** red_first: copy/cite `20260808T011038Z` RED logs as baseline
- **STRICTLY** CAP-CUT-01 / UC-SYNC-04 zero-loss + soak fence integrity remain protected

## Evidence

`.tmp/GATE-FIX-drill-fence-precondition/`

| Artifact | Proves |
|----------|--------|
| `red-20260808T011038Z-summary.json` | AC-6 RED pointer |
| `red-20260808T011038Z-step1.log` (copy/link) | AC-6 RED: DRILL_WRITE_SURFACES_NOT_BLOCKED + minted ids |
| `red-20260808T011038Z-step2.log` (copy/link) | AC-6 RED: accepted_count=2 |
| `ac1-disarmed-precondition-fail.*` | AC-1 fail-closed code + no probe execution |
| `ac1-no-minted-writes.*` | AC-1/AC-4 ledger delta 0 |
| `ac1-static-call-order.md` | TC-9 call order |
| `ac1-error-code.*` | TC-10 `DRILL_FENCE_NOT_ARMED` |
| `ac2-live-serving-423.*` | AC-2 live process 423+code |
| `ac3-all-five-blocked.*` | AC-3 strict five-surface |
| `ac3-upload-404-not-pass.*` | TC-5 |
| `ac4-zero-loss-ledger.*` | AC-4 |
| `ac5-ponr-ineligible-preserved.*` | AC-5 |
| `green-integration-transcript.*` | Suite GREEN after fix |

## Reading List (file:line)

- RED step1 — `.gate-evidence/20260808T011038Z/step1.log` (`DRILL_WRITE_SURFACES_NOT_BLOCKED`, app 201 id `145f82e5-…`, mcp accept `5ef15d4b-…`)
- RED step2 — `.gate-evidence/20260808T011038Z/step2.log` (`accepted_count: 2`)
- Gate results — `.gate-evidence/20260808T011038Z/gate-results.json` (partial 3/5; sourceRevision matches HEAD `54299bfc…`)
- `services/platform/src/cutover/rollback-drill.ts:45-49` — existing drill error codes (add `DRILL_FENCE_NOT_ARMED`)
- `services/platform/src/cutover/rollback-drill.ts:333-451` — `probeFiveWriteSurfaces` (live write mint when unfenced)
- `services/platform/src/cutover/rollback-drill.ts:453-469` — `allFiveBlocked` (keep strict)
- `services/platform/src/cutover/rollback-drill.ts:638-708` — repoint-then-probes order; **no fence precondition**
- `services/platform/src/cutover/rollback-drill.ts:853-862` — post-hoc `DRILL_WRITE_SURFACES_NOT_BLOCKED` after probes already ran
- `services/platform/src/cutover/soak-fence.ts:8-14,112-119` — durable lift/arm resolution (GATE-FIX-fence-lift)
- `services/platform/src/cutover/soak-fence.ts:318-333` — `createSoakFenceMiddleware` 423 body
- `services/platform/src/http/hono-app.ts:200` — middleware mount
- `services/platform/src/mcp/executor.ts` — `assertMcpWritable`
- `services/platform/src/queue/jobs-runner.ts` — job fence checks
- `services/platform/src/mission/document-publish.ts:40` — mission fence
- `scripts/rearm-sprint30-cutover-control-plane.sh` — existing durable re-arm (sibling wires into gate)
- `GATE-FIX-fence-lift.md` — durable `'0'` disarm vs durable `'1'` arm (preserve)
- `GATE-FIX-gate-preflight-fence-rearm.md` — sibling gate preflight
- `GATE-FIX-zero-loss-t-sync-013.md` — sibling identity oracles

## Design

- **Pattern:** Fail-closed **precondition gate** at the start of the five-surface phase (before any mutating probe): durable/live fence must be armed or return `DRILL_FENCE_NOT_ARMED` with `probes.*.executed=false`. Armed path retains strict `allFiveBlocked`. Live 423 oracle proves serving process re-read after durable `'1'`. Zero-loss is proven by Postgres ledger delta, not self-certified report fields alone.
- **Anti-pattern:** Probe-first then report `fence_armed=false` after minting real documents; treat 404 as blocked; CLI-only fence check; ledger hand-edit; weaken PONR/enable-writes to paper over soak.

## Disposition

Release-blocking **CRITICAL** residual on reviewed HEAD `54299bfc…` / gate `20260808T011038Z`: soak fence is wired when armed, but drill allows **disarmed** five-surface probes that mint production accepted writes and break T-SYNC-013 zero-loss. Close by product fail-closed `DRILL_FENCE_NOT_ARMED` before probes + live 423 proof after re-arm + strict `allFiveBlocked` + ledger zero-loss. Preserve enable-writes + `POST_PONR_INELIGIBLE`. Gate preflight re-arm is sibling `GATE-FIX-gate-preflight-fence-rearm`. Sprint 30 remains **In Progress** until dual-lens APPROVED on a landed SHA with a fresh source-matching human gate package.

AGENT: implementer=mastra-implementer | proposed_by=mastra-planner | technical-reviewer=code-reviewer | standing-test-reality=test-quality-reviewer
planned_at: 2026-08-08T02:30:00Z
finding_ids: [GATE-FIX-drill-fence-precondition, 20260808T011038Z-step1, 20260808T011038Z-step2, GATE-FIX-fence-lift]

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-drill-fence-precondition",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "proposed_by": "mastra-planner",
  "agent": "mastra-implementer",
  "touches_capabilities": ["CAP-CUT-01", "UC-SYNC-04"],
  "siblings": [
    "GATE-FIX-gate-preflight-fence-rearm",
    "GATE-FIX-zero-loss-t-sync-013"
  ],
  "design_option": "A-fail-closed-fence-precondition-before-probes+C-live-423-after-durable-rearm",
  "branch_discipline": "implementer task branch; merge only after dual-lens APPROVED via kb-orchestrate references/merge-to-main.sh",
  "error_codes": {
    "new_or_required": ["DRILL_FENCE_NOT_ARMED"],
    "preserve": [
      "DRILL_WRITE_SURFACES_NOT_BLOCKED",
      "POST_PONR_INELIGIBLE",
      "POST_EXPORT_WRITE_ACCEPTED",
      "DRILL_INDEPENDENT_RECOMPUTE_MISMATCH"
    ]
  },
  "fixtures": {
    "red_gate_20260808T011038Z_step1_disarmed_probes_minted": {
      "description": "Live residual: fence_armed=false; app HTTP 201 id 145f82e5-567d-4fd6-b97d-ff9a9ab998e2; mcp accepted 5ef15d4b-2f27-451f-9a03-efee7d8d4b7a; upload 404; job.ok; mission not rejected; error DRILL_WRITE_SURFACES_NOT_BLOCKED; lost_accepted_writes=1",
      "seed_method": "recorded_external+gate_log"
    },
    "red_gate_20260808T011038Z_step2_zero_loss_poison": {
      "description": "Postgres post_export_write_audit accepted_count=2; drill_lost_accepted_writes=1; drill_ok=false",
      "seed_method": "recorded_external+gate_log"
    },
    "disposable_secrets_fence_disarmed": {
      "description": "Disposable HOLO_SECRETS_PATH with HOLO_MIGRATION_READ_ONLY=0; live serving under that secrets path",
      "seed_method": "cli_real_disposable_secrets+serving"
    },
    "disposable_secrets_fence_armed": {
      "description": "Disposable secrets HOLO_MIGRATION_READ_ONLY=1; prove live 423 on POST /api/documents and allFiveBlocked",
      "seed_method": "cli_real_disposable_secrets+serving"
    },
    "clean_postgres_post_export_write_audit": {
      "description": "Dual-reset ledger accepted_count=0 before drill; assert delta after fail-closed and after armed soak",
      "seed_method": "cli_real_postgres"
    }
  },
  "requirements": [
    {"id": "AC-1", "type": "acceptance_criterion", "description": "PRIMARY: runRollbackDrill fail-closes with DRILL_FENCE_NOT_ARMED before probeFiveWriteSurfaces when fence disarmed; no minted app/mcp writes", "verify": "ac1-disarmed-precondition-fail + ac1-no-minted-writes + ac1-static-call-order + ac1-error-code"},
    {"id": "AC-2", "type": "acceptance_criterion", "description": "After durable re-arm to 1, live serving returns HTTP 423 + code migration_read_only", "verify": "ac2-live-serving-423"},
    {"id": "AC-3", "type": "acceptance_criterion", "description": "allFiveBlocked remains strict; upload 404 is not a pass", "verify": "ac3-all-five-blocked + ac3-upload-404-not-pass"},
    {"id": "AC-4", "type": "acceptance_criterion", "description": "Zero-loss: armed soak + clean ledger stays accepted_count=0; disarmed fail-closed does not mint ledger rows", "verify": "ac4-zero-loss-ledger + ac1-no-minted-writes"},
    {"id": "AC-5", "type": "acceptance_criterion", "description": "enable-writes and POST_PONR_INELIGIBLE semantics preserved", "verify": "ac5-ponr-ineligible-preserved"},
    {"id": "AC-6", "type": "acceptance_criterion", "description": "RED baseline from 20260808T011038Z step1/step2; GREEN evidence under .tmp/GATE-FIX-drill-fence-precondition; branch discipline", "verify": "red-20260808T011038Z-step* + green-integration-transcript"},
    {"id": "TC-1", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Disarmed precondition fails before probes", "verify": "ac1-disarmed-precondition-fail"},
    {"id": "TC-2", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "No minted write identities when fail-closed", "verify": "ac1-no-minted-writes"},
    {"id": "TC-3", "type": "test_criterion", "maps_to_ac": "AC-2", "description": "Live serving 423 after durable re-arm", "verify": "ac2-live-serving-423"},
    {"id": "TC-4", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Strict allFiveBlocked under armed fence", "verify": "ac3-all-five-blocked"},
    {"id": "TC-5", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Upload 404 is not pass", "verify": "ac3-upload-404-not-pass"},
    {"id": "TC-6", "type": "test_criterion", "maps_to_ac": "AC-4", "description": "Postgres zero-loss after armed soak", "verify": "ac4-zero-loss-ledger"},
    {"id": "TC-7", "type": "test_criterion", "maps_to_ac": "AC-5", "description": "POST_PONR_INELIGIBLE preserved", "verify": "ac5-ponr-ineligible-preserved"},
    {"id": "TC-8", "type": "test_criterion", "maps_to_ac": "AC-6", "description": "RED baseline artifacts present", "verify": "red-20260808T011038Z-step1 + red-20260808T011038Z-step2"},
    {"id": "TC-9", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Static call order: fence precondition before probeFiveWriteSurfaces", "verify": "ac1-static-call-order"},
    {"id": "TC-10", "type": "test_criterion", "maps_to_ac": "AC-1", "description": "Distinct DRILL_FENCE_NOT_ARMED when probes never executed", "verify": "ac1-error-code"},
    {"id": "TC-11", "type": "test_criterion", "maps_to_ac": "AC-3", "description": "Existing fenced path remains green; full drill never mints under disarmed", "verify": "sprint30-rollback-drill.test.ts + new orchestrator cases"}
  ]
}
-->
