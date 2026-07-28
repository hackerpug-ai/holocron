# REDHAT-FIX-S27-08 — [F-8] Verify the production fifteen-minute alert SLA and cadence

## What this does

Add SLA proof (gate step and/or RED case) that refuses BACKUP_ALERT_OVERDUE_MS=500 gaming: production default threshold + real sink timing.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-08).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `env -u BACKUP_ALERT_OVERDUE_MS bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.overdueMs >= 900000'` → Exit 0.
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts -t 'SLA|15 min|fifteen'` → Exit 0 for SLA-tagged case (or full suite if case not filterable).
- `rg -n '900000|DEFAULT_OVERDUE|overdue_ms:[[:space:]]*900000|env -u BACKUP_ALERT_OVERDUE_MS' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → ≥1 SLA-oriented match.
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — add/adjust SLA step), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — SLA case with env unset), services/platform/src/cli/holo.ts (MODIFY only if needed to print overdue_ms clearly under default), .tmp/redhat-fix-s27-08/** (NEW evidence including HTTP capture)

Prohibited: Changing DEFAULT_OVERDUE_MS to make the test easier, Proving SLA solely with BACKUP_ALERT_OVERDUE_MS=500, Mocking webhook delivery

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-08 — [F-8] Verify the production fifteen-minute alert SLA and cadence
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (90 min)
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
Evidence shows overdue_ms: 900000 (or DEFAULT_OVERDUE_MS), heartbeat age >15 min at detect time, webhook POST received with latency ≤15 min, and at least one step does not set BACKUP_ALERT_OVERDUE_MS.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST run at least one alert path with BACKUP_ALERT_OVERDUE_MS unset (inherit DEFAULT_OVERDUE_MS=15min)
- MUST seed last_success_at older than 15 minutes (not 500ms) relative to that default
- MUST assert sweep reports overdue_ms equal to DEFAULT_OVERDUE_MS (900000) or ≥ 15*60*1000
- MUST assert alert arrives at a REAL webhook receiver within 15 minutes (capture method/url/headers or RED suite receiver)
- MUST keep shorter CI thresholds only on non-SLA steps; SLA step cannot set 500ms
- NEVER claim 15-minute SLA proven under overdue_ms:500
- NEVER sleep 15 minutes wall-clock if induction can set last_success_at in the past — but detection threshold must remain 15 min
- NEVER mock fetch/postBackupAlert for the SLA path
- NEVER measure only stdout alerted without sink receipt when S27-07/RED receiver is available
- STRICTLY depends on S27-04 reset so SLA step is not contaminated
- STRICTLY prefer S27-07 independent HTTP capture; if sequential order requires, embed receiver bootstrap in this task's SLA harness
- STRICTLY T-PLAT-024 15-minute window language

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — default 15m threshold path exists without BACKUP_ALERT_OVERDUE_MS
- [ ] AC-2: Stale-beyond-15m job alerts under default threshold
- [ ] AC-3: Real webhook receives POST within 15-minute window
- [ ] AC-4: Gate documents SLA step vs toy-threshold mechanics steps
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — default 15m threshold path exists without BACKUP_ALERT_OVERDUE_MS (flow_ref T-PLAT-024)
  GIVEN DEFAULT_OVERDUE_MS = 15*60*1000 in alerting.ts and resolveOverdueMs env override
  WHEN  SLA gate step or RED SLA case runs
  THEN  process env for that step leaves BACKUP_ALERT_OVERDUE_MS unset; sweep stdout/JSON shows overdue_ms: 900000 (or 15*60*1000)
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `env -u BACKUP_ALERT_OVERDUE_MS bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.overdueMs == 900000 or .overdueMs == 1500000 or .overdueMs >= 900000'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if SLA step exports BACKUP_ALERT_OVERDUE_MS=500; assertion accepts any overdue_ms; default constant silently changed without updating oracle
  START_REF: stale_beyond_default_sla
  MUST_OBSERVE: overdueMs >= 900000; env has no BACKUP_ALERT_OVERDUE_MS for SLA step
  MUST_NOT_OBSERVE: overdue_ms: 500 on SLA evidence; SLA proven only under toy threshold
  EVIDENCE: alert_sweep_stdout (required_capture=True)

### AC-2 — Stale-beyond-15m job alerts under default threshold (flow_ref T-PLAT-024)
  GIVEN stale_beyond_default_sla single induced job after reset
  WHEN  alert-sweep runs with default overdueMs
  THEN  job is classified overdue/failed and included in posts with overdue_by_minutes >= 15
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `reset; induce with age>15m under default; env -u BACKUP_ALERT_OVERDUE_MS alert-sweep --json | jq -e '.alerted>=1 and (.posts[0].overdue_by_minutes|tonumber) >= 15'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if job only 30s stale still used as SLA seed; overdue_by_minutes < 15 accepted as SLA proof; threshold lowered in code for the test only without documenting non-SLA
  START_REF: stale_beyond_default_sla
  MUST_OBSERVE: alerted>=1; overdue_by_minutes >= 15; reason overdue|failed
  MUST_NOT_OBSERVE: overdue_by_minutes 0; silent miss under default threshold
  EVIDENCE: alert_artifact (required_capture=True)

### AC-3 — Real webhook receives POST within 15-minute window (flow_ref T-PLAT-024)
  GIVEN real_webhook_receiver + stale_beyond_default_sla
  WHEN  sweep posts alert
  THEN  receiver captures POST with receivedAt - induceAt <= 15 minutes; capture includes method and url (not posts[] self-report alone)
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: http-receiver+backup-alerting
  VERIFY: `receiver capture JSON has method=='POST' and elapsed_ms <= 900000`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if only sweep self-reported posts[] written as alerts-received.json without HTTP fields; postBackupAlert stubbed to skip fetch; latency measured against toy 500ms path only
  START_REF: real_webhook_receiver
  MUST_OBSERVE: HTTP POST method; url present; elapsed_ms <= 900000; payload job_name matches induced job
  MUST_NOT_OBSERVE: capture without method/url/headers; elapsed > 15 minutes without fail; self-reported posts only as sole evidence
  EVIDENCE: http_capture (required_capture=True)

### AC-4 — Gate documents SLA step vs toy-threshold mechanics steps (flow_ref T-PLAT-024)
  GIVEN gate-plan may keep short thresholds for fast mechanics steps
  WHEN  gate-plan is updated
  THEN  at least one step is labeled/configured as SLA (no BACKUP_ALERT_OVERDUE_MS=500) and assertions require overdue_ms default; toy steps cannot be the only alert evidence
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan
  VERIFY: `rg -n 'BACKUP_ALERT_OVERDUE_MS=500' gate-plan.json for non-SLA; SLA step literal_cmd must not set 500; SLA expect includes overdue_ms:[[:space:]]*900000|overdueMs.:900000`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if all alert steps still set 500ms; SLA claim in step TEXT without matching env/assertion; no step asserts default overdue_ms
  START_REF: toy_threshold_control
  MUST_OBSERVE: ≥1 SLA step without BACKUP_ALERT_OVERDUE_MS=500; SLA assertion binds default overdue_ms
  MUST_NOT_OBSERVE: every alert step overdue_ms 500 only; TEXT says 15 minutes while cmd sets 500
  EVIDENCE: gate_plan (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Default overdueMs is 900000 when env unset | AC-1 | `env -u BACKUP_ALERT_OVERDUE_MS alert-sweep --json overdueMs` |
| TC-2 | Job older than 15m alerts under default threshold | AC-2 | `induce stale; sweep; overdue_by_minutes>=15` |
| TC-3 | Real HTTP capture within 15m window | AC-3 | `receiver capture elapsed_ms<=900000` |
| TC-4 | gate-plan has dedicated SLA step not using 500ms | AC-4 | `rg/jq gate-plan SLA step` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — add/adjust SLA step)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — SLA case with env unset)
- services/platform/src/cli/holo.ts (MODIFY only if needed to print overdue_ms clearly under default)
- .tmp/redhat-fix-s27-08/** (NEW evidence including HTTP capture)
writeProhibited:
- Changing DEFAULT_OVERDUE_MS to make the test easier
- Proving SLA solely with BACKUP_ALERT_OVERDUE_MS=500
- Mocking webhook delivery

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:77-82 — F-8 HIGH — overdue_ms:500 everywhere; DEFAULT_OVERDUE_MS 15 min never tested
2. services/platform/src/backup/alerting.ts:29-32 — DEFAULT_OVERDUE_MS = 15 * 60 * 1000; ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS=300
3. services/platform/src/backup/alerting.ts:161-168 — resolveOverdueMs env BACKUP_ALERT_OVERDUE_MS override
4. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:46-49 — production SLA defaults vs CI shorten via env
5. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:53-59 — T-PLAT-024 alert within window
6. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:47-80 — alert steps text claim 15 minutes; cmds do not set production threshold

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: alerting.ts:30 DEFAULT_OVERDUE_MS, T-PLAT-024
Interaction notes:
- Prefer induce with last_success_at = now-16m under default threshold so wall-clock wait is only sweep/POST latency, not 15m sleep.
- Coordinate with REDHAT-FIX-S27-07 for independent HTTP capture; if 07 not merged, embed RED receiver bootstrap in SLA harness.
- Keep fast 500ms steps only as non-SLA mechanics, clearly labeled.
Pattern: env -u BACKUP_ALERT_OVERDUE_MS; reset; induce age>15m; alert-sweep; assert overdueMs default + HTTP capture elapsed<=15m
Pattern source: resolveOverdueMs + RED waitForAlertPost window
Anti-pattern: BACKUP_ALERT_OVERDUE_MS=500 on every step while gate TEXT says 15 minutes

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Default overdueMs: `env -u BACKUP_ALERT_OVERDUE_MS bun services/platform/src/cli/holo.ts backup:alert-sweep --json | jq -e '.overdueMs >= 900000'` → Exit 0.
- SLA integration path: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts -t 'SLA|15 min|fifteen'` → Exit 0 for SLA-tagged case (or full suite if case not filterable).
- Gate-plan SLA step present: `rg -n '900000|DEFAULT_OVERDUE|overdue_ms:[[:space:]]*900000|env -u BACKUP_ALERT_OVERDUE_MS' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → ≥1 SLA-oriented match.
- Typecheck/lint: `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: F-8 HIGH: every alert step sets overdue_ms:500 so the production 15-minute SLA is never tested. Test-reality must prove DEFAULT_OVERDUE_MS=15min detection-to-alert at a real webhook receiver.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['production-15m-sla-gate-or-test', 'default-overdue-ms-oracle', 'real-webhook-sla-timing-evidence']
- consumes: ['DEFAULT_OVERDUE_MS', 'induce with stale last_success_at > 15 min', 'REDHAT-FIX-S27-07 real webhook receiver (preferred) or RED suite http.Server', 'REDHAT-FIX-S27-04 isolation/reset']
- boundary_contracts: ['BACKUP_ALERT_OVERDUE_MS unset → resolveOverdueMs returns 15*60*1000', 'stale heartbeat >15m → sweep POSTs within window to real sink']

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
- depends_on: ['REDHAT-FIX-S27-04', 'REDHAT-FIX-S27-07']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-08)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-08",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "stale_beyond_default_sla": {
      "description": "Single job with last_success_at = now - 16 minutes (or induce with overdueMs=DEFAULT), BACKUP_ALERT_OVERDUE_MS unset in process env for sweep.",
      "seed_method": "cli",
      "records": [
        "env -u BACKUP_ALERT_OVERDUE_MS",
        "heartbeat age > 15 minutes",
        "webhook receiver listening"
      ]
    },
    "toy_threshold_control": {
      "description": "Same induce under BACKUP_ALERT_OVERDUE_MS=500 \u2014 documents that toy path is NOT the SLA proof.",
      "seed_method": "cli",
      "records": [
        "overdue_ms: 500 in sweep output",
        "labeled non-SLA mechanics-only"
      ]
    },
    "real_webhook_receiver": {
      "description": "Independent http.Server (RED suite or S27-07 gate receiver) capturing method/url/headers/rawBody/receivedAt.",
      "seed_method": "public_api",
      "records": [
        "ALERT_WEBHOOK_URL points at receiver",
        "captures include method POST"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN SLA path WHEN sweep runs with BACKUP_ALERT_OVERDUE_MS unset THEN overdueMs is production default \u2265900000",
      "verify": "env -u \u2026 alert-sweep --json",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "SLA step sets 500ms"
          ]
        },
        "evidence": {
          "artifact_type": "alert_sweep_stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stale_beyond_default_sla",
            "action": {
              "actor": "operator",
              "steps": [
                "unset env",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "overdueMs>=900000"
              ],
              "must_not_observe": [
                "overdue_ms: 500 on SLA evidence"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN heartbeat age>15m WHEN default sweep THEN alert with overdue_by_minutes>=15",
      "verify": "induce+sweep json",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "30s seed used as SLA"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stale_beyond_default_sla",
            "action": {
              "actor": "test",
              "steps": [
                "induce",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "overdue_by_minutes>=15"
              ],
              "must_not_observe": [
                "silent miss"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN real receiver WHEN SLA alert fires THEN HTTP POST within 15m with method/url",
      "verify": "receiver capture",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "http-receiver+backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "self-reported posts only",
            "fetch stubbed"
          ]
        },
        "evidence": {
          "artifact_type": "http_capture",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "real_webhook_receiver",
            "action": {
              "actor": "test",
              "steps": [
                "receive POST"
              ]
            },
            "end_state": {
              "must_observe": [
                "method POST",
                "elapsed<=900000"
              ],
              "must_not_observe": [
                "capture without HTTP fields"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN gate-plan WHEN updated THEN \u22651 SLA step without 500ms gaming",
      "verify": "rg/jq gate-plan",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "all steps 500ms"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "toy_threshold_control",
            "action": {
              "actor": "operator",
              "steps": [
                "classify steps"
              ]
            },
            "end_state": {
              "must_observe": [
                "SLA step present"
              ],
              "must_not_observe": [
                "TEXT/cmd mismatch 15m vs 500ms only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "default overdueMs proof",
      "verify": "env -u sweep json",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "stale>15m alerts",
      "verify": "induce+sweep",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "HTTP SLA capture",
      "verify": "receiver elapsed",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "gate SLA step structure",
      "verify": "gate-plan jq",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
