# REDHAT-FIX-H2 — Bind the default runtime/CLI database pool to the least-privilege app role and prove owner-pool DML bypass is unavailable on product paths (fresh red-hat H2: DATABASE_URL bypass)

## What this does

Close red-hat H2 by binding the default product/CLI database pool to holocron_app so ledger REVOKE is a real runtime property, while preserving owner URL for migrate/admin and restoring operability grants/definer entry points for seed surfaces.

Provides: product-app-role-pool-binding, owner-bypass-unavailable-on-product-paths, app-role-operability-grants-for-seed-surfaces.

## Why

- MUST force product evidence helpers + CLI paths (evidence:seed, evidence:revise, evidence:belief, evidence:register-doc) through toAppRoleDatabaseUrl (or SET ROLE holocron_app at connect) so session current_user = holocron_app
- MUST keep migrate/admin (db:migrate, provisioning, owner-only maintenance) on owner/raw DATABASE_URL — do not break migrations
- MUST prove default product client path cannot UPDATE/DELETE beliefs (SQLSTATE 42501) without special-casing only probe-raw
- MUST expand holocron_app grants for operability on sources/passages/claims/relations INSERT (and any other non-belief tables product seed/register-doc need) and/or route those writes through SECURITY DEFINER — live state today is SELECT-only on those tables for holocron_app
- MUST leave beliefs UPDATE/DELETE revoked for holocron_app; belief writes go through DEFINER functions (revise_belief; seed_open_belief after H1)
- NEVER leave resolveDatabaseUrl/createSql default product evidence path on owner DATABASE_URL such that UPDATE/DELETE on beliefs succeeds
- NEVER make migrate require holocron_app (schema ownership / DDL must remain admin)
- NEVER grant UPDATE/DELETE on beliefs to holocron_app to 'fix' operability
- STRICTLY integration proof uses PLATFORM_IT=1 real Postgres and asserts current_user = holocron_app on product paths
- STRICTLY CI/IT assert UPDATE/DELETE via the default product connection helper fails with 42501
- Grounded in: UC-DATA-02, UC-PLAT-01-AC-4, T-PLAT-004, T-DATA-006, AP-1, AP-7

## How to verify

