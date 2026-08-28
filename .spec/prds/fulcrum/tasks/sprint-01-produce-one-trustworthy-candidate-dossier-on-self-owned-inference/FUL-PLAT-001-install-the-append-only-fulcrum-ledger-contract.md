# FUL-PLAT-001 — Install the append-only Fulcrum ledger contract
> Status: ✅ Completed
> Cycle: 1
> Commit: 4b41c3ca78e18a9870d03b356dfcccff0f5892dd
> Reviewer: mastra-reviewer
> Completed: 2026-08-28T08:22:40Z

> **Sprint:** [sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference](./SPRINT.md) · **Wave:** A
> **Assignee:** mastra-implementer · **Reviewer:** mastra-reviewer
> **Priority:** P0 · **Points:** 5 · **Type:** FEATURE
> **Proposed by:** mastra-planner
> **TDD mode:** `red_first` · **RED_GREEN_REQUIRED:** yes
> Status: Backlog

## What this does

Ship the nine new Fulcrum Drizzle tables plus the sources/claims column extensions as one contiguous migration whose append-only and stamping invariants are enforced by Postgres itself.

## Why

`holo db:migrate` against holocron_nonprod creates candidates, belief_scores, weight_versions, weight_components, domain_tier_versions, domain_tiers, touches, probes and claim_evidence_bindings; an appended belief_scores row stamped with both versions survives; UPDATE and DELETE on it raise as holocron_app.

## How to verify

Primary acceptance criterion **AC-1** (integration tier, service: real Postgres holocron_nonprod (services/platform/src/db/client.ts)):

```
PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'
```

Full gate set: 5 acceptance criteria, 8 test criteria, 4 verification gates.

## Scope

- services/platform/src/db/schema/fulcrum.ts (NEW)
- services/platform/src/db/schema/evidence.ts (MODIFY — additive columns on sources and claims only)
- services/platform/src/db/schema/index.ts (MODIFY — barrel export + DOMAIN_TABLE_NAMES)
- services/platform/src/db/migrations/0041_fulcrum_ledger.sql (NEW)
- services/platform/tests/integration/fulcrum-ledger-contract.test.ts (NEW)

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

