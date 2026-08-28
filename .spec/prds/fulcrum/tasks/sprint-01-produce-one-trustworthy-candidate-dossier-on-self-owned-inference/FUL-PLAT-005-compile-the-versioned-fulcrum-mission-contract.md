# FUL-PLAT-005 — Compile the versioned Fulcrum mission contract

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** B
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 3 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Ship the versioned Fulcrum fitness contract: a Zod schema for components, weights, the domain-tier ladder and source governance, compiled into append-only version rows and filling the evidence-research toolGrants for the fulcrum instantiation.

## Why

Compiling `dev-revenue` against real Postgres writes version 1 with 4 weight components and 8 domain tiers; a weight edit publishes version 2 while version 1 stays at 0.4; an unregistered tool grant is refused with FULCRUM_TOOL_GRANT_UNREGISTERED and writes nothing; the compiled fulcrum instantiation lists the six corpus tool ids under templateKey evidence-research.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod (services/platform/src/db/client.ts)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'
```

Full gate set: 5 acceptance criteria, 12 test criteria, 3 verification gates.

## Scope

- services/platform/src/fulcrum/contract.ts (NEW)
- services/platform/src/fulcrum/contract-compile.ts (NEW)
- services/platform/src/fulcrum/missions/dev-revenue.ts (NEW)
- services/platform/src/mission/contract.ts (MODIFY — toolGrants field only)
- services/platform/src/mission/templates/evidence-research.ts (MODIFY — toolGrants + version bump only)
- services/platform/tests/integration/fulcrum-mission-contract.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-005 - Compile the versioned Fulcrum mission contract
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     3
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave B)
PROPOSED_BY:mastra-planner
TDD_MODE:   red_first
RED_GREEN_REQUIRED: yes

RUNTIME_COMMANDS:
  test:      pnpm test:integration
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error

PROGRESS: 0/5 ACs complete

--------------------------------------------------------------------------------
OUTCOME (observable success)
--------------------------------------------------------------------------------

Compiling `dev-revenue` against real Postgres writes version 1 with 4 weight components and 8 domain tiers; a weight edit publishes version 2 while version 1 stays at 0.4; an unregistered tool grant is refused with FULCRUM_TOOL_GRANT_UNREGISTERED and writes nothing; the compiled fulcrum instantiation lists the six corpus tool ids under templateKey evidence-research.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST widen `toolGrants` in services/platform/src/mission/contract.ts from z.array(z.never()) to a closed enum of registered tool ids, keeping the existing empty-array default so every shipped template still parses
- MUST: MUST validate the whole contract before any write, so a refused compile leaves 0 ladder rows
- MUST: MUST persist the contract version so a later belief_scores row can stamp the weight and tier versions in force
- NEVER: NEVER create a distinct `fulcrum` mission template key — fulcrum is an instantiation tag on evidence-research
- NEVER: NEVER grant an outbound web tool; SENSE is corpus-only until the platform registers an outbound fetch tool
- NEVER: NEVER mutate a published weight_versions / domain_tier_versions row — publish version N+1
- STRICTLY: STRICTLY backward compatible with the five existing templates that pass `toolGrants: []` — run the full integration lane, not just this task's file

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-EVIDENCE-01, CAP-COMMIT-01
provides:             fulcrum-mission-contract-version, fulcrum-tool-grants, source-governance-policy, weight-version-rows, domain-tier-version-rows
consumes:             fulcrum-ledger-tables, mission-template-dsl
boundary_contracts:
  - One compile writes exactly one weight_versions row plus its weight_components and one domain_tier_versions row plus its domain_tiers — all appended, never updated
  - toolGrants accepts only the six registered corpus tool ids; an unregistered id fails compilation with FULCRUM_TOOL_GRANT_UNREGISTERED before any row is written
  - Ban-list and per-domain courtesy delays are Zod-validated fields that round-trip to Postgres so the retrieval client can enforce them
  - The fulcrum instantiation always compiles under templateKey evidence-research — never a distinct fulcrum template row

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Compiling the dev-revenue contract writes one versioned weight and tier set
- [ ] AC-2: Publishing version 2 leaves version 1 rows untouched
- [ ] AC-3: An unregistered tool grant fails compilation and writes nothing
- [ ] AC-4: Source governance fields are Zod-validated and round-trip through Postgres
- [ ] AC-5: The fulcrum instantiation compiles with the six corpus tool grants
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Compiling the dev-revenue contract writes one versioned weight and tier set [PRIMARY]
  GIVEN: a migrated holocron_nonprod holding 0 rows in `weight_versions` and 0 rows in `domain_tier_versions`
  WHEN:  the operator compiles the `dev-revenue` Fulcrum mission contract through the compile entrypoint
  THEN:  version 1 of both ladders is persisted with 4 weight components and 8 domain tiers

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-GATE-01 AC-1/AC-5
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the compile entrypoint validates the contract in memory and never writes to Postgres; the contract is a hardcoded TypeScript constant that no ladder table reflects, leaving the tables empty; the test asserts on the parsed Zod object rather than querying the persisted rows; the compile writes rows but omits the version numbers, so no belief score can stamp them
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: migrated_db_no_contract
        ACTOR:     cli_user
        STEP:      run the Fulcrum contract compile entrypoint for mission `dev-revenue` against holocron_nonprod
        STEP:      SELECT version, disconfirmation_multiplier FROM weight_versions
        STEP:      SELECT component, kind, weight, grade_floor, recency_window_days FROM weight_components
        STEP:      SELECT registrable_domain, tier, tier_value FROM domain_tiers
        MUST_OBSERVE:     `weight_versions` holds 1 row with `version` = 1 and `disconfirmation_multiplier` = 2
        MUST_OBSERVE:     `weight_components` holds 4 rows including component 'demand' at `weight` = 0.4
        MUST_OBSERVE:     `domain_tier_versions` holds 1 row with `version` = 1
        MUST_OBSERVE:     `domain_tiers` holds 8 rows including 'sec.gov' at `tier_value` = 1.0
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_versions` returns 0
        MUST_NOT_OBSERVE: `SELECT count(*) FROM domain_tiers` returns 0
        MUST_NOT_OBSERVE: a `weight_components` row with a NULL weight

