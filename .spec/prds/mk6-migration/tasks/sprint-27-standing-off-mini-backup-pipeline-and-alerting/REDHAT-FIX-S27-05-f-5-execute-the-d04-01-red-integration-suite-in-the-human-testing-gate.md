# REDHAT-FIX-S27-05 — [F-5] Execute the D04-01 RED integration suite in the Human Testing Gate

## What this does

gate-plan.json gains a dedicated Human Testing Gate step that runs PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, asserts exit 0, and copies the vitest transcript plus RED suite webhook HTTP captures (method/url/headers/rawBody/receivedAt) into .gate-evidence/<run>/. The sprint's claimed GREEN gate for D04-05 is enforced by the gate itself — not by a one-off ephemeral .tmp/D04-01/ run.

## Why

- SPRINT topology states D04-01 RED gates D04-05 GREEN; the shipped gate bypasses the RED suite entirely.
- The RED suite is the only strong two-sided oracle (real http.Server, healthy-silence, three failure modes) and already passed once at 20:44 — but is not enforced as a gate step.
- Without a gate step, a regression that deletes or weakens the RED suite still yields gate-results.json verdict:pass.

## How to verify

- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts`
- `pnpm tsgo --noEmit`
- `pnpm biome check .`

## Scope

Writes: (see guardrails)

Prohibited: out-of-scope product paths not listed in WRITE-ALLOWED

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-05 — [F-5] Execute the D04-01 RED integration suite in the Human Testing Gate
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (90 min)
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
gate-plan.json gains a dedicated Human Testing Gate step that runs PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts, asserts exit 0, and copies the vitest transcript plus RED suite webhook HTTP captures (method/url/headers/rawBody/receivedAt) into .gate-evidence/<run>/. The sprint's claimed GREEN gate for D04-05 is enforced by the gate itself — not by a one-off ephemeral .tmp/D04-01/ run.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add a Human Testing Gate step that executes: PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts
- MUST assert expected_exit=0 for that step (GREEN proof after D04-05)
- MUST capture the full vitest stdout/stderr transcript into .gate-evidence/<run>/ (e.g. stepN-d04-01-red-suite.log or red-suite-transcript.log)
- MUST copy or dual-write RED suite webhook evidence from .tmp/D04-01/ (failure-*-alert.json, healthy-silence-posts.json, AC-1-oracle-contract.json) into .gate-evidence/<run>/red-suite/ so captures survive beyond the gitignored .tmp tree
- MUST update gate-plan.json (and SPRINT.md Human Test Deliverable if it lists steps) so the RED suite is a first-class gate step, not an optional local command
- MUST keep PLATFORM_IT=1 guard — never strip the live integration guard to force a skip-green
- MUST use short CI windows via BACKUP_ALERT_OVERDUE_MS=1000 and BACKUP_ALERT_TEST_WINDOW_MS=10000 (suite contract already honors these env vars)
- NEVER replace the vitest invocation with a log-regex grep of a prior transcript (must re-execute)
- NEVER mark the step pass on vitest skip / 0 tests run — assert non-zero tests executed and exit 0
- NEVER mock the webhook receiver or stub postBackupAlert in the gate step
- NEVER claim GREEN from .tmp/D04-01 alone without durable .gate-evidence copies
- STRICTLY the step literal_cmd is the real pnpm vitest run of sprint27-backup-alerting-red.test.ts

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): gate-plan.json contains a step that runs the D04-01 RED suite under PLATFORM_IT=1 with short alert windows and expected_exit 0
- [ ] AC-2: durable gate evidence includes vitest transcript + copied RED webhook capture artifacts under .gate-evidence/<run>/
- [ ] AC-3: re-running the gate step alone re-executes vitest (not a stale log re-grep) and fails if the suite fails
- [ ] PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- [ ] pnpm tsgo --noEmit clean + pnpm biome check . clean on write_allowed paths

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — AC-1 (flow_ref T-PLAT-024)
  GIVEN gate-plan.json currently has 6 steps and zero vitest invocations; SPRINT.md claims D04-01 RED gates D04-05 GREEN
  WHEN  the implementer adds a gate step and re-plans/re-runs the Human Testing Gate
  THEN  the step's literal_cmd is the exact vitest command; expected_exit is 0; transcript is non-empty; suite exercises healthy silence + three failure modes against a real http.Server
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate-plan.json still has no pnpm vitest / sprint27-backup-alerting-red.test.ts step (pre-fix F-5 state); step greps an old transcript or .tmp/D04-01 file without re-running vitest; step runs vitest without PLATFORM_IT=1 so all itLive cases skip and exit 0 vacuously; step expects non-zero exit (leaves suite in RED forever) or ignores exit code; step substitutes a unit mock of the webhook path instead of the real integration suite
  MUST_OBSERVE: gate-plan.json step with literal_cmd containing PLATFORM_IT=1 and pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts; BACKUP_ALERT_OVERDUE_MS=1000 and BACKUP_ALERT_TEST_WINDOW_MS=10000 present in the step env or command prefix; assertion.expected_exit == 0; .gate-evidence/<run>/ transcript log showing Tests passed / exit 0; transcript or copied evidence shows healthy silence (zero posts) and failure modes kill|credential|config|overdue
  MUST_NOT_OBSERVE: zero vitest invocations across all gate steps; vitest exit non-zero with gate step marked pass; all itLive skipped (PLATFORM_IT unset) counted as green; GREEN claimed solely from ephemeral .tmp/D04-01 without .gate-evidence copy
  EVIDENCE: file_artifact

### AC-2 — AC-2 (flow_ref T-PLAT-024)
  GIVEN the RED suite writes HTTP captures under .tmp/D04-01/
  WHEN  the gate RED step completes
  THEN  those captures (or equivalent receiver log) are dual-written into .gate-evidence/<run>/red-suite/ including at least one alert capture with method+url+headers+rawBody+receivedAt and the healthy-silence artifact with postCount 0.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only a vitest exit code is recorded with no webhook capture files; gate copies sweep self-reported posts[] (no method/url/headers) and labels it HTTP capture; evidence stays only under gitignored .tmp/D04-01 with no .gate-evidence dual-write; healthy-silence artifact is omitted so silence half of the two-sided oracle is not gate-durable
  MUST_OBSERVE: .gate-evidence/<run>/red-suite/ or equivalent path exists; at least one failure-*-alert.json (or receiver log) with method, url, headers, rawBody, receivedAt; healthy-silence-posts.json with postCount 0; vitest transcript non-empty under .gate-evidence/<run>/
  MUST_NOT_OBSERVE: alerts-received.json schema with only BackupAlertPayload fields and no HTTP envelope; empty .gate-evidence after a claimed GREEN RED step
  EVIDENCE: alert_artifact

### AC-3 — AC-3 (flow_ref T-PLAT-024)
  GIVEN a deliberate suite failure (e.g. BACKUP_ALERT_OVERDUE_MS unset and heartbeats healthy so failures do not alert, or ALERT_WEBHOOK_URL pointing at a dead port)
  WHEN  the gate RED step runs
  THEN  vitest exits non-zero and the gate step fails — proving the step is not a tautological pass.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate step uses || true and always exits 0; assertion kind ignores expected_exit; step only checks file existence of the test path without running it
  MUST_OBSERVE: literal_cmd does not append '|| true' for the vitest invocation; assertion.expected_exit is 0 (failure of suite → step fail); RED evidence under .tmp/redhat-fix-s27-05-red/ or .gate-evidence showing pre-fix gate-plan had 0 vitest steps
  MUST_NOT_OBSERVE: always-green step wrapping; grep-only oracle without re-execution
  EVIDENCE: stdout

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan.json contains a step whose literal_cmd runs the D04-01 RED suite under PLATFORM_IT=1 | AC-1 | `jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -E 'sprint27-backup-alerting-red\.test\.ts' | grep -q PLATFORM_IT` |
| TC-2 | That step asserts expected_exit 0 | AC-1 | `jq -e '.steps[] | select(.literal_cmd|test("sprint27-backup-alerting-red")) | .assertion.expected_exit == 0' .../gate-plan.json` |
| TC-3 | Live RED suite still passes under the gate env | AC-1 | `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0` |
| TC-4 | Gate evidence layout documents dual-write of RED captures + transcript | AC-2 | `gate step script or literal_cmd copies .tmp/D04-01/* into .gate-evidence/<run>/red-suite/ and tees vitest output to a log under .gate-evidence/<run>/` |
| TC-5 | Pre-fix RED evidence: gate-plan has zero vitest steps | AC-3 | `test -f .tmp/redhat-fix-s27-05-red/pre-fix-no-vitest-in-gate-plan.txt && grep -q 'vitest_steps=0' that file (or regenerate via jq count)` |
| TC-6 | Typecheck + lint clean | AC-1 | `pnpm tsgo --noEmit → Exit 0; pnpm biome check . → Exit 0 on touched paths` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
writeProhibited:

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md (F-5)
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
3. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-01-red-induced-backup-failure-must-alert-healthy-run-stays-silent.md
4. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (receiver ~129-166; env windows ~46-49)
5. .spec/prds/mk6-migration/11-e2e-testing-criteria.md (T-PLAT-024)
6. .spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md (CAP-BAK-01)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- jq -r '.steps[].literal_cmd' gate-plan.json | grep -F 'sprint27-backup-alerting-red.test.ts' → match
- PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts → Exit 0
- test -f .tmp/D04-01/healthy-silence-posts.json && jq -e '.postCount==0' .tmp/D04-01/healthy-silence-posts.json
- pnpm tsgo --noEmit → Exit 0
- pnpm biome check . → Exit 0 (touched paths)

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, .spec/reviews/red-hat-sprint27-20260728T054039Z.md
Pattern: Add a terminal gate step whose literal_cmd is a small shell sequence: mkdir -p "$EVIDENCE/red-suite"; PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts 2>&1 | tee "$EVIDENCE/red-suite-transcript.log"; cp -R .tmp/D04-01/. "$EVIDENCE/red-suite/" (or GATE_EVIDENCE_DIR env if suite is extended).
Anti-pattern: Claiming GREEN from a past .tmp/D04-01 run without re-executing vitest in the gate; using || true; skipping PLATFORM_IT.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Tests: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: red-test-generator
- Reviewer: test-quality-reviewer
- Rationale: Assigned red-test-generator per SPRINT.md remediation ownership.
- Proposed by: red-test-generator

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform conventions

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-01', 'D04-05']
- blocks: ['REDHAT-FIX-S27-07']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-05)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-05",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "s27_gate_with_red_suite_step": {
      "description": "Sprint 27 gate-plan.json plus D04-01 RED suite file; DATABASE_URL and backup heartbeats available for PLATFORM_IT=1",
      "seed_method": "cli",
      "records": [
        "gate-plan.json under sprint-27-standing-off-mini-backup-pipeline-and-alerting",
        "services/platform/tests/integration/sprint27-backup-alerting-red.test.ts exists with itLive + createServer",
        "PLATFORM_IT=1, BACKUP_ALERT_OVERDUE_MS=1000, BACKUP_ALERT_TEST_WINDOW_MS=10000",
        "ALERT_WEBHOOK_URL is set by the suite's own receiver (not required pre-set)"
      ]
    },
    "s27_red_suite_durable_evidence": {
      "description": "After suite run, .tmp/D04-01 contains HTTP captures; gate step dual-writes them to .gate-evidence/<run>/red-suite/",
      "seed_method": "file_artifact",
      "records": [
        ".tmp/D04-01/failure-a-wal-kill-alert.json (real HTTP capture shape)",
        ".tmp/D04-01/healthy-silence-posts.json",
        ".tmp/D04-01/AC-1-oracle-contract.json",
        "target: .gate-evidence/<run>/red-suite/* + red-suite-transcript.log"
      ]
    },
    "s27_red_suite_gate_step_fail_closed": {
      "description": "Pre-fix gate-plan with no vitest step; RED evidence records vitest_steps=0",
      "seed_method": "file_artifact",
      "records": [
        "jq '[.steps[]|select(.literal_cmd|test(\"vitest\"))]|length' gate-plan.json \u2192 0 (pre-fix)",
        ".tmp/redhat-fix-s27-05-red/pre-fix-no-vitest-in-gate-plan.txt"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN the Sprint 27 Human Testing Gate certifies CAP-BAK-01 alerting WHEN the gate runs THEN it executes the D04-01 RED integration suite (sprint27-backup-alerting-red.test.ts) with PLATFORM_IT=1 and short windows, asserts vitest exit 0, and records the transcript under .gate-evidence/<run>/ \u2014 proving D04-05 GREEN via the RED oracle the sprint claims is the gate.",
      "verify": "",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_gate_with_red_suite_step",
        "evidence": "file_artifact",
        "negative_control": {
          "would_fail_if": [
            "gate-plan.json still has no pnpm vitest / sprint27-backup-alerting-red.test.ts step (pre-fix F-5 state)",
            "step greps an old transcript or .tmp/D04-01 file without re-running vitest",
            "step runs vitest without PLATFORM_IT=1 so all itLive cases skip and exit 0 vacuously",
            "step expects non-zero exit (leaves suite in RED forever) or ignores exit code",
            "step substitutes a unit mock of the webhook path instead of the real integration suite"
          ]
        },
        "must_observe": [
          "gate-plan.json step with literal_cmd containing PLATFORM_IT=1 and pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts",
          "BACKUP_ALERT_OVERDUE_MS=1000 and BACKUP_ALERT_TEST_WINDOW_MS=10000 present in the step env or command prefix",
          "assertion.expected_exit == 0",
          ".gate-evidence/<run>/ transcript log showing Tests passed / exit 0",
          "transcript or copied evidence shows healthy silence (zero posts) and failure modes kill|credential|config|overdue"
        ],
        "must_not_observe": [
          "zero vitest invocations across all gate steps",
          "vitest exit non-zero with gate step marked pass",
          "all itLive skipped (PLATFORM_IT unset) counted as green",
          "GREEN claimed solely from ephemeral .tmp/D04-01 without .gate-evidence copy"
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the RED suite writes HTTP captures under .tmp/D04-01/ WHEN the gate RED step completes THEN those captures (or equivalent receiver log) are dual-written into .gate-evidence/<run>/red-suite/ including at least one alert capture with method+url+headers+rawBody+receivedAt and the healthy-silence artifact with postCount 0.",
      "verify": "",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_red_suite_durable_evidence",
        "evidence": "alert_artifact",
        "negative_control": {
          "would_fail_if": [
            "only a vitest exit code is recorded with no webhook capture files",
            "gate copies sweep self-reported posts[] (no method/url/headers) and labels it HTTP capture",
            "evidence stays only under gitignored .tmp/D04-01 with no .gate-evidence dual-write",
            "healthy-silence artifact is omitted so silence half of the two-sided oracle is not gate-durable"
          ]
        },
        "must_observe": [
          ".gate-evidence/<run>/red-suite/ or equivalent path exists",
          "at least one failure-*-alert.json (or receiver log) with method, url, headers, rawBody, receivedAt",
          "healthy-silence-posts.json with postCount 0",
          "vitest transcript non-empty under .gate-evidence/<run>/"
        ],
        "must_not_observe": [
          "alerts-received.json schema with only BackupAlertPayload fields and no HTTP envelope",
          "empty .gate-evidence after a claimed GREEN RED step"
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN a deliberate suite failure (e.g. BACKUP_ALERT_OVERDUE_MS unset and heartbeats healthy so failures do not alert, or ALERT_WEBHOOK_URL pointing at a dead port) WHEN the gate RED step runs THEN vitest exits non-zero and the gate step fails \u2014 proving the step is not a tautological pass.",
      "verify": "",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "start_ref": "s27_red_suite_gate_step_fail_closed",
        "evidence": "stdout",
        "negative_control": {
          "would_fail_if": [
            "gate step uses || true and always exits 0",
            "assertion kind ignores expected_exit",
            "step only checks file existence of the test path without running it"
          ]
        },
        "must_observe": [
          "literal_cmd does not append '|| true' for the vitest invocation",
          "assertion.expected_exit is 0 (failure of suite \u2192 step fail)",
          "RED evidence under .tmp/redhat-fix-s27-05-red/ or .gate-evidence showing pre-fix gate-plan had 0 vitest steps"
        ],
        "must_not_observe": [
          "always-green step wrapping",
          "grep-only oracle without re-execution"
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "gate-plan.json contains a step whose literal_cmd runs the D04-01 RED suite under PLATFORM_IT=1",
      "verify": "jq -r '.steps[].literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -E 'sprint27-backup-alerting-red\\.test\\.ts' | grep -q PLATFORM_IT",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "That step asserts expected_exit 0",
      "verify": "jq -e '.steps[] | select(.literal_cmd|test(\"sprint27-backup-alerting-red\")) | .assertion.expected_exit == 0' .../gate-plan.json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Live RED suite still passes under the gate env",
      "verify": "PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts \u2192 Exit 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Gate evidence layout documents dual-write of RED captures + transcript",
      "verify": "gate step script or literal_cmd copies .tmp/D04-01/* into .gate-evidence/<run>/red-suite/ and tees vitest output to a log under .gate-evidence/<run>/",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Pre-fix RED evidence: gate-plan has zero vitest steps",
      "verify": "test -f .tmp/redhat-fix-s27-05-red/pre-fix-no-vitest-in-gate-plan.txt && grep -q 'vitest_steps=0' that file (or regenerate via jq count)",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Typecheck + lint clean",
      "verify": "pnpm tsgo --noEmit \u2192 Exit 0; pnpm biome check . \u2192 Exit 0 on touched paths",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
