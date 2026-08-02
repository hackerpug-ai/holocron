# REDHAT-FIX-S29-C01 — Replace the false go/no-go oracle with real CLI execution and require failed_count=0 (C-01; gate-plan.json:11-20)

## What this does

Remediate red-hat CRITICAL finding C-01 (red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:50-56; AC matrix D06-02 AC-1 FAIL at lines 31, and AC-3–4 FAIL at lines 33–34). Today human-gate step 1 only runs `jq -e ".gates | length == 8" go-no-go-report.json` (gate-plan.json:11-20). Committed evidence prints failed_count:5 and still exits 0 (.gate-evidence/20260802T004525Z/step1.log:1-8). Integration suite substitutes realEchoGate and states full CLI is not required (sprint29-go-no-go.test.ts…

## Why

Remediate red-hat finding for CAP-CUT-01 (REDHAT-FIX-S29-C01). Grounded in UC-SYNC-03 / UC-SYNC-04 / UC-SYNC-03, T-SYNC-008. Review evidence: `.spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md` (reviewed SHA `2b966c7b60559ec9986cf737ed5322a6146c7960`).

## How to verify

- `jq -r '.steps[] | select(.n==1) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'cutover:go-no-go' `
- `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts`
- `bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json; jq -e '.gates|length==8 and has("failed_count") and (.overall.o`
- `pnpm tsgo --noEmit && pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-go-no-go.test.ts services/platform/src/cutover`
- `pnpm tsgo --noEmit` → exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md, services/platform/tests/integration/sprint29-go-no-go.test.ts, services/platform/src/cutover/go-no-go.ts, services/platform/src/cli/holo.ts, .tmp/REDHAT-FIX-S29-C01/**

Prohibited: Rewriting historical .gate-evidence/20260802T004525Z/** to fabricate past green, Hardcoding gate.pass or collectedTests without real subprocess output, Weakening D06-02 AC-1 to length-only, convex/**, services/platform/src/etl/**, Leaving PATH holo stub as the documented dispatcher

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S29-C01 — Replace the false go/no-go oracle with real CLI execution and require failed_count=0 (C-01; gate-plan.json:11-20)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (90 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-CUT-01
SPRINT:     [Sprint 29 — Cutover: Write Freeze, ETL and Read-Only Soak Flip](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-*.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
gate-plan step 1 literal_cmd invokes the real cutover:go-no-go CLI; its assertion fails closed when failed_count>0 or overall.ok==false even if gates.length==8; integration tests that claim production CLI coverage either spawn the real CLI/DEFAULT_GATE_SPECS path or are explicitly scoped away from production green claims; a re-run cannot certify cutover while five harness gates are still failing.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST — Replace gate-plan step 1 literal_cmd from jq length-only to real `bun services/platform/src/cli/holo.ts cutover:go-no-go --json` (optionally with --output to a sprint-scoped report path under the sprint folder or .tmp/D06-02)
- MUST — Assert overall.ok==true AND failed_count==0 AND gates|length==8 AND every vitest gate (unit/integration/live) has collectedTests>0
- MUST — Preserve the full go-no-go-report.json (all gates, exit codes, duration_ms, collectedTests, git_sha, generated_at) as committed gate evidence, not a length scalar alone
- MUST — Fix sprint29-go-no-go.test.ts so any test that claims production CLI / DEFAULT_GATE_SPECS coverage does not substitute realEchoGate success shells for the eight production gates
- MUST — Gate exit code must be non-zero when failed_count>0 or overall.ok==false (CLI process.exit mirrors report.ok)
- NEVER keep step 1 as `jq -e ".gates | length == 8"` alone — that is the C-01 false pass (evidence: failed_count:5 still exits 0)
- NEVER treat gates.length==8 as sufficient proof of green harness
- NEVER claim production CLI coverage while injecting realEchoGate echo/printf vitest summaries for unit/integration/live
- NEVER hardcode collectedTests or pass without parsing real subprocess output
- NEVER rewrite historical .gate-evidence/20260802T004525Z/* logs to fake a past green; re-run gate after remediation for new evidence only when policy allows
- STRICTLY primary oracle is real CLI execution + overall.ok && failed_count==0 && min(vitest collectedTests)>0
- STRICTLY echo-gate module tests may remain only as pure shape/unit tests of runGoNoGo parsing when clearly labeled non-production; they MUST NOT be the sole live/CLI coverage for cutover:go-no-go
- STRICTLY dispatcher path is bun services/platform/src/cli/holo.ts — not a PATH holo stub

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN repo_with_go_no_go_cli and gate-plan.json step 1 currently using jq length-only (...
- [ ] AC-2: GIVEN echo_gate_substituted_suite currently used for AC-1 shape and itLive stating full...
- [ ] AC-3: GIVEN go_no_go_report_with_failed_count_5 matching .gate-evidence/20260802T004525Z/step...
- [ ] AC-4: GIVEN production_default_gate_specs or a short real CLI run that writes go-no-go-report...
- [ ] `pnpm tsgo --noEmit` clean + biome clean on touched paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — gate step 1 runs real cutover:go-no-go CLI and requires overall.ok + failed_count=0 + vitest collectedTests>0 (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN repo_with_go_no_go_cli and gate-plan.json step 1 currently using jq length-only (gate-plan.json:11-20) WHEN step 1 is rebuilt and executed as the documented human-gate command THEN literal_cmd is `bun services/platform/src/cli/holo.ts cutover:go-no-go --json` (or equivalent with --output to a durable path); the step assertion requires gates|length==8 AND overall.ok==true AND failed_count==0 AND min(unit/integration/live collectedTests)>0; process exit is non-zero when any of those fail; full report JSON is preserved as evidence
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-cutover-go-no-go+gate-plan
  VERIFY: `jq -e '.steps[] | select(.n==1) | .literal_cmd | test("cutover:go-no-go")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && ! jq -e '.steps[] | select(.n==1) | .literal_cmd | test("length == 8")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json && PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'gate-plan|production|failed_count|CLI'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step 1 still only jq-checks gates|length==8; failed_count:5 evidence still exits 0 under the new step oracle; overall.ok false is accepted as pass; vitest collectedTests==0 is accepted as green
  START_REF: repo_with_go_no_go_cli
  MUST_OBSERVE: step 1 literal_cmd contains cutover:go-no-go and bun services/platform/src/cli/holo.ts; oracle requires overall.ok==true; oracle requires failed_count==0 (or equivalent jq -e '.failed_count==0'); oracle requires unit/integration/live collectedTests each > 0 (e.g. min>0); fixture with failed_count:5 fails the oracle / non-zero exit
  MUST_NOT_OBSERVE: literal_cmd is only jq -e ".gates | length == 8"; exit 0 on failed_count:5 as in .gate-evidence/20260802T004525Z/step1.log; empty/start signature: length-only pass with no overall.ok check
  EVIDENCE: file_artifact (required_capture=True)

### AC-2 — Production-CLI coverage tests do not substitute realEchoGate for DEFAULT_GATE_SPECS when claiming CLI green (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN echo_gate_substituted_suite currently used for AC-1 shape and itLive stating full CLI is not required (sprint29-go-no-go.test.ts:122-143,267-279) WHEN tests are remediated under red_first THEN any test named/claimed as production CLI coverage or live cutover:go-no-go must either (a) spawn `bun services/platform/src/cli/holo.ts cutover:go-no-go --json` with DEFAULT_GATE_SPECS unbound, or (b) be explicitly renamed/scoped as pure runGoNoGo shape unit coverage that does not assert production green; the itLive block that says full CLI is not required must be removed or replaced with a real CLI assertion path
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: vitest-integration+go-no-go
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts; rg -n 'not required|realEchoGate' services/platform/tests/integration/sprint29-go-no-go.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if itLive still asserts only DEFAULT_GATE_SPECS.length==8 and says full CLI is not required; production green claim still uses printf 'Tests  N passed' echo shells; stub/mock replaces DEFAULT_GATE_SPECS while title claims CLI coverage
  START_REF: echo_gate_substituted_suite
  MUST_OBSERVE: at least one integration/live case spawns real cutover:go-no-go CLI OR runs runGoNoGo without overriding gates (DEFAULT_GATE_SPECS); production claim path asserts failed_count==0 and overall.ok when expecting green; echo-only paths are named as shape/parser tests only
  MUST_NOT_OBSERVE: full CLI suite is not required as the sole live contract; realEchoGate used as the only green path for D06-02 AC-1; empty/start signature: length-8 structural check without execution
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — False-pass lineage is reproducible as fail-closed under the new oracle (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN go_no_go_report_with_failed_count_5 matching .gate-evidence/20260802T004525Z/step1.log shape WHEN the post-remediation step-1 oracle (or a unit harness of that oracle) is evaluated against the fixture THEN evaluation fails (non-zero) because failed_count!=0 and/or overall.ok!=true even though gates|length==8
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-oracle-fixture
  VERIFY: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|false-pass|step1-oracle|C-01'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if oracle still greens on length==8 alone; fixture omitted so the C-01 regression cannot fail
  START_REF: go_no_go_report_with_failed_count_5
  MUST_OBSERVE: predicate false / exit != 0; failure reason names failed_count or overall.ok
  MUST_NOT_OBSERVE: exit 0 solely because gates.length==8; empty/start signature: jq length true as in step1.log
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — Full report artifact fields remain machine-greppable after gate rewrite (flow_ref T-SYNC-008)
  GIVEN/WHEN/THEN: GIVEN production_default_gate_specs or a short real CLI run that writes go-no-go-report.json WHEN report is inspected after cutover:go-no-go --json THEN report includes git_sha (40-hex), generated_at, gates[8] with command strings, duration_ms>0, failed_count integer, overall.ok boolean; vitest gates expose collectedTests number|null with fail-closed on 0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-cutover-go-no-go
  VERIFY: `bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json; jq -e '.gates|length==8 and (.failed_count|type=="number") and (.overall.ok|type=="boolean") and (.git_sha|test("^[0-9a-f]{40}$"))' .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if report only stores length scalar; failed_count field missing; mock report without git_sha
  START_REF: production_default_gate_specs
  MUST_OBSERVE: gates.length == 8; failed_count is integer >= 0; overall.ok is boolean; git_sha matches ^[0-9a-f]{40}$; each gate has non-empty command and duration_ms > 0
  MUST_NOT_OBSERVE: report is only {"n":8}; failed_count absent; empty/start signature: missing overall.ok
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan step 1 literal_cmd invokes cutover:go-no-go via bun services/platfo... | AC-1 | `jq -r '.steps[] \| select(.n==1) \| .literal_cmd' .spec/prds/mk6-migration/tasks/sprint...` |
| TC-2 | step-1 success predicate requires overall.ok==true and failed_count==0 | AC-1 | `rg -n 'failed_count\|overall\.ok' .spec/prds/mk6-migration/tasks/sprint-29-cutover-writ...` |
| TC-3 | report fixture with failed_count=5 fails the remediated step-1 oracle | AC-3 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-4 | tests claiming production CLI coverage do not rely on realEchoGate as the sol... | AC-2 | `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration...` |
| TC-5 | go-no-go-report.json retains failed_count, overall.ok, git_sha, and 8 gates a... | AC-4 | `bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-...` |
| TC-6 | typecheck and biome clean on touched go-no-go test and gate-plan paths | AC-2 | `pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error ...` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md
- services/platform/tests/integration/sprint29-go-no-go.test.ts
- services/platform/src/cutover/go-no-go.ts
- services/platform/src/cli/holo.ts
- .tmp/REDHAT-FIX-S29-C01/**
writeProhibited:
- Rewriting historical .gate-evidence/20260802T004525Z/** to fabricate past green
- Hardcoding gate.pass or collectedTests without real subprocess output
- Weakening D06-02 AC-1 to length-only
- convex/**
- services/platform/src/etl/**
- Leaving PATH holo stub as the documented dispatcher

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:50-56 [C-01 CRITICAL — false go/no-go certification; remediation: real CLI + overall.ok + failed_count==0 + nonzero collectedTests]
2. .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md:31-34 [D06-02 AC-1 FAIL (length-only) and AC-3–4 FAIL (echo gates / CLI not required)]
3. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json:11-20 [Step 1 weak literal_cmd jq length==8]
4. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/.gate-evidence/20260802T004525Z/step1.log:1-8 [Committed false pass: failed_count:5 with GATE-EXIT=0]
5. services/platform/tests/integration/sprint29-go-no-go.test.ts:122-143 [realEchoGate substitution for all eight gates]
6. services/platform/tests/integration/sprint29-go-no-go.test.ts:267-279 [itLive claims full CLI is not required]
7. services/platform/src/cutover/go-no-go.ts:126-136,254-277 [GoNoGoReport.failed_count and overall.ok AND of gate.pass]
8. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-02-pre-cutover-go-no-go-full-harness-suite-green-against-the-new-stack.md:20-66 [D06-02 AC-1 all 8 real gates AND overall.ok; vitest collectedTests>0]
9. .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/SPRINT.md:44-58 [Human Testing Gate step 1 — full harness suite green]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- step1-literal-is-real-cli: `jq -r '.steps[] | select(.n==1) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'cutover:go-no-go' && ! jq -r '.steps[] | select(.n==1) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'length == 8'` → exit 0; step 1 is real CLI not length-only
- go-no-go-integration: `PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts` → exit 0; includes false-pass oracle + non-echo production claims
- cli-report-shape: `bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json; jq -e '.gates|length==8 and has("failed_count") and (.overall.ok|type=="boolean")' .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json` → report written with failed_count and overall.ok (suite may still be red until other sprints land — exit of CLI may be 1; shape assertion still holds)
- typecheck-biome: `pnpm tsgo --noEmit && pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-go-no-go.test.ts services/platform/src/cutover/go-no-go.ts` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md, .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/D06-02-pre-cutover-go-no-go-full-harness-suite-green-against-the-new-stack.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-22-r-8-replace-weak-any-of-gate-oracles-with-concrete-require-all-success-assertions.md
Interaction notes:
- Coordinates with REDHAT-FIX-S29-H03 which rebuilds steps 2–6; C01 owns step 1 primary oracle strength. Prefer a single gate-plan edit pass if both land together, but C01 may ship step-1-only if sequenced first.
- Do not claim full cutover green solely because step 1 is honest — remaining CRITICAL/HIGH findings still block approval.
pattern: Human-gate literal_cmd binds to real holo dispatcher; multi-claim success requires AND of overall.ok, failed_count==0, and per-vitest collectedTests>0; shape tests with injected gates stay explicitly non-production.
pattern_source: D06-02 go-no-go design; Sprint 27/28 red-hat gate-oracle remediations; review C-01 remediation paragraph
anti_pattern: jq length-only go/no-go; echo/printf vitest summaries as production CLI proof; certifying cutover while failed_count>0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — Gate-plan honesty and production CLI binding for the pre-cutover go/no-go are CI/CD orchestration concerns: human-gate step 1 must invoke the real cutover:go-no-go dispatcher, fail closed on failed_count>0, and stop treating echo-substituted gates as production CLI coverage. This is pipeline/oracle composition over existing D06-02 machinery, not new domain logic.
Reviewer: code-reviewer (+ mastra-reviewer / convex-reviewer when domain-scoped)
Proposed By: devops-engineer

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D06-02
Blocks: REDHAT-FIX-S29-H03

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Preserves finding C-01 from red-hat-20260802T010915Z-sprint-29-main-sha-2b966c7b.md @ reviewed SHA 2b966c7b60559ec9986cf737ed5322a6146c7960. Evidence lineage: gate-plan.json:11-20; .gate-evidence/20260802T004525Z/step1.log (failed_count:5, GATE-EXIT=0); sprint29-go-no-go.test.ts:122-143,267-279. Honest fail-closed go/no-go is required even if the full suite is still red for other reasons — do not reintroduce length-only greening. proposed_by: devops-engineer.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S29-C01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "repo_with_go_no_go_cli": {
      "description": "Repo with landed D06-02 cutover:go-no-go CLI, DEFAULT_GATE_SPECS of length 8, and go-no-go.ts reporting failed_count + overall.ok.",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/cutover/go-no-go.ts exports runGoNoGo and DEFAULT_GATE_SPECS length 8",
        "bun services/platform/src/cli/holo.ts cutover:go-no-go is a registered CLI verb",
        "git rev-parse HEAD yields a 40-hex SHA written into report.git_sha"
      ]
    },
    "go_no_go_report_with_failed_count_5": {
      "description": "Synthetic or captured go-no-go-report.json shaped like the committed false-pass evidence: gates.length==8 but failed_count==5 and overall.ok==false (or equivalent).",
      "seed_method": "public_api",
      "records": [
        "gates array length 8",
        "failed_count: 5",
        "overall.ok: false",
        "mirrors lineage .gate-evidence/20260802T004525Z/step1.log"
      ]
    },
    "echo_gate_substituted_suite": {
      "description": "Current sprint29-go-no-go.test.ts pattern that injects realEchoGate shells with printf vitest summaries \u2014 used as the negative control that must NOT satisfy production-CLI AC claims.",
      "seed_method": "public_api",
      "records": [
        "realEchoGate('unit', printf Tests 2 passed) style gates",
        "itLive block stating full CLI is not required (lines 267-279)"
      ]
    },
    "production_default_gate_specs": {
      "description": "DEFAULT_GATE_SPECS unbound: real pnpm biome/tsgo/vitest/test:lanes and holo verify:no-convex-* argv, not echo shells.",
      "seed_method": "cli",
      "records": [
        "argv for unit/integration/live start with pnpm vitest run --project \u2026",
        "report after real run includes collectedTests parsed from vitest output"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-SYNC-008",
      "description": "GIVEN repo_with_go_no_go_cli WHEN gate step 1 is rebuilt THEN literal_cmd runs real cutover:go-no-go and requires overall.ok==true, failed_count==0, gates|length==8, and vitest collectedTests>0",
      "verify": "jq -e '.steps[] | select(.n==1) | .literal_cmd | test(\"cutover:go-no-go\")' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cutover-go-no-go+gate-plan",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "step 1 still only jq-checks gates|length==8",
            "failed_count:5 evidence still exits 0 under the new step oracle"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "repo_with_go_no_go_cli",
            "action": {
              "actor": "operator",
              "steps": [
                "Rebuild and execute gate-plan step 1",
                "Evaluate oracle against failed_count:5 fixture"
              ]
            },
            "end_state": {
              "must_observe": [
                "literal_cmd contains cutover:go-no-go",
                "failed_count==0 required",
                "overall.ok==true required",
                "vitest collectedTests>0 required"
              ],
              "must_not_observe": [
                "jq length-only literal_cmd",
                "exit 0 on failed_count:5"
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
      "flow_ref": "T-SYNC-008",
      "description": "GIVEN echo_gate_substituted_suite WHEN tests are remediated THEN production CLI claims do not use realEchoGate as sole green path and the 'full CLI is not required' live contract is removed/replaced",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest-integration+go-no-go",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "itLive still says full CLI is not required",
            "production green uses only echo shells"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "echo_gate_substituted_suite",
            "action": {
              "actor": "implementer",
              "steps": [
                "Refactor production CLI tests",
                "Remove not-required live contract"
              ]
            },
            "end_state": {
              "must_observe": [
                "real CLI or DEFAULT_GATE_SPECS path for production claim",
                "echo-only tests labeled shape-only"
              ],
              "must_not_observe": [
                "full CLI suite is not required",
                "empty production coverage"
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
      "flow_ref": "T-SYNC-008",
      "description": "GIVEN go_no_go_report_with_failed_count_5 WHEN remediated step-1 oracle runs THEN evaluation fails despite gates.length==8",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|false-pass|C-01'",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-oracle-fixture",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "oracle still greens on length==8 alone"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "go_no_go_report_with_failed_count_5",
            "action": {
              "actor": "tester",
              "steps": [
                "Evaluate step-1 oracle on failed_count:5 fixture"
              ]
            },
            "end_state": {
              "must_observe": [
                "non-zero fail",
                "names failed_count or overall.ok"
              ],
              "must_not_observe": [
                "exit 0 length-only pass"
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
      "description": "GIVEN production_default_gate_specs WHEN cutover:go-no-go --json writes a report THEN report retains full machine-greppable fields including failed_count and overall.ok",
      "verify": "bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json; jq -e 'has(\"failed_count\") and .overall.ok!=null' .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json",
      "maps_to_ac": null,
      "test_tier": "integration",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cutover-go-no-go",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "report only stores length scalar",
            "failed_count field missing"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "production_default_gate_specs",
            "action": {
              "actor": "operator",
              "steps": [
                "Run cutover:go-no-go --json",
                "jq report fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "gates.length==8",
                "failed_count integer",
                "overall.ok boolean",
                "git_sha 40-hex"
              ],
              "must_not_observe": [
                "report is only length scalar"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "gate-plan step 1 literal_cmd invokes cutover:go-no-go via bun services/platform/src/cli/holo.ts and is not jq length-only",
      "verify": "jq -r '.steps[] | select(.n==1) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json | rg -q 'cutover:go-no-go'",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "step-1 success predicate requires overall.ok==true and failed_count==0",
      "verify": "rg -n 'failed_count|overall\\.ok' .spec/prds/mk6-migration/tasks/sprint-29-cutover-write-freeze-etl-and-read-only-soak-flip/gate-plan.json",
      "maps_to_ac": "AC-1",
      "test_tier": "integration"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "report fixture with failed_count=5 fails the remediated step-1 oracle",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts -t 'failed_count|false-pass|C-01'",
      "maps_to_ac": "AC-3",
      "test_tier": "integration"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "tests claiming production CLI coverage do not rely on realEchoGate as the sole green path",
      "verify": "PLATFORM_IT=1 pnpm vitest run --project integration services/platform/tests/integration/sprint29-go-no-go.test.ts",
      "maps_to_ac": "AC-2",
      "test_tier": "integration"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "go-no-go-report.json retains failed_count, overall.ok, git_sha, and 8 gates after CLI run",
      "verify": "bun services/platform/src/cli/holo.ts cutover:go-no-go --json --output .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json; jq -e '.gates|length==8 and has(\"failed_count\")' .tmp/REDHAT-FIX-S29-C01/go-no-go-report.json",
      "maps_to_ac": "AC-4",
      "test_tier": "integration"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "typecheck and biome clean on touched go-no-go test paths",
      "verify": "pnpm tsgo --noEmit; pnpm biome check --no-errors-on-unmatched --diagnostic-level=error services/platform/tests/integration/sprint29-go-no-go.test.ts",
      "maps_to_ac": "AC-2",
      "test_tier": "integration"
    }
  ],
  "touches_capabilities": [
    "CAP-CUT-01"
  ],
  "provides": [
    "gate-plan step 1 literal_cmd that executes bun services/platform/src/cli/holo.ts cutover:go-no-go --json",
    "committed go-no-go evidence that requires overall.ok==true, failed_count==0, and nonzero collectedTests on every vitest lane",
    "integration coverage that fails when echo/stub gates are used to claim production CLI green"
  ],
  "consumes": [
    "services/platform/src/cutover/go-no-go.ts (runGoNoGo, DEFAULT_GATE_SPECS, failed_count, overall.ok)",
    "holo cutover:go-no-go CLI case in services/platform/src/cli/holo.ts",
    "D06-02 go-no-go-report.json schema (gates[8], collectedTests, git_sha)"
  ],
  "boundary_contracts": [
    "CAP-CUT-01 trigger: operator may not proceed to freeze/ETL/flip while go/no-go overall.ok is false or failed_count>0",
    "T-SYNC-008: full harness suite green against the new stack while Convex still serves production"
  ],
  "proposed_by": "devops-engineer"
}
-->

</details>
