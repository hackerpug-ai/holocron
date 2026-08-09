# S31-OPS-04: Install the fire-drill schedule; fix the isolation proof that rejects the real mini

> **Task ID:** S31-OPS-04
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** OPS · **Priority:** P0 · **Effort:** S · **Estimate:** 60 min
> **PROPOSED-BY:** `devops-engineer`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-BAK-01
**PRD refs:** UC-PLAT-06 · fire-drill-monthly runbook · R19

## What this does

Installs the monthly fire-drill LaunchAgent from `holocron-fire-drill-monthly.plist`, ensures the mission template `fire-drill-monthly@1.0.0` is registered, and fixes isolation proofs that incorrectly reject a legitimate mini restore host while still refusing live mini PGDATA/blob mounts as scratch targets.

## Why

CAP-BAK-01 requires a scheduled real restore drill. The runbook and plist exist, but the schedule may be uninstalled and isolation checks can false-negative the real mini as an illegal host when the operator correctly uses empty `.tmp` scratch dirs on that machine.

## How to verify

- `launchctl print gui/$(id -u)/holocron-fire-drill-monthly` shows the unit loaded (or documented bootout/bootstrap sequence succeeds).
- `holo restore:fire-drill --scratch .tmp/fire-drill/… --blob-dir .tmp/fire-drill/blobs --json` refuses when scratch equals live PGDATA and accepts empty distinct dirs on the mini.
- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts` exits 0.

## Scope

Fire-drill plist install, isolation guard accuracy, template registration proof. Not full monthly restore success against R2 (depends on S31-OPS-01 credentials).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-OPS-04 - Fire-drill schedule + isolation proof fix
================================================================================

TASK_TYPE:  OPS
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     S
AGENT:      implementer=devops-engineer | reviewer=devops-engineer
PROPOSED-BY: devops-engineer
ESTIMATE:   60 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-BAK-01
PRD_REFS:   UC-PLAT-06 · runbooks/fire-drill-monthly.md

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Monthly fire-drill unit is installable and isolation refuses live PGDATA without rejecting the mini host itself.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER allow --scratch or --blob-dir to resolve to live mini PGDATA / HOLO_BLOB_ROOT.
- NEVER require a second physical machine when empty scratch dirs on the mini are used.
- NEVER no-op the scheduled job with /usr/bin/true.
- NEVER delete the fire-drill-monthly mission template.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Plist installs and ProgramArguments invoke holo mission run fire-drill-monthly or restore:fire-drill — AC-1 (PRIMARY)
- [ ] Live PGDATA scratch is refused with the canonical message — AC-2
- [ ] Empty .tmp scratch on mini hostname is accepted by the guard (unit test of path logic) — AC-3
- [ ] mission template fire-drill-monthly 1.0.0 present — AC-4

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Fire-drill LaunchAgent installs with real command [PRIMARY]
  GIVEN: services/platform/deploy/launchd/holocron-fire-drill-monthly.plist
  WHEN:  install per runbook (cp + bootstrap)
  THEN:  unit print shows ProgramArguments containing holo and fire-drill

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts
  TEST_FUNCTION: fireDrillPlistRealProgramArguments

  SCENARIO:
    START_REF:        repo_fire_drill_artifacts
    NEGATIVE_CONTROL: would fail if /usr/bin/true | missing plist | empty args
    EVIDENCE:         file_artifact
    CASES:
      - ACTION: parse plist ProgramArguments
        MUST_OBSERVE: holo present · fire-drill or fire-drill-monthly present · Disabled key documented
        MUST_NOT_OBSERVE: sole program /usr/bin/true

AC-2: Live PGDATA scratch refused
  GIVEN: --scratch set to a FORBIDDEN_PGDATA path
  WHEN:  holo restore:fire-drill …
  THEN:  exit != 0; message contains 'refusing fire-drill into live mini PGDATA'

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts
  TEST_FUNCTION: livePgdataScratchRefused

AC-3: Mini host with empty .tmp scratch is not false-rejected
  GIVEN: hostname is the mini; scratch is empty dir under .tmp/fire-drill-monthly/
  WHEN:  isolation guard evaluates paths (unit/integration without full R2 restore if creds absent)
  THEN:  path guard returns allowed; failure if any must not be "rejects the real mini" host check

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  typescript+filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts
  TEST_FUNCTION: miniHostEmptyTmpScratchAllowed

AC-4: fire-drill-monthly template registered
  GIVEN: nonprod DB
  WHEN:  holo mission template ensure/list for fire-drill-monthly
  THEN:  template_key=fire-drill-monthly version=1.0.0 present

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres+cli
  TEST_FILE:     services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts
  TEST_FUNCTION: fireDrillTemplatePresent

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

repo_fire_drill_artifacts — plist + template JSON in repo
empty_tmp_scratch — .tmp/fire-drill-monthly/scratch-pgdata empty dir

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/deploy/launchd/holocron-fire-drill-monthly.plist (MODIFY)
- services/platform/src/backup/fire-drill.ts (MODIFY isolation logic only)
- services/platform/src/mission/templates/**fire-drill** (MODIFY if needed)
- .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (MODIFY install accuracy)
- services/platform/tests/integration/sprint31-ops-04-fire-drill-schedule.test.ts (NEW)

writeProhibited:
- Full production restore that mutates live PGDATA
- Softening FORBIDDEN_PGDATA empty
- R2 credential rotation (S31-OPS-01)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/backup/fire-drill.ts — FORBIDDEN_PGDATA + refuse messages
2. services/platform/deploy/launchd/holocron-fire-drill-monthly.plist
3. .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md
4. services/platform/src/mission/templates/fire-drill-monthly.json (if present)
5. S31-OPS-01 dependency for live R2

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Proving full R2 restore byte parity (needs S31-OPS-01 healthy chain)
- Alert-sweep fixture purge (S31-OPS-02)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-OPS-04",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "repo_fire_drill_artifacts": {
      "description": "In-repo fire-drill plist and template",
      "seed_method": "public_api",
      "records": ["holocron-fire-drill-monthly.plist present"]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "filesystem",
      "topology": "single-node",
      "primary": true,
      "negative_control": {
        "would_fail_if": ["/usr/bin/true", "missing plist", "empty args"]
      },
      "evidence": { "artifact_type": "file_artifact", "required_capture": true },
      "cases": [
        {
          "start_ref": "repo_fire_drill_artifacts",
          "action": {
            "actor": "cli_user",
            "steps": ["parse plist ProgramArguments"]
          },
          "end_state": {
            "must_observe": [
              "ProgramArguments contain holo",
              "ProgramArguments contain fire-drill or fire-drill-monthly"
            ],
            "must_not_observe": ["sole program /usr/bin/true"]
          }
        }
      ]
    },
    {
      "id": "AC-2",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "cli",
      "topology": "single-node",
      "primary": false,
      "negative_control": {
        "would_fail_if": ["live PGDATA accepted", "exit 0"]
      },
      "evidence": { "artifact_type": "stdout", "required_capture": true },
      "cases": [
        {
          "start_ref": "repo_fire_drill_artifacts",
          "action": {
            "actor": "cli_user",
            "steps": ["run restore:fire-drill with --scratch set to FORBIDDEN_PGDATA entry"]
          },
          "end_state": {
            "must_observe": [
              "exit code != 0",
              "output contains refusing fire-drill into live mini PGDATA"
            ],
            "must_not_observe": ["exit 0", "restore started into live PGDATA"]
          }
        }
      ]
    }
  ]
}
-->

</details>

---

**Report to:** team-lead once schedule install docs and isolation tests pass.
