# REDHAT-FIX-S27-10 — [F-10] Install and verify the launchd alert-sweep schedule

## What this does

Close red-hat F-10 by installing the launchd alert-sweep schedule on the mini, verifying it is loaded, and ensuring ALERT_WEBHOOK_URL is available to the scheduled job.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-10).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule` → overall OK; loaded true
- `launchctl print gui/$(id -u)/holocron-backup-alert-sweep` → service found; not 'Could not find service'
- `plutil -p "$HOME/Library/LaunchAgents/holocron-backup-alert-sweep.plist" | grep ALERT_WEBHOOK_URL` → ALERT_WEBHOOK_URL key present with non-empty value
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check .` → exit 0

## Scope

Writes: services/platform/src/backup/alerting.ts, services/platform/src/cli/holo.ts, services/platform/deploy/launchd/holocron-backup-alert-sweep.plist, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json, .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md, services/platform/tests/integration/**/*alert*, .tmp/REDHAT-FIX-S27-10/**

Prohibited: app/**, secrets.yaml, node_modules/**, ~/Library/LaunchAgents/** (runtime install only — do not commit machine-local plists)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-10 — [F-10] Install and verify the launchd alert-sweep schedule
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P1
EFFORT:     M  (90 min)
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
holocron-backup-alert-sweep is loaded under gui/$UID with interval <=300s, ALERT_WEBHOOK_URL present in installed plist env, and gate evidence shows schedule installed — standing alerts without dashboard polling.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Gate step (or dedicated verification) runs bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule and expects overall OK / ok:true / loaded:true
- MUST Verify with launchctl print gui/$(id -u)/holocron-backup-alert-sweep that the job is loaded (state not not found)
- MUST Wire ALERT_WEBHOOK_URL into the installed plist EnvironmentVariables (from env or secrets at install time) so scheduled runs can POST alerts
- MUST Keep StartInterval <= 300 (ALERT_SWEEP_DEFAULT_INTERVAL_SECONDS) so cadence fits 15 min SLA
- MUST backup:status (or install output) must no longer report alert_schedule: not installed after success
- MUST plutil -lint passes on installed plist
- NEVER Commit live webhook secrets into the portable deploy/launchd template checked into git with real tokens
- NEVER Leave schedule uninstalled while claiming standing CAP-BAK-01 alerting
- NEVER Embed webhook URL in world-readable logs during install
- NEVER Use StartInterval > 300 that cannot meet 15 min SLA with one missed beat margin
- STRICTLY Proof uses real launchctl on macOS mini (not mocked)
- STRICTLY Installed plist path under ~/Library/LaunchAgents/holocron-backup-alert-sweep.plist

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

### AC-1 [PRIMARY] — AC-1 (flow_ref T-PLAT-024)
  GIVEN alert_webhook_configured + launchd_user_domain_available
  WHEN  holo backup:alert-sweep --install-schedule
  THEN  LaunchAgent installed and loaded
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: launchd-alert-sweep
  VERIFY: `bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule; launchctl print gui/$(id -u)/holocron-backup-alert-sweep | tee /tmp/s27-launchctl.txt; grep -E 'holocron-backup-alert-sweep|state =|path =' /tmp/s27-launchctl.txt; ! grep -qi 'Could not find service' /tmp/s27-launchctl.txt`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if install only writes template under deploy/launchd without bootstrap; launchctl print shows not installed / Could not find service; static mock returns bootstrapped:true without calling launchctl; gate never runs --install-schedule (alert_schedule: not installed)
  START_REF: launchd_user_domain_available
  MUST_OBSERVE: install overall: OK or ok:true; loaded: true or bootstrapped: true; launchctl print includes label holocron-backup-alert-sweep; plist path contains LaunchAgents/holocron-backup-alert-sweep.plist; interval <= 300
  MUST_NOT_OBSERVE: alert_schedule: not installed; Could not find service; bootstrapped: false with overall OK claimed; StartInterval greater than 300
  EVIDENCE: launchctl_print_and_install_stdout (required_capture=True)

### AC-2 — AC-2 (flow_ref CAP-BAK-01)
  GIVEN successful install with ALERT_WEBHOOK_URL set
  WHEN  plutil / PlistBuddy / grep installed plist
  THEN  webhook env wired for standing daemon
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: launchd-alert-sweep
  VERIFY: `plutil -lint ~/Library/LaunchAgents/holocron-backup-alert-sweep.plist; plutil -p ~/Library/LaunchAgents/holocron-backup-alert-sweep.plist | tee /tmp/s27-plist.txt; grep -q ALERT_WEBHOOK_URL /tmp/s27-plist.txt; grep -q backup:alert-sweep /tmp/s27-plist.txt`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if installed plist omits ALERT_WEBHOOK_URL so scheduled runs cannot resolve webhook; only DATABASE_URL wired and webhook relies on interactive shell; portable template has real secret committed to git; stub install skips EnvironmentVariables dict
  START_REF: alert_webhook_configured
  MUST_OBSERVE: EnvironmentVariables.ALERT_WEBHOOK_URL length >= 8; EnvironmentVariables.DATABASE_URL present; ProgramArguments include backup:alert-sweep and --json; plutil -lint OK
  MUST_NOT_OBSERVE: ALERT_WEBHOOK_URL missing from installed plist; ALERT_WEBHOOK_URL empty string; ProgramArguments missing alert-sweep
  EVIDENCE: plist_dump (required_capture=True)

### AC-3 — AC-3 (flow_ref T-PLAT-024)
  GIVEN gate-plan.json / SPRINT human deliverable
  WHEN  add/adjust gate step for install+verify
  THEN  gate enforces standing schedule
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: human-testing-gate
  VERIFY: `rg -n 'install-schedule|holocron-backup-alert-sweep' .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if gate still never installs schedule; step1 continues to log alert_schedule: not installed as acceptable; static gate-results pass without launchctl proof; mock launchctl print success in shell without real service
  START_REF: launchd_user_domain_available
  MUST_OBSERVE: gate-plan contains install-schedule; gate-plan or assertion references holocron-backup-alert-sweep or launchctl print; post-step launchctl shows loaded job
  MUST_NOT_OBSERVE: gate-plan without any install-schedule step; alert_schedule: not installed in successful gate evidence as final state
  EVIDENCE: gate_plan_json (required_capture=True)

### AC-4 — AC-4 (flow_ref CAP-BAK-01)
  GIVEN unset ALERT_WEBHOOK_URL and empty secrets value
  WHEN  run --install-schedule
  THEN  fail closed or explicit warning that standing alert cannot deliver
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: holo-CLI
  VERIFY: `env -u ALERT_WEBHOOK_URL bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule --json; assert ok=false OR messages mention ALERT_WEBHOOK_URL required`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if install reports overall OK with mute daemon and no webhook wiring; silent success when ALERT_WEBHOOK_URL absent; stub always ok true; static mock install
  START_REF: launchd_user_domain_available
  MUST_OBSERVE: ok=false OR exit 1 OR explicit ALERT_WEBHOOK_URL required/missing message
  MUST_NOT_OBSERVE: overall: OK with no webhook configured; silent mute install claimed production-ready
  EVIDENCE: stdout (required_capture=True)

### AC-5 — AC-5
  GIVEN implementation complete
  WHEN  pnpm tsgo --noEmit; pnpm biome check .
  THEN  exit 0
  TEST_TIER: unit · TDD_STATE: red
  VERIFICATION_SERVICE: tooling
  VERIFY: `pnpm tsgo --noEmit; pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if type errors in alerting.ts; biome errors in write_allowed paths
  START_REF: launchd_user_domain_available
  MUST_OBSERVE: tsgo exit 0; biome exit 0
  MUST_NOT_OBSERVE: error TS; biome Found errors
  EVIDENCE: stdout (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | install-schedule loads holocron-backup-alert-sweep via launchctl | AC-1 | `bun ... backup:alert-sweep --install-schedule; launchctl print gui/$(id -u)/holocron-backup-alert-sweep` |
| TC-2 | installed plist wires ALERT_WEBHOOK_URL env | AC-2 | `plutil -p ~/Library/LaunchAgents/holocron-backup-alert-sweep.plist | grep ALERT_WEBHOOK_URL` |
| TC-3 | gate-plan enforces install+verify step | AC-3 | `rg install-schedule gate-plan.json` |
| TC-4 | missing webhook fails closed or marks non-ready | AC-4 | `env -u ALERT_WEBHOOK_URL install-schedule` |
| TC-5 | typecheck and lint | AC-5 | `pnpm tsgo --noEmit; pnpm biome check .` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/alerting.ts
- services/platform/src/cli/holo.ts
- services/platform/deploy/launchd/holocron-backup-alert-sweep.plist
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/gate-plan.json
- .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/SPRINT.md
- services/platform/tests/integration/**/*alert*
- .tmp/REDHAT-FIX-S27-10/**
writeProhibited:
- app/**
- secrets.yaml
- node_modules/**
- ~/Library/LaunchAgents/** (runtime install only — do not commit machine-local plists)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:95-99 — F-10 HIGH launchd alert-sweep not installed
2. services/platform/src/backup/alerting.ts:595-828 — renderAlertSweepPlist + installAlertSweepLaunchd (missing ALERT_WEBHOOK_URL in env today)
3. services/platform/deploy/launchd/holocron-backup-alert-sweep.plist:1-48 — portable template placeholders; no ALERT_WEBHOOK_URL key
4. services/platform/src/cli/holo.ts:2206-2260 — backup:alert-sweep --install-schedule dispatch
5. .spec/prds/mk6-migration/tasks/sprint-27-standing-off-mini-backup-pipeline-and-alerting/D04-05-backup-failure-overdue-alerting-no-dashboard-polling.md:59-73 — MUST run scheduled launchd alert sweep

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: SPRINT.md, red-hat-sprint27-20260728T054039Z.md
Interaction notes:
- Can run parallel with many REDHAT fixes; depends on alerting module existing (D04-05)
- Portable template may use @ALERT_WEBHOOK_URL@ placeholder; installed absolute plist must expand real value from env/secrets at install time
- Do not commit expanded secrets into git-tracked deploy/launchd template
Pattern: installAlertSweepLaunchd renders absolute plist + launchctl bootstrap gui/$UID; wire ALERT_WEBHOOK_URL like DATABASE_URL into EnvironmentVariables at install time
Pattern source: alerting.ts installAlertSweepLaunchd + D04-05 MUST scheduled sweep
Anti-pattern: Template exists but never bootstrapped; standing daemon mute without ALERT_WEBHOOK_URL; gate evidence alert_schedule: not installed

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- install-schedule: `bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule` → overall OK; loaded true
- launchctl-print: `launchctl print gui/$(id -u)/holocron-backup-alert-sweep` → service found; not 'Could not find service'
- plist-webhook-env: `plutil -p "$HOME/Library/LaunchAgents/holocron-backup-alert-sweep.plist" | grep ALERT_WEBHOOK_URL` → ALERT_WEBHOOK_URL key present with non-empty value
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check .` → exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: devops-engineer
- Reviewer: code-reviewer
- Rationale: installAlertSweepLaunchd and holocron-backup-alert-sweep.plist are platform launchd infrastructure; gate must install and prove the standing alert daemon so the 15-minute SLA is bounded without a human running alert-sweep.
- Proposed by: devops-engineer

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['launchd-alert-sweep-installed', 'standing-alert-daemon', 'plist-alert-webhook-env-wired']
- consumes: ['backup-alerting', 'ALERT_WEBHOOK_URL', 'DATABASE_URL']
- boundary_contracts: [{'name': 'launchd-alert-schedule-bound', 'rule': 'gui/$(id -u)/holocron-backup-alert-sweep MUST be loaded after holo backup:alert-sweep --install-schedule. StartInterval <= 300s. Installed LaunchAgents plist EnvironmentVariables MUST include ALERT_WEBHOOK_URL resolved at install time from env/secrets (standing daemon cannot rely on interactive shell env alone). Portable template may keep placeholders; installed absolute plist must be operator-runnable.', 'sides': ['launchd', 'alert-sweep', 'webhook', 'operator-CLI']}]

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- brain/docs/REACT-RULES.md is N/A — use services/platform conventions
- RULES.md
- launchd plist patterns from services/platform/src/backup/wal-archive.ts install helpers

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: ['D04-05']
- blocks: []

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Source finding: red-hat-sprint27-20260728T054039Z.md (REDHAT-FIX-S27-10)
- CAP-BAK-01 remediation — gate honesty + production-truth.

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-10",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "alert_webhook_configured": {
      "description": "ALERT_WEBHOOK_URL set in process env or secrets.yaml to a real reachable HTTPS (or loopback RED) endpoint",
      "seed_method": "public_api",
      "records": [
        "ALERT_WEBHOOK_URL non-empty",
        "DATABASE_URL points at holocron Postgres"
      ]
    },
    "launchd_user_domain_available": {
      "description": "macOS user launchd domain gui/$(id -u) available for bootstrap",
      "seed_method": "entrypoint",
      "seed_entrypoint": "launchctl print gui/$(id -u)",
      "records": [
        "launchctl print succeeds",
        "LaunchAgents directory writable"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN webhook+launchd available WHEN backup:alert-sweep --install-schedule runs THEN launchctl print gui/$UID/holocron-backup-alert-sweep shows loaded job",
      "verify": "bun services/platform/src/cli/holo.ts backup:alert-sweep --install-schedule; launchctl print gui/$(id -u)/holocron-backup-alert-sweep",
      "primary": true,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "launchd-alert-sweep",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "schedule not bootstrapped",
            "alert_schedule: not installed remains",
            "static mock loaded without launchctl",
            "template-only write without LaunchAgents install"
          ]
        },
        "evidence": {
          "artifact_type": "launchctl_print_and_install_stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "launchd_user_domain_available",
            "action": {
              "actor": "operator",
              "steps": [
                "install-schedule",
                "launchctl print"
              ]
            },
            "end_state": {
              "must_observe": [
                "holocron-backup-alert-sweep loaded",
                "interval <= 300"
              ],
              "must_not_observe": [
                "Could not find service",
                "alert_schedule: not installed"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "Installed plist EnvironmentVariables includes non-empty ALERT_WEBHOOK_URL",
      "verify": "plutil -p installed plist | grep ALERT_WEBHOOK_URL",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "launchd-alert-sweep",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": [
            "installed plist omits ALERT_WEBHOOK_URL so scheduled runs cannot resolve webhook",
            "only DATABASE_URL wired and webhook relies on interactive shell",
            "portable template has real secret committed to git",
            "stub install skips EnvironmentVariables dict"
          ]
        },
        "evidence": {
          "artifact_type": "plist_dump",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "alert_webhook_configured",
            "action": {
              "actor": "operator",
              "steps": [
                "install schedule with ALERT_WEBHOOK_URL set",
                "plutil -p installed plist",
                "assert ALERT_WEBHOOK_URL key present with non-empty value"
              ]
            },
            "end_state": {
              "must_observe": [
                "EnvironmentVariables.ALERT_WEBHOOK_URL length >= 8",
                "EnvironmentVariables.DATABASE_URL present",
                "ProgramArguments include backup:alert-sweep and --json",
                "plutil -lint OK"
              ],
              "must_not_observe": [
                "ALERT_WEBHOOK_URL missing from installed plist",
                "ALERT_WEBHOOK_URL empty string",
                "ProgramArguments missing alert-sweep"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "gate-plan includes install-schedule + launchctl verify",
      "verify": "rg install-schedule gate-plan.json",
      "primary": false,
      "flow_ref": "T-PLAT-024",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "human-testing-gate",
        "flow_ref": "T-PLAT-024",
        "negative_control": {
          "would_fail_if": [
            "gate still never installs schedule",
            "step1 continues to log alert_schedule: not installed as acceptable",
            "static gate-results pass without launchctl proof",
            "mock launchctl print success in shell without real service"
          ]
        },
        "evidence": {
          "artifact_type": "gate_plan_json",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "launchd_user_domain_available",
            "action": {
              "actor": "implementer",
              "steps": [
                "add gate step for --install-schedule + launchctl print",
                "run that step on mini",
                "capture evidence"
              ]
            },
            "end_state": {
              "must_observe": [
                "gate-plan contains install-schedule",
                "gate-plan or assertion references holocron-backup-alert-sweep or launchctl print",
                "post-step launchctl shows loaded job"
              ],
              "must_not_observe": [
                "gate-plan without any install-schedule step",
                "alert_schedule: not installed in successful gate evidence as final state"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "Missing ALERT_WEBHOOK_URL fails closed or non-ready",
      "verify": "env -u ALERT_WEBHOOK_URL install-schedule",
      "primary": false,
      "flow_ref": "CAP-BAK-01",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-CLI",
        "flow_ref": "CAP-BAK-01",
        "negative_control": {
          "would_fail_if": [
            "install reports overall OK with mute daemon and no webhook wiring",
            "silent success when ALERT_WEBHOOK_URL absent",
            "stub always ok true",
            "static mock install"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "launchd_user_domain_available",
            "action": {
              "actor": "operator",
              "steps": [
                "unset ALERT_WEBHOOK_URL",
                "run install-schedule --json",
                "observe fail-closed or explicit non-ready signal"
              ]
            },
            "end_state": {
              "must_observe": [
                "ok=false OR exit 1 OR explicit ALERT_WEBHOOK_URL required/missing message"
              ],
              "must_not_observe": [
                "overall: OK with no webhook configured",
                "silent mute install claimed production-ready"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "tsgo + biome clean",
      "verify": "pnpm tsgo --noEmit; pnpm biome check .",
      "primary": false,
      "scenario": {
        "tier": "visible",
        "test_tier": "unit",
        "verification_service": "tooling",
        "negative_control": {
          "would_fail_if": [
            "type errors in alerting.ts",
            "biome errors in write_allowed paths"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "launchd_user_domain_available",
            "action": {
              "actor": "implementer",
              "steps": [
                "pnpm tsgo --noEmit",
                "pnpm biome check ."
              ]
            },
            "end_state": {
              "must_observe": [
                "tsgo exit 0",
                "biome exit 0"
              ],
              "must_not_observe": [
                "error TS",
                "biome Found errors"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "launchctl load proof",
      "verify": "install-schedule + launchctl print",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "plist webhook env",
      "verify": "plutil -p plist",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "gate enforces install",
      "verify": "gate-plan rg",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "fail closed without webhook",
      "verify": "unset webhook install",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "tooling clean",
      "verify": "pnpm tsgo --noEmit; pnpm biome check .",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
