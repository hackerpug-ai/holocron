# D02-01 — RED: integration lane fails closed without real Postgres/fleet
> Status: Backlog
> Sprint: [Sprint 13 — Vitest Integration Harness and Real-Service CI Lanes](./SPRINT.md)
> Agent: red-test-generator
> Estimate: 60 min
> Type: FEATURE
> Priority: P0
> Proposed by: red-test-generator
> TDD_MODE: red_first · RED_GREEN_REQUIRED: yes · SEEDED_EVIDENCE_REQUIRED: yes

## Outcome

Author the RED integration-lane entrypoint and fail-closed suite proving zero false-pass without real Postgres/fleet.

**Success state:** pnpm test:integration exists; pointing it at unreachable Postgres or fleet exits nonzero with zero passed tests; suite structure is ready for later green against nonprod.

## Background

- **Specialist rationale:** Owns TDD RED phase for the real-service integration lane: author failing tests and the missing pnpm test:integration entrypoint that prove fail-closed behavior before D02-02/D02-05 go green.
- **Planning rationale:** Sprint 13 gate requires a real-service suite that is green only against dedicated nonprod Postgres + real fleet, and that yields zero false-pass results when those dependencies are down. Today package.json has no test:integration script and there is no fail-closed negative-control suite for the lane.
- **How to verify (human):** Confirm package.json scripts.test:integration exists; run DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration and observe nonzero exit with zero passed tests; confirm suite files assert real connectivity (not mocked pg/fleet).
- **Scope:** package.json script registration plus NEW fail-closed integration test files under tests/integration/ and services/platform/tests/integration/. Does not implement nonprod seed/reset (D02-02) or CI workflows (D02-05).
- **PRD refs:** T-PLAT-019, T-PLAT-020, 10-e2e-testing

## Critical Constraints

### MUST
- MUST register scripts.test:integration in root package.json as the operator entrypoint for the real-service lane
- MUST author RED tests that drive real DATABASE_URL and FLEET_URL connectivity checks (or real harness probes) — not mocked clients
- MUST fail closed with process exit code != 0 and zero passed cases when Postgres is unreachable
- MUST fail closed with process exit code != 0 and zero passed cases when the fleet endpoint is unreachable
- MUST keep PLATFORM_IT=1 (or equivalent) as the live-gate flag consistent with tests/integration/service/harness.ts

### NEVER
- NEVER mock or stub Postgres, fleet HTTP, or Mastra in the fail-closed suite
- NEVER mark disconnected-dependency cases as skipped/todo/pass to force green
- NEVER implement GREEN production seed/reset or CI workflow YAML in this task
- NEVER assert only string presence of error text without asserting exit semantics and pass-count=0

### STRICTLY
- STRICTLY every behavioral AC remains RED until D02-02+ later harness wiring make the happy path green; disconnect negatives stay permanently red-on-disconnect
- STRICTLY write_allowed is limited to the test entrypoint + NEW fail-closed test files
- STRICTLY verify commands must be exact shell invocations an operator can paste

## Specification

**Objective:** Author the RED integration-lane entrypoint and fail-closed suite proving zero false-pass without real Postgres/fleet.

**Success state:** pnpm test:integration exists; pointing it at unreachable Postgres or fleet exits nonzero with zero passed tests; suite structure is ready for later green against nonprod.

## Acceptance Criteria