- `pnpm tsgo --noEmit` → Exit 0
- `pnpm biome check .` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-*.test.ts` → Exit 0
- `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts` → Exit 0

## Scope

Writes: services/platform/src/db/connection.ts · services/platform/src/db/client.ts · services/platform/src/db/evidence/seed.ts · services/platform/src/db/evidence/revise.ts · services/platform/src/db/evidence/belief-asof.ts · services/platform/src/db/evidence/register-doc.ts · services/platform/src/db/evidence/queries.ts · services/platform/src/db/evidence/roles.ts · services/platform/src/db/evidence/probe-raw.ts · services/platform/src/db/evidence/index.ts · services/platform/src/db/migrate.ts · services/platform/src/cli/holo.ts

Prohibited: services/platform/src/db/migrations/0000_*.sql · services/platform/src/db/migrations/0001_*.sql · services/platform/src/db/migrations/0002_*.sql · services/platform/src/db/migrations/0003_*.sql · services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql · services/platform/src/db/migrations/0005_belief_asof_net_support.sql · services/platform/src/db/schema/evidence.ts · app/**

<details>
<summary>▸ Full agent specification (TASK-TEMPLATE v5.2 — required reading for implementer + reviewer)</summary>

================================================================================
TASK: REDHAT-FIX-H2 — Bind the default runtime/CLI database pool to the least-privilege app role and prove owner-pool DML bypass is unavailable on product paths (fresh red-hat H2: DATABASE_URL bypass)
================================================================================

TASK_TYPE:  FEATURE
STATUS:     Backlog
PRIORITY:   P0
EFFORT:     M  (150 min)
AGENT:      implementer=mastra-implementer | reviewer=mastra-reviewer
PROPOSED-BY: mastra-planner
TDD_MODE:   red_first     RED_GREEN_REQUIRED: yes     (requires_seeded_evidence: true)
CAPABILITY: N/A
SPRINT:     [Sprint 7 — Evidence-Graph Substrate and Ledger Immutability](./SPRINT.md)

RUNTIME_COMMANDS:
  test:      PLATFORM_IT=1 pnpm vitest run <path>
  typecheck: pnpm tsgo --noEmit
  lint:      pnpm biome check .

--------------------------------------------------------------------------------
OUTCOME
--------------------------------------------------------------------------------
evidence:seed|revise|belief|register-doc sessions report current_user=holocron_app; product default client UPDATE/DELETE on beliefs raises 42501; db:migrate still applies as owner; product seed/revise/as-of remain operable under the app role.

--------------------------------------------------------------------------------
🚫 CRITICAL CONSTRAINTS (Never tier)
--------------------------------------------------------------------------------
- MUST force product evidence helpers + CLI paths (evidence:seed, evidence:revise, evidence:belief, evidence:register-doc) through toAppRoleDatabaseUrl (or SET ROLE holocron_app at connect) so session current_user = holocron_app
- MUST keep migrate/admin (db:migrate, provisioning, owner-only maintenance) on owner/raw DATABASE_URL — do not break migrations
- MUST prove default product client path cannot UPDATE/DELETE beliefs (SQLSTATE 42501) without special-casing only probe-raw
- MUST expand holocron_app grants for operability on sources/passages/claims/relations INSERT (and any other non-belief tables product seed/register-doc need) and/or route those writes through SECURITY DEFINER — live state today is SELECT-only on those tables for holocron_app
- MUST leave beliefs UPDATE/DELETE revoked for holocron_app; belief writes go through DEFINER functions (revise_belief; seed_open_belief after H1)
- NEVER leave resolveDatabaseUrl/createSql default product evidence path on owner DATABASE_URL such that UPDATE/DELETE on beliefs succeeds
- NEVER make migrate require holocron_app (schema ownership / DDL must remain admin)
- NEVER grant UPDATE/DELETE on beliefs to holocron_app to 'fix' operability
- NEVER treat probe-raw as the only app-role path while seed/revise/belief/register-doc stay owner-connected
- STRICTLY integration proof uses PLATFORM_IT=1 real Postgres and asserts current_user = holocron_app on product paths
- STRICTLY CI/IT assert UPDATE/DELETE via the default product connection helper fails with 42501
- STRICTLY use existing roles.ts HOLOCRON_APP_ROLE / toAppRoleDatabaseUrl — do not invent a parallel role name

--------------------------------------------------------------------------------
BOUNDARY CONTRACTS
--------------------------------------------------------------------------------
- Product evidence CLI/helpers (seed, revise, belief, register-doc) MUST connect as holocron_app (via toAppRoleDatabaseUrl or equivalent), never as table owner/superuser by default
- Migrate/admin/provision paths MAY retain owner/raw DATABASE_URL
- db:probe --raw already uses app role — product paths must match that least-privilege posture
- Operability: after app-role bind, seed/register-doc/revise/as-of still succeed — expand GRANTs on non-belief tables and/or DEFINER entry points so immutability and operability are not mutually exclusive

--------------------------------------------------------------------------------
DONE WHEN
--------------------------------------------------------------------------------
- [ ] AC-1: Product evidence helpers connect as holocron_app (PRIMARY)
- [ ] AC-2: Default product client cannot UPDATE/DELETE beliefs
- [ ] AC-3: Migrate/admin retains owner URL and still works
- [ ] AC-4: Product operability under app role (seed tables + revise EXECUTE)
- [ ] AC-5: CLI product commands inherit app-role binding
- [ ] `PLATFORM_IT=1` integration suite green + `pnpm tsgo --noEmit` clean + `pnpm biome check .` clean (only SCOPE.writeAllowed files modified)

--------------------------------------------------------------------------------
ACCEPTANCE CRITERIA (TDD beads — RED before GREEN, proven by real services)
--------------------------------------------------------------------------------
AC-1 Product evidence helpers connect as holocron_app [PRIMARY] (flow_ref T-PLAT-004)
  GIVEN: DATABASE_URL is the owner URL and migrations are applied
  WHEN:  Invoking product evidence entry points seedEvidence / reviseBelief / getBeliefAsOf / registerDoc (or CLI equivalents) without an explicit owner override
  THEN:  Each product session observes current_user = holocron_app (not the owner username)
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-pool.test.ts
  SCENARIO — start_ref: migrated-owner-url-env · evidence: db_query
    NEGATIVE_CONTROL: would fail if connection.ts resolveDatabaseUrl still returns raw DATABASE_URL and evidence helpers use it unchanged; Only probe-raw.ts rewrites to holocron_app while seed/revise/belief/register-doc remain owner (omitted bind); Test asserts rewrite helper in isolation without executing a product entrypoint session; stub/mock postgres client that hardcodes current_user to holocron_app; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: migrated-owner-url-env
      actor: operator
      - Call each product helper (or instrument SELECT current_user inside product path)
      - Capture session current_user for seed, revise, belief as-of, register-doc
      - Contrast with owner connection current_user ≠ holocron_app
      MUST_OBSERVE:
        - product seed path current_user: holocron_app
        - product revise path current_user: holocron_app
        - product belief as-of path current_user: holocron_app
        - product register-doc path current_user: holocron_app
        - product paths with current_user holocron_app COUNT == 4
      MUST_NOT_OBSERVE:
        - product path current_user equals table owner (e.g. 'inference1')
        - product path current_user: postgres
        - only probe-raw shows holocron_app while seed shows owner (product bind COUNT = 0)
        - empty current_user on product path
AC-2 Default product client cannot UPDATE/DELETE beliefs (flow_ref T-PLAT-004)
  GIVEN: product-path-seeded-belief and product pool binding active
  WHEN:  Using the same connection resolution product helpers use (no manual toAppRoleDatabaseUrl in the test beyond what product code applies) to run UPDATE beliefs SET statement='hacked' and DELETE FROM beliefs WHERE id=…
  THEN:  Both raise SQLSTATE 42501; row statement unchanged; row still exists
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-dml-rejected.test.ts
  SCENARIO — start_ref: product-path-seeded-belief · evidence: db_query
    NEGATIVE_CONTROL: would fail if Product client still connects as owner and UPDATE succeeds (red-hat live owner DML / bind omitted); Test only uses probe-raw rewrite while product seed path remains owner-connected; UPDATE returns rowcount ≥ 1 (immutability absent); stub/mock that raises 42501 without hitting real Postgres; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: product-path-seeded-belief
      actor: operator
      - Obtain product-bound SQL client the way seed/revise do
      - UPDATE beliefs SET statement='hacked' WHERE id=beliefId
      - DELETE FROM beliefs WHERE id=beliefId
      - Re-read row as owner for unchanged statement
      MUST_OBSERVE:
        - UPDATE SQLSTATE: 42501
        - DELETE SQLSTATE: 42501
        - statement equals original seed statement (not 'hacked')
        - row still exists with COUNT >= 1
      MUST_NOT_OBSERVE:
        - UPDATE rowcount ≥ 1
        - DELETE rowcount ≥ 1
        - statement equals 'hacked'
        - empty SQLSTATE (no error)
        - belief row COUNT = 0 after DELETE attempt (row deleted)
AC-3 Migrate/admin retains owner URL and still works (flow_ref T-PLAT-004)
  GIVEN: DATABASE_URL is owner URL
  WHEN:  Running holo db:migrate / ensureMigrated admin path
  THEN:  Migration runner connects with privileges sufficient to apply migrations (not forced to holocron_app); exits 0; journal advances
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-migrate-owner.test.ts
  SCENARIO — start_ref: migrated-owner-url-env · evidence: stdout
    NEGATIVE_CONTROL: would fail if createSql always rewrites to holocron_app including migrate.ts (admin escape hatch removed); db:migrate fails with permission denied on schema objects; stub/mock migrate that returns exit 0 without applying migrations; static empty shell returning ok without DB; owner URL path omitted from migrate
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: migrated-owner-url-env
      actor: operator
      - Run ensureMigrated / holo db:migrate
      - Confirm exit 0
      - Confirm migrate connection is not forced app-role (current_user ≠ holocron_app OR explicit owner flag documented and proven)
      MUST_OBSERVE:
        - db:migrate / ensureMigrated exit code == 0
        - migrate session current_user is not forced to 'holocron_app' (owner/admin escape hatch)
        - migrations journal row COUNT >= 1 after run
      MUST_NOT_OBSERVE:
        - migrate fails with permission denied SQLSTATE 42501 on schema
        - all platform DB connections including migrate rewritten to holocron_app with no admin escape hatch
        - empty migrations journal (COUNT = 0) after claimed migrate success
        - exit code == 1 for migrate
AC-4 Product operability under app role (seed tables + revise EXECUTE) (flow_ref T-DATA-005)
  GIVEN: App-role product pool binding + any new operability grants/migration applied
  WHEN:  Running product seed surface writes (sources/passages/claims/relations as needed) and revise_belief EXECUTE as holocron_app
  THEN:  Operations succeed (or fail only for unrelated reasons); no 42501 on legitimate seed table INSERT; revise_belief still callable
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-operability.test.ts
  SCENARIO — start_ref: migrated-owner-url-env · evidence: db_query
    NEGATIVE_CONTROL: would fail if Bind to holocron_app without GRANT INSERT on sources/passages/claims/relations — seed fails 42501 (grants omitted); Operability 'fixed' by granting UPDATE/DELETE on beliefs to holocron_app (wrong constant / anti-pattern); register-doc INSERT sources/passages denied under product pool; stub/mock seed returning ok:true without DB writes; static empty shell returning ok without DB
    EVIDENCE: db_query (required_capture=True)
    CASE[0] start_ref: migrated-owner-url-env
      actor: operator
      - As product-bound client, INSERT or run seedEvidence for claim/passages/relations path
      - EXECUTE revise_belief on an open belief (after authorized seed)
      - Assert has_table_privilege holocron_app INSERT on sources,passages,claims,relations OR definer wrappers succeed
      - Assert holocron_app still lacks UPDATE/DELETE on beliefs
      MUST_OBSERVE:
        - seed ok: true with claimId UUID present and passageIds.length == 2
        - revise_belief returns successorId UUID under holocron_app (ok: true)
        - has_table_privilege(holocron_app, beliefs, UPDATE): false
        - has_table_privilege(holocron_app, beliefs, DELETE): false
      MUST_NOT_OBSERVE:
        - seed fails with SQLSTATE 42501 on sources/passages/claims/relations
        - has_table_privilege(holocron_app, beliefs, UPDATE): true
        - has_table_privilege(holocron_app, beliefs, DELETE): true
        - seed ok: false with claimId empty
        - product path reconnects as owner to bypass REVOKE (current_user not holocron_app)
AC-5 CLI product commands inherit app-role binding (flow_ref T-PLAT-004)
  GIVEN: Owner DATABASE_URL in environment
  WHEN:  Running holo evidence:belief --claim-id … --as-of now --json and holo db:probe --raw "SELECT current_user" (and seed/revise smoke as available)
  THEN:  CLI product evidence commands run as holocron_app; probe-raw continues to report role holocron_app; owner bypass is not used
  TEST_TIER: integration · VERIFICATION_SERVICE: postgres · TDD_STATE: none
  VERIFY: PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-cli-session.test.ts
  SCENARIO — start_ref: migrated-owner-url-env · evidence: stdout
    NEGATIVE_CONTROL: would fail if CLI still imports resolveDatabaseUrl without app-role rewrite for evidence commands (bind omitted); Only unit-testing toAppRoleDatabaseUrl string rewrite without CLI process; stub/mock CLI that prints holocron_app without connecting; static empty shell returning ok without DB; evidence CLI path skips app-role rewrite (unchanged owner session)
    EVIDENCE: stdout (required_capture=True)
    CASE[0] start_ref: migrated-owner-url-env
      actor: operator
      - holo db:probe --raw "SELECT current_user::text AS u"
      - Exercise evidence CLI path that logs or returns session role / internal SELECT current_user
      - Capture JSON/stdout
      MUST_OBSERVE:
        - probe-raw report contains `role: holocron_app` or `current_user: holocron_app`
        - evidence product CLI path session current_user: holocron_app
        - CLI product paths reporting holocron_app COUNT >= 1
      MUST_NOT_OBSERVE:
        - evidence CLI session current_user equals table owner name
        - probe-raw role mismatch expected holocron_app got owner
        - empty role field in probe-raw report
        - current_user: empty

--------------------------------------------------------------------------------
TEST CRITERIA (boolean statements mapping to ACs)
--------------------------------------------------------------------------------
| ID | Statement | Maps to | Verify | Type |
|----|-----------|---------|--------|------|
| TC-1 | Product evidence helpers seed/revise/belief/register-doc establish sessions where current_user equals holocron_app when DATABASE_URL is the owner URL. | AC-1 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-pool.test.ts` | happy_path |
| TC-2 | UPDATE and DELETE on beliefs via the default product connection resolution raise SQLSTATE 42501 and leave the row unchanged. | AC-2 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-dml-rejected.test.ts` | negative |
| TC-3 | db:migrate / ensureMigrated exits 0 using the owner/admin URL escape hatch. | AC-3 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-migrate-owner.test.ts` | happy_path |
| TC-4 | Under holocron_app product pool, seed-table writes needed by evidence:seed/register-doc succeed and beliefs UPDATE/DELETE privileges remain false. | AC-4 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-operability.test.ts` | happy_path |
| TC-5 | CLI evidence commands and db:probe --raw report holocron_app as the session role under owner DATABASE_URL. | AC-5 | `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-cli-session.test.ts` | happy_path |
| TC-6 | RED evidence shows product seed/revise path previously connected as owner with UPDATE privilege true before the bind fix. | AC-1 | `ls .tmp/ledger-2/REDHAT-FIX-H2-red* .spec/evidence/redhat-fix-h2* 2>/dev/null | head -5` | red_evidence |

--------------------------------------------------------------------------------
SCOPE (file-level write permissions)
--------------------------------------------------------------------------------

writeAllowed:
- services/platform/src/db/connection.ts
- services/platform/src/db/client.ts
- services/platform/src/db/evidence/seed.ts
- services/platform/src/db/evidence/revise.ts
- services/platform/src/db/evidence/belief-asof.ts
- services/platform/src/db/evidence/register-doc.ts
- services/platform/src/db/evidence/queries.ts
- services/platform/src/db/evidence/roles.ts
- services/platform/src/db/evidence/probe-raw.ts
- services/platform/src/db/evidence/index.ts
- services/platform/src/db/migrate.ts
- services/platform/src/cli/holo.ts
- services/platform/src/db/migrations/0006_*.sql
- services/platform/src/db/migrations/0007_*.sql
- services/platform/src/db/migrations/meta/**
- tests/integration/service/role-bind-*.test.ts
- tests/integration/service/immutability-*.test.ts
- tests/integration/service/evidence-*.test.ts
- .tmp/ledger-2/**
- .spec/evidence/redhat-fix-h2*

writeProhibited:
- services/platform/src/db/migrations/0000_*.sql
- services/platform/src/db/migrations/0001_*.sql
- services/platform/src/db/migrations/0002_*.sql
- services/platform/src/db/migrations/0003_*.sql
- services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql
- services/platform/src/db/migrations/0005_belief_asof_net_support.sql
- services/platform/src/db/schema/evidence.ts
- app/**
- holocron-mcp/**

--------------------------------------------------------------------------------
READING LIST
--------------------------------------------------------------------------------
1. `.spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md` (91-94,56-66,203-207)
   - Focus: H2 DATABASE_URL bypass; live owner UPDATE/DELETE true
2. `services/platform/src/db/connection.ts` (15-20)
   - Focus: resolveDatabaseUrl returns raw DATABASE_URL — product bypass root
3. `services/platform/src/db/client.ts` (12-18)
   - Focus: createSql uses resolveDatabaseUrl without app-role rewrite
4. `services/platform/src/db/evidence/roles.ts` (1-32)
   - Focus: toAppRoleDatabaseUrl helper already exists
5. `services/platform/src/db/evidence/probe-raw.ts` (26-48)
   - Focus: Only current product path that rewrites to holocron_app
6. `services/platform/src/db/evidence/seed.ts` (51-56)
   - Focus: seedEvidence uses resolveDatabaseUrl → owner
7. `services/platform/src/db/evidence/revise.ts` (35-37)
   - Focus: reviseBelief uses resolveDatabaseUrl → owner
8. `services/platform/src/db/evidence/belief-asof.ts` (60-70)
   - Focus: getBeliefAsOf uses resolveDatabaseUrl → owner
9. `services/platform/src/db/evidence/register-doc.ts` (40-50)
   - Focus: registerDoc uses resolveDatabaseUrl → owner
10. `services/platform/src/db/migrate.ts` (40-55)
   - Focus: Admin migrate must keep owner URL
11. `services/platform/src/db/migrations/0004_beliefs_immutability_revise.sql` (38-50,236-242)
   - Focus: beliefs REVOKE + SELECT-only grants on other tables for holocron_app (operability gap)

--------------------------------------------------------------------------------
EVIDENCE GATES
--------------------------------------------------------------------------------
Gate 1: Typecheck
  Command: `pnpm tsgo --noEmit`
  Expected: Exit 0
Gate 2: Lint
  Command: `pnpm biome check .`
  Expected: Exit 0
Gate 3: Role-bind integration suite
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-*.test.ts`
  Expected: Exit 0