AC-2: Publishing version 2 leaves version 1 rows untouched
  GIVEN: the `dev-revenue` contract already compiled at version 1 with 'demand' at weight 0.4
  WHEN:  the operator raises 'demand' to 0.6 and recompiles
  THEN:  version 2 rows are appended and the version 1 rows still read weight 0.4

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-GATE-01 AC-5 + UC-LED-06 AC-1
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the compile UPDATEs the existing weight_components row instead of appending a new version, erasing history; the version counter is hardcoded to 1 so a second compile collides; the append-only trigger is bypassed by connecting as the owner role in the product path
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: compiled_dev_revenue_v1
        ACTOR:     cli_user
        STEP:      edit the `dev-revenue` contract so component 'demand' carries weight 0.6
        STEP:      run the compile entrypoint again
        STEP:      SELECT version, component, weight FROM weight_components joined to weight_versions ORDER BY version
        MUST_OBSERVE:     `weight_versions` holds 2 rows with versions 1 and 2
        MUST_OBSERVE:     the version 1 'demand' row still reads `weight` = 0.4
        MUST_OBSERVE:     the version 2 'demand' row reads `weight` = 0.6
        MUST_OBSERVE:     the active version resolves to 2
        MUST_NOT_OBSERVE: the version 1 'demand' row now reads 0.6
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_versions` returns 1
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_components WHERE weight = 0.4` returns 0