```
================================================================================
TASK: FUL-PLAT-001 - Install the append-only Fulcrum ledger contract
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
POINTS:     5
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
SPRINT:     sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference (wave A)
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

`holo db:migrate` against holocron_nonprod creates candidates, belief_scores, weight_versions, weight_components, domain_tier_versions, domain_tiers, touches, probes and claim_evidence_bindings; an appended belief_scores row stamped with both versions survives; UPDATE and DELETE on it raise as holocron_app.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier — read before acting)
--------------------------------------------------------------------------------

- MUST: MUST add migration `0041_fulcrum_ledger.sql` with a contiguous ordinal — `checkMigrationOrdinals` in services/platform/src/db/migrate.ts fails closed on a gap or collision
- MUST: MUST enforce append-only with Postgres triggers plus role grants, mirroring services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
- MUST: MUST register every new table name in DOMAIN_TABLE_NAMES in services/platform/src/db/schema/index.ts so `holo db:verify` counts them
- NEVER: NEVER create the names `prospects`, `cycles`, `scores`, or `fulcrumCycles` — the PRD forbids the Prospector port outright
- NEVER: NEVER drop or rewrite an existing migration file; append 0041 only
- NEVER: NEVER weaken the existing beliefs immutability grants while adding the new ones
- STRICTLY: STRICTLY additive to services/platform/src/db/schema/evidence.ts — add columns to sources and claims, change no existing column type or index

--------------------------------------------------------------------------------
CAPABILITY CHAIN
--------------------------------------------------------------------------------

touches_capabilities: CAP-COMMIT-01, CAP-EVIDENCE-01, CAP-PUBLISH-01
provides:             fulcrum-ledger-tables, sources-fetch-artifact-columns, claims-admission-columns, append-only-write-barrier
consumes:             postgres-evidence-graph, mission-runs-idempotency-key
boundary_contracts:
  - Append-only tables (belief_scores, weight_versions, weight_components, domain_tier_versions, domain_tiers, touches, probes, claim_evidence_bindings) reject UPDATE and DELETE at the Postgres layer for the holocron_app role, not in application code
  - Every belief_scores row references exactly one weight_version and one domain_tier_version — both NOT NULL
  - sources.content_hash stays unique so byte-identical content dedupes to exactly one sources row
  - claims.status is CHECK-constrained to admitted|provisional|contested|refuted — no free-form status value is storable

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------

- [ ] AC-1 (PRIMARY): Fulcrum ledger tables accept an appended belief score
- [ ] AC-2: Append-only barrier rejects UPDATE and DELETE
- [ ] AC-3: Belief score requires both version stamps
- [ ] AC-4: Sources fetch-artifact columns dedupe on content hash
- [ ] AC-5: Claims admission columns reject an unknown status
- [ ] pnpm test:integration passes + pnpm tsgo --noEmit clean
- [ ] Only writeAllowed files modified (git diff --name-only)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD Beads — ordered happy-path first)
--------------------------------------------------------------------------------

AC-1: Fulcrum ledger tables accept an appended belief score [PRIMARY]
  GIVEN: a holocron_nonprod database migrated by `holo db:migrate` with 0 rows in `belief_scores`
  WHEN:  the implementer appends one `belief_scores` row stamped with weight_version 1 and domain_tier_version 1 through the holocron_app product role
  THEN:  the 9 Fulcrum tables exist and `belief_scores` returns exactly 1 stamped row

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-COMMIT-01 → UC-LED-05 persistence
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if migration 0041 is absent so `belief_scores` does not exist and the insert errors; the Drizzle table definitions are declared but no SQL migration file is emitted, leaving the schema static; the test asserts on the Drizzle TypeScript object instead of querying real Postgres (mocked client)
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: seeded_fulcrum_versions
        ACTOR:     cli_user
        STEP:      run `bun services/platform/src/cli/holo.ts db:migrate` against holocron_nonprod
        STEP:      INSERT one row into `belief_scores` with `score` = 0.62, `weight_version` = 1, `domain_tier_version` = 1 as holocron_app
        STEP:      SELECT id, score, weight_version, domain_tier_version FROM belief_scores
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 1
        MUST_OBSERVE:     the returned row has `score` = 0.62
        MUST_OBSERVE:     the returned row has `weight_version` = 1 and `domain_tier_version` = 1
        MUST_OBSERVE:     `information_schema.tables` lists all 9 names `candidates`, `belief_scores`, `weight_versions`, `weight_components`, `domain_tier_versions`, `domain_tiers`, `touches`, `probes`, `claim_evidence_bindings`
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: error `relation "belief_scores" does not exist`
        MUST_NOT_OBSERVE: a `fulcrumCycles` or `prospects` or `scores` table name

AC-2: Append-only barrier rejects UPDATE and DELETE
  GIVEN: a `belief_scores` row with `score` = 0.62 appended as holocron_app
  WHEN:  holocron_app attempts `UPDATE belief_scores SET score = 0.99` and then `DELETE FROM belief_scores`
  THEN:  both statements raise and the row still reads `score` = 0.62

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-COMMIT-01 boundary: append-only ledger
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the append-only rule is enforced only in TypeScript so a direct SQL UPDATE silently succeeds; the trigger is omitted from migration 0041, leaving the table static and mutable; the test runs as the migration owner role instead of holocron_app, bypassing the barrier
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: seeded_fulcrum_versions
        ACTOR:     cli_user
        STEP:      INSERT one `belief_scores` row with `score` = 0.62 as holocron_app
        STEP:      attempt `UPDATE belief_scores SET score = 0.99` as holocron_app
        STEP:      attempt `DELETE FROM belief_scores` as holocron_app
        STEP:      SELECT score FROM belief_scores
        MUST_OBSERVE:     the UPDATE raises an error naming `belief_scores` as append-only
        MUST_OBSERVE:     the DELETE raises an error naming `belief_scores` as append-only
        MUST_OBSERVE:     `SELECT score FROM belief_scores` still returns 0.62
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 1
        MUST_NOT_OBSERVE: `SELECT score FROM belief_scores` returns 0.99
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: UPDATE succeeds with no error raised
      - START_REF: seeded_fulcrum_versions
        ACTOR:     cli_user
        STEP:      attempt `UPDATE weight_components SET weight = 0.9` as holocron_app
        STEP:      attempt `DELETE FROM domain_tiers` as holocron_app
        MUST_OBSERVE:     the `weight_components` UPDATE raises an append-only error
        MUST_OBSERVE:     the `domain_tiers` DELETE raises an append-only error
        MUST_OBSERVE:     `SELECT count(*) FROM domain_tiers` still returns 8
        MUST_NOT_OBSERVE: `SELECT count(*) FROM domain_tiers` returns 0
        MUST_NOT_OBSERVE: no error raised on the DELETE

AC-3: Belief score requires both version stamps
  GIVEN: a migrated database holding weight_versions version 1 and domain_tier_versions version 1
  WHEN:  an insert into `belief_scores` omits `domain_tier_version`
  THEN:  the insert is rejected and `belief_scores` still holds 0 rows

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-05 version stamping
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-3'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the columns are declared nullable so an unstamped score row is accepted; the stamp check lives in application code that the test bypasses with direct SQL; the migration is empty and the insert succeeds against the pre-Fulcrum schema
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: migrated_nonprod_db
        ACTOR:     cli_user
        STEP:      attempt INSERT INTO belief_scores (candidate_id, score, weight_version) VALUES ('c1', 0.42, 1) with no `domain_tier_version`
        STEP:      SELECT count(*) FROM belief_scores
        MUST_OBSERVE:     the insert raises a not-null violation naming `domain_tier_version`
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: a `belief_scores` row with `domain_tier_version` NULL
        MUST_NOT_OBSERVE: the insert succeeding with no error raised
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 1
      - START_REF: seeded_fulcrum_versions
        ACTOR:     cli_user
        STEP:      INSERT INTO belief_scores with `weight_version` = 1 and `domain_tier_version` = 1
        STEP:      SELECT weight_version, domain_tier_version FROM belief_scores
        MUST_OBSERVE:     the stored row reads `weight_version` = 1 and `domain_tier_version` = 1
        MUST_OBSERVE:     `SELECT count(*) FROM belief_scores` returns 1
        MUST_NOT_OBSERVE: `SELECT count(*) FROM belief_scores` returns 0
        MUST_NOT_OBSERVE: a NULL `weight_version`

AC-4: Sources fetch-artifact columns dedupe on content hash
  GIVEN: a `sources` row seeded by `holo evidence:seed` carrying a 64-character `content_hash` and 1200-character `normalized_text`
  WHEN:  a second insert reuses the identical `content_hash`
  THEN:  the duplicate insert is rejected and `sources` still holds 1 row for that hash

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → fetch artifact columns
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-4'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the new `sources` columns are added to the Drizzle file but not to migration 0041, so the SELECT errors on a missing column; the unique index is removed, allowing a duplicate content hash; the test asserts the TypeScript column list rather than querying the live table
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: seeded_evidence_source
        ACTOR:     cli_user
        STEP:      SELECT normalized_text, retrieved_at, source_domain, provenance_group, self_sourced FROM sources
        STEP:      attempt a second INSERT INTO sources reusing the same `content_hash`
        STEP:      SELECT count(*) FROM sources WHERE content_hash = the seeded digest
        MUST_OBSERVE:     the seeded row reports `length(normalized_text)` = 1200
        MUST_OBSERVE:     the seeded row carries a non-null `retrieved_at` timestamptz
        MUST_OBSERVE:     the duplicate insert raises a unique violation on `sources_content_hash_uidx`
        MUST_OBSERVE:     `SELECT count(*) FROM sources WHERE content_hash = digest` returns 1
        MUST_NOT_OBSERVE: `SELECT count(*) FROM sources WHERE content_hash = digest` returns 2
        MUST_NOT_OBSERVE: `normalized_text` is NULL or empty
        MUST_NOT_OBSERVE: column `normalized_text` does not exist

AC-5: Claims admission columns reject an unknown status
  GIVEN: a `claims` row bound to the seeded source
  WHEN:  an update path writes `status` = 'approved' rather than one of the four allowed values
  THEN:  the write is rejected by the CHECK constraint and `status` stays 'provisional'

  TEST_TIER:            integration
  VERIFICATION_SERVICE: real Postgres holocron_nonprod (services/platform/src/db/client.ts)
  FLOW_REF:             CAP-EVIDENCE-01 → UC-LED-02 admission columns
  TDD_STATE:            none
  VERIFY:               PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-5'

  SCENARIO (the proof, not the claim — SCENARIO-CONTRACT-V1):
    TIER:             visible
    TOPOLOGY:         single-node
    SERVICE:          real Postgres holocron_nonprod (services/platform/src/db/client.ts)
    NEGATIVE_CONTROL: would fail if the status CHECK constraint is omitted so any free-form status string is stored; the admission columns are declared in Drizzle only, leaving the live table static; the test mocks the sql client and asserts on the call arguments
    EVIDENCE:         db_query (required_capture=True)
    CASES:
      - START_REF: seeded_evidence_source
        ACTOR:     cli_user
        STEP:      INSERT INTO claims with `status` = 'provisional', `passes_gate` = false, `component` = 'demand'
        STEP:      attempt INSERT INTO claims with `status` = 'approved'
        STEP:      SELECT status, passes_gate, qualifying_grade, polarity FROM claims
        MUST_OBSERVE:     the 'approved' insert raises a check violation naming `claims_status_check`
        MUST_OBSERVE:     the stored row reads `status` = 'provisional' and `passes_gate` = false
        MUST_OBSERVE:     `SELECT count(*) FROM claims WHERE status = 'provisional'` returns 1
        MUST_NOT_OBSERVE: a `claims` row with `status` = 'approved'
        MUST_NOT_OBSERVE: `SELECT count(*) FROM claims WHERE status = 'provisional'` returns 0
        MUST_NOT_OBSERVE: column `passes_gate` does not exist

--------------------------------------------------------------------------------
TEST CRITERIA (boolean — each maps to an AC)
--------------------------------------------------------------------------------

| ID | Statement | Maps to | Verify |
|----|-----------|---------|--------|
| TC-1 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'` |
| TC-2 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'` |
| TC-3 |  | AC-1 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'` |
| TC-4 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'` |
| TC-5 |  | AC-2 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'` |
| TC-6 |  | AC-3 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-3'` |
| TC-7 |  | AC-4 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-4'` |
| TC-8 |  | AC-5 | `PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-5'` |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/db/schema/fulcrum.ts (NEW)
- services/platform/src/db/schema/evidence.ts (MODIFY — additive columns on sources and claims only)
- services/platform/src/db/schema/index.ts (MODIFY — barrel export + DOMAIN_TABLE_NAMES)
- services/platform/src/db/migrations/0041_fulcrum_ledger.sql (NEW)
- services/platform/tests/integration/fulcrum-ledger-contract.test.ts (NEW)