Gate 4: Immutability regression under product role
  Command: `PLATFORM_IT=1 pnpm vitest run tests/integration/service/immutability-*.test.ts`
  Expected: Exit 0

--------------------------------------------------------------------------------
DESIGN
--------------------------------------------------------------------------------

References:
- .spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md — H2
- services/platform/src/db/evidence/roles.ts — toAppRoleDatabaseUrl
- services/platform/src/db/evidence/probe-raw.ts — existing app-role bind pattern

Interaction notes:
- Recommended: add resolveProductDatabaseUrl() = toAppRoleDatabaseUrl(resolveDatabaseUrl({preferHolocron:true})) and use it in all evidence product helpers; keep resolveDatabaseUrl raw for migrate/admin/probe health that need owner.
- Alternatively set app-role rewrite inside each evidence module (seed/revise/belief-asof/register-doc/queries) matching probe-raw — avoid global createSql rewrite that breaks migrate.
- Live grants: holocron_app has INSERT only on beliefs + SELECT on claims/sources/passages/relations. After role bind, GRANT INSERT (and USAGE already present) on sources, passages, claims, relations to holocron_app via new migration 0006/0007 OR route those writes through DEFINER. Prefer table INSERT grants for non-immutable seed tables; keep beliefs immutable via H1 definer-only writes.
- Coordinate with H1: if INSERT on beliefs revoked, product open-belief creation must use seed_open_belief EXECUTE (not table INSERT).
- Do not put secrets or passwords into role rewrite; trust auth loopback model already assumed by toAppRoleDatabaseUrl.