### AC-1: PRIMARY: test:integration entrypoint is registered [PRIMARY]
**GIVEN:** Root package.json is the operator surface for the sprint gate command pnpm test:integration
**WHEN:** An operator inspects scripts and invokes pnpm run test:integration --help or pnpm test:integration with unreachable deps
**THEN:** scripts.test:integration exists and resolves to a vitest/PLATFORM_IT integration invocation (not an alias that silently no-ops); missing script is a RED failure until this task lands
**VERIFY:** `node -e "const s=require('./package.json').scripts||{}; if(!s['test:integration']){console.error('MISSING'); process.exit(1)}; console.log(s['test:integration']);" && pnpm run test:integration -- --version >/dev/null 2>&1; echo entrypoint_ok`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** pnpm + package.json + vitest CLI
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "pnpm + package.json + vitest CLI",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "missing_test_integration_script",
      "action": {
        "actor": "operator",
        "steps": [
          "Read package.json scripts.test:integration",
          "Attempt pnpm test:integration after the script is registered by this task",
          "Capture script value and whether pnpm resolves the script name"
        ]
      },
      "end_state": {
        "must_observe": [
          "scripts['test:integration'] is a non-empty string",
          "must_observe_literal: `script invokes vitest (or bun/pnpm vitest) against integration paths` count: 1",
          "pnpm run test:integration is a known script (not ERR_PNPM_NO_SCRIPT)"
        ],
        "must_not_observe": [
          "scripts['test:integration'] undefined",
          "empty/start signature: `ERR_PNPM_NO_SCRIPT test:integration` OR count: 0",
          "script equals 'true' or empty no-op"
        ]
      }
    }
  ]
}
```

### AC-2: PRIMARY: suite fails closed when Postgres is unreachable
**GIVEN:** DATABASE_URL points at 127.0.0.1:1 (connection refused) and PLATFORM_IT=1
**WHEN:** Operator runs pnpm test:integration (or the registered vitest integration path) against that env
**THEN:** Process exits nonzero; number of passed tests is 0; failure names Postgres/database unavailability (not a silent green)
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:4545 PLATFORM_IT=1 pnpm test:integration; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + real TCP to Postgres URL
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + real TCP to Postgres URL",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "unreachable_postgres",
      "action": {
        "actor": "operator",
        "steps": [
          "Export DATABASE_URL=postgres://127.0.0.1:1/nope",
          "Export PLATFORM_IT=1",
          "Run pnpm test:integration",
          "Capture exit code, passed/failed/skipped counts, and failure reason text"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "passed: 0",
          "must_observe_literal: `failure reason mentions postgres|database|ECONNREFUSED|connection` count: 1"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `passed: >=1` OR count: 0",
          "empty/start signature: `all tests skipped` OR count: 0",
          "empty/start signature: `mock postgres client used` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-3: Suite fails closed when fleet endpoint is unreachable
**GIVEN:** FLEET_URL points at http://127.0.0.1:1 (connection refused) and PLATFORM_IT=1
**WHEN:** Operator runs pnpm test:integration against that env
**THEN:** Process exits nonzero; passed count is 0; failure names fleet/endpoint unavailability
**VERIFY:** `FLEET_URL=http://127.0.0.1:1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod PLATFORM_IT=1 pnpm test:integration; test $? -ne 0`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + real HTTP to fleet URL
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + real HTTP to fleet URL",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "unreachable_fleet",
      "action": {
        "actor": "operator",
        "steps": [
          "Export FLEET_URL=http://127.0.0.1:1",
          "Export PLATFORM_IT=1",
          "Run pnpm test:integration",
          "Capture exit code and pass count"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "passed: 0",
          "must_observe_literal: `failure reason mentions fleet|ECONNREFUSED|fetch failed|endpoint` count: 1"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `passed: >=1` OR count: 0",
          "empty/start signature: `fleet mocked to 200 OK` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-4: Both-unreachable yields zero false-pass results
**GIVEN:** Both DATABASE_URL and FLEET_URL point at closed ports
**WHEN:** Operator runs pnpm test:integration
**THEN:** Suite exits nonzero with passed=0 and does not report a green summary; no test case is marked passed via skip/todo conversion
**VERIFY:** `DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-both-unreachable.txt; test ${PIPESTATUS[0]} -ne 0; ! rg -n "Tests\s+[1-9][0-9]*\s+passed|passed:\s*[1-9]" /tmp/d02-01-both-unreachable.txt`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** vitest + real TCP/HTTP disconnect
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "vitest + real TCP/HTTP disconnect",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "stdout",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "both_unreachable",
      "action": {
        "actor": "operator",
        "steps": [
          "Point both DATABASE_URL and FLEET_URL at 127.0.0.1:1",
          "Run pnpm test:integration",
          "Parse vitest summary for passed count and exit code"
        ]
      },
      "end_state": {
        "must_observe": [
          "exitCode != 0",
          "passed: 0",
          "failed or errored cases >= 1"
        ],
        "must_not_observe": [
          "exitCode: 0",
          "empty/start signature: `Tests N passed with N>=1` OR count: 0",
          "empty/start signature: `todo/skip used to hide failures` OR count: 0"
        ]
      }
    }
  ]
}
```

### AC-5: Fail-closed suite uses real harness contract (no mocks)
**GIVEN:** NEW fail-closed test files and existing tests/integration/service/harness.ts contract
**WHEN:** Reviewer greps the NEW suite and harness for mock/stub factories and confirms probes use real env URLs
**THEN:** No pg/fleet/Mastra mocks appear in the fail-closed suite; tests import or mirror the real PLATFORM_IT harness patterns; disconnect assertions require live connect attempts
**VERIFY:** `rg -n "vi\.mock|jest\.mock|mockPostgres|mockFleet|nock\(|msw" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts; test $? -eq 1; rg -n "PLATFORM_IT|DATABASE_URL|FLEET_URL" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts`
**TEST_TIER:** integration
**VERIFICATION_SERVICE:** repo filesystem + real harness source
**TDD_STATE:** red
**UNIT_TEST_JUSTIFIED:** None
#### Scenario contract
```json
{
  "tier": "visible",
  "test_tier": "integration",
  "verification_service": "repo filesystem + real harness source",
  "negative_control": {
    "would_fail_if": [
      "disconnect",
      "stub",
      "empty",
      "mock",
      "static"
    ]
  },
  "evidence": {
    "artifact_type": "file_artifact",
    "required_capture": true
  },
  "cases": [
    {
      "start_ref": "harness_real_service_contract",
      "action": {
        "actor": "reviewer",
        "steps": [
          "Open NEW fail-closed test files after D02-01 lands",
          "Search for mock/stub patterns",
          "Confirm DATABASE_URL/FLEET_URL/PLATFORM_IT are referenced for live probes"
        ]
      },
      "end_state": {
        "must_observe": [
          "must_observe_literal: `files tests/integration/fail-closed-harness.test.ts and/or services/platform/tests/integration/fail-closed-lane.test.ts exist` count: 1",
          "must_observe_literal: `PLATFORM_IT referenced` count: 1",
          "must_observe_literal: `DATABASE_URL or FLEET_URL referenced for live probes` count: 1"
        ],
        "must_not_observe": [
          "empty/start signature: `vi.mock of pg or fetch fleet` OR count: 0",
          "empty/start signature: `hardcoded return { ok: true } without connect` OR count: 0",
          "empty test file"
        ]
      }
    }
  ]
}
```

## Test Criteria

| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | package.json scripts.test:integration is a non-empty string when the D02-01 entrypoint lands | AC-1 | `node -e "const s=require('./package.json').scripts||{}; if(!s['test:integration']) process.exit(1)"` | happy_path |
| TC-2 | pnpm test:integration exits nonzero when DATABASE_URL targets 127.0.0.1:1 | AC-2 | `DATABASE_URL=postgres://127.0.0.1:1/nope PLATFORM_IT=1 pnpm test:integration; test $? -ne 0` | error_path |
| TC-3 | pnpm test:integration reports passed equals 0 when DATABASE_URL targets 127.0.0.1:1 | AC-2 | `DATABASE_URL=postgres://127.0.0.1:1/nope PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-pg.txt; ! rg -n "[1-9][0-9]* passed" /tmp/d02-01-pg.txt` | error_path |
| TC-4 | pnpm test:integration exits nonzero when FLEET_URL targets http://127.0.0.1:1 | AC-3 | `FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration; test $? -ne 0` | error_path |
| TC-5 | pnpm test:integration reports passed equals 0 when both Postgres and fleet URLs are unreachable | AC-4 | `DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-both.txt; test ${PIPESTATUS[0]} -ne 0; ! rg -n "[1-9][0-9]* passed" /tmp/d02-01-both.txt` | error_path |
| TC-6 | Fail-closed suite source contains zero vi.mock or jest.mock of Postgres or fleet clients | AC-5 | `rg -n "vi\.mock|jest\.mock|mockPostgres|mockFleet" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts; test $? -eq 1` | edge_case |

