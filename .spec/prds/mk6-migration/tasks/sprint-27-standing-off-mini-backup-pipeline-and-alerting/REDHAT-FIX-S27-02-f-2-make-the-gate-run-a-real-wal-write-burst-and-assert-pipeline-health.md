# REDHAT-FIX-S27-02 — [F-2] Make the gate run a real WAL write burst and assert pipeline health

## What this does

Close red-hat F-2 (and aligned GP-1/GP-2) by making the Human Testing Gate step 1 actually run a live WAL write burst and assert pipeline health unfakeably.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-02).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bun services/platform/src/cli/holo.ts backup:wal --json` → exit 0; status success; continuityOk true; r2 after > before; writeBurstRows >= 1
- `jq -e '.steps[] | select(.n==1) | .literal_cmd | test("backup:wal")' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → true
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0

## Scope

Writes: .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, services/platform/src/backup/wal-archive.ts, services/platform/src/cli/holo.ts, services/platform/tests/integration/**/*wal*, .tmp/REDHAT-FIX-S27-02/**

Prohibited: app/**, services/platform/src/db/migrations/**, node_modules/**, secrets.yaml

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-02 — [F-2] Make the gate run a real WAL write burst and assert pipeline health
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
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
gate-plan step 1 runs backup:wal --json, proves R2 WAL growth + continuity.ok + fresh success heartbeat, and fails if the pipeline reports FAILED/OVERDUE.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Rewrite gate-plan.json step 1 literal_cmd to run bun services/platform/src/cli/holo.ts backup:wal --json (real write burst + archive)
- MUST Assert JSON/text fields: status success (or ok:true), continuityOk true / continuity ok, r2WalObjectCountAfter > r2WalObjectCountBefore (or r2_wal_objects growth), writeBurstRows >= 1, heartbeat status success with last_success_at age < 60s
- MUST Negate FAILED|OVERDUE in pipeline health output (post-wal backup:status optional secondary assert with overall: OK)
- MUST Remove reliance on bare grep failed=0 that matches pg_stat_archiver (F-3 adjacency — do not use that token as pass condition)
- MUST Step must fail (exit non-zero or assertion fail) if overall pipeline is FAILED
- MUST pnpm tsgo --noEmit and pnpm biome check . clean if production code touched
- NEVER Leave step 1 as backup:status-only read while text claims write burst
- NEVER Pass step 1 when overall: FAILED appears in command output
- NEVER Use OR-alternation oracle where any single weak token (archive_mode always alone) passes without R2 growth + continuity
- NEVER Mock R2 listing or skip writeBurstRows
- STRICTLY literal_cmd action matches step text
- STRICTLY must_observe concrete r2 count growth and continuity.ok true

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: AC-1
- [ ] AC-2: AC-2
- [ ] AC-3: AC-3
- [ ] AC-4: AC-4
- [ ] AC-5: AC-5
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — AC-1 (flow_ref CAP-BAK-01)
  GIVEN postgres_archive_ready + r2_wal_repo_reachable
  WHEN  execute backup:wal --json as gate step 1 literal_cmd
  THEN  real WAL cycle success with R2 growth and continuity
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: backup-wal-gate
  VERIFY: `bun services/platform/src/cli/holo.ts backup:wal --json | tee /tmp/s27-wal.json; jq -e '.status=="success" and .continuityOk==true and .r2WalObjectCountAfter > .r2WalObjectCountBefore and .writeBurstRows >= 1 and .heartbeat.status=="success"' /tmp/s27-wal.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if literal_cmd is only backup:status (read-only) while claiming write burst; oracle greps failed=0 from pg_stat_archiver and ignores pipeline overall:FAILED; static mock returns success without R2 object growth; stub writeBurstRows=0 with no Postgres writes; heartbeat not updated but step still passes
  START_REF: postgres_archive_ready
  MUST_OBSERVE: status: success (or JSON status=="success"); continuityOk: true; r2WalObjectCountAfter > r2WalObjectCountBefore; writeBurstRows >= 1; heartbeat.status: success; command exit 0
  MUST_NOT_OBSERVE: status: failed; continuityOk: false; r2WalObjectCountAfter <= r2WalObjectCountBefore; writeBurstRows: 0; overall: FAILED; OVERDUE on wal_archive after successful job
  EVIDENCE: wal_job_json_and_gate_log (required_capture=True)

### AC-2 — AC-2 (flow_ref T-PLAT-021)
  GIVEN gate-plan.json in sprint folder
  WHEN  edit and validate step 1
  THEN  action-oracle alignment; conjunctive health asserts
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: human-testing-gate
  VERIFY: `jq -r '.steps[] | select(.n==1) | .literal_cmd' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json | grep -q 'backup:wal'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if literal_cmd still backup:status only; expect_log_regex is OR of archive_mode|archive-push|r2 without requiring success+continuity; step can pass with overall:FAILED in log; static gate-results theatre without re-running wal
  START_REF: postgres_archive_ready
  MUST_OBSERVE: literal_cmd contains backup:wal; assertion requires success and continuity and r2 growth (all present in cmd or multi-check); assertion or cmd negates FAILED|OVERDUE
  MUST_NOT_OBSERVE: literal_cmd is only backup:status; sole oracle token failed=0; OR-alternation pass on archive_mode alone
  EVIDENCE: gate_plan_json (required_capture=True)

### AC-3 — AC-3 (flow_ref CAP-BAK-01)
  GIVEN post successful backup:wal
  WHEN  bun services/platform/src/cli/holo.ts backup:status
  THEN  wal_archive OK / fresh success
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: holo-CLI
  VERIFY: `bun services/platform/src/cli/holo.ts backup:wal --json && bun services/platform/src/cli/holo.ts backup:status 2>&1 | tee /tmp/s27-status.txt; grep -E 'wal_archive:.*OK|wal_archive:.*status=success' /tmp/s27-status.txt; ! grep -E 'wal_archive:.*FAILED|wal_archive:.*OVERDUE' /tmp/s27-status.txt`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if status still shows wal_archive FAILED after successful wal job; step ignores FAILED lines; reads stale cache instead of backup_heartbeat; stub/static healthy status without DB query
  START_REF: r2_wal_repo_reachable
  MUST_OBSERVE: wal_archive line with status=success or flag OK; last_success_at present and recent
  MUST_NOT_OBSERVE: wal_archive: ... FAILED; wal_archive: ... OVERDUE; wal_archive missing entirely after successful job
  EVIDENCE: stdout (required_capture=True)

### AC-4 — AC-4 (flow_ref T-PLAT-024)
  GIVEN induced wal failure or broken archive path
  WHEN  run the new step 1 literal_cmd + assertion
  THEN  step fails closed
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: human-testing-gate
  VERIFY: `with broken archive or after force-fail, run the step 1 command pipeline; expect non-zero`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if step still exits 0 while status=failed or overall:FAILED; oracle matches unrelated failed=0 archiver counter; static mock always exit 0; || true swallows failure without later hard assert
  START_REF: postgres_archive_ready
  MUST_OBSERVE: step assertion fails or exit code != 0; status failed or continuityOk false visible in log
  MUST_NOT_OBSERVE: step result pass while status=failed; greenwash via failed=0 archiver token
  EVIDENCE: gate_step_log (required_capture=True)

### AC-5 — AC-5
  GIVEN edits complete
  WHEN  validate JSON + tooling
  THEN  valid plan; tooling clean
  TEST_TIER: unit · TDD_STATE: red
  VERIFICATION_SERVICE: tooling
  VERIFY: `python3 -m json.tool .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json > /dev/null; pnpm tsgo --noEmit; pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if invalid JSON in gate-plan.json; type errors in any touched TS
  START_REF: postgres_archive_ready
  MUST_OBSERVE: json.tool exit 0; tsgo exit 0; biome exit 0
  MUST_NOT_OBSERVE: JSONDecodeError; error TS
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | backup:wal --json proves write burst, R2 growth, continuity, success heartbeat | AC-1 | `bun services/platform/src/cli/holo.ts backup:wal --json with jq asserts` |
| TC-2 | gate-plan step 1 literal_cmd is backup:wal with conjunctive health oracle | AC-2 | `jq step1 literal_cmd contains backup:wal; no status-only theatre` |
| TC-3 | post-wal backup:status shows wal_archive OK not FAILED/OVERDUE | AC-3 | `backup:wal then backup:status` |
| TC-4 | step 1 fails closed on unhealthy pipeline | AC-4 | `force fail then step1 non-zero` |
| TC-5 | gate-plan valid JSON; tsgo+biome clean | AC-5 | `python3 -m json.tool gate-plan.json; pnpm tsgo --noEmit; pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- services/platform/src/backup/wal-archive.ts
- services/platform/src/cli/holo.ts
- services/platform/tests/integration/**/*wal*
- .tmp/REDHAT-FIX-S27-02/**
writeProhibited:
- app/**
- services/platform/src/db/migrations/**
- node_modules/**
- secrets.yaml

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:36-40 — F-2 CRITICAL step1 text vs backup:status mismatch
2. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json:10-20 — current step 1 literal_cmd and weak OR oracle
3. services/platform/src/backup/wal-archive.ts:420-545 — runWalArchiveJob write burst, R2 counts, continuity, heartbeat
4. services/platform/src/cli/holo.ts:1893-1966 — backup:wal --json output shape
5. .spec/prds/mk6-migration/11-e2e-testing-criteria.md:1-80 — T-PLAT-021/023 continuous WAL under write load

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, red-hat-sprint27-20260728T054039Z.md
Interaction notes:
- F-3 (failed=0 archiver token) is adjacent — remove that token from step 1 as part of this fix even if S27-03 owns broader oracle cleanup
- Blocks stronger gate work that assumes step 1 is a real health seed (S27-03 oracle token)
Pattern: Gate step executes the same CLI as operators (backup:wal --json) and asserts production result fields conjunctively
Pattern source: runWalArchiveJob JSON surface + red-hat F-2 fix
Anti-pattern: Read-only backup:status + OR-regex greps that pass while overall:FAILED

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- wal-write-burst: `bun services/platform/src/cli/holo.ts backup:wal --json` → exit 0; status success; continuityOk true; r2 after > before; writeBurstRows >= 1
- gate-plan-step1: `jq -e '.steps[] | select(.n==1) | .literal_cmd | test("backup:wal")' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json` → true
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: devops-engineer
- Reviewer: code-reviewer
- Rationale: Gate step 1 text claims live Postgres write burst + continuous WAL→R2 but literal_cmd is read-only backup:status; devops owns backup:wal (runWalArchiveJob write burst) and gate-plan.json oracle strength for CAP-BAK-01.
- Proposed by: devops-engineer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['gate-step1-real-wal-write-burst', 'pipeline-health-oracle', 'r2-wal-growth-assert']
- consumes: ['pgbackrest-r2-repo', 'wal-archive-job', 'backup:wal-cli']
- boundary_contracts: [{'name': 'gate-step1-action-oracle-alignment', 'rule': "gate-plan.json step 1 text 'live Postgres write burst' MUST execute holo backup:wal --json (runWalArchiveJob → write burst + archive-push + R2 confirm + heartbeat), NOT backup:status alone. Oracle MUST assert status success, continuity.ok, r2_wal_objects growth, fresh heartbeat, and MUST negate overall FAILED|OVERDUE. MUST NOT pass on Postgres pg_stat_archiver failed=0 while pipeline overall:FAILED.", 'sides': ['human-testing-gate', 'backup:wal', 'R2', 'backup_heartbeat']}]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- brain/docs/REACT-RULES.md is N/A — use services/platform conventions
- RULES.md

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-03', 'D04-02']
- blocks: ['REDHAT-FIX-S27-03']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-02)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_archive_ready": {
      "description": "Local Postgres with archive_mode=always and pgbackrest archive-push configured to R2",
      "seed_method": "entrypoint",
      "seed_entrypoint": "bun services/platform/src/cli/holo.ts backup:status",
      "records": [
        "archive_mode always",
        "archive_command includes pgbackrest archive-push",
        "R2 credentials present in secrets/env"
      ]
    },
    "r2_wal_repo_reachable": {
      "description": "Encrypted R2 WAL repo from D04-02 reachable for object count before/after",
      "seed_method": "public_api",
      "records": [
        "r2 list succeeds",
        "object count numeric before job"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN archive-ready Postgres WHEN backup:wal --json runs THEN status=success, continuityOk=true, r2 growth, writeBurstRows>=1, heartbeat success",
      "verify": "bun services/platform/src/cli/holo.ts backup:wal --json + jq asserts",
      "primary": true,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "backup-wal-gate",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": [
            "read-only backup:status used as write burst",
            "failed=0 archiver token games pass",
            "static mock success without R2 growth",
            "stub writeBurstRows=0"
          ]
        },
        "evidence": {
          "artifact_type": "wal_job_json_and_gate_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_archive_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "run backup:wal --json",
                "assert fields"
              ]
            },
            "end_state": {
              "must_observe": [
                "status==\"success\"",
                "continuityOk==true",
                "r2WalObjectCountAfter > r2WalObjectCountBefore",
                "writeBurstRows >= 1"
              ],
              "must_not_observe": [
                "overall: FAILED",
                "continuityOk==false",
                "r2 no growth"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "gate-plan step 1 literal_cmd runs backup:wal with conjunctive oracle",
      "verify": "jq gate-plan step1",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "human-testing-gate",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "literal_cmd still backup:status only",
            "expect_log_regex is OR of archive_mode|archive-push|r2 without requiring success+continuity",
            "step can pass with overall:FAILED in log",
            "static gate-results theatre without re-running wal"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan_json",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_archive_ready",
            "action": {
              "actor": "implementer",
              "steps": [
                "update gate-plan.json step 1 literal_cmd and assertion",
                "verify literal_cmd contains backup:wal",
                "verify assertion fails on FAILED/OVERDUE"
              ]
            },
            "end_state": {
              "must_observe": [
                "literal_cmd contains backup:wal",
                "assertion requires success and continuity and r2 growth (all present in cmd or multi-check)",
                "assertion or cmd negates FAILED|OVERDUE"
              ],
              "must_not_observe": [
                "literal_cmd is only backup:status",
                "sole oracle token failed=0",
                "OR-alternation pass on archive_mode alone"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "post-wal status shows wal_archive OK not FAILED/OVERDUE",
      "verify": "backup:status after wal",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-CLI",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": [
            "status still shows wal_archive FAILED after successful wal job",
            "step ignores FAILED lines",
            "reads stale cache instead of backup_heartbeat",
            "stub/static healthy status without DB query"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "r2_wal_repo_reachable",
            "action": {
              "actor": "operator",
              "steps": [
                "run backup:wal --json success",
                "run backup:status",
                "assert wal_archive not FAILED/OVERDUE"
              ]
            },
            "end_state": {
              "must_observe": [
                "wal_archive line with status=success or flag OK",
                "last_success_at present and recent"
              ],
              "must_not_observe": [
                "wal_archive: ... FAILED",
                "wal_archive: ... OVERDUE",
                "wal_archive missing entirely after successful job"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "step 1 fails closed when pipeline unhealthy",
      "verify": "force fail; step non-zero",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "human-testing-gate",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "step still exits 0 while status=failed or overall:FAILED",
            "oracle matches unrelated failed=0 archiver counter",
            "static mock always exit 0",
            "|| true swallows failure without later hard assert"
          ]
        },
        "evidence": {
          "artifact_type": "gate_step_log",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_archive_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "break archive path or force wal failure",
                "run step 1 cmd+assert",
                "confirm non-pass"
              ]
            },
            "end_state": {
              "must_observe": [
                "step assertion fails or exit code != 0",
                "status failed or continuityOk false visible in log"
              ],
              "must_not_observe": [
                "step result pass while status=failed",
                "greenwash via failed=0 archiver token"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "valid JSON + tooling clean",
      "verify": "json.tool; pnpm tsgo --noEmit; pnpm biome check .",
      "primary": false,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "tooling",
        "negative_control": {
          "would_fail_if": [
            "invalid JSON in gate-plan.json",
            "type errors in any touched TS"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_archive_ready",
            "action": {
              "actor": "implementer",
              "steps": [
                "json.tool gate-plan.json",
                "pnpm tsgo --noEmit",
                "pnpm biome check ."
              ]
            },
            "end_state": {
              "must_observe": [
                "json.tool exit 0",
                "tsgo exit 0",
                "biome exit 0"
              ],
              "must_not_observe": [
                "JSONDecodeError",
                "error TS"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Real WAL write burst health",
      "verify": "backup:wal --json asserts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "gate-plan step1 action match",
      "verify": "jq literal_cmd backup:wal",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "status freshness after wal",
      "verify": "backup:status",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "fail-closed oracle",
      "verify": "unhealthy pipeline step fails",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "json + lint + typecheck",
      "verify": "json.tool; tsgo; biome",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