Pattern: Least-privilege product pool: rewrite connection username to holocron_app for evidence product paths; admin paths keep owner URL; operability via grants/DEFINER without restoring beliefs UPDATE/DELETE
Pattern source: services/platform/src/db/evidence/probe-raw.ts
Anti-pattern: Leaving product paths on owner DATABASE_URL so REVOKE is only demonstrable by db:probe --raw; or granting UPDATE/DELETE on beliefs to holocron_app to paper over role binding

--------------------------------------------------------------------------------
DEPENDENCIES
--------------------------------------------------------------------------------

Depends on: ledger-2
Blocks: REDHAT-FIX-H3

--------------------------------------------------------------------------------
CODING STANDARDS
--------------------------------------------------------------------------------
- RULES.md
- services/platform/src/db/evidence/roles.ts
- services/platform/src/db/evidence/probe-raw.ts
- services/platform/src/db/connection.ts

--------------------------------------------------------------------------------
AGENT ASSIGNMENT
--------------------------------------------------------------------------------

Implementer: mastra-implementer
Rationale: Connection-role binding spans platform DB client, evidence helpers, and CLI product paths with real Postgres privilege assertions. mastra-implementer owns services/platform DB/CLI; mastra-reviewer confirms product paths cannot UPDATE/DELETE beliefs while migrate/admin retain owner URL.
Reviewer: mastra-reviewer

