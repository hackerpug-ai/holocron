# REDHAT-FIX-05 — Re-run the full 5-step human gate against HEAD and produce a fresh gate-results.json (current one is missing/deleted; GATE-RESULTS.md still documents the pre-fix run s25-ht-20260725T155918Z from 15:59:18Z, 3h34m before REDHAT-FIX completion)
> Status: Backlog
> Sprint: [Sprint 25: Reactive Surfaces — SSE Streaming, Mission Progress, Degraded](./SPRINT.md)
> Agent: react-native-ui-implementer
> Estimate: 45 min
> Type: CHORE
> Priority: P0
> Effort: S
> Proposed by: react-native-ui-planner
> TDD_MODE: skipped · RED_GREEN_REQUIRED: no · SEEDED_EVIDENCE_REQUIRED: yes
> Source finding: `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-2`

## Outcome

gate-results.json exists; run_id != s25-ht-20260725T155918Z; written_at after REDHAT-FIX completion; GATE-RESULTS.md cites the same run_id; all 5 steps pass with this-cycle evidence logs; Streaming seed confirmed in step-1 log.

## Background

- **Finding:** .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-2
- **Red-hat report:** `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md`
- **Why it matters:** Unqualified Sprint 25 gate close is blocked until cycle-2 H3-NOT-CLOSED / G-2 / G-3 are closed.
- **PRD refs:** UC-SYNC-02, T-SYNC-006, T-SYNC-005, T-SYNC-007, T-INFER-015
- **Capability:** CAP-SYNC-01

## Critical Constraints

### MUST
- MUST re-run the full Sprint 25 human gate against current HEAD (not reuse pre-fix logs as sole proof)
- MUST produce a fresh gate-results.json at the sprint folder with written_at >= max(REDHAT-FIX-01/02/03 completion 2026-07-25T19:33:16Z, REDHAT-FIX-04 completion time if present)
- MUST generate a NEW run_id (format s25-ht-YYYYMMDDTHHMMSSZ) distinct from s25-ht-20260725T155918Z
- MUST update GATE-RESULTS.md so verdict, run_id, and step texts match the fresh run (not the stale pre-fix narrative)
- MUST execute all five consolidated gate steps (or all seven SPRINT Human Test Deliverable items mapped into the 5-step results shape) with exit 0 before writing verdict:pass
- MUST keep this-cycle evidence logs under .gate-evidence/ with non-empty per-step logs for the new run_id
- MUST prefer depends_on REDHAT-FIX-04 so the reconnect step exercises production-hook-closed H3; if 04 still open, gate may run but must NOT claim H3 closed

### NEVER
- NEVER copy gate-results.prev.json or the deleted pre-fix gate-results.json and only bump written_at
- NEVER write verdict:pass if any step failed/skipped/blocked
- NEVER cite run_id s25-ht-20260725T155918Z as the current gate
- NEVER claim step-1 seeds Streaming when the step-1 log shows conversations:4 / no Streaming row
- NEVER fabricate Maestro exit 0 without running the flows

### STRICTLY
- STRICTLY fail-closed gate write: only emit verdict pass when steps_passed == steps_executed == steps_total and every required log is non-empty
- STRICTLY gate-results.json schema parity with gate-results.prev.json (sprint_id, run_id, verdict, runner, written_at, steps[])
- STRICTLY written_at is wall-clock of THIS run, not historical
- STRICTLY tdd_mode skipped (process chore) but requires_seeded_evidence true — behavioral gate re-run is the seed

## Specification

**Objective:** Close cycle-2 G-2 by re-running the full Sprint 25 human testing gate against HEAD after REDHAT-FIX production fixes and publishing a consolidated fresh gate-results.json + GATE-RESULTS.md that cannot be mistaken for the pre-fix run s25-ht-20260725T155918Z.

**Success state:** gate-results.json exists; run_id != s25-ht-20260725T155918Z; written_at after REDHAT-FIX completion; GATE-RESULTS.md cites the same run_id; all 5 steps pass with this-cycle evidence logs; Streaming seed confirmed in step-1 log.

## Capability Chain

