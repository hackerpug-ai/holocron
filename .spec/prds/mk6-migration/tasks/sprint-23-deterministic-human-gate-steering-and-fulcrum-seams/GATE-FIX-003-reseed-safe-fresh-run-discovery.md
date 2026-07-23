# GATE-FIX-003 — Gate steps 1/3/4/5 must create or discover fresh valid runs after nonprod reseed
> Status: ⬜ Pending
> Sprint: [Sprint 23](./SPRINT.md)
> Agent: devops-engineer
> Reviewer: code-reviewer
> Estimate: 90 min
> Type: CONFIG
> Priority: P0
> Proposed By: kb-run-human-tests (verified fail `20260723T061322Z`)
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome
`gate-plan.json` steps 1, 3, 4, and 5 no longer hard-code ledger UUIDs that vanish after mission-table truncate/reseed. Each step (or a shared setup prefix) **creates or discovers** fresh valid runs against the live `:4111` service + `holocron_nonprod` ledger so uncited-kill, probe-gated advance, steer, and `mission:cycle` are exercised for real. Historical evidence under `.gate-evidence/20260723T061322Z/**` and earlier archives is preserved.

## Evidence (immutable)
- Run: `20260723T061322Z` · verdict **fail** (verified, genuine)
- `gate-results.json` caveats[]: hard-coded `RUN_ECHO=019f8d2d-2ef7-711b-bb40-df20ab9f27e4` and `RUN_CYCLE=019f8d2e-00db-7eda-8ef3-51ee6cd81018` return **404 MISSION_NOT_FOUND** after nonprod reseed
- Steps 1, 3a/3b, 4, 5 failed (or only falsely passed) because fixtures were absent — not because product handlers regressed
- Note: historical `method_note` listed a separate `RUN_PROBE=019f8d2f-…` but step 3b `literal_cmd` actually used `RUN_CYCLE` — implementers should use a **two-run model** (unprobed echo + one research run for 3b/4/5), not revive three fixed UUIDs
- Do **not** rewrite/delete `.gate-evidence/20260723T061322Z/**` or earlier `.gate-evidence/**` archives

## Critical Constraints
### MUST
- MUST rewrite step 1, 3, 4, and 5 `literal_cmd` **and** top-level / per-step `method_note` so run IDs are produced at gate time via real `POST /api/missions` (or equivalent real CLI) — not baked UUIDs from a prior environment
- MUST ensure the unprobed run for steps 1/3a is a **test.echo** (or other template **without** a committed `research.plan@1` probe) so uncited kill and unprobed advance still hit the real handlers
- MUST ensure the probed/steer/cycle run for steps 3b/4/5 is a **research** (or evidence-research) run that can honestly support probe-gated advance, steer, and `mission:cycle`
- MUST, before step 3b advance, **poll/wait** (bounded) until a real committed plan probe exists for that research run — create-only then immediately advance is insufficient and will still return `PROBE_REQUIRED_FOR_VALIDATED` on the "probed" arm
- MUST keep assertions product-honest: real `UNCITED_KILL_REJECTED`, real probe refuse/accept, real `"eventType":"steer"` (prefer whitespace-tolerant if JSON is pretty-printed), real `"assayChallengeDistinct"\s*:\s*true` (GATE-FIX-001 already landed)
- MUST keep auth as real Bearer `rn-gate-s23` (or the env-configured gate key already used by the service) — no fake tokens
- MUST preserve historical evidence dirs
### NEVER
- NEVER change product source, handlers, migrations, or fleet product code
- NEVER reintroduce hard-coded run UUIDs that only exist on one laptop ledger snapshot
- NEVER DB hand-insert fake probes / stage_runs to greenwash 3b
- NEVER delete or rewrite `.gate-evidence/20260723T061322Z/**`
- NEVER treat `MISSION_NOT_FOUND` as success for any of steps 1/3/4/5
### STRICTLY
- STRICTLY WRITE-ALLOWED: `gate-plan.json` (steps 1/3/4/5 literal_cmd + method_note + shared setup if any; top-level method_note), optional `GATE-RESULTS.md` notes, `.tmp/GATE-FIX-003/**` evidence
- STRICTLY WRITE-PROHIBITED: `services/**`, migrations, historical `.gate-evidence/**`
- STRICTLY supersedes GATE-FIX-001 AC-2 ("step 5 literal_cmd unchanged") **only** for substituting the hard-coded UUID with a shell variable / discovered id; keep `holo.ts mission:cycle … --json` shape and whitespace-tolerant assay regex

## Specification
- **Objective:** Make steps 1/3/4/5 reseed-safe by creating/discovering fresh runs at gate time.
- **Success state:** Fresh human-gate re-run against a reseeded nonprod ledger exercises real handlers for steps 1, 3, 4, 5 (no 404 MISSION_NOT_FOUND on fixture IDs). Step 2/6 unchanged unless needed for shared setup hygiene.
- **Run model (recommended):**
  1. `RUN_ECHO` — `POST /api/missions` with `templateKey=test.echo`, unique goal/idempotencyKey → use for step 1 kill + step 3a unprobed advance
  2. `RUN_CYCLE` — `POST /api/missions` with `templateKey=research` (or evidence-research), unique goal/idempotencyKey → poll until plan probe committed → use for step 3b probed advance, step 4 steer, step 5 `mission:cycle`
