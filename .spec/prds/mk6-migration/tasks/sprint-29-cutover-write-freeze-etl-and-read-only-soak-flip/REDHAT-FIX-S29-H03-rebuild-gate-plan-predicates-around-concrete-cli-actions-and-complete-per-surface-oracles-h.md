# REDHAT-FIX-S29-H03 — Rebuild gate-plan predicates around concrete CLI actions and complete per-surface oracles (H-03; gate-plan.json:23-68)

## What this does

Remediate red-hat HIGH finding H-03 (red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:94-100). Steps 2–5 inspect isolated JSON values rather than perform named actions (gate-plan.json:23-68): step 2 accepts any of ok/env/timestamp; step 3 omits rejected-write and duration; step 4 omits source non-emptiness/FK/vectors/report ok; step 5 checks only overall.ok. Step-5 evidence has toolsPassed:null toolsTotal:null while still passing (.gate-evidence/20260802T004525Z/step5.log:3-11). Rebuild t…

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-H03). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-008, T-SYNC-009, T-SYNC-010. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && jq -r '.steps[] | .literal_cmd'`
- `! jq -r '.steps[]|select(.n==2)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q '\) or \('`
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts`
- `pnpm tsgo --noEmit`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md, services/platform/tests/integration/sprint29-human-gate-oracles.test.ts, services/platform/tests/integration/sprint29-go-no-go.test.ts, services/platform/src/cli/holo.ts, .tmp/REDHAT-FIX-S29-H03/**

Prohibited: Weakening oracles to match incomplete soak/ETL reports, Leaving or_semantics any / jq any-of on freeze step, Accepting toolsPassed:null as green, Fabricating gate-results.json green without real CLI, Rewriting historical .gate-evidence/20260802T004525Z/** to erase false-pass lineage, Implementing durable distributed fence (owned by REDHAT-FIX-S29-C02) beyond documenting residual in step 6 notes

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-H03 — Rebuild gate-plan predicates around concrete CLI actions and complete per-surface oracles (H-03; gate-plan.json:23-68)
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
gate-plan.json steps 1–6 each have a real cutover CLI literal_cmd and a conjunctive multi-field oracle; a fixture soak report with overall.ok true but null tools counters fails step 5; any-of freeze fields cannot green step 2; ETL step cannot green on variance 0 alone with empty source.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST — Rebuild ALL 6 gate-plan steps so each invokes a documented CLI operation (not isolated jq on pre-baked .tmp JSON alone as the action)
- MUST — Step 2: run cutover:freeze (or documented fence arm) and require ok==true AND env_value=="1" AND fence_armed_at>0 (require-all, not any-of)
- MUST — Step 3: run cutover:quiet-check and require acceptedWriteCount==0 AND rejectedWriteCount>0 AND windowSeconds>=declared AND ok==true
- MUST — Step 4: run cutover:run-etl and require ok==true AND unexplainedVariance==0 AND source non-emptiness (e.g. loadedByTable.documents>0 or archive rowCounts) AND fkAudit.ok AND vectors.ok (or explicit documented vectors stage result) AND stages.nonEmpty==true
- MUST — Step 5: run cutover:verify-soak (and/or flip+verify sequence) and require overall.ok==true AND toolsPassed==toolsTotal AND toolsTotal>0 AND toolsPassed/toolsTotal non-null AND jobsAccounted==jobsTotal AND article.ok AND honoWrite.ok AND reads subresult ok AND zeroWritePath explicit
- MUST — Step 6: prove write returns migration_read_only on a real surface without solely relying on ad-hoc env injection that bypasses flip propagation (align with durable fence once C-02 lands; until then document residual honestly but still assert 423/migration_read_only body)
- MUST — Add integration coverage that fails fixtures with toolsPassed:null toolsTotal:null and any-of single-field step-2 success
- NEVER leave step 2 as `(.ok==true) or (.env_value=="1") or (.fence_armed_at>0)` any-of (gate-plan.json:28)
- NEVER leave step 3 as acceptedWriteCount==0 alone without rejectedWriteCount and duration/window
- NEVER leave step 4 as unexplainedVariance==0 alone without non-empty/FK/vectors/report ok
- NEVER leave step 5 as overall.ok==true alone while toolsPassed/toolsTotal may be null (step5.log lineage)
- NEVER treat pre-existing .tmp/D06-* JSON as proof without re-running the named CLI that produces it
- NEVER weaken oracles to match incomplete soak reports
- STRICTLY every step method remains real-cli with bun services/platform/src/cli/holo.ts dispatcher
- STRICTLY multi-claim steps use require-all / conjunctive jq -e, never or_semantics any for success tokens
- STRICTLY per-surface subresults for soak: tools, reads, article, jobs, honoWrite/write-fence must be named in the step oracle
- STRICTLY CAP-MIG-01 ETL step is fail-closed on empty export variance green

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN weak_gate_plan_s29 and complete_cutover_cli_surface WHEN gate-plan.json is rebuil...
- [ ] AC-2: GIVEN null_tools_soak_report matching .gate-evidence/20260802T004525Z/step5.log WHEN re...
- [ ] AC-3: GIVEN partial_freeze_report and empty_variance_etl_report WHEN step 2 and step 4 oracle...
- [ ] AC-4: GIVEN a quiet-check report with acceptedWriteCount==0 but rejectedWriteCount==0 or wind...
- [ ] AC-5: GIVEN SPRINT.md Human Testing Gate steps 1–6 and rebuilt gate-plan WHEN docs and plan a...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — all 6 gate steps invoke concrete CLI actions with complete conjunctive oracles (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN weak_gate_plan_s29 and complete_cutover_cli_surface WHEN gate-plan.json is rebuilt for steps 1–6 THEN each step n has literal_cmd invoking bun services/platform/src/cli/holo.ts cutover:<verb> for the documented human-test action; assertions require the full per-step oracle set (step1: go-no-go overall.ok+failed_count+collectedTests; step2: freeze ok∧env_value∧fence_armed_at; step3: quiet accepted==0∧rejected>0∧windowSeconds∧ok; step4: run-etl ok∧unexplainedVariance==0∧non-empty∧fk∧vectors; step5: verify-soak overall.ok∧toolsPassed==toolsTotal>0∧non-null∧jobs∧article∧honoWrite∧reads; step6: write returns migration_read_only with status 423 or MCP MIGRATION_READ_ONLY)
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+holo-cutover-cli
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts; jq -e '[.steps[].n] | sort == [1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json; jq -r '.steps[] | "\(.n) \(.literal_cmd)"' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -v 'jq -e' | wc -l`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if any step remains jq-only on pre-baked JSON without a CLI action; step 2 still uses or-semantics any-of; step 5 still only checks overall.ok; stub/echo CLI replaces real cutover verbs
  START_REF: weak_gate_plan_s29
  MUST_OBSERVE: step1 literal_cmd contains cutover:go-no-go; step2 literal_cmd contains cutover:freeze (or freeze+report write path) and assertion requires ok and env_value and fence_armed_at; step3 literal_cmd contains cutover:quiet-check and assertion requires acceptedWriteCount==0 and rejectedWriteCount>0 and windowSeconds; step4 literal_cmd contains cutover:run-etl and assertion requires unexplainedVariance==0 and ok and non-empty source and fk/vectors; step5 literal_cmd contains cutover:verify-soak (and flip if sequenced) and assertion requires toolsPassed==toolsTotal and non-null counters and article/jobs/honoWrite; step6 proves migration_read_only write rejection
  MUST_NOT_OBSERVE: step2 (.ok==true) or (.env_value=="1") or (.fence_armed_at>0); step5 overall.ok only with toolsPassed null allowed; empty/start signature: all steps still jq-only on .tmp without CLI
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Null toolsPassed/toolsTotal soak report fails step-5 oracle (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN null_tools_soak_report matching .gate-evidence/20260802T004525Z/step5.log WHEN remediated step-5 oracle is evaluated THEN oracle fails because toolsPassed/toolsTotal are null or toolsPassed!=toolsTotal or toolsTotal==0 despite overall.ok==true
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-oracle-fixture
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-5|null.tools|H-03'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if overall.ok alone still greens step 5; null tools counters accepted as pass
  START_REF: null_tools_soak_report
  MUST_OBSERVE: predicate fails; failure names toolsPassed or toolsTotal
  MUST_NOT_OBSERVE: exit 0 as in step5.log GATE-EXIT=0; empty/start signature: overall.ok-only greening
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — Partial freeze and empty ETL reports fail their steps under require-all oracles (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN partial_freeze_report and empty_variance_etl_report WHEN step 2 and step 4 oracles are evaluated THEN step 2 fails if any of ok/env_value/fence_armed_at is missing/false; step 4 fails if non-empty/FK/vectors/ok incomplete despite unexplainedVariance==0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-oracle-fixture
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-2|step-4|partial-freeze|empty-etl|H-03'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if any-of still greens step 2 on fence_armed_at alone; variance==0 alone greens empty ETL
  START_REF: partial_freeze_report
  MUST_OBSERVE: step2 fail on partial freeze; step4 fail on empty non-empty/fk/vectors despite variance 0
  MUST_NOT_OBSERVE: step2 pass from single alternate field; step4 pass from unexplainedVariance==0 only
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Quiet-check step requires rejected writes and measured window (flow_ref T-SYNC-009)
  GIVEN/WHEN/THEN: GIVEN a quiet-check report with acceptedWriteCount==0 but rejectedWriteCount==0 or windowSeconds missing/zero WHEN step 3 oracle is evaluated THEN oracle fails; success requires acceptedWriteCount==0 AND rejectedWriteCount>0 AND windowSeconds>= plan minimum AND ok==true
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-oracle-fixture
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-3|quiet|rejected'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if acceptedWriteCount==0 alone greens idle empty window; mock quiet report without rejectedWriteCount
  START_REF: complete_cutover_cli_surface
  MUST_OBSERVE: fail when rejectedWriteCount==0; pass only when rejectedWriteCount>0 and windowSeconds set
  MUST_NOT_OBSERVE: acceptedWriteCount==0-only greening as gate-plan.json:39
  EVIDENCE: file_artifact (required_capture=True)

### AC-5 — SPRINT.md Human Test Deliverable stays aligned with gate-plan CLI verbs (flow_ref T-SYNC-010)
  GIVEN/WHEN/THEN: GIVEN SPRINT.md Human Testing Gate steps 1–6 and rebuilt gate-plan WHEN docs and plan are reviewed together THEN each human-test step text maps 1:1 to a gate-plan step with the same cutover verb family; no step documents a jq-only check as the action
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: docs+gate-plan
  VERIFY: `rg -n 'cutover:(go-no-go|freeze|quiet-check|run-etl|flip|verify-soak)' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if SPRINT still describes actions while gate-plan only jq peeks; verbs drift between docs and plan
  START_REF: complete_cutover_cli_surface
  MUST_OBSERVE: six steps present; each maps to a cutover CLI verb family; dispatcher documented
  MUST_NOT_OBSERVE: jq-only actions presented as human test steps; empty/start signature: SPRINT unchanged while plan still weak
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | all six gate-plan steps exist and each literal_cmd references cutover: CLI vi... | AC-1 | `jq -e '[.steps[].n]\|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cuto...` |
| TC-2 | step 2 oracle is conjunctive (no or of ok/env/timestamp) | AC-1 | `! jq -r '.steps[]\|select(.n==2)\|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-2...` |
| TC-3 | null tools soak fixture fails step-5 oracle | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-4 | partial freeze and empty ETL fixtures fail steps 2 and 4 | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-5 | step 3 requires rejectedWriteCount>0 and windowSeconds | AC-4 | `jq -r '.steps[]\|select(.n==3)\|tostring' .spec/prds/mk6-migration/tasks/sprint-29-cuto...` |
| TC-6 | human-gate oracle suite and typecheck/biome clean | AC-1 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md
- services/platform/tests/integration/sprint29-human-gate-oracles.test.ts
- services/platform/tests/integration/sprint29-go-no-go.test.ts
- services/platform/src/cli/holo.ts
- .tmp/REDHAT-FIX-S29-H03/**
writeProhibited:
- Weakening oracles to match incomplete soak/ETL reports
- Leaving or_semantics any / jq any-of on freeze step
- Accepting toolsPassed:null as green
- Fabricating gate-results.json green without real CLI
- Rewriting historical .gate-evidence/20260802T004525Z/** to erase false-pass lineage
- Implementing durable distributed fence (owned by REDHAT-FIX-S29-C02) beyond documenting residual in step 6 notes

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:94-100 [H-03 HIGH — gate-plan oracles weaker than declared steps; rebuild with CLI+complete oracles]
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:47 [D06-05 AC-6 FAIL — toolsPassed:null toolsTotal:null still passing]
3. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:23-68 [Steps 2–5 weak jq predicates]
4. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:11-82 [Full six-step plan for rebuild scope]
5. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step5.log:1-12 [toolsPassed:null toolsTotal:null with GATE-EXIT=0]
6. services/platform/src/cutover/convex-fence-client.ts:30-42,397-404 [freeze env_value/fence_armed_at; quiet accepted/rejected/windowSeconds ok]
7. services/platform/src/cutover/etl-orchestrate.ts:43-88 [CutoverEtlReport ok, unexplainedVariance, stages, fkAudit, vectors, nonEmpty]
8. services/platform/src/cutover/soak-fence.ts:362-607,876-1013 [toolsPassed/toolsTotal, jobsAccounted, verify-soak overall and subreports]
9. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md:44-58 [Human Test Deliverable steps 1–6]
10. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-03-durable-write-fence-cron-queue-drain-quiet-interval.md:56-86 [quiet-check accepted=0 rejected>0 contract]
11. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-04-capture-export-watermark-orchestrate-the-one-time-etl-run.md:70-80 [ETL non-empty + unexplainedVariance TC]
12. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-05-flip-app-plus-mcp-into-rollbackable-read-only-soak-run-verification-ga.md:22-97 [verify-soak aggregate tools/reads/article/jobs]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- gate-plan-six-cli-steps: `jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && jq -r '.steps[] | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -c 'cutover:' ` → 6 steps; each references cutover: CLI
- no-any-of-step2: `! jq -r '.steps[]|select(.n==2)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q '\) or \('` → step 2 not any-of
- human-gate-oracles: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts` → exit 0; null-tools and partial-freeze negatives fail closed
- typecheck: `pnpm tsgo --noEmit` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-22-r-8-replace-weak-any-of-gate-oracles-with-concrete-require-all-success-assertions.md, .spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/REDHAT-FIX-H2-make-sprint-28-human-testing-gate-commands-executable.md
Interaction notes:
- Depends on / coordinates with REDHAT-FIX-S29-C01 for step-1 failed_count oracle — do not reintroduce length-only step 1.
- Step 6 write-fence proof remains limited by C-02 durable fence residual; H03 still must not use weak oracles that green on env injection alone without asserting 423/migration_read_only body.
- ETL step is CAP-MIG-01; do not drop non-empty/FK/vectors requirements.
pattern: Each human-gate step = real CLI action + conjunctive multi-field oracle + fixture negative controls for any-of/null/empty greening.
pattern_source: H-03 remediation paragraph; D06-03/04/05 report schemas; Sprint 27 require_all gate oracles
anti_pattern: jq peek at pre-baked .tmp reports as the action; any-of freeze fields; overall.ok with null tools counters; variance-only ETL green

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — Rebuilding all six human-gate steps so each invokes a documented cutover CLI operation and asserts a complete multi-field oracle is human-gate / CI plan engineering. Weak any-of jq predicates and null toolsPassed/toolsTotal while overall.ok greening are classic gate-provability failures owned by devops-engineer (same class as Sprint 27 R-8 / Sprint 28 H-2).
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: devops-engineer

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-02, D06-03, D06-04, D06-05, REDHAT-FIX-S29-C01
Blocks: —

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Preserves finding H-03 from red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md @ SHA 2b966c7b60559ec9986cf737ed5322a6146c7960. Evidence lineage: gate-plan.json:23-68; step5.log toolsPassed:null; D06-05 AC-6 FAIL. PRIMARY AC rebuilds all 6 steps with concrete CLI+oracle. CAP-MIG-01 applies to ETL step 4. New test file sprint29-human-gate-oracles.test.ts is preferred (mirrors S28 human-gate-oracles pattern). proposed_by: devops-engineer.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-H03",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "weak_gate_plan_s29": {
      "description": "Current gate-plan.json steps 1\u20136 with jq-only / any-of / incomplete oracles as committed at reviewed SHA.",
      "seed_method": "public_api",
      "records": [
        "step2 or of ok/env/timestamp",
        "step3 acceptedWriteCount==0 only",
        "step4 unexplainedVariance==0 only",
        "step5 overall.ok only",
        "paths under .tmp/D06-03..05"
      ]
    },
    "null_tools_soak_report": {
      "description": "verify-soak-shaped JSON with overall.ok=true, toolsPassed=null, toolsTotal=null (lineage step5.log).",
      "seed_method": "public_api",
      "records": [
        "overall.ok true",
        "toolsPassed null",
        "toolsTotal null",
        "jobsAccounted may be nonzero"
      ]
    },
    "partial_freeze_report": {
      "description": "flip/freeze report with only fence_armed_at>0 but ok false and env_value not 1 \u2014 must fail require-all step 2.",
      "seed_method": "public_api",
      "records": [
        "fence_armed_at > 0",
        "ok false or env_value != \"1\""
      ]
    },
    "empty_variance_etl_report": {
      "description": "watermark/ETL report with unexplainedVariance==0 but empty documents and/or fkAudit.ok false / vectors.ok false / stages.nonEmpty false.",
      "seed_method": "public_api",
      "records": [
        "unexplainedVariance 0",
        "loadedByTable.documents 0 or archive empty",
        "stages.nonEmpty false"
      ]
    },
    "complete_cutover_cli_surface": {
      "description": "Registered holo cutover:* verbs: go-no-go, freeze, quiet-check, run-etl, flip, verify-tools, verify-reads, verify-soak.",
      "seed_method": "cli",
      "records": [
        "bun services/platform/src/cli/holo.ts --help lists cutover: verbs",
        "report schemas in convex-fence-client / etl-orchestrate / soak-fence"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN weak_gate_plan_s29 WHEN gate-plan steps 1\u20136 are rebuilt THEN every step invokes a documented cutover CLI and asserts the complete multi-field oracle including tools/reads/article/jobs/write-fence for soak",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+holo-cutover-cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "any step remains jq-only without CLI action",
            "step 2 any-of remains",
            "step 5 overall.ok only"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "weak_gate_plan_s29",
            "action": {
              "actor": "operator",
              "steps": [
                "Rewrite all six steps",
                "Run oracle suite"
              ]
            },
            "end_state": {
              "must_observe": [
                "six cutover CLI literal_cmds",
                "conjunctive multi-field oracles",
                "per-surface soak subresults named"
              ],
              "must_not_observe": [
                "any-of freeze oracle",
                "overall.ok-only soak",
                "jq-only entire plan"
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
      "flow_ref": "T-SYNC-010",
      "description": "GIVEN null_tools_soak_report WHEN step-5 oracle runs THEN fail despite overall.ok true",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-5|null.tools|H-03'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-oracle-fixture",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "overall.ok alone still greens step 5"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "null_tools_soak_report",
            "action": {
              "actor": "tester",
              "steps": [
                "Evaluate step-5 oracle"
              ]
            },
            "end_state": {
              "must_observe": [
                "fail",
                "names toolsPassed/toolsTotal"
              ],
              "must_not_observe": [
                "GATE-EXIT=0 greening"
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
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN partial_freeze_report and empty_variance_etl_report WHEN steps 2 and 4 oracles run THEN both fail under require-all",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-2|step-4'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-oracle-fixture",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "any-of greens freeze",
            "variance-only greens ETL"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "partial_freeze_report",
            "action": {
              "actor": "tester",
              "steps": [
                "Evaluate step2 and step4 oracles"
              ]
            },
            "end_state": {
              "must_observe": [
                "step2 fail",
                "step4 fail"
              ],
              "must_not_observe": [
                "single-field pass"
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
      "flow_ref": "T-SYNC-009",
      "description": "GIVEN quiet report with rejectedWriteCount==0 WHEN step-3 oracle runs THEN fail; success requires accepted==0 and rejected>0 and windowSeconds",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-3|quiet'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-oracle-fixture",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "acceptedWriteCount==0 alone greens"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "complete_cutover_cli_surface",
            "action": {
              "actor": "tester",
              "steps": [
                "Evaluate step-3 on idle empty rejected window"
              ]
            },
            "end_state": {
              "must_observe": [
                "fail on rejected==0",
                "require windowSeconds"
              ],
              "must_not_observe": [
                "accepted-only greening"
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
      "description": "GIVEN SPRINT.md and gate-plan WHEN reviewed THEN human steps align with cutover CLI verbs and dispatcher",
      "verify": "rg -n 'cutover:(go-no-go|freeze|quiet-check|run-etl|flip|verify-soak)' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "docs+gate-plan",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "docs/plan verb drift",
            "jq-only actions remain documented"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "complete_cutover_cli_surface",
            "action": {
              "actor": "operator",
              "steps": [
                "Align SPRINT and gate-plan"
              ]
            },
            "end_state": {
              "must_observe": [
                "1:1 step mapping",
                "dispatcher documented"
              ],
              "must_not_observe": [
                "jq-only human actions"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "all six gate-plan steps exist and each literal_cmd references cutover: CLI",
      "verify": "jq -e '[.steps[].n]|sort==[1,2,3,4,5,6]' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "step 2 oracle is not any-of ok/env/timestamp",
      "verify": "! jq -r '.steps[]|select(.n==2)|.literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q ' or '",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "null tools soak fixture fails step-5 oracle",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-5|null.tools|H-03'",
      "maps_to_ac": "AC-2",
      "test_tier": "integration"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "partial freeze and empty ETL fixtures fail steps 2 and 4",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts -t 'step-2|step-4'",
      "maps_to_ac": "AC-3",
      "test_tier": "integration"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "step 3 requires rejectedWriteCount and windowSeconds",
      "verify": "jq -r '.steps[]|select(.n==3)|tostring' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'rejectedWriteCount'",
      "maps_to_ac": "AC-4",
      "test_tier": "integration"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "human-gate oracle suite and typecheck clean",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-human-gate-oracles.test.ts; pnpm tsgo --noEmit",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01",
    "CAP-MIG-01"
  ],
  "provides": [
    "gate-plan.json with six steps each binding a real cutover CLI verb",
    "complete concrete oracles per step (freeze, quiet, ETL, soak, write-fence) including per-tool/read/article/job/write-fence subresults",
    "integration test that rejects any-of / overall.ok-only / null tools* greening"
  ],
  "consumes": [
    "holo cutover:go-no-go (step 1; may consume REDHAT-FIX-S29-C01 step-1 strength)",
    "holo cutover:freeze / quiet-check (D06-03)",
    "holo cutover:run-etl (D06-04 / CAP-MIG-01)",
    "holo cutover:flip / verify-soak (D06-05)",
    "write-fence Hono/MCP proof path (D06-01/D06-05)"
  ],
  "boundary_contracts": [
    "CAP-CUT-01: freeze \u2192 drain \u2192 flip \u2192 read-only soak with migration_read_only on every write path",
    "CAP-MIG-01: one-time ETL + reconciliation unexplainedVariance==0 with non-empty source + FK + vectors stages",
    "UC-SYNC-03 ordered chain must be operator-reproducible via gate-plan literal_cmd"
  ],
  "proposed_by": "devops-engineer"
}
-->

</details>
