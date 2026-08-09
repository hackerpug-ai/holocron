# S31-MCP-02: Prove mutation replay leaves exactly one row for every declared-idempotent tool

> **Task ID:** S31-MCP-02
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** M · **Estimate:** 180 min
> **PROPOSED-BY:** `mcp-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-CUT-01
**PRD refs:** UC-SVC-04 · R34 · 14-mcp-compatibility-manifest.yaml replay contracts

## What this does

For every MCP mutation tool whose manifest declares idempotent (or semi-idempotent) replay, invokes the tool twice with the same idempotency key over the real Postgres gateway and asserts the target table gains exactly one row (or the declared stored_result no-op semantics), never two.

## Why

R34 notes mutation idempotency is application-enforced. The cutover gate must still *prove* replay does not duplicate rows for every tool that claims idempotency. Manifest replay fixtures alone are schema exemplars without behavioural proof (01-scope: provenance-captured fixtures deferred; behavioural proof is the live sweep/replay).

## How to verify

- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts` exits 0.
- For each tool id returned by `holo mcp:list-mutations --json` where `idempotency` string contains `Idempotent` or `Semi-idempotent` (case-sensitive prefixes used in the manifest), double-call yields row_delta == 0 on the second call and total rows for the key == 1.
- Explicitly non-idempotent tools are listed in an asserted exclusion set, not silently skipped.

## Scope

Integration proof + any minimal executor fixes required so declared-idempotent tools actually upsert. Does not expand allowlists, change transport sweeps (S31-MCP-01), or soften verify-manifest (S31-MCP-03).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-MCP-02 - Mutation replay leaves exactly one row
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M
AGENT:      implementer=mastra-implementer | reviewer=mcp-reviewer
PROPOSED-BY: mcp-planner
ESTIMATE:   180 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-CUT-01
PRD_REFS:   UC-SVC-04 · R34 · 14-mcp-compatibility-manifest.yaml

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/4 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

Every declared-idempotent MCP mutation tool survives double-call with exactly one durable row for the key.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER mock the MCP gateway or Postgres.
- NEVER widen "idempotent" to tools whose manifest says "Not idempotent" or "Not natively idempotent".
- NEVER skip a declared-idempotent tool without failing the suite.
- NEVER rely only on manifest fixture JSON equality — must observe DB row counts.
- NEVER introduce a second concurrent client (R34 promotion trigger); sequential double-call only.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] Every declared-idempotent mutation tool double-call ends with exactly one row for the key — AC-1 (PRIMARY)
- [ ] Semi-idempotent tools return the existing row id on second call — AC-2
- [ ] Non-idempotent tools are named in an asserted exclusion list — AC-3
- [ ] holo mcp:list-mutations --json cardinality matches the suite's tool set — AC-4
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: Declared-idempotent mutations do not duplicate rows [PRIMARY]
  GIVEN: nonprod Postgres + real /mcp gateway + sweep_seed style corpus
  WHEN:  each Idempotent-by-* mutation is invoked twice with identical args/key
  THEN:  after both calls, count of rows matching the idempotency key equals 1

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http+postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts
  TEST_FUNCTION: declaredIdempotentMutationsLeaveOneRow

  SCENARIO:
    START_REF:        mcp_mutation_seed
    NEGATIVE_CONTROL: would fail if second insert | mock gateway | skip tool | count only first call
    EVIDENCE:         db_query
    CASES:
      - ACTION: for each declared-idempotent tool, tools/call twice; SELECT count for key
        MUST_OBSERVE:
          - tools covered count == number of Idempotent manifest entries with replay
          - for each tool, row count for key == 1 after second call
          - second call HTTP 200 without isError for success-path tools
        MUST_NOT_OBSERVE:
          - row count 2 for any idempotency key
          - a declared-idempotent tool skipped without assertion
          - proof only via fixture JSON deep-equal without DB read

AC-2: Semi-idempotent tools return existing row
  GIVEN: add_subscription (or equivalent semi-idempotent) already inserted
  WHEN:  second call with same (sourceType, identifier)
  THEN:  same id returned; sources table count for key remains 1

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mcp-http+postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts
  TEST_FUNCTION: semiIdempotentReturnsExistingRow

