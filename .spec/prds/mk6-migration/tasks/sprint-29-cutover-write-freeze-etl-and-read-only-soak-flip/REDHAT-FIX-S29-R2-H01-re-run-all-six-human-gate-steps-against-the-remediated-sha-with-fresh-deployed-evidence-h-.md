# REDHAT-FIX-S29-R2-H01 — Re-run all six human-gate steps against the remediated SHA with fresh deployed evidence (H-01; gate-results.json:7-14)

## What this does

Close cycle-2 red-hat H-01 by (RED) proving current gate-results.json run_id 20260802T004525Z is stale vs remediated gate-plan/source and fails freshness oracles closed, then (GREEN) providing a re-run capability that executes all six human-gate steps via real cutover CLI against the remediated SHA, writes a new gate-results.json + per-step evidence under a new run_id, and records SHA + deployed identity + timestamps — without accepting historical false-pass lineage as certification of the remediated target.

## Why

Remediate cycle-2 red-hat finding for CAP-CUT-01, CAP-MIG-01 (`REDHAT-FIX-S29-R2-H01`). Grounded in UC-SYNC-03 / UC-SYNC-04 / T-SYNC-008–010 / CAP-CUT-01 (and CAP-MIG-01 when ETL parity applies). Review evidence: `.spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md` (reviewed SHA `cab5c0717974a96e33c338105b5d198d82cb607d`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts → exit 0 after GREEN (while RED: must fail on current stale gate-results)`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts → exit 0; null-tools and failed_count negatives remain fail-closed`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts → exit 0; length-only with failed_count>0 fails`
- `jq -e '.run_id != "20260802T004525Z" or .verdict != "pass"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json → true (stale pass not current after close)`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/**, services/platform/tests/integration/sprint29-human-gate-freshness.test.ts, services/platform/tests/integration/sprint29-human-gate-oracles.test.ts, services/platform/tests/integration/sprint29-go-no-go.test.ts

Prohibited: Rewriting or deleting historical .gate-evidence/20260802T004525Z/** to erase false-pass lineage, Fabricating gate-results.json verdict:pass without real CLI step executions, Copying stale 20260802T004525Z results and only bumping timestamps, Weakening gate-plan.json oracles to force 6/6 green while R2-C01..C04 / R2-H02..H04 incomplete, Reintroducing length-only step1 or overall.ok-only step5 predicates, Accepting toolsPassed:null / toolsTotal:null as green

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-R2-H01 — Re-run all six human-gate steps against the remediated SHA with fresh deployed evidence (H-01; gate-results.json:7-14)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01, CAP-MIG-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
After GREEN: (1) automated freshness checks FAIL when authoritative gate-results.json still claims pass for run_id 20260802T004525Z against remediated plan/source; (2) re-run harness invokes all 6 gate-plan literal_cmd paths via bun services/platform/src/cli/holo.ts cutover:* (not jq-only peeks); (3) new .gate-evidence/{run_id≠20260802T004525Z}/ contains step1..step6 logs with real commands; (4) evidence embeds git SHA, deployed base URL/generation, timestamps; (5) step1 go-no-go oracle requires overall.ok==true AND failed_count==0 (when green) or honest fail; (6) full 6/6 pass is not forged while remediations incomplete — re-run capability ACs green independently of e2e pass; (7) historical .gate-evidence/20260802T004525Z/** preserved as false-pass lineage.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST fail closed when gate-results.json run_id is 20260802T004525Z while claiming pass for the remediated plan/source (H-01 RED phase)
- MUST re-run all six human-gate steps against remediated source using current gate-plan.json predicates (failed_count==0, require-all freeze fields, toolsPassed==toolsTotal non-null, etc.)
- MUST execute real CLI actions via bun services/platform/src/cli/holo.ts for every step (cutover:go-no-go, cutover:freeze, cutover:quiet-check, cutover:run-etl, cutover:flip + cutover:verify-soak, write probe) — never jq-only peeks as the action
- MUST produce a NEW run_id ≠ 20260802T004525Z and write .gate-evidence/{new-run-id}/step{1..6}.log with real command transcripts
- MUST record git SHA of tree under test, deployed service identity (base URL / generation), and timestamps in gate-results and/or evidence meta
- MUST require step1 go-no-go report overall.ok==true AND failed_count==0 for green step1 (never gates|length==8 alone); honest fail when failed_count>0
- MUST preserve historical .gate-evidence/20260802T004525Z/** as false-pass lineage (do not rewrite to erase contradiction)
- MUST structure ACs so re-run harness/freshness oracles can go GREEN while end-to-end 6/6 may remain blocked until R2-C01..C04 and R2-H02..H04 land — make dependency explicit without fake-passing
- NEVER accept run_id 20260802T004525Z as pass evidence for the remediated SHA/plan
- NEVER reintroduce length-only step1 oracle (gates|length==8) while failed_count may be >0
- NEVER accept toolsPassed:null / toolsTotal:null as green step5
- NEVER fabricate gate-results.json verdict:pass without real CLI executions for all claimed steps
- NEVER copy/bump only written_at or steps_passed on the stale results without re-running commands
- NEVER rewrite or delete historical .gate-evidence/20260802T004525Z/** to hide false-pass lineage
- NEVER claim deployed identity while only free-port localhost child evidence exists if the step claims deployed verification (coordinate with R2-H02; do not fake-pass)
- NEVER weaken gate-plan predicates to match incomplete remediations so 6/6 grees falsely
- STRICTLY tdd_mode red_first: implement freshness oracle that FAILS on current stale gate-results.json BEFORE implementing re-run harness GREEN paths
- STRICTLY every step method remains real-cli with dispatcher bun services/platform/src/cli/holo.ts
- STRICTLY multi-claim oracles use require-all / conjunctive jq -e per gate-plan.json (H03 lineage)
- STRICTLY flow_ref T-SYNC-008 (go-no-go), T-SYNC-009 (freeze/drain/ETL), T-SYNC-010 (soak/write fence) as appropriate
- STRICTLY CAP-MIG-01 applies to ETL step4; CAP-CUT-01 applies to freeze→flip→write migration_read_only chain
- STRICTLY negative_control fails if stale run_id still accepted as current pass; if jq-only step1 still greens; if null tools still greens step5

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN stale_gate_results_s29_20260802T004525Z and remediated_gate_plan_s29_h03 …
- [ ] AC-2: GIVEN remediated_gate_plan_s29_h03 and complete_cutover_cli_surface and fresh_g…
- [ ] AC-3: GIVEN fresh_gate_run_context WHEN a re-run is executed (full or harness-mediate…
- [ ] AC-4: GIVEN complete_cutover_cli_surface WHEN step1 cutover:go-no-go runs under the r…
- [ ] AC-5: GIVEN sibling_remediation_incomplete_marker (R2-C01..C04 and/or R2-H02..H04 sti…
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — RED: stale gate-results run_id 20260802T004525Z fails fresh… (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN stale_gate_results_s29_20260802T004525Z and remediated_gate_plan_s29_h03 WHEN the Sprint 29 human-gate freshness oracle suite runs THEN it FAILS closed: run_id 20260802T004525Z must not be accepted as pass evidence for the remediated plan/source; failure names the stale run_id and/or contradicts historical step1 length-only / step5 null-tools lineage vs current predicates (H-01 RED phase).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: sprint29-human-gate-freshness
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'R2-H01|stale|freshness' ; jq -e '.run_id == "20260802T004525Z" and .verdict == "pass"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json >/dev/null && echo 'STALE_PASS_PRESENT — freshness suite MUST fail while this is true'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: stale_gate_results_s29_20260802T004525Z
  MUST_OBSERVE: AC-1 report field ok equals true OR exit_code equals 1; AC-1 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-1 observed_status equals literal 'PASS' and observed_count >= 1; failure message or assertion names 20260802T004525Z and/or failed_count/toolsPassed lineage; AC-1 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Re-run harness executes all 6 steps via real cutover CLI under curren… (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN remediated_gate_plan_s29_h03 and complete_cutover_cli_surface and fresh_gate_run_context WHEN the human-gate re-run harness (or documented operator procedure driven by gate-plan literal_cmd) executes steps 1–6 THEN each step invokes bun services/platform/src/cli/holo.ts cutover:<verb> (or documented step6 write probe after flip) and evaluates the current conjunctive jq oracle — not historical length-only / overall.ok-only peeks; step1 requires overall.ok==true AND failed_count==0 for green (or honest fail).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+holo-cutover-cli
  VERIFY: `jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json; jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'cutover:go-no-go' && jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'rerun|literal_cmd|six.steps|R2-H01'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: remediated_gate_plan_s29_h03
  MUST_OBSERVE: AC-2 report field ok equals true OR exit_code equals 1; AC-2 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; AC-2 observed_status equals literal 'PASS' and observed_count >= 1; step1 cutover:go-no-go + failed_count==0 predicate; step2–6 conjunctive multi-field oracles per H03; AC-2 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GREEN: fresh gate-results + evidence bind new run_id, git SHA, deploy… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN fresh_gate_run_context WHEN a re-run is executed (full or harness-mediated) THEN gate-results.json is rewritten with run_id ≠ 20260802T004525Z; .gate-evidence/{new-run-id}/step{1..6}.log exist; evidence and/or gate-results record source git SHA, deployed service identity (base URL and/or generation), and wall-clock timestamps; GATE-RESULTS.md cites the same run_id and honest verdict (pass only if all six current oracles pass; else fail/partial without claiming 6/6).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-results+evidence-meta
  VERIFY: `test -f .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json && jq -e '.run_id != "20260802T004525Z" and (.source_sha // .git_sha // .tree_sha // .meta.source_sha) != null and ((.deployed_base_url // .meta.deployed_base_url // .service_identity // .meta.service_identity) != null)' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json; RID=$(jq -r '.run_id' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json); for n in 1 2 3 4 5 6; do test -s .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/$RID/step$n.log || test -s .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/$RID/step${n}.log; done; rg -F "$RID" .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: fresh_gate_run_context
  MUST_OBSERVE: AC-3 report field ok equals true OR exit_code equals 1; AC-3 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; run_id != 20260802T004525Z; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1; AC-3 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Step1 go-no-go full report: overall.ok and failed_count==0 (green) or… (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN complete_cutover_cli_surface WHEN step1 cutover:go-no-go runs under the re-run harness THEN the produced go-no-go report is the full eight-gate report; green requires overall.ok==true AND failed_count==0 (and gates length 8 with collectedTests where applicable); if failed_count>0 the step MUST fail closed and must not be recorded as pass via length-only jq (lineage: historical step1.log failed_count=5 with EXIT=0).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: cutover-go-no-go
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|step.1|C01|go-no-go'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-1|go-no-go|failed_count'; jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count == 0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: historical_false_pass_step1_log
  MUST_OBSERVE: AC-4 report field ok equals true OR exit_code equals 1; AC-4 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; oracle fail when failed_count!=0; AC-4 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — Sibling dependency honesty: harness GREEN without fake-passing incomp… (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN sibling_remediation_incomplete_marker (R2-C01..C04 and/or R2-H02..H04 still open) WHEN re-run harness/freshness oracles are evaluated THEN those ACs can still be GREEN (freshness fails on stale pass; harness can execute and record honest per-step fail); end-to-end gate-results MUST NOT claim verdict pass 6/6 by reusing 20260802T004525Z or by weakening predicates — honest fail/partial is required until siblings land; SPRINT.md/docs state the dependency explicitly.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-honesty+docs
  VERIFY: `rg -n 'R2-C01|R2-H02|20260802T004525Z|honest fail|sibling' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-R2-H01*.md 2>/dev/null; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'honest|sibling|no.fake.pass|R2-H01'; python3 - <<'PY'
import json,pathlib
p=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json')
g=json.loads(p.read_text())
if g.get('run_id')=='20260802T004525Z' and g.get('verdict')=='pass':
  raise SystemExit('FAIL: stale pass still current — R2-H01 not closed')
if g.get('verdict')=='pass':
  assert g.get('steps_passed')==g.get('steps_total')==g.get('steps_executed')
  assert g.get('run_id')!='20260802T004525Z'
print('ok', g.get('run_id'), g.get('verdict'))
PY`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if stub: returns ok without real CLI/service; empty: empty start state still greens; mock: mocked dependency without live I/O; static: hard-coded green report
  START_REF: sibling_remediation_incomplete_marker
  MUST_OBSERVE: AC-5 report field ok equals true OR exit_code equals 1; AC-5 evidence_bytes count >= 1; artifact path contains literal 'redhat-fix-s29-r2'; explicit dependency on R2-C01..C04 / R2-H02..H04 for full 6/6; AC-5 observed_status equals literal 'PASS' and observed_count >= 1; AC-5 observed_status equals literal 'PASS' and observed_count >= 1
  MUST_NOT_OBSERVE: empty/start signature: empty result or (0) count or none; stub green without real dependency; mock-only success
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Freshness suite fails closed while gate-results.json is stale pass ru… | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integrati…` |
| TC-2 | Historical step1 length-only + failed_count=5 fixture fails current s… | AC-4 | `PLATFORM_IT=1 pnpm vitest run --project integrati…` |
| TC-3 | Historical step5 null tools fixture fails current step5 oracle | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integrati…` |
| TC-4 | All six gate-plan steps reference cutover CLI via bun dispatcher with… | AC-2 | `jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/pr…` |
| TC-5 | After re-run: gate-results run_id != 20260802T004525Z and evidence di… | AC-3 | `jq -e '.run_id != "20260802T004525Z"' .spec/prds/…` |
| TC-6 | GATE-RESULTS.md cites fresh run_id (not only stale 20260802T004525Z a… | AC-3 | `python3 - <<'PY' import json,pathlib root=pathlib…` |
| TC-7 | No fake-pass: if verdict pass then steps_passed==steps_total and run … | AC-5 | `jq -e 'if .verdict=="pass" then (.run_id != "2026…` |
| TC-8 | Typecheck and biome clean on write_allowed paths | AC-2 | `pnpm tsgo --noEmit && pnpm biome check services/p…` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/**
- services/platform/tests/integration/sprint29-human-gate-freshness.test.ts
- services/platform/tests/integration/sprint29-human-gate-oracles.test.ts
- services/platform/tests/integration/sprint29-go-no-go.test.ts
- services/platform/tests/integration/sprint29-*.test.ts
- scripts/gate/**
- scripts/*sprint29*
- scripts/*human-gate*
- .tmp/REDHAT-FIX-S29-R2-H01/**
writeProhibited:
- Rewriting or deleting historical .gate-evidence/20260802T004525Z/** to erase false-pass lineage
- Fabricating gate-results.json verdict:pass without real CLI step executions
- Copying stale 20260802T004525Z results and only bumping timestamps
- Weakening gate-plan.json oracles to force 6/6 green while R2-C01..C04 / R2-H02..H04 incomplete
- Reintroducing length-only step1 or overall.ok-only step5 predicates
- Accepting toolsPassed:null / toolsTotal:null as green
- Implementing durable distributed fence (R2-C01 / former C02), full drain (R2-C02), immutable catalog (R2-C03), control-plane rollback (R2-C04), deployed MCP schema (R2-H02), article pre-freeze comparator (R2-H03), cross-process arm fail-closed (R2-H04) beyond documenting dependencies and recording honest fail
- Using PATH holo stub instead of bun services/platform/src/cli/holo.ts

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:77-83 [H-01 HIGH — stale 6/6 pass not evidence for remediated target; rec #5 re-run six steps]
2. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:21 [retained gate-results claims 6/6 for 20260802T004525Z predates remediated plan]
3. .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md:111 [remediation rec #5: re-run all six; preserve SHA, deployed identity, per-tool, article comparator, eight-gate report]
4. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json:7-14 [run_id 20260802T004525Z verdict pass — stale certification]
5. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json [authoritative remediated plan; steps 1–6 real-cli + conjunctive oracles; remediated_at 20260802T020000Z]
6. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:31-38 [step1 cutover:go-no-go requires overall.ok + failed_count==0 — contradicts historical length-only]
7. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:96-106 [step5 toolsPassed==toolsTotal non-null — contradicts historical null tools greening]
8. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step1.log [jq length==8 with failed_count 5 GATE-EXIT=0]
9. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step5.log [toolsPassed null toolsTotal null GATE-EXIT=0]
10. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md [documents VERIFIED 6/6 for stale run_id]
11. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md:44-63 [Human Testing Gate + Human Test Deliverable steps 1–6]
12. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md:86 [REDHAT-FIX-S29-R2-H01 stub]
13. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-H03-rebuild-gate-plan-predicates-around-concrete-cli-actions-and-complete-per-surface-oracles-h.md [style + H03 oracle rebuild]
14. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-C01-replace-the-false-go-no-go-oracle-with-real-cli-execution-and-require-failed-count-0-c-01-gate.md [failed_count==0 contract]
15. services/platform/tests/integration/sprint29-human-gate-oracles.test.ts [existing H03 oracle suite]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- G1: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts → exit 0 after GREEN (while RED: must fail on current stale gate-results)` → Exit 0
- G2: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts → exit 0; null-tools and failed_count negatives remain fail-closed` → Exit 0
- G3: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts → exit 0; length-only with failed_count>0 fails` → Exit 0
- G4: `jq -e '.run_id != "20260802T004525Z" or .verdict != "pass"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json → true (stale pass not current after close)` → Exit 0
- G5: `jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count == 0'` → Exit 0
- G6: `test -d .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z → historical lineage preserved` → Exit 0
- G7: `pnpm tsgo --noEmit → exit 0` → Exit 0
- G8: `pnpm biome check . → exit 0 on touched paths` → Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-H03-rebuild-gate-plan-predicates-around-concrete-cli-actions-and-complete-per-surface-oracles-h.md, .spec/prds/mk6-migration/tasks/sprint-25-reactive-surfaces-sse-streaming-mission-progress-degraded/REDHAT-FIX-05-rerun-full-human-gate-fresh-gate-results.md, services/platform/tests/integration/sprint29-human-gate-oracles.test.ts
Interaction notes:
- Depends on / coordinates with REDHAT-FIX-S29-H03 (predicates) and REDHAT-FIX-S29-C01 (failed_count) — do not reintroduce weak oracles.
- Full green 6/6 may block on REDHAT-FIX-S29-R2-C01..C04 and R2-H02..H04; structure so freshness+harness ACs green independently.
- R2-H02 owns deployed MCP/article identity quality; this task requires identity fields recorded — do not fake deployed proof with free-port-only while claiming deployment.
- R2-H03 owns article pre-freeze comparator; re-run should preserve article evidence when available but not reimplement comparator.
- Historical .gate-evidence/20260802T004525Z is lineage for red_first negatives — keep forever.
- Dispatcher remains bun services/platform/src/cli/holo.ts per SPRINT.md.
pattern: RED_FIRST freshness: assert current gate-results.json run_id 20260802T004525Z + historical step1/step5 contradiction FAILS closed vs remediated gate-plan. GREEN: re-run harness executes gate-plan literal_cmds via bun services/platform/src/cli/holo.ts into .gate-evidence/{new-run-id}/; write gate-results with source_sha + deployed_base_url/service_identity + timestamps; GATE-RESULTS.md cites same run_id; preserve historical false-pass dir. Full 6/6 pass only when all six current oracles honestly pass — else fail-closed partial. Preferred new test file: services/platform/tests/integration/sprint29-human-gate-freshness.test.ts (extend oracles suite if smaller).
pattern_source: red-hat cab5c071 review + cutover CLI
anti_pattern: Cite 20260802T004525Z 6/6 as post-remediation proof; bump written_at without re-run; jq-only peeks as actions; green length==8 with failed_count=5; green overall.ok with null tools; forge pass while siblings open; delete historical evidence to hide contradiction.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — Cycle-2 H-01 is a gate-provability/freshness failure: gate-results.json still claims 6/6 pass for historical run_id 20260802T004525Z whose evidence contradicts the remediated gate-plan (length-only step1 with failed_count=5; null toolsPassed/toolsTotal on step5). Re-binding all six human-gate steps to real cutover CLI executions, current SHA, deployed service identity, and a new run_id is human-gate / CI plan engineering owned by devops-engineer (same class as S25 REDHAT-FIX-05 fresh gate re-run and S28 gate-run-id freshness). Product remediations for fence/drain/parity/rollback live in R2-C01..C04 and R2-H02..H04; this task owns the freshness harness and fail-closed refusal of stale 6/6 theatre.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer / test-quality-reviewer when domain-scoped)
Proposed By: devops-engineer

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-S29-H03, REDHAT-FIX-S29-C01, D06-02, D06-03, D06-04, D06-05
Blocks: Sprint 29 red-hat cycle-2 verdict lift (H-01 stale gate certification), Authoritative 6/6 human-gate pass claim for remediated SHA cab5c071+

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
['Finding lineage: red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md H-01 HIGH @ reviewed SHA cab5c0717974a96e33c338105b5d198d82cb607d. Evidence: gate-results.json:7-14 run_id 20260802T004525Z; .gate-evidence/20260802T004525Z/step1.log length-only + failed_count=5; step5.log null tools; contradicts gate-plan.json:31-38,96-106 (C01/H03). Remediation rec #5. PRIMARY AC is RED freshness fail-closed; GREEN is re-run harness + fresh evidence with SHA/deployed identity/timestamps. Full e2e 6/6 may remain blocked until R2-C01..C04 and R2-H02..H04 — ACs structured so harness/freshness can green without fake-passing. Preserve historical false-pass evidence. proposed_by: devops-engineer. Style matched to REDHAT-FIX-S29-H03 full task + REQUIREMENT-CONTRACT v1 + Sprint 25 fresh re-run pattern.']

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-R2-H01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "stale_gate_results_s29_20260802T004525Z": {
      "description": "Current committed gate-results.json claiming verdict pass for run_id 20260802T004525Z with steps_passed=6 \u2014 historical false-pass predating remediated gate-plan.",
      "seed_method": "recorded_external",
      "records": [
        ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json:7-14 run_id 20260802T004525Z verdict pass",
        "steps_total=6 steps_executed=6 steps_passed=6",
        "GATE-RESULTS.md VERIFIED 6/6 for same run_id"
      ]
    },
    "historical_false_pass_step1_log": {
      "description": "Retained step1 evidence: only jq length==8 while failed_count=5 \u2014 contradicts C01/H03 plan.",
      "seed_method": "recorded_external",
      "records": [
        ".gate-evidence/20260802T004525Z/step1.log CMD: jq -e \".gates | length == 8\"",
        "failed_count: 5 with GATE-EXIT=0",
        "no cutover:go-no-go CLI transcript in that log"
      ]
    },
    "historical_false_pass_step5_log": {
      "description": "Retained step5 evidence: overall.ok true with toolsPassed null toolsTotal null still GATE-EXIT=0.",
      "seed_method": "recorded_external",
      "records": [
        ".gate-evidence/20260802T004525Z/step5.log toolsPassed:null toolsTotal:null",
        "CMD: jq -e \".overall.ok == true\" only",
        "GATE-EXIT=0"
      ]
    },
    "remediated_gate_plan_s29_h03": {
      "description": "Current gate-plan.json after REDHAT-FIX-S29-H03: six real-cli steps with conjunctive multi-field oracles; remediated_at 20260802T020000Z; dispatcher bun services/platform/src/cli/holo.ts.",
      "seed_method": "recorded_external",
      "records": [
        "gate-plan.json:31-38 step1 cutover:go-no-go + failed_count==0",
        "gate-plan.json:96-106 step5 toolsPassed==toolsTotal non-null",
        "gate-plan.json notes: historical false-pass under .gate-evidence/20260802T004525Z/"
      ]
    },
    "fresh_gate_run_context": {
      "description": "Operator context for a new run: export new GATE_RUN_ID (\u226020260802T004525Z), capture git rev-parse HEAD, set HOLO_VERIFY_BASE_URL/PLATFORM_URL to deployed identity under test, wall-clock start timestamp.",
      "seed_method": "cli",
      "records": [
        "GATE_RUN_ID=<new ISO or allowlisted id>",
        "git rev-parse HEAD \u2192 source_sha field",
        "deployed base URL / generation recorded in meta",
        "mkdir -p .gate-evidence/$GATE_RUN_ID"
      ]
    },
    "complete_cutover_cli_surface": {
      "description": "Registered holo cutover:* verbs required by gate-plan: go-no-go, freeze, quiet-check, run-etl, flip, verify-soak (+ write probe surface).",
      "seed_method": "cli",
      "records": [
        "bun services/platform/src/cli/holo.ts --help lists cutover: verbs",
        "gate-plan.json steps[].literal_cmd each contain cutover: or documented write probe"
      ]
    },
    "sibling_remediation_incomplete_marker": {
      "description": "Optional RED/negative fixture representing incomplete R2-C01..C04 / R2-H02..H04 \u2014 re-run may produce honest step failures; harness must not upgrade to pass by reusing stale 6/6.",
      "seed_method": "public_api",
      "records": [
        "durable fence still boot-time env override (R2-C01 open)",
        "drain residual non-zero (R2-C02 open)",
        "mutable parity baseline (R2-C03 open)",
        "rollback writes only .tmp (R2-C04 open)",
        "loopback-only MCP (R2-H02 open)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-008",
      "description": "GIVEN stale_gate_results_s29_20260802T004525Z and remediated_gate_plan_s29_h03 WHEN the Sprint 29 human-gate freshness oracle suite runs THEN it FAILS closed: run_id 20260802T004525Z must not be accepted as pass evidence for the remediated plan/source; failure names the stale run_id and/or contradicts historical step1 length-only / step5 null-tools lineage vs current predicates (H-01 RED phase).",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'R2-H01|stale|freshness' ; jq -e '.run_id == \"20260802T004525Z\" and .verdict == \"pass\"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json >/dev/null && echo 'STALE_PASS_PRESENT \u2014 freshness suite MUST fail while this is true'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "sprint29-human-gate-freshness",
        "flow_ref": "T-SYNC-008",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stale_gate_results_s29_20260802T004525Z",
            "action": {
              "actor": "tester",
              "steps": [
                "Load gate-results.json and gate-plan.json",
                "Assert run_id 20260802T004525Z is disallowed as current pass for remediated plan",
                "Cross-check historical step1.log is length-only with failed_count=5",
                "Cross-check historical step5.log has null tools counters",
                "Fail closed with named stale-run / contradiction reason"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-1 report field ok equals true OR exit_code equals 1",
                "AC-1 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1",
                "failure message or assertion names 20260802T004525Z and/or failed_count/toolsPassed lineage",
                "AC-1 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN remediated_gate_plan_s29_h03 and complete_cutover_cli_surface and fresh_gate_run_context WHEN the human-gate re-run harness (or documented operator procedure driven by gate-plan literal_cmd) executes steps 1\u20136 THEN each step invokes bun services/platform/src/cli/holo.ts cutover:<verb> (or documented step6 write probe after flip) and evaluates the current conjunctive jq oracle \u2014 not historical length-only / overall.ok-only peeks; step1 requires overall.ok==true AND failed_count==0 for green (or honest fail).",
      "verify": "jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json; jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'cutover:go-no-go' && jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'rerun|literal_cmd|six.steps|R2-H01'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+holo-cutover-cli",
        "flow_ref": "T-SYNC-009",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "remediated_gate_plan_s29_h03",
            "action": {
              "actor": "operator",
              "steps": [
                "Parse gate-plan.json steps 1\u20136",
                "Assert each literal_cmd references bun services/platform/src/cli/holo.ts and cutover verb family",
                "Assert step1 requires failed_count==0 and overall.ok",
                "Assert step5 requires non-null toolsPassed==toolsTotal",
                "Dry-run or fixture-run harness writes planned CMD lines for new run_id"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-2 report field ok equals true OR exit_code equals 1",
                "AC-2 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1",
                "step1 cutover:go-no-go + failed_count==0 predicate",
                "step2\u20136 conjunctive multi-field oracles per H03",
                "AC-2 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN fresh_gate_run_context WHEN a re-run is executed (full or harness-mediated) THEN gate-results.json is rewritten with run_id \u2260 20260802T004525Z; .gate-evidence/{new-run-id}/step{1..6}.log exist; evidence and/or gate-results record source git SHA, deployed service identity (base URL and/or generation), and wall-clock timestamps; GATE-RESULTS.md cites the same run_id and honest verdict (pass only if all six current oracles pass; else fail/partial without claiming 6/6).",
      "verify": "test -f .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json && jq -e '.run_id != \"20260802T004525Z\" and (.source_sha // .git_sha // .tree_sha // .meta.source_sha) != null and ((.deployed_base_url // .meta.deployed_base_url // .service_identity // .meta.service_identity) != null)' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json; RID=$(jq -r '.run_id' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json); for n in 1 2 3 4 5 6; do test -s .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/$RID/step$n.log || test -s .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/$RID/step${n}.log; done; rg -F \"$RID\" .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-results+evidence-meta",
        "flow_ref": "T-SYNC-010",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_gate_run_context",
            "action": {
              "actor": "operator",
              "steps": [
                "export GATE_RUN_ID and capture git rev-parse HEAD",
                "record HOLO_VERIFY_BASE_URL/PLATFORM_URL/generation",
                "execute six gate-plan steps into .gate-evidence/$GATE_RUN_ID/",
                "write gate-results.json with meta + per-step results",
                "update GATE-RESULTS.md to match"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-3 report field ok equals true OR exit_code equals 1",
                "AC-3 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "run_id != 20260802T004525Z",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-3 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
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
      "flow_ref": "T-SYNC-008",
      "description": "GIVEN complete_cutover_cli_surface WHEN step1 cutover:go-no-go runs under the re-run harness THEN the produced go-no-go report is the full eight-gate report; green requires overall.ok==true AND failed_count==0 (and gates length 8 with collectedTests where applicable); if failed_count>0 the step MUST fail closed and must not be recorded as pass via length-only jq (lineage: historical step1.log failed_count=5 with EXIT=0).",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|step.1|C01|go-no-go'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-1|go-no-go|failed_count'; jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count == 0'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cutover-go-no-go",
        "flow_ref": "T-SYNC-008",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "historical_false_pass_step1_log",
            "action": {
              "actor": "tester",
              "steps": [
                "Build fixture report {gates: length 8, failed_count: 5, overall.ok: false or true}",
                "Evaluate current step1 oracle",
                "Confirm fail closed"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-4 report field ok equals true OR exit_code equals 1",
                "AC-4 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "oracle fail when failed_count!=0",
                "AC-4 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN sibling_remediation_incomplete_marker (R2-C01..C04 and/or R2-H02..H04 still open) WHEN re-run harness/freshness oracles are evaluated THEN those ACs can still be GREEN (freshness fails on stale pass; harness can execute and record honest per-step fail); end-to-end gate-results MUST NOT claim verdict pass 6/6 by reusing 20260802T004525Z or by weakening predicates \u2014 honest fail/partial is required until siblings land; SPRINT.md/docs state the dependency explicitly.",
      "verify": "rg -n 'R2-C01|R2-H02|20260802T004525Z|honest fail|sibling' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/REDHAT-FIX-S29-R2-H01*.md 2>/dev/null; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'honest|sibling|no.fake.pass|R2-H01'; python3 - <<'PY'\nimport json,pathlib\np=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json')\ng=json.loads(p.read_text())\nif g.get('run_id')=='20260802T004525Z' and g.get('verdict')=='pass':\n  raise SystemExit('FAIL: stale pass still current \u2014 R2-H01 not closed')\nif g.get('verdict')=='pass':\n  assert g.get('steps_passed')==g.get('steps_total')==g.get('steps_executed')\n  assert g.get('run_id')!='20260802T004525Z'\nprint('ok', g.get('run_id'), g.get('verdict'))\nPY",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-honesty+docs",
        "flow_ref": "T-SYNC-010",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub: returns ok without real CLI/service",
            "empty: empty start state still greens",
            "mock: mocked dependency without live I/O",
            "static: hard-coded green report"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sibling_remediation_incomplete_marker",
            "action": {
              "actor": "operator",
              "steps": [
                "Run freshness suite (must fail closed on stale pass)",
                "Run harness capability checks (must pass)",
                "If live steps fail due to open siblings, record fail/partial",
                "Refuse to copy 20260802T004525Z as pass"
              ]
            },
            "end_state": {
              "must_observe": [
                "AC-5 report field ok equals true OR exit_code equals 1",
                "AC-5 evidence_bytes count >= 1",
                "artifact path contains literal 'redhat-fix-s29-r2'",
                "explicit dependency on R2-C01..C04 / R2-H02..H04 for full 6/6",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1",
                "AC-5 observed_status equals literal 'PASS' and observed_count >= 1"
              ],
              "must_not_observe": [
                "empty/start signature: empty result or (0) count or none",
                "stub green without real dependency",
                "mock-only success"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Freshness suite fails closed while gate-results.json is stale pass run_id 20260802T004525Z",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-freshness.test.ts -t 'stale|R2-H01|freshness'"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Historical step1 length-only + failed_count=5 fixture fails current step1 oracle",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|length'; PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-1|failed_count'"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Historical step5 null tools fixture fails current step5 oracle",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-5|null.tools|H-03'"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "All six gate-plan steps reference cutover CLI via bun dispatcher with conjunctive predicates",
      "maps_to_ac": "AC-2",
      "verify": "jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && jq -r '.steps[]|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -c 'bun services/platform/src/cli/holo.ts' && jq -r '.steps[]|select(.n==1)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'failed_count == 0'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "After re-run: gate-results run_id != 20260802T004525Z and evidence dir has six non-empty step logs; SHA + deployed identity present",
      "maps_to_ac": "AC-3",
      "verify": "jq -e '.run_id != \"20260802T004525Z\"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json && RID=$(jq -r .run_id .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json) && test -d .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/$RID && jq -e '(.source_sha // .git_sha // .meta.source_sha) and (.deployed_base_url // .meta.deployed_base_url // .service_identity // .meta.service_identity)' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "GATE-RESULTS.md cites fresh run_id (not only stale 20260802T004525Z as current VERIFIED)",
      "maps_to_ac": "AC-3",
      "verify": "python3 - <<'PY'\nimport json,pathlib\nroot=pathlib.Path('.spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip')\ng=json.loads((root/'gate-results.json').read_text())\nmd=(root/'GATE-RESULTS.md').read_text()\nassert g['run_id']!='20260802T004525Z' or g.get('verdict')!='pass', 'stale pass still current'\nif g.get('verdict')=='pass':\n  assert g['run_id'] in md\nprint('ok', g['run_id'], g.get('verdict'))\nPY"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "No fake-pass: if verdict pass then steps_passed==steps_total and run is not historical false-pass id",
      "maps_to_ac": "AC-5",
      "verify": "jq -e 'if .verdict==\"pass\" then (.run_id != \"20260802T004525Z\" and .steps_passed == .steps_total and .steps_executed == .steps_total) else true end' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "Typecheck and biome clean on write_allowed paths",
      "maps_to_ac": "AC-2",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/tests/integration/sprint29-human-gate-freshness.test.ts services/platform/tests/integration/sprint29-human-gate-oracles.test.ts 2>/dev/null || pnpm biome check ."
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "sprint29-human-gate-freshness-oracle",
    "sprint29-fresh-gate-rerun-harness",
    "gate-results-bound-to-remediated-sha",
    "deployed-identity-and-sha-in-gate-evidence",
    "honest-fail-closed-partial-gate-when-siblings-blocked"
  ],
  "consumes": [
    "gate-plan.json remediated by REDHAT-FIX-S29-H03",
    "cutover:go-no-go failed_count oracle from REDHAT-FIX-S29-C01",
    "bun services/platform/src/cli/holo.ts cutover:* dispatcher",
    "sprint29-human-gate-oracles.test.ts",
    "historical .gate-evidence/20260802T004525Z false-pass lineage"
  ],
  "boundary_contracts": [
    {
      "name": "stale-run-id-never-pass-for-remediated-target",
      "rule": "Authoritative gate-results.json MUST NOT present run_id 20260802T004525Z (or any run whose evidence predates gate-plan remediated_at / current source SHA) as verdict:pass evidence for the remediated cutover target. Freshness oracles MUST fail closed if run_id is that historical id while gate-plan notes remediation REDHAT-FIX-S29-H03 / remediated_at is set.",
      "sides": [
        "gate-results.json",
        "GATE-RESULTS.md",
        "freshness oracle suite",
        "red-hat H-01"
      ]
    },
    {
      "name": "current-plan-predicates-only",
      "rule": "Every re-run step MUST evaluate the current gate-plan.json conjunctive predicates (step1: overall.ok + failed_count==0 + 8 gates; step2: ok\u2227env_value\u2227fence_armed_at; step3: accepted==0\u2227rejected>0\u2227windowSeconds; step4: ok\u2227unexplainedVariance==0\u2227non-empty\u2227fk\u2227vectors; step5: toolsPassed==toolsTotal non-null + jobs/article/hono/reads; step6: HTTP 423 + migration_read_only). Historical length-only / overall.ok-only greening is forbidden.",
      "sides": [
        "gate-plan.json",
        "step logs",
        "human-gate oracles"
      ]
    },
    {
      "name": "real-cli-not-jq-peek",
      "rule": "All six steps MUST execute real CLI actions via bun services/platform/src/cli/holo.ts cutover:<verb> (or the documented step6 write probe after flip). A step whose sole action is jq on pre-baked go-no-go-report.json / .tmp JSON is invalid evidence.",
      "sides": [
        "gate-plan literal_cmd",
        ".gate-evidence step logs CMD lines",
        "dispatcher help surface"
      ]
    },
    {
      "name": "evidence-binds-sha-and-deployed-identity",
      "rule": "Fresh evidence MUST record: git SHA (or equivalent tree identity) of the tree under test; deployed service identity (HOLO_VERIFY_BASE_URL / PLATFORM_URL / generation id \u2014 not anonymous free-port child alone as sole identity when deployment is claimed); wall-clock timestamps for the run and each step.",
      "sides": [
        "gate-results.json metadata",
        "step logs / GATE-META",
        "verify-soak / flip reports"
      ]
    },
    {
      "name": "sibling-dependency-honest-fail",
      "rule": "Full green 6/6 may depend on R2-C01..C04 and R2-H02..H04 landing first. This task's re-run harness and freshness oracles MUST be independently GREEN (testable) even when e2e 6/6 is blocked. NEVER write verdict:pass by copying historical results or weakening oracles to hide incomplete remediations.",
      "sides": [
        "gate-results.json verdict",
        "SPRINT.md status note",
        "sibling R2 tasks"
      ]
    }
  ],
  "proposed_by": "devops-engineer",
  "source_finding": {
    "id": "H-01",
    "severity": "HIGH",
    "report": ".spec/reviews/red-hat-20260802T022855Z-sprint-29-main-sha-cab5c0717974a96e33c338105b5d198d82cb607d.md",
    "reviewed_sha": "cab5c0717974a96e33c338105b5d198d82cb607d",
    "related": [
      "remediation recommendation #5",
      "REDHAT-FIX-S29-C01",
      "REDHAT-FIX-S29-H03",
      "stale gate-results 20260802T004525Z",
      "cycle-2 BLOCK at cab5c071"
    ],
    "locations": [
      ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-results.json:7-14",
      ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step1.log",
      ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step5.log",
      ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:31-38,96-106",
      ".spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/GATE-RESULTS.md"
    ]
  }
}
-->

</details>