AC-3: An unregistered tool grant fails compilation and writes nothing
  GIVEN: a migrated holocron_nonprod with 0 compiled contract versions
  WHEN:  the operator compiles a contract whose `toolGrants` names `exa_search`, which is not a registered Mastra corpus tool
  THEN:  compilation is refused with `FULCRUM_TOOL_GRANT_UNREGISTERED` and 0 rows are written

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 boundary: corpus tool allowlist
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if toolGrants stays typed as an always-empty array so no grant is ever validated and the check is unreachable; the grant list is validated after the ladder rows are written, leaving a partial contract; unknown grants are silently dropped instead of refused
    EVIDENCE:         api_response (required_capture=True)
    CASES:
      - START_REF: migrated_db_no_contract
        ACTOR:     cli_user
        STEP:      compile a `dev-revenue` variant whose `toolGrants` contains 'exa_search'
        STEP:      capture the thrown error code
        STEP:      SELECT count(*) FROM weight_versions and SELECT count(*) FROM domain_tier_versions
        MUST_OBSERVE:     the compile throws with code `FULCRUM_TOOL_GRANT_UNREGISTERED`
        MUST_OBSERVE:     the error message names the rejected grant 'exa_search'
        MUST_OBSERVE:     `SELECT count(*) FROM weight_versions` returns 0 after the refusal
        MUST_NOT_OBSERVE: the compile succeeds with an unregistered tool grant
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_versions` returns 1 after a refused compile
        MUST_NOT_OBSERVE: a generic error with no code

AC-4: Source governance fields are Zod-validated and round-trip through Postgres
  GIVEN: a `dev-revenue` contract declaring 2 banned domains and a per-domain courtesy delay of 1500 ms
  WHEN:  a malformed ban-list entry is submitted, then the valid contract is compiled
  THEN:  the malformed contract is rejected at a named Zod path and the valid one persists 2 banned domains

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-GATE-01 AC-2 + UC-CYC-04 governance
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if banList and courtesyDelayMs are accepted as untyped fields so a malformed entry passes and never reaches the retrieval client; the governance fields are validated but omitted before persistence, so the retrieval client sees an empty ban list; the schema uses z.any() for sourceRules
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: migrated_db_no_contract
        ACTOR:     cli_user
        STEP:      compile a contract whose `sourceRules.banList` contains the number 42 instead of a domain string
        STEP:      capture the Zod issue path
        MUST_OBSERVE:     the rejection names the path `sourceRules.banList.0`
        MUST_OBSERVE:     the rejection reports `expected: string, received: number`
        MUST_OBSERVE:     `SELECT count(*) FROM weight_versions` returns 0 after the refusal
        MUST_NOT_OBSERVE: the malformed contract compiles with no error
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_versions` returns 1 after a refused compile
        MUST_NOT_OBSERVE: an unnamed validation failure
      - START_REF: migrated_db_no_contract
        ACTOR:     cli_user
        STEP:      compile the valid `dev-revenue` contract declaring banList ['contentfarm.example', 'seospam.example'] and courtesyDelayMs 1500
        STEP:      read the persisted contract snapshot back from Postgres
        MUST_OBSERVE:     the persisted snapshot lists 2 banned domains 'contentfarm.example' and 'seospam.example'
        MUST_OBSERVE:     the persisted `courtesyDelayMs` reads 1500
        MUST_OBSERVE:     `SELECT count(*) FROM weight_versions` returns 1
        MUST_NOT_OBSERVE: the persisted ban list is empty
        MUST_NOT_OBSERVE: `courtesyDelayMs` reads 0
        MUST_NOT_OBSERVE: `SELECT count(*) FROM weight_versions` returns 0