- **Steer timing:** Prefer posting steer while the research run is still live/accepting control; if steer is refused solely because the run finished too fast, document and restructure create→steer ordering (still real API only) rather than weakening the assertion.

## Acceptance Criteria
### AC-1: No hard-coded vanished run UUIDs in steps 1/3/4/5 [PRIMARY]
**GIVEN:** `gate-plan.json` after this task lands  
**WHEN:** inspected for the old fixture IDs  
**THEN:** steps 1, 3, 4, 5 `literal_cmd` **and** any method_note that documents those steps do **not** contain `019f8d2d-2ef7-711b-bb40-df20ab9f27e4`, `019f8d2e-00db-7eda-8ef3-51ee6cd81018`, or `019f8d2f-c5d5-7b9d-94d0-abcdde0a2f17` as required path segments / fixed fixture IDs  
**VERIFY:** `! jq -r '.method_note, (.steps[]|select(.n==1 or .n==3 or .n==4 or .n==5)|(.literal_cmd,.method_note//empty))' gate-plan.json | grep -E '019f8d2d-2ef7-711b-bb40-df20ab9f27e4|019f8d2e-00db-7eda-8ef3-51ee6cd81018|019f8d2f-c5d5-7b9d-94d0-abcdde0a2f17'`
**TEST_TIER:** integration · **FLOW_REF:** UC-SVC-05

### AC-2: Steps create/discover runs via real service calls
**GIVEN:** platform on `:4111` with local fleet healthy (`FLEET_URL` / manifest aligned if reseed used)  
**WHEN:** the rewritten setup / step commands run  
**THEN:** evidence shows successful `POST /api/missions` (or CLI create) producing `runId`s used by subsequent verdicts/steer/cycle — not static UUIDs  
**VERIFY:** Fresh `.tmp/GATE-FIX-003/` or new gate-evidence run log contains create response(s) with `"ok":true` / `runId` and later steps reference those shell variables / discovered ids

### AC-3: Functional claims remain real (no 404-as-pass)
**GIVEN:** fresh step 1 / 3 / 4 / 5 execution after reseed  
**WHEN:** logs are inspected  
**THEN:** step 1 log contains `UNCITED_KILL_REJECTED` (not solely `MISSION_NOT_FOUND`); step 4 contains body-level steer success (`"eventType"` / steer); step 5 contains whitespace-tolerant `assayChallengeDistinct` true with `expected_exit=0`; step 3 real bodies show unprobed refuse + probed accept (assertion honesty is GATE-FIX-004)  
**VERIFY:** Documented greps against fresh evidence; none of the primary claims are satisfied solely by `MISSION_NOT_FOUND`

### AC-4: Probe readiness before 3b (no fake probe)
**GIVEN:** the research run used for step 3b  
**WHEN:** step 3b posts `advance→validated`  
**THEN:** a real plan probe was observed committed for that run before the advance (poll/wait log lines or GET/status evidence); no SQL/seed hand-insert of probes  
**VERIFY:** Fresh evidence shows create → poll/probe-ready marker → advance; fail closed with non-zero exit if probe never appears within bound

### AC-5: Historical evidence preserved
**GIVEN:** `.gate-evidence/20260723T061322Z/`  
**WHEN:** task lands  
**THEN:** directory still exists with step logs showing the 404 drift failure mode  
**VERIFY:** `test -d .gate-evidence/20260723T061322Z && grep -q MISSION_NOT_FOUND .gate-evidence/20260723T061322Z/step1.log`

## Test Criteria
| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Old fixture UUIDs absent from steps 1/3/4/5 + method notes | AC-1 | AC-1 VERIFY |
| TC-2 | Fresh create produces runId used by later cmds | AC-2 | AC-2 VERIFY |
| TC-3 | Fresh step1/4/5 show real handler tokens | AC-3 | AC-3 VERIFY |
| TC-4 | Probe ready before 3b advance | AC-4 | AC-4 VERIFY |
| TC-5 | 061322Z archive preserved | AC-5 | AC-5 VERIFY |

## Guardrails
**WRITE-ALLOWED:** `gate-plan.json` (steps 1/3/4/5 + method_note + top-level method_note); optional `GATE-RESULTS.md`; `.tmp/GATE-FIX-003/**`  
**WRITE-PROHIBITED:** `services/**`, migrations, `.gate-evidence/20260723T061322Z/**` and other historical archives

