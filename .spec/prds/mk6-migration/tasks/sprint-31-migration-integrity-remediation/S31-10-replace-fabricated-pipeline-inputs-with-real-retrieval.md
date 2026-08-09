# S31-10: Replace fabricated pipeline inputs with real retrieval for whatsNew, assimilate, shop

> **Task ID:** S31-10
> **Sprint:** [Sprint 31 — Migration Integrity Remediation](./SPRINT.md)
> **Type:** FEATURE · **Priority:** P0 · **Effort:** L · **Estimate:** 660 min
> **PROPOSED-BY:** `mastra-planner`
> **TDD_MODE:** `red_first` · **RED_GREEN_REQUIRED:** yes
> **Status:** Backlog

**Capabilities:** CAP-INF-01, CAP-CUT-01
**PRD refs:** UC-SVC-02 · 01-scope.md whatsNew/assimilate/shop real sources · R38 (business pipelines remain scaffolded)

## What this does

Replaces deterministic hash-scaffold retrieval for the whatsNew, assimilate, and shop mission pipelines with real retrieval paths that fetch live sources (subscriptions corpus, repository content, marketplace/search APIs as already declared by those products). Scaffold labels may remain only as an explicit degraded fallback that cannot satisfy commit success alone.

## Why

Convex versions of whatsNew/assimilate/shop fetched real sources. The Mastra ports currently succeed on `pipeline-components.ts` scaffolding (`deterministic-scaffolding:*` retailers, hash-stable titles). 01-scope explicitly treats this scaffolding as a behavioural regression that **is** in scope — unlike the four business pipelines, whose market-data sourcing stays deferred (R38).

## How to verify

- `cd services/platform && bun src/cli/holo.ts mission run whatsNew --date <today> --json` produces a report whose retrieval stage cites ≥1 real source id present in Postgres, with 0 `deterministic-scaffolding` retailers required for success.
- Equivalent assimilate and shop runs succeed with real retrieval artifacts.
- `PLATFORM_IT=1 pnpm test:integration -- services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts` exits 0, including a negative control that refuses commit when only scaffold slots exist.

## Scope

Touches whatsNew, assimilate, and shop mission templates/runtime commit paths and their retrieval components. Does **not** add live market-data sourcing for the four business pipelines (out of scope).

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: S31-10 - Real retrieval for whatsNew, assimilate, shop
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     L
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
ESTIMATE:   660 minutes
TDD_MODE:   red_first
CAPABILITIES: CAP-INF-01, CAP-CUT-01
PRD_REFS:   UC-SVC-02 · 01-scope.md:70 · R38 exclusion for business pipelines

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------

whatsNew, assimilate, and shop commit only when retrieval produced real sources; scaffold-only runs fail closed.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS
--------------------------------------------------------------------------------

- NEVER treat business-pipeline TAM/SAM/SOM scaffolding as in-scope — R38 / 01-scope exclusion.
- NEVER mark commit success when assayText is empty or only scaffold slots exist (runtime already checks assayText; keep that).
- NEVER hardcode a single external URL as "real retrieval" without going through the product's declared source path (subscriptions / repo / shop search).
- NEVER call live third-party shop APIs without the same allowlist discipline as S31-MCP-01 for CI flake.
- NEVER mock Postgres for PRIMARY ACs.

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] whatsNew retrieval stage returns ≥1 real source with provenance, 0 required scaffolds — AC-1 (PRIMARY)
- [ ] assimilate retrieval loads repository content for the target URL — AC-2
- [ ] shop retrieval returns products not labeled deterministic-scaffolding:* for known queries — AC-3
- [ ] scaffold-only commit path exits non-zero for each of the three templates — AC-4
- [ ] pipeline-components scaffold helpers remain labeled and unused on the happy path — AC-5
- [ ] PLATFORM_IT=1 pnpm test:integration passes + pnpm tsgo --noEmit clean

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA
--------------------------------------------------------------------------------