- **Touches:** CAP-SYNC-01
- **Provides:** fresh-sprint-25-gate-results, post-redhat-fix-gate-evidence
- **Consumes:** honest-streaming-seed-oracle, research-iteration-writer, mutation-resistant-sse-reconnect-oracle, production-hook-sse-reconnect-mutation-oracle
- **Boundary contracts:**
- gate-results.json MUST exist at .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json
- written_at MUST be ISO-8601 UTC and strictly AFTER REDHAT-FIX-01/02/03 completion (2026-07-25T19:33:16Z) and AFTER REDHAT-FIX-04 lands if 04 is green (prefer post-04 so H3 close is included)
- run_id MUST be a NEW id (not s25-ht-20260725T155918Z)
- GATE-RESULTS.md MUST cite the same run_id and verdict as gate-results.json
- Step 1 seed log MUST show Streaming conversation (conversations:5 or explicit Streaming seed line) — pre-fix step-1-seed.log conversations:4 is invalid evidence
- Consolidated 5-step gate shape matches gate-results.prev.json steps 1-5 (seed; reconnect stream; research 3/5; MCP p95; degraded no-hang)
- gate-results.json schema (required): Must include: sprint_id?, run_id, verdict, written_at, steps_total, steps_executed, steps_passed, steps[{n,type?,text?,executed,result,exit_code?,log,evidence?}]. For pass: steps_passed==steps_executed==steps_total.
- human product steps: 1 seed Streaming; 2 reconnect exactly-once; 3 research progress; 4 MCP p95; 5 degraded fleet. Each step has product oracle evidence, not source inspection.

## Acceptance Criteria

### AC-1: AC-1 [PRIMARY]
- **Description:** GIVEN HEAD after REDHAT-FIX production work WHEN the full 5-step human gate is executed THEN every step exits 0 and a new gate-results.json is written with verdict pass, steps_passed==5, and written_at strictly after 2026-07-25T19:33:16Z
- **Test tier:** `e2e` · **Verification service:** `Maestro + holo seed:e2e + named iOS Simulator + holocron_nonprod platform` · **Flow ref:** `UC-SYNC-02`
- **Verify:** `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict=="pass" and .steps_passed==5 and .steps_executed==5 and .run_id != "s25-ht-20260725T155918Z" and (.written_at >= "2026-07-25T19:33:16Z")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty — gate-results.json missing (current state), stub — written_at bumped on prev JSON without re-running steps, disconnect — any step exit non-zero still verdict pass, static — run_id still s25-ht-20260725T155918Z
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sprint-25-gate-head`: actor `cli_user`
    - **Steps:**
    - Ensure platform + Zero + Metro + Simulator healthy
    - Step 1: holo seed:e2e --reset (capture step-1 log)
    - Step 2: maestro reconnect-exactly-once (stream + airplane mid-stream + exactly one final message)
    - Step 3: maestro research-progress-advances (iteration 3/5)
    - Step 4: maestro cross-surface-sync-slo (MCP doc title within 5s)
    - Step 5: run-degraded-no-hang (fleet down → local fleet unavailable)
    - Write gate-results.json with new run_id and written_at=now UTC
    - **MUST observe:**
    - `gate-results.json path exists and file size > 0 at sprint folder`
    - `verdict equals 'pass'`
    - `steps_passed == 5 and steps_executed == 5`
    - `run_id != 's25-ht-20260725T155918Z'`
    - `written_at >= '2026-07-25T19:33:16Z'`
    - **MUST NOT observe:**
    - `empty/start signature: gate-results.json missing (file size == 0 or absent)`
    - `run_id equals 's25-ht-20260725T155918Z'`
    - `written_at equals '2026-07-25T15:59:18Z'`
    - `verdict equals 'pass' with steps_passed < 5`