AC-5: The fulcrum instantiation compiles with the six corpus tool grants
  GIVEN: the shared `evidence-research` mission template whose `toolGrants` ships empty
  WHEN:  the fulcrum instantiation is compiled through the mission template compiler
  THEN:  the compiled definition lists exactly the 6 registered corpus tool ids and the template key stays `evidence-research`

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-CYC-04 toolGrants
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-5'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if toolGrants remains z.array(z.never()) so the compiled array stays empty and the six ids cannot be expressed; the compile creates a separate 'fulcrum' template key instead of an instantiation of evidence-research; the grants are attached in memory but never persisted to definition_json
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: compiled_dev_revenue_v1
        ACTOR:     cli_user
        STEP:      compile the `evidence-research` template for instantiation `fulcrum` through services/platform/src/mission/compiler.ts
        STEP:      read the persisted `mission_template_versions.definition_json` toolGrants array and templateKey
        MUST_OBSERVE:     the compiled `toolGrants` lists all 6 ids `hybrid_search`, `search_fts`, `search_vector`, `search_research`, `get_research_session`, `get_document`
        MUST_OBSERVE:     the compiled `templateKey` reads 'evidence-research'
        MUST_OBSERVE:     `SELECT count(*) FROM mission_template_versions WHERE template_key = 'evidence-research'` returns at least 1
        MUST_NOT_OBSERVE: an empty `toolGrants` array
        MUST_NOT_OBSERVE: a `templateKey` of 'fulcrum' creating a distinct template row
        MUST_NOT_OBSERVE: a toolGrants entry naming an outbound web tool

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'` |
| TC-4 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'` |
| TC-5 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'` |
| TC-6 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'` |
| TC-7 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'` |
| TC-8 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'` |
| TC-9 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'` |
| TC-10 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'` |
| TC-11 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'` |
| TC-12 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-5'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/fulcrum/contract.ts (NEW)
- services/platform/src/fulcrum/contract-compile.ts (NEW)
- services/platform/src/fulcrum/missions/dev-revenue.ts (NEW)
- services/platform/src/mission/contract.ts (MODIFY — toolGrants field only)
- services/platform/src/mission/templates/evidence-research.ts (MODIFY — toolGrants + version bump only)
- services/platform/tests/integration/fulcrum-mission-contract.test.ts (NEW)