## Reading List

- `.spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/SPRINT.md` (all) — Gate, test steps 1-2, D02-01 scope
- `.spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md` (all) — Real-service mandate; Vitest integration harness; CI lane definitions
- `tests/integration/service/harness.ts` (1-120) — PLATFORM_IT gate, startLiveService, DEFAULT_DATABASE_URL — pattern to extend, not mock
- `package.json` (scripts) — Missing test:integration script to register
- `vitest.config.ts` (all) — Existing integration include globs; ensure fail-closed files are included or covered by test:integration args
- `.spec/prds/mk6-migration/tasks/sprint-06-headless-deployment-dev-prod-parity/D01-01-red-seeded-tests-for-stack-up-health-and-convex-env-alias-detection.md` (1-120) — Prior RED suite style for real CLI/services fail-closed proofs

## Guardrails

### WRITE-ALLOWED
- package.json (MODIFY scripts.test:integration only)
- tests/integration/fail-closed-harness.test.ts (NEW)
- services/platform/tests/integration/fail-closed-lane.test.ts (NEW)
- vitest.config.ts (MODIFY include globs only if required so NEW files run under test:integration)

### WRITE-PROHIBITED
- app/** — out of sprint scope
- services/platform/src/** — GREEN implementation owned by later tasks (seed/reset, stack)
- .github/workflows/** — owned by D02-04/D02-05
- holocron-mcp/** — out of scope
- .spec/prds/mk6-migration/tasks/sprint-12-*/** — do not modify Sprint 12 evidence

