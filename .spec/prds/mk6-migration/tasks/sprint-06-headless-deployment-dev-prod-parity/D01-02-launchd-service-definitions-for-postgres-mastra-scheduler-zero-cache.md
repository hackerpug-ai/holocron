# D01-02 — launchd service definitions for Postgres/Mastra/scheduler/zero-cache

## What this does

Create launchd service definitions for the four-service stack (Postgres, Mastra, scheduler, zero-cache) so launchctl can load and manage their lifecycle with keepalive, enabling the stack supervisor (D01-03) to orchestrate them.

Provides: launchd plist files for Postgres, Mastra, scheduler (disabled), zero-cache, keepalive process management (restart on crash), launchctl loadable service units that survive reboot.

## Why

- Scheduler plist is explicitly disabled/pending (Sprint 11 owns scheduler) - not loaded by default
- Zero-cache plist either launches real zero-cache against Sprint-04 Postgres OR is disabled with honest documentation - never fake-healthy
- All launchd units use absolute paths - no relative PATH依赖
- MUST create ~/Library/LaunchAgents/holocron-postgres.plist (loads Postgres 18 from Sprint 04)
- MUST create ~/Library/LaunchAgents/holocron-mastra.plist (calls bun services/platform/src/cli/holo.ts service:up)
- Grounded in: UC-PLAT-05, T-PLAT-015

## How to verify

- `test -f ~/Library/LaunchAgents/holocron-postgres.plist && test -f ~/Library/LaunchAgents/holocron-mastra.plist && test -f ~/Library/LaunchAgents/holocron-scheduler.plist && test -f ~/Library/LaunchAgents/holocron-zerocache.plist && plutil -lint ~/Library/LaunchAgents/holocron-*.plist` → Exit 0 (all files exist and are valid XML)
- `launchctl load ~/Library/LaunchAgents/holocron-postgres.plist ~/Library/LaunchAgents/holocron-mastra.plist && launchctl list | grep holocron | grep -q 'PID' && pg_isready && curl -f http://localhost:4111/health` → Exit 0 (services loaded and answering)
- `postgres_pid=$(launchctl list | grep holocron-postgres | awk '{print $1}'); kill $postgres_pid; sleep 2; launchctl list | grep holocron-postgres | awk '{print $1}' | grep -v $postgres_pid` → Exit 0 (new PID != killed PID)
- `grep -A2 '<key>Disabled</key>' ~/Library/LaunchAgents/holocron-scheduler.plist | grep -q '<true/>'` → Exit 0 (scheduler has Disabled=true)

## Scope

Writes: ~/Library/LaunchAgents/holocron-postgres.plist (NEW) · ~/Library/LaunchAgents/holocron-mastra.plist (NEW) · ~/Library/LaunchAgents/holocron-scheduler.plist (NEW - disabled) · ~/Library/LaunchAgents/holocron-zerocache.plist (NEW - either enabled or disabled)