writeProhibited:
- services/platform/src/db/migrations/0000_*.sql through 0040_*.sql — historical migrations are immutable
- services/platform/src/fulcrum/** — owned by FUL-PLAT-002..006
- services/platform/src/mission/** — owned by FUL-PLAT-005/006/008
- services/platform/src/cli/holo.ts — owned by FUL-PLAT-012
- Any file not listed in write_allowed
- Any file not explicitly listed above

--------------------------------------------------------------------------------
CODE PATTERN
--------------------------------------------------------------------------------

Source: services/platform/src/db/schema/evidence.ts + services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql

Drizzle pgTable definitions in a domain schema file + a numbered SQL migration that also installs triggers/grants; barrel registration in db/schema/index.ts.

ANTI-PATTERN: Declaring the tables in TypeScript only and relying on `db:push`. The PRD's invariants are Postgres-enforced; a Drizzle-only declaration leaves the live database static and every downstream append-only claim unprovable.

References:
- .spec/prds/fulcrum/09-technical-requirements/03-data-schema.md § C (the exact Drizzle table shapes to ship)
- services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql (the append-only precedent already in this repo)

Notes:
- T
- h
- e
-  
- n
- i
- n
- e
-  
- t
- a
- b
- l
- e
- s
-  
- l
- a
- n
- d
-  
- i
- n
-  
- o
- n
- e
-  
- n
- e
- w
-  
- s
- c
- h
- e
- m
- a
-  
- f
- i
- l
- e
-  
- r
- a
- t
- h
- e
- r
-  
- t
- h
- a
- n
-  
- b
- e
- i
- n
- g
-  
- s
- p
- r
- i
- n
- k
- l
- e
- d
-  
- i
- n
- t
- o
-  
- e
- v
- i
- d
- e
- n
- c
- e
- .
- t
- s
- ,
-  
- b
- e
- c
- a
- u
- s
- e
-  
- e
- v
- i
- d
- e
- n
- c
- e
- .
- t
- s
-  
- i
- s
-  
- t
- h
- e
-  
- p
- r
- e
- -
- e
- x
- i
- s
- t
- i
- n
- g
-  
- l
- i
- v
- e
-  
- g
- r
- a
- p
- h
-  
- a
- n
- d
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
- m
- u
- s
- t
-  
- s
- t
- a
- y
-  
- s
- t
- r
- i
- c
- t
- l
- y
-  
- a
- d
- d
- i
- t
- i
- v
- e
-  
- t
- h
- e
- r
- e
- .
-  
- T
- h
- e
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
- b
- a
- r
- r
- i
- e
- r
-  
- i
- s
-  
- a
-  
- t
- r
- i
- g
- g
- e
- r
-  
- +
-  
- R
- E
- V
- O
- K
- E
-  
- p
- a
- i
- r
- ,
-  
- n
- o
- t
-  
- a
- n
-  
- a
- p
- p
- -
- l
- e
- v
- e
- l
-  
- g
- u
- a
- r
- d
- ,
-  
- s
- o
-  
- a
-  
- l
- a
- t
- e
- r
-  
- t
- a
- s
- k
-  
- c
- a
- n
- n
- o
- t
-  
- a
- c
- c
- i
- d
- e
- n
- t
- a
- l
- l
- y
-  
- m
- u
- t
- a
- t
- e
-  
- h
- i
- s
- t
- o
- r
- y
-  
- t
- h
- r
- o
- u
- g
- h
-  
- a
-  
- r
- a
- w
-  
- s
- q
- l
- `
- `
-  
- c
- a
- l
- l
- .

--------------------------------------------------------------------------------
READING LIST (max 5 — canonical pattern first)
--------------------------------------------------------------------------------

1. services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
   - Lines: 1-60
   - Focus: [PRIMARY PATTERN] role split (holocron_app vs holocron_owner), REVOKE/GRANT shape, `--> statement-breakpoint` separator, DO-block role guards
2. services/platform/src/db/schema/evidence.ts
   - Lines: 28-105
   - Focus: Existing sources/claims table definitions, idColumn()/typedJsonb()/createdAtColumn() helpers, check() + uniqueIndex() usage — the columns this task extends
3. services/platform/src/db/schema/index.ts
   - Lines: 1-60 and the DOMAIN_TABLE_NAMES block
   - Focus: Barrel export + flat `schema` object + the ordered physical table-name list that `holo db:verify` counts
4. services/platform/src/db/migrate.ts
   - Lines: 1-60
   - Focus: checkMigrationOrdinals gate — ORDINAL_COLLISION / ORDINAL_GAP fail closed before any apply
5. services/platform/tests/integration/research-evidence-core.test.ts
   - Lines: 1-70
   - Focus: Integration-lane conventions: beforeAll throws without PLATFORM_IT, DATABASE_URL must target holocron_nonprod, no it.skip, real createSql client

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
  Command:  pnpm biome check --write --no-errors-on-unmatched --diagnostic-level=error services/platform/src/db/schema/fulcrum.ts services/platform/src/db/schema/evidence.ts services/platform/src/db/schema/index.ts services/platform/tests/integration/fulcrum-ledger-contract.test.ts
  Expected: None

Gate 4: None
  Command:  pnpm test:live
  Expected: None

Gate S: Scenario is un-fakeable (PRIMARY) — supersedes 'Exit 0' as the bar for done.
  Verify: validate_scenario.py passes on the PRIMARY AC scenario (exit 0).
  Verify: RED-against-start observed and recorded before green.
  Verify: captured evidence shows the seeded MUST_OBSERVE value, not merely 'tests passed'.

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale:   Drizzle schema + SQL migration + Postgres-enforced invariants inside services/platform/src — the MK-VI backend platform this triad owns; verification is a real-Postgres integration lane, which mastra-implementer runs by contract.
Reviewer:    mastra-reviewer

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------

- Reuse the column helpers from services/platform/src/db/columns.ts (idColumn, typedJsonb, timestamptz, createdAtColumn) — do not hand-roll column builders
- Every enum-like text column gets a CHECK constraint built from a values array in services/platform/src/db/enums.ts, matching sourceKindValues/relationTypeValues
- SQL migrations separate statements with `--> statement-breakpoint`; no multi-statement blocks without it
- No `any` — typedJsonb payloads get a declared generic type

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: none
Blocks:     FUL-PLAT-002, FUL-PLAT-003, FUL-PLAT-004, FUL-PLAT-005, FUL-PLAT-006
Wave:       A

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

<!-- REQUIREMENT-CONTRACT v1
-->
<!--
{
  "version": "1",
  "task_id": "FUL-PLAT-001",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated_nonprod_db": {
      "description": "holocron_nonprod immediately after `bun services/platform/src/cli/holo.ts db:migrate` \u2014 Fulcrum tables created and completely unpopulated",
      "seed_method": "cli",
      "records": [
        "`SELECT count(*) FROM belief_scores` returns 0",
        "`SELECT count(*) FROM weight_versions` returns 0",
        "`SELECT count(*) FROM candidates` returns 0"
      ]
    },
    "seeded_fulcrum_versions": {
      "description": "one mission `dev-revenue` with weight_versions.version=1 and domain_tier_versions.version=1 appended through `holo db:migrate` plus the fulcrum contract seed CLI",
      "seed_method": "cli",
      "records": [
        "`weight_versions` holds 1 row with `version` = 1 and `disconfirmation_multiplier` = 2",
        "`domain_tier_versions` holds 1 row with `version` = 1",
        "`candidates` holds 1 row with `stage` = 'raw'"
      ]
    },
    "seeded_evidence_source": {
      "description": "one `sources` row written by `bun services/platform/src/cli/holo.ts evidence:seed` carrying a 1200-character fetch artifact",
      "seed_method": "cli",
      "records": [
        "`sources.content_hash` holds a 64-character sha256 digest",
        "`sources.normalized_text` holds 1200 characters",
        "`claims` holds 1 row bound to that source"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN a holocron_nonprod database migrated by `holo db:migrate` with 0 rows in `belief_scores` WHEN the implementer appends one `belief_scores` row stamped with weight_version 1 and domain_tier_version 1 through the holocron_app product role THEN the 9 Fulcrum tables exist and `belief_scores` returns exactly 1 stamped row",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": true,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "migration 0041 is absent so `belief_scores` does not exist and the insert errors",
            "the Drizzle table definitions are declared but no SQL migration file is emitted, leaving the schema static",
            "the test asserts on the Drizzle TypeScript object instead of querying real Postgres (mocked client)"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fulcrum_versions",
            "action": {
              "actor": "cli_user",
              "steps": [
                "run `bun services/platform/src/cli/holo.ts db:migrate` against holocron_nonprod",
                "INSERT one row into `belief_scores` with `score` = 0.62, `weight_version` = 1, `domain_tier_version` = 1 as holocron_app",
                "SELECT id, score, weight_version, domain_tier_version FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "`SELECT count(*) FROM belief_scores` returns 1",
                "the returned row has `score` = 0.62",
                "the returned row has `weight_version` = 1 and `domain_tier_version` = 1",
                "`information_schema.tables` lists all 9 names `candidates`, `belief_scores`, `weight_versions`, `weight_components`, `domain_tier_versions`, `domain_tiers`, `touches`, `probes`, `claim_evidence_bindings`"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM belief_scores` returns 0",
                "error `relation \"belief_scores\" does not exist`",
                "a `fulcrumCycles` or `prospects` or `scores` table name"
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
      "description": "GIVEN a `belief_scores` row with `score` = 0.62 appended as holocron_app WHEN holocron_app attempts `UPDATE belief_scores SET score = 0.99` and then `DELETE FROM belief_scores` THEN both statements raise and the row still reads `score` = 0.62",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the append-only rule is enforced only in TypeScript so a direct SQL UPDATE silently succeeds",
            "the trigger is omitted from migration 0041, leaving the table static and mutable",
            "the test runs as the migration owner role instead of holocron_app, bypassing the barrier"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_fulcrum_versions",
            "action": {
              "actor": "cli_user",
              "steps": [
                "INSERT one `belief_scores` row with `score` = 0.62 as holocron_app",
                "attempt `UPDATE belief_scores SET score = 0.99` as holocron_app",
                "attempt `DELETE FROM belief_scores` as holocron_app",
                "SELECT score FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "the UPDATE raises an error naming `belief_scores` as append-only",
                "the DELETE raises an error naming `belief_scores` as append-only",
                "`SELECT score FROM belief_scores` still returns 0.62",
                "`SELECT count(*) FROM belief_scores` returns 1"
              ],
              "must_not_observe": [
                "`SELECT score FROM belief_scores` returns 0.99",
                "`SELECT count(*) FROM belief_scores` returns 0",
                "UPDATE succeeds with no error raised"
              ]
            }
          },
          {
            "start_ref": "seeded_fulcrum_versions",
            "action": {
              "actor": "cli_user",
              "steps": [
                "attempt `UPDATE weight_components SET weight = 0.9` as holocron_app",
                "attempt `DELETE FROM domain_tiers` as holocron_app"
              ]
            },
            "end_state": {
              "must_observe": [
                "the `weight_components` UPDATE raises an append-only error",
                "the `domain_tiers` DELETE raises an append-only error",
                "`SELECT count(*) FROM domain_tiers` still returns 8"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM domain_tiers` returns 0",
                "no error raised on the DELETE"
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
      "description": "GIVEN a migrated database holding weight_versions version 1 and domain_tier_versions version 1 WHEN an insert into `belief_scores` omits `domain_tier_version` THEN the insert is rejected and `belief_scores` still holds 0 rows",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-3'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the columns are declared nullable so an unstamped score row is accepted",
            "the stamp check lives in application code that the test bypasses with direct SQL",
            "the migration is empty and the insert succeeds against the pre-Fulcrum schema"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated_nonprod_db",
            "action": {
              "actor": "cli_user",
              "steps": [
                "attempt INSERT INTO belief_scores (candidate_id, score, weight_version) VALUES ('c1', 0.42, 1) with no `domain_tier_version`",
                "SELECT count(*) FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "the insert raises a not-null violation naming `domain_tier_version`",
                "`SELECT count(*) FROM belief_scores` returns 0"
              ],
              "must_not_observe": [
                "a `belief_scores` row with `domain_tier_version` NULL",
                "the insert succeeding with no error raised",
                "`SELECT count(*) FROM belief_scores` returns 1"
              ]
            }
          },
          {
            "start_ref": "seeded_fulcrum_versions",
            "action": {
              "actor": "cli_user",
              "steps": [
                "INSERT INTO belief_scores with `weight_version` = 1 and `domain_tier_version` = 1",
                "SELECT weight_version, domain_tier_version FROM belief_scores"
              ]
            },
            "end_state": {
              "must_observe": [
                "the stored row reads `weight_version` = 1 and `domain_tier_version` = 1",
                "`SELECT count(*) FROM belief_scores` returns 1"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM belief_scores` returns 0",
                "a NULL `weight_version`"
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
      "description": "GIVEN a `sources` row seeded by `holo evidence:seed` carrying a 64-character `content_hash` and 1200-character `normalized_text` WHEN a second insert reuses the identical `content_hash` THEN the duplicate insert is rejected and `sources` still holds 1 row for that hash",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-4'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the new `sources` columns are added to the Drizzle file but not to migration 0041, so the SELECT errors on a missing column",
            "the unique index is removed, allowing a duplicate content hash",
            "the test asserts the TypeScript column list rather than querying the live table"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_evidence_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "SELECT normalized_text, retrieved_at, source_domain, provenance_group, self_sourced FROM sources",
                "attempt a second INSERT INTO sources reusing the same `content_hash`",
                "SELECT count(*) FROM sources WHERE content_hash = the seeded digest"
              ]
            },
            "end_state": {
              "must_observe": [
                "the seeded row reports `length(normalized_text)` = 1200",
                "the seeded row carries a non-null `retrieved_at` timestamptz",
                "the duplicate insert raises a unique violation on `sources_content_hash_uidx`",
                "`SELECT count(*) FROM sources WHERE content_hash = digest` returns 1"
              ],
              "must_not_observe": [
                "`SELECT count(*) FROM sources WHERE content_hash = digest` returns 2",
                "`normalized_text` is NULL or empty",
                "column `normalized_text` does not exist"
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
      "description": "GIVEN a `claims` row bound to the seeded source WHEN an update path writes `status` = 'approved' rather than one of the four allowed values THEN the write is rejected by the CHECK constraint and `status` stays 'provisional'",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-5'",
      "maps_to_ac": null,
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "primary": false,
        "verification_service": "real Postgres holocron_nonprod (services/platform/src/db/client.ts)",
        "topology": "single-node",
        "negative_control": {
          "would_fail_if": [
            "the status CHECK constraint is omitted so any free-form status string is stored",
            "the admission columns are declared in Drizzle only, leaving the live table static",
            "the test mocks the sql client and asserts on the call arguments"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "seeded_evidence_source",
            "action": {
              "actor": "cli_user",
              "steps": [
                "INSERT INTO claims with `status` = 'provisional', `passes_gate` = false, `component` = 'demand'",
                "attempt INSERT INTO claims with `status` = 'approved'",
                "SELECT status, passes_gate, qualifying_grade, polarity FROM claims"
              ]
            },
            "end_state": {
              "must_observe": [
                "the 'approved' insert raises a check violation naming `claims_status_check`",
                "the stored row reads `status` = 'provisional' and `passes_gate` = false",
                "`SELECT count(*) FROM claims WHERE status = 'provisional'` returns 1"
              ],
              "must_not_observe": [
                "a `claims` row with `status` = 'approved'",
                "`SELECT count(*) FROM claims WHERE status = 'provisional'` returns 0",
                "column `passes_gate` does not exist"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "The 9 Fulcrum tables are present in information_schema after `holo db:migrate` runs against holocron_nonprod",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "A belief_scores row inserted as holocron_app persists with score 0.62",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "The persisted belief_scores row stamps weight_version 1",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-1'",
      "maps_to_ac": "AC-1"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "UPDATE on belief_scores as holocron_app raises an append-only error",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "DELETE on domain_tiers as holocron_app raises an append-only error",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-2'",
      "maps_to_ac": "AC-2"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "A belief_scores insert omitting domain_tier_version raises a not-null violation",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-3'",
      "maps_to_ac": "AC-3"
    },
    {
      "id": "TC-7",
      "type": "test_criterion",
      "description": "A second sources insert reusing an existing content_hash raises a unique violation",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-4'",
      "maps_to_ac": "AC-4"
    },
    {
      "id": "TC-8",
      "type": "test_criterion",
      "description": "A claims insert with status 'approved' raises the claims_status_check violation",
      "verify": "PLATFORM_IT=1 DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod FLEET_URL=http://127.0.0.1:4545/v1 pnpm vitest run --project integration services/platform/tests/integration/fulcrum-ledger-contract.test.ts -t 'AC-5'",
      "maps_to_ac": "AC-5"
    }
  ]
}
-->

</details>

## Acceptance Criteria

- [x] AC-1 (PRIMARY): Fulcrum ledger tables accept an appended belief score
- [x] AC-2: Append-only barrier rejects UPDATE and DELETE
- [x] AC-3: Belief score requires both version stamps
- [x] AC-4: Sources fetch-artifact columns dedupe on content hash
- [x] AC-5: Claims admission columns reject an unknown status