### Boundaries
- **always:** Use real DATABASE_URL/FLEET_URL env for probes, Keep PLATFORM_IT=1 live gate, Capture exit code + pass count evidence for disconnect cases
- **ask_first:** Changing default DATABASE_URL for existing green suites, Renaming existing tests/integration/service/ harness API
- **never:** Mock Postgres or fleet, Skip disconnect tests to force green, Implement holo db seed --reset here

## Design

- **references:** .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md, tests/integration/service/harness.ts, .spec/prds/mk6-migration/tasks/sprint-13-vitest-integration-harness-and-real-service-ci-lanes/SPRINT.md
- **pattern:** PLATFORM_IT=1 live gate + real Bun/vitest probes against env DATABASE_URL/FLEET_URL; disconnect → suite error, never mock success
- **pattern_source:** tests/integration/service/harness.ts:31-32,85-107
- **anti_pattern:** vi.mock('postgres') / fake fleet fetch returning 200 / it.skip on disconnect / empty test file that exits 0
- note: D02-02 will provide holocron_nonprod + holo db seed --reset; RED disconnect cases must not depend on that happy path being green yet
- note: D02-05 CI integration lane will invoke the same pnpm test:integration entrypoint against the self-hosted runner + nonprod namespace

## Agent Assignment

- **implementer:** red-test-generator — Owns TDD RED phase for the real-service integration lane: author failing tests and the missing pnpm test:integration entrypoint that prove fail-closed behavior before D02-02/D02-05 go green.
- **reviewer:** mastra-reviewer — Reviews real-service harness honesty against Mastra/Postgres/fleet (no mocks, no skip-to-green, PLATFORM_IT discipline).

## Verification Gates