writeProhibited:
- services/platform/src/fulcrum/gate/** and services/platform/src/fulcrum/admission-writer.ts — owned by FUL-PLAT-002 (same wave)
- services/platform/src/mission/runtime.ts — owned by FUL-PLAT-006 / FUL-PLAT-008
- services/platform/src/mission/registry.ts — owned by FUL-PLAT-008
- services/platform/src/db/** — owned by FUL-PLAT-001
- services/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/mission/contract.ts (parseMissionTemplateDefinition) + services/platform/src/mission/compiler.ts

Strict Zod schema + a compile function that validates completely, then writes one version row per ladder inside a single transaction.

ANTI-PATTERN: Mutating the existing weight_components rows on edit. UC-LED-06 requires every historical belief_scores row to stay interpretable, which is only true if version N is immutable — and FUL-PLAT-001's trigger will reject the UPDATE anyway.

References:
- .spec/prds/fulcrum/07-uc-gate.md § UC-GATE-01 — the contract is the loop's constitution; editing it is how the operator steers
- .spec/prds/fulcrum/09-technical-requirements/04-api-design.md § Retrieval contract (SENSE) — the six tool ids and the governance fields

Notes:
- T
- w
- o
-  
- c
- o
- n
- t
- r
- a
- c
- t
- s
-  
- m
- e
- e
- t
-  
- h
- e
- r
- e
-  
- a
- n
- d
-  
- m
- u
- s
- t
-  
- n
- o
- t
-  
- b
- e
-  
- c
- o
- n
- f
- l
- a
- t
- e
- d
- .
-  
- T
- h
- e
-  
- m
- i
- s
- s
- i
- o
- n
-  
- T
- E
- M
- P
- L
- A
- T
- E
-  
- c
- o
- n
- t
- r
- a
- c
- t
-  
- (
- s
- e
- r
- v
- i
- c
- e
- s
- /
- p
- l
- a
- t
- f
- o
- r
- m
- /
- s
- r
- c
- /
- m
- i
- s
- s
- i
- o
- n
- /
- c
- o
- n
- t
- r
- a
- c
- t
- .
- t
- s
- )
-  
- i
- s
-  
- t
- h
- e
-  
- c
- l
- o
- s
- e
- d
-  
- e
- x
- e
- c
- u
- t
- i
- o
- n
-  
- D
- S
- L
-  
- —
-  
- t
- h
- i
- s
-  
- t
- a
- s
- k
-  
- o
- n
- l
- y
-  
- w
- i
- d
- e
- n
- s
-  
- i
- t
- s
-  
- t
- o
- o
- l
- G
- r
- a
- n
- t
- s
-  
- f
- i
- e
- l
- d
- .
-  
- T
- h
- e
-  
- F
- u
- l
- c
- r
- u
- m
-  
- F
- I
- T
- N
- E
- S
- S
-  
- c
- o
- n
- t
- r
- a
- c
- t
-  
- (
- s
- e
- r
- v
- i
- c
- e
- s
- /
- p
- l
- a
- t
- f
- o
- r
- m
- /
- s
- r
- c
- /
- f
- u
- l
- c
- r
- u
- m
- /
- c
- o
- n
- t
- r
- a
- c
- t
- .
- t
- s
- )
-  
- i
- s
-  
- n
- e
- w
- :
-  
- c
- o
- m
- p
- o
- n
- e
- n
- t
- s
- ,
-  
- w
- e
- i
- g
- h
- t
- s
- ,
-  
- t
- i
- e
- r
-  
- l
- a
- d
- d
- e
- r
- ,
-  
- g
- o
- v
- e
- r
- n
- a
- n
- c
- e
- ,
-  
- c
- a
- d
- e
- n
- c
- e
- .
-  
- T
- h
- e
-  
- f
- i
- t
- n
- e
- s
- s
-  
- c
- o
- n
- t
- r
- a
- c
- t
-  
- c
- o
- m
- p
- i
- l
- e
- s
-  
- i
- n
- t
- o
-  
- a
- p
- p
- e
- n
- d
- -
- o
- n
- l
- y
-  
- l
- a
- d
- d
- e
- r
-  
- r
- o
- w
- s
- ;
-  
- t
- h
- e
-  
- t
- e
- m
- p
- l
- a
- t
- e
-  
- c
- o
- n
- t
- r
- a
- c
- t
-  
- c
- o
- m
- p
- i
- l
- e
- s
-  
- i
- n
- t
- o
-  
- m
- i
- s
- s
- i
- o
- n
- _
- t
- e
- m
- p
- l
- a
- t
- e
- _
- v
- e
- r
- s
- i
- o
- n
- s
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/mission/contract.ts
   - Lines: 40-146
   - Focus: [PRIMARY PATTERN] MissionTemplateSchema strict Zod shape, the toolGrants: z.array(z.never()) field this task widens, and parseMissionTemplateDefinition's banned-executable-payload guard
2. services/platform/src/mission/templates/evidence-research.ts
   - Lines: 1-113
   - Focus: The shared template, its EVIDENCE_RESEARCH_INSTANTIATIONS list including 'fulcrum', and the empty toolGrants this task fills
3. services/platform/src/mission/compiler.ts
   - Lines: 1-120
   - Focus: How a template definition becomes a mission_template_versions row (definition_json), the persistence path AC-5 asserts against
4. services/platform/src/db/schema/fulcrum.ts
   - Lines: weight_versions / weight_components / domain_tier_versions / domain_tiers (delivered by FUL-PLAT-001)
   - Focus: The exact columns the compile writes, including grade_floor, recency_window_days, half_life_days and rubric_json
5. services/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts
   - Lines: 1-80
   - Focus: Closest existing test of a mission-contract compile against real Postgres — definition_json assertions and template-version conventions

--------------------------------------------------------------------------------
AGENT INSTRUCTIONS (TDD Flow)
--------------------------------------------------------------------------------

FOR EACH ACCEPTANCE CRITERION, in order:

  RED    — write ONE test exercising GIVEN-WHEN-THEN against the REAL service named in
           VERIFICATION_SERVICE. Run it. It must FAIL (fail, not error) against the
           start state. Capture the failure output. Write NO implementation code.
  GREEN  — write the MINIMAL code that turns that test green. Nothing beyond the AC.
  REFACTOR — improve without introducing new behavior. Tests stay green.

  The RED proof must be observed against the scenario's start state — a test that
  passes without the seeded behavior present is a FAIL, not a pass.

--------------------------------------------------------------------------------
VERIFICATION GATES
--------------------------------------------------------------------------------

Gate 1: None
  Command:  pnpm test:integration
  Expected: None

Gate 2: None
  Command:  pnpm tsgo --noEmit
  Expected: None

Gate 3: None
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/fulcrum/contract.ts services/platform/src/fulcrum/contract-compile.ts services/platform/src/fulcrum/missions/dev-revenue.ts services/platform/src/mission/contract.ts services/platform/src/mission/templates/evidence-research.ts services/platform/tests/integration/fulcrum-mission-contract.test.ts
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Touches the Mastra mission-template DSL (services/platform/src/mission/contract.ts + templates) and a new Zod fitness-contract compiler — the agent-platform surface this triad owns, verified by real Postgres ladder rows.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- The fitness contract is a strict Zod object (.strict()) — no passthrough, no z.any(), no free-form Record on governance fields
- Tool grant ids are a z.enum over a single exported const array so the registry and the schema cannot drift
- Error codes are a closed string-literal union (FULCRUM_TOOL_GRANT_UNREGISTERED, FULCRUM_CONTRACT_INVALID) thrown as a typed error, matching MissionRuntimeError conventions
- The compile writes all ladder rows in one transaction so a mid-write failure leaves 0 rows

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: FUL-PLAT-001
Blocks:     FUL-PLAT-004, FUL-PLAT-006, FUL-PLAT-008
Wave:       B

--------------------------------------------------------------------------------
REVIEW
--------------------------------------------------------------------------------

Must pass:
- One test per AC; tests verify behavior, not implementation
- RED evidence present for every AC before its GREEN
- PRIMARY AC scenario passes validate_scenario (exit 0), evidence artifact captured
- Minimal implementation; no gold-plating
- SCOPE respected (git diff --name-only ⊆ writeAllowed)

Verdict: [APPROVED | NEEDS_FIXES]

================================================================================
```

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "FUL-PLAT-005",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_db_no_contract": {
      "description": "holocron_nonprod migrated by `holo db:migrate` with no Fulcrum mission contract compiled yet",
      "seed_method": "cli",
      "records": [
        "`SELECT count(*) FROM weight_versions` returns 0",
        "`SELECT count(*) FROM domain_tier_versions` returns 0",
        "`SELECT count(*) FROM domain_tiers` returns 0"
      ]
    },
    "compiled_dev_revenue_v1": {
      "description": "the `dev-revenue` mission contract compiled once \u2014 weight_versions version 1 with 4 weight_components and domain_tier_versions version 1 with 8 domain_tiers",
      "seed_method": "cli",
      "records": [
        "`weight_versions` holds 1 row with `version` = 1",
        "`weight_components` holds 4 rows including 'demand' at weight 0.4",
        "`domain_tier_versions` holds 1 row with `version` = 1",
        "`domain_tiers` holds 8 rows including 'sec.gov' at tier_value 1.0"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a migrated holocron_nonprod holding 0 rows in `weight_versions` and 0 rows in `domain_tier_versions` WHEN the operator compiles the `dev-revenue` Fulcrum mission contract through the compile entrypoint THEN version 1 of both ladders is persisted with 4 weight components and 8 domain tiers",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the compile entrypoint validates the contract in memory and never writes to Postgres",
            "the contract is a hardcoded TypeScript constant that no ladder table reflects, leaving the tables empty",
            "the test asserts on the parsed Zod object rather than querying the persisted rows",
            "the compile writes rows but omits the version numbers, so no belief score can stamp them"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_db_no_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run the Fulcrum contract compile entrypoint for mission `dev-revenue` against holocron_nonprod",
                "SELECT version, disconfirmation_multiplier FROM weight_versions",
                "SELECT component, kind, weight, grade_floor, recency_window_days FROM weight_components",
                "SELECT registrable_domain, tier, tier_value FROM domain_tiers"
              ]
            },
            "end_state": {
              "must_observe": [
                "`weight_versions` holds 1 row with `version` = 1 and `disconfirmation_multiplier` = 2",
                "`weight_components` holds 4 rows including component 'demand' at `weight` = 0.4",
                "`domain_tier_versions` holds 1 row with `version` = 1",
                "`domain_tiers` holds 8 rows including 'sec.gov' at `tier_value` = 1.0"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM weight_versions` returns 0",
                "`SELECT count(*) FROM domain_tiers` returns 0",
                "a `weight_components` row with a NULL weight"
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
      "description": "GIVEN the `dev-revenue` contract already compiled at version 1 with 'demand' at weight 0.4 WHEN the operator raises 'demand' to 0.6 and recompiles THEN version 2 rows are appended and the version 1 rows still read weight 0.4",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the compile UPDATEs the existing weight_components row instead of appending a new version, erasing history",
            "the version counter is hardcoded to 1 so a second compile collides",
            "the append-only trigger is bypassed by connecting as the owner role in the product path"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "compiled_dev_revenue_v1",
            "action": {
              "actor": "cli_user",
              "steps": [
                "edit the `dev-revenue` contract so component 'demand' carries weight 0.6",
                "run the compile entrypoint again",
                "SELECT version, component, weight FROM weight_components joined to weight_versions ORDER BY version"
              ]
            },
            "end_state": {
              "must_observe": [
                "`weight_versions` holds 2 rows with versions 1 and 2",
                "the version 1 'demand' row still reads `weight` = 0.4",
                "the version 2 'demand' row reads `weight` = 0.6",
                "the active version resolves to 2"
              ],
              "must_not_observe": [
                "the version 1 'demand' row now reads 0.6",
                "`SELECT count(*) FROM weight_versions` returns 1",
                "`SELECT count(*) FROM weight_components WHERE weight = 0.4` returns 0"
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
      "description": "GIVEN a migrated holocron_nonprod with 0 compiled contract versions WHEN the operator compiles a contract whose `toolGrants` names `exa_search`, which is not a registered Mastra corpus tool THEN compilation is refused with `FULCRUM_TOOL_GRANT_UNREGISTERED` and 0 rows are written",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "toolGrants stays typed as an always-empty array so no grant is ever validated and the check is unreachable",
            "the grant list is validated after the ladder rows are written, leaving a partial contract",
            "unknown grants are silently dropped instead of refused"
          ]
        },
        "evidence": {
          "artifact_type": "api_response",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_db_no_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compile a `dev-revenue` variant whose `toolGrants` contains 'exa_search'",
                "capture the thrown error code",
                "SELECT count(*) FROM weight_versions and SELECT count(*) FROM domain_tier_versions"
              ]
            },
            "end_state": {
              "must_observe": [
                "the compile throws with code `FULCRUM_TOOL_GRANT_UNREGISTERED`",
                "the error message names the rejected grant 'exa_search'",
                "`SELECT count(*) FROM weight_versions` returns 0 after the refusal"
              ],
              "must_not_observe": [
                "the compile succeeds with an unregistered tool grant",
                "`SELECT count(*) FROM weight_versions` returns 1 after a refused compile",
                "a generic error with no code"
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
      "description": "GIVEN a `dev-revenue` contract declaring 2 banned domains and a per-domain courtesy delay of 1500 ms WHEN a malformed ban-list entry is submitted, then the valid contract is compiled THEN the malformed contract is rejected at a named Zod path and the valid one persists 2 banned domains",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "banList and courtesyDelayMs are accepted as untyped fields so a malformed entry passes and never reaches the retrieval client",
            "the governance fields are validated but omitted before persistence, so the retrieval client sees an empty ban list",
            "the schema uses z.any() for sourceRules"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_db_no_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compile a contract whose `sourceRules.banList` contains the number 42 instead of a domain string",
                "capture the Zod issue path"
              ]
            },
            "end_state": {
              "must_observe": [
                "the rejection names the path `sourceRules.banList.0`",
                "the rejection reports `expected: string, received: number`",
                "`SELECT count(*) FROM weight_versions` returns 0 after the refusal"
              ],
              "must_not_observe": [
                "the malformed contract compiles with no error",
                "`SELECT count(*) FROM weight_versions` returns 1 after a refused compile",
                "an unnamed validation failure"
              ]
            }
          },
          {
            "start_ref": "migrated_db_no_contract",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compile the valid `dev-revenue` contract declaring banList ['contentfarm.example', 'seospam.example'] and courtesyDelayMs 1500",
                "read the persisted contract snapshot back from Postgres"
              ]
            },
            "end_state": {
              "must_observe": [
                "the persisted snapshot lists 2 banned domains 'contentfarm.example' and 'seospam.example'",
                "the persisted `courtesyDelayMs` reads 1500",
                "`SELECT count(*) FROM weight_versions` returns 1"
              ],
              "must_not_observe": [
                "the persisted ban list is empty",
                "`courtesyDelayMs` reads 0",
                "`SELECT count(*) FROM weight_versions` returns 0"
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
      "description": "GIVEN the shared `evidence-research` mission template whose `toolGrants` ships empty WHEN the fulcrum instantiation is compiled through the mission template compiler THEN the compiled definition lists exactly the 6 registered corpus tool ids and the template key stays `evidence-research`",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "toolGrants remains z.array(z.never()) so the compiled array stays empty and the six ids cannot be expressed",
            "the compile creates a separate 'fulcrum' template key instead of an instantiation of evidence-research",
            "the grants are attached in memory but never persisted to definition_json"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "compiled_dev_revenue_v1",
            "action": {
              "actor": "cli_user",
              "steps": [
                "compile the `evidence-research` template for instantiation `fulcrum` through services/platform/src/mission/compiler.ts",
                "read the persisted `mission_template_versions.definition_json` toolGrants array and templateKey"
              ]
            },
            "end_state": {
              "must_observe": [
                "the compiled `toolGrants` lists all 6 ids `hybrid_search`, `search_fts`, `search_vector`, `search_research`, `get_research_session`, `get_document`",
                "the compiled `templateKey` reads 'evidence-research'",
                "`SELECT count(*) FROM mission_template_versions WHERE template_key = 'evidence-research'` returns at least 1"
              ],
              "must_not_observe": [
                "an empty `toolGrants` array",
                "a `templateKey` of 'fulcrum' creating a distinct template row",
                "a toolGrants entry naming an outbound web tool"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Compiling dev-revenue writes exactly 1 weight_versions row at version 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "Compiling dev-revenue writes exactly 4 weight_components rows for version 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "Compiling dev-revenue writes exactly 1 domain_tier_versions row at version 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Compiling dev-revenue writes exactly 8 domain_tiers rows for version 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "Recompiling after a weight edit appends a weight_versions row at version 2",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "The version 1 demand weight still reads 0.4 after version 2 is published",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "A contract naming toolGrant 'exa_search' throws FULCRUM_TOOL_GRANT_UNREGISTERED",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A refused compile leaves weight_versions at 0 rows",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-9",
      "type": "test_criterion",
      "description": "A ban-list entry of type number is rejected at Zod path sourceRules.banList.0",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-10",
      "type": "test_criterion",
      "description": "The persisted contract snapshot returns 2 banned domains",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-11",
      "type": "test_criterion",
      "description": "The persisted contract snapshot returns courtesyDelayMs 1500",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-12",
      "type": "test_criterion",
      "description": "The compiled fulcrum instantiation persists 6 toolGrants under templateKey evidence-research",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-mission-contract.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>