AC-1: whatsNew uses real subscription/source retrieval [PRIMARY]
  GIVEN: ≥1 subscription_sources row and content in nonprod
  WHEN:  holo mission run whatsNew --date <ISO date> --json
  THEN:  retrieval artifact lists ≥1 real source id; commit succeeds; 0 deterministic-scaffolding retailers required

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli+postgres
  TEST_FILE:     services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
  TEST_FUNCTION: whatsNewUsesRealRetrieval

  SCENARIO:
    START_REF:        pipeline_seed_corpus
    NEGATIVE_CONTROL: would fail if scaffold-only success | empty retrieval | mock mission runtime
    EVIDENCE:         api_response
    CASES:
      - ACTION: seed subscription content; run whatsNew; inspect retrieval + commit stages
        MUST_OBSERVE:
          - retrieval source count >= 1
          - each source id resolves to a Postgres row
          - commit status succeeded
          - report does not list retailer deterministic-scaffolding as the only product source
        MUST_NOT_OBSERVE:
          - retrieval source count 0 with commit success
          - assayText empty with commit success
          - success derived only from hash-stable scaffold titles

AC-2: assimilate retrieves repository content
  GIVEN: a public test repository URL seeded for assimilation
  WHEN:  holo mission run assimilate --repository-url <url> --json
  THEN:  retrieval stores non-empty file/text payload bound to that URL

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli
  TEST_FILE:     services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
  TEST_FUNCTION: assimilateRetrievesRepositoryContent

AC-3: shop returns non-scaffold products for known queries
  GIVEN: shop mission with query covered by live or fixture-backed search path
  WHEN:  holo mission run shop --query 'mechanical keyboard' --json
  THEN:  products array length >= 1 and no product.retailer starts with deterministic-scaffolding on the success path

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli
  TEST_FILE:     services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
  TEST_FUNCTION: shopReturnsNonScaffoldProducts

AC-4: Scaffold-only runs fail closed for all three templates
  GIVEN: retrieval forced to return only scaffold slots (test hook or empty sources)
  WHEN:  each of whatsNew, assimilate, shop attempts commit
  THEN:  each exits non-zero naming scaffold or empty retrieval

  TEST_TIER:             integration
  VERIFICATION_SERVICE:  mission-cli
  TEST_FILE:     services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
  TEST_FUNCTION: scaffoldOnlyCommitFailsClosed

AC-5: Scaffold helpers remain explicitly labeled
  GIVEN: pipeline-components.ts scaffold builders
  WHEN:  unit inspection of returned objects
  THEN:  every scaffold product/signal carries SCAFFOLD_NOTE or deterministic-scaffolding retailer

  TEST_TIER:             unit
  unit_test_justified: pure label check on scaffold builders; no service required
  VERIFICATION_SERVICE:  typescript
  TEST_FILE:     services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts
  TEST_FUNCTION: scaffoldHelpersRemainLabeled

--------------------------------------------------------------------------------
FIXTURES
--------------------------------------------------------------------------------

pipeline_seed_corpus (seed_method: public_api)
  - 1+ subscription_sources + subscription content rows for whatsNew
  - assimilate target repository URL reachable or hermetic fixture server
  - shop query path configured (live allowlisted or recorded fixture with provenance label)