- **AC-1 test:integration script registered:** `node -e "const s=require('./package.json').scripts||{}; if(!s['test:integration']){console.error('MISSING'); process.exit(1)}; console.log(s['test:integration']);"` → Exit 0; prints a vitest integration command string
- **AC-2 fail closed without Postgres:** `DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:4545 PLATFORM_IT=1 pnpm test:integration; test $? -ne 0` → Nonzero exit; passed=0; connectivity failure observed
- **AC-3 fail closed without fleet:** `FLEET_URL=http://127.0.0.1:1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod PLATFORM_IT=1 pnpm test:integration; test $? -ne 0` → Nonzero exit; passed=0; fleet failure observed
- **AC-4 both unreachable zero false-pass:** `DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-both-unreachable.txt; test ${PIPESTATUS[0]} -ne 0; ! rg -n "[1-9][0-9]* passed" /tmp/d02-01-both-unreachable.txt` → Nonzero exit; no passed>=1 summary line
- **AC-5 no mocks in fail-closed suite:** `rg -n "vi\.mock|jest\.mock|mockPostgres|mockFleet" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts; test $? -eq 1` → rg exits 1 (no matches)
- **Scope compliance:** `git diff --name-only HEAD | sort -u` → Only paths in guardrails.write_allowed

## Coding Standards

- brain/docs/TDD-METHODOLOGY.md
- brain/docs/kanban/SCENARIO-CONTRACT-V1.md
- brain/docs/kanban/TASK-TEMPLATE.md
- .spec/prds/mk6-migration/10-technical-requirements/10-e2e-testing.md

## Dependencies

- **depends_on:** —
- **blocks:** D02-02, D02-05

## Notes