--------------------------------------------------------------------------------
REVIEW (for mastra-reviewer)
--------------------------------------------------------------------------------

Must pass:
- Each AC asserts a concrete failure/success signature against real Postgres (PLATFORM_IT=1)
- No stubs/mocks of DB client; REVOKE/DEFINER/role-bind is DB-enforced where claimed
- RED evidence present for primary path before GREEN
- SCOPE respected (git diff --name-only ⊆ writeAllowed)
- HT-1→HT-2 product path is not gate-scaffolded (H3) / owner pool not default product path (H2) / closed INSERT blocked (H1)

Verdict: [APPROVED | NEEDS_FIXES]

--------------------------------------------------------------------------------
NOTES
--------------------------------------------------------------------------------
Source: .spec/reviews/red-hat-2026-07-15T20-00-07Z-sprint07.md
Proposed by: mastra-planner (via /kb-sprint-tasks-plan --only REDHAT-FIX-H2)

</details>

<!-- REQUIREMENT-CONTRACT v1 -->
<!--
{
  "version": "1",
  "task_id": "REDHAT-FIX-H2",
  "tdd_mode": "red_first",
  "verification_policy": {
    "requires_tests": true,
    "requires_red_evidence": true,
    "requires_seeded_evidence": true
  },
  "fixtures": {
    "migrated-owner-url-env": {
      "description": "DATABASE_URL points at holocron as table owner/superuser (current host default, e.g. inference1) with migrations applied.",
      "seed_method": "public_api",
      "records": [
        "export DATABASE_URL=postgres://\u2026/holocron (owner)",
        "holo db:migrate succeeds",
        "has_table_privilege(owner, beliefs, UPDATE)=true baseline for contrast"
      ]
    },
    "product-path-seeded-belief": {
      "description": "Open belief exists so UPDATE/DELETE attempts target a real row id.",
      "seed_method": "public_api",
      "records": [
        "Authorized seed_open_belief / seedBeliefForTest / product seed after H1+H3",
        "Known beliefId UUID"
      ]
    }
  },
  "requirements": [
    {
      "id": "AC-1",
      "type": "acceptance_criterion",
      "primary": true,
      "description": "GIVEN owner DATABASE_URL, WHEN invoking product evidence helpers seed/revise/belief/register-doc, THEN each product session has current_user = holocron_app",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-pool.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "connection.ts resolveDatabaseUrl still returns raw DATABASE_URL and evidence helpers use it unchanged",
            "Only probe-raw.ts rewrites to holocron_app while seed/revise/belief/register-doc remain owner (omitted bind)",
            "Test asserts rewrite helper in isolation without executing a product entrypoint session",
            "stub/mock postgres client that hardcodes current_user to holocron_app",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-owner-url-env",
            "action": {
              "actor": "operator",
              "steps": [
                "Call each product helper (or instrument SELECT current_user inside product path)",
                "Capture session current_user for seed, revise, belief as-of, register-doc",
                "Contrast with owner connection current_user \u2260 holocron_app"
              ]
            },
            "end_state": {
              "must_observe": [
                "product seed path current_user: holocron_app",
                "product revise path current_user: holocron_app",
                "product belief as-of path current_user: holocron_app",
                "product register-doc path current_user: holocron_app",
                "product paths with current_user holocron_app COUNT == 4"
              ],
              "must_not_observe": [
                "product path current_user equals table owner (e.g. 'inference1')",
                "product path current_user: postgres",
                "only probe-raw shows holocron_app while seed shows owner (product bind COUNT = 0)",
                "empty current_user on product path"
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
      "description": "GIVEN product-bound client and seeded belief, WHEN UPDATE/DELETE beliefs, THEN SQLSTATE 42501 and row unchanged",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-dml-rejected.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Product client still connects as owner and UPDATE succeeds (red-hat live owner DML / bind omitted)",
            "Test only uses probe-raw rewrite while product seed path remains owner-connected",
            "UPDATE returns rowcount \u2265 1 (immutability absent)",
            "stub/mock that raises 42501 without hitting real Postgres",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "product-path-seeded-belief",
            "action": {
              "actor": "operator",
              "steps": [
                "Obtain product-bound SQL client the way seed/revise do",
                "UPDATE beliefs SET statement='hacked' WHERE id=beliefId",
                "DELETE FROM beliefs WHERE id=beliefId",
                "Re-read row as owner for unchanged statement"
              ]
            },
            "end_state": {
              "must_observe": [
                "UPDATE SQLSTATE: 42501",
                "DELETE SQLSTATE: 42501",
                "statement equals original seed statement (not 'hacked')",
                "row still exists with COUNT >= 1"
              ],
              "must_not_observe": [
                "UPDATE rowcount \u2265 1",
                "DELETE rowcount \u2265 1",
                "statement equals 'hacked'",
                "empty SQLSTATE (no error)",
                "belief row COUNT = 0 after DELETE attempt (row deleted)"
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
      "description": "GIVEN owner DATABASE_URL, WHEN db:migrate/ensureMigrated, THEN exit 0 and admin path is not forced to holocron_app",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-migrate-owner.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "createSql always rewrites to holocron_app including migrate.ts (admin escape hatch removed)",
            "db:migrate fails with permission denied on schema objects",
            "stub/mock migrate that returns exit 0 without applying migrations",
            "static empty shell returning ok without DB",
            "owner URL path omitted from migrate"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-owner-url-env",
            "action": {
              "actor": "operator",
              "steps": [
                "Run ensureMigrated / holo db:migrate",
                "Confirm exit 0",
                "Confirm migrate connection is not forced app-role (current_user \u2260 holocron_app OR explicit owner flag documented and proven)"
              ]
            },
            "end_state": {
              "must_observe": [
                "db:migrate / ensureMigrated exit code == 0",
                "migrate session current_user is not forced to 'holocron_app' (owner/admin escape hatch)",
                "migrations journal row COUNT >= 1 after run"
              ],
              "must_not_observe": [
                "migrate fails with permission denied SQLSTATE 42501 on schema",
                "all platform DB connections including migrate rewritten to holocron_app with no admin escape hatch",
                "empty migrations journal (COUNT = 0) after claimed migrate success",
                "exit code == 1 for migrate"
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
      "description": "GIVEN app-role product pool, WHEN performing seed-surface writes and revise_belief, THEN operability holds without granting beliefs UPDATE/DELETE to holocron_app",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-operability.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-DATA-005",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "Bind to holocron_app without GRANT INSERT on sources/passages/claims/relations \u2014 seed fails 42501 (grants omitted)",
            "Operability 'fixed' by granting UPDATE/DELETE on beliefs to holocron_app (wrong constant / anti-pattern)",
            "register-doc INSERT sources/passages denied under product pool",
            "stub/mock seed returning ok:true without DB writes",
            "static empty shell returning ok without DB"
          ]
        },
        "evidence": {
          "artifact_type": "db_query",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-owner-url-env",
            "action": {
              "actor": "operator",
              "steps": [
                "As product-bound client, INSERT or run seedEvidence for claim/passages/relations path",
                "EXECUTE revise_belief on an open belief (after authorized seed)",
                "Assert has_table_privilege holocron_app INSERT on sources,passages,claims,relations OR definer wrappers succeed",
                "Assert holocron_app still lacks UPDATE/DELETE on beliefs"
              ]
            },
            "end_state": {
              "must_observe": [
                "seed ok: true with claimId UUID present and passageIds.length == 2",
                "revise_belief returns successorId UUID under holocron_app (ok: true)",
                "has_table_privilege(holocron_app, beliefs, UPDATE): false",
                "has_table_privilege(holocron_app, beliefs, DELETE): false"
              ],
              "must_not_observe": [
                "seed fails with SQLSTATE 42501 on sources/passages/claims/relations",
                "has_table_privilege(holocron_app, beliefs, UPDATE): true",
                "has_table_privilege(holocron_app, beliefs, DELETE): true",
                "seed ok: false with claimId empty",
                "product path reconnects as owner to bypass REVOKE (current_user not holocron_app)"
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
      "description": "GIVEN owner DATABASE_URL, WHEN running CLI evidence commands and db:probe --raw, THEN session role is holocron_app",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-cli-session.test.ts",
      "maps_to_ac": null,
      "flow_ref": "T-PLAT-004",
      "scenario": {
        "tier": "visible",
        "test_tier": "integration",
        "verification_service": "postgres",
        "negative_control": {
          "would_fail_if": [
            "CLI still imports resolveDatabaseUrl without app-role rewrite for evidence commands (bind omitted)",
            "Only unit-testing toAppRoleDatabaseUrl string rewrite without CLI process",
            "stub/mock CLI that prints holocron_app without connecting",
            "static empty shell returning ok without DB",
            "evidence CLI path skips app-role rewrite (unchanged owner session)"
          ]
        },
        "evidence": {
          "artifact_type": "stdout",
          "required_capture": true
        },
        "cases": [
          {
            "start_ref": "migrated-owner-url-env",
            "action": {
              "actor": "operator",
              "steps": [
                "holo db:probe --raw \"SELECT current_user::text AS u\"",
                "Exercise evidence CLI path that logs or returns session role / internal SELECT current_user",
                "Capture JSON/stdout"
              ]
            },
            "end_state": {
              "must_observe": [
                "probe-raw report contains `role: holocron_app` or `current_user: holocron_app`",
                "evidence product CLI path session current_user: holocron_app",
                "CLI product paths reporting holocron_app COUNT >= 1"
              ],
              "must_not_observe": [
                "evidence CLI session current_user equals table owner name",
                "probe-raw role mismatch expected holocron_app got owner",
                "empty role field in probe-raw report",
                "current_user: empty"
              ]
            }
          }
        ]
      }
    },
    {
      "id": "TC-1",
      "type": "test_criterion",
      "description": "Product evidence helpers seed/revise/belief/register-doc establish sessions where current_user equals holocron_app when DATABASE_URL is the owner URL.",
      "maps_to_ac": "AC-1",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-pool.test.ts"
    },
    {
      "id": "TC-2",
      "type": "test_criterion",
      "description": "UPDATE and DELETE on beliefs via the default product connection resolution raise SQLSTATE 42501 and leave the row unchanged.",
      "maps_to_ac": "AC-2",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-dml-rejected.test.ts"
    },
    {
      "id": "TC-3",
      "type": "test_criterion",
      "description": "db:migrate / ensureMigrated exits 0 using the owner/admin URL escape hatch.",
      "maps_to_ac": "AC-3",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-migrate-owner.test.ts"
    },
    {
      "id": "TC-4",
      "type": "test_criterion",
      "description": "Under holocron_app product pool, seed-table writes needed by evidence:seed/register-doc succeed and beliefs UPDATE/DELETE privileges remain false.",
      "maps_to_ac": "AC-4",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-product-operability.test.ts"
    },
    {
      "id": "TC-5",
      "type": "test_criterion",
      "description": "CLI evidence commands and db:probe --raw report holocron_app as the session role under owner DATABASE_URL.",
      "maps_to_ac": "AC-5",
      "verify": "PLATFORM_IT=1 pnpm vitest run tests/integration/service/role-bind-cli-session.test.ts"
    },
    {
      "id": "TC-6",
      "type": "test_criterion",
      "description": "RED evidence shows product seed/revise path previously connected as owner with UPDATE privilege true before the bind fix.",
      "maps_to_ac": "AC-1",
      "verify": "ls .tmp/ledger-2/REDHAT-FIX-H2-red* .spec/evidence/redhat-fix-h2* 2>/dev/null | head -5"
    }
  ]
}
-->
