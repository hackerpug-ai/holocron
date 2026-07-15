# D01-01 — RED: seeded tests for stack-up health and Convex-env-alias detection

## What this does

Author a comprehensive RED integration suite that proves the stack supervisor, secrets consolidation, and laptop dev-parity behaviors are absent before implementation and present after implementation - the RED suite is the gate that D01-02 through D01-05 must go green against.

Provides: RED suite for stack supervisor lifecycle (up/down/status health detection), RED suite for consolidated secrets resolution and Convex-env-alias detection, RED suite for laptop dev-parity stack boot, RED suite for fleet embed-route health integration.

## Why

- stack supervisor reports honest service health (Postgres + Mastra real; zero-cache real; scheduler pending; never fake-healthy for unbuilt services)
- holo verify-no-convex-env fails when Convex env aliases are reintroduced (grep-based build gate)
- launchd units must load and keepalive services (integration against macOS launchctl, not unit mocks)
- RED tests must drive real stack lifecycle (Postgres, Mastra service, zero-cache binary) - no mocked health probes
- RED tests must invoke real holo CLI commands (stack up/down/status, secrets doctor, verify-no-convex-env) - no stubbed CLI
- Grounded in: UC-PLAT-05, T-PLAT-015

## How to verify

- `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts services/platform/src/cli/__tests__/secrets-hygiene.test.ts services/platform/src/cli/__tests__/dev-parity.test.ts services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts` → Nonzero exit (tests fail - commands don't exist or behavior absent)
- `ls services/platform/src/cli/__tests__/*.test.ts | grep -E 'stack-supervisor|secrets-hygiene|dev-parity|launchd-and-embed-health'` → Exit 0 (4 test files present)

## Scope

Writes: services/platform/src/cli/__tests__/stack-supervisor.test.ts (NEW - RED suite) · services/platform/src/cli/__tests__/secrets-hygiene.test.ts (NEW - RED suite) · services/platform/src/cli/__tests__/dev-parity.test.ts (NEW - RED suite) · services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts (NEW - RED suite) · services/platform/src/cli/__tests__/fixtures/ (NEW - test fixtures if needed)

Prohibited: services/platform/src/cli/holo.ts (MODIFY - only D01-03 implements, RED tests just call it) · app/** (MODIFY - not this sprint) · holocron-mcp/** (MODIFY - not this sprint) · services/platform/src/db/** (MODIFY - Sprint 04 owns schema) · services/platform/src/mastra/** (MODIFY - Sprint 05 owns service composition)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: D01-01 — RED: seeded tests for stack-up health and Convex-env-alias detection
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Completed
PRIORITY:   P0
EFFORT:     S  (60 min)
AGENT:      implementer=red-test-generator | reviewer=code-reviewer
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
Author a comprehensive RED integration suite that proves the stack supervisor, secrets consolidation, and laptop dev-parity behaviors are absent before implementation and present after implementation - the RED suite is the gate that D01-02 through D01-05 must go green against.
The RED test suite fails for every behavioral AC (stack up/down/status, secrets doctor, verify-no-convex-env, laptop dev-parity, embed health) before D01-02/D01-03/D01-04/D01-05 implement those behaviors, and passes after those implementations land - proving the tests validate real behavior, not stubbed success.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST RED tests must drive real stack lifecycle (Postgres, Mastra service, zero-cache binary) - no mocked health probes
- MUST RED tests must invoke real holo CLI commands (stack up/down/status, secrets doctor, verify-no-convex-env) - no stubbed CLI
- MUST RED tests must run against real launchd on macOS for launchd unit load verification - no fake launchd
- MUST Every RED test must fail before implementation and pass after - validates the gate actually works
- MUST RED tests for scheduler must expect disabled/pending state (Sprint 11 owns scheduler) - not fake-healthy
- MUST RED tests for zero-cache must either stand up real zero-cache against Sprint-04 Postgres OR honestly report disabled/not_implemented - never fake-healthy
- NEVER mock or stub service health checks - must probe real Postgres, real Mastra /health, real zero-cache if launched
- NEVER stub holo CLI commands - must invoke the real bun services/platform/src/cli/holo.ts
- NEVER fake launchd behavior - must use real macOS launchctl load/unload/list
- NEVER write RED tests that pass without implementation - that defeats RED/GREEN purpose
- NEVER assert scheduler is healthy when Sprint 11 hasn't built it - must expect pending/disabled
- NEVER write RED tests that grep for Convex env vars in a fake fixture - must scan real repo files
- STRICTLY RED tests are failing integration tests, not unit tests below the surface - they drive the real CLI and real services
- STRICTLY every behavioral AC from D01-02 through D01-05 must have a corresponding RED test case here
- STRICTLY RED test failures must be the evidence that the behavior is absent - if a test passes without impl, it's not a RED test
- STRICTLY the scheduler slot is explicitly marked as pending in tests - Sprint 11 fills it; gate passes for the services that ARE real (Postgres + Mastra + zero-cache)
- STRICTLY zero-cache tests either stand it up for real OR honestly exclude it from the healthy set - no middle ground

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [x] AC-1 (PRIMARY): RED suite for stack supervisor lifecycle (up/down/status) with real health probes
- [x] AC-2 (PRIMARY): RED suite for consolidated secrets and Convex-env-alias detection
- [x] AC-3 (PRIMARY): RED suite for laptop dev-parity stack boot under same config contract
- [x] AC-4 (PRIMARY): RED suite for launchd service definitions and fleet embed-route health integration
- [ ] `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 [PRIMARY] RED suite for stack supervisor lifecycle (up/down/status) with real health probes (flow_ref T-PLAT-015)
  GIVEN Sprint 04 Postgres is running, Sprint 05 Mastra service:up is available, zero-cache binary is available OR explicitly marked as not_implemented
  WHEN  operator runs RED tests before stack supervisor implementation exists
  THEN  RED tests fail: holo stack up does not exist OR reports wrong health state; holo stack down does not exist OR leaves orphaned PIDs; holo stack status does not exist OR reports fake-healthy; after D01-03 implements, tests pass with real Postgres, real Mastra, real zero-cache (if launched), scheduler honestly pending/disabled
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: postgres_mastra_zero_cache_available · evidence: stdout
    NEGATIVE_CONTROL: would fail if stack supervisor stubbed (always returns healthy); service health mocked (not real Postgres/Mastra probes); launchd units omitted (no real services started); pre-impl test exits code 0 (false pass)
    MUST_OBSERVE: pre-impl: `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts` exits code ≠ 0 (nonzero); pre-impl: test prints 4 failing tests (postgres, mastra, scheduler, zero-cache); post-D01-03: same command exits code 0 (all tests pass); post-D01-03: test asserts pg_isready exits code 0; post-D01-03: test asserts curl -f http://localhost:4111/health exits code 0; post-D01-03: test asserts launchctl list | grep holocron prints 4 PIDs ≠ 0
    MUST_NOT_OBSERVE: pre-impl: test exits code 0 (passes without implementation); pre-impl: (0) failing tests (all pass before impl exists); post-D01-03: any service reports unhealthy (stubs)

AC-2 [PRIMARY] RED suite for consolidated secrets and Convex-env-alias detection (flow_ref T-PLAT-017)
  GIVEN repo has Convex env aliases scattered in codebase (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, deploy keys) and no consolidated secrets source exists yet
  WHEN  operator runs RED tests before D01-04 implementation
  THEN  RED tests fail: holo secrets doctor does not exist OR fails to resolve config; holo verify-no-convex-env does not exist OR fails to find existing Convex aliases; after D01-04 implements, tests pass with consolidated secrets resolving and zero Convex env aliases found
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: postgres_mastra_zero_cache_available · evidence: stdout
    NEGATIVE_CONTROL: would fail if secrets doctor stubbed (always exits code 0); DATABASE_URL omitted from config (required key missing); env alias mocked (not real grep of .env files); pre-impl test exits code 0 (false pass)
    MUST_OBSERVE: pre-impl: test exits code ≠ 0 (fails before secrets consolidation); pre-impl: test prints 3 failing tests (secrets doctor, convex env removal, gitignore); post-D01-04: test exits code 0 (all tests pass); post-D01-04: test asserts bun services/platform/src/cli/holo.ts secrets doctor exits code 0; post-D01-04: test asserts output prints `DATABASE_URL: resolved`; post-D01-04: test asserts grep -ri 'CONVEX_URL|HOLOCRON_URL' returns (0) matches
    MUST_NOT_OBSERVE: pre-impl: test exits code 0 (passes without consolidation); post-D01-04: grep finds ≥1 CONVEX_URL or HOLOCRON_URL match (alias remains); post-D01-04: secrets doctor exits code 1 (missing key)

AC-3 [PRIMARY] RED suite for laptop dev-parity stack boot under same config contract (flow_ref T-PLAT-016)
  GIVEN laptop has same config contract structure as mini but different environment values (different DATABASE_URL, different fleet endpoints)
  WHEN  operator runs RED tests on laptop before D01-03 implementation
  THEN  RED tests fail: holo stack up doesn't exist OR doesn't boot on laptop; after D01-03 implements, tests pass with same holo stack up command working on both mini and laptop using config contract, not hardcoded values
  TEST_TIER: integration · VERIFICATION_SERVICE: holo-cli · TDD_STATE: red
  SCENARIO — start_ref: laptop_dev_environment · evidence: stdout
    NEGATIVE_CONTROL: would fail if laptop supervisor stubbed (not real bun/runtime check); config contract mocked (not real services/platform/config/*.yaml read); mini config hardcoded (static values); pre-impl test exits code 0 (false pass)
    MUST_OBSERVE: pre-impl: test exits code ≠ 0 (fails before laptop parity); pre-impl: test prints 2 failing tests (config contract, runtime parity); post-D01-03: test exits code 0 (laptop boots same stack); post-D01-03: test asserts DATABASE_URL value differs between mini and laptop env; post-D01-03: test asserts `holo stack up` exits code 0 on both mini and laptop; post-D01-03: test asserts mini config != laptop config (different paths)
    MUST_NOT_OBSERVE: pre-impl: test exits code 0 (passes without parity); post-D01-03: mini DATABASE_URL == laptop DATABASE_URL (should differ); post-D01-03: (0) healthy services on laptop (stack fails)

AC-4 [PRIMARY] RED suite for launchd service definitions and fleet embed-route health integration (flow_ref CAP-EMB-01)
  GIVEN launchd service definitions don't exist yet; fleet embed route health exists at :4545/embed (from Sprint 01 Fleet Role Manifest healthProbe contract) but isn't wired into stack status
  WHEN  operator runs RED tests before D01-02 and D01-05 implementation
  THEN  RED tests fail: launchd units don't load OR don't keepalive services; holo stack status doesn't show embed health; after D01-02/D01-05 implement, tests pass with real launchd load/unload and embed health surfaced in status
  TEST_TIER: integration · VERIFICATION_SERVICE: launchd+fleet-embed-route · TDD_STATE: red
  SCENARIO — start_ref: launchd_units_not_defined · evidence: stdout
    NEGATIVE_CONTROL: would fail if launchd stubbed (not real macOS launchd); plist files mocked (not real ~/Library/LaunchAgents files); health endpoints hardcoded (static responses); pre-impl test exits code 0 (false pass)
    MUST_OBSERVE: pre-impl: test exits code ≠ 0 (fails before launchd units); pre-impl: test prints 4 failing tests (plists exist, loadable, embed health wired); post-D01-02/D01-05: test exits code 0 (all tests pass); post-D01-02: test asserts ls ~/Library/LaunchAgents/holocron-*.plist returns 4 files; post-D01-02: test asserts plutil -lint exits code 0 for all 4 plist files; post-D01-02: test asserts launchctl list | grep holocron-postgres prints PID ≠ 0 (if loaded); post-D01-05: test asserts holo stack status | grep 'embed.*healthy' exits code 0
    MUST_NOT_OBSERVE: pre-impl: test exits code 0 (passes without launchd units); pre-impl: (0) plist files (no files exist); post-D01-02: plutil -lint exits code ≠ 0 (malformed XML); post-D01-02: launchctl list prints scheduler with PID ≠ 0 (Sprint 11 owns it)

--------------------------------------------------------------------------------
SCOPE (writeAllowed)
--------------------------------------------------------------------------------
- services/platform/src/cli/__tests__/stack-supervisor.test.ts (NEW - RED suite)
- services/platform/src/cli/__tests__/secrets-hygiene.test.ts (NEW - RED suite)
- services/platform/src/cli/__tests__/dev-parity.test.ts (NEW - RED suite)
- services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts (NEW - RED suite)
- services/platform/src/cli/__tests__/fixtures/ (NEW - test fixtures if needed)
writeProhibited: services/platform/src/cli/holo.ts (MODIFY - only D01-03 implements, RED tests just call it), app/** (MODIFY - not this sprint), holocron-mcp/** (MODIFY - not this sprint), services/platform/src/db/** (MODIFY - Sprint 04 owns schema), services/platform/src/mastra/** (MODIFY - Sprint 05 owns service composition)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/SPRINT.md:all [Sprint overview, human test deliverable, gate]
2. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/04-uc-plat.md:68-76 [UC-PLAT-05 ACs]
3. /Users/justinrich/Projects/holocron/.spec/prds/mk6-migration/11-e2e-testing-criteria.md:44-49 [T-PLAT-015/016/017]
4. /Users/justinrich/Projects/holocron/services/platform/fleet/manifest.json:56-78 [embed role healthProbe contract for D01-05]
5. /Users/justinrich/Projects/holocron/services/platform/src/cli/holo.ts:1-30 [Existing CLI switch (no stack: commands yet)]
6. /Users/justinrich/Projects/brain/docs/kanban/SCENARIO-CONTRACT-V1.md:all [Scenario contract format for RED tests]

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
- RED Tests Fail Before Implementation: `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts services/platform/src/cli/__tests__/secrets-hygiene.test.ts services/platform/src/cli/__tests__/dev-parity.test.ts services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts` → Nonzero exit (tests fail - commands don't exist or behavior absent)
- All Test Files Present: `ls services/platform/src/cli/__tests__/*.test.ts | grep -E 'stack-supervisor|secrets-hygiene|dev-parity|launchd-and-embed-health'` → Exit 0 (4 test files present)

--------------------------------------------------------------------------------
REVIEW (code-reviewer)
--------------------------------------------------------------------------------
Must pass: RED tests MUST fail before implementation - if a test passes without impl, it's not a valid RED test; RED tests drive real CLI commands and real services - no mocks, no stubs; Scheduler tests MUST expect pending/disabled - Sprint 11 owns scheduler, never fake-healthy
Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------
Depends on: none · Blocks: D01-02, D01-03, D01-04, D01-05

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "D01-01",
  "proposed_by": "devops-engineer",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "postgres_mastra_zero_cache_available": {
      "description": "Postgres 18 running, Mastra service composition root exists, zero-cache filesystem exists, scheduler shim exists",
      "seed_method": "recorded_external",
      "records": [
        "pg_isready returns 0 (Postgres listening on :5432)",
        "services/platform/src/mastra/index.ts exists (composition root)",
        "services/platform/src/zero-cache/index.ts exists (zero-cache entrypoint)",
        "services/platform/src/scheduler/index.ts exists (scheduler shim)",
        "platform config has aliases CONVEX_URL and HOLOCRON_URL"
      ]
    },
    "repo_with_convex_env_aliases": {
      "description": "Repository has CONVEX_URL and HOLOCRON_URL aliases in multiple locations",
      "seed_method": "recorded_external",
      "records": [
        "app/.env contains EXPO_PUBLIC_CONVEX_URL=https://holocron.convex.cloud",
        "holocron-mcp/.env contains HOLOCRON_URL=https://holocron.convex.cloud",
        "services/platform/.env contains CONVEX_URL=https://holocron.convex.cloud",
        "grep -ri 'CONVEX_URL|HOLOCRON_URL' returns 3 matches"
      ]
    },
    "laptop_dev_environment": {
      "description": "Laptop dev machine with Tailscale up, Postgres installed, Bun installed",
      "seed_method": "recorded_external",
      "records": [
        "uname prints Darwin (macOS)",
        "which brew exits code 0 (Homebrew installed)",
        "which psql exits code 0 (Postgres client installed)",
        "which bun exits code 0 (Bun runtime installed)",
        "tailscale status --peers | grep mini prints 1 peer (tailnet connected)"
      ]
    },
    "launchd_units_not_defined": {
      "description": "No launchd plist files exist for holocron services",
      "seed_method": "recorded_external",
      "records": [
        "ls ~/Library/LaunchAgents/holocron-*.plist returns (0) files (no matches)",
        "launchctl list | grep holocron returns (0) matches (no services loaded)",
        "no postgres plist at ~/Library/LaunchAgents/holocron-postgres.plist",
        "no mastra plist at ~/Library/LaunchAgents/holocron-mastra.plist"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "flow_ref": "T-PLAT-015",
      "description": "GIVEN Sprint 04 Postgres is running, Sprint 05 Mastra service:up is available, zero-cache binary is available OR explicitly marked as not_implemented WHEN operator runs RED tests before stack supervisor implementation exists THEN RED tests fail: holo stack up does not exist OR reports wrong health state; holo stack down does not exist OR leaves orphaned PIDs; holo stack status does not exist OR reports fake-healthy; after D01-03 implements, tests pass with real Postgres, real Mastra, real zero-cache (if launched), scheduler honestly pending/disabled",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts \u2192 RED (nonzero exit) before D01-03; GREEN (exit 0) after D01-03",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-015",
        "negative_control": {
          "would_fail_if": [
            "stack supervisor stubbed (always returns healthy)",
            "service health mocked (not real Postgres/Mastra probes)",
            "launchd units omitted (no real services started)",
            "pre-impl test exits code 0 (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_mastra_zero_cache_available",
            "action": {
              "actor": "test_runner",
              "steps": [
                "pre-implementation: run PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts",
                "observe RED failure: test exits code \u2260 0 (nonzero)",
                "post-D01-03 implementation: run same command",
                "observe GREEN pass: test exits code 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-impl: `PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts` exits code \u2260 0 (nonzero)",
                "pre-impl: test prints 4 failing tests (postgres, mastra, scheduler, zero-cache)",
                "post-D01-03: same command exits code 0 (all tests pass)",
                "post-D01-03: test asserts pg_isready exits code 0",
                "post-D01-03: test asserts curl -f http://localhost:4111/health exits code 0",
                "post-D01-03: test asserts launchctl list | grep holocron prints 4 PIDs \u2260 0"
              ],
              "must_not_observe": [
                "pre-impl: test exits code 0 (passes without implementation)",
                "pre-impl: (0) failing tests (all pass before impl exists)",
                "post-D01-03: any service reports unhealthy (stubs)"
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
      "flow_ref": "T-PLAT-017",
      "description": "GIVEN repo has Convex env aliases scattered in codebase (EXPO_PUBLIC_CONVEX_URL, HOLOCRON_URL, deploy keys) and no consolidated secrets source exists yet WHEN operator runs RED tests before D01-04 implementation THEN RED tests fail: holo secrets doctor does not exist OR fails to resolve config; holo verify-no-convex-env does not exist OR fails to find existing Convex aliases; after D01-04 implements, tests pass with consolidated secrets resolving and zero Convex env aliases found",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/secrets-hygiene.test.ts \u2192 RED (nonzero exit) before D01-04; GREEN (exit 0) after D01-04",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-017",
        "negative_control": {
          "would_fail_if": [
            "secrets doctor stubbed (always exits code 0)",
            "DATABASE_URL omitted from config (required key missing)",
            "env alias mocked (not real grep of .env files)",
            "pre-impl test exits code 0 (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "postgres_mastra_zero_cache_available",
            "action": {
              "actor": "test_runner",
              "steps": [
                "pre-implementation: run PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/secrets-convex-env.test.ts",
                "observe RED failure: test exits code \u2260 0",
                "post-D01-04 implementation: run same command",
                "observe GREEN pass: test exits code 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-impl: test exits code \u2260 0 (fails before secrets consolidation)",
                "pre-impl: test prints 3 failing tests (secrets doctor, convex env removal, gitignore)",
                "post-D01-04: test exits code 0 (all tests pass)",
                "post-D01-04: test asserts bun services/platform/src/cli/holo.ts secrets doctor exits code 0",
                "post-D01-04: test asserts output prints `DATABASE_URL: resolved`",
                "post-D01-04: test asserts grep -ri 'CONVEX_URL|HOLOCRON_URL' returns (0) matches"
              ],
              "must_not_observe": [
                "pre-impl: test exits code 0 (passes without consolidation)",
                "post-D01-04: grep finds \u22651 CONVEX_URL or HOLOCRON_URL match (alias remains)",
                "post-D01-04: secrets doctor exits code 1 (missing key)"
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
      "flow_ref": "T-PLAT-016",
      "description": "GIVEN laptop has same config contract structure as mini but different environment values (different DATABASE_URL, different fleet endpoints) WHEN operator runs RED tests on laptop before D01-03 implementation THEN RED tests fail: holo stack up doesn't exist OR doesn't boot on laptop; after D01-03 implements, tests pass with same holo stack up command working on both mini and laptop using config contract, not hardcoded values",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/dev-parity.test.ts \u2192 RED (nonzero exit) before D01-03; GREEN (exit 0) after D01-03",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "T-PLAT-016",
        "negative_control": {
          "would_fail_if": [
            "laptop supervisor stubbed (not real bun/runtime check)",
            "config contract mocked (not real services/platform/config/*.yaml read)",
            "mini config hardcoded (static values)",
            "pre-impl test exits code 0 (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "laptop_dev_environment",
            "action": {
              "actor": "test_runner",
              "steps": [
                "pre-implementation: run PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/laptop-dev-parity.test.ts",
                "observe RED failure: test exits code \u2260 0",
                "post-D01-03 implementation: run same command on laptop",
                "observe GREEN pass: test exits code 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-impl: test exits code \u2260 0 (fails before laptop parity)",
                "pre-impl: test prints 2 failing tests (config contract, runtime parity)",
                "post-D01-03: test exits code 0 (laptop boots same stack)",
                "post-D01-03: test asserts DATABASE_URL value differs between mini and laptop env",
                "post-D01-03: test asserts `holo stack up` exits code 0 on both mini and laptop",
                "post-D01-03: test asserts mini config != laptop config (different paths)"
              ],
              "must_not_observe": [
                "pre-impl: test exits code 0 (passes without parity)",
                "post-D01-03: mini DATABASE_URL == laptop DATABASE_URL (should differ)",
                "post-D01-03: (0) healthy services on laptop (stack fails)"
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
      "flow_ref": "CAP-EMB-01",
      "description": "GIVEN launchd service definitions don't exist yet; fleet embed route health exists at :4545/embed (from Sprint 01 Fleet Role Manifest healthProbe contract) but isn't wired into stack status WHEN operator runs RED tests before D01-02 and D01-05 implementation THEN RED tests fail: launchd units don't load OR don't keepalive services; holo stack status doesn't show embed health; after D01-02/D01-05 implement, tests pass with real launchd load/unload and embed health surfaced in status",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts \u2192 RED (nonzero exit) before D01-02/D01-05; GREEN (exit 0) after",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "platform-cli",
        "flow_ref": "CAP-EMB-01",
        "negative_control": {
          "would_fail_if": [
            "launchd stubbed (not real macOS launchd)",
            "plist files mocked (not real ~/Library/LaunchAgents files)",
            "health endpoints hardcoded (static responses)",
            "pre-impl test exits code 0 (false pass)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "launchd_units_not_defined",
            "action": {
              "actor": "test_runner",
              "steps": [
                "pre-implementation: run PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/launchd-embed-health.test.ts",
                "observe RED failure: test exits code \u2260 0",
                "post-D01-02 and D01-05 implementation: run same command",
                "observe GREEN pass: test exits code 0"
              ]
            },
            "end_state": {
              "must_observe": [
                "pre-impl: test exits code \u2260 0 (fails before launchd units)",
                "pre-impl: test prints 4 failing tests (plists exist, loadable, embed health wired)",
                "post-D01-02/D01-05: test exits code 0 (all tests pass)",
                "post-D01-02: test asserts ls ~/Library/LaunchAgents/holocron-*.plist returns 4 files",
                "post-D01-02: test asserts plutil -lint exits code 0 for all 4 plist files",
                "post-D01-02: test asserts launchctl list | grep holocron-postgres prints PID \u2260 0 (if loaded)",
                "post-D01-05: test asserts holo stack status | grep 'embed.*healthy' exits code 0"
              ],
              "must_not_observe": [
                "pre-impl: test exits code 0 (passes without launchd units)",
                "pre-impl: (0) plist files (no files exist)",
                "post-D01-02: plutil -lint exits code \u2260 0 (malformed XML)",
                "post-D01-02: launchctl list prints scheduler with PID \u2260 0 (Sprint 11 owns it)"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "RED test suite fails before stack supervisor implementation and passes after",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/stack-supervisor.test.ts exits nonzero before D01-03; exit 0 after D01-03"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "RED test suite fails before consolidated secrets implementation and passes after",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/secrets-hygiene.test.ts exits nonzero before D01-04; exit 0 after D01-04"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "RED test suite fails before laptop dev-parity implementation and passes after",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/dev-parity.test.ts exits nonzero before D01-03; exit 0 after D01-03"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "RED test suite fails before launchd+embed health implementation and passes after",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run services/platform/src/cli/__tests__/launchd-and-embed-health.test.ts exits nonzero before D01-02/D01-05; exit 0 after"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Scheduler slot is explicitly pending/disabled in all tests (Sprint 11 owns scheduler)",
      "maps_to_ac": "AC-1",
      "verify": "grep -r 'scheduler.*healthy\\|scheduler.*up' services/platform/src/cli/__tests__/ returns zero matches; tests expect scheduler=pending"
    }
  ]
}
-->
</details>