- Pre-impl baseline: package.json has no test:integration (confirmed 2026-07-18). RED proof for AC-1 is the missing script; after this task lands AC-1 goes green while AC-2/3/4 remain permanently red under disconnect env.
- Preferred script shape: PLATFORM_IT=1 vitest run tests/integration services/platform/tests/integration -- or a documented subset that always includes fail-closed-lane tests.
- holocron_nonprod DB name is the intended D02-02 namespace; disconnect tests must not require it to exist.

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "D02-01",
  "proposed_by": "red-test-generator",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "missing_test_integration_script": {
      "description": "Root package.json currently lacks scripts.test:integration (only test/test:watch exist).",
      "seed_method": "cli",
      "entrypoint": "node -e \"const s=require('./package.json').scripts||{}; if(s['test:integration']) process.exit(0); console.error('missing test:integration'); process.exit(1)\"",
      "records": [
        "scripts.test exists: vitest run",
        "scripts.test:integration: absent",
        "exitCode: 1 when asserting presence"
      ]
    },
    "unreachable_postgres": {
      "description": "DATABASE_URL points at a closed local port so real TCP connect fails; fleet may be anything.",
      "seed_method": "cli",
      "entrypoint": "DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:4545 PLATFORM_IT=1",
      "records": [
        "DATABASE_URL host 127.0.0.1 port 1",
        "pg connection refused / ECONNREFUSED",
        "no live holocron DB session"
      ]
    },
    "unreachable_fleet": {
      "description": "FLEET_URL points at a closed local port so real HTTP connect fails; Postgres may be the real nonprod URL if available, else also dead.",
      "seed_method": "cli",
      "entrypoint": "FLEET_URL=http://127.0.0.1:1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod PLATFORM_IT=1",
      "records": [
        "FLEET_URL host 127.0.0.1 port 1",
        "fleet fetch ECONNREFUSED",
        "no LiteLLM :4545 response"
      ]
    },
    "both_unreachable": {
      "description": "Both Postgres and fleet endpoints are unreachable simultaneously.",
      "seed_method": "cli",
      "entrypoint": "DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1",
      "records": [
        "pg unreachable",
        "fleet unreachable",
        "suite must not report any passed cases"
      ]
    },
    "harness_real_service_contract": {
      "description": "Existing live harness pattern that requires PLATFORM_IT=1 and real Bun service spawn without mocks.",
      "seed_method": "cli",
      "entrypoint": "rg -n \"PLATFORM_IT|startLiveService|mock\" tests/integration/service/harness.ts",
      "records": [
        "PLATFORM_IT gate present",
        "startLiveService spawns real services/platform/src/index.ts",
        "no pg/fleet mock factories in harness"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "description": "GIVEN root package.json is the operator surface WHEN scripts are inspected and pnpm test:integration is invoked THEN scripts.test:integration exists and resolves to a real vitest integration invocation.",
      "verify": "node -e \"const s=require('./package.json').scripts||{}; if(!s['test:integration']){console.error('MISSING'); process.exit(1)}; console.log(s['test:integration']);\"",
      "maps_to_ac": "AC-1",
      "test_tier": "integration",
      "verification_service": "pnpm + package.json + vitest CLI",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "pnpm + package.json + vitest CLI",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "missing_test_integration_script",
            "action": {
              "actor": "operator",
              "steps": [
                "Read package.json scripts.test:integration",
                "Attempt pnpm test:integration after the script is registered by this task",
                "Capture script value and whether pnpm resolves the script name"
              ]
            },
            "end_state": {
              "must_observe": [
                "scripts['test:integration'] is a non-empty string",
                "must_observe_literal: `script invokes vitest (or bun/pnpm vitest) against integration paths` count: 1",
                "pnpm run test:integration is a known script (not ERR_PNPM_NO_SCRIPT)"
              ],
              "must_not_observe": [
                "scripts['test:integration'] undefined",
                "empty/start signature: `ERR_PNPM_NO_SCRIPT test:integration` OR count: 0",
                "script equals 'true' or empty no-op"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-2",
      "type": "acceptance_criterion",
      "description": "GIVEN DATABASE_URL=postgres://127.0.0.1:1/nope and PLATFORM_IT=1 WHEN pnpm test:integration runs THEN exit code != 0 and passed=0 with a Postgres connectivity failure.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:4545 PLATFORM_IT=1 pnpm test:integration; test $? -ne 0",
      "maps_to_ac": "AC-2",
      "test_tier": "integration",
      "verification_service": "vitest + real TCP to Postgres URL",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + real TCP to Postgres URL",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "unreachable_postgres",
            "action": {
              "actor": "operator",
              "steps": [
                "Export DATABASE_URL=postgres://127.0.0.1:1/nope",
                "Export PLATFORM_IT=1",
                "Run pnpm test:integration",
                "Capture exit code, passed/failed/skipped counts, and failure reason text"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "passed: 0",
                "must_observe_literal: `failure reason mentions postgres|database|ECONNREFUSED|connection` count: 1"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `passed: >=1` OR count: 0",
                "empty/start signature: `all tests skipped` OR count: 0",
                "empty/start signature: `mock postgres client used` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-3",
      "type": "acceptance_criterion",
      "description": "GIVEN FLEET_URL=http://127.0.0.1:1 and PLATFORM_IT=1 WHEN pnpm test:integration runs THEN exit code != 0 and passed=0 with a fleet connectivity failure.",
      "verify": "FLEET_URL=http://127.0.0.1:1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod PLATFORM_IT=1 pnpm test:integration; test $? -ne 0",
      "maps_to_ac": "AC-3",
      "test_tier": "integration",
      "verification_service": "vitest + real HTTP to fleet URL",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + real HTTP to fleet URL",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "unreachable_fleet",
            "action": {
              "actor": "operator",
              "steps": [
                "Export FLEET_URL=http://127.0.0.1:1",
                "Export PLATFORM_IT=1",
                "Run pnpm test:integration",
                "Capture exit code and pass count"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "passed: 0",
                "must_observe_literal: `failure reason mentions fleet|ECONNREFUSED|fetch failed|endpoint` count: 1"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `passed: >=1` OR count: 0",
                "empty/start signature: `fleet mocked to 200 OK` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-4",
      "type": "acceptance_criterion",
      "description": "GIVEN both Postgres and fleet URLs are unreachable WHEN pnpm test:integration runs THEN exit code != 0, passed=0, and no false-pass summary appears.",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-both-unreachable.txt; test ${PIPESTATUS[0]} -ne 0; ! rg -n \"[1-9][0-9]* passed\" /tmp/d02-01-both-unreachable.txt",
      "maps_to_ac": "AC-4",
      "test_tier": "integration",
      "verification_service": "vitest + real TCP/HTTP disconnect",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "vitest + real TCP/HTTP disconnect",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "both_unreachable",
            "action": {
              "actor": "operator",
              "steps": [
                "Point both DATABASE_URL and FLEET_URL at 127.0.0.1:1",
                "Run pnpm test:integration",
                "Parse vitest summary for passed count and exit code"
              ]
            },
            "end_state": {
              "must_observe": [
                "exitCode != 0",
                "passed: 0",
                "failed or errored cases >= 1"
              ],
              "must_not_observe": [
                "exitCode: 0",
                "empty/start signature: `Tests N passed with N>=1` OR count: 0",
                "empty/start signature: `todo/skip used to hide failures` OR count: 0"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "description": "GIVEN NEW fail-closed suite files WHEN reviewer greps for mocks and live env probes THEN no pg/fleet mocks exist and PLATFORM_IT/DATABASE_URL/FLEET_URL drive real probes.",
      "verify": "rg -n \"vi\\.mock|jest\\.mock|mockPostgres|mockFleet\" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts; test $? -eq 1; rg -n \"PLATFORM_IT|DATABASE_URL|FLEET_URL\" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts",
      "maps_to_ac": "AC-5",
      "test_tier": "integration",
      "verification_service": "repo filesystem + real harness source",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "repo filesystem + real harness source",
        "negative_control": {
          "would_fail_if": [
            "disconnect",
            "stub",
            "empty",
            "mock",
            "static"
          ]
        },
        "evidence": {
          "artifact_type": "file_artifact",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "harness_real_service_contract",
            "action": {
              "actor": "reviewer",
              "steps": [
                "Open NEW fail-closed test files after D02-01 lands",
                "Search for mock/stub patterns",
                "Confirm DATABASE_URL/FLEET_URL/PLATFORM_IT are referenced for live probes"
              ]
            },
            "end_state": {
              "must_observe": [
                "must_observe_literal: `files tests/integration/fail-closed-harness.test.ts and/or services/platform/tests/integration/fail-closed-lane.test.ts exist` count: 1",
                "must_observe_literal: `PLATFORM_IT referenced` count: 1",
                "must_observe_literal: `DATABASE_URL or FLEET_URL referenced for live probes` count: 1"
              ],
              "must_not_observe": [
                "empty/start signature: `vi.mock of pg or fetch fleet` OR count: 0",
                "empty/start signature: `hardcoded return { ok: true } without connect` OR count: 0",
                "empty test file"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "package.json scripts.test:integration is a non-empty string when the D02-01 entrypoint lands",
      "verify": "node -e \"const s=require('./package.json').scripts||{}; if(!s['test:integration']) process.exit(1)\"",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "pnpm test:integration exits nonzero when DATABASE_URL targets 127.0.0.1:1",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/nope PLATFORM_IT=1 pnpm test:integration; test $? -ne 0",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "pnpm test:integration reports passed equals 0 when DATABASE_URL targets 127.0.0.1:1",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/nope PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-pg.txt; ! rg -n \"[1-9][0-9]* passed\" /tmp/d02-01-pg.txt",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "pnpm test:integration exits nonzero when FLEET_URL targets http://127.0.0.1:1",
      "verify": "FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration; test $? -ne 0",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "pnpm test:integration reports passed equals 0 when both Postgres and fleet URLs are unreachable",
      "verify": "DATABASE_URL=postgres://127.0.0.1:1/nope FLEET_URL=http://127.0.0.1:1 PLATFORM_IT=1 pnpm test:integration 2>&1 | tee /tmp/d02-01-both.txt; test ${PIPESTATUS[0]} -ne 0; ! rg -n \"[1-9][0-9]* passed\" /tmp/d02-01-both.txt",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "Fail-closed suite source contains zero vi.mock or jest.mock of Postgres or fleet clients",
      "verify": "rg -n \"vi\\.mock|jest\\.mock|mockPostgres|mockFleet\" tests/integration/fail-closed-harness.test.ts services/platform/tests/integration/fail-closed-lane.test.ts; test $? -eq 1",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->