AC-3: Non-idempotent tools are explicitly excluded
  GIVEN: manifest entries whose idempotency starts with "Not"
  WHEN:  the suite loads the exclusion set
  THEN:  deep-equals the sorted list of those tool ids; suite does not claim they are single-row

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  filesystem
  TEST_FILE:     services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts
  TEST_FUNCTION: nonIdempotentToolsExplicitlyExcluded

AC-4: list-mutations cardinality matches suite
  GIVEN: holo mcp:list-mutations --json
  WHEN:  suite compares mutation tool ids to manifest
  THEN:  equal sorted id sets; no orphan suite case

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  cli
  TEST_FILE:     services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts
  TEST_FUNCTION: listMutationsMatchesSuite

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

mcp_mutation_seed (seed_method: public_api)
  - nonprod DB migrated
  - PLATFORM_IT=1
  - unique suffix per run for keys (s31-mcp02-<uuid>)

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mcp/executor.ts (MODIFY — only to honor declared idempotency keys)
- services/platform/src/tools/** (MODIFY only if tool implementations own the upsert)
- services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts (NEW)
- services/platform/tests/integration/helpers/mcp-idempotency.ts (NEW optional)

writeProhibited:
- Softening S31-MCP-01 strict sweep
- Changing 14-mcp-compatibility-manifest.yaml contracts without S31-MCP-04
- DB unique constraints on all mutations (R34 accepted app-enforced for cutover)
- Concurrent multi-client races

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. .spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml — idempotency + replay
2. services/platform/src/mcp/list-mutations.ts — mutation inventory CLI
3. services/platform/src/mcp/executor.ts — application-level idempotency
4. S31-MCP-01 task — dual-transport sweep; do not soften
5. 08-technical-risks.md R34

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- DB-enforced unique constraints for every key (R34 promotion only)
- External-dependency tools behavioural success (allowlist S31-MCP-01)
- Provenance-captured fixtures (01-scope exclusion)
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-MCP-02",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "mcp_mutation_seed": {
      "description": "Nonprod DB ready for MCP mutation double-calls",
      "seed_method": "public_api",
      "records": [
        "PLATFORM_IT=1",
        "unique key suffix per run"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "Declared-idempotent mutations do not duplicate rows",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "mcp-http+postgres",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "second insert",
          "mock gateway",
          "skip tool",
          "count only first call"
        ]
      },
      "evidence": {
        "artifact_type": "db_query",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "mcp_mutation_seed",
          "action": {
            "actor": "cli_user",
            "steps": [
              "list declared-idempotent mutations",
              "tools/call each twice with same key",
              "SELECT count for each key"
            ]
          },
          "end_state": {
            "must_observe": [
              "for each tool, row count for key == 1 after second call",
              "tools covered count equals Idempotent manifest entries with replay"
            ],
            "must_not_observe": [
              "row count 2 for any key",
              "declared-idempotent tool skipped",
              "fixture-only proof without DB read"
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
      "description": "Semi-idempotent tools return existing row",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts",
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
          "start_ref": "mcp_mutation_seed",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-2",
              "Assert prose AC: Semi-idempotent tools return existing row"
            ]
          },
          "end_state": {
            "must_observe": [
              "Semi-idempotent tools return existing row"
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
      "id": "AC-3",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Non-idempotent tools are explicitly excluded",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts",
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
          "start_ref": "mcp_mutation_seed",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: Non-idempotent tools are explicitly excluded"
            ]
          },
          "end_state": {
            "must_observe": [
              "Non-idempotent tools are explicitly excluded"
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
      "description": "list-mutations cardinality matches suite",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-mcp-idempotent-replay.test.ts",
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
          "start_ref": "mcp_mutation_seed",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-4",
              "Assert prose AC: list-mutations cardinality matches suite"
            ]
          },
          "end_state": {
            "must_observe": [
              "list-mutations cardinality matches suite"
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

**Report to:** team-lead once double-call suite is green for every declared-idempotent mutation.