Prohibited: services/platform/src/cli/holo.ts (MODIFY - only D01-03 adds stack: commands, this task only creates plists) · services/platform/src/db/** (MODIFY - Sprint 04 owns Postgres schema) · services/platform/src/mastra/** (MODIFY - Sprint 05 owns Mastra service) · /usr/local/var/postgres (MODIFY - Postgres data directory is Sprint 04's concern)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-02 — launchd service definitions for Postgres/Mastra/scheduler/zero-cache
================================================================================

TASK_TYPE:  INFRA
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   skipped     RED_GREEN_REQUIRED: no     (requires_seeded_evidence: True)
CAPABILITY: N/A
SPRINT:     [Sprint 6 — Headless Deployment and Dev/Prod Parity](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Create launchd service definitions for the four-service stack (Postgres, Mastra, scheduler, zero-cache) so launchctl can load and manage their lifecycle with keepalive, enabling the stack supervisor (D01-03) to orchestrate them.
Four launchd plist files exist at ~/Library/LaunchAgents/holocron-{postgres,mastra,scheduler,zerocache}.plist; postgres and mastra load and run successfully; scheduler is explicitly disabled (Sprint 11 owns it); zero-cache either launches successfully or is honestly disabled; launchctl list shows the loaded services with their PIDs; services restart on crash (KeepAlive=true) - all verified against real launchd, not mocked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST create ~/Library/LaunchAgents/holocron-postgres.plist (loads Postgres 18 from Sprint 04)
- MUST create ~/Library/LaunchAgents/holocron-mastra.plist (calls bun services/platform/src/cli/holo.ts service:up)
- MUST create ~/Library/LaunchAgents/holocron-scheduler.plist (disabled - Sprint 11 owns scheduler, marked Disabled=true)
- MUST create ~/Library/LaunchAgents/holocron-zerocache.plist (either loads zero-cache against zero_pub OR explicitly disabled with documentation)
- MUST use absolute paths to binaries (postgres, bun) and data directories (PGDATA)
- MUST set KeepAlive=true for postgres and mastra (restart on crash)
- MUST set RunAtLoad=true for services that should start at login (postgres, mastra)
- MUST set StandardOutPath/StandardErrorPath to logfiles in /var/log or ~/Library/Logs
- MUST verify launchd units load successfully via launchctl load (integration test, not unit mock)
- NEVER use relative paths in plist files - PATH is undefined in launchd context
- NEVER set the scheduler plist to enabled - Sprint 11 owns scheduler, it MUST be disabled
- NEVER set zero-cache plist to report healthy if zero-cache isn't actually launched - either real or honestly disabled
- NEVER stub or mock launchctl behavior - verification must use real macOS launchctl
- NEVER assume environment variables from shell profile - launchd runs with clean env, set EnvironmentVariables in plist
- NEVER hardcode mini-specific paths - use $HOME or absolute portable paths
- STRICTLY scheduler plist has <key>Disabled</key><true/> - Sprint 11 fills this slot
- STRICTLY verification runs launchctl load/unload/list against real macOS launchd - no fake launchctl
- STRICTLY zero-cache is either launched for real (consumes zero_pub from Sprint 04 Postgres) OR explicitly disabled - no in-between
- STRICTLY plist files are valid XML (plutil -lint validates)
- STRICTLY all services that should start at boot (postgres, mastra) have RunAtLoad=true

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): launchd plist files exist for all four services with correct paths and keepalive
- [ ] AC-2 (PRIMARY): launchd units load successfully and services start with real process verification
- [ ] AC-3: zero-cache plist integrates with Sprint-04 zero_pub publication OR is honestly disabled
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] launchd plist files exist for all four services with correct paths and keepalive (flow_ref T-PLAT-015)
  GIVEN Sprint 04 Postgres and Sprint 05 Mastra are installed
  WHEN  operator creates launchd plist files
  THEN  ~/Library/LaunchAgents/holocron-postgres.plist loads Postgres 18; ~/Library/LaunchAgents/holocron-mastra.plist loads Mastra via bun services/platform/src/cli/holo.ts service:up; ~/Library/LaunchAgents/holocron-scheduler.plist exists but is disabled (Sprint 11); ~/Library/LaunchAgents/holocron-zerocache.plist exists (either enabled with zero_pub slot or disabled); all use absolute paths and have KeepAlive=true for running services
  TEST_TIER: integration · VERIFICATION_SERVICE: macOS-launchd · TDD_STATE: red
  SCENARIO — start_ref: plist_files_created · evidence: file_artifact
    NEGATIVE_CONTROL: would fail if plist files use relative paths (omitted absolute paths - launchd PATH undefined); plist files don't exist at ~/Library/LaunchAgents/ (deleted or not created); plist files malformed (plutil exits ≠ 0, XML corrupted); postgres/mastra plist omit KeepAlive=true (no restart on crash); scheduler plist not explicitly disabled (Sprint 11 owns it); fake launchctl stubbed (not real macOS launchd - mocked exit code 0)
    MUST_OBSERVE: 4 plist files exist: ls ~/Library/LaunchAgents/holocron-*.plist returns 4 files; plutil -lint exits code 0 for all 4 plist files; launchctl list | grep holocron-postgres prints PID ≠ 0 (if loaded); launchctl list | grep holocron-mastra prints PID ≠ 0 (if loaded); launchctl list | grep holocron-scheduler prints (0) PIDs (disabled); plutil -p holocron-postgres.plist contains KeepAlive = 1; plutil -p holocron-mastra.plist contains KeepAlive = 1; plutil -p holocron-scheduler.plist contains Disabled = 1; grep -c '../bin' ~/Library/LaunchAgents/holocron-*.plist returns 0 (no relative paths)
    MUST_NOT_OBSERVE: any plist file missing (test -f exits code ≠ 0); plutil -lint exits code ≠ 0 (malformed XML); scheduler plist loaded with PID ≠ 0 (Sprint 11 owns it); postgres or mastra plist missing KeepAlive = 1; relative paths present: grep -c '../bin' returns ≥1

AC-2 [PRIMARY] launchd units load successfully and services start with real process verification (flow_ref T-PLAT-015)
  GIVEN plist files exist from AC-1
  WHEN  operator runs launchctl load and verifies processes
  THEN  launchctl load succeeds for postgres and mastra; launchctl list shows their PIDs; pg_isready succeeds against postgres; curl /health succeeds against mastra; processes restart on crash (kill PID and observe KeepAlive restart); scheduler remains disabled; zero-cache either runs or is honestly disabled
  TEST_TIER: integration · VERIFICATION_SERVICE: macOS-launchd · TDD_STATE: red
  SCENARIO — start_ref: plist_files_created · evidence: process_state
    NEGATIVE_CONTROL: would fail if launchctl load fails (plist malformed - paths stubbed); services don't start (binaries not at absolute paths - static paths); KeepAlive doesn't restart killed process (omitted KeepAlive key); pg_isready fails (postgres stubbed - always exits 0); /health fails (mastra stubbed - always returns HTTP 200); scheduler starts running with PID ≠ 0 (Sprint 11 owns it - should be disabled)
    MUST_OBSERVE: launchctl load postgres plist exits code 0; launchctl load mastra plist exits code 0; launchctl list | grep holocron-postgres prints PID ≠ 0; launchctl list | grep holocron-mastra prints PID ≠ 0; pg_isready exits code 0; curl http://localhost:4111/health returns HTTP 200; after kill postgres: launchctl list | grep holocron-postgres prints PID ≠ killed_pid (KeepAlive restarted); after kill mastra: launchctl list | grep holocron-mastra prints PID ≠ killed_pid (KeepAlive restarted); launchctl list | grep holocron-scheduler prints (0) PIDs (disabled)
    MUST_NOT_OBSERVE: launchctl load exits code ≠ 0 (plist or path error); pg_isready exits code ≠ 0 (postgres not answering); curl /health fails (mastra not answering); KeepAlive doesn't restart: PID unchanged after kill; scheduler PID ≠ 0 (Sprint 11 owns it); zero-cache healthy when not actually launched

AC-3 zero-cache plist integrates with Sprint-04 zero_pub publication OR is honestly disabled (flow_ref T-PLAT-015)
  GIVEN Sprint 04 Postgres has zero_pub publication configured
  WHEN  operator creates zero-cache plist with zero_pub slot
  THEN  zero-cache plist loads zero-cache binary configured to consume zero_pub logical replication slot; launchctl list shows holocron-zerocache with PID; OR zero-cache is explicitly disabled with documentation in plist comments explaining why (if zero-cache binary/wiring genuinely unavailable this sprint) - never fake-healthy
  TEST_TIER: integration · VERIFICATION_SERVICE: macOS-launchd+zero-cache · TDD_STATE: red
  SCENARIO — start_ref: postgres_with_zero_pub_publication · evidence: process_state
    NEGATIVE_CONTROL: would fail if zero-cache plist reports healthy but zero-cache binary doesn't exist (fake health - mocked PID); zero-cache plist not configured for zero_pub slot (omitted connection string); zero-cache plist enabled but launchctl load fails (binary path stubbed); zero-cache plist disabled without honest documentation (why disabled omitted); fake zero-cache logs (static 'consuming zero_pub' without real process)
    MUST_OBSERVE: zero_pub publication exists: SELECT returns 1 row; if enabled: launchctl list | grep holocron-zerocache prints PID ≠ 0; if enabled: tail -n 20 /var/log/zerocache.log | grep -c zero_pub returns ≥1; if enabled: tail -n 20 /var/log/zerocache.log | grep -c postgres returns ≥1 (connected to postgres hostname); if disabled: plutil -p holocron-zerocache.plist contains Disabled = 1; if disabled: grep -c 'Sprint 20' ~/Library/LaunchAgents/holocron-zerocache.plist returns ≥1
    MUST_NOT_OBSERVE: if enabled: launchctl load exits code ≠ 0 (binary missing); if enabled: zero-cache PID ≠ 0 but logs grep -c zero_pub returns 0 (not consuming); if enabled: plist enabled but zero_pub missing from Postgres (SELECT returns 0); if disabled: plist enabled (Disabled key omitted OR Disabled = 0); if disabled: grep -c 'Sprint 20' returns (0) (no explanation)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- ~/Library/LaunchAgents/holocron-postgres.plist (NEW)
- ~/Library/LaunchAgents/holocron-mastra.plist (NEW)
- ~/Library/LaunchAgents/holocron-scheduler.plist (NEW - disabled)
- ~/Library/LaunchAgents/holocron-zerocache.plist (NEW - either enabled or disabled)
writeProhibited: services/platform/src/cli/holo.ts (MODIFY - only D01-03 adds stack: commands, this task only creates plists), services/platform/src/db/** (MODIFY - Sprint 04 owns Postgres schema), services/platform/src/mastra/** (MODIFY - Sprint 05 owns Mastra service), /usr/local/var/postgres (MODIFY - Postgres data directory is Sprint 04's concern)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/02-system-components.md:1-32 [Four-service stack shape (C-1 Postgres, C-2 Mastra, C-7 scheduler, C-16 zero-cache)]
2. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/09-capability-chains.md:54-61 [CAP-SYNC-01 zero-cache consumes zero_pub logical replication]
3. /Users/justinrich/Projects/holocron/services/platform/src/cli/holo.ts:581-597 [service:up command that launchd plist calls]
4. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/01-architecture-posture.md:35-38 [AP-7 tailnet trust boundary (single-user, NO RLS, NO multi-tenant - config-hygiene scope, not tenant isolation)]
5. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:44-49 [T-PLAT-015/016/017]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Plist Files Created and Valid: `test -f ~/Library/LaunchAgents/holocron-postgres.plist && test -f ~/Library/LaunchAgents/holocron-mastra.plist && test -f ~/Library/LaunchAgents/holocron-scheduler.plist && test -f ~/Library/LaunchAgents/holocron-zerocache.plist && plutil -lint ~/Library/LaunchAgents/holocron-*.plist` → Exit 0 (all files exist and are valid XML)
- Services Load and Start: `launchctl load ~/Library/LaunchAgents/holocron-postgres.plist ~/Library/LaunchAgents/holocron-mastra.plist && launchctl list | grep holocron | grep -q 'PID' && pg_isready && curl -f http://localhost:4111/health` → Exit 0 (services loaded and answering)
- KeepAlive Restarts Killed Process: `postgres_pid=$(launchctl list | grep holocron-postgres | awk '{print $1}'); kill $postgres_pid; sleep 2; launchctl list | grep holocron-postgres | awk '{print $1}' | grep -v $postgres_pid` → Exit 0 (new PID != killed PID)
- Scheduler Explicitly Disabled: `grep -A2 '<key>Disabled</key>' ~/Library/LaunchAgents/holocron-scheduler.plist | grep -q '<true/>'` → Exit 0 (scheduler has Disabled=true)

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: Postgres plist MUST use absolute paths to postgres binary and PGDATA - launchd has no PATH; Mastra plist calls bun services/platform/src/cli/holo.ts service:up - orchestrates the same binary D01-03 uses; Scheduler plist is disabled (Sprint 11 owns scheduler) - D01-03 stack supervisor skips it honestly
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: D01-03, D01-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-02",
  "proposed_by": "devops-engineer",
  "tdd_mode": "skipped",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": false,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_mastra_installed": {
      "description": "Sprint 04 Postgres and Sprint 05 Mastra are installed with known binary paths",
      "seed_method": "recorded_external",
      "records": [
        "postgres binary exists at /usr/local/bin/postgres (or brew prefix)",
        "PGDATA directory exists at /usr/local/var/postgres (or brew prefix)",
        "bun binary exists at ~/.bun/bin/bun",
        "services/platform/src/cli/holo.ts exists with service:up command (grep -c 'service:up' returns 1)",
        "postgres --version returns 'postgres 18'"
      ]
    },
    "postgres_with_zero_pub_publication": {
      "description": "Sprint 04 Postgres has zero_pub logical replication publication configured",
      "seed_method": "recorded_external",
      "records": [
        "Postgres wal_level=logical (SHOW wal_level returns 'logical')",
        "zero_pub publication exists: SELECT 1 FROM pg_publication WHERE pubname='zero_pub' returns 1 row",
        "zero_pub publishes reactive subset (not all tables)",
        "SELECT count(*) FROM pg_publication_tables WHERE pubname='zero_pub' returns \u22651 table"
      ]
    },
    "plist_files_created": {
      "description": "Launchd plist files have been created at ~/Library/LaunchAgents/ with correct content",
      "seed_method": "recorded_external",
      "records": [
        "test -f ~/Library/LaunchAgents/holocron-postgres.plist exits code 0",
        "test -f ~/Library/LaunchAgents/holocron-mastra.plist exits code 0",
        "test -f ~/Library/LaunchAgents/holocron-scheduler.plist exits code 0",
        "test -f ~/Library/LaunchAgents/holocron-zerocache.plist exits code 0",
        "plutil -p ~/Library/LaunchAgents/holocron-postgres.plist contains KeepAlive = 1",
        "plutil -p ~/Library/LaunchAgents/holocron-postgres.plist contains RunAtLoad = 1",
        "plutil -p ~/Library/LaunchAgents/holocron-scheduler.plist contains Disabled = 1"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN Sprint 04 Postgres and Sprint 05 Mastra are installed WHEN operator creates launchd plist files THEN ~/Library/LaunchAgents/holocron-postgres.plist loads Postgres 18; ~/Library/LaunchAgents/holocron-mastra.plist loads Mastra via bun services/platform/src/cli/holo.ts service:up; ~/Library/LaunchAgents/holocron-scheduler.plist exists but is disabled (Sprint 11); ~/Library/LaunchAgents/holocron-zerocache.plist exists (either enabled with zero_pub slot or disabled); all use absolute paths and have KeepAlive=true for running services",
      "verify": "test -f ~/Library/LaunchAgents/holocron-postgres.plist && test -f ~/Library/LaunchAgents/holocron-mastra.plist && test -f ~/Library/LaunchAgents/holocron-scheduler.plist && test -f ~/Library/LaunchAgents/holocron-zerocache.plist && plutil -lint ~/Library/LaunchAgents/holocron-*.plist \u2192 Exit 0; launchctl list | grep holocron \u2192 shows postgres, mastra loaded (scheduler disabled)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "macOS-launchd",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "plist files use relative paths (omitted absolute paths - launchd PATH undefined)",
            "plist files don't exist at ~/Library/LaunchAgents/ (deleted or not created)",
            "plist files malformed (plutil exits \u2260 0, XML corrupted)",
            "postgres/mastra plist omit KeepAlive=true (no restart on crash)",
            "scheduler plist not explicitly disabled (Sprint 11 owns it)",
            "fake launchctl stubbed (not real macOS launchd - mocked exit code 0)"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "plist_files_created",
            "action": {
              "actor": "operator",
              "steps": [
                "run test -f ~/Library/LaunchAgents/holocron-postgres.plist",
                "run test -f ~/Library/LaunchAgents/holocron-mastra.plist",
                "run test -f ~/Library/LaunchAgents/holocron-scheduler.plist",
                "run test -f ~/Library/LaunchAgents/holocron-zerocache.plist",
                "run plutil -lint ~/Library/LaunchAgents/holocron-*.plist",
                "run launchctl list | grep holocron"
              ]
            },
            "end_state": {
              "must_observe": [
                "4 plist files exist: ls ~/Library/LaunchAgents/holocron-*.plist returns 4 files",
                "plutil -lint exits code 0 for all 4 plist files",
                "launchctl list | grep holocron-postgres prints PID \u2260 0 (if loaded)",
                "launchctl list | grep holocron-mastra prints PID \u2260 0 (if loaded)",
                "launchctl list | grep holocron-scheduler prints (0) PIDs (disabled)",
                "plutil -p holocron-postgres.plist contains KeepAlive = 1",
                "plutil -p holocron-mastra.plist contains KeepAlive = 1",
                "plutil -p holocron-scheduler.plist contains Disabled = 1",
                "grep -c '../bin' ~/Library/LaunchAgents/holocron-*.plist returns 0 (no relative paths)"
              ],
              "must_not_observe": [
                "any plist file missing (test -f exits code \u2260 0)",
                "plutil -lint exits code \u2260 0 (malformed XML)",
                "scheduler plist loaded with PID \u2260 0 (Sprint 11 owns it)",
                "postgres or mastra plist missing KeepAlive = 1",
                "relative paths present: grep -c '../bin' returns \u22651"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN plist files exist from AC-1 WHEN operator runs launchctl load and verifies processes THEN launchctl load succeeds for postgres and mastra; launchctl list shows their PIDs; pg_isready succeeds against postgres; curl /health succeeds against mastra; processes restart on crash (kill PID and observe KeepAlive restart); scheduler remains disabled; zero-cache either runs or is honestly disabled",
      "verify": "launchctl load ~/Library/LaunchAgents/holocron-postgres.plist ~/Library/LaunchAgents/holocron-mastra.plist \u2192 Exit 0; launchctl list shows PIDs; pg_isready \u2192 Exit 0; /health \u2192 HTTP 200; kill postgres PID; sleep 2; launchctl list | grep holocron-postgres \u2192 new PID (KeepAlive restarted)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "macOS-launchd",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "launchctl load fails (plist malformed - paths stubbed)",
            "services don't start (binaries not at absolute paths - static paths)",
            "KeepAlive doesn't restart killed process (omitted KeepAlive key)",
            "pg_isready fails (postgres stubbed - always exits 0)",
            "/health fails (mastra stubbed - always returns HTTP 200)",
            "scheduler starts running with PID \u2260 0 (Sprint 11 owns it - should be disabled)"
          ]
        },
        "evidence": {
          "artifact_type": "process_state",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "plist_files_created",
            "action": {
              "actor": "operator",
              "steps": [
                "run launchctl load ~/Library/LaunchAgents/holocron-postgres.plist",
                "run launchctl load ~/Library/LaunchAgents/holocron-mastra.plist",
                "run launchctl list | grep holocron",
                "run pg_isready",
                "run curl http://localhost:4111/health",
                "kill postgres PID; sleep 2; run launchctl list | grep holocron-postgres"
              ]
            },
            "end_state": {
              "must_observe": [
                "launchctl load postgres plist exits code 0",
                "launchctl load mastra plist exits code 0",
                "launchctl list | grep holocron-postgres prints PID \u2260 0",
                "launchctl list | grep holocron-mastra prints PID \u2260 0",
                "pg_isready exits code 0",
                "curl http://localhost:4111/health returns HTTP 200",
                "after kill postgres: launchctl list | grep holocron-postgres prints PID \u2260 killed_pid (KeepAlive restarted)",
                "after kill mastra: launchctl list | grep holocron-mastra prints PID \u2260 killed_pid (KeepAlive restarted)",
                "launchctl list | grep holocron-scheduler prints (0) PIDs (disabled)"
              ],
              "must_not_observe": [
                "launchctl load exits code \u2260 0 (plist or path error)",
                "pg_isready exits code \u2260 0 (postgres not answering)",
                "curl /health fails (mastra not answering)",
                "KeepAlive doesn't restart: PID unchanged after kill",
                "scheduler PID \u2260 0 (Sprint 11 owns it)",
                "zero-cache healthy when not actually launched"
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
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN Sprint 04 Postgres has zero_pub publication configured WHEN operator creates zero-cache plist with zero_pub slot THEN zero-cache plist loads zero-cache binary configured to consume zero_pub logical replication slot; launchctl list shows holocron-zerocache with PID; OR zero-cache is explicitly disabled with documentation in plist comments explaining why (if zero-cache binary/wiring genuinely unavailable this sprint) - never fake-healthy",
      "verify": "launchctl load ~/Library/LaunchAgents/holocron-zerocache.plist \u2192 Exit 0 (if enabled) OR Disabled=true (if disabled); if enabled: launchctl list | grep holocron-zerocache \u2192 PID; zero-cache logs show consuming zero_pub slot; if disabled: plist has Disabled=true and comments explaining Sprint 20",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "macOS-launchd+zero-cache",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "zero-cache plist reports healthy but zero-cache binary doesn't exist (fake health - mocked PID)",
            "zero-cache plist not configured for zero_pub slot (omitted connection string)",
            "zero-cache plist enabled but launchctl load fails (binary path stubbed)",
            "zero-cache plist disabled without honest documentation (why disabled omitted)",
            "fake zero-cache logs (static 'consuming zero_pub' without real process)"
          ]
        },
        "evidence": {
          "artifact_type": "process_state",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_with_zero_pub_publication",
            "action": {
              "actor": "operator",
              "steps": [
                "run SELECT 1 FROM pg_publication WHERE pubname='zero_pub' (returns 1)",
                "run test -f ~/Library/LaunchAgents/holocron-zerocache.plist",
                "if enabled: run launchctl load ~/Library/LaunchAgents/holocron-zerocache.plist",
                "if enabled: run launchctl list | grep holocron-zerocache",
                "if enabled: tail -n 20 /var/log/zerocache.log | grep zero_pub",
                "if disabled: grep -c Disabled ~/Library/LaunchAgents/holocron-zerocache.plist returns 1"
              ]
            },
            "end_state": {
              "must_observe": [
                "zero_pub publication exists: SELECT returns 1 row",
                "if enabled: launchctl list | grep holocron-zerocache prints PID \u2260 0",
                "if enabled: tail -n 20 /var/log/zerocache.log | grep -c zero_pub returns \u22651",
                "if enabled: tail -n 20 /var/log/zerocache.log | grep -c postgres returns \u22651 (connected to postgres hostname)",
                "if disabled: plutil -p holocron-zerocache.plist contains Disabled = 1",
                "if disabled: grep -c 'Sprint 20' ~/Library/LaunchAgents/holocron-zerocache.plist returns \u22651"
              ],
              "must_not_observe": [
                "if enabled: launchctl load exits code \u2260 0 (binary missing)",
                "if enabled: zero-cache PID \u2260 0 but logs grep -c zero_pub returns 0 (not consuming)",
                "if enabled: plist enabled but zero_pub missing from Postgres (SELECT returns 0)",
                "if disabled: plist enabled (Disabled key omitted OR Disabled = 0)",
                "if disabled: grep -c 'Sprint 20' returns (0) (no explanation)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "launchd plist files exist and pass plutil validation",
      "maps_to_ac": "AC-1",
      "verify": "test -f ~/Library/LaunchAgents/holocron-{postgres,mastra,scheduler,zerocache}.plist && plutil -lint ~/Library/LaunchAgents/holocron-*.plist exits 0"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "launchd units load and services start successfully",
      "maps_to_ac": "AC-2",
      "verify": "launchctl load ~/Library/LaunchAgents/holocron-{postgres,mastra}.plist exits 0; launchctl list shows PIDs; pg_isready exits 0; /health returns 200"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "KeepAlive restarts killed services",
      "maps_to_ac": "AC-2",
      "verify": "kill postgres PID; sleep 2; launchctl list | grep holocron-postgres shows new PID (not the killed one)"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Scheduler plist is explicitly disabled",
      "maps_to_ac": "AC-1",
      "verify": "grep -A2 '<key>Disabled</key>' ~/Library/LaunchAgents/holocron-scheduler.plist | grep -q '<true/>'"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Zero-cache plist either launches real zero-cache against zero_pub OR is honestly disabled",
      "maps_to_ac": "AC-3",
      "verify": "if enabled: launchctl list | grep holocron-zerocache shows PID; if disabled: plist has Disabled=true with comments"
    }
  ]
}
-->
</details>