--------------------------------------------------------------------------------
SCOPE
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/mission/runtime.ts (MODIFY — whatsNew/assimilate/shop retrieval + commit guards)
- services/platform/src/mission/templates/pipeline-components.ts (MODIFY — real retrieval hooks; keep labels)
- services/platform/src/mission/templates/**whats* (MODIFY)
- services/platform/src/mission/templates/**assimil* (MODIFY)
- services/platform/src/mission/templates/**shop* (MODIFY)
- services/platform/src/cli/holo.ts (MODIFY only mission flag wiring if needed)
- services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts (NEW)

writeProhibited:
- services/platform/src/mission/templates/business-report-components.ts live market data (R38 / 01-scope)
- Fulcrum mission logic
- MCP gateway tool implementations (S31-05)

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------

1. services/platform/src/mission/templates/pipeline-components.ts — scaffold builders + SCAFFOLD_NOTE
2. services/platform/src/mission/runtime.ts — whatsNew/assimilate/shop commit guards ~1374-1562
3. .spec/prds/mk6-migration/01-scope.md:70 — whatsNew/assimilate/shop regression in scope
4. services/platform/src/cli/mission-idempotency-key.ts — whatsNew/assimilate keys
5. .spec/prds/mk6-migration/tasks/sprint-22-all-agentic-pipelines-as-templates-agents/pipes-3-whatsnew-assimilate-shop-subscriptions-templates-sub-workflow-publish.md

--------------------------------------------------------------------------------
OUT OF SCOPE
--------------------------------------------------------------------------------

- Live market-data for four business pipelines (01-scope exclusion)
- Chat specialists (S31-04)
- MCP shop_products tool rehost (S31-05) except shared retrieval helpers if already present
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "S31-10",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "pipeline_seed_corpus": {
      "description": "Seeded subscription content, assimilate repo target, and shop query path",
      "seed_method": "public_api",
      "records": [
        "subscription_sources count >= 1",
        "subscription content rows >= 1",
        "assimilate repository URL configured"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "maps_to_ac": null,
      "description": "whatsNew uses real subscription/source retrieval",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "mission-cli+postgres",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "scaffold-only success",
          "empty retrieval",
          "mock mission runtime"
        ]
      },
      "evidence": {
        "artifact_type": "api_response",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "pipeline_seed_corpus",
          "action": {
            "actor": "cli_user",
            "steps": [
              "seed subscription content",
              "run holo mission run whatsNew --date <ISO> --json",
              "inspect retrieval and commit stages"
            ]
          },
          "end_state": {
            "must_observe": [
              "retrieval source count >= 1",
              "each source id resolves to a Postgres row",
              "commit status succeeded"
            ],
            "must_not_observe": [
              "retrieval source count 0 with commit success",
              "assayText empty with commit success",
              "success from hash-stable scaffold titles only"
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
      "description": "assimilate retrieves repository content",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts",
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
          "start_ref": "pipeline_seed_corpus",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-2",
              "Assert prose AC: assimilate retrieves repository content"
            ]
          },
          "end_state": {
            "must_observe": [
              "assimilate retrieves repository content"
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
      "description": "shop returns non-scaffold products for known queries",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts",
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
          "start_ref": "pipeline_seed_corpus",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-3",
              "Assert prose AC: shop returns non-scaffold products for known queries"
            ]
          },
          "end_state": {
            "must_observe": [
              "shop returns non-scaffold products for known queries"
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
      "description": "Scaffold-only runs fail closed for all three templates",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts",
      "tier": "visible",
      "test_tier": "integration",
      "verification_service": "mission-cli",
      "topology": "single-node",
      "negative_control": {
        "would_fail_if": [
          "scaffold-only exit 0",
          "empty retrieval ignored"
        ]
      },
      "evidence": {
        "artifact_type": "stdout",
        "required_capture": true
      },
      "cases": [
        {
          "start_ref": "pipeline_seed_corpus",
          "action": {
            "actor": "cli_user",
            "steps": [
              "force scaffold-only retrieval",
              "run whatsNew, assimilate, and shop commits"
            ]
          },
          "end_state": {
            "must_observe": [
              "3 of 3 templates exit != 0",
              "output names scaffold or empty retrieval"
            ],
            "must_not_observe": [
              "any template exit 0 on scaffold-only input"
            ]
          }
        }
      ]
    },
    {
      "id": "AC-5",
      "type": "acceptance_criterion",
      "primary": false,
      "maps_to_ac": null,
      "description": "Scaffold helpers remain explicitly labeled",
      "verify": "PLATFORM_IT=1 pnpm test:integration services/platform/tests/integration/sprint31-pipeline-real-retrieval.test.ts",
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
          "start_ref": "pipeline_seed_corpus",
          "action": {
            "actor": "cli_user",
            "steps": [
              "Execute verify command for AC-5",
              "Assert prose AC: Scaffold helpers remain explicitly labeled"
            ]
          },
          "end_state": {
            "must_observe": [
              "Scaffold helpers remain explicitly labeled"
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

**Report to:** team-lead once RED evidence and GREEN closeout are recorded.
