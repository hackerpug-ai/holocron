# REDHAT-FIX-S27-06 — [F-6] Add a healthy-run zero-alert silence gate

## What this does

Add a gate step that seeds all jobs healthy via the S27-04 reset path, runs holo backup:alert-sweep, and asserts alerted: 0 with zero post[…] lines (D04-05 AC-4 NEVER-tier).

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-06).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bun services/platform/src/cli/holo.ts backup:healthy --all && bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'` → Exit 0.
- `rg -n 'alerted:[[:space:]]*0|alerted:\\s\+0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → ≥1 match on silence step assertion.
- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0.
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — add silence step), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if gate-aligned silence evidence helper needed), .tmp/redhat-fix-s27-06/** (NEW evidence)

Prohibited: Changing detection query to always return healthy, Stubbing postBackupAlert to no-op as a silence 'fix', Owning reset CLI implementation (S27-04) beyond calling it

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-06 — [F-6] Add a healthy-run zero-alert silence gate
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (75 min)
AGENT:      implementer=test-quality-reviewer | reviewer=code-reviewer
PROPOSED-BY: test-quality-reviewer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
gate-plan contains a silence step whose assertion fails if alerted>=1; always-alert mutation of runBackupAlertSweep cannot pass the gate; evidence log shows alerted:0 after healthy seed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add a gate step: runHealthy/reset all jobs then holo backup:alert-sweep
- MUST assert alerted:\s+0 (or JSON alerted===0) AND no post[ lines (posts.length===0)
- MUST place the silence step after a clean healthy seed (not after induce steps without reset)
- MUST write RED evidence: with always-alert stub / leftover poisoned rows, silence step fails; after true healthy seed it passes
- MUST map to D04-05 AC-4 / T-PLAT-024 NEVER-tier silence
- NEVER treat 'no step ran' as silence proof
- NEVER assert only that alert-sweep exit 0 (errors empty) without alerted:0
- NEVER run silence assertion while induced failures remain
- NEVER mock the sweep to hardcode alerted:0 without querying heartbeats
- STRICTLY depends on REDHAT-FIX-S27-04 for honest reset
- STRICTLY prefer also asserting independent webhook receiver post count 0 if REDHAT-FIX-S27-07 is available; if not, stdout alerted:0 + posts empty is minimum
- STRICTLY flow_ref T-PLAT-024

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — gate silence step exists and asserts alerted:0
- [ ] AC-2: Healthy seed produces zero posts at sweep
- [ ] AC-3: Silence step fails on poisoned / always-alert seed
- [ ] AC-4: RED suite silence case remains green and is referenced
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — gate silence step exists and asserts alerted:0 (flow_ref T-PLAT-024)
  GIVEN sprint-27 gate-plan.json certifying CAP-BAK-01
  WHEN  the healthy-silence step is added
  THEN  literal_cmd runs healthy reset + backup:alert-sweep; assertion requires alerted:\s+0 and forbids post[ / alerted:[1-9]
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan+backup-alerting
  VERIFY: `jq -e '.steps[] | select(.literal_cmd|test("alert-sweep")) | select(.assertion.expect_log_regex|tostring|test("alerted:\\s\+0|alerted:[[:space:]]+0"))' gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if no silence step is added; step only runs alert-sweep without healthy seed; assertion still only matches alerted:[1-9]; step is documentation-only without literal_cmd
  START_REF: gate_plan_without_silence
  MUST_OBSERVE: silence step present; expect_log_regex or structured assert includes alerted: 0; expect_not_log_regex includes alerted:[1-9] and/or post\[
  MUST_NOT_OBSERVE: only failure-token steps; silence asserted without running sweep
  EVIDENCE: gate_plan (required_capture=True)

### AC-2 — Healthy seed produces zero posts at sweep (flow_ref T-PLAT-024)
  GIVEN all_heartbeats_fresh
  WHEN  holo backup:alert-sweep runs (with ALERT_WEBHOOK_URL set if delivery path requires it)
  THEN  stdout shows alerted: 0, no post[ lines, JSON posts.length===0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `bun holo backup:healthy --all && bun holo backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if sweep always POSTs regardless of state; posts array non-empty while alerted claims 0; healthy seed incomplete (poisoned rows remain)
  START_REF: all_heartbeats_fresh
  MUST_OBSERVE: alerted==0; posts length 0
  MUST_NOT_OBSERVE: any post[] entry; alerted>=1
  EVIDENCE: alert_artifact (required_capture=True)

### AC-3 — Silence step fails on poisoned / always-alert seed (flow_ref T-PLAT-024)
  GIVEN always_alert_poison
  WHEN  silence step command/assertion runs without reset
  THEN  assertion fails because alerted>=1
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting+gate
  VERIFY: `induce kill; run silence assertion commands expecting fail (alerted not 0)`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if silence assertion still passes when alerted>=1; assertion only checks process exit code; step greps a static 'silent' string never emitted
  START_REF: always_alert_poison
  MUST_OBSERVE: assertion fail; alerted>=1 in log
  MUST_NOT_OBSERVE: silence pass on poisoned state
  EVIDENCE: stdout (required_capture=True)

### AC-4 — RED suite silence case remains green and is referenced (flow_ref T-PLAT-024)
  GIVEN sprint27-backup-alerting-red.test.ts healthy silence itLive
  WHEN  PLATFORM_IT=1 vitest runs the healthy silence case after gate step lands
  THEN  receiver.posts.length===0 still holds; gate step does not regress the RED contract
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: vitest+http-receiver
  VERIFY: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts -t silence`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate step greenwashes while RED silence fails; test receiver mocked; healthy path emits webhook POSTs
  START_REF: all_heartbeats_fresh
  MUST_OBSERVE: vitest pass; posts length 0 at real sink
  MUST_NOT_OBSERVE: any alert POST during healthy run
  EVIDENCE: test_transcript (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | gate-plan contains silence step asserting alerted:0 | AC-1 | `jq select silence step` |
| TC-2 | healthy seed → alert-sweep alerted==0 posts[] empty | AC-2 | `healthy --all; alert-sweep --json jq` |
| TC-3 | poisoned seed fails silence assertion | AC-3 | `induce; silence assert fails` |
| TC-4 | RED silence itLive still passes | AC-4 | `PLATFORM_IT=1 vitest -t silence` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — add silence step)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if gate-aligned silence evidence helper needed)
- .tmp/redhat-fix-s27-06/** (NEW evidence)
writeProhibited:
- Changing detection query to always return healthy
- Stubbing postBackupAlert to no-op as a silence 'fix'
- Owning reset CLI implementation (S27-04) beyond calling it

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:63-68 — F-6 no healthy-silence gate step; D04-05 AC-4 NEVER-tier
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-05-backup-failure-overdue-alerting-no-dashboard-polling.md:62-66,117-125 — NEVER healthy-run silent; AC-4 zero posts
3. services/platform/src/backup/alerting.ts:401-411 — bad.length===0 returns alerted:0 posts:[]
4. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:370-396 — silence proof expect(receiver.posts.length).toBe(0)
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:9-82 — no silence step among planned steps

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: D04-05 AC-4, alerting.ts:401-411
Interaction notes:
- Must run after S27-04 reset CLI exists.
- If S27-07 independent receiver exists, dual-assert stdout alerted:0 AND receiver captures 0.
Pattern: backup:healthy --all && backup:alert-sweep → assert alerted:0 && no post[
Pattern source: RED suite silence case + runBackupAlertSweep early return
Anti-pattern: gate only greps alerted:[1-9] on failure steps — always-alert regressions stay invisible

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Silence CLI proof: `bun services/platform/src/cli/holo.ts backup:healthy --all && bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.alerted==0 and (.posts|length)==0'` → Exit 0.
- Gate-plan silence step: `rg -n 'alerted:[[:space:]]*0|alerted:\\s\+0' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → ≥1 match on silence step assertion.
- RED silence: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0.
- Typecheck/lint if tests touched: `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: D04-05 AC-4 is a NEVER-tier silence constraint with no gate step. Test-reality owns the healthy-run zero-alert oracle so always-alert regressions cannot ship green.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['healthy-silence-gate-step', 'alerted-zero-oracle', 'anti-always-alert-gate-control']
- consumes: ['REDHAT-FIX-S27-04 reset CLI', 'runBackupAlertSweep silence path', 'D04-05 AC-4 NEVER constraint']
- boundary_contracts: ['healthy heartbeats → alert-sweep → alerted:0 stdout + empty posts[]', 'gate silence step → certification of D04-05 AC-4']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- /Users/inference1/Projects/brain/docs/TESTING-HIERARCHY.md
- /Users/inference1/Projects/brain/docs/ANTI-STUB-REVIEW.md
- /Users/inference1/Projects/brain/docs/TDD-METHODOLOGY.md
- /Users/inference1/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-04']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-06)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-06",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "all_heartbeats_fresh": {
      "description": "Every backup_heartbeat row status=success, last_success_at=now after backup:healthy --all; induced store empty.",
      "seed_method": "cli",
      "records": [
        "backup:healthy --all exit 0",
        "verify:backup exit 0",
        "induced store empty"
      ]
    },
    "always_alert_poison": {
      "description": "At least one overdue/failed heartbeat remains so a correct sweep alerts; used as negative seed that silence step must fail on.",
      "seed_method": "cli",
      "records": [
        "induce kill on wal_archive",
        "alert-sweep alerted>=1"
      ]
    },
    "gate_plan_without_silence": {
      "description": "Current gate-plan.json has 6 steps, none asserting alerted:0.",
      "seed_method": "public_api",
      "records": [
        "gate-plan planned_steps:6",
        "no expect_log_regex alerted:\\s+0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN gate-plan WHEN silence step added THEN healthy reset + alert-sweep asserts alerted:0",
      "verify": "jq silence step",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan+backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "no silence step",
            "still only failure tokens"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "gate_plan_without_silence",
            "action": {
              "actor": "operator",
              "steps": [
                "add silence step"
              ]
            },
            "end_state": {
              "must_observe": [
                "alerted:0 assertion"
              ],
              "must_not_observe": [
                "silence without sweep"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN all healthy WHEN sweep THEN alerted 0 posts empty",
      "verify": "alert-sweep --json",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "always-alert path"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "all_heartbeats_fresh",
            "action": {
              "actor": "operator",
              "steps": [
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "alerted==0",
                "posts empty"
              ],
              "must_not_observe": [
                "any post"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN poisoned heartbeats WHEN silence assertion runs THEN it fails",
      "verify": "induce; silence assert fail",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting+gate",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "silence passes on poison"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "always_alert_poison",
            "action": {
              "actor": "test",
              "steps": [
                "silence assert"
              ]
            },
            "end_state": {
              "must_observe": [
                "assert fail"
              ],
              "must_not_observe": [
                "false silence pass"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN RED silence case WHEN vitest runs THEN zero HTTP posts",
      "verify": "PLATFORM_IT=1 vitest -t silence",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest+http-receiver",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "mocked receiver",
            "healthy emits posts"
          ]
        },
        "evidence": {
          "artifact_type": "test_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "all_heartbeats_fresh",
            "action": {
              "actor": "test",
              "steps": [
                "vitest silence"
              ]
            },
            "end_state": {
              "must_observe": [
                "pass",
                "posts 0"
              ],
              "must_not_observe": [
                "HTTP POST during health"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "silence step in gate-plan",
      "verify": "jq",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "healthy sweep alerted 0",
      "verify": "cli json",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "poison fails silence",
      "verify": "induce + assert fail",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED silence green",
      "verify": "vitest",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
