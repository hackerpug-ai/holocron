# GATE-FIX-005 — Gate step 3b must bounded-poll for a real committed plan probe before advance
> Status: ⬜ Pending
> Sprint: [Sprint 23](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer
> Estimate: 45 min
> Type: CONFIG
> Priority: P0
> Proposed By: dual-lens adjudication (GATE-FIX-003 AC-4 residual after land `be7d52ac` / main `f135f2b6`)
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome
Step 3 of `gate-plan.json` **does not** advance the research arm (3b) immediately after create. Between research create and the 3b `advance→validated` POST, the step runs a **bounded poll loop** that observes a **real** committed `research.plan@1` stage for that run (the same predicate as `enforce_mission_human_gate` in migration 0027), logs an explicit **probe-ready marker**, and only then posts 3b. On timeout with no committed plan probe: log a fail-closed marker and **`exit 1`** (no 3b attempt that could greenwash via luck). Scope is gate-plan + evidence only — no product source, no migrations, no DB inserts of probes/stage_runs.

## Evidence (immutable residual)
- GATE-FIX-003 AC-4 (task lines 27, 70–74, 97) **MUST** poll/wait until a real committed plan probe exists before 3b; create-then-immediate-advance is called out as insufficient
- Landed step 3 on `be7d52ac` / `f135f2b6` creates research then immediately POSTs 3b advance — **no** `while`/`sleep`/timeout poll, **no** `STEP3_PROBE_READY` (or equivalent) log line
- Live create responses may already show `checkpointStageIndex=4` / plan stages committed (fast local fleet) — that luck **must not** substitute for an explicit poll + marker; slow/reseeded fleets still need the bound
- Trigger truth (do not reimplement in product — observe only):
  ```sql
  -- from public.enforce_mission_human_gate (0027)
  EXISTS (
    SELECT 1 FROM public.mission_stage_runs AS stage_run
    WHERE stage_run.run_id = NEW.run_id
      AND stage_run.stage_kind = 'research.plan@1'
      AND stage_run.status = 'committed'
  )
  ```
- Preserve `.gate-evidence/20260723T061322Z/**` and prior GATE-FIX-003/004 evidence

## Critical Constraints
### MUST
- MUST insert a **bounded poll** between research create (`RUN_CYCLE`) and the 3b advance POST in step 3 `literal_cmd` only (arm 3a unprobed echo path unchanged)
- MUST poll using **real service/CLI surfaces** already shipped:
  1. **Status API (required each iteration):** `GET http://127.0.0.1:4111/api/missions/${RUN_CYCLE}` with `Authorization: Bearer rn-gate-s23` — log a short status line (`POLL_STATUS=…` or status/ok fields); fail closed if create never yields a runId (existing) or status is persistently `MISSION_NOT_FOUND`
  2. **Probe-ready observation (required):** observe the trigger-equivalent predicate for that run — committed `research.plan@1` — via **read-only** real CLI against `holocron_nonprod` (SELECT only). Preferred:
     - `psql "$DATABASE_URL" -tAc "SELECT status FROM mission_stage_runs WHERE run_id='…' AND stage_kind='research.plan@1' LIMIT 1"`
     - or `bun services/platform/src/cli/holo.ts db:probe --raw "…"` if row output is machine-parseable in the implement environment
  - Rationale: `GET /api/missions/:id` today returns status/checkpoint/provenance but **does not** expose `mission_stage_runs`; product changes to widen GET are **out of scope**. Status GET remains the required API poll; ledger SELECT is observational only (no INSERT/UPDATE of probes)
- MUST log an explicit success marker only after probe is observed, **split-constructed** so it is not a contiguous substring of `literal_cmd` (mirror GATE-FIX-004 / step 2), e.g. `P1=STEP3_PROBE; P2=_READY; printf '%s%s\n' "$P1" "$P2"` → `STEP3_PROBE_READY`
- MUST bound the wait: wall-clock timeout (recommended **60s**, acceptable **45–90s**) and sleep interval (recommended **1–2s**); on timeout print a split fail marker (e.g. `NO_PROBE` + `_READY`) and **`exit 1` before** the 3b advance POST
- MUST keep GATE-FIX-003 reseed-safe creates and GATE-FIX-004 dual body claim + `STEP3_PROOF=refused_then_ok` + fail `exit 1` intact
- MUST keep auth `Bearer rn-gate-s23` and nonprod URLs consistent with landed steps 1/3/4/5
- MUST preserve historical evidence dirs

### NEVER
- NEVER change product source, handlers, migrations, or fleet product code
- NEVER `INSERT`/`UPDATE` probes, `mission_stage_runs`, or hand-seed stage rows to greenwash 3b
- NEVER treat create-response `checkpointStageIndex` alone as the probe-ready marker without the poll loop + logged marker
- NEVER treat `MISSION_NOT_FOUND` or timeout as dual-claim / probe-ready success
- NEVER delete or rewrite `.gate-evidence/20260723T061322Z/**`
- NEVER weaken step 3 success token self-match protections from GATE-FIX-004

### STRICTLY
- STRICTLY WRITE-ALLOWED: `gate-plan.json` (step 3 `literal_cmd` + `method_note` only; optional top-level method_note one-line mention of GATE-FIX-005), optional `GATE-RESULTS.md` notes, `.tmp/GATE-FIX-005/**` evidence
- STRICTLY WRITE-PROHIBITED: `services/**`, migrations, historical `.gate-evidence/**`, steps 1/2/4/5/6 unless a one-character shared hygiene is unavoidable (default: leave them alone)

## Specification
- **Objective:** Close GATE-FIX-003 AC-4 residual — explicit create → **poll/status + probe-ready** → 3b advance.
- **Success state:** Fresh step 3 log shows (1) research create with `runId`, (2) one or more `POLL_*` / status lines, (3) `STEP3_PROBE_READY` (split-constructed) only after committed `research.plan@1` observed, (4) then ARM_B advance; timeout path exits 1 with no false dual success.
- **Recommended step-3 shape (implementer may compress; must preserve order):**
  1. Create test.echo → `RUN_ECHO` (3a unprobed) — unchanged intent
  2. Create research → `RUN_CYCLE`
  3. Fail closed if either runId empty
  4. **Poll loop** until deadline:
     - `GET /api/missions/$RUN_CYCLE` (Bearer); echo compact status
     - Read-only SELECT/CLI: plan stage status for that `run_id`
     - If `committed`: print split `STEP3_PROBE_READY`; break
     - Else `sleep 1` (or 2)
  5. If marker not emitted: split `NO_PROBE_READY`; `exit 1`
  6. Arm A unprobed advance on `RUN_ECHO` (body `PROBE_REQUIRED_FOR_VALIDATED`)
  7. Arm B probed advance on `RUN_CYCLE` (body ok:true)
  8. Existing dual claim + split `STEP3_PROOF=refused_then_ok` / fail `NO_STEP3_DUAL` + exit 1
- **Env for ledger read:** `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod` (same nonprod ledger as step 5)

## Acceptance Criteria
### AC-1: Poll loop present before 3b [PRIMARY]
**GIVEN:** landed `gate-plan.json` step 3 after this task  
**WHEN:** `literal_cmd` is inspected  
**THEN:** between research create and the 3b advance POST there is a bounded loop (`while`/`until` or equivalent counted retry) with sleep and a wall-clock or iteration deadline; 3b advance is not the next statement after create alone  
**VERIFY:** `python3`/`rg` shows deadline + sleep + GET status + probe observation before the 3b `verdicts` curl that uses `RUN_CYCLE`  
**TEST_TIER:** integration · **FLOW_REF:** UC-SVC-05

### AC-2: Probe-ready marker only after real committed plan probe
**GIVEN:** fresh step 3 against live `:4111` + nonprod ledger  
**WHEN:** poll succeeds  
**THEN:** log contains split-constructed `STEP3_PROBE_READY` **and** preceding poll evidence that `research.plan@1` is `committed` for that runId (CLI SELECT/db:probe line or equivalent); marker is **not** printed solely from create JSON `checkpointStageIndex`  
**VERIFY:** `.tmp/GATE-FIX-005/step3.log` (or new gate-evidence) greps: create → POLL → `STEP3_PROBE_READY` → ARM_B; `re.search(r'STEP3_PROBE_READY', '# literal_cmd: '+cmd)` is False

### AC-3: Timeout fails closed (exit 1, no greenwash)
**GIVEN:** a simulated timeout (or real missing plan probe)  
**WHEN:** deadline elapses without committed plan  
**THEN:** process prints a non-self-matching fail marker and **`exit 1`** **before** posting 3b advance; dual success token is not emitted  
**VERIFY:** unit `bash -lc` of the fail branch returns exit 1; success token absent

### AC-4: GATE-FIX-003/004 invariants preserved
**GIVEN:** step 3 after this rewrite  
**WHEN:** AC checks from GATE-FIX-003 (no hard-coded vanished UUIDs; real creates) and GATE-FIX-004 (echo-only self-match false; dual body claim; fail exit 1) are re-run  
**THEN:** all still hold  
**VERIFY:** re-run those VERIFY snippets against the new `literal_cmd` / assertion

### AC-5: Scope + archive
**GIVEN:** the land commit  
**WHEN:** `git show --name-only`  
**THEN:** only write-allowed paths; `.gate-evidence/20260723T061322Z` still present  
**VERIFY:** path allowlist + `test -d` archive

## Test Criteria
| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Bounded poll before 3b | AC-1 | AC-1 VERIFY |
| TC-2 | STEP3_PROBE_READY after real committed plan | AC-2 | AC-2 VERIFY |
| TC-3 | Timeout exit 1 | AC-3 | AC-3 VERIFY |
| TC-4 | 003/004 invariants still hold | AC-4 | AC-4 VERIFY |
| TC-5 | Diff ⊆ writeAllowed; archive ok | AC-5 | AC-5 VERIFY |

## Guardrails
**WRITE-ALLOWED:** `gate-plan.json` (step 3 + optional top-level method_note); optional `GATE-RESULTS.md`; `.tmp/GATE-FIX-005/**`  
**WRITE-PROHIBITED:** `services/**`, migrations, historical `.gate-evidence/**`, product tests

## Agent Instructions
1. Edit only step 3 in `gate-plan.json` (literal_cmd + method_note). Keep steps 1/2/4/5/6 byte-stable unless a shared prefix is strictly required (prefer not).
2. Reuse existing create + dual-claim structure; **insert poll between research create and 3b**.
3. Status API every iteration; probe-ready = committed `research.plan@1` via **read-only** CLI; never INSERT stages.
4. Split-construct `STEP3_PROBE_READY` / timeout fail marker; do not leave the full success token contiguous in `literal_cmd`.
5. Default timeout 60s, sleep 1–2s; document exact values in method_note.
6. Fresh evidence under `.tmp/GATE-FIX-005/` with live service; do not claim pass without log of poll + marker + dual claim.
7. Dual-lens (code-reviewer + product-manager) before merge-to-main; no mid-QA product merges.

## Verification Gates
1. AC-1…AC-5 VERIFY  
2. `git diff --name-only` ⊆ writeAllowed  
3. No product/migration paths  
4. GATE-FIX-004 AC-1 (echo-only) still passes for `STEP3_PROOF=refused_then_ok` and new `STEP3_PROBE_READY`

## Dependencies
- depends_on: GATE-FIX-003, GATE-FIX-004 (landed on main at `f135f2b6`)
- blocks: honest human-gate re-pass for step 3 probe-gated advance under slow/reseed conditions
- related: residual of GATE-FIX-003 AC-4 only — does not reopen UUID discovery or step3 self-match

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-005",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s23_003_ac4_no_poll": {
      "description": "Landed step3 on f135f2b6 creates research then advances with no poll/marker",
      "seed_method": "file_artifact",
      "records": [".spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/gate-plan.json"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN step3 WHEN inspecting literal_cmd THEN bounded poll exists before 3b advance",
      "verify": "deadline+sleep+GET+probe observation before RUN_CYCLE verdicts advance",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+live_api",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["immediate advance after create", "no timeout", "stub", "empty"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [{
          "start_ref": "s23_003_ac4_no_poll",
          "action": { "actor": "operator", "steps": ["Inspect step3 literal_cmd order: create research, poll, then 3b"] },
          "end_state": {
            "must_observe": ["bounded poll", "GET /api/missions status", "probe-ready marker path"],
            "must_not_observe": ["3b advance as first post-create action with no poll"]
          }
        }]
      }
    },
    { "id": "AC-2", "type": "acceptance_criterion", "description": "STEP3_PROBE_READY only after committed research.plan@1", "verify": "fresh log order create→poll→marker→ARM_B" },
    { "id": "AC-3", "type": "acceptance_criterion", "description": "Timeout exit 1 before 3b", "verify": "bash fail branch exit 1" },
    { "id": "AC-4", "type": "acceptance_criterion", "description": "003/004 invariants preserved", "verify": "re-run prior VERIFY snippets" },
    { "id": "AC-5", "type": "acceptance_criterion", "description": "Scope + archive", "verify": "path allowlist + archive dir" },
    { "id": "TC-1", "type": "test_criterion", "description": "Poll before 3b", "maps_to_ac": "AC-1", "verify": "AC-1 VERIFY" },
    { "id": "TC-2", "type": "test_criterion", "description": "Probe-ready marker honest", "maps_to_ac": "AC-2", "verify": "AC-2 VERIFY" },
    { "id": "TC-3", "type": "test_criterion", "description": "Timeout fail closed", "maps_to_ac": "AC-3", "verify": "AC-3 VERIFY" },
    { "id": "TC-4", "type": "test_criterion", "description": "Prior fixes intact", "maps_to_ac": "AC-4", "verify": "AC-4 VERIFY" },
    { "id": "TC-5", "type": "test_criterion", "description": "Scope/archive", "maps_to_ac": "AC-5", "verify": "AC-5 VERIFY" }
  ]
}
-->
