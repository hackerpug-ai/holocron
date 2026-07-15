# D01-03 — `holo stack up/down/status` operator CLI + laptop dev-parity supervisor

## What this does

Implement the holo stack up/down/status operator CLI that orchestrates the four-service stack (Postgres, Mastra, scheduler pending, zero-cache) with real health probes, enabling one-command deployment on mini and laptop with dev/prod parity under the same config contract.

Provides: holo stack up command that orchestrates launchd units, holo stack down command that cleanly exits services, holo stack status command that reports health for all services, Laptop dev-parity supervisor that boots same config contract as mini.

## Why

- Scheduler is skipped honestly (Sprint 11 owns it) - not included in stack up health count
- Zero-cache is included if launched, excluded if disabled - status reflects reality
- Stack supervisor uses launchd units when available (mini) or direct process when unavailable (laptop)
- MUST implement holo stack up command in services/platform/src/cli/holo.ts switch statement
- MUST implement holo stack down command that cleanly exits all services
- Grounded in: UC-PLAT-05, T-PLAT-015

## How to verify

- `time bun services/platform/src/cli/holo.ts stack up` → Exit 0 within 60 seconds; pg_isready exits 0; curl http://localhost:4111/health returns 200
- `bun services/platform/src/cli/holo.ts stack down && launchctl list | grep holocron | wc -l | grep -q '^0$' && ps aux | grep -E 'postgres|mastra' | grep -v grep | wc -l | grep -q '^0$'` → Exit 0 (zero PIDs, zero orphaned processes)
- `bun services/platform/src/cli/holo.ts stack status | grep -q 'postgres.*healthy' && bun services/platform/src/cli/holo.ts stack status | grep -q 'scheduler.*pending'` → Exit 0 (postgres healthy, scheduler pending - never scheduler healthy)
- `DATABASE_URL=postgres://localhost:5432/holocron_dev bun services/platform/src/cli/holo.ts stack up` → Exit 0 (same command works on laptop with different DATABASE_URL)
- `mastra_pid=$(launchctl list | grep holocron-mastra | awk '{print $1}'); kill $mastra_pid; sleep 1; bun services/platform/src/cli/holo.ts stack up; curl -f http://localhost:4111/health` → Exit 0 (stack up restarts Mastra, /health returns 200, new PID != killed PID)

## Scope

Writes: services/platform/src/cli/holo.ts (MODIFY - add stack:up, stack:down, stack:status cases) · services/platform/src/stack/ (NEW - stack supervisor module if extracted from holo.ts) · services/platform/src/stack/__tests__/ (NEW - stack supervisor tests if not in D01-01 RED suite)

