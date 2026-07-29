# REDHAT-FIX-H1 — Implement the complete D05-02 through D05-06 restore, fire-drill, mission, runbook, and security capability (review H-1)

## What this does

Land the missing Sprint 28 restore-half product surfaces for CAP-BAK-01: backup/restore.ts, fire-drill.ts, parity-report.ts, evidence-ledger-verify.ts, holo restore CLI commands, fresh-target provision/isolation scripts, fire-drill mission template + runbook, and D05-06 verify scripts — wired to real pgBackRest/R2/Postgres/restic and executable end-to-end under the corrected C1–C5 contracts. Do not expand product scope beyond CAP-BAK-01 restore half.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-H1). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `test -f services/platform/src/backup/restore.ts && test -f services/platform/src/backup/fire-drill.ts && test -f services/platform/src/backup/parity-report.ts && test -f services/platform/src/backup/evidence-ledger-verify.ts` → exit 0
- `bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/holocron-h1-invalid 2>&1 | tee /tmp/h1-cli.txt; ! grep -q 'unknown flag: --pitr' /tmp/h1-cli.txt` → parser accepts --pitr; may fail closed on invalid range with named restore error
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → GREEN fail-closed + healthy real chain
- `pnpm tsgo --noEmit` → exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/backup/restore.ts (NEW), services/platform/src/backup/fire-drill.ts (NEW), services/platform/src/backup/parity-report.ts (NEW), services/platform/src/backup/evidence-ledger-verify.ts (NEW), services/platform/src/backup/recovery-baseline.ts (if not landed by C5), services/platform/src/backup/index.ts (MODIFY), services/platform/src/cli/holo.ts (MODIFY — restore commands), services/platform/src/mission/templates/fire-drill-monthly.ts (NEW), services/platform/deploy/launchd/holocron-fire-drill-monthly.plist (NEW), scripts/provision-fresh-restore-target.sh (NEW), scripts/prove-isolation.sh (NEW), scripts/verify-restore-isolation.sh (NEW), scripts/verify-restore-creds.sh (NEW), scripts/verify-restored-artifacts.sh (NEW), scripts/verify-postgres-exposure.sh (NEW), scripts/fire-drill.sh (NEW — optional), .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW), /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md (NEW — may be completed with security-reviewer), services/platform/tests/integration/sprint28-*.test.ts (NEW/MODIFY), .tmp/REDHAT-FIX-H1/**

Prohibited: Schema inventions outside approved migrations, Mocks of R2/pgBackRest/Postgres/restic, Scope expansion beyond CAP-BAK-01 restore half, Silencing D05-01 fail-closed tests

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H1 — Implement the complete D05-02 through D05-06 restore, fire-drill, mission, runbook, and security capability (review H-1)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (240 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
All listed modules/scripts exist; `bun services/platform/src/cli/holo.ts restore --help` (or restore --pitr) is a known command (not unknown flag); fire-drill produces parity-report.json against recovery baseline; mission template registers; security verify scripts exit meaningfully; integration tests for restore path pass with PLATFORM_IT=1 against real services.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Implement services/platform/src/backup/restore.ts wrapping real pgBackRest restore
- MUST Implement fire-drill.ts, parity-report.ts, evidence-ledger-verify.ts
- MUST Wire holo CLI: restore --pitr / restore:fire-drill (or equivalent documented verbs) without unknown-flag failures for documented flags
- MUST Implement provision-fresh-restore-target.sh and prove-isolation.sh (or equivalent)
- MUST Implement mission template + runbook per corrected C4 contract
- MUST Implement D05-06 verify-*.sh scripts and security-review scaffold consumption
- NEVER mock R2, pgBackRest, Postgres, restic, or holo CLI
- NEVER re-introduce synthetic healthy fixtures or invented mission columns
- NEVER implement product beyond CAP-BAK-01 restore half (no Convex decommission, no new domains)
- NEVER return exit 0 on failed restore or failed parity
- NEVER use original mini PGDATA/blob mounts as restore target
- STRICTLY depends_on contract readiness from REDHAT-FIX-C1,C3,C4,C5
- STRICTLY every new CLI verb is registered in holo.ts case routing
- STRICTLY integration tests use PLATFORM_IT=1 and real binaries
- STRICTLY container images/tags not applicable; pin tool versions via existing backup config patterns

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN Sprint 27 R2/pgBackRest repo and corrected C3 contract WHEN operator runs `bun services/platform/src/cli/holo.ts r
- [ ] AC-2: GIVEN fresh target + R2-alone access + recovery baseline WHEN `holo restore:fire-drill` (or documented equivalent) runs 
- [ ] AC-3: GIVEN mission + scheduler contract from C4 WHEN H1 lands THEN fire-drill-monthly template exists and registers, launchd 
- [ ] AC-4: GIVEN D05-03/D05-06 required scripts WHEN H1 lands THEN provision-fresh-restore-target.sh, prove-isolation.sh, verify-re
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN Sprint 27 R2/pgBackRest repo and corrected C3 contract WHEN operator runs  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN Sprint 27 R2/pgBackRest repo and corrected C3 contract WHEN operator runs `bun services/platform/src/cli/holo.ts restore --pitr <Tt> --scratch <dir> --target-action=pause|promote` THEN command is recognized (not unknown flag), wraps pgBackRest restore, exits 0 on valid window, and yields queryable DB with seeded sentinel/pitr_test expectations met.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-cli+pgBackRest+R2+Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if unknown flag: --pitr; restore.ts missing; stub exit 0 without pgBackRest; synthetic fixture special case
  START_REF: sprint27_backup_pipeline_ready
  MUST_OBSERVE: test -f services/platform/src/backup/restore.ts; holo restore --pitr ... exit != 2 for unknown flag on valid invocation; valid window restore exit 0; psql SELECT 1 exit 0 on scratch; stderr does not equal only 'unknown flag: --pitr' on valid flags
  MUST_NOT_OBSERVE: unknown flag: --pitr for documented restore flags; restore.ts absent; empty/start signature: exit 2 parser error only
  EVIDENCE: stdout (required_capture=True)

### AC-2 — GIVEN fresh target + R2-alone access + recovery baseline WHEN `holo restore:fire (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN fresh target + R2-alone access + recovery baseline WHEN `holo restore:fire-drill` (or documented equivalent) runs THEN fire-drill.ts/parity-report.ts/evidence-ledger-verify.ts execute real restore+blob parity, emit parity-report.json with POSTGRES_PARITY_PASS, LEDGER_CHECKSUM_MATCH (SHA-256 baseline), BLOB_PARITY_PASS concrete values, exit 0 only if all pass.
  TEST_TIER: e2e · TDD_STATE: red→green
  VERIFICATION_SERVICE: full-fire-drill-stack
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill.test.ts`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if modules missing; exit 0 with PASS flags hardcoded true; no baseline compare; uses mini local data
  START_REF: fresh_target_env
  MUST_OBSERVE: test -f services/platform/src/backup/fire-drill.ts; test -f services/platform/src/backup/parity-report.ts; test -f services/platform/src/backup/evidence-ledger-verify.ts; parity-report.json exists with POSTGRES_PARITY_PASS boolean; LEDGER_CHECKSUM_MATCH boolean and ledger digest SHA-256 form; BLOB_PARITY_PASS boolean and matched_objects integer >= 0
  MUST_NOT_OBSERVE: any of the three modules missing; hardcoded PASS without computation; empty/start signature: empty shell files
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — GIVEN mission + scheduler contract from C4 WHEN H1 lands THEN fire-drill-monthly (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN mission + scheduler contract from C4 WHEN H1 lands THEN fire-drill-monthly template exists and registers, launchd monthly plist exists, runbook fire-drill-monthly.md exists with concrete commands, and on-demand mission run can complete with typed_output_json parity pointer.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: mission+filesystem
  VERIFY: `test -f services/platform/src/mission/templates/fire-drill-monthly.ts && test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist && test -f .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if invented schema fields; missing runbook; schedule only inside DSL
  START_REF: corrected_contracts_c1_c5
  MUST_OBSERVE: template file exists and uses on-demand trigger; launchd plist exists; runbook contains holo restore or fire-drill concrete command; mission_runs uses template_key + typed_output_json (integration assertion)
  MUST_NOT_OBSERVE: mission_key/output_artifacts used; runbook missing; empty/start signature: template absent
  EVIDENCE: file_artifact (required_capture=True)

### AC-4 — GIVEN D05-03/D05-06 required scripts WHEN H1 lands THEN provision-fresh-restore- (flow_ref T-PLAT-025)
  GIVEN/WHEN/THEN: GIVEN D05-03/D05-06 required scripts WHEN H1 lands THEN provision-fresh-restore-target.sh, prove-isolation.sh, verify-restore-isolation.sh, verify-restore-creds.sh, verify-restored-artifacts.sh, verify-postgres-exposure.sh exist, are executable, and smoke-run without CLI parse errors (may fail closed on missing env with named errors).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: filesystem+security-scripts
  VERIFY: `for s in scripts/provision-fresh-restore-target.sh scripts/prove-isolation.sh scripts/verify-restore-isolation.sh scripts/verify-restore-creds.sh scripts/verify-restored-artifacts.sh scripts/verify-postgres-exposure.sh; do test -x $s || test -f $s; done`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if scripts absent; empty stubs that always exit 0 without checks; destructive delete of live recovery keys as the only negative test
  START_REF: fresh_target_env
  MUST_OBSERVE: all six scripts present under scripts/; scripts contain real checks (nc/mount/policy/grep) not only 'exit 0'; rg -n 'PASS:|FAIL:|AccessDenied|listen_addresses' scripts/verify-*.sh scripts/prove-isolation.sh
  MUST_NOT_OBSERVE: any required script missing; script is empty or only echoes ok; empty/start signature: no scripts directory entries
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | restore.ts exists | AC-1 | `test -f services/platform/src/backup/restore.ts` |
| TC-2 | fire-drill + parity + ledger-verify exist | AC-2 | `test -f services/platform/src/backup/fire-drill.ts && test -f services/platform/` |
| TC-3 | holo restore not unknown-flag for --pitr | AC-1 | `bun services/platform/src/cli/holo.ts restore --pitr 2024-01-15T12:30:45Z --scra` |
| TC-4 | D05-01 fail-closed suite executable against implementation | AC-1 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-resto` |
| TC-5 | Typecheck + lint clean on backup + cli | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/ services/pl` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/backup/restore.ts (NEW)
- services/platform/src/backup/fire-drill.ts (NEW)
- services/platform/src/backup/parity-report.ts (NEW)
- services/platform/src/backup/evidence-ledger-verify.ts (NEW)
- services/platform/src/backup/recovery-baseline.ts (if not landed by C5)
- services/platform/src/backup/index.ts (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY — restore commands)
- services/platform/src/mission/templates/fire-drill-monthly.ts (NEW)
- services/platform/deploy/launchd/holocron-fire-drill-monthly.plist (NEW)
- scripts/provision-fresh-restore-target.sh (NEW)
- scripts/prove-isolation.sh (NEW)
- scripts/verify-restore-isolation.sh (NEW)
- scripts/verify-restore-creds.sh (NEW)
- scripts/verify-restored-artifacts.sh (NEW)
- scripts/verify-postgres-exposure.sh (NEW)
- scripts/fire-drill.sh (NEW — optional)
- .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md (NEW)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md (NEW — may be completed with security-reviewer)
- services/platform/tests/integration/sprint28-*.test.ts (NEW/MODIFY)
- .tmp/REDHAT-FIX-H1/**
writeProhibited:
- Schema inventions outside approved migrations
- Mocks of R2/pgBackRest/Postgres/restic
- Scope expansion beyond CAP-BAK-01 restore half
- Silencing D05-01 fail-closed tests

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:96-101 [H-1 finding: only RED test landed]
2. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:15-18 [executive summary missing capability]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md
4. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-03-provision-a-genuinely-fresh-restore-target-zero-access-to-the-original-mini.md
5. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-04-run-the-full-fire-drill-restore-postgres-blob-end-to-end.md
6. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-05-schedule-the-fire-drill-as-a-periodic-mission-author-the-runbook.md
7. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-06-security-review-fresh-restore-target-trust-boundary.md
8. services/platform/src/cli/holo.ts [CLI case routing patterns]
9. services/platform/src/backup/*.ts [Sprint 27 backup module]
10. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md [CAP-BAK-01]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- modules-present: `test -f services/platform/src/backup/restore.ts && test -f services/platform/src/backup/fire-drill.ts && test -f services/platform/src/backup/parity-report.ts && test -f services/platform/src/backup/evidence-ledger-verify.ts` → exit 0
- restore-cli-known: `bun services/platform/src/cli/holo.ts restore --pitr 2099-01-01T00:00:00Z --scratch /tmp/holocron-h1-invalid 2>&1 | tee /tmp/h1-cli.txt; ! grep -q 'unknown flag: --pitr' /tmp/h1-cli.txt` → parser accepts --pitr; may fail closed on invalid range with named restore error
- integration-restore: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → GREEN fail-closed + healthy real chain
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check services/platform/src/backup/ services/platform/src/cli/holo.ts` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: Thin TypeScript operator facades over real pgBackRest/restic binaries + structured JSON reports; mission on-demand + external launchd monthly; scripts for isolation/security probes.
pattern_source: Sprint 27 backup CLI commands; D05 task scopes; C1–C5 corrected contracts
anti_pattern: Empty shell modules; parser-only stubs; re-implementing WAL restore in pure TS; inventing schema; skipping baseline parity.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — H-1 is the product-capability delivery gap: landing SHA has only D05-01 RED test. DevOps owns restore/fire-drill/provision/mission wiring for CAP-BAK-01 restore half. Depends on C1/C3/C4/C5 corrected contracts so implementation is not forced to lie.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: REDHAT-FIX-C1, REDHAT-FIX-C3, REDHAT-FIX-C4, REDHAT-FIX-C5, D04-02, D04-03, D04-04
Blocks: REDHAT-FIX-H2, D05-06
Coordinates with: D05-02, D05-03, D05-04, D05-05, REDHAT-FIX-C2

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Review evidence (immutable): `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` @ SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`.
- Do not claim gate pass; do not implement outside write_allowed.
- Preserve Sprint 28 CAP-BAK-01 restore-half scope.

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H1",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "sprint27_backup_pipeline_ready": {
      "description": "Sprint 27 backup module + R2 repo + WAL + restic mirror available",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/backup/{base-backup,wal-archive,restic-mirror,config}.ts present",
        "Real R2 credentials for test scope",
        "pgBackRest stanza operational"
      ]
    },
    "corrected_contracts_c1_c5": {
      "description": "REDHAT-FIX-C1/C3/C4/C5 contracts applied so implementation targets implementable ACs",
      "seed_method": "public_api",
      "records": [
        "Real pgBackRest healthy fixture requirement",
        "Pause/promote separated PITR contract",
        "Mission real schema fields + external monthly schedule",
        "SHA-256 recovery baseline"
      ]
    },
    "fresh_target_env": {
      "description": "Isolated restore target with empty PGDATA/blob dirs and RO R2 creds",
      "seed_method": "cli",
      "records": [
        "provision script exit 0",
        "prove-isolation exit 0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN Sprint 27 R2/pgBackRest repo and corrected C3 contract WHEN operator runs `bun services/platform/src/cli/holo.ts restore --pitr <Tt> --scratch <dir> --target-action=pause|promote` THEN command is recognized (not unknown flag), wraps pgBackRest restore, exits 0 on valid window, and yields queryable DB with seeded sentinel/pitr_test expectations met.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts services/platform/tests/integration/sprint28-pitr-recovery-contract.test.ts",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-cli+pgBackRest+R2+Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "unknown flag: --pitr",
            "restore.ts missing",
            "stub exit 0 without pgBackRest",
            "synthetic fixture special case"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "sprint27_backup_pipeline_ready",
            "action": {
              "actor": "operator",
              "steps": [
                "Implement restore.ts + holo restore routing",
                "Run restore --pitr against real chain",
                "Assert DB queryable"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f services/platform/src/backup/restore.ts",
                "holo restore --pitr ... exit != 2 for unknown flag on valid invocation",
                "valid window restore exit 0",
                "psql SELECT 1 exit 0 on scratch",
                "stderr does not equal only 'unknown flag: --pitr' on valid flags"
              ],
              "must_not_observe": [
                "unknown flag: --pitr for documented restore flags",
                "restore.ts absent",
                "empty/start signature: exit 2 parser error only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN fresh target + R2-alone access + recovery baseline WHEN `holo restore:fire-drill` (or documented equivalent) runs THEN fire-drill.ts/parity-report.ts/evidence-ledger-verify.ts execute real restore+blob parity, emit parity-report.json with POSTGRES_PARITY_PASS, LEDGER_CHECKSUM_MATCH (SHA-256 baseline), BLOB_PARITY_PASS concrete values, exit 0 only if all pass.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-fire-drill.test.ts",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "e2e",
        "verification_service": "full-fire-drill-stack",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "modules missing",
            "exit 0 with PASS flags hardcoded true",
            "no baseline compare",
            "uses mini local data"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_env",
            "action": {
              "actor": "operator",
              "steps": [
                "Implement fire-drill + parity + ledger verify modules",
                "Run fire-drill against R2 alone",
                "Inspect parity-report.json"
              ]
            },
            "end_state": {
              "must_observe": [
                "test -f services/platform/src/backup/fire-drill.ts",
                "test -f services/platform/src/backup/parity-report.ts",
                "test -f services/platform/src/backup/evidence-ledger-verify.ts",
                "parity-report.json exists with POSTGRES_PARITY_PASS boolean",
                "LEDGER_CHECKSUM_MATCH boolean and ledger digest SHA-256 form",
                "BLOB_PARITY_PASS boolean and matched_objects integer >= 0",
                "exit 0 only if all three pass flags true"
              ],
              "must_not_observe": [
                "any of the three modules missing",
                "hardcoded PASS without computation",
                "empty/start signature: empty shell files"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN mission + scheduler contract from C4 WHEN H1 lands THEN fire-drill-monthly template exists and registers, launchd monthly plist exists, runbook fire-drill-monthly.md exists with concrete commands, and on-demand mission run can complete with typed_output_json parity pointer.",
      "verify": "test -f services/platform/src/mission/templates/fire-drill-monthly.ts && test -f services/platform/deploy/launchd/holocron-fire-drill-monthly.plist && test -f .spec/prds/mk6-migration/runbooks/fire-drill-monthly.md",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "mission+filesystem",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "invented schema fields",
            "missing runbook",
            "schedule only inside DSL"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "corrected_contracts_c1_c5",
            "action": {
              "actor": "operator",
              "steps": [
                "Land mission template + launchd + runbook",
                "Register template / run on-demand once in IT"
              ]
            },
            "end_state": {
              "must_observe": [
                "template file exists and uses on-demand trigger",
                "launchd plist exists",
                "runbook contains holo restore or fire-drill concrete command",
                "mission_runs uses template_key + typed_output_json (integration assertion)"
              ],
              "must_not_observe": [
                "mission_key/output_artifacts used",
                "runbook missing",
                "empty/start signature: template absent"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN D05-03/D05-06 required scripts WHEN H1 lands THEN provision-fresh-restore-target.sh, prove-isolation.sh, verify-restore-isolation.sh, verify-restore-creds.sh, verify-restored-artifacts.sh, verify-postgres-exposure.sh exist, are executable, and smoke-run without CLI parse errors (may fail closed on missing env with named errors).",
      "verify": "for s in scripts/provision-fresh-restore-target.sh scripts/prove-isolation.sh scripts/verify-restore-isolation.sh scripts/verify-restore-creds.sh scripts/verify-restored-artifacts.sh scripts/verify-postgres-exposure.sh; do test -x $s || test -f $s; done",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-025",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem+security-scripts",
        "topology": "single-node",
        "flow_ref": "T-PLAT-025",
        "negative_control": {
          "would_fail_if": [
            "scripts absent",
            "empty stubs that always exit 0 without checks",
            "destructive delete of live recovery keys as the only negative test"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_target_env",
            "action": {
              "actor": "operator",
              "steps": [
                "Create all provision/isolation/security verify scripts",
                "Smoke each script --help or dry env"
              ]
            },
            "end_state": {
              "must_observe": [
                "all six scripts present under scripts/",
                "scripts contain real checks (nc/mount/policy/grep) not only 'exit 0'",
                "rg -n 'PASS:|FAIL:|AccessDenied|listen_addresses' scripts/verify-*.sh scripts/prove-isolation.sh"
              ],
              "must_not_observe": [
                "any required script missing",
                "script is empty or only echoes ok",
                "empty/start signature: no scripts directory entries"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "restore.ts exists",
      "verify": "test -f services/platform/src/backup/restore.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "fire-drill + parity + ledger-verify exist",
      "verify": "test -f services/platform/src/backup/fire-drill.ts && test -f services/platform/src/backup/parity-report.ts && test -f services/platform/src/backup/evidence-ledger-verify.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "holo restore not unknown-flag for --pitr",
      "verify": "bun services/platform/src/cli/holo.ts restore --pitr 2024-01-15T12:30:45Z --scratch /tmp/holocron-h1-smoke 2>&1 | tee /tmp/h1-restore-smoke.txt; ! rg -n 'unknown flag: --pitr' /tmp/h1-restore-smoke.txt",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "D05-01 fail-closed suite executable against implementation",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Typecheck + lint clean on backup + cli",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/src/backup/ services/platform/src/cli/holo.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
