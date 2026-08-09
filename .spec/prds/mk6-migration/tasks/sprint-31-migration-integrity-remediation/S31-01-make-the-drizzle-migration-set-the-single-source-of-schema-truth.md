# S31-01: Make the Drizzle migration set the single source of schema truth

> **Task ID:** S31-01
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** MIGRATION · **Priority:** P0 · **Effort:** M · **Estimate:** 300 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `skipped` · **REQUIRES_SEEDED_EVIDENCE:** yes
> **Status:** Backlog

**Capabilities:** CAP-MIG-01, CAP-CUT-01, CAP-BAK-01, CAP-INF-01
**PRD refs:** UC-PLAT-01, UC-DATA-01, UC-INFER-04, R26, R30

## What this does

Makes the Drizzle migration files the sole, complete description of the database. Renumbers the two files that collide on ordinal `0030`, adds a fail-closed uniqueness and contiguity check to the migration runner, applies the two migrations that were never applied, and converts six places where application code creates tables at runtime into real migrations — including `degraded_mode` and `retry_queue`, whose absence on a fresh database makes the budgeted-escape guard silently refuse every escape.

## Why

A restored database is rebuilt from these files alone. Today two files share the `0030_` prefix and nothing checks for that, `drizzle_migrations` has 29 rows against 33 files, and six modules create their own tables at boot — one of which (`degraded-mode-controller.ts`) manufactures a `research_mission` table that makes `holo db:verify --merges` fail with 4 `research_*` tables. The migration set and the live database have quietly diverged, which is a recovery-path defect, not a tidiness one (risk R26).

## How to verify

- `cd services/platform && bun src/cli/holo.ts db:migrate --json` against a freshly provisioned empty namespace exits 0 and leaves one `drizzle_migrations` row per `.sql` file.
- `cd services/platform && bun src/cli/holo.ts db:verify --merges --json` exits 0 reporting exactly 3 `research_*` tables.
- `PLATFORM_IT=1 pnpm test:integration` passes, including the new ordinal-gate, no-runtime-DDL, escape-guard and queue-schema suites.

## Scope

Touches the migrations directory, the migration runner, and the six runtime-DDL call sites in `queue/`, `backup/` and `inference/`. Scheduler enablement (S31-02), the fencing-token rewrite (S31-03) and every other sprint are out of scope.

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-01 - Make the Drizzle migration set the single source of schema truth
================================================================================

TASK_TYPE:  MIGRATION
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
AGENT_RATIONALE: mastra-implementer owns services/platform and is the only agent carrying both the Drizzle migration contract and the queue/degraded-mode module context; a devops agent would not know queue/schema.ts shadows migration 0010 with a divergent shape.
PROPOSED-BY: mastra-planner

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: AC-1..AC-5 TDD_STATE none · 0/5 complete

--------------------------------------------------------------------------------
OUTCOME (1 sentence, <=30 words — observable success)
--------------------------------------------------------------------------------

