# S31-OPS-01: Restore backup execution — plists, pgbackrest.conf, R2 token rotation, restic mirror, webhook **[OPERATOR_EXECUTED: yes — R2 credential rotation is irreversible/operator-only]**

> **Task ID:** S31-OPS-01
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** M · **Estimate:** 195 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog
> **OPERATOR_EXECUTED:** yes (R2 token rotation never agent-automated)
> **IRREVERSIBLE:** yes for credential rotation — old tokens must be revoked after cutover proof

**Capabilities:** CAP-BAK-01
**PRD refs:** UC-PLAT-06 · R19 · R24

## What this does

Restores the standing backup chain to a known-good operator state: LaunchAgent plists installed with real ProgramArguments (not `/usr/bin/true`), production `pgbackrest.conf` restored/validated, R2 credentials rotated by the operator, restic blob mirror runnable, and alert webhook configured end-to-end.

## Why

CAP-BAK-01 is a standing operational capability. Gate harnesses overwrote production `pgbackrest.conf` (R24), backup units may remain Disabled or stubbed, and stale R2 tokens leave WAL/base backups failing silently. Sprint 32 deletes Convex; after that the mini+R2 chain is the only copy of the data (R19).

## How to verify

- Operator checklist: R2 keys rotated; old keys revoked; `holo backup:status --json` shows recent successful WAL + base + mirror heartbeats.
- `holo backup:base --json` and `holo backup:mirror --json` exit 0 on the mini with production config paths.
- `launchctl print gui/$(id -u)/holocron-base-backup` (and wal/mirror/alert-sweep) shows non-stub ProgramArguments.
- Integration negative control: harness cannot write the production pgbackrest.conf path (paired with S31-OPS-03).

## Scope

Deploy plists, backup config, operator runbook for R2 rotation, webhook env, and proof commands. Does not implement fire-drill schedule install (S31-OPS-04) or alert-sweep fixture purge (S31-OPS-02).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-01 - Restore backup execution (operator R2 rotation)
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   195 minutes
TDD_MODE:   red_first
OPERATOR_EXECUTED: true
IRREVERSIBLE: true (R2 credential rotation + revoke)
CAPABILITIES: CAP-BAK-01
PRD_REFS:   UC-PLAT-06 · R19 · R24

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Standing WAL, base backup, restic mirror, and webhook-capable units run with valid R2 credentials on the mini.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER agent-automate R2 credential rotation or revoke — operator only.
- NEVER point restic/pgbackrest at a harness-only bucket as production without labeling it.
- NEVER leave ProgramArguments as /usr/bin/true or a no-op shell.
- NEVER commit live secrets; only secrets.example.yaml placeholders.
- NEVER run destructive backup commands against nonprod that rewrite production conf (R24) — use S31-OPS-03 isolation.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Operator completes R2 rotation checklist and backup:status shows fresh success — AC-1 (PRIMARY)
- [ ] base + wal + restic mirror plists install with real ProgramArguments — AC-2
- [ ] pgbackrest.conf stanza validates against production repo path — AC-3
- [ ] backup:mirror exits 0 and records heartbeat — AC-4
- [ ] ALERT_WEBHOOK_URL configured and backup:alert-sweep can POST (paired proof) — AC-5
- [ ] Agent-authored tests for plist ProgramArguments + conf validation pass without live rotate

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Operator R2 rotation + fresh backup success [PRIMARY] [OPERATOR]
  GIVEN: operator has Cloudflare/R2 console access and current mini secrets
  WHEN:  operator rotates access keys, updates secrets.yaml / conf, revokes old keys, runs backup:base
  THEN:  backup:status --json reports last base success newer than rotation time; old key fails auth

  TEST_TIER:             e2e
  VERIFICATION_SERVICE:  operator-mini+r2
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
  TEST_FUNCTION: operatorRotationChecklistDocumented (agent verifies checklist artifact; operator signs)

  SCENARIO:
    START_REF:        mini_backup_production
    NEGATIVE_CONTROL: would fail if old key still works | no heartbeat | stub backup
    EVIDENCE:         api_response
    CASES:
      - ACTION: operator rotates; runs holo backup:base --json; holo backup:status --json; probes old key
        MUST_OBSERVE:
          - backup:base exit 0
          - status.last_base_success_at after rotation timestamp
          - old access key authentication fails (AccessDenied or equivalent)
        MUST_NOT_OBSERVE:
          - ProgramArguments /usr/bin/true
          - success with expired credentials
          - agent committing raw secret values

AC-2: LaunchAgents carry real backup commands
  GIVEN: repo plists under services/platform/deploy/launchd/
  WHEN:  install script or documented cp + launchctl bootstrap runs
  THEN:  holocron-base-backup, holocron-wal-archive, holocron-restic-blob-mirror ProgramArguments invoke holo backup:* 

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
  TEST_FUNCTION: backupPlistsHaveRealProgramArguments

