# REDHAT-FIX-S27-12 — [F-14] Add the backup_heartbeat Drizzle migration and remove runtime DDL drift

## What this does

Make backup_heartbeat a migrate-owned table with a single CHECK constraint and eliminate runtime DDL drift that can create a CHECK-less table.

## Why

- Remediate red-hat finding for CAP-BAK-01 (REDHAT-FIX-S27-12).
- Grounded in UC-PLAT-06 / T-PLAT-024 / CAP-BAK-01.

## How to verify

- `bun services/platform/src/cli/holo.ts db:migrate --json && psql "$DATABASE_URL" -tAc "SELECT conname FROM pg_constraint WHERE conrelid='public.backup_heartbeat'::regclass AND contype='c'"` → Exit 0; output contains backup_heartbeat_status_check
- `rg -n "CREATE TABLE IF NOT EXISTS backup_heartbeat" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1` → Exit 1 from rg (no matches)
- `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts` → Exit 0
- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0

## Scope

Writes: services/platform/src/db/migrations/0029_backup_heartbeat.sql (NEW), services/platform/src/db/migrations/meta/_journal.json (MODIFY), services/platform/src/db/migrations/meta/* (MODIFY if drizzle snapshot required), services/platform/src/db/schema/backup.ts (MODIFY only if CHECK/column drift must align), services/platform/src/backup/heartbeat.ts (MODIFY — remove runtime CREATE TABLE; shared assert/ensure), services/platform/src/backup/restic-mirror.ts (MODIFY — delete forked DDL; import shared helper), services/platform/src/backup/alerting.ts (MODIFY only if ensure call signature changes), services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts (NEW — migrate+CHECK seeded proof), .tmp/redhat-fix-s27-12/** (NEW evidence)

Prohibited: services/platform/src/backup/wal-archive.ts — job logic out of scope unless import-only fix, services/platform/src/backup/base-backup.ts — same, services/platform/src/cli/holo.ts — no CLI redesign, gate-plan.json / GATE-RESULTS.md — gate theatre fixes are other remediation tasks, services/platform/src/db/migrations/0000_*.sql through 0028_*.sql — do not rewrite history

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-S27-12 — [F-14] Add the backup_heartbeat Drizzle migration and remove runtime DDL drift
================================================================================

TASK_TYPE:  MIGRATION
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (120 min)
AGENT:      implementer=mastra-implementer | reviewer=code-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: CAP-BAK-01
SPRINT:     [Sprint 27 — Standing Off-Mini Backup Pipeline and Alerting](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
0029_backup_heartbeat.sql exists and is journaled; holo db:migrate creates backup_heartbeat with backup_heartbeat_status_check; grep shows zero CREATE TABLE IF NOT EXISTS backup_heartbeat outside the migration; heartbeat upserts work via migrate-only bootstrap on real Postgres.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST add versioned SQL migration services/platform/src/db/migrations/0029_backup_heartbeat.sql whose CREATE TABLE matches services/platform/src/db/schema/backup.ts (columns + backup_heartbeat_status_check CHECK allowing success|failed|running|overdue|NULL)
- MUST register 0029 in services/platform/src/db/migrations/meta/_journal.json so holo db:migrate applies it
- MUST remove runtime CREATE TABLE IF NOT EXISTS backup_heartbeat from heartbeat.ts, restic-mirror.ts, and any alerting path that issues DDL
- MUST collapse restic-mirror.ts ensureBackupHeartbeatTable into a single shared helper from heartbeat.ts (import, no forked DDL without CHECK)
- MUST prove on a real Postgres: after migrate, pg_constraint / information_schema shows backup_heartbeat_status_check and invalid status insert is rejected
- MUST leave upsertBackupHeartbeat / query paths functional after migrate-only bootstrap (no reliance on runtime DDL)
- NEVER leave three divergent runtime DDL definitions (with vs without CHECK) that CREATE TABLE IF NOT EXISTS can silently race
- NEVER invent success via schema; migration only creates structure — last_success_at still set only after R2 confirmation
- NEVER hand-edit production data or drop live heartbeat rows as part of this task
- NEVER stub applyMigrations / holo db:migrate success without a real Postgres engine
- STRICTLY route schema ownership through holo db:migrate (versioned SQL), not ad-hoc CREATE TABLE at job start
- STRICTLY keep Drizzle schema backup.ts as the source of truth for column names and CHECK values

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Migration 0029 creates backup_heartbeat with CHECK
- [ ] AC-2: Zero runtime CREATE TABLE backup_heartbeat outside migrations
- [ ] AC-3: Shared heartbeat helper fails closed when table missing
- [ ] AC-4: Journal + typecheck/lint clean on allowed paths
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads)
--------------------------------------------------------------------------------

### AC-1 [PRIMARY] — Migration 0029 creates backup_heartbeat with CHECK (flow_ref T-PLAT-021)
  GIVEN A real Postgres DATABASE_URL and migrations through 0028 already applied (or a fresh DB that will apply the full chain)
  WHEN  Operator runs `bun services/platform/src/cli/holo.ts db:migrate` (or applyMigrations) including 0029_backup_heartbeat.sql
  THEN  Table public.backup_heartbeat exists with PK job_name, columns last_success_at, last_wal_segment, last_snapshot_id, object_count, status, trace_id, updated_at, and constraint backup_heartbeat_status_check enforcing status IS NULL OR status IN ('success','failed','running','overdue')
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: Postgres
  VERIFY: `bun services/platform/src/cli/holo.ts db:migrate --json && psql "$DATABASE_URL" -c "\d+ backup_heartbeat" && psql "$DATABASE_URL" -tAc "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.backup_heartbeat'::regclass AND contype = 'c'" | rg -q "backup_heartbeat_status_check"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if 0029 SQL is missing or not journaled; migrate reports ok without creating the table; table is created without CHECK; CHECK allows arbitrary status strings
  START_REF: postgres_pre_0029_or_fresh
  MUST_OBSERVE: migration tag 0029_backup_heartbeat applied or already_applied; public.backup_heartbeat relation exists; constraint name backup_heartbeat_status_check present; pg_get_constraintdef includes success, failed, running, overdue; INSERT status=poisoned raises check_violation; INSERT status=failed succeeds
  MUST_NOT_OBSERVE: backup_heartbeat relation missing after migrate; zero CHECK constraints on backup_heartbeat; status=poisoned accepted; migrate ok:true with errors non-empty
  EVIDENCE: db_query (required_capture=True)

### AC-2 — Zero runtime CREATE TABLE backup_heartbeat outside migrations (flow_ref T-PLAT-021)
  GIVEN Post-fix source tree under services/platform/src
  WHEN  Reviewer greps for CREATE TABLE IF NOT EXISTS backup_heartbeat and for duplicate ensure DDL bodies
  THEN  Only the migration SQL (and optionally a single shared assert/no-op helper that does not CREATE TABLE) remains; heartbeat.ts, restic-mirror.ts, and alerting.ts do not issue CREATE TABLE
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: filesystem-source
  VERIFY: `rg -n "CREATE TABLE IF NOT EXISTS backup_heartbeat" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if heartbeat.ts still embeds BACKUP_HEARTBEAT_DDL CREATE TABLE; restic-mirror.ts still has forked CREATE TABLE without CHECK; alerting still calls a create-table path
  START_REF: source_tree_after_fix
  MUST_OBSERVE: rg outside migrations returns 0 matches; restic-mirror ensureBackupHeartbeatTable is import or thin wrapper without DDL body; 0029_backup_heartbeat.sql contains CREATE TABLE backup_heartbeat
  MUST_NOT_OBSERVE: CREATE TABLE IF NOT EXISTS backup_heartbeat in heartbeat.ts; CREATE TABLE IF NOT EXISTS backup_heartbeat in restic-mirror.ts; CREATE TABLE IF NOT EXISTS backup_heartbeat in alerting.ts
  EVIDENCE: file_artifact (required_capture=True)

### AC-3 — Shared heartbeat helper fails closed when table missing (flow_ref T-PLAT-021)
  GIVEN A real Postgres database where backup_heartbeat was deliberately dropped after migrate (test-only temp DB or transaction rollback harness)
  WHEN  Caller invokes upsertBackupHeartbeat / ensure helper without re-running runtime CREATE TABLE
  THEN  Operation fails with an explicit error pointing operators to `holo db:migrate` (or equivalent) rather than silently recreating a divergent schema
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: Postgres
  VERIFY: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts -t "missing table"`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if helper silently recreates table without CHECK; error is swallowed and status faked as success; restic path recreates CHECK-less table
  START_REF: postgres_table_dropped
  MUST_OBSERVE: upsert throws or returns failed-closed error; error text mentions migrate or backup_heartbeat missing; table still absent (no silent recreate) OR only recreate path is migrate re-run
  MUST_NOT_OBSERVE: status=success invented without R2; table recreated without backup_heartbeat_status_check; empty/static success object
  EVIDENCE: stdout (required_capture=True)

### AC-4 — Journal + typecheck/lint clean on allowed paths (flow_ref T-PLAT-021)
  GIVEN 0029 SQL file and journal entry present
  WHEN  Reviewer inspects meta/_journal.json and runs typecheck/lint
  THEN  Journal includes tag 0029_backup_heartbeat after 0028; pnpm tsgo --noEmit and pnpm biome check . exit 0 for touched code
  TEST_TIER: integration · TDD_STATE: red
  VERIFICATION_SERVICE: tooling
  VERIFY: `rg -n "0029_backup_heartbeat" services/platform/src/db/migrations/meta/_journal.json && pnpm tsgo --noEmit && pnpm biome check .`
  SCENARIO:
  NEGATIVE_CONTROL: would fail if SQL exists but journal omits it so migrate never applies 0029; type errors introduced in heartbeat/restic helpers
  START_REF: source_tree_after_fix
  MUST_OBSERVE: journal entry tag 0029_backup_heartbeat; tsgo exit 0; biome check exit 0
  MUST_NOT_OBSERVE: journal stops at 0028 only; tsgo non-zero; biome non-zero on write_allowed files
  EVIDENCE: file_artifact (required_capture=True)

--------------------------------------------------------------------------------
TEST CRITERIA
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 | backup_heartbeat table exists after holo db:migrate when 0029 is applied | AC-1 | `bun services/platform/src/cli/holo.ts db:migrate --json && psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.backup_heartbeat')" | rg -q backup_heartbeat` |
| TC-2 | backup_heartbeat_status_check rejects status values outside the allowed set | AC-1 | `psql "$DATABASE_URL" -c "INSERT INTO backup_heartbeat(job_name,status) VALUES ('tc-poison','poisoned')" ; test $? -ne 0` |
| TC-3 | No CREATE TABLE IF NOT EXISTS backup_heartbeat remains outside migrations/ | AC-2 | `rg -n "CREATE TABLE IF NOT EXISTS backup_heartbeat" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1` |
| TC-4 | Missing backup_heartbeat fails closed without silent CHECK-less recreate | AC-3 | `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts` |
| TC-5 | meta/_journal.json lists 0029_backup_heartbeat after 0028 | AC-4 | `rg -n "0029_backup_heartbeat" services/platform/src/db/migrations/meta/_journal.json` |

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/db/migrations/0029_backup_heartbeat.sql (NEW)
- services/platform/src/db/migrations/meta/_journal.json (MODIFY)
- services/platform/src/db/migrations/meta/* (MODIFY if drizzle snapshot required)
- services/platform/src/db/schema/backup.ts (MODIFY only if CHECK/column drift must align)
- services/platform/src/backup/heartbeat.ts (MODIFY — remove runtime CREATE TABLE; shared assert/ensure)
- services/platform/src/backup/restic-mirror.ts (MODIFY — delete forked DDL; import shared helper)
- services/platform/src/backup/alerting.ts (MODIFY only if ensure call signature changes)
- services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts (NEW — migrate+CHECK seeded proof)
- .tmp/redhat-fix-s27-12/** (NEW evidence)
writeProhibited:
- services/platform/src/backup/wal-archive.ts — job logic out of scope unless import-only fix
- services/platform/src/backup/base-backup.ts — same
- services/platform/src/cli/holo.ts — no CLI redesign
- gate-plan.json / GATE-RESULTS.md — gate theatre fixes are other remediation tasks
- services/platform/src/db/migrations/0000_*.sql through 0028_*.sql — do not rewrite history

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. .spec/reviews/red-hat-sprint27-20260728T054039Z.md:119-123 — F-14 finding — three runtime DDL sites, missing 0029
2. services/platform/src/db/schema/backup.ts:20-41 — Drizzle backupHeartbeat + CHECK source of truth
3. services/platform/src/backup/heartbeat.ts:39-67 — BACKUP_HEARTBEAT_DDL + ensureBackupHeartbeatTable to remove/replace
4. services/platform/src/backup/restic-mirror.ts:313-338 — Forked ensure without CHECK — collapse to shared helper
5. services/platform/src/backup/alerting.ts:390-400 — ensureBackupHeartbeatTable call site
6. services/platform/src/db/migrations/0028_escape_provider_deepseek.sql:1-12 — Migration naming/style predecessor
7. services/platform/tests/integration/db-migrate.test.ts:1-80 — Real Postgres migrate verification pattern

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- `PLATFORM_IT=1 pnpm vitest run <path>` exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------
References: .spec/reviews/red-hat-sprint27-20260728T054039Z.md, services/platform/src/db/schema/backup.ts, D04-03 heartbeat contract
Interaction notes:
- Operator bootstrap: holo db:migrate before any backup job on a fresh mini
- Jobs may still call a shared ensure that asserts table existence; they must not CREATE TABLE
Pattern: Versioned SQL migration owns CREATE TABLE + CHECK; application code only INSERT/UPDATE/SELECT (and optional assert-exists).
Pattern source: services/platform/src/db/migrations/* + services/platform/src/db/schema/backup.ts
Anti-pattern: CREATE TABLE IF NOT EXISTS at job start in three files with divergent CHECK definitions (F-14 drift).

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------
- Migrate creates table+CHECK: `bun services/platform/src/cli/holo.ts db:migrate --json && psql "$DATABASE_URL" -tAc "SELECT conname FROM pg_constraint WHERE conrelid='public.backup_heartbeat'::regclass AND contype='c'"` → Exit 0; output contains backup_heartbeat_status_check
- No runtime CREATE TABLE: `rg -n "CREATE TABLE IF NOT EXISTS backup_heartbeat" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1` → Exit 1 from rg (no matches)
- Seeded migrate integration proof: `PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts` → Exit 0
- Typecheck: `pnpm tsgo --noEmit` → Exit 0
- Lint: `pnpm biome check .` → Exit 0

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------
- Implementer: mastra-implementer
- Reviewer: code-reviewer
- Rationale: Owns platform backup + Drizzle/Postgres schema paths; must land the versioned migration and collapse three runtime DDL sites into migrate-owned schema.
- Proposed by: mastra-planner

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------
- touches_capabilities: [CAP-BAK-01]
- provides: ['backup-heartbeat-migration-owned-schema', 'backup-heartbeat-status-check-constraint']
- consumes: ['holo-db-migrate', 'drizzle-schema-backup-ts']
- boundary_contracts: ['fresh-database-migrate-creates-backup_heartbeat-with-CHECK', 'no-runtime-CREATE-TABLE-drift-between-heartbeat-restic-alerting']

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/db/schema/backup.ts
- services/platform/src/db/migrations/

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
- depends_on: []
- blocks: ['REDHAT-FIX-S27-13']

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
- Finding F-14 HIGH from red-hat-sprint27-20260728T054039Z.md
- tdd_mode skipped (MIGRATION) but requires_seeded_evidence true — real Postgres migrate proof required
- Handoff: dispatch mastra-implementer; reviewer = mastra-reviewer

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-S27-12",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_pre_0029_or_fresh": {
      "description": "Real DATABASE_URL Postgres that will apply 0029 (fresh or already-migrated through 0028)",
      "seed_method": "cli",
      "records": [
        "DATABASE_URL points at live Postgres",
        "holo db:migrate is the sole schema bootstrap for backup_heartbeat"
      ]
    },
    "postgres_table_dropped": {
      "description": "Real Postgres after migrate where test drops public.backup_heartbeat to prove fail-closed path",
      "seed_method": "cli",
      "records": [
        "DROP TABLE IF EXISTS backup_heartbeat",
        "no runtime CREATE TABLE path remains"
      ]
    },
    "source_tree_after_fix": {
      "description": "Working tree after implementer lands 0029 + removes runtime DDL",
      "seed_method": "public_api",
      "records": [
        "services/platform/src/db/migrations/0029_backup_heartbeat.sql exists",
        "heartbeat/restic/alerting no longer CREATE TABLE"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN real Postgres WHEN holo db:migrate applies 0029 THEN backup_heartbeat exists with backup_heartbeat_status_check and invalid status inserts are rejected",
      "verify": "bun services/platform/src/cli/holo.ts db:migrate --json && psql \"$DATABASE_URL\" -tAc \"SELECT conname FROM pg_constraint WHERE conrelid='public.backup_heartbeat'::regclass AND contype='c'\" | rg -q backup_heartbeat_status_check",
      "primary": true,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres",
        "topology": "single-node",
        "flow_ref": "T-PLAT-021",
        "negative_control": {
          "would_fail_if": [
            "0029 missing/unjournaled",
            "table without CHECK",
            "migrate faked without Postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_pre_0029_or_fresh",
            "action": {
              "actor": "operator",
              "steps": [
                "Run holo db:migrate",
                "Inspect constraints",
                "INSERT invalid status"
              ]
            },
            "end_state": {
              "must_observe": [
                "backup_heartbeat exists",
                "backup_heartbeat_status_check present",
                "invalid status rejected"
              ],
              "must_not_observe": [
                "table missing",
                "invalid status accepted"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN post-fix source WHEN grepping runtime DDL THEN zero CREATE TABLE IF NOT EXISTS backup_heartbeat outside migrations",
      "verify": "rg -n \"CREATE TABLE IF NOT EXISTS backup_heartbeat\" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "filesystem-source",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "heartbeat/restic still CREATE TABLE",
            "forked CHECK-less DDL remains"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "source_tree_after_fix",
            "action": {
              "actor": "reviewer",
              "steps": [
                "rg runtime CREATE TABLE",
                "confirm shared import"
              ]
            },
            "end_state": {
              "must_observe": [
                "0 runtime CREATE TABLE matches",
                "0029 owns CREATE TABLE"
              ],
              "must_not_observe": [
                "CREATE TABLE in heartbeat.ts",
                "CREATE TABLE in restic-mirror.ts"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN dropped backup_heartbeat WHEN upsert/ensure runs THEN fail closed with migrate guidance (no silent CHECK-less recreate)",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "Postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "silent recreate without CHECK",
            "fake success without table"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_table_dropped",
            "action": {
              "actor": "system",
              "steps": [
                "DROP TABLE",
                "upsert heartbeat",
                "assert error"
              ]
            },
            "end_state": {
              "must_observe": [
                "fail closed error",
                "mentions migrate or missing table"
              ],
              "must_not_observe": [
                "silent success",
                "CHECK-less recreated table"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN 0029 landed WHEN inspecting journal and tooling THEN journal lists 0029 and tsgo/biome exit 0",
      "verify": "rg -n \"0029_backup_heartbeat\" services/platform/src/db/migrations/meta/_journal.json && pnpm tsgo --noEmit && pnpm biome check .",
      "primary": false,
      "flow_ref": "T-PLAT-021",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "tooling",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "SQL without journal entry",
            "type errors left behind"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "source_tree_after_fix",
            "action": {
              "actor": "reviewer",
              "steps": [
                "check journal",
                "run tsgo",
                "run biome"
              ]
            },
            "end_state": {
              "must_observe": [
                "journal has 0029_backup_heartbeat",
                "tsgo 0",
                "biome 0"
              ],
              "must_not_observe": [
                "journal ends at 0028 only"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "backup_heartbeat table exists after holo db:migrate when 0029 is applied",
      "verify": "bun services/platform/src/cli/holo.ts db:migrate --json && psql \"$DATABASE_URL\" -tAc \"SELECT to_regclass('public.backup_heartbeat')\" | rg -q backup_heartbeat",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "backup_heartbeat_status_check rejects status values outside the allowed set",
      "verify": "psql \"$DATABASE_URL\" -c \"INSERT INTO backup_heartbeat(job_name,status) VALUES ('tc-poison','poisoned')\" ; test $? -ne 0",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "No CREATE TABLE IF NOT EXISTS backup_heartbeat remains outside migrations/",
      "verify": "rg -n \"CREATE TABLE IF NOT EXISTS backup_heartbeat\" services/platform/src --glob '!**/migrations/**' ; test $? -eq 1",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Missing backup_heartbeat fails closed without silent CHECK-less recreate",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/tests/integration/sprint27-backup-heartbeat-migrate.test.ts",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "meta/_journal.json lists 0029_backup_heartbeat after 0028",
      "verify": "rg -n \"0029_backup_heartbeat\" services/platform/src/db/migrations/meta/_journal.json",
      "maps_to_ac": "AC-4"
    }
  ]
}
-->