A database rebuilt from the migration files alone is structurally identical to the live one, and no production module issues DDL at runtime.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- NEVER paper over the silent-refuse by defaulting the escape guard to allow OR to refuse when the degraded_mode row is missing — a missing row is a loud named error (DEGRADED_MODE_ROW_MISSING).
- NEVER edit an already-applied migration file in place to fix drift; the live DB carries its hash. Add a forward migration.
- NEVER codify the divergent runtime shape as a new migration — queue/schema.ts is reconciled TO migration 0010 (3 missing CHECKs, 2 missing indexes, the whole GRANT block), never the reverse.
- NEVER leave a CREATE TABLE / CREATE INDEX / GRANT reachable from a production code path after this task.
- NEVER mock Postgres, the migration runner, or node:fs; every assertion runs against a real namespace from holo db:provision-nonprod (a test that can reach production Postgres is the R24 violation).

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] A fresh namespace migrated from files alone has one drizzle_migrations row per .sql file, exactly 3 research_* tables, a seeded degraded_mode row and a retry_queue table — maps to AC-1 (PRIMARY)
- [ ] A duplicate ordinal or an ordinal gap makes db:migrate exit non-zero BEFORE applying anything — maps to AC-2
- [ ] The platform runs with CREATE revoked from holocron_app, and the six named files carry zero DDL — maps to AC-3
- [ ] A missing degraded_mode row raises DEGRADED_MODE_ROW_MISSING; a present row yields a real allow/deny decision — maps to AC-4
- [ ] The migrated queue schema carries 0010's 6 CHECKs, both extra indexes and the holocron_app grants — maps to AC-5
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only SCOPE.writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Database built from migrations alone is complete [PRIMARY]
  GIVEN: a freshly provisioned empty nonprod namespace with 0 public BASE TABLEs and no seed script
  WHEN:  the operator runs holo db:migrate --json then holo db:verify --merges --json
  THEN:  every .sql file is applied exactly once, exactly 3 research_* tables exist, degraded_mode holds 1 row

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-migration-truth.test.ts
  TEST_FUNCTION: freshNamespaceMigratesToCompleteSchema

  SCENARIO:
    START_REF:        fresh_db_from_migrations
    NEGATIVE_CONTROL: would fail if empty database | stub migration runner | mock postgres client | static table list | disconnect from postgres
    EVIDENCE:         db_query
    CASES:
      - ACTION:           assert 0 BASE TABLEs, run db:migrate --json as a real child process, count .sql files on disk, run db:verify --merges --json
        MUST_OBSERVE:     db:migrate exit 0 · drizzle_migrations count == on-disk .sql count (34) · DISTINCT hash count == 34 · BASE TABLE count >= 55 · exactly 3 research_* tables · degraded_mode count 1 · to_regclass('public.retry_queue') non-null
        MUST_NOT_OBSERVE: (0 rows) from drizzle_migrations · 4+ research_* tables · to_regclass('public.degraded_mode') NULL

AC-2: Ordinal collision and gap fail the runner closed
  GIVEN: a migrations tree with two 0033_ files and a missing 0034 ordinal
  WHEN:  holo db:migrate --json runs against it
  THEN:  exit 2 with ORDINAL_COLLISION and ORDINAL_GAP, and 0 migrations applied

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-migration-truth.test.ts
  TEST_FUNCTION: ordinalGateRefusesCollisionAndGap

AC-3: The platform operates with no runtime DDL privilege
  GIVEN: a migrated database with CREATE revoked from holocron_app on schema public
  WHEN:  queue, jobs, backup-heartbeat and degraded-mode paths run via their real CLI entrypoints
  THEN:  all succeed, no SQLSTATE 42501 is raised, and the six files carry 0 DDL statements

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts
  TEST_FUNCTION: platformOperatesWithoutCreatePrivilege

AC-4: A missing degraded_mode row fails loudly
  GIVEN: a migrated database whose single global degraded_mode row was deleted
  WHEN:  a budgeted escape is requested through its real entrypoint
  THEN:  DEGRADED_MODE_ROW_MISSING is raised and 0 budget-ledger rows are written

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-escape-guard-row.test.ts
  TEST_FUNCTION: escapeGuardFailsLoudlyWithoutRow