AC-3: pgbackrest.conf validates
  GIVEN: production conf path on mini (operator) or fixture conf in nonprod
  WHEN:  holo backup:provision --validate or pgbackrest check
  THEN:  exit 0; stanza name matches; repo path under expected R2 prefix

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
  TEST_FUNCTION: pgbackrestConfValidates

AC-4: restic mirror records heartbeat
  GIVEN: RESTIC_PASSWORD + R2 credentials loaded from secrets
  WHEN:  holo backup:mirror --json
  THEN:  exit 0; backup_heartbeat row for mirror job status=ok

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli+postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
  TEST_FUNCTION: resticMirrorRecordsHeartbeat

AC-5: Webhook env present on alert-sweep plist
  GIVEN: holocron-backup-alert-sweep.plist
  WHEN:  plist is rendered/installed
  THEN:  ALERT_WEBHOOK_URL key present and non-empty placeholder replaced on mini

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts
  TEST_FUNCTION: alertSweepPlistCarriesWebhook

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

mini_backup_production (seed_method: operator)
  - mini host with launchd
  - production secrets path
  - operator-held R2 admin capability for rotation

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/deploy/launchd/holocron-base-backup.plist (MODIFY)
- services/platform/deploy/launchd/holocron-wal-archive.plist (MODIFY)
- services/platform/deploy/launchd/holocron-restic-blob-mirror.plist (MODIFY)
- services/platform/deploy/launchd/holocron-backup-alert-sweep.plist (MODIFY)
- services/platform/deploy/launchd/README.md (MODIFY)
- services/platform/src/backup/** (MODIFY validation helpers only)
- services/platform/config/secrets.example.yaml (MODIFY placeholders only)
- .spec/prds/mk6-migration/runbooks/** (NEW/MODIFY operator R2 rotation checklist)
- services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts (NEW)

writeProhibited:
- Committing live R2 secrets
- Agent-performed key rotation API calls without operator
- Production heartbeat DELETE (S31-OPS-02)
- Fire-drill schedule install (S31-OPS-04)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/deploy/launchd/README.md — backup unit table
2. services/platform/src/backup/r2-provision.ts — scoped credentials
3. services/platform/src/cli/holo.ts — backup:* cases
4. .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md — related CAP-BAK-01
5. 08-technical-risks.md R19, R24

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Alert-sweep fixture purge / zero-row floor (S31-OPS-02)
- Harness isolation from production conf (S31-OPS-03)
- Monthly fire-drill schedule (S31-OPS-04)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-01",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mini_backup_production": {
      "description": "Mini host production backup chain for operator rotation",
      "seed_method": "operator",
      "records": [
        "launchd present",
        "secrets path present",
        "R2 admin for rotation"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Operator R2 rotation + fresh backup success",
      "verify": "OPERATOR: R2 keys rotated+revoked; holo backup:status --json shows fresh WAL+base+mirror success; PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts",
      "tier": "visible",
      "test_tier": "e2e",
      "verification_service": "operator-mini+r2",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "old key still works",
          "no heartbeat",
          "stub backup"
        ]
      },
      "evidence": {
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mini_backup_production",
          "action": {
            "actor": "operator",
            "steps": [
              "rotate R2 keys",
              "update secrets and conf",
              "revoke old keys",
              "run holo backup:base --json and backup:status --json"
            ]
          },
          "end_state": {
            "must_observe": [
              "backup:base exit 0",
              "status.last_base_success_at after rotation timestamp",
              "old access key authentication fails"
            ],
            "must_not_observe": [
              "ProgramArguments /usr/bin/true",
              "success with expired credentials",
              "raw secrets committed to git"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "LaunchAgents carry real backup commands",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "ProgramArguments /usr/bin/true",
          "missing plist"
        ]
      },
      "evidence": {
        "artifact_type": "file_artifact",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mini_backup_production",
          "action": {
            "actor": "cli_user",
            "steps": [
              "parse base/wal/mirror plists for ProgramArguments"
            ]
          },
          "end_state": {
            "must_observe": [
              "each plist invokes holo backup: verb",
              "3 of 3 plists non-stub"
            ],
            "must_not_observe": [
              "/usr/bin/true as sole program",
              "empty ProgramArguments"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "pgbackrest.conf validates",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mini_backup_production",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: pgbackrest.conf validates"
            ]
          },
          "end_state": {
            "must_observe": [
              "pgbackrest.conf validates"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "restic mirror records heartbeat",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mini_backup_production",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: restic mirror records heartbeat"
            ]
          },
          "end_state": {
            "must_observe": [
              "restic mirror records heartbeat"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Webhook env present on alert-sweep plist",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-ops-01-backup-restore.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "empty fixture",
          "mock-only harness",
          "hardcoded pass",
          "skip under PLATFORM_IT=1"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mini_backup_production",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-5",
              "Assert prose AC: Webhook env present on alert-sweep plist"
            ]
          },
          "end_state": {
            "must_observe": [
              "Webhook env present on alert-sweep plist"
            ],
            "must_not_observe": [
              "verify command skipped",
              "PRIMARY without real dependency"
            ]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead after operator signs the rotation checklist and agent tests pass.