## Agent Instructions
1. Prefer shell variables set once at the start of each step (or a documented shared setup prefix embedded in each step that needs it) via `POST /api/missions` with unique `idempotencyKey`/`goal` timestamps. Auth: `Authorization: Bearer rn-gate-s23` (match service config).
2. Unprobed run: `templateKey=test.echo` (no research.plan@1). Probed/steer/cycle run: `templateKey=research` (resolves to evidence-research); **poll** until a committed plan probe exists before 3b — real API/CLI only.
3. Step 5: `DATABASE_URL=…holocron_nonprod bun services/platform/src/cli/holo.ts mission:cycle "$RUN_CYCLE" --json` with GATE-FIX-001 whitespace-tolerant assay regex; `expected_exit` remains **0** (do not leave expected_exit=1 from any drift workaround).
4. Step 4: keep body-level steer proof; if pretty-print risks arise, use whitespace-tolerant `"eventType"\s*:\s*"steer"`.
5. Coordinate with GATE-FIX-004 if step 3 assertion self-match is fixed in the same rewrite — do not leave step 3 with a self-matching success token (see GATE-FIX-004 for the full self-match surface: `STEP3_VERDICT=…`, bare `PROBE_REQUIRED_FOR_VALIDATED`, bare `"ok":true` in comments).
6. Do not fabricate pass; if probe cannot be obtained honestly within a bounded poll, report **blocked** with exact create/status logs (do not weaken assertions).
7. Leave step 2 and step 6 alone unless a shared hygiene touch is strictly required.

## Verification Gates
1. AC-1…AC-5 VERIFY
2. `git diff --name-only` ⊆ writeAllowed
3. No product/migration paths

## Dependencies
- depends_on: GATE-FIX-001, GATE-FIX-002 (landed on main)
- blocks: honest human-gate re-pass for steps 1/3/4/5 after reseed
- related: GATE-FIX-004 (step 3 assertion honesty; may co-land if both only touch `gate-plan.json`)

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "GATE-FIX-003",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s23_061322_data_drift": {
      "description": "QA fail 20260723T061322Z: hardcoded run IDs 404 after reseed",
      "seed_method": "file_artifact",
      "records": [".gate-evidence/20260723T061322Z/step1.log", ".gate-evidence/20260723T061322Z/step3.log", ".gate-evidence/20260723T061322Z/step4.log", ".gate-evidence/20260723T061322Z/step5.log"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN landed gate-plan WHEN inspecting steps 1/3/4/5 + method notes THEN old fixture UUIDs absent",
      "verify": "grep fails for hardcoded RUN_ECHO/RUN_CYCLE/RUN_PROBE UUIDs in those literal_cmds and method_notes",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+file_artifact",
        "topology": "single-node",
        "negative_control": { "would_fail_if": ["hardcoded UUID still present", "stub", "empty"] },
        "evidence": { "artifact_type": "file_artifact", "required_capture": true },
        "cases": [{
          "start_ref": "s23_061322_data_drift",
          "action": { "actor": "operator", "steps": ["Inspect steps 1/3/4/5 literal_cmd and method_note fields"] },
          "end_state": {
            "must_observe": ["dynamic create/discover pattern", "shell variables or runtime discovery"],
            "must_not_observe": ["019f8d2d-2ef7-711b-bb40-df20ab9f27e4 required path", "019f8d2e-00db-7eda-8ef3-51ee6cd81018 required path", "019f8d2f-c5d5-7b9d-94d0-abcdde0a2f17 required path"]
          }
        }]
      }
    },
    { "id": "AC-2", "type": "acceptance_criterion", "description": "Fresh create/discover of runIds via real service", "verify": "fresh evidence create ok:true + runId used" },
    { "id": "AC-3", "type": "acceptance_criterion", "description": "Real handler tokens on fresh steps 1/4/5", "verify": "grep UNCITED_KILL / eventType steer / assayChallengeDistinct; not MISSION_NOT_FOUND-only" },
    { "id": "AC-4", "type": "acceptance_criterion", "description": "Real plan probe ready before 3b", "verify": "poll/probe-ready evidence then advance; no DB hand-insert" },
    { "id": "AC-5", "type": "acceptance_criterion", "description": "061322Z archive preserved", "verify": "test -d + MISSION_NOT_FOUND in step1.log" },
    { "id": "TC-1", "type": "test_criterion", "description": "No old UUIDs", "maps_to_ac": "AC-1", "verify": "AC-1 VERIFY" },
    { "id": "TC-2", "type": "test_criterion", "description": "Create produces runId", "maps_to_ac": "AC-2", "verify": "AC-2 VERIFY" },
    { "id": "TC-3", "type": "test_criterion", "description": "Real handler evidence", "maps_to_ac": "AC-3", "verify": "AC-3 VERIFY" },
    { "id": "TC-4", "type": "test_criterion", "description": "Probe ready before 3b", "maps_to_ac": "AC-4", "verify": "AC-4 VERIFY" },
    { "id": "TC-5", "type": "test_criterion", "description": "Archive preserved", "maps_to_ac": "AC-5", "verify": "AC-5 VERIFY" }
  ]
}
-->
