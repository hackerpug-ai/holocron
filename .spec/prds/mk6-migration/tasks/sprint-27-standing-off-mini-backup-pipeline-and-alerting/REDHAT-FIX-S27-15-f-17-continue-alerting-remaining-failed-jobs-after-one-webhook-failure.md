# REDHAT-FIX-S27-15 — [F-17] Continue alerting remaining failed jobs after one webhook failure

## What this does

Ensure a multi-job overdue/failed sweep alerts every bad job even when one webhook POST fails, then fail-closes once after the loop.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-15).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts` → Exit 0
- `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- `bun services/platform/src/cli/holo.ts backup:alert-sweep 2>&1 | head -n 40` → Runs without hang; prints alerted/errors fields when configured
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/alerting.ts (MODIFY — continue-on-error loop), services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts (NEW), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if shared helpers), services/platform/src/cli/holo.ts (MODIFY only if CLI must surface aggregate errors honestly), .tmp/redhat-fix-s27-15/** (NEW evidence)

Prohibited: gate-plan.json (other findings), induceBackupFailure redesign (F-1) — out of scope, mocking postBackupAlert / fetch

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-15 — [F-17] Continue alerting remaining failed jobs after one webhook failure
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S  (75 min)
AGENT:      implementer=mastra-implementer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
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
runBackupAlertSweep continues past the first postBackupAlert error; remaining jobs POST successfully; errors[] captures failures; overall failure still surfaces after the loop.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST remove the throw inside the per-job catch of runBackupAlertSweep that aborts the loop after first postBackupAlert failure (alerting.ts ~420-431)
- MUST push error strings to errors[] and continue iterating remaining bad jobs
- MUST throw once (or return fail-closed with non-empty errors that callers treat as failure) AFTER the loop if errors.length > 0
- MUST prove with real http.Server: job0 webhook fails (5xx or hang+timeout from S27-14) while job1 succeeds → posts includes job1 and errors includes job0
- MUST keep healthy silence (alerted=0 when no bad jobs) unchanged
- NEVER leave throw err inside the for-loop catch that prevents later jobs from alerting
- NEVER swallow all errors and report full success when any POST failed
- NEVER mock postBackupAlert for the multi-job proof — use real fetch to real servers
- NEVER drop posts[] for successful deliveries after a prior failure
- STRICTLY depends on REDHAT-FIX-S27-14 timeout so hang cases finish the loop
- STRICTLY PLATFORM_IT=1 integration with real Postgres heartbeats + real HTTP sinks
- STRICTLY D04-05 multi-job failure modes remain fail-closed overall

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Continue after first webhook failure (PRIMARY)
- [ ] AC-2: Fail closed after loop when any errors
- [ ] AC-3: All-success multi-job path unchanged
- [ ] AC-4: Healthy silence preserved
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Continue after first webhook failure (PRIMARY) (flow_ref T-PLAT-024)
  GIVEN Two overdue/failed heartbeat jobs (job_a, job_b) in real Postgres and a webhook router that returns 500 for job_a payload and 200 for job_b (or dual URLs via test double server path selection)
  WHEN  runBackupAlertSweep executes
  THEN  job_b alert is POSTed and present in posts[]; errors[] contains job_a failure; loop does not abort before job_b
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "continue"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if throw err inside loop still present; job_b never POSTed; errors empty despite job_a 500; mocked postBackupAlert
  START_REF: two_bad_jobs_partial_webhook
  MUST_OBSERVE: posts includes job_b; HTTP capture count for job_b >= 1; errors.length >= 1 mentioning job_a; alerted >= 1
  MUST_NOT_OBSERVE: only job_a attempted then abort with posts missing job_b; errors empty; silent full success with alerted=2 when job_a failed
  EVIDENCE: api_response (required_capture=True)

### AC-2 — Fail closed after loop when any errors (flow_ref T-PLAT-024)
  GIVEN At least one postBackupAlert failure during sweep
  WHEN  Loop completes
  THEN  Sweep surfaces failure (throw after loop OR result.errors.length>0 with non-zero process exit on CLI path) so CI/verify cannot treat partial delivery as full success without inspection
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "fail-closed"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if errors collected but success claimed with no signal; all errors swallowed
  START_REF: two_bad_jobs_partial_webhook
  MUST_OBSERVE: errors.length > 0; throw after loop OR explicit failed status for callers
  MUST_NOT_OBSERVE: clean success with empty errors when a POST failed
  EVIDENCE: stdout (required_capture=True)

### AC-3 — All-success multi-job path unchanged (flow_ref T-PLAT-024)
  GIVEN Two bad jobs and a webhook that always returns 200
  WHEN  runBackupAlertSweep runs
  THEN  posts.length === 2, errors.length === 0, alerted === 2
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "all-success"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if loop skips second job even on success; false errors populated
  START_REF: two_bad_jobs_ok_webhook
  MUST_OBSERVE: alerted === 2; posts.length === 2; errors.length === 0; receiver captures === 2
  MUST_NOT_OBSERVE: alerted === 1; errors non-empty
  EVIDENCE: api_response (required_capture=True)

### AC-4 — Healthy silence preserved (flow_ref T-PLAT-024)
  GIVEN All heartbeats fresh + status=success
  WHEN  runBackupAlertSweep runs
  THEN  alerted === 0, posts.length === 0, errors.length === 0, zero HTTP posts
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "silence"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if always-alert regression; continue-on-error path posts on healthy
  START_REF: all_heartbeats_fresh
  MUST_OBSERVE: alerted === 0; posts.length === 0; receiver captures === 0
  MUST_NOT_OBSERVE: any webhook POST; alerted > 0
  EVIDENCE: api_response (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | job_b is POSTed when job_a webhook returns 500 in the same sweep | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "continue"` |
| TC-2 | errors array includes job_a when its webhook fails | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "continue"` |
| TC-3 | Sweep surfaces failure after the loop when errors.length > 0 | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "fail-closed"` |
| TC-4 | Two bad jobs with 200 webhook yield alerted 2 and errors 0 | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "all-success"` |
| TC-5 | Healthy heartbeats produce zero webhook posts | AC-4 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t "silence"` |
| TC-6 | for-loop catch no longer rethrows before remaining jobs are attempted | AC-1 | `rg -n "throw err" services/platform/src/backup/alerting.ts | rg -n "runBackupAlertSweep|for \(const job of bad\)" -A20 ; rg -U "for \(const job of bad\)[\s\S]*?throw err" services/platform/src/backup/alerting.ts ; test $? -eq 1` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (MODIFY — continue-on-error loop)
- services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts (NEW)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY only if shared helpers)
- services/platform/src/cli/holo.ts (MODIFY only if CLI must surface aggregate errors honestly)
- .tmp/redhat-fix-s27-15/** (NEW evidence)
writeProhibited:
- gate-plan.json (other findings)
- induceBackupFailure redesign (F-1) — out of scope
- mocking postBackupAlert / fetch

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:141-145 — F-17 loop aborts on first POST failure
2. services/platform/src/backup/alerting.ts:372-440 — runBackupAlertSweep for-loop throw err
3. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:1-200 — Real sink + heartbeat seeding patterns
4. REDHAT-FIX-S27-14:all — Timeout dependency so hung first job does not block continue

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: F-17, D04-05 AC-2 multi-job failures
Interaction notes:
- Pair with S27-14: timeout converts hang into catchable error so continue path is reachable
- AlertSweepResult.errors[] already exists — use it
Pattern: for (const job of bad) { try { await postBackupAlert(...); posts.push(payload); } catch (err) { errors.push(...); /* continue */ } } if (errors.length) throw new Error(...aggregate...);
Pattern source: red-hat F-17 fix recommendation + AlertSweepResult.errors
Anti-pattern: catch { errors.push; throw err; } — jobs[1..N] never alert

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Continue-on-error suite: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts` → Exit 0
- Timeout suite still green: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-timeout.test.ts` → Exit 0
- D04-01 RED suite: `PLATFORM_IT=1 BACKUP_ALERT_OVERDUE_MS=1000 BACKUP_ALERT_TEST_WINDOW_MS=10000 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0
- CLI smoke: `bun services/platform/src/cli/holo.ts backup:alert-sweep 2>&1 | head -n 40` → Runs without hang; prints alerted/errors fields when configured
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: code-reviewer
- Rationale: Owns runBackupAlertSweep multi-job loop; must collect errors and continue so multi-job failures all alert.
- Proposed by: mastra-planner

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['multi-job-alert-continue-on-error', 'alert-sweep-aggregate-error-fail-closed']
- consumes: ['postBackupAlert', 'runBackupAlertSweep', 'webhook-timeout-from-S27-14']
- boundary_contracts: ['first-webhook-failure-does-not-skip-remaining-jobs', 'sweep-still-fail-closed-after-loop-if-any-errors']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/backup/alerting.ts

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['REDHAT-FIX-S27-14']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Finding F-17 HIGH — multi-job failures only alerted job[0]
- Recommended order: implement S27-14 timeout first, then S27-15 continue-on-error
- Handoff: dispatch mastra-implementer; reviewer = mastra-reviewer

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-15",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "two_bad_jobs_partial_webhook": {
      "description": "Real Postgres two failed/overdue heartbeats + HTTP server that fails first job and succeeds second",
      "seed_method": "public_api",
      "records": [
        "upsert job_a status=failed",
        "upsert job_b status=failed",
        "webhook returns 500 when body.job_name===job_a else 200"
      ]
    },
    "two_bad_jobs_ok_webhook": {
      "description": "Two failed heartbeats + always-200 webhook",
      "seed_method": "public_api",
      "records": [
        "upsert job_a status=failed",
        "upsert job_b status=failed",
        "webhook always 200"
      ]
    },
    "all_heartbeats_fresh": {
      "description": "All backup jobs success with fresh last_success_at",
      "seed_method": "public_api",
      "records": [
        "status=success",
        "last_success_at = now()"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN two bad jobs and partial webhook failure WHEN sweep runs THEN remaining job still POSTs and errors records the failed job",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"continue\"",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "throw inside loop aborts remaining jobs",
            "mocked postBackupAlert",
            "job_b never POSTed"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_bad_jobs_partial_webhook",
            "action": {
              "actor": "system",
              "steps": [
                "seed two jobs",
                "selective webhook",
                "sweep",
                "assert posts+errors"
              ]
            },
            "end_state": {
              "must_observe": [
                "posts includes job_b",
                "errors mentions job_a",
                "alerted >= 1"
              ],
              "must_not_observe": [
                "posts missing job_b",
                "errors empty"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN any POST failures WHEN loop completes THEN fail-closed (throw after loop or non-empty errors enforced)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"fail-closed\"",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "success with empty errors after POST failures"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_bad_jobs_partial_webhook",
            "action": {
              "actor": "system",
              "steps": [
                "sweep",
                "assert aggregate failure"
              ]
            },
            "end_state": {
              "must_observe": [
                "errors.length > 0",
                "post-loop throw or failed status"
              ],
              "must_not_observe": [
                "clean success empty errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN two bad jobs and healthy webhook WHEN sweep runs THEN alerted=2 errors=0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"all-success\"",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "second job skipped even on success"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "two_bad_jobs_ok_webhook",
            "action": {
              "actor": "system",
              "steps": [
                "seed",
                "200 webhook",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "alerted 2",
                "posts 2",
                "errors 0"
              ],
              "must_not_observe": [
                "alerted 1"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN healthy heartbeats WHEN sweep runs THEN zero posts (silence)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"silence\"",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "always-alert regression"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "all_heartbeats_fresh",
            "action": {
              "actor": "system",
              "steps": [
                "healthy seed",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "alerted 0",
                "posts 0",
                "captures 0"
              ],
              "must_not_observe": [
                "any POST"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "job_b is POSTed when job_a webhook returns 500 in the same sweep",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"continue\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "errors array includes job_a when its webhook fails",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"continue\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Sweep surfaces failure after the loop when errors.length > 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"fail-closed\"",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Two bad jobs with 200 webhook yield alerted 2 and errors 0",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"all-success\"",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Healthy heartbeats produce zero webhook posts",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-continue.test.ts -t \"silence\"",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "for-loop catch no longer rethrows before remaining jobs are attempted",
      "verify": "rg -U \"for \\(const job of bad\\)[\\s\\S]{0,400}?throw err\" services/platform/src/backup/alerting.ts ; test $? -eq 1",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->