AC-5: Migrated queue schema matches migration 0010
  GIVEN: a database built from migrations alone with queue/schema.ts ENSURE_SQL deleted
  WHEN:  the queue constraint, index and grant inventory is read from pg_catalog
  THEN:  0010's 6 CHECKs, both extra indexes and the holocron_app grants are all present

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  postgres
  TDD_STATE:     none
  TEST_FILE:     services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts
  TEST_FUNCTION: queueSchemaMatchesMigration0010

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/db/migrations/*.sql (NEW)
- services/platform/src/db/migrations/meta/_journal.json (MODIFY)
- services/platform/src/db/migrate.ts (MODIFY)
- services/platform/src/queue/schema.ts (MODIFY)
- services/platform/src/queue/durable-effect.ts (MODIFY)
- services/platform/src/queue/jobs-runner.ts (MODIFY)
- services/platform/src/backup/heartbeat.ts (MODIFY)
- services/platform/src/backup/wal-archive.ts (MODIFY)
- services/platform/src/inference/degraded-mode-controller.ts (MODIFY)
- services/platform/tests/integration/sprint31-migration-truth.test.ts (NEW)
- services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts (NEW)
- services/platform/tests/integration/sprint31-escape-guard-row.test.ts (NEW)
- services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts (NEW)
- .tmp/S31-01/** (NEW)

writeProhibited:
- services/platform/src/db/migrations/0000_*.sql .. 0029_*.sql (in-place edits) — already applied on the live DB; editing diverges the file from its recorded hash and corrupts the restore path
- convex/** — decommission target; no schema truth may be re-homed there
- services/platform/deploy/launchd/** — service enablement is S31-02's surface
- .spec/prds/mk6-migration/** — the PRD is the spec of record
- Any file not explicitly listed above

--------------------------------------------------------------------------------
BOUNDARIES (✅ Always / ⚠️ Ask First) — Never tier lives at CRITICAL CONSTRAINTS above
--------------------------------------------------------------------------------

✅ Always:
- Add a forward migration rather than amending an applied one.
- Give every new migration a unique contiguous ordinal and --> statement-breakpoint separators matching house style.
- Reconcile drift TOWARD the declared migration shape (0010), never toward the runtime shape.
- Run every test against a disposable namespace from holo db:provision-nonprod.

⚠️ Ask First:
- Any change to how drizzle_migrations records a renamed file (the live DB already carries the OLD filename hash — silently re-running a PONR or publication migration is the failure mode).
- Dropping or altering an existing column on a table that Zero replicates.

--------------------------------------------------------------------------------
DELIVERABLE
--------------------------------------------------------------------------------

- services/platform/src/db/migrate.ts (MODIFY): pre-apply ordinal uniqueness + contiguity gate, exposed as its own CI-callable check (R26 requires CI enforcement, not just runner enforcement)
- services/platform/src/db/migrations/*.sql (NEW): the 0030 renumber plus forward migrations for degraded_mode, retry_queue, backup_wal_burst and the queue-shape reconciliation
- services/platform/src/queue/schema.ts (MODIFY): ENSURE_SQL deleted after reconciliation
- services/platform/src/inference/degraded-mode-controller.ts (MODIFY): DDL removed; reads and UPDATEs the migrated row only
- 4 integration test files (NEW)

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

TDD_MODE is `skipped` (MIGRATION task): RED evidence is not required, but requires_seeded_evidence is TRUE — every AC still proves itself against a real provisioned namespace with the captured db_query artifact.

Sequence the work so each stage is independently verifiable:
  1. Ordinal gate + the 0030 renumber (+ journal/drizzle_migrations reconciliation)
  2. Apply the two unapplied migrations
  3. Forward migrations reconciling queue / outbox / job_runs / backup / degraded_mode / retry_queue to their declared shapes
  4. Delete the runtime ENSURE_SQL blocks LAST, so the database is already correct when the safety net is removed

--------------------------------------------------------------------------------
READING LIST (max 5 files — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/db/migrations/0010_queue_leased.sql [PRIMARY PATTERN]
   - Lines: 1-113
   - Focus: the AUTHORITATIVE declared shape — 6 CHECK constraints, 5 indexes, and the conditional DO $grants$ block. This is the shape queue/schema.ts is reconciled TO, and the house style every new migration should imitate.

2. services/platform/src/db/migrate.ts
   - Lines: 42-108
   - Focus: listMigrationFiles sorts filenames lexically with no uniqueness or contiguity check; drizzle_migrations is keyed on the FILENAME at line 98 — where the gate belongs, and why a bare rename re-applies a file.

3. services/platform/src/queue/schema.ts
   - Lines: 7-93
   - Focus: ENSURE_SQL shadowing 0010 with a divergent shape; withQueueSql's ensureQueueSchema call at line 88 is the hook every queue API goes through.

4. services/platform/src/inference/degraded-mode-controller.ts
   - Lines: 110-165
   - Focus: creates degraded_mode, research_mission and retry_queue at runtime and seeds the global row. research_mission is why db:verify --merges sees 4 research_* tables.

5. services/platform/src/db/verify.ts
   - Lines: 60-125
   - Focus: the merges verifier asserting exactly 3 research_* tables and the system discriminator — the oracle AC-1 leans on.

--------------------------------------------------------------------------------
EVIDENCE GATES (fast/cheap first — fail fast)
--------------------------------------------------------------------------------

Gate 1: Seeded evidence
  Required: every AC captured its db_query / stdout artifact under .tmp/S31-01/.

Gate 2: Each AC has a test
  Verify: the 4 test files contain one test per AC.

Gate 3: All tests pass
  Command: PLATFORM_IT=1 pnpm test:integration
  Expected: Exit 0.

Gate 4: Type check
  Command: pnpm tsgo --noEmit
  Expected: Exit 0.

Gate 5: Lint
  Command: pnpm biome check .
  Expected: Exit 0.

Gate 6: Scope compliance
  Command: git diff --name-only
  Expected: Only SCOPE.writeAllowed files modified.

Gate 7: Integration/E2E coverage
  Verify: AC-1 (PRIMARY) is TEST_TIER integration against real Postgres.

Gate 8: Scenario is un-fakeable (PRIMARY)
  Verify: validate_scenario.py passes on the embedded contract (exit 0).
  Verify: the captured artifact shows the seeded values (34 migration rows, 3 research_* tables, 1 degraded_mode row) — not merely "Exit 0".
  Reject: a PRIMARY test that passes against an empty database or a stubbed runner.

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Every new migration is one forward .sql file with a unique contiguous ordinal and --> statement-breakpoint separators matching the house style in services/platform/src/db/migrations/0010_queue_leased.sql.
- Runtime modules import table types from services/platform/src/db/schema and issue DML only; a DDL keyword in a non-migration source file is a review failure.
- Named error codes are string literal unions, not free-form messages: DEGRADED_MODE_ROW_MISSING, ORDINAL_COLLISION, ORDINAL_GAP.
- Tests connect through services/platform/src/db/client.ts against a namespace from holo db:provision-nonprod; a hardcoded production DATABASE_URL is a review failure (R24).
- Reference: brain/docs/kanban/SCENARIO-CONTRACT-V1.md, brain/docs/TESTING-HIERARCHY.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Enabling the scheduler LaunchAgent or wiring the queue consumer (S31-02 owns deploy/launchd and supervisor.ts).
- The monotonic fencing-token rewrite inside durable-effect.ts (S31-03) — this task only removes that file's DDL.
- Extending FK enforcement to every domain table — explicitly deferred in 01-scope.md (Operator decision 2026-08-07).
- Re-running the ETL. The archive is immutable; this task rebuilds schema, never data.

--------------------------------------------------------------------------------
CONTEXT (read if unclear)
--------------------------------------------------------------------------------

**Current state:** 33 migration files with two sharing the 0030_ ordinal, 29 drizzle_migrations rows, and 6 modules creating tables at runtime — one manufacturing research_mission, which breaks db:verify --merges.

**Gap:** A database restored from the files alone is not the database that is running, and on a fresh DB the escape guard finds no degraded_mode row and silently refuses every budgeted escape.

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass (<=5, evidence-gate-backed):
- One test per AC; every AC proves itself against a real provisioned namespace
- No CREATE TABLE / CREATE INDEX / GRANT survives in a non-migration source file
- No already-applied migration file was edited in place
- Pattern consistent with READING LIST [PRIMARY PATTERN] (0010's declared shape)
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Should verify (<=5, judgment):
- The renamed 0030 file cannot re-run against a database carrying the old hash
- The ordinal gate is callable from CI, not only from the runner (R26)
- DEGRADED_MODE_ROW_MISSING is a typed error, not a message string
- No test hardcodes a production DATABASE_URL (R24)

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: (none)
Blocks:     S31-02 (migrated schema), S31-03 (token column), S31-07 (telemetry columns)
Parallel:   S31-04, S31-06

--------------------------------------------------------------------------------
REQUIREMENT-CONTRACT v1 (machine-readable)
--------------------------------------------------------------------------------
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-01",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "fresh_db_from_migrations": {
      "description": "An empty disposable Postgres namespace with 0 public BASE TABLEs, populated exclusively by the real migration runner.",
      "seed_method": "cli",
      "records": [
        "`holo db:provision-nonprod --json` creates a namespace whose public schema has 0 BASE TABLEs",
        "`holo db:migrate --json` applies every file under services/platform/src/db/migrations in ordinal order",
        "no seed script and no ensure-schema helper runs at any point"
      ]
    },
    "colliding_ordinal_tree": {
      "description": "A harness-scoped copy of the migrations directory carrying 1 duplicate ordinal and 1 gap.",
      "seed_method": "migration_fixture",
      "records": [
        "a copy of services/platform/src/db/migrations under .tmp/S31-01/migrations-collide/",
        "2 files sharing ordinal 0033: 0033_alpha_probe.sql and 0033_beta_probe.sql, each a valid no-op SELECT 1",
        "a deliberate gap: no 0034_*.sql present while 0035_gap_probe.sql exists"
      ]
    },
    "degraded_row_deleted": {
      "description": "fresh_db_from_migrations with the single global degraded_mode row removed.",
      "seed_method": "cli",
      "records": [
        "fresh_db_from_migrations applied in full",
        "DELETE FROM degraded_mode executed through the real src/db/client.ts connection",
        "SELECT count(*) FROM degraded_mode returns 0 before the guard is invoked"
      ]
    },
    "app_role_ddl_revoked": {
      "description": "fresh_db_from_migrations with CREATE revoked from holocron_app on schema public.",
      "seed_method": "cli",
      "records": [
        "fresh_db_from_migrations applied in full",
        "REVOKE CREATE ON SCHEMA public FROM holocron_app executed as the owner role",
        "the platform connects as holocron_app for the duration of the case"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "GIVEN a freshly provisioned empty nonprod namespace with 0 public BASE TABLEs WHEN the operator runs holo db:migrate then holo db:verify --merges THEN every migration file is applied exactly once, exactly 3 research_* tables exist, and degraded_mode holds its seeded row",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts",
      "scenario": {
        "id": "S31-01-AC-1",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "empty database",
            "stub migration runner",
            "mock postgres client",
            "static table list",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_db_from_migrations",
            "action": {
              "actor": "operator",
              "steps": [
                "Assert `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'` returns `0` BEFORE migrating",
                "Run `cd services/platform && bun src/cli/holo.ts db:migrate --json` as a real child process and capture exit code and stdout",
                "Count `.sql` files under services/platform/src/db/migrations from the real filesystem",
                "Run `cd services/platform && bun src/cli/holo.ts db:verify --merges --json` against the same namespace"
              ]
            },
            "end_state": {
              "must_observe": [
                "`db:migrate` exit code `0`",
                "`SELECT count(*) FROM drizzle_migrations` returns `34`, equal to the on-disk `.sql` file count",
                "`SELECT count(DISTINCT hash) FROM drizzle_migrations` returns `34`",
                "public BASE TABLE count is at least `55`",
                "exactly `3` rows match `table_name LIKE 'research\\_%'`",
                "`SELECT count(*) FROM degraded_mode` returns `1`",
                "`to_regclass('public.retry_queue')` is non-null",
                "`db:verify --merges` exit code `0`"
              ],
              "must_not_observe": [
                "`(0 rows)` from `drizzle_migrations`",
                "`4` or more tables matching `research\\_%`",
                "`to_regclass('public.degraded_mode')` returning `NULL`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN a migrations tree with 2 files at ordinal 0033 and a missing 0034 WHEN holo db:migrate runs THEN it exits 2 with ORDINAL_COLLISION and ORDINAL_GAP and applies nothing",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts",
      "scenario": {
        "id": "S31-01-AC-2",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "cli",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub ordinal check",
            "static pass verdict",
            "mock filesystem",
            "removed gate"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "colliding_ordinal_tree",
            "action": {
              "actor": "operator",
              "steps": [
                "Copy the real migrations directory to `.tmp/S31-01/migrations-collide/` and add `0033_alpha_probe.sql`, `0033_beta_probe.sql` and `0035_gap_probe.sql`",
                "Run `cd services/platform && bun src/cli/holo.ts db:migrate --json` as a real child process with the migrations dir override",
                "Query `drizzle_migrations` on the target namespace immediately after the process exits"
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit code `2`",
                "stdout `errors[]` contains code `ORDINAL_COLLISION` naming `0033_alpha_probe.sql` and `0033_beta_probe.sql`",
                "stdout `errors[]` contains code `ORDINAL_GAP` naming ordinal `0034`",
                "`SELECT count(*) FROM drizzle_migrations` returns `0`"
              ],
              "must_not_observe": [
                "exit code `0`",
                "a non-empty `migrationsApplied` array",
                "a `drizzle_migrations` row for `0033_alpha_probe.sql`"
              ]
            }
          },
          {
            "start_ref": "fresh_db_from_migrations",
            "action": {
              "actor": "operator",
              "steps": [
                "Run `cd services/platform && bun src/cli/holo.ts db:migrate --json` against the real post-renumber migrations directory"
              ]
            },
            "end_state": {
              "must_observe": [
                "process exit code `0`",
                "`0` `ORDINAL_COLLISION` entries in `errors[]`",
                "`0` `ORDINAL_GAP` entries in `errors[]`",
                "`migrationsApplied.length` equals `34`"
              ],
              "must_not_observe": [
                "two files sharing the `0030_` prefix in the applied list",
                "`(0 rows)` from `drizzle_migrations` after a clean apply"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN a migrated database with CREATE revoked from holocron_app WHEN the queue, jobs, backup and degraded-mode paths run through their real CLI entrypoints THEN all succeed with no SQLSTATE 42501 and the six source files carry 0 DDL statements",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts",
      "scenario": {
        "id": "S31-01-AC-3",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub queue writer",
            "mock postgres",
            "empty job registry",
            "disconnect from postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "app_role_ddl_revoked",
            "action": {
              "actor": "system",
              "steps": [
                "Connect as `holocron_app` after `REVOKE CREATE ON SCHEMA public`",
                "Run `cd services/platform && bun src/cli/holo.ts queue:effect --key ddl-probe-1 --json`",
                "Run `cd services/platform && bun src/cli/holo.ts jobs:run-all --json`",
                "Run `cd services/platform && bun src/cli/holo.ts backup:status --json` so the heartbeat writer executes",
                "Run `cd services/platform && bun src/cli/holo.ts infer:degraded --json` so the degraded-mode controller reads and writes its row",
                "Scan the six named source files for `CREATE TABLE`, `CREATE INDEX` and `GRANT `"
              ]
            },
            "end_state": {
              "must_observe": [
                "`queue_effects` holds exactly `1` row for key `ddl-probe-1`",
                "`job_runs` gains `16` rows for the emitted `run_id`",
                "`backup_heartbeat` has at least `1` row updated inside the case window",
                "`degraded_mode` still holds exactly `1` row with an advanced `updated_at`",
                "`0` occurrences of `CREATE TABLE`, `CREATE INDEX` or `GRANT ` across the six named source files"
              ],
              "must_not_observe": [
                "`SQLSTATE 42501` in the captured stderr of any of the `4` CLI invocations",
                "a `research_mission` table appearing after `infer:degraded` runs",
                "`(0 rows)` from `job_runs` for the emitted `run_id`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN a migrated database whose degraded_mode row was deleted WHEN a budgeted escape is requested THEN the call fails loudly with DEGRADED_MODE_ROW_MISSING and writes 0 ledger rows, while the seeded row yields a real decision",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-escape-guard-row.test.ts",
      "scenario": {
        "id": "S31-01-AC-4",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub guard",
            "empty degraded table",
            "static allow verdict",
            "mock ledger"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "degraded_row_deleted",
            "action": {
              "actor": "system",
              "steps": [
                "Assert `SELECT count(*) FROM degraded_mode` returns `0` before the call",
                "Invoke the budgeted escape through its real entrypoint with an explicit `allowEscape` declaration and capture the thrown error"
              ]
            },
            "end_state": {
              "must_observe": [
                "an error whose code is `DEGRADED_MODE_ROW_MISSING`",
                "the error message names `degraded_mode`",
                "budget-ledger escape rows written for the run: `0`"
              ],
              "must_not_observe": [
                "a plain `false` return with no error code",
                "an allowed escape recorded against the ledger",
                "a successful outbound request to the escape provider"
              ]
            }
          },
          {
            "start_ref": "fresh_db_from_migrations",
            "action": {
              "actor": "system",
              "steps": [
                "Assert `SELECT count(*) FROM degraded_mode` returns `1` (seeded by the new migration)",
                "Set `degraded_state` to `normal` through the real controller entrypoint",
                "Invoke the same budgeted escape with an explicit `allowEscape` declaration and a permitting ceiling"
              ]
            },
            "end_state": {
              "must_observe": [
                "the guard returns a decision object naming `degraded_mode`",
                "the decision derives from persisted `degraded_state` = `normal`",
                "exactly `1` budget-ledger row written with a non-null `reason`"
              ],
              "must_not_observe": [
                "`DEGRADED_MODE_ROW_MISSING`",
                "`(0 rows)` from the budget ledger for the run"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "GIVEN a database built from migrations alone WHEN the queue constraint, index and grant inventory is read from pg_catalog THEN it matches migration 0010 and queue/schema.ts carries 0 CREATE TABLE statements",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts",
      "scenario": {
        "id": "S31-01-AC-5",
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "stub schema ensure",
            "empty catalog query",
            "static constraint list",
            "mock postgres"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "fresh_db_from_migrations",
            "action": {
              "actor": "system",
              "steps": [
                "Query `pg_constraint` for `contype='c'` on `queue_jobs` and collect `conname` values",
                "Query `pg_indexes` for `tablename IN ('queue_jobs','queue_dlq')` and collect `indexname` values",
                "Query `information_schema.role_table_grants` for `grantee='holocron_app'` on the three queue tables",
                "Scan services/platform/src/queue/schema.ts for `CREATE TABLE`"
              ]
            },
            "end_state": {
              "must_observe": [
                "`conname` set contains `queue_jobs_priority_nonneg`, `queue_jobs_attempts_nonneg` and `queue_jobs_max_attempts_pos`",
                "`indexname` set contains `queue_jobs_lease_expires_idx` and `queue_dlq_created_at_idx`",
                "`role_table_grants` for `holocron_app` on `queue_jobs` contains all `4` of SELECT, INSERT, UPDATE, DELETE",
                "`0` occurrences of `CREATE TABLE` in services/platform/src/queue/schema.ts"
              ],
              "must_not_observe": [
                "a `queue_jobs` CHECK-constraint set of size `2`",
                "`(0 rows)` from `role_table_grants` for `holocron_app` on `queue_jobs`"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "On a namespace with 0 public BASE TABLEs before migration, holo db:migrate --json exits 0.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After holo db:migrate, the drizzle_migrations row count equals the on-disk .sql file count.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After migrating a fresh namespace, holo db:verify --merges --json exits 0.",
      "verify": "cd services/platform && bun src/cli/holo.ts db:verify --merges --json"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After migrating a fresh namespace, holo db:verify --merges --json reports exactly 3 research_* tables.",
      "verify": "cd services/platform && bun src/cli/holo.ts db:verify --merges --json"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After migrating a fresh namespace, SELECT count(*) FROM degraded_mode returns 1.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "maps_to_ac": "AC-1",
      "description": "After migrating a fresh namespace, to_regclass('public.retry_queue') is non-null.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "A migrations tree containing two files with the 0033_ prefix makes holo db:migrate exit 2 with an ORDINAL_COLLISION error naming both filenames.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "After an ORDINAL_COLLISION refusal, drizzle_migrations on the target namespace holds 0 rows.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "maps_to_ac": "AC-2",
      "description": "A migrations tree with 0035_gap_probe.sql and no 0034_ file makes holo db:migrate exit 2 with an ORDINAL_GAP error naming ordinal 0034.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-migration-truth.test.ts"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "With CREATE revoked from holocron_app, all four CLI invocations exit 0.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "With CREATE revoked from holocron_app, no CLI invocation emits SQLSTATE 42501.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "A scan of the six named source files finds 0 occurrences of CREATE TABLE, CREATE INDEX and GRANT.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts"
    },
    {
      "id": "TC-13",
      "type": "test_criterion",
      "maps_to_ac": "AC-3",
      "description": "After holo infer:degraded runs against a migrated database, the count of tables matching research_% is 3.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-no-runtime-ddl.test.ts"
    },
    {
      "id": "TC-14",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "With degraded_mode holding 0 rows, the budgeted-escape entrypoint raises an error whose code is DEGRADED_MODE_ROW_MISSING.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-escape-guard-row.test.ts"
    },
    {
      "id": "TC-15",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "With degraded_mode holding 0 rows, the budgeted-escape entrypoint writes 0 budget-ledger escape rows.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-escape-guard-row.test.ts"
    },
    {
      "id": "TC-16",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "With the migration-seeded degraded_mode row present and degraded_state normal, the budgeted-escape entrypoint returns an explicit decision object.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-escape-guard-row.test.ts"
    },
    {
      "id": "TC-17",
      "type": "test_criterion",
      "maps_to_ac": "AC-4",
      "description": "With the migration-seeded degraded_mode row present and degraded_state normal, the budgeted-escape entrypoint writes exactly 1 budget-ledger row.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-escape-guard-row.test.ts"
    },
    {
      "id": "TC-18",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "On a migrated database, pg_constraint contype c on queue_jobs includes queue_jobs_priority_nonneg, queue_jobs_attempts_nonneg and queue_jobs_max_attempts_pos.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts"
    },
    {
      "id": "TC-19",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "On a migrated database, pg_indexes contains queue_jobs_lease_expires_idx and queue_dlq_created_at_idx.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts"
    },
    {
      "id": "TC-20",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "information_schema.role_table_grants shows holocron_app holding SELECT, INSERT, UPDATE and DELETE on queue_jobs on a migrated database.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts"
    },
    {
      "id": "TC-21",
      "type": "test_criterion",
      "maps_to_ac": "AC-5",
      "description": "services/platform/src/queue/schema.ts contains 0 occurrences of the string CREATE TABLE.",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-queue-schema-reconciled.test.ts"
    }
  ]
}
-->

</details>
