# REDHAT-FIX-S27-17 — [R-2] Execute the required D04-01 vitest RED integration suite in the Human Testing Gate

## What this does

Close R-2 CRITICAL: Gate 'RED suite' step does NOT run vitest; gate-plan step 8 explicitly 'not vitest'; SPRINT HTD-8 + REDHAT-FIX-S27-05 NEVER-tier require the vitest command; evidence red-suite/ only has CLI JSON — no vitest transcript. Execute the required D04-01 vitest RED integration suite as a hard Human Testing Gate step with exit 0, transcript, and dual-write captures; CLI may remain as additional proof only.

## Why

Remediate red-hat finding R-2 (CRITICAL) from .spec/reviews/red-hat-sprint27-20260728T082702Z.md.

## How to verify

- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, services/platform/tests/**, scripts/gate/**, scripts/promote-backup-alert-http-captures.sh, .tmp/redhat-fix-s27-17/**, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/*

Prohibited: Silent permanent CLI replacement while NEVER-tier still requires vitest, Stripping PLATFORM_IT=1 to skip-green, || true / soft-pass around vitest exit, Mocking postBackupAlert or webhook receiver in the RED gate step, Claiming R-2 closed from CLI-only red-suite/ evidence

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-17 — [R-2] Execute the required D04-01 vitest RED integration suite in the Human Testing Gate
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=red-test-generator | reviewer=test-quality-reviewer
PROPOSED-BY: red-test-generator
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
A gate step runs the exact vitest command under PLATFORM_IT=1 with short windows, expected_exit 0, durable vitest transcript + dual-written HTTP captures under .gate-evidence/<run>/; HTD-8 and gate-plan no longer contradict; R-2 / F-5 residual closed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add or restore a Human Testing Gate step that executes exactly: PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- MUST assert expected_exit=0 for that vitest step
- MUST capture full vitest stdout/stderr transcript into .gate-evidence/<run>/ (e.g. red-suite-transcript.log)
- MUST dual-write RED suite webhook captures (method/url/headers/rawBody/receivedAt) into .gate-evidence/<run>/red-suite/
- MUST keep PLATFORM_IT=1 guard — never strip live integration guard to force skip-green
- MUST use short CI windows BACKUP_ALERT_OVERDUE_MS=1000 and BACKUP_ALERT_TEST_WINDOW_MS=10000
- MUST treat CLI induce/sweep red-suite path as additional proof only, not as vitest replacement
- MUST align SPRINT.md HTD-8 with gate-plan (vitest hard step)
- NEVER replace the vitest invocation with a log-regex grep of a prior transcript
- NEVER mark the step pass on vitest skip / 0 tests run
- NEVER mock the webhook receiver or stub postBackupAlert in the vitest gate step
- NEVER claim GREEN from CLI-only red-suite/ without vitest transcript
- NEVER soft-pass with || true around vitest
- NEVER leave gate-plan step text as 'not vitest' while claiming R-2 closed without formal NEVER-tier amendment
- STRICTLY the step literal_cmd re-executes real pnpm vitest run of sprint27-backup-alerting-red.test.ts
- STRICTLY honors REDHAT-FIX-S27-05 NEVER-tier unless that task and HTD-8 are formally revised in the same change set
- STRICTLY flow_ref T-PLAT-024 / CAP-BAK-01

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: AC-1
- [ ] AC-2: AC-2
- [ ] AC-3: AC-3
- [ ] AC-4: AC-4
- [ ] AC-5: AC-5
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN gate-plan.json step 8 is explicitly a CLI reimplementation labeled 'not vitest', SPRINT.md HTD-8 still requires... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN gate-plan.json step 8 is explicitly a CLI reimplementation labeled 'not vitest', SPRINT.md HTD-8 still requires the D04-01 vitest suite, and REDHAT-FIX-S27-05 NEVER-tier forbids replacing vitest (R-2 CRITICAL / F-5 residual) WHEN the Human Testing Gate certifies D04-01 RED THEN a hard gate step MUST execute exactly: PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts with expected_exit 0 (T-PLAT-024).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -E 'sprint27-backup-alerting-red\.test\.ts' | grep PLATFORM_IT; jq -e '.steps[] | select(.literal_cmd|test("sprint27-backup-alerting-red")) | .assertion.expected_exit == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate-plan still has zero pnpm vitest / sprint27-backup-alerting-red.test.ts invocations (pre-fix R-2 / F-5); step 8 remains CLI-only with text 'not vitest' and is treated as the RED suite substitute; step greps a prior transcript or red-suite/*.json without re-running vitest; step runs vitest without PLATFORM_IT=1 so itLive cases skip and exit 0 vacuously; step uses || true / ignores exit code / soft-pass on vitest failure; NEVER-tier of REDHAT-FIX-S27-05 still violated by intentional CLI replacement without task amendment
  START_REF: s27_gate_step8_cli_not_vitest_baseline
  MUST_OBSERVE: gate-plan step whose literal_cmd contains PLATFORM_IT=1 and pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; BACKUP_ALERT_OVERDUE_MS=1000 and BACKUP_ALERT_TEST_WINDOW_MS=10000 in step env or command prefix; assertion.expected_exit == 0; step text no longer claims 'not vitest' as the sole RED oracle; SPRINT.md HTD-8 and gate-plan agree that vitest is the hard RED step
  MUST_NOT_OBSERVE: zero vitest invocations across all gate steps; CLI-only red-suite/ evidence presented as full R-2 closure; all itLive skipped (PLATFORM_IT unset) counted as green; soft-pass empty vitest transcript
  EVIDENCE: file_artifact

### AC-2 — GIVEN the vitest RED suite writes a transcript and dual-writes webhook HTTP captures under .tmp/D04-01/ (or suite-con... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN the vitest RED suite writes a transcript and dual-writes webhook HTTP captures under .tmp/D04-01/ (or suite-configured evidence dir) WHEN the hard vitest gate step completes THEN durable .gate-evidence/<run>/ MUST contain a non-empty vitest transcript plus red-suite captures including ≥1 envelope (method/url/headers/rawBody/receivedAt) and healthy-silence postCount 0 — not only CLI induce/sweep JSON (R-2 Fix: transcript + dual-write captures).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `test -s .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/<run>/red-suite-transcript.log; jq envelope check on dual-written capture`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only CLI JSON under red-suite/ (failure-*-induce.json / sweep.txt) with no vitest transcript (pre-fix evidence shape at 20260728T075339Z); exit code recorded without webhook capture dual-write; captures stay only under gitignored .tmp/D04-01; payload-only posts[] labeled as HTTP capture
  START_REF: s27_vitest_red_suite_dual_write
  MUST_OBSERVE: non-empty vitest transcript under .gate-evidence/<run>/ showing Tests passed / exit 0; dual-written failure-*-alert.json or alerts-http-captures with full envelope fields; healthy-silence artifact with postCount 0 from RED suite path; CLI path may remain as additional proof only — not as vitest replacement
  MUST_NOT_OBSERVE: red-suite/ with only CLI induce/sweep artifacts claimed as vitest proof; empty soft transcript signatures; missing dual-write of receiver captures
  EVIDENCE: alert_artifact

### AC-3 — GIVEN a deliberate RED suite failure (PLATFORM_IT unset causing skip-all misread, dead webhook port, or forced assert... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN a deliberate RED suite failure (PLATFORM_IT unset causing skip-all misread, dead webhook port, or forced assertion fail) WHEN the vitest gate step runs THEN vitest exits non-zero and the gate step fails — proving the step is not tautological and does not soft-pass (R-2 / REDHAT-FIX-S27-05 NEVER-tier).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `literal_cmd has no '|| true' on vitest; assertion.expected_exit is 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate step appends || true and always exits 0; assertion kind ignores expected_exit; step only checks file existence of the test path without running it; soft-pass mock of vitest runner
  START_REF: s27_vitest_gate_fail_closed
  MUST_OBSERVE: literal_cmd does not soft-pass vitest failure; expected_exit 0 means suite failure fails the gate; pre-fix RED evidence documents CLI-only / not-vitest step 8
  MUST_NOT_OBSERVE: always-green step wrapping; grep-only oracle without re-execution; mock vitest binary
  EVIDENCE: stdout

### AC-4 — GIVEN REDHAT-FIX-S27-05 CRITICAL CONSTRAINT NEVER replace the vitest invocation and SPRINT.md HTD-8 still specifies v... (flow_ref T-PLAT-024)
  SUMMARY: GIVEN REDHAT-FIX-S27-05 CRITICAL CONSTRAINT NEVER replace the vitest invocation and SPRINT.md HTD-8 still specifies vitest WHEN R-2 is closed THEN either the gate reintroduces the real vitest step OR the project formally amends the NEVER-tier task + HTD-8 — silent CLI substitution remains forbidden (R-2 Expected / Fix alignment).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `rg -n 'pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts' gate-plan.json SPRINT.md; rg -n 'not vitest' gate-plan.json || true`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if CLI substitute remains while SPRINT HTD-8 and S27-05 NEVER-tier still require vitest; docs amended to drop vitest without gate honesty note / residual acceptance; step labeled RED suite while explicitly not executing vitest
  START_REF: s27_gate_step8_cli_not_vitest_baseline
  MUST_OBSERVE: hard vitest gate step present (preferred closure path); SPRINT.md HTD-8 and gate-plan consistent; if CLI-only path is product-chosen, REDHAT-FIX-S27-05 NEVER-tier + HTD-8 formally revised in same change set (not silent)
  MUST_NOT_OBSERVE: doc/oracle contradiction remaining (HTD-8 vitest vs gate not vitest); NEVER-tier still violated without amendment
  EVIDENCE: file_artifact

### AC-5 — GIVEN typecheck and lint WHEN write_allowed paths change THEN pnpm tsgo --noEmit and pnpm biome check . exit 0. (flow_ref T-PLAT-024)
  SUMMARY: GIVEN typecheck and lint WHEN write_allowed paths change THEN pnpm tsgo --noEmit and pnpm biome check . exit 0.
  TEST_TIER: unit · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if typecheck/lint failures ignored
  START_REF: s27_gate_step8_cli_not_vitest_baseline
  MUST_OBSERVE: typecheck exit 0; lint exit 0
  MUST_NOT_OBSERVE: unchecked changes
  EVIDENCE: stdout


--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan contains vitest RED suite step under PLATFORM_IT=1 | AC-1 | `jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pi...` |
| TC-2 | Vitest gate step expected_exit is 0 | AC-1 | `jq -e '.steps[] \| select(.literal_cmd\|test("sprint27-backup-alerting-red")) \| .assertion.expec...` |
| TC-3 | Live RED suite passes under gate env windows | AC-1 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run serv...` |
| TC-4 | Gate evidence includes vitest transcript (not CLI-only red-suite) | AC-2 | `rg -n 'Test Files\|Tests \|PASS\|FAIL\|vitest' .spec/prds/mk6-migration/tasks/sprint-27-standing-...` |
| TC-5 | Dual-write captures include HTTP envelope fields | AC-2 | `jq -e '..\|objects\|select(has("method") and has("url") and has("headers") and has("rawBody") and...` |
| TC-6 | Pre-fix baseline: step 8 was CLI not vitest | AC-3 | `rg -n 'not vitest' .spec/reviews/red-hat-sprint27-20260728T082702Z.md .spec/prds/mk6-migration/ta...` |
| TC-7 | Typecheck + lint clean | AC-5 | `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- services/platform/tests/**
- scripts/gate/**
- scripts/promote-backup-alert-http-captures.sh
- .tmp/redhat-fix-s27-17/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/**
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-05-f-5-execute-the-d04-01-red-integration-suite-in-the-human-testing-gate.md

writeProhibited:
- Silent permanent CLI replacement while NEVER-tier still requires vitest
- Stripping PLATFORM_IT=1 to skip-green
- || true / soft-pass around vitest exit
- Mocking postBackupAlert or webhook receiver in the RED gate step
- Claiming R-2 closed from CLI-only red-suite/ evidence

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T082702Z.md (R-2 CRITICAL vitest not gated; GP-3)
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json steps 8 text/cmd (not vitest)
3. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md HTD-8
4. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-05-f-5-execute-the-d04-01-red-integration-suite-in-the-human-testing-gate.md
5. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
6. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/.gate-evidence/20260728T075339Z/red-suite/
7. .spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-PLAT-024)
8. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-BAK-01)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -F 'sprint27-backup-alerting-red.test.ts' | grep -q PLATFORM_IT
- jq -e '.steps[] | select(.literal_cmd|test("sprint27-backup-alerting-red")) | .assertion.expected_exit == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T082702Z.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/REDHAT-FIX-S27-05-f-5-execute-the-d04-01-red-integration-suite-in-the-human-testing-gate.md, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
Pattern: mkdir -p "$EVIDENCE/red-suite"; PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts 2>&1 | tee "$EVIDENCE/red-suite-transcript.log"; cp -R .tmp/D04-01/. "$EVIDENCE/red-suite/". CLI path may remain as additional proof only after vitest hard step.
Anti-pattern: Step text 'not vitest' with CLI induce/sweep only; grepping old logs; skip-green without PLATFORM_IT; || true; claiming red-suite/ CLI JSON is the RED suite.


--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0
- jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -F 'sprint27-backup-alerting-red.test.ts' | grep -q PLATFORM_IT
- jq -e '.steps[] | select(.literal_cmd|test("sprint27-backup-alerting-red")) | .assertion.expected_exit == 0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: red-test-generator
- Reviewer: test-quality-reviewer
- Rationale: R-2 is a CRITICAL NEVER-tier miss of REDHAT-FIX-S27-05: the gate step labeled RED suite does not run vitest. red-test-generator owns restoring the hard vitest Human Testing Gate step, transcript dual-write, and fail-closed exit behavior.
- Proposed by: red-test-generator

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: ['CAP-BAK-01']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions
- ANTI-STUB-REVIEW: no mock/stub soft-pass oracles
- TDD red_first with seeded RED evidence before GREEN

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-05', 'D04-01', 'D04-05']
- blocks: ['Sprint 27 red-hat verdict lift (R-2 blocking)', 'REDHAT-FIX-S27-16 (shares gate honesty)']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T082702Z.md (REDHAT-FIX-S27-17)
- CAP-BAK-01 residual remediation — gate honesty + production-truth.
- Specialist JSON retained at .tmp/s27-redhat-r-cycle2-expanded-tasks.json

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-17",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27_gate_step8_cli_not_vitest_baseline": {
      "description": "Pre-fix R-2: gate-plan step 8 text/cmd is REAL holo CLI (not vitest); red-suite/ evidence is CLI induce/sweep only; SPRINT HTD-8 and S27-05 NEVER-tier still require vitest.",
      "seed_method": "file_artifact",
      "records": [
        "gate-plan.json step 8 text: 'not vitest'",
        ".gate-evidence/20260728T075339Z/red-suite/ has failure-*-induce.json + sweep.txt only \u2014 no vitest transcript",
        "SPRINT.md HTD-8 vitest command",
        "REDHAT-FIX-S27-05 NEVER replace vitest",
        "red-hat-sprint27-20260728T082702Z.md R-2 CRITICAL"
      ]
    },
    "s27_vitest_red_suite_dual_write": {
      "description": "Vitest suite under PLATFORM_IT=1 dual-writes HTTP captures + healthy silence; gate step tees transcript and copies into .gate-evidence/<run>/.",
      "seed_method": "cli",
      "records": [
        "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
        ".tmp/D04-01/failure-*-alert.json envelope captures",
        ".tmp/D04-01/healthy-silence-posts.json postCount 0",
        "target: .gate-evidence/<run>/red-suite/* + red-suite-transcript.log"
      ]
    },
    "s27_vitest_gate_fail_closed": {
      "description": "Vitest step must fail the gate on suite failure; no || true soft-pass.",
      "seed_method": "file_artifact",
      "records": [
        "literal_cmd without || true on vitest",
        "expected_exit 0",
        "pre-fix CLI-only step 8"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "Hard gate step runs exact PLATFORM_IT=1 vitest RED suite with expected_exit 0",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Durable vitest transcript + dual-write HTTP captures under .gate-evidence",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "Vitest failure fails gate; no || true soft-pass",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Align HTD-8 / S27-05 NEVER-tier with gate-plan (vitest hard step or formal amendment)",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "integration"
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "typecheck + lint clean",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "test_tier": "unit"
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "gate-plan contains vitest RED step under PLATFORM_IT=1",
      "verify": "jq -r '.steps[].literal_cmd' gate-plan.json | grep -E 'sprint27-backup-alerting-red\\.test\\.ts' | grep -q PLATFORM_IT"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "expected_exit 0 for vitest step",
      "verify": "jq -e '.steps[] | select(.literal_cmd|test(\"sprint27-backup-alerting-red\")) | .assertion.expected_exit == 0' gate-plan.json"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "Live RED suite passes",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts \u2192 Exit 0"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "vitest transcript in gate evidence",
      "verify": "rg -n 'Test Files|Tests |vitest' .gate-evidence/*/red-suite-transcript.log"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "dual-write envelope fields",
      "verify": "jq envelope check on .gate-evidence/*/alerts-http-captures.json or red-suite captures"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "pre-fix CLI not vitest baseline",
      "verify": "rg -n 'not vitest' report/gate-plan"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "typecheck + lint",
      "verify": "pnpm tsgo --noEmit \u2192 Exit 0; pnpm biome check . \u2192 Exit 0"
    }
  ],
  "proposed_by": "red-test-generator",
  "touches_capabilities": [
    "CAP-BAK-01"
  ]
}
-->