### AC-2: AC-2
- **Description:** GIVEN fresh gate-results.json WHEN GATE-RESULTS.md is updated THEN it cites the same run_id and verdict, and step 1 text is true for the run it documents (Streaming seed actually present in that run's step-1 log)
- **Test tier:** `e2e` · **Verification service:** `GATE-RESULTS.md + gate-results.json + step-1 log`
- **Verify:** `python3 - <<'PY'
import json,re,pathlib
root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')
g=json.loads((root/'gate-results.json').read_text())
md=(root/'GATE-RESULTS.md').read_text()
assert g['run_id'] in md, g['run_id']
assert f"verdict:** {g['verdict']}" in md.replace(' ','') or f"**verdict:** {g['verdict']}" in md
assert g['run_id']!='s25-ht-20260725T155918Z'
print('GATE-RESULTS.md run_id match OK', g['run_id'])
PY`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** static — GATE-RESULTS.md still documents s25-ht-20260725T155918Z, empty — GATE-RESULTS.md not updated, stub — step-1 text claims Streaming but log shows conversations:4, mock — GATE-RESULTS.md cites fabricated run_id not in gate-results.json
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `gate-results-prev-schema`: actor `cli_user`
    - **Steps:**
    - Update GATE-RESULTS.md from fresh gate-results.json
    - Diff run_id against pre-fix id
    - Confirm step-1 log for this run mentions Streaming or conversations:5
    - **MUST observe:**
    - `GATE-RESULTS.md contains fresh run_id matching gate-results.json run_id (run_id != 's25-ht-20260725T155918Z')`
    - `GATE-RESULTS.md verdict equals gate-results.json verdict field (verdict == 'pass')`
    - `step-1 evidence log file size > 0 for this run and mentions 'Streaming' or conversations:5`
    - **MUST NOT observe:**
    - `empty/start signature: only pre-fix run_id 's25-ht-20260725T155918Z' in GATE-RESULTS.md`
    - `step-1 text claims 'Streaming' while log has conversations:4 only (empty Streaming row)`

### AC-3: AC-3
- **Description:** GIVEN the reconnect gate step WHEN executed on HEAD THEN Maestro reconnect-exactly-once.yml exits 0 with numeric lastSeq/tokenCount and single assistant bubble oracles COMPLETED (post-REDHAT-FIX-03 oracles; prefer post-04 production-hook close)
- **Test tier:** `e2e` · **Verification service:** `Maestro reconnect-exactly-once + seeded Streaming conversation`
- **Verify:** `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty — only pre-fix reconnect log reused, stub — optional Streaming assert WARN, disconnect — stream stalls with 0 new tokens after restore, static — numeric oracles skipped while Maestro exit 0 claimed
  - **Evidence:** artifact `screenshot`, required_capture=True
  - **Case 1** — start_ref `sprint-25-gate-head`: actor `user`
    - **Steps:**
    - holo seed:e2e --reset
    - maestro test .maestro/reactive/reconnect-exactly-once.yml
    - Capture this-cycle log under .gate-evidence/
    - **MUST observe:**
    - `Maestro reconnect-exactly-once.yml exit code == 0`
    - `Streaming visible oracle status equals 'COMPLETED' (not WARN optional)`
    - `numeric streamLastSeq/tokenCount oracles status equals 'COMPLETED' with tokenCount >= 1`
    - `chat-assistant-bubble-count equals 1 or equivalent single bubble oracle status equals 'COMPLETED'`
    - **MUST NOT observe:**
    - `empty/start signature: truncated log with no asserts (assert count == 0)`
    - `optional:true Streaming greenwash (status equals 'WARN' treated as pass)`

### AC-4: AC-4
- **Description:** GIVEN remaining gate surfaces WHEN research, MCP p95, and degraded steps run THEN each exits 0 with this-cycle evidence logs non-empty under .gate-evidence/
- **Test tier:** `e2e` · **Verification service:** `Maestro research-progress + cross-surface-sync-slo + degraded-no-hang harness`
- **Verify:** `maestro test .maestro/reactive/research-progress-advances.yml && bash .maestro/reactive/run-cross-surface-sync-slo.sh && bash .maestro/reactive/run-degraded-no-hang.sh`
- **Scenario:** tier `visible` · test_tier `e2e` · topology `single-node`
  - **Negative control — would fail if:** empty — steps skipped but marked pass, stub — logs copied from pre-fix without re-run, static — degraded hang without message, disconnect — fleet down leaves UI hang with no degraded message
  - **Evidence:** artifact `file_artifact`, required_capture=True
  - **Case 1** — start_ref `sprint-25-gate-head`: actor `cli_user`
    - **Steps:**
    - Run research progress flow
    - Run MCP cross-surface p95 flow
    - Run degraded no-hang flow
    - Attach logs into gate-results steps[] evidence paths
    - **MUST observe:**
    - `research step exit code == 0`
    - `MCP p95 step exit code == 0`
    - `degraded step exit code == 0`
    - `each step evidence path file size > 0`
    - **MUST NOT observe:**
    - `empty/start signature: missing evidence files (file size == 0)`
    - `verdict equals 'pass' with any step result equals 'fail'`

## Test Criteria

| ID | Statement | Maps to | Verify |
|---|---|---|---|
| TC-1 | Fresh gate-results.json exists with pass, 5/5, new run_id, written_at after REDHAT-FIX completion | AC-1 | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict=="pass" and .steps_passed==5 and .run_id != "s25-ht-20260725T155918Z" and (.written_at >= "2026-07-25T19:33:16Z")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json` |
| TC-2 | GATE-RESULTS.md run_id matches gate-results.json and is not the pre-fix id | AC-2 | `python3 - <<'PY'
import json,pathlib
root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')
g=json.loads((root/'gate-results.json').read_text())
md=(root/'GATE-RESULTS.md').read_text()
assert g['run_id'] in md
assert g['run_id']!='s25-ht-20260725T155918Z'
print('ok', g['run_id'])
PY` |
| TC-3 | Reconnect Maestro flow exits 0 on HEAD after seed | AC-3 | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` |
| TC-4 | Research, MCP p95, and degraded steps exit 0 | AC-4 | `maestro test .maestro/reactive/research-progress-advances.yml && bash .maestro/reactive/run-cross-surface-sync-slo.sh && bash .maestro/reactive/run-degraded-no-hang.sh` |
| TC-5 | This-cycle step evidence logs referenced by gate-results.json all exist and are non-empty | AC-1 | `python3 - <<'PY'
import json,pathlib
root=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')
g=json.loads((root/'gate-results.json').read_text())
for s in g['steps']:
  p=pathlib.Path(s.get('evidence') or s.get('log') or '')
  assert p.is_file() and p.stat().st_size>0, s
print('evidence ok', len(g['steps']))
PY` |

## Reading List

- .spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md — G-2 (lines 31-34, 122-123, 132)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md — Human Test Deliverable steps 1-7
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md — stale pre-fix run_id
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.prev.json — schema + pre-fix written_at
- .maestro/reactive/reconnect-exactly-once.yml
- .maestro/reactive/research-progress-advances.yml
- .maestro/reactive/cross-surface-sync-slo.yml
- .maestro/reactive/run-degraded-no-hang.sh
- .maestro/reactive/run-cross-surface-sync-slo.sh
- scripts/e2e/regenerate-sprint-gate.sh — optional reconciler reference

## Guardrails

### WRITE-ALLOWED
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json (NEW/REPLACE)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md (MODIFY)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/.gate-evidence/** (NEW this-cycle logs)
- .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/SPRINT.md (MODIFY status/progress note only if gate re-close documented)

### WRITE-PROHIBITED
- hooks/use-resumable-sse-stream.ts — product fix is REDHAT-FIX-04
- services/platform/src/db/seed-e2e.ts — H1 closed
- services/platform/src/research/progress.ts — H2 closed
- Copying gate-results.prev.json with only timestamp edit
- Claiming pass with incomplete steps
- services/platform/src/http/chat-runs.ts
- Forging verdict:pass with incomplete steps

## Design

- **References:** `./SPRINT.md Human Testing Gate`, `./gate-results.prev.json`, `.spec/reviews/red-hat-sprint25-reactive-20260725T195015Z.md#G-2`, `.spec/prds/.../gate-results.prev.json (schema exemplar)`, `SPRINT.md Human Test Deliverable steps 1–7 (mapped to 5 gate steps)`, `GATE-RESULTS.md (stale s25-ht-20260725T155918Z)`
- **Pattern:** Fail-closed human gate re-run → this-cycle evidence → single gate-results.json + GATE-RESULTS.md citation
- **Pattern source:** red-hat cycle-2 G-2 fix recommendation
- **Anti-pattern:** Inherit cycle-1 5/5 pass claim; document Streaming seed for a run whose log shows conversations:4
- **Interaction notes:**
- Prefer full re-run after REDHAT-FIX-04 so reconnect step includes production-hook H3 close
- If using /kb-run-human-tests skill, ensure it writes sprint-25 gate-results.json path
- Keep gate-results.prev.json as historical pre-fix archive; do not delete
- Mobile gate: named iOS Simulator, SafeArea-visible chat surfaces, 44pt touch targets already in product — no UI changes in this chore
- Process integrity: gate steps are human-executable product tests, not code review and not 'vitest green ⇒ gate pass'.
- Schema fields that matter for red-hat freshness: verdict, run_id, written_at, steps_total, steps_executed, steps_passed, steps[].result + non-empty log.
- Pre-fix run_id s25-ht-20260725T155918Z is explicitly disallowed as current; gate-results.prev.json may remain as historical.
- Step-2 product oracle depends on FIX-04; if FIX-04 incomplete, write honest fail — do not forge pass from partial redhat-fix-03-ac3-maestro-pass.log.
- Backend contracts (afterSeq, finalizeChatRun) are not re-validated by rewriting server code; product reconnect journey is the client proof.

## Agent Assignment

- **Agent:** `react-native-ui-implementer`
- **Rationale:** Owns Maestro reactive flows, seed:e2e gate step 1, reconnect/research/MCP/degraded surface verification, and sprint-folder gate-results.json / GATE-RESULTS.md authorship for the Sprint 25 human gate. Process re-close after REDHAT-FIX production fixes — not a product code task. Reviewer: react-native-ui-reviewer.
- **Reviewer:** `react-native-ui-reviewer`
- **Proposed by:** `react-native-ui-planner` (plus mastra-planner contract enrichments at consolidation)

## Agent Instructions

1. Capture RED evidence if tdd_mode=red_first before product changes.
2. Implement only WRITE-ALLOWED paths; close the source finding.
3. Run verification gates; write evidence under .tmp/sprint-25/ and/or sprint .gate-evidence/.
4. Do not re-open closed H1/H2 production writers unless this task explicitly requires it.

## Verification Gates

| Gate | Command | Expected |
|---|---|---|
| gate-results.json freshness | `test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict=="pass" and .steps_passed==5 and .run_id != "s25-ht-20260725T155918Z" and (.written_at >= "2026-07-25T19:33:16Z")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json` | Exit 0 |
| GATE-RESULTS.md sync | `rg -F "$(jq -r .run_id .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json)" .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/GATE-RESULTS.md` | run_id present |
| Reconnect this-cycle | `holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml` | Exit 0 |

## Dependencies

- **depends_on:** REDHAT-FIX-01, REDHAT-FIX-02, REDHAT-FIX-03, REDHAT-FIX-04
- **blocks:** S-REACTIVE-05

## Review Criteria

- Every AC/TC stable; behavioral ACs pass `validate_scenario` with 0 CRITICAL
- Source finding closed with production-truth evidence (not harness simulation alone)
- Writes only under WRITE-ALLOWED
- Evidence artifacts at contract-mandated paths

## Notes

- Mastra enrichments folded at consolidation: backend afterSeq frozen; durable chat_messages authoritative; gate/evidence integrity.
- Contract: MUST-PRESERVE: chat-runs.ts afterSeq filter `seq > afterSeq` (listChatEvents/getChatRun :618-621) — FIX-04 must not re-litigate or rewrite the SSE backend.
- Contract: MUST-PRESERVE: finalizeChatRun durable chat_messages write + monotonic chat_run_events seq — durable row remains authoritative after terminal; client assembly is provisional.
- Contract: MUST-PRESERVE: SSE event type set token | terminal | blocked | error with monotonic seq as SSE id — client tests/stubs must honor the same set.
- Contract: MUST-PRESERVE: Client resume header Last-Event-ID = String(assemblyRef.current.lastSeq || afterSeq) via buildSseResumeHeaders — pure-function mutant A already killed; production openEventSource wiring at reconnect sites :608/:712 is the remaining gap.
- Contract: MUST-PROVE (FIX-04): Mutant that resets production assemblyRef.current before reconnect is KILLED by a test that exercises production code, not runReconnectWiring local variables.
- Contract: MUST-PROVE (FIX-04): Exactly-once = unique token concat + tokenCount==unique + single agent bubble + durable content diff==0.
- Contract: MUST-NOT: Trust harness-generated redhat-fix-03-mutation.log alone (baseline anomaly / simulation mode) as production mutant-kill evidence.
- Contract: MUST-NOT: Re-open H1 seed or H2 research/progress writer under FIX-04/05/06 — both PATH-A closed in production.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-05",
  "proposed_by": "react-native-ui-planner",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sprint-25-gate-head": {
      "description": "HEAD of mk6-reactive-surfaces with REDHAT-FIX-01/02/03 (and prefer 04) landed; platform on holocron_nonprod; named iOS Simulator; Zero + Metro healthy",
      "seed_method": "cli",
      "records": [
        "holo seed:e2e --reset yields Streaming conversation (conversations:5)",
        "Maestro flows under .maestro/reactive/ available",
        "fleet stop/restore harness for degraded step present"
      ]
    },
    "gate-results-prev-schema": {
      "description": "Schema reference from gate-results.prev.json for the fresh write shape",
      "seed_method": "cli",
      "records": [
        "fields: sprint_id, run_id, verdict, runner, ui_driver, written_at, steps_total, steps_executed, steps_passed, steps[]",
        "5 consolidated steps: seed; reconnect; research; MCP p95; degraded"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN HEAD after REDHAT-FIX production work WHEN the full 5-step human gate is executed THEN every step exits 0 and a new gate-results.json is written with verdict pass, steps_passed==5, and written_at strictly after 2026-07-25T19:33:16Z",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict==\"pass\" and .steps_passed==5 and .steps_executed==5 and .run_id != \"s25-ht-20260725T155918Z\" and (.written_at >= \"2026-07-25T19:33:16Z\")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro + holo seed:e2e + named iOS Simulator + holocron_nonprod platform",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 gate-results.json missing (current state)",
            "stub \u2014 written_at bumped on prev JSON without re-running steps",
            "disconnect \u2014 any step exit non-zero still verdict pass",
            "static \u2014 run_id still s25-ht-20260725T155918Z"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint-25-gate-head",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Ensure platform + Zero + Metro + Simulator healthy",
                "Step 1: holo seed:e2e --reset (capture step-1 log)",
                "Step 2: maestro reconnect-exactly-once (stream + airplane mid-stream + exactly one final message)",
                "Step 3: maestro research-progress-advances (iteration 3/5)",
                "Step 4: maestro cross-surface-sync-slo (MCP doc title within 5s)",
                "Step 5: run-degraded-no-hang (fleet down \u2192 local fleet unavailable)",
                "Write gate-results.json with new run_id and written_at=now UTC"
              ]
            },
            "end_state": {
              "must_observe": [
                "gate-results.json path exists and file size > 0 at sprint folder",
                "verdict equals 'pass'",
                "steps_passed == 5 and steps_executed == 5",
                "run_id != 's25-ht-20260725T155918Z'",
                "written_at >= '2026-07-25T19:33:16Z'"
              ],
              "must_not_observe": [
                "empty/start signature: gate-results.json missing (file size == 0 or absent)",
                "run_id equals 's25-ht-20260725T155918Z'",
                "written_at equals '2026-07-25T15:59:18Z'",
                "verdict equals 'pass' with steps_passed < 5"
              ]
            }
          }
        ]
      },
      "flow_ref": "UC-SYNC-02"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN fresh gate-results.json WHEN GATE-RESULTS.md is updated THEN it cites the same run_id and verdict, and step 1 text is true for the run it documents (Streaming seed actually present in that run's step-1 log)",
      "verify": "python3 - <<'PY'\nimport json,re,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nmd=(root/'GATE-RESULTS.md').read_text()\nassert g['run_id'] in md, g['run_id']\nassert f\"verdict:** {g['verdict']}\" in md.replace(' ','') or f\"**verdict:** {g['verdict']}\" in md\nassert g['run_id']!='s25-ht-20260725T155918Z'\nprint('GATE-RESULTS.md run_id match OK', g['run_id'])\nPY",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "GATE-RESULTS.md + gate-results.json + step-1 log",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "static \u2014 GATE-RESULTS.md still documents s25-ht-20260725T155918Z",
            "empty \u2014 GATE-RESULTS.md not updated",
            "stub \u2014 step-1 text claims Streaming but log shows conversations:4",
            "mock \u2014 GATE-RESULTS.md cites fabricated run_id not in gate-results.json"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate-results-prev-schema",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Update GATE-RESULTS.md from fresh gate-results.json",
                "Diff run_id against pre-fix id",
                "Confirm step-1 log for this run mentions Streaming or conversations:5"
              ]
            },
            "end_state": {
              "must_observe": [
                "GATE-RESULTS.md contains fresh run_id matching gate-results.json run_id (run_id != 's25-ht-20260725T155918Z')",
                "GATE-RESULTS.md verdict equals gate-results.json verdict field (verdict == 'pass')",
                "step-1 evidence log file size > 0 for this run and mentions 'Streaming' or conversations:5"
              ],
              "must_not_observe": [
                "empty/start signature: only pre-fix run_id 's25-ht-20260725T155918Z' in GATE-RESULTS.md",
                "step-1 text claims 'Streaming' while log has conversations:4 only (empty Streaming row)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN the reconnect gate step WHEN executed on HEAD THEN Maestro reconnect-exactly-once.yml exits 0 with numeric lastSeq/tokenCount and single assistant bubble oracles COMPLETED (post-REDHAT-FIX-03 oracles; prefer post-04 production-hook close)",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro reconnect-exactly-once + seeded Streaming conversation",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 only pre-fix reconnect log reused",
            "stub \u2014 optional Streaming assert WARN",
            "disconnect \u2014 stream stalls with 0 new tokens after restore",
            "static \u2014 numeric oracles skipped while Maestro exit 0 claimed"
          ]
        },
        "evidence": {
          "artifact_type": "screenshot",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint-25-gate-head",
            "action": {
              "actor": "user",
              "steps": [
                "holo seed:e2e --reset",
                "maestro test .maestro/reactive/reconnect-exactly-once.yml",
                "Capture this-cycle log under .gate-evidence/"
              ]
            },
            "end_state": {
              "must_observe": [
                "Maestro reconnect-exactly-once.yml exit code == 0",
                "Streaming visible oracle status equals 'COMPLETED' (not WARN optional)",
                "numeric streamLastSeq/tokenCount oracles status equals 'COMPLETED' with tokenCount >= 1",
                "chat-assistant-bubble-count equals 1 or equivalent single bubble oracle status equals 'COMPLETED'"
              ],
              "must_not_observe": [
                "empty/start signature: truncated log with no asserts (assert count == 0)",
                "optional:true Streaming greenwash (status equals 'WARN' treated as pass)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "description": "GIVEN remaining gate surfaces WHEN research, MCP p95, and degraded steps run THEN each exits 0 with this-cycle evidence logs non-empty under .gate-evidence/",
      "verify": "maestro test .maestro/reactive/research-progress-advances.yml && bash .maestro/reactive/run-cross-surface-sync-slo.sh && bash .maestro/reactive/run-degraded-no-hang.sh",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "Maestro research-progress + cross-surface-sync-slo + degraded-no-hang harness",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty \u2014 steps skipped but marked pass",
            "stub \u2014 logs copied from pre-fix without re-run",
            "static \u2014 degraded hang without message",
            "disconnect \u2014 fleet down leaves UI hang with no degraded message"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint-25-gate-head",
            "action": {
              "actor": "cli_user",
              "steps": [
                "Run research progress flow",
                "Run MCP cross-surface p95 flow",
                "Run degraded no-hang flow",
                "Attach logs into gate-results steps[] evidence paths"
              ]
            },
            "end_state": {
              "must_observe": [
                "research step exit code == 0",
                "MCP p95 step exit code == 0",
                "degraded step exit code == 0",
                "each step evidence path file size > 0"
              ],
              "must_not_observe": [
                "empty/start signature: missing evidence files (file size == 0)",
                "verdict equals 'pass' with any step result equals 'fail'"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Fresh gate-results.json exists with pass, 5/5, new run_id, written_at after REDHAT-FIX completion",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json && jq -e '.verdict==\"pass\" and .steps_passed==5 and .run_id != \"s25-ht-20260725T155918Z\" and (.written_at >= \"2026-07-25T19:33:16Z\")' .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/gate-results.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "GATE-RESULTS.md run_id matches gate-results.json and is not the pre-fix id",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nmd=(root/'GATE-RESULTS.md').read_text()\nassert g['run_id'] in md\nassert g['run_id']!='s25-ht-20260725T155918Z'\nprint('ok', g['run_id'])\nPY",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Reconnect Maestro flow exits 0 on HEAD after seed",
      "verify": "holo seed:e2e --reset && maestro test .maestro/reactive/reconnect-exactly-once.yml",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Research, MCP p95, and degraded steps exit 0",
      "verify": "maestro test .maestro/reactive/research-progress-advances.yml && bash .maestro/reactive/run-cross-surface-sync-slo.sh && bash .maestro/reactive/run-degraded-no-hang.sh",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "This-cycle step evidence logs referenced by gate-results.json all exist and are non-empty",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded')\ng=json.loads((root/'gate-results.json').read_text())\nfor s in g['steps']:\n  p=pathlib.Path(s.get('evidence') or s.get('log') or '')\n  assert p.is_file() and p.stat().st_size>0, s\nprint('evidence ok', len(g['steps']))\nPY",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