Prohibited: app/** (MODIFY - not this sprint) · holocron-mcp/** (MODIFY - not this sprint) · services/platform/src/db/** (MODIFY - Sprint 04 owns schema) · services/platform/src/mastra/** (MODIFY - Sprint 05 owns service composition) · ~/Library/LaunchAgents/holocron-*.plist (MODIFY - D01-02 owns plist files)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-03 — `holo stack up/down/status` operator CLI + laptop dev-parity supervisor
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (180 min)
AGENT:      implementer=devops-engineer | reviewer=code-reviewer
PROPOSED-BY: devops-engineer
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: True)
CAPABILITY: N/A
SPRINT:     [Sprint 6 — Headless Deployment and Dev/Prod Parity](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
Implement the holo stack up/down/status operator CLI that orchestrates the four-service stack (Postgres, Mastra, scheduler pending, zero-cache) with real health probes, enabling one-command deployment on mini and laptop with dev/prod parity under the same config contract.
holo stack up launches and verifies health of Postgres, Mastra, zero-cache (if configured) within 60 seconds; holo stack status reports honest health (scheduler pending); holo stack down exits cleanly with zero orphaned PIDs; the same commands work on both mini and laptop reading from consolidated secrets (D01-04) with environment-abstract config - all verified with real services and real health probes, not mocked.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST implement holo stack up command in services/platform/src/cli/holo.ts switch statement
- MUST implement holo stack down command that cleanly exits all services
- MUST implement holo stack status command that reports health for Postgres, Mastra, zero-cache (if running), scheduler (honestly pending)
- MUST use real health probes (pg_isready, curl /health, launchctl list) - no mocked health
- MUST work on both mini (uses launchd) and laptop (direct processes) under same config contract
- MUST read config from consolidated secrets source (D01-04) - no hardcoded mini-specific values
- MUST report scheduler as pending/disabled (Sprint 11) - never fake-healthy
- MUST complete stack up within 60 seconds (gate requirement)
- NEVER mock health probes - must use real pg_isready, curl /health, launchctl list
- NEVER report scheduler as healthy - Sprint 11 owns it, must report pending
- NEVER report zero-cache as healthy if not actually launched - status reflects reality
- NEVER hardcode mini-specific config values - must read from environment/secrets
- NEVER use different commands or config structure on mini vs laptop - same holo stack up works everywhere
- NEVER leave orphaned PIDs after stack down - must exit cleanly
- NEVER stub or fake service availability - stack supervisor only reports what's actually running
- STRICTLY holo stack up exits zero only when Postgres + Mastra + zero-cache (if configured) are healthy - scheduler pending is OK
- STRICTLY holo stack down exits cleanly with zero orphaned PIDs (verified by ps aux | grep before/after)
- STRICTLY holo stack status outputs JSON (for --json) and human-readable (default) with service: state pairs
- STRICTLY config contract is portable - same holo stack up works on mini and laptop with only env/secrets values differing
- STRICTLY 60-second timeout is enforced - if services don't become healthy within 60s, stack up fails (not stuck waiting forever)

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1 (PRIMARY): holo stack up orchestrates services with real health probes within 60 seconds
- [ ] AC-2 (PRIMARY): holo stack down exits all services cleanly with zero orphaned PIDs
- [ ] AC-3 (PRIMARY): holo stack status reports honest health for all services
- [ ] AC-4 (PRIMARY): laptop dev-parity: same holo stack command works under portable config contract
- [ ] AC-5 (PRIMARY): kill Mastra mid-run and holo stack up restarts it to healthy with no manual cleanup
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] holo stack up orchestrates services with real health probes within 60 seconds (flow_ref T-PLAT-015)
  GIVEN launchd units exist from D01-02, consolidated secrets from D01-04, Sprint 04 Postgres, Sprint 05 Mastra
  WHEN  operator runs holo stack up
  THEN  Postgres launches and pg_isready succeeds; Mastra launches and curl /health returns 200; zero-cache launches (if configured) or is skipped (if disabled); scheduler is honestly skipped (Sprint 11 pending); all running services report healthy; command exits 0 within 60 seconds of start; no fake-healthy states
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: postgres_mastra_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if stack up stubbed (no real service startup); service health mocked (not real pg_isready/curl probes); launchctl bypassed (services not loaded via launchd); command exits code 0 without services healthy (false pass)
    MUST_OBSERVE: `holo stack up` exits code 0 within 60 seconds; `pg_isready -h localhost -p 5432` exits code 0; `curl -f http://localhost:4111/health` exits code 0; `launchctl list | grep holocron-postgres` prints PID ≠ 0; `launchctl list | grep holocron-mastra` prints PID ≠ 0; `ps aux | grep scheduler` prints 1 process (scheduler running); `ps aux | grep zero-cache` prints 1 process (zero-cache running)
    MUST_NOT_OBSERVE: command exits code 0 without services healthy (false pass); any service PID is 0 (service failed to start); (0) launchctl holocron services (no services loaded)

AC-2 [PRIMARY] holo stack down exits all services cleanly with zero orphaned PIDs (flow_ref T-PLAT-015)
  GIVEN stack is running from AC-1
  WHEN  operator runs holo stack down
  THEN  Postgres exits cleanly; Mastra exits cleanly; zero-cache exits (if running); scheduler remains unloaded; launchctl list shows zero holocron PIDs; ps aux | grep shows zero orphaned postgres/mastra/zerocache processes; command exits 0
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: stack_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if stack down stubbed (no real service shutdown); orphan PIDs remain (services not cleaned up); exit code 0 with services still running (false pass)
    MUST_OBSERVE: `holo stack down` exits code 0 within 30 seconds; `launchctl list | grep holocron-postgres` returns (0) matches; `launchctl list | grep holocron-mastra` returns (0) matches; `pg_isready -h localhost -p 5432` exits code ≠ 0 (Postgres stopped); `curl -f http://localhost:4111/health` exits code ≠ 0 (Mastra stopped); `ps aux | grep scheduler` returns (0) processes; `ps aux | grep zero-cache` returns (0) processes
    MUST_NOT_OBSERVE: any holocron service PID ≠ 0 after stack down (orphan); Postgres still listening on :5432 (not stopped); Mastra still responding on :4111 (not stopped)

AC-3 [PRIMARY] holo stack status reports honest health for all services (flow_ref T-PLAT-015)
  GIVEN stack is running from AC-1
  WHEN  operator runs holo stack status
  THEN  Outputs JSON (with --json) or human-readable (default) showing postgres: healthy, mastra: healthy, zerocache: healthy (if running) or disabled, scheduler: pending; all health states reflect real probes (pg_isready, curl /health, launchctl list) - no mocked healthy; exit 0
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: stack_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if status stubbed (static JSON output); health mocked (not real service probes); scheduler reports healthy (Sprint 11 owns it)
    MUST_OBSERVE: `holo stack status` exits code 0; `holo stack status --json | jq -r .postgres` prints "healthy"; `holo stack status --json | jq -r .mastra` prints "healthy"; `holo stack status --json | jq -r .scheduler` prints "pending" (never healthy); `holo stack status --json | jq -r .zero_cache` prints "healthy"; `holo stack status | grep 'postgres.*healthy'` exits code 0; `holo stack status | grep 'mastra.*healthy'` exits code 0
    MUST_NOT_OBSERVE: scheduler prints "healthy" (Sprint 11 owns it); any service prints "unhealthy" when actually healthy (wrong probe); command exits code ≠ 0 (status check failed)

AC-4 [PRIMARY] laptop dev-parity: same holo stack command works under portable config contract (flow_ref T-PLAT-016)
  GIVEN laptop has different environment values (different DATABASE_URL, different fleet endpoints) but same config contract structure as mini
  WHEN  operator runs holo stack up on laptop
  THEN  Same command structure works; config resolves from consolidated secrets using laptop-specific env values; Postgres boots against laptop DATABASE_URL; Mastra boots; stack status shows healthy; no hardcoded mini-specific paths or values - dev/prod parity achieved
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: postgres_mastra_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if laptop config hardcoded (static paths); runtime checks mocked (not real bun/which probes); stack fails to boot on laptop (not portable)
    MUST_OBSERVE: `holo stack up` exits code 0 on laptop; `holo stack status --json | jq -r .postgres` prints "healthy" on laptop; `holo stack status --json | jq -r .mastra` prints "healthy" on laptop; laptop DATABASE_URL is `postgres://localhost:5432/holocron` (mini uses `postgres://mini.tailnet-abc.ts.net:5432/holocron`); laptop config path is `/usr/local/var/postgres` (mini uses `/opt/homebrew/var/postgres`); same 4 services healthy on both hosts (parity achieved)
    MUST_NOT_OBSERVE: stack exits code ≠ 0 on laptop (failed to boot); laptop DATABASE_URL is `postgres://mini.tailnet-abc.ts.net:5432/holocron` (should be `localhost`); (0) healthy services on laptop (boot failed)

AC-5 [PRIMARY] kill Mastra mid-run and holo stack up restarts it to healthy with no manual cleanup (flow_ref T-PLAT-015)
  GIVEN stack is running from AC-1 with Mastra healthy
  WHEN  operator kills Mastra process and runs holo stack up again
  THEN  Mastra is killed (SIGTERM or SIGKILL); stack up detects Mastra not healthy; stack up restarts Mastra; pg_isready still succeeds (Postgres unaffected); curl /health returns 200 after restart; command exits 0; no manual PID cleanup or config changes needed; zero orphaned Mastra PIDs
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: stack_running · evidence: stdout
    NEGATIVE_CONTROL: would fail if restart stubbed (no real kill/restart); orphan PID remains (old process not cleaned up); new PID not created (service fails to restart)
    MUST_OBSERVE: pre-kill: `launchctl list | grep holocron-mastra` prints PID1 ≠ 0; post-kill: `launchctl list | grep holocron-mastra` returns (0) matches; `holo stack up` exits code 0 (restart succeeds); post-restart: `launchctl list | grep holocron-mastra` prints PID2 ≠ 0; PID2 != PID1 (new process, not orphan); `curl -f http://localhost:4111/health` exits code 0 (Mastra healthy)
    MUST_NOT_OBSERVE: PID remains same after restart (orphan not cleaned); PID is 0 after restart (service failed to start); curl exits code ≠ 0 (Mastra not healthy)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/holo.ts (MODIFY - add stack:up, stack:down, stack:status cases)
- services/platform/src/stack/ (NEW - stack supervisor module if extracted from holo.ts)
- services/platform/src/stack/__tests__/ (NEW - stack supervisor tests if not in D01-01 RED suite)
writeProhibited: app/** (MODIFY - not this sprint), holocron-mcp/** (MODIFY - not this sprint), services/platform/src/db/** (MODIFY - Sprint 04 owns schema), services/platform/src/mastra/** (MODIFY - Sprint 05 owns service composition), ~/Library/LaunchAgents/holocron-*.plist (MODIFY - D01-02 owns plist files)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/SPRINT.md:31-43 [Human test deliverable (one-command stack up/down)]
2. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:68-76 [UC-PLAT-05 ACs]
3. /Users/justinrich/Projects/holocron/services/platform/src/cli/holo.ts:all [Existing CLI switch structure (add stack: cases)]
4. /Users/justinrich/Projects/holocron/services/platform/fleet/manifest.json:all [Fleet Role Manifest for health probe paths]
5. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/10-technical-requirements/02-system-components.md:1-32 [Four-service stack shape (C-1 Postgres, C-2 Mastra, C-7 scheduler, C-16 zero-cache)]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- Stack Up Completes Within 60s: `time bun services/platform/src/cli/holo.ts stack up` → Exit 0 within 60 seconds; pg_isready exits 0; curl http://localhost:4111/health returns 200
- Stack Down Exits Cleanly: `bun services/platform/src/cli/holo.ts stack down && launchctl list | grep holocron | wc -l | grep -q '^0$' && ps aux | grep -E 'postgres|mastra' | grep -v grep | wc -l | grep -q '^0$'` → Exit 0 (zero PIDs, zero orphaned processes)
- Stack Status Reports Honest Health: `bun services/platform/src/cli/holo.ts stack status | grep -q 'postgres.*healthy' && bun services/platform/src/cli/holo.ts stack status | grep -q 'scheduler.*pending'` → Exit 0 (postgres healthy, scheduler pending - never scheduler healthy)
- Laptop Dev Parity: `DATABASE_URL=postgres://localhost:5432/holocron_dev bun services/platform/src/cli/holo.ts stack up` → Exit 0 (same command works on laptop with different DATABASE_URL)
- Kill Mastra Restart: `mastra_pid=$(launchctl list | grep holocron-mastra | awk '{print $1}'); kill $mastra_pid; sleep 1; bun services/platform/src/cli/holo.ts stack up; curl -f http://localhost:4111/health` → Exit 0 (stack up restarts Mastra, /health returns 200, new PID != killed PID)

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: stack up uses launchctl load on mini (launchd available) or direct process on laptop (portable); stack up reads config from D01-04 consolidated secrets - no hardcoded values; stack up skips scheduler honestly (Sprint 11 pending) - not an error, not healthy
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: D01-02, D01-04 · Blocks: D01-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-03",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_mastra_running": {
      "description": "Postgres 18 running, Mastra service booted at :4111, scheduler shim exists, zero-cache exists",
      "seed_method": "recorded_external",
      "records": [
        "pg_isready exits code 0 (Postgres listening on :5432)",
        "curl -f http://localhost:4111/health exits code 0 (Mastra healthy)",
        "services/platform/src/scheduler/index.ts exists (scheduler shim)",
        "services/platform/src/zero-cache/index.ts exists (zero-cache entrypoint)"
      ]
    },
    "stack_running": {
      "description": "Full stack running: Postgres, Mastra, scheduler, zero-cache all healthy",
      "seed_method": "recorded_external",
      "records": [
        "launchctl list | grep holocron-postgres prints PID \u2260 0",
        "curl -f http://localhost:4111/health exits code 0",
        "scheduler shim process exists (ps aux | grep scheduler)",
        "zero-cache process exists (ps aux | grep zero-cache)"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN launchd units exist from D01-02, consolidated secrets from D01-04, Sprint 04 Postgres, Sprint 05 Mastra WHEN operator runs holo stack up THEN Postgres launches and pg_isready succeeds; Mastra launches and curl /health returns 200; zero-cache launches (if configured) or is skipped (if disabled); scheduler is honestly skipped (Sprint 11 pending); all running services report healthy; command exits 0 within 60 seconds of start; no fake-healthy states",
      "verify": "bun services/platform/src/cli/holo.ts stack up \u2192 Exit 0 within 60s; pg_isready exits 0; curl http://localhost:4111/health returns 200; launchctl list shows PIDs",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "stack up stubbed (no real service startup)",
            "service health mocked (not real pg_isready/curl probes)",
            "launchctl bypassed (services not loaded via launchd)",
            "command exits code 0 without services healthy (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_mastra_running",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack up` on mini",
                "wait for stack to report healthy",
                "verify all 4 services running"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo stack up` exits code 0 within 60 seconds",
                "`pg_isready -h localhost -p 5432` exits code 0",
                "`curl -f http://localhost:4111/health` exits code 0",
                "`launchctl list | grep holocron-postgres` prints PID \u2260 0",
                "`launchctl list | grep holocron-mastra` prints PID \u2260 0",
                "`ps aux | grep scheduler` prints 1 process (scheduler running)",
                "`ps aux | grep zero-cache` prints 1 process (zero-cache running)"
              ],
              "must_not_observe": [
                "command exits code 0 without services healthy (false pass)",
                "any service PID is 0 (service failed to start)",
                "(0) launchctl holocron services (no services loaded)"
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
      "description": "GIVEN stack is running from AC-1 WHEN operator runs holo stack down THEN Postgres exits cleanly; Mastra exits cleanly; zero-cache exits (if running); scheduler remains unloaded; launchctl list shows zero holocron PIDs; ps aux | grep shows zero orphaned postgres/mastra/zerocache processes; command exits 0",
      "verify": "bun services/platform/src/cli/holo.ts stack down \u2192 Exit 0; launchctl list | grep holocron \u2192 zero PIDs; ps aux | grep -E 'postgres|mastra|zerocache' | grep -v grep \u2192 zero matches",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "stack down stubbed (no real service shutdown)",
            "orphan PIDs remain (services not cleaned up)",
            "exit code 0 with services still running (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_running",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack down` on mini",
                "verify all 4 services stopped",
                "check for orphan PIDs"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo stack down` exits code 0 within 30 seconds",
                "`launchctl list | grep holocron-postgres` returns (0) matches",
                "`launchctl list | grep holocron-mastra` returns (0) matches",
                "`pg_isready -h localhost -p 5432` exits code \u2260 0 (Postgres stopped)",
                "`curl -f http://localhost:4111/health` exits code \u2260 0 (Mastra stopped)",
                "`ps aux | grep scheduler` returns (0) processes",
                "`ps aux | grep zero-cache` returns (0) processes"
              ],
              "must_not_observe": [
                "any holocron service PID \u2260 0 after stack down (orphan)",
                "Postgres still listening on :5432 (not stopped)",
                "Mastra still responding on :4111 (not stopped)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN stack is running from AC-1 WHEN operator runs holo stack status THEN Outputs JSON (with --json) or human-readable (default) showing postgres: healthy, mastra: healthy, zerocache: healthy (if running) or disabled, scheduler: pending; all health states reflect real probes (pg_isready, curl /health, launchctl list) - no mocked healthy; exit 0",
      "verify": "bun services/platform/src/cli/holo.ts stack status \u2192 Exit 0; output shows postgres=healthy, mastra=healthy, scheduler=pending; --json outputs valid JSON",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "status stubbed (static JSON output)",
            "health mocked (not real service probes)",
            "scheduler reports healthy (Sprint 11 owns it)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_running",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack status` on mini",
                "verify health output",
                "check JSON output format"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo stack status` exits code 0",
                "`holo stack status --json | jq -r .postgres` prints \"healthy\"",
                "`holo stack status --json | jq -r .mastra` prints \"healthy\"",
                "`holo stack status --json | jq -r .scheduler` prints \"pending\" (never healthy)",
                "`holo stack status --json | jq -r .zero_cache` prints \"healthy\"",
                "`holo stack status | grep 'postgres.*healthy'` exits code 0",
                "`holo stack status | grep 'mastra.*healthy'` exits code 0"
              ],
              "must_not_observe": [
                "scheduler prints \"healthy\" (Sprint 11 owns it)",
                "any service prints \"unhealthy\" when actually healthy (wrong probe)",
                "command exits code \u2260 0 (status check failed)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-016",
      "description": "GIVEN laptop has different environment values (different DATABASE_URL, different fleet endpoints) but same config contract structure as mini WHEN operator runs holo stack up on laptop THEN Same command structure works; config resolves from consolidated secrets using laptop-specific env values; Postgres boots against laptop DATABASE_URL; Mastra boots; stack status shows healthy; no hardcoded mini-specific paths or values - dev/prod parity achieved",
      "verify": "On laptop: DATABASE_URL=postgres://localhost:5432/holocron_dev bun services/platform/src/cli/holo.ts stack up \u2192 Exit 0; pg_isready exits 0; /health returns 200",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-016",
        "negative_control": {
          "would_fail_if": [
            "laptop config hardcoded (static paths)",
            "runtime checks mocked (not real bun/which probes)",
            "stack fails to boot on laptop (not portable)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_mastra_running",
            "action": {
              "actor": "operator",
              "steps": [
                "run `holo stack up` on laptop",
                "wait for stack to report healthy",
                "compare with mini stack output"
              ]
            },
            "end_state": {
              "must_observe": [
                "`holo stack up` exits code 0 on laptop",
                "`holo stack status --json | jq -r .postgres` prints \"healthy\" on laptop",
                "`holo stack status --json | jq -r .mastra` prints \"healthy\" on laptop",
                "laptop DATABASE_URL is `postgres://localhost:5432/holocron` (mini uses `postgres://mini.tailnet-abc.ts.net:5432/holocron`)",
                "laptop config path is `/usr/local/var/postgres` (mini uses `/opt/homebrew/var/postgres`)",
                "same 4 services healthy on both hosts (parity achieved)"
              ],
              "must_not_observe": [
                "stack exits code \u2260 0 on laptop (failed to boot)",
                "laptop DATABASE_URL is `postgres://mini.tailnet-abc.ts.net:5432/holocron` (should be `localhost`)",
                "(0) healthy services on laptop (boot failed)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN stack is running from AC-1 with Mastra healthy WHEN operator kills Mastra process and runs holo stack up again THEN Mastra is killed (SIGTERM or SIGKILL); stack up detects Mastra not healthy; stack up restarts Mastra; pg_isready still succeeds (Postgres unaffected); curl /health returns 200 after restart; command exits 0; no manual PID cleanup or config changes needed; zero orphaned Mastra PIDs",
      "verify": "mastra_pid=$(launchctl list | grep holocron-mastra | awk '{print $1}'); kill $mastra_pid; sleep 1; bun services/platform/src/cli/holo.ts stack up \u2192 Exit 0; curl http://localhost:4111/health returns 200; launchctl list shows new Mastra PID (different from killed one)",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "restart stubbed (no real kill/restart)",
            "orphan PID remains (old process not cleaned up)",
            "new PID not created (service fails to restart)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "stack_running",
            "action": {
              "actor": "operator",
              "steps": [
                "capture Mastra PID (launchctl list | grep holocron-mastra)",
                "kill -9 <mastra-pid> (simulate crash)",
                "run `holo stack up` (restart)",
                "verify new Mastra PID"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-kill: `launchctl list | grep holocron-mastra` prints PID1 \u2260 0",
                "post-kill: `launchctl list | grep holocron-mastra` returns (0) matches",
                "`holo stack up` exits code 0 (restart succeeds)",
                "post-restart: `launchctl list | grep holocron-mastra` prints PID2 \u2260 0",
                "PID2 != PID1 (new process, not orphan)",
                "`curl -f http://localhost:4111/health` exits code 0 (Mastra healthy)"
              ],
              "must_not_observe": [
                "PID remains same after restart (orphan not cleaned)",
                "PID is 0 after restart (service failed to start)",
                "curl exits code \u2260 0 (Mastra not healthy)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "holo stack up completes within 60 seconds with all services healthy",
      "maps_to_ac": "AC-1",
      "verify": "time bun services/platform/src/cli/holo.ts stack up completes within 60s and exits 0; pg_isready exits 0; /health returns 200"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "holo stack down exits cleanly with zero orphaned PIDs",
      "maps_to_ac": "AC-2",
      "verify": "bun services/platform/src/cli/holo.ts stack down exits 0; launchctl list shows zero holocron PIDs; ps aux shows zero orphaned processes"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "holo stack status outputs honest health states",
      "maps_to_ac": "AC-3",
      "verify": "bun services/platform/src/cli/holo.ts stack status exits 0 and shows postgres=healthy, mastra=healthy, scheduler=pending; --json outputs valid JSON"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Same holo stack command works on laptop with portable config",
      "maps_to_ac": "AC-4",
      "verify": "On laptop with laptop DATABASE_URL: bun services/platform/src/cli/holo.ts stack up exits 0; services boot against laptop config"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Kill Mastra mid-run and stack up restarts it to healthy",
      "maps_to_ac": "AC-5",
      "verify": "Kill Mastra PID; run holo stack up; exits 0; new Mastra PID appears; /health returns 200"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Scheduler is reported as pending, never healthy",
      "maps_to_ac": "AC-1",
      "verify": "bun services/platform/src/cli/holo.ts stack status shows scheduler=pending; never scheduler=healthy"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "Stack up fails if services don't become healthy within 60 seconds",
      "maps_to_ac": "AC-1",
      "verify": "Kill Postgres; run holo stack up; command fails (nonzero exit) after 60s timeout instead of hanging forever"
    }
  ]
}
-->
</details>