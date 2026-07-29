# REDHAT-FIX-C1 — Replace the synthetic D05-01 healthy fixture with a real pgBackRest chain and align the D05-01/D05-02 restore contract (review C-1)

## What this does

Replace D05-01's synthetic 'pgBackRest-style' text manifest + D05-01-HEALTHY-WAL-PLACEHOLDER fixture with a REAL pgBackRest-produced base backup and continuous WAL chain in a test-scoped R2/repo prefix, and align D05-01 AC-3 healthy control with the D05-02 contract that pgBackRest is the only restore path — with zero production special-case for synthetic objects.

## Why

Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-C1). Grounded in UC-PLAT-06 / T-PLAT-022 / T-PLAT-025 / CAP-BAK-01. Review evidence: `.spec/reviews/red-hat-20260728T235155Z-sprint-28.md` (reviewed SHA `a9b5b6e7ff2b707fddf15084e2895221c62c68cb`).

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy'` → healthy fixture uses real pgBackRest; no synthetic placeholder
- `! rg -n 'D05-01-HEALTHY-WAL-PLACEHOLDER|# HEALTHY pgBackRest-style' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → exit 0 (no matches)
- `pnpm tsgo --noEmit` → exit 0
- `pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → exit 0
- `pnpm tsgo --noEmit && pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/tests/integration/sprint28-restore-fails-closed.test.ts, services/platform/tests/integration/helpers/pgbackrest-seed.ts (NEW — optional shared seeder), /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md, /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md, .tmp/REDHAT-FIX-C1/** (evidence only)

Prohibited: services/platform/src/backup/restore.ts production special-case for synthetic fixtures, Mocking/stubbing R2, pgBackRest, or holo restore in the healthy path, Implementing full fire-drill/mission surfaces (owned by REDHAT-FIX-H1 / D05-04..D05-06), services/platform/src/db/migrations/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-C1 — Replace the synthetic D05-01 healthy fixture with a real pgBackRest chain and align the D05-01/D05-02 restore contract (review C-1)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 28 — Point-in-Time Restore and Fresh-Hardware Fire Drill](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy'
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
PLATFORM_IT=1 vitest sprint28-restore-fails-closed.test.ts healthy case seeds via real `pgbackrest backup` + archive-push into the test-scoped prefix; `pgbackrest info --output=json` reports a real backup label; healthy restore via production path exits 0 with pitr_test COUNT(*) >= 1; grepping the fixture finds zero HEALTHY-WAL-PLACEHOLDER and zero synthetic 'pgBackRest-style' text manifests; production restore.ts has no branch that accepts synthetic fixtures.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST Seed healthy_seeded_repo by running real pgBackRest backup + WAL archive into a test-scoped R2/repo prefix (public_api / real CLI entrypoints only)
- MUST Healthy fixture must include a continuous WAL window covering the PITR target and a pitr_test table with >= 1 row
- MUST Align D05-01 AC-3 and the integration test so the healthy control only passes via the production pgBackRest restore path
- MUST Document that D05-02 may only restore via pgBackRest and must reject synthetic text manifests / placeholder WAL
- MUST Update D05-01 task contract fixtures.healthy_seeded_repo records to require real pgBackRest objects
- NEVER write synthetic text 'pgBackRest-style' manifests or D05-01-HEALTHY-WAL-PLACEHOLDER as the healthy control
- NEVER add a test-only restore reader/special case in production restore code that accepts synthetic objects
- NEVER mock R2, pgBackRest, Postgres, or the holo CLI
- NEVER make the healthy case skip/todo or always-fail regardless of repo state
- NEVER treat aws s3 cp of hand-written files as a valid healthy chain
- STRICTLY healthy seed must be verifiable by `pgbackrest info` listing a real backup label for the test stanza/prefix
- STRICTLY production restore path is identical for test and operator use — no fixture sniffing
- STRICTLY empty and corrupted fixtures remain fail-closed; only the healthy fixture changes to real pgBackRest objects
- STRICTLY seed_method is public_api or real CLI/entrypoint — never view-injection/mocks

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: GIVEN a clean test-scoped R2/pgBackRest prefix and a source Postgres with pitr_test seeded (>=1 row) WHEN the D05-01 hea
- [ ] AC-2: GIVEN the real healthy pgBackRest chain from AC-1 WHEN production `holo restore --pitr <timestamp-in-window> --scratch <
- [ ] AC-3: GIVEN only synthetic text objects (manifest + HEALTHY-WAL-PLACEHOLDER) uploaded to an otherwise empty prefix WHEN produc
- [ ] AC-4: GIVEN D05-01 and D05-02 task contracts WHEN reviewing healthy fixture + restore constraints THEN both contracts require 
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — GIVEN a clean test-scoped R2/pgBackRest prefix and a source Postgres with pitr_t (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN a clean test-scoped R2/pgBackRest prefix and a source Postgres with pitr_test seeded (>=1 row) WHEN the D05-01 healthy seeder runs real `pgbackrest backup` + WAL archive-push THEN the test-scoped prefix contains a real pgBackRest base backup and WAL chain verifiable by `pgbackrest info --output=json` (non-empty backup label, status ok) and R2 object listing shows pgBackRest-produced artifacts (not hand-written text manifests).
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: pgBackRest+R2+Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if seeder only aws s3 cp's text files shaped like manifests; pgbackrest is mocked or skipped; pgbackrest info returns empty backup set but test still treats fixture as healthy; WAL is the literal string D05-01-HEALTHY-WAL-PLACEHOLDER
  START_REF: healthy_real_pgbackrest_repo
  MUST_OBSERVE: pgbackrest backup exit code = 0; pgbackrest info --output=json backup label length >= 8; R2 object_count under test prefix >= 1 with real backup/archive layout; fixture source code does not contain the literal D05-01-HEALTHY-WAL-PLACEHOLDER; fixture source code does not write '# HEALTHY pgBackRest-style manifest'
  MUST_NOT_OBSERVE: healthy seeder only writes synthetic text manifest; pgbackrest never invoked (exit never observed); empty/start signature: R2 object_count = 0; WAL body equals D05-01-HEALTHY-WAL-PLACEHOLDER
  EVIDENCE: stdout (required_capture=True)

### AC-2 — GIVEN the real healthy pgBackRest chain from AC-1 WHEN production `holo restore  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN the real healthy pgBackRest chain from AC-1 WHEN production `holo restore --pitr <timestamp-in-window> --scratch <dir>` executes (after restore lands, or via RED expectation once available) THEN exit 0, restored DB answers SELECT 1, and SELECT COUNT(*) FROM pitr_test >= 1 — proving the healthy control is not a blanket always-fail stub and uses the real restore path.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2+Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy seeded repo'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if healthy case is skip/todo; test always fails regardless of repo state; restore uses a special synthetic-object reader; pitr_test is injected after restore instead of recovered from backup
  START_REF: healthy_real_pgbackrest_repo
  MUST_OBSERVE: restore exit code = 0 (once restore implemented; RED until then documents expected GREEN); psql SELECT 1 exit 0; pitr_test COUNT(*) >= 1
  MUST_NOT_OBSERVE: exit code != 0 on a valid real chain after restore lands; pitr_test COUNT(*) = 0 or table missing; empty/start signature: success without pgBackRest restore
  EVIDENCE: db_query (required_capture=True)

### AC-3 — GIVEN only synthetic text objects (manifest + HEALTHY-WAL-PLACEHOLDER) uploaded  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN only synthetic text objects (manifest + HEALTHY-WAL-PLACEHOLDER) uploaded to an otherwise empty prefix WHEN production restore runs THEN restore exits non-zero with a named backup-chain integrity error and does NOT produce a queryable promoted DB — proving no synthetic acceptance path.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: holo-restore-cli+pgBackRest+R2
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'synthetic|corrupt|reject'`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if production restore treats text manifest as valid; test-only special case accepts HEALTHY-WAL-PLACEHOLDER; exit 0 without real pgBackRest objects
  START_REF: synthetic_text_manifest_forbidden
  MUST_OBSERVE: exit code != 0; stderr names chain integrity / no valid backup / restore failed (not 'unknown flag'); PGDATA file count = 0 OR pg_ctl status non-zero
  MUST_NOT_OBSERVE: exit code 0; queryable Postgres with pitr_test rows from synthetic path; empty/start signature: unknown flag: --pitr as the only error
  EVIDENCE: stdout (required_capture=True)

### AC-4 — GIVEN D05-01 and D05-02 task contracts WHEN reviewing healthy fixture + restore  (flow_ref T-PLAT-022)
  GIVEN/WHEN/THEN: GIVEN D05-01 and D05-02 task contracts WHEN reviewing healthy fixture + restore constraints THEN both contracts require real pgBackRest-produced objects for the healthy control, forbid synthetic placeholders, and D05-02 STRICTLY keeps pgBackRest as the only restore path with no synthetic reader.
  TEST_TIER: integration · TDD_STATE: red→green
  VERIFICATION_SERVICE: contract-docs+test-source
  VERIFY: `rg -n 'HEALTHY-WAL-PLACEHOLDER|pgBackRest-style' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01*.md services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; rg -n 'only restore path|pgBackRest' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if contracts still describe text-manifest healthy fixtures as valid; D05-02 allows non-pgBackRest restore; test still seeds HEALTHY-WAL-PLACEHOLDER as healthy control
  START_REF: healthy_real_pgbackrest_repo
  MUST_OBSERVE: D05-01 contract healthy fixture records require pgbackrest backup + info label; integration test healthy seeder invokes pgbackrest (spawn/exec of real binary); zero occurrences of D05-01-HEALTHY-WAL-PLACEHOLDER in healthy seeder path
  MUST_NOT_OBSERVE: contract still allows synthetic text healthy fixtures; test still writes HEALTHY-WAL-PLACEHOLDER as healthy control; empty/start signature: no contract update
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | Healthy seeder invokes real pgbackrest binary (no mock) | AC-1 | `rg -n 'pgbackrest' services/platform/tests/integration/sprint28-restore-fails-cl` |
| TC-2 | HEALTHY-WAL-PLACEHOLDER absent from healthy fixture path | AC-1 | `! rg -n 'D05-01-HEALTHY-WAL-PLACEHOLDER' services/platform/tests/integration/spr` |
| TC-3 | Integration suite still covers empty + corrupt fail-closed | AC-2 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-resto` |
| TC-4 | Typecheck + lint clean on touched test/helper files | AC-1 | `pnpm tsgo --noEmit && pnpm biome check services/platform/tests/integration/sprin` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/tests/integration/sprint28-restore-fails-closed.test.ts
- services/platform/tests/integration/helpers/pgbackrest-seed.ts (NEW — optional shared seeder)
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md
- /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md
- .tmp/REDHAT-FIX-C1/** (evidence only)
writeProhibited:
- services/platform/src/backup/restore.ts production special-case for synthetic fixtures
- Mocking/stubbing R2, pgBackRest, or holo restore in the healthy path
- Implementing full fire-drill/mission surfaces (owned by REDHAT-FIX-H1 / D05-04..D05-06)
- services/platform/src/db/migrations/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:59-64 [C-1 finding: synthetic healthy fixture vs real pgBackRest]
2. /Users/inference1/Projects/holocron/.spec/reviews/red-hat-20260728T235155Z-sprint-28.md:25-28 [AC verdict table D05-01 AC-3 healthy chain]
3. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01-red-restore-fails-closed-on-empty-corrupted-backup-chain.md:110-117 [AC-3 healthy control]
4. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02-holo-restore-pitr-timestamp-operator-command.md:68-79 [pgBackRest only restore path]
5. services/platform/tests/integration/sprint28-restore-fails-closed.test.ts:296-389 [synthetic seeder to replace]
6. services/platform/src/backup/base-backup.ts:300-379 [real pgBackRest backup + R2 confirm pattern]
7. /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:57 [T-PLAT-022]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- real-pgbackrest-healthy-seed: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy'` → healthy fixture uses real pgBackRest; no synthetic placeholder
- no-placeholder-wal: `! rg -n 'D05-01-HEALTHY-WAL-PLACEHOLDER|# HEALTHY pgBackRest-style' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → exit 0 (no matches)
- typecheck: `pnpm tsgo --noEmit` → exit 0
- lint: `pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts` → exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-20260728T235155Z-sprint-28.md, ./SPRINT.md
Interaction notes:
- —
pattern: Test seeder drives real pgBackRest backup/archive into a test-scoped stanza+R2 prefix; production restore is the only consumer — healthy and failure fixtures differ only in repo contents, never in restore code paths.
pattern_source: services/platform/src/backup/base-backup.ts (pgbackrest backup + info + R2 list confirm); Sprint 27 integration seeding patterns
anti_pattern: Hand-written text 'manifests' and placeholder WAL strings uploaded via aws s3 cp; production restore special-casing test fixtures; skip/todo healthy controls.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
Implementer: devops-engineer — C-1 is a restore-path fixture/contract defect: only a real pgBackRest base+WAL seed into a test-scoped R2 repo can discriminate a production restore from a test-only synthetic reader. DevOps owns pgBackRest/R2 seeding and D05 contract alignment.
Reviewer: code-reviewer (+ security-reviewer when task is security-scoped)

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D05-01
Blocks: REDHAT-FIX-H1, D05-02
Coordinates with: REDHAT-FIX-C2, REDHAT-FIX-C3

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
  "task_id": "REDHAT-FIX-C1",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "healthy_real_pgbackrest_repo": {
      "description": "Test-scoped R2/pgBackRest repo prefix produced by a real pgBackRest full backup and continuous WAL archive containing pitr_test >= 1 row.",
      "seed_method": "public_api",
      "records": [
        "Test Postgres instance with CREATE TABLE pitr_test + INSERT >= 1 row",
        "pgbackrest --stanza=<test> backup --type=full exit 0 into test-scoped R2 prefix",
        "At least one subsequent WAL archive-push covering the PITR target timestamp",
        "pgbackrest info --output=json reports backup label non-empty and status ok",
        "R2 listing under test prefix contains real backup.manifest / archive objects produced by pgBackRest (not hand-written text)"
      ]
    },
    "empty_r2_repo": {
      "description": "Test-scoped empty R2 prefix (unchanged fail-closed control).",
      "seed_method": "public_api",
      "records": [
        "0 objects under test prefix",
        "no base backup",
        "no WAL"
      ]
    },
    "corrupted_manifest_repo": {
      "description": "Real or deliberately corrupted pgBackRest objects with checksum/manifest mismatch.",
      "seed_method": "public_api",
      "records": [
        "Base backup present",
        "At least one WAL/manifest object corrupted after real backup"
      ]
    },
    "synthetic_text_manifest_forbidden": {
      "description": "Negative reference: previous RED synthetic objects that production restore MUST reject.",
      "seed_method": "public_api",
      "records": [
        "Text body containing 'pgBackRest-style' or HEALTHY-WAL-PLACEHOLDER",
        "Production restore exit != 0 with named chain integrity error"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN a clean test-scoped R2/pgBackRest prefix and a source Postgres with pitr_test seeded (>=1 row) WHEN the D05-01 healthy seeder runs real `pgbackrest backup` + WAL archive-push THEN the test-scoped prefix contains a real pgBackRest base backup and WAL chain verifiable by `pgbackrest info --output=json` (non-empty backup label, status ok) and R2 object listing shows pgBackRest-produced artifacts (not hand-written text manifests).",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy'",
      "maps_to_ac": null,
      "primary": true,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pgBackRest+R2+Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "seeder only aws s3 cp's text files shaped like manifests",
            "pgbackrest is mocked or skipped",
            "pgbackrest info returns empty backup set but test still treats fixture as healthy",
            "WAL is the literal string D05-01-HEALTHY-WAL-PLACEHOLDER"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_real_pgbackrest_repo",
            "action": {
              "actor": "operator",
              "steps": [
                "Provision test-scoped Postgres + pgBackRest stanza + R2 prefix",
                "INSERT into pitr_test at least one row",
                "Run real pgbackrest backup --type=full",
                "Force WAL switch / archive-push covering target time",
                "Run pgbackrest info --output=json and list R2 prefix"
              ]
            },
            "end_state": {
              "must_observe": [
                "pgbackrest backup exit code = 0",
                "pgbackrest info --output=json backup label length >= 8",
                "R2 object_count under test prefix >= 1 with real backup/archive layout",
                "fixture source code does not contain the literal D05-01-HEALTHY-WAL-PLACEHOLDER",
                "fixture source code does not write '# HEALTHY pgBackRest-style manifest'"
              ],
              "must_not_observe": [
                "healthy seeder only writes synthetic text manifest",
                "pgbackrest never invoked (exit never observed)",
                "empty/start signature: R2 object_count = 0",
                "WAL body equals D05-01-HEALTHY-WAL-PLACEHOLDER"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN the real healthy pgBackRest chain from AC-1 WHEN production `holo restore --pitr <timestamp-in-window> --scratch <dir>` executes (after restore lands, or via RED expectation once available) THEN exit 0, restored DB answers SELECT 1, and SELECT COUNT(*) FROM pitr_test >= 1 \u2014 proving the healthy control is not a blanket always-fail stub and uses the real restore path.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'healthy seeded repo'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2+Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "healthy case is skip/todo",
            "test always fails regardless of repo state",
            "restore uses a special synthetic-object reader",
            "pitr_test is injected after restore instead of recovered from backup"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_real_pgbackrest_repo",
            "action": {
              "actor": "operator",
              "steps": [
                "Seed real pgBackRest chain with pitr_test >= 1",
                "Run holo restore --pitr <in-window-ts> --scratch <scratch>",
                "Query restored DB: SELECT 1; SELECT COUNT(*) FROM pitr_test"
              ]
            },
            "end_state": {
              "must_observe": [
                "restore exit code = 0 (once restore implemented; RED until then documents expected GREEN)",
                "psql SELECT 1 exit 0",
                "pitr_test COUNT(*) >= 1"
              ],
              "must_not_observe": [
                "exit code != 0 on a valid real chain after restore lands",
                "pitr_test COUNT(*) = 0 or table missing",
                "empty/start signature: success without pgBackRest restore"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN only synthetic text objects (manifest + HEALTHY-WAL-PLACEHOLDER) uploaded to an otherwise empty prefix WHEN production restore runs THEN restore exits non-zero with a named backup-chain integrity error and does NOT produce a queryable promoted DB \u2014 proving no synthetic acceptance path.",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts -t 'synthetic|corrupt|reject'",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "holo-restore-cli+pgBackRest+R2",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "production restore treats text manifest as valid",
            "test-only special case accepts HEALTHY-WAL-PLACEHOLDER",
            "exit 0 without real pgBackRest objects"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "synthetic_text_manifest_forbidden",
            "action": {
              "actor": "operator",
              "steps": [
                "Upload synthetic text manifest + placeholder WAL to test prefix",
                "Run holo restore --pitr <ts> --scratch <dir>",
                "Capture exit, stderr, PGDATA file count"
              ]
            },
            "end_state": {
              "must_observe": [
                "exit code != 0",
                "stderr names chain integrity / no valid backup / restore failed (not 'unknown flag')",
                "PGDATA file count = 0 OR pg_ctl status non-zero"
              ],
              "must_not_observe": [
                "exit code 0",
                "queryable Postgres with pitr_test rows from synthetic path",
                "empty/start signature: unknown flag: --pitr as the only error"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN D05-01 and D05-02 task contracts WHEN reviewing healthy fixture + restore constraints THEN both contracts require real pgBackRest-produced objects for the healthy control, forbid synthetic placeholders, and D05-02 STRICTLY keeps pgBackRest as the only restore path with no synthetic reader.",
      "verify": "rg -n 'HEALTHY-WAL-PLACEHOLDER|pgBackRest-style' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-01*.md services/platform/tests/integration/sprint28-restore-fails-closed.test.ts; rg -n 'only restore path|pgBackRest' /Users/inference1/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/D05-02*.md",
      "maps_to_ac": null,
      "primary": false,
      "flow_ref": "T-PLAT-022",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "contract-docs+test-source",
        "topology": "single-node",
        "flow_ref": "T-PLAT-022",
        "negative_control": {
          "would_fail_if": [
            "contracts still describe text-manifest healthy fixtures as valid",
            "D05-02 allows non-pgBackRest restore",
            "test still seeds HEALTHY-WAL-PLACEHOLDER as healthy control"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "healthy_real_pgbackrest_repo",
            "action": {
              "actor": "operator",
              "steps": [
                "Update D05-01 fixtures.healthy_seeded_repo records to real pgBackRest requirements",
                "Update D05-02 constraints to reject synthetic objects",
                "Remove synthetic healthy seeder from integration test"
              ]
            },
            "end_state": {
              "must_observe": [
                "D05-01 contract healthy fixture records require pgbackrest backup + info label",
                "integration test healthy seeder invokes pgbackrest (spawn/exec of real binary)",
                "zero occurrences of D05-01-HEALTHY-WAL-PLACEHOLDER in healthy seeder path"
              ],
              "must_not_observe": [
                "contract still allows synthetic text healthy fixtures",
                "test still writes HEALTHY-WAL-PLACEHOLDER as healthy control",
                "empty/start signature: no contract update"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Healthy seeder invokes real pgbackrest binary (no mock)",
      "verify": "rg -n 'pgbackrest' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts services/platform/tests/integration/helpers/pgbackrest-seed.ts 2>/dev/null | rg -v 'pgBackRest-style|HEALTHY-WAL-PLACEHOLDER' | head",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "HEALTHY-WAL-PLACEHOLDER absent from healthy fixture path",
      "verify": "! rg -n 'D05-01-HEALTHY-WAL-PLACEHOLDER' services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Integration suite still covers empty + corrupt fail-closed",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Typecheck + lint clean on touched test/helper files",
      "verify": "pnpm tsgo --noEmit && pnpm biome check services/platform/tests/integration/sprint28-restore-fails-closed.test.ts",
      "maps_to_ac": "AC-1"
    }
  ]
}
-->

</details>
