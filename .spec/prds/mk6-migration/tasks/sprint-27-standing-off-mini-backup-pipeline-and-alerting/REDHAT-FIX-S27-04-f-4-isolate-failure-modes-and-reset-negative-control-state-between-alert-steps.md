# REDHAT-FIX-S27-04 — [F-4] Isolate failure modes and reset negative-control state between alert steps

## What this does

Add a durable reset path (CLI-visible runHealthyBackupJob('all') or induce --mode clear), chain it before each alert induce step, and tighten per-mode gate oracles so sticky state and cross-mode contamination cannot pass.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-04).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive && bun services/platform/src/cli/holo.ts backup:healthy --all && bun services/platform/src/cli/holo.ts backup:alert-sweep 2>&1 | tee /tmp/s27-04-reset.out | grep -E 'alerted:[[:space:]]+0'` → Exit 0; alerted: 0 after reset.
- `jq -r '.steps[] | select(.n>=4 and .n<=6) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Each command includes reset + induce + alert-sweep; assertions name post[job] + mode keywords.
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0 including isolation cases.
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

## Scope

Writes: services/platform/src/backup/alerting.ts (MODIFY — clear/reset mode helpers if needed; scope healthy update WHERE if required), services/platform/src/cli/holo.ts (MODIFY — backup:healthy --all and/or induce --mode clear), .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — steps 4-6), services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — isolation cases), .tmp/redhat-fix-s27-04/** (NEW evidence)

Prohibited: Replacing real induction redesign owned by REDHAT-FIX-S27-01 beyond calling its public induce API, Disabling durable induced store without a clear/reset path, Weakening production overdue detection thresholds globally to fake isolation

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-04 — [F-4] Isolate failure modes and reset negative-control state between alert steps
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
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
Sequential kill → credential → config steps produce non-identical mode-specific post lines; negative-control jobs never appear in posts[]; induced store empty after each reset; RED/gate isolation tests fail if reset is skipped.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST reset via runHealthyBackupJob('all') or induce --mode clear before each of steps 4/5/6 (clear heartbeats to success+now AND wipe induced store)
- MUST expose the reset through a real CLI entrypoint callable from gate-plan literal_cmd (not test-only import)
- MUST tighten each mode oracle to post\[<induced_job>\]: reason=(failed|overdue) failure_reason containing mode keywords (kill|credential|config)
- MUST require negative-control: zero posts for all-clear / non-induced healthy jobs (post[all-clear] count=0; no alert for jobs not just induced)
- MUST prove isolation with RED evidence: without reset, steps are contaminated; with reset, mode-specific
- NEVER leave .tmp/backup-alert-induced.json sticky across mode steps
- NEVER accept OR-alternation alerted:[1-9]|killed|reason=failed as a mode-specific oracle
- NEVER allow negative-control jobs to remain overdue/failed into the next mode step
- NEVER reset by bulk-silencing production failures outside the test/gate harness path without an explicit test-scoped command
- STRICTLY depends on REDHAT-FIX-S27-01 so induction honesty is defined; this task owns isolation/reset regardless of synthetic vs real induction
- STRICTLY each step's must_observe names the induced job id and mode keywords
- STRICTLY PLATFORM_IT=1 for isolation integration tests

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: PRIMARY — reset clears induced store and heartbeats
- [ ] AC-2: Gate steps 4/5/6 chain reset then single-mode induce
- [ ] AC-3: Mode-specific post[job] oracles; no OR leakage
- [ ] AC-4: Negative-control jobs stay silent (post count 0)
- [ ] AC-5: RED isolation test fails if reset skipped
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — PRIMARY — reset clears induced store and heartbeats (flow_ref T-PLAT-024)
  GIVEN sticky_induced_store with poisoned heartbeats and non-empty .tmp/backup-alert-induced.json
  WHEN  operator runs the new reset CLI (backup:healthy --all OR backup:induce-failure --mode clear)
  THEN  induced store is {} / missing annotations; all heartbeats status=success with last_success_at fresh; subsequent alert-sweep prints alerted: 0
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `seed induce; run reset CLI; test ! -s .tmp/backup-alert-induced.json || jq -e 'length==0' .tmp/backup-alert-induced.json; bun holo backup:alert-sweep | grep -E 'alerted:[[:space:]]+0'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if reset only clears memory Map but leaves disk induced store; reset only deletes JSON but leaves overdue heartbeats; reset is a no-op stub that always prints ok; alert-sweep still alerted>0 after reset
  START_REF: sticky_induced_store
  MUST_OBSERVE: induced store empty; alerted: 0; overall: OK or verify:backup exit 0 under default overdue window
  MUST_NOT_OBSERVE: post[wal_archive] after reset without new induce; non-empty induced annotations; status=failed rows remaining
  EVIDENCE: cli_stdout_and_induced_store (required_capture=True)

### AC-2 — Gate steps 4/5/6 chain reset then single-mode induce (flow_ref T-PLAT-024)
  GIVEN gate-plan.json alert steps for kill, credential-expired, config-removed
  WHEN  literal_cmd for each step is rewritten
  THEN  each step runs reset → induce one mode/job → alert-sweep; no step relies on prior step residue
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: gate-plan
  VERIFY: `jq -r '.steps[] | select(.n>=4 and .n<=6) | .literal_cmd' gate-plan.json | while read c; do echo "$c" | grep -Eq 'healthy|--mode clear|runHealthy' && echo "$c" | grep -Eq 'induce-failure' && echo "$c" | grep -Eq 'alert-sweep'; done`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if any of steps 4/5/6 omits reset; steps still only induce && sweep without clean slate; reset commented out
  START_REF: three_mode_sequence
  MUST_OBSERVE: reset present in each of steps 4-6; induce present in each of steps 4-6; alert-sweep present in each of steps 4-6
  MUST_NOT_OBSERVE: induce && alert-sweep without reset; shared state assumption across steps
  EVIDENCE: gate_plan (required_capture=True)

### AC-3 — Mode-specific post[job] oracles; no OR leakage (flow_ref T-PLAT-024)
  GIVEN clean_slate_all_healthy then a single mode induce
  WHEN  alert-sweep runs and gate assertion evaluates
  THEN  log matches post[<induced_job>]: reason=(failed|overdue) failure_reason=<mode keywords>; does not pass on unrelated job posts alone
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `reset; induce kill wal_archive; sweep; grep -E 'post\[wal_archive\]: reason=(failed|overdue) failure_reason=.*(kill|killed|WAL)' ; ! grep -E 'post\[all-clear\]' or assert count 0`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if oracle is still alerted:[1-9]|killed|reason=failed; credential step can pass on leftover kill failure_reason; config_removed step can pass solely because earlier modes left posts
  START_REF: three_mode_sequence
  MUST_OBSERVE: post[wal_archive] kill/WAL keywords on kill step; post[base_backup] credential keywords on credential step; post[restic_blob_mirror] config/overdue keywords on config step; three step post sets are not byte-identical
  MUST_NOT_OBSERVE: byte-identical step4/5/6 logs; loose OR oracle without job name; alerted:5 after single-job induce on clean slate
  EVIDENCE: alert_sweep_stdout (required_capture=True)

### AC-4 — Negative-control jobs stay silent (post count 0) (flow_ref T-PLAT-024)
  GIVEN clean slate plus an explicit healthy negative-control job row (e.g. all-clear or a non-induced job kept success)
  WHEN  one other job is induced and sweep runs
  THEN  no post[all-clear] / no post for non-induced healthy jobs; only induced job appears in posts[]
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: backup-alerting
  VERIFY: `reset; ensure all-clear heartbeat success; induce kill wal_archive; sweep --json; python assert only wal_archive in posts and all-clear absent`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if healthy negative-control job is alerted; sweep alerts every job regardless of induce; reset forgotten so prior poisons alert as 'negative control'
  START_REF: clean_slate_all_healthy
  MUST_OBSERVE: posts contain wal_archive only; post[all-clear] count=0; alerted equals number of intentionally induced jobs (1)
  MUST_NOT_OBSERVE: post for all-clear; post for wal_archive-healthy if present; alerted equals total jobs after single induce
  EVIDENCE: alert_artifact (required_capture=True)

### AC-5 — RED isolation test fails if reset skipped (flow_ref T-PLAT-024)
  GIVEN integration test that intentionally skips reset between two modes
  WHEN  PLATFORM_IT=1 vitest runs the isolation suite
  THEN  the 'without reset → contamination' case documents failure signature; the 'with reset → isolation' case passes
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: vitest+backup-alerting
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts -t isolation (or new isolation describe)`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if test always green without asserting contamination; test mocks induced store; test does not call real runHealthyBackupJob / CLI reset
  START_REF: sticky_induced_store
  MUST_OBSERVE: contamination observable without reset; isolation holds with reset; vitest exit 0 for isolation suite after GREEN
  MUST_NOT_OBSERVE: mocked Map-only store ignoring disk file; pass without running real sweep
  EVIDENCE: test_transcript (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Reset CLI empties induced store and yields alerted:0 | AC-1 | `induce; reset; alert-sweep shows alerted:0` |
| TC-2 | gate-plan steps 4-6 each include reset+induce+sweep | AC-2 | `jq/rg structure check on gate-plan.json` |
| TC-3 | Mode oracles bind post[job]+failure_reason keywords | AC-3 | `three mode sequence produces non-identical mode-specific posts` |
| TC-4 | Negative-control job never posts during single induce | AC-4 | `JSON posts array job set equality` |
| TC-5 | Isolation vitest covers with/without reset | AC-5 | `PLATFORM_IT=1 pnpm vitest run … isolation` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts (MODIFY — clear/reset mode helpers if needed; scope healthy update WHERE if required)
- services/platform/src/cli/holo.ts (MODIFY — backup:healthy --all and/or induce --mode clear)
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json (MODIFY — steps 4-6)
- services/platform/tests/integration/sprint27-backup-alerting-red.test.ts (MODIFY — isolation cases)
- .tmp/redhat-fix-s27-04/** (NEW evidence)
writeProhibited:
- Replacing real induction redesign owned by REDHAT-FIX-S27-01 beyond calling its public induce API
- Disabling durable induced store without a clear/reset path
- Weakening production overdue detection thresholds globally to fake isolation

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:49-54 — F-4 sticky induce annotations; byte-identical steps 4/5/6; tighten post[job] oracles
2. services/platform/src/backup/alerting.ts:96-127 — inducedStorePath / rememberInduced durable JSON
3. services/platform/src/backup/alerting.ts:447-486 — runHealthyBackupJob clears inducedByJob + saveInducedStore({}) + bulk success
4. services/platform/src/backup/alerting.ts:497-535 — induceBackupFailure rememberInduced sticky path
5. services/platform/src/cli/holo.ts:2233-2246 — alert-sweep prints post[job_name]: reason=… failure_reason=…
6. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:47-80 — steps 4/5/6 induce without reset; weak OR oracles
7. services/platform/tests/integration/sprint27-backup-alerting-red.test.ts:350-396 — healthy silence uses runHealthyBackupJob — pattern to expose via CLI for gate

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: services/platform/src/backup/alerting.ts, .spec/reviews/red-hat-sprint27-20260728T054039Z.md
Interaction notes:
- Depends on REDHAT-FIX-S27-01 for induction honesty; isolation still required even if induction stays synthetic for CI.
- S27-06 silence gate consumes the same reset CLI.
- Prefer backup:healthy --all wrapping runHealthyBackupJob('all') so gate-plan stays pure CLI.
Pattern: reset (clear store + success heartbeats) → induce single (mode,job) → alert-sweep → assert post[job] + mode keywords + no negative-control posts
Pattern source: alerting.ts:453-486 runHealthyBackupJob; holo.ts:2242-2245 post printer
Anti-pattern: chain induce kill && sweep; induce credential && sweep without reset — sticky annotations make every step alerted:5 with identical logs

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Reset CLI works: `bun services/platform/src/cli/holo.ts backup:induce-failure --mode kill --job wal_archive && bun services/platform/src/cli/holo.ts backup:healthy --all && bun services/platform/src/cli/holo.ts backup:alert-sweep 2>&1 | tee /tmp/s27-04-reset.out | grep -E 'alerted:[[:space:]]+0'` → Exit 0; alerted: 0 after reset.
- Gate-plan isolation structure: `jq -r '.steps[] | select(.n>=4 and .n<=6) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → Each command includes reset + induce + alert-sweep; assertions name post[job] + mode keywords.
- Isolation integration tests: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-alerting-red.test.ts` → Exit 0 including isolation cases.
- Typecheck and lint: `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: test-quality-reviewer
- Reviewer: code-reviewer
- Rationale: F-4 is sticky induced-state + weak mode oracles: steps 4/5/6 produce byte-identical sweeps and alert negative-control jobs. Test-reality owns isolation, reset hygiene, and mode-specific post[job] oracles.
- Proposed by: test-quality-reviewer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['backup-alert-state-reset-cli', 'mode-isolated-gate-steps', 'negative-control-zero-post-oracle', 'tight-post-job-failure-reason-oracles']
- consumes: ['runHealthyBackupJob / rememberInduced (alerting.ts)', 'backup:induce-failure CLI', 'backup:alert-sweep post[job] printer', 'REDHAT-FIX-S27-01 honest induction contract']
- boundary_contracts: ['reset CLI → clears backup_heartbeat + .tmp/backup-alert-induced.json', 'induce mode M job J → only J annotated', 'alert-sweep stdout post[J] → gate mode oracle']

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
- depends_on: ['REDHAT-FIX-S27-01']
- blocks: ['REDHAT-FIX-S27-06', 'REDHAT-FIX-S27-08']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-04)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sticky_induced_store": {
      "description": "Prior induce wrote .tmp/backup-alert-induced.json with kill_wal_behind on wal_archive and heartbeats still poisoned \u2014 start state that contaminates a later credential step if not reset.",
      "seed_method": "cli",
      "records": [
        "backup:induce-failure --mode kill --job wal_archive",
        ".tmp/backup-alert-induced.json contains wal_archive",
        "alert-sweep alerted>=1 for wal_archive"
      ]
    },
    "clean_slate_all_healthy": {
      "description": "After reset: all heartbeats success+now, induced store {}, no pending posts.",
      "seed_method": "cli",
      "records": [
        "holo backup:healthy --all (or induce --mode clear) exit 0",
        "induced store empty object {}",
        "alert-sweep alerted: 0"
      ]
    },
    "three_mode_sequence": {
      "description": "Gate sequence kill/wal_archive \u2192 credential/base_backup \u2192 config/restic_blob_mirror with reset between each.",
      "seed_method": "cli",
      "records": [
        "step kill induces only wal_archive",
        "step credential induces only base_backup after reset",
        "step config induces only restic_blob_mirror after reset"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN sticky induced state WHEN reset CLI runs THEN induced store empty and alert-sweep alerted:0",
      "verify": "induce; reset; sweep alerted:0",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "disk induced store not cleared",
            "heartbeats remain overdue",
            "reset stub always ok"
          ]
        },
        "evidence": {
          "artifact_type": "cli_stdout_and_induced_store",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sticky_induced_store",
            "action": {
              "actor": "operator",
              "steps": [
                "reset",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "induced empty",
                "alerted: 0"
              ],
              "must_not_observe": [
                "post after reset without induce"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN gate alert steps WHEN rewritten THEN each is reset\u2192induce\u2192sweep",
      "verify": "jq literal_cmd structure",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "gate-plan",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "any step omits reset"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "three_mode_sequence",
            "action": {
              "actor": "operator",
              "steps": [
                "inspect steps 4-6"
              ]
            },
            "end_state": {
              "must_observe": [
                "reset+induce+sweep each"
              ],
              "must_not_observe": [
                "induce-only chain"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN single-mode induce WHEN sweep runs THEN post[job] + mode keywords required",
      "verify": "mode sequence non-identical posts",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "loose OR oracle",
            "byte-identical multi-mode logs"
          ]
        },
        "evidence": {
          "artifact_type": "alert_sweep_stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "three_mode_sequence",
            "action": {
              "actor": "test",
              "steps": [
                "reset induce sweep x3"
              ]
            },
            "end_state": {
              "must_observe": [
                "mode-specific post lines",
                "non-identical logs"
              ],
              "must_not_observe": [
                "alerted:5 after single induce"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN healthy negative-control job WHEN another job induced THEN negative-control posts count 0",
      "verify": "JSON posts job set",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "all-clear alerted"
          ]
        },
        "evidence": {
          "artifact_type": "alert_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "clean_slate_all_healthy",
            "action": {
              "actor": "test",
              "steps": [
                "induce one",
                "sweep"
              ]
            },
            "end_state": {
              "must_observe": [
                "only induced job posts"
              ],
              "must_not_observe": [
                "post[all-clear]"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN isolation vitest WHEN reset skipped THEN contamination visible; with reset isolation holds",
      "verify": "PLATFORM_IT=1 vitest isolation",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest+backup-alerting",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "mocked store",
            "no contamination assertion"
          ]
        },
        "evidence": {
          "artifact_type": "test_transcript",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sticky_induced_store",
            "action": {
              "actor": "test",
              "steps": [
                "without reset",
                "with reset"
              ]
            },
            "end_state": {
              "must_observe": [
                "contamination documented",
                "isolation pass"
              ],
              "must_not_observe": [
                "mock-only path"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Reset yields alerted:0",
      "verify": "induce; reset; sweep",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "gate-plan steps include reset",
      "verify": "jq structure",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "mode-specific oracles",
      "verify": "three-mode sequence",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "negative-control silence",
      "verify": "posts set equality",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "isolation vitest",
      "verify": "PLATFORM_IT=1 vitest",